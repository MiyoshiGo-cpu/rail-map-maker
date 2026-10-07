import { test, assert } from './harness.js';
import { estimateGeo, estimateSchematic, freeGridPoint } from '../js/core/geo-layout.js';
import { viaInsertIndex, nextGeoViaPoint } from '../js/core/geo-lines.js';
import { newStore } from './helpers.js';

/** 架空の地形（中身は使わない）を付けたストア */
function fictionalStore() {
  const store = newStore();
  const world = {
    mode: 'fictional', seed: 's', gen: { size: 256, cellKm: 0.5 }, terrain: { width: 4, height: 4, elevation: '', edits: [] },
    cities: [], regions: [],
  };
  store.dispatch({ type: 'world/set', world });
  return store;
}

const st = (sx, sy, gx, gy) => ({ schematic: { x: sx, y: sy }, geo: gx === undefined ? null : { x: gx, y: gy } });

test('位置の推定：路線図 → 地理は、対応のある駅の拡大と平行移動に合わせる', () => {
  // 1マス 2km、原点は (10, 20) km
  const stations = [st(0, 0, 10, 20), st(4, 0, 18, 20), st(0, 4, 10, 28)];
  const g = estimateGeo(/** @type {any} */ (stations), { x: 2, y: 2 }, { x: 0, y: 0 });
  assert.close(g.x, 14, 1e-6);
  assert.close(g.y, 24, 1e-6);
  // 対応のある駅と同じ格子点なら、その駅の位置
  const same = estimateGeo(/** @type {any} */ (stations), { x: 4, y: 0 }, { x: 0, y: 0 });
  assert.close(same.x, 18, 1e-3);
  // 対応が無ければ fallback
  assert.deepEqual(estimateGeo([], { x: 3, y: 3 }, { x: 64, y: 64 }), { x: 64, y: 64 });
  // 対応が1つなら、1マス 1km として平行移動だけ
  const one = estimateGeo(/** @type {any} */ ([st(0, 0, 10, 20)]), { x: 3, y: -1 }, { x: 0, y: 0 });
  assert.close(one.x, 13, 1e-6);
  assert.close(one.y, 19, 1e-6);
});

test('位置の推定：地理 → 路線図と、空いた格子点', () => {
  const stations = [st(0, 0, 10, 20), st(4, 0, 18, 20), st(0, 4, 10, 28)];
  const s = estimateSchematic(/** @type {any} */ (stations), { x: 14, y: 24 });
  assert.close(s.x, 2, 1e-6);
  assert.close(s.y, 2, 1e-6);
  // 使われている格子点は避けて、いちばん近い空いた点
  assert.deepEqual(freeGridPoint(/** @type {any} */ (stations), { x: 0.2, y: 0.1 }), { x: 1, y: 0 });
  assert.deepEqual(freeGridPoint(/** @type {any} */ (stations), { x: 2.4, y: 2.6 }), { x: 2, y: 3 });
});

test('地理の駅：地理で置いた駅は路線図の空いた格子点に、路線図で置いた駅は地理にも仮置きする', () => {
  const store = fictionalStore();
  // 対応が無い最初の駅（路線図で置く）は、地形の中央（64km）
  const a = store.dispatch({ type: 'station/add', x: 0, y: 0 });
  let p = store.getState();
  assert.deepEqual(p.stations.find((s) => s.id === a).geo, { x: 64, y: 64 });
  // 地理で置いた駅（1マス 1km の仮の対応）
  const b = store.dispatch({ type: 'station/add', geo: { x: 67.2, y: 64 } });
  p = store.getState();
  const sb = p.stations.find((s) => s.id === b);
  assert.deepEqual(sb.geo, { x: 67.2, y: 64 });
  assert.deepEqual(sb.schematic, { x: 3, y: 0 });
  // 同じ格子点に当たる駅は、隣の空いた点へ
  const c = store.dispatch({ type: 'station/add', geo: { x: 64.1, y: 64 } });
  const sc = store.getState().stations.find((s) => s.id === c);
  assert.ok(!(sc.schematic.x === 0 && sc.schematic.y === 0), JSON.stringify(sc.schematic));
  // 路線を引く途中で地理に新しい駅を作る
  const lineId = store.dispatch({ type: 'line/add', stationIds: [a, b] });
  const d = store.dispatch({ type: 'line/appendStop', lineId, newStation: { geo: { x: 70, y: 60 } } });
  const sd = store.getState().stations.find((s) => s.id === d);
  assert.deepEqual(sd.geo, { x: 70, y: 60 });
  assert.ok(sd.schematic);
  // 1手で取り消せる
  store.undo();
  assert.ok(!store.getState().stations.some((s) => s.id === d));
});

test('地理の駅：地形が無いプロジェクトでは地理の位置を作らない。地理の移動', () => {
  const store = newStore();
  const a = store.dispatch({ type: 'station/add', x: 1, y: 2 });
  assert.equal(store.getState().stations.find((s) => s.id === a).geo, null);
  const f = fictionalStore();
  const b = f.dispatch({ type: 'station/add', geo: { x: 10, y: 10 } });
  f.dispatch({ type: 'station/moveGeo', ids: [b], dx: 0.25, dy: -1.5 });
  assert.deepEqual(f.getState().stations.find((s) => s.id === b).geo, { x: 10.25, y: 8.5 });
});

test('地理の経由点：足す位置は、点にいちばん近い辺', () => {
  const ctrl = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
  assert.equal(viaInsertIndex(ctrl, { x: 2, y: 1 }), 0);
  assert.equal(viaInsertIndex(ctrl, { x: 8, y: -1 }), 1);
  const next = nextGeoViaPoint([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 10, y: 0 }]);
  assert.deepEqual(next, { index: 1, point: { x: 6, y: 0 } });
  assert.equal(nextGeoViaPoint([{ x: 0, y: 0 }, { x: 0.01, y: 0 }]), null);
});
