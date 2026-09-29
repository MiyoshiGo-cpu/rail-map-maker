// 営業キロ（§6.3）：手入力の優先・基準の間の配分・地理座標・既定の駅間（概算）・環状線の一周・駅間の極端さ
import { test, assert } from './harness.js';
import { lineKm, geoDistance, extremeSection } from '../js/core/distance.js';
import { runChecks } from '../js/core/validate.js';
import { storeWithLine } from './helpers.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const lineOf = (store) => store.getState().lines[0];

test('営業キロ：何も入れていなければ路線の種類ごとの既定の駅間で概算する', () => {
  const { store, lineId } = storeWithLine();
  let lk = lineKm(store.getState(), lineOf(store));
  // 在来線の既定の駅間は 3.0km（地域パック jp）
  assert.deepEqual(lk.stops, [0, 3, 6, 9]);
  assert.equal(lk.total, 9);
  assert.ok(lk.approx);
  assert.ok(lk.sections.every((s) => s.source === 'estimate'));
  store.dispatch({ type: 'line/update', lineId, fields: { kind: 'subway' } });
  lk = lineKm(store.getState(), lineOf(store));
  close(lk.total, 3.6);
});

test('営業キロ：手入力の値を最優先し、基準の間は見込みの長さの比で配る', () => {
  const { store, lineId } = storeWithLine([[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0], [12, 0]]);
  // 終点だけ入れる → 等間隔に配る（§6.4 の検算と同じ 10.0km・7駅）
  store.dispatch({ type: 'line/stop', lineId, index: 6, fields: { km: 10 } });
  let lk = lineKm(store.getState(), lineOf(store));
  assert.ok(!lk.approx);
  close(lk.total, 10);
  lk.sections.forEach((s) => close(s.km, 10 / 6));
  assert.equal(lk.stops[6], 10);
  // 途中にも入れる：その値がそのまま使われる
  store.dispatch({ type: 'line/stop', lineId, index: 2, fields: { km: 2.5 } });
  lk = lineKm(store.getState(), lineOf(store));
  assert.equal(lk.stops[2], 2.5);
  close(lk.sections[0].km, 1.25);
  close(lk.sections[2].km, 7.5 / 4);
});

test('営業キロ：最後の手入力より先は、既定の駅間を足していく（概算）', () => {
  const { store, lineId } = storeWithLine();
  store.dispatch({ type: 'line/stop', lineId, index: 1, fields: { km: 1.2 } });
  const lk = lineKm(store.getState(), lineOf(store));
  assert.deepEqual(lk.sections.map((s) => s.source), ['manual', 'estimate', 'estimate']);
  close(lk.stops[3], 7.2);
  assert.ok(lk.approx);
});

test('営業キロ：地理座標があれば直線距離×曲線係数、経由点があれば経由点を結んだ長さ×1.03', () => {
  const { store } = storeWithLine([[0, 0], [2, 0], [4, 0]]);
  const p0 = store.getState();
  const withGeo = {
    ...p0,
    stations: p0.stations.map((s, i) => ({ ...s, geo: [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }][i] })),
  };
  let lk = lineKm(withGeo, withGeo.lines[0]);
  close(lk.sections[0].km, 5 * 1.1);
  close(lk.sections[1].km, 6 * 1.1);
  assert.ok(!lk.approx);
  assert.equal(lk.sections[0].source, 'geo');
  const line = withGeo.lines[0];
  const viaLine = { ...line, sections: [{ geoVia: [{ x: 3, y: 0 }] }, {}] };
  lk = lineKm(withGeo, viaLine);
  close(lk.sections[0].km, (3 + 4) * 1.03);
});

test('営業キロ：実在の座標は大円距離（東京〜新大阪の直線距離はおよそ400km）', () => {
  const d = geoDistance({ lat: 35.6812, lon: 139.7671 }, { lat: 34.7334, lon: 135.5002 });
  assert.ok(d > 395 && d < 410, String(d));
});

test('営業キロ：環状線は一周の営業キロ（loopKm）で起点に戻る区間を決める', () => {
  const { store, lineId } = storeWithLine([[0, 0], [4, 0], [4, 4], [0, 4]]);
  store.dispatch({ type: 'line/setLoop', lineId, isLoop: true });
  let lk = lineKm(store.getState(), lineOf(store));
  assert.equal(lk.sections.length, 4);
  assert.equal(lk.total, 12);
  // 一周だけ入れる → 4つの駅間に等しく配る
  store.dispatch({ type: 'line/update', lineId, fields: { loopKm: 10 } });
  lk = lineKm(store.getState(), lineOf(store));
  close(lk.total, 10);
  lk.sections.forEach((s) => close(s.km, 2.5));
  assert.ok(!lk.approx);
  // 途中も入れる
  store.dispatch({ type: 'line/stop', lineId, index: 3, fields: { km: 9 } });
  lk = lineKm(store.getState(), lineOf(store));
  close(lk.sections[3].km, 1);
  // 環状線をやめると一周の営業キロは消える
  store.dispatch({ type: 'line/setLoop', lineId, isLoop: false });
  assert.equal(lineOf(store).loopKm, undefined);
});

test('駅間が極端：0.3km未満と、新幹線以外で50km超を警告する（概算の駅間は対象外）', () => {
  const line = { kind: 'conventional' };
  assert.equal(extremeSection(line, { km: 0.2, source: 'manual' }), 'short');
  assert.equal(extremeSection(line, { km: 51, source: 'manual' }), 'long');
  assert.equal(extremeSection({ kind: 'shinkansen' }, { km: 51, source: 'manual' }), null);
  assert.equal(extremeSection({ kind: 'maglev' }, { km: 60, source: 'estimate' }), null);

  const { store, lineId } = storeWithLine();
  store.dispatch({ type: 'line/stop', lineId, index: 1, fields: { km: 0.2 } });
  store.dispatch({ type: 'line/stop', lineId, index: 2, fields: { km: 60 } });
  store.dispatch({ type: 'line/stop', lineId, index: 3, fields: { km: 61 } });
  const items = runChecks(store.getState());
  const short = items.find((c) => c.code === 'sectionShort');
  assert.equal(short.level, 'warning');
  assert.deepEqual(short.target, { type: 'section', id: lineId, index: 0 });
  assert.equal(short.params.km.distance, 0.2);
  assert.ok(items.some((c) => c.code === 'sectionLong'));
  assert.ok(!items.some((c) => c.code === 'kmEstimated'));
});
