// 運行系統（§7 フェーズ2）：経路の自動作成（直通を含む）・候補・経由する路線・環状線・停車駅の自動決定・手での変更・後始末
import { test, assert } from './harness.js';
import { newStore, throughNetwork } from './helpers.js';
import { findRoutes } from '../js/core/network.js';
import { expandService, stopFlags, stopIds, throughJoints, loopClockwise, defaultTypeFor } from '../js/core/services.js';
import { checkIntegrity } from '../js/core/validate.js';
import { normalizeProject } from '../js/core/defaults.js';

const names = (store, ids) => ids.map((id) => store.getState().stations.find((s) => s.id === id).name);

test('経路の自動作成：1本の路線の中なら区間は1つ', () => {
  const { store, S, lineB } = throughNetwork();
  const routes = findRoutes(store.getState(), S.J1, S.J2);
  assert.equal(routes.length, 1);
  assert.deepEqual(routes[0].segments, [{ lineId: lineB, from: S.J1, to: S.J2 }]);
});

test('経路の自動作成：直通（私鉄A線 → 地下鉄B線 → 私鉄C線）と、区間の種別の既定', () => {
  const { store, d, S, opB, lineA, lineB, lineC, type, opA, opC } = throughNetwork();
  const [route] = findRoutes(store.getState(), S.a0, S.c3);
  assert.deepEqual(route.lineIds, [lineA, lineB, lineC]);
  assert.deepEqual(route.segments.map((s) => [s.from, s.to]), [[S.a0, S.J1], [S.J1, S.J2], [S.J2, S.c3]]);
  const id = d({ type: 'service/add', route: route.segments, typeId: type(opA, '急行') });
  const sv = store.getState().services.find((x) => x.id === id);
  // B線（地下鉄）にも「急行」があるので同じ名前の種別、C線は C電鉄の「急行」
  assert.deepEqual(sv.segments.map((s) => s.typeId), [type(opA, '急行'), type(opB, '急行'), type(opC, '急行')]);
  assert.equal(throughJoints(store.getState(), sv).length, 2);
  assert.deepEqual(checkIntegrity(store.getState()), []);
  // 同じ名前が無ければ、rank が基準以下でいちばん近い種別
  assert.equal(defaultTypeFor(store.getState(), lineB, type(opA, '快速急行')), type(opB, '急行'));
  assert.equal(defaultTypeFor(store.getState(), lineB, type(opA, '準急')), type(opB, '各駅停車'));
});

test('停車駅：種別のルール（主要駅・乗換駅）と、事業者が変わるつなぎ目・始発・終着', () => {
  const { store, d, S, opA, type } = throughNetwork();
  const [route] = findRoutes(store.getState(), S.a0, S.c3);
  const id = d({ type: 'service/add', route: route.segments, typeId: type(opA, '急行') });
  const p = store.getState();
  const sv = p.services.find((x) => x.id === id);
  const path = expandService(p, sv);
  assert.ok(path.ok);
  assert.deepEqual(names(store, path.stations), ['a0', 'a1', 'J1', 'b1', 'b2', 'J2', 'c1', 'c2', 'c3']);
  assert.deepEqual(names(store, stopIds(path, stopFlags(p, sv, path))), ['a0', 'a1', 'J1', 'b2', 'J2', 'c1', 'c3']);
  // データにも停車駅を持つ
  assert.deepEqual(names(store, sv.stops), ['a0', 'a1', 'J1', 'b2', 'J2', 'c1', 'c3']);
});

test('停車駅：B線内だけ各駅停車に変えると、B線の駅にすべて止まる（完了条件）', () => {
  const { store, d, S, opA, opB, type } = throughNetwork();
  const [route] = findRoutes(store.getState(), S.a0, S.c3);
  const id = d({ type: 'service/add', route: route.segments, typeId: type(opA, '急行') });
  d({ type: 'service/segmentType', serviceId: id, index: 1, typeId: type(opB, '各駅停車') });
  const p = store.getState();
  const sv = p.services.find((x) => x.id === id);
  const path = expandService(p, sv);
  assert.deepEqual(names(store, stopIds(path, stopFlags(p, sv, path))), ['a0', 'a1', 'J1', 'b1', 'b2', 'J2', 'c1', 'c3']);
});

test('停車駅：手で外す・足すと自動をやめ、「自動に戻す」で種別のルールに戻る。始発・終着は外せない', () => {
  const { store, d, S, opA, type } = throughNetwork();
  const [route] = findRoutes(store.getState(), S.a0, S.c3);
  const id = d({ type: 'service/add', route: route.segments, typeId: type(opA, '急行') });
  const sv = () => store.getState().services.find((x) => x.id === id);
  const flags = () => { const p = store.getState(); const path = expandService(p, sv()); return names(store, stopIds(path, stopFlags(p, sv(), path))); };
  d({ type: 'service/setStop', serviceId: id, stationId: S.a1, stop: false });
  d({ type: 'service/setStop', serviceId: id, stationId: S.c2, stop: true });
  assert.equal(sv().stopsAuto, false);
  assert.deepEqual(flags(), ['a0', 'J1', 'b2', 'J2', 'c1', 'c2', 'c3']);
  d({ type: 'service/setStop', serviceId: id, stationId: S.a0, stop: false });
  assert.deepEqual(flags()[0], 'a0');
  d({ type: 'service/autoStops', serviceId: id });
  assert.equal(sv().stopsAuto, true);
  assert.deepEqual(flags(), ['a0', 'a1', 'J1', 'b2', 'J2', 'c1', 'c3']);
});

test('経路の候補：別の路線を通る経路も出し、経由する路線を指定すると絞れる', () => {
  const { store, d, S, opB } = throughNetwork();
  // a1 から b2 へ、B線を通らない近道（D線）を足す
  const lineD = d({ type: 'line/add', fields: { operatorId: opB, name: 'D線' }, stationIds: [S.a1, S.b2] });
  const routes = findRoutes(store.getState(), S.a0, S.c3);
  assert.ok(routes.length >= 2, String(routes.length));
  assert.ok(routes.some((r) => r.lineIds.includes(lineD)));
  assert.ok(routes.some((r) => !r.lineIds.includes(lineD)));
  // 候補は短い順
  for (let i = 1; i < routes.length; i++) assert.ok(routes[i - 1].km <= routes[i].km + 2 * routes[i].lineIds.length);
  const via = findRoutes(store.getState(), S.a0, S.c3, { via: [lineD] });
  assert.ok(via.length >= 1);
  assert.ok(via.every((r) => r.lineIds.includes(lineD)));
  // つながっていない駅どうしは候補なし
  const lone = d({ type: 'station/add', x: 30, y: 30 });
  assert.deepEqual(findRoutes(store.getState(), S.a0, lone), []);
});

test('環状線：向き（cw・ccw）を付け、始発と終着が同じなら一周する', () => {
  const store = newStore();
  const d = (a) => store.dispatch(a);
  // 時計回り（画面の上で右→下→左→上）に並べる
  const ids = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => d({ type: 'station/add', x, y }));
  const lineId = d({ type: 'line/add', stationIds: ids });
  d({ type: 'line/setLoop', lineId, isLoop: true });
  const p = store.getState();
  assert.equal(loopClockwise(p, p.lines[0]), true);
  // 0 → 3 は逆回り（ccw）の1駅間が近い
  const [r] = findRoutes(p, ids[0], ids[3]);
  assert.deepEqual(r.segments, [{ lineId, from: ids[0], to: ids[3], loopDir: 'ccw' }]);
  const loops = findRoutes(p, ids[1], ids[1]);
  assert.deepEqual(loops.map((x) => x.segments[0].loopDir), ['cw', 'ccw']);
  const opId = p.operators[0].id;
  d({ type: 'serviceType/addPreset', operatorId: opId, presetId: 'jrConventional' });
  const typeId = store.getState().serviceTypes[0].id;
  const id = d({ type: 'service/add', route: loops[0].segments, typeId });
  const sv = store.getState().services.find((x) => x.id === id);
  const path = expandService(store.getState(), sv);
  assert.deepEqual(path.stations, [ids[1], ids[2], ids[3], ids[0], ids[1]]);
  const ccw = expandService(store.getState(), { ...sv, segments: [{ ...sv.segments[0], loopDir: 'ccw' }] });
  assert.deepEqual(ccw.stations, [ids[1], ids[0], ids[3], ids[2], ids[1]]);
});

test('後始末：端の駅を消すと隣の駅まで縮め、区間が無くなった系統は消す', () => {
  const { store, d, S, opA, lineA, type } = throughNetwork();
  const [route] = findRoutes(store.getState(), S.a0, S.c3);
  const id = d({ type: 'service/add', route: route.segments, typeId: type(opA, '急行') });
  const sv = () => store.getState().services.find((x) => x.id === id);
  // 始発の駅を消す → a1 から
  assert.equal(d({ type: 'station/delete', ids: [S.a0] }), 0);
  assert.equal(sv().segments[0].from, S.a1);
  assert.ok(expandService(store.getState(), sv()).ok);
  assert.deepEqual(checkIntegrity(store.getState()), []);
  // 終点側の駅を路線から外す（駅は残す）→ c2 まで
  const lineC = store.getState().lines.find((l) => l.name === 'C線');
  d({ type: 'line/removeStop', lineId: lineC.id, index: 3 });
  assert.equal(sv().segments[2].to, S.c2);
  // A線を消すと、A線の区間を外す
  assert.equal(d({ type: 'line/delete', lineId: lineA }), 0);
  assert.equal(sv().segments.length, 2);
  assert.deepEqual(checkIntegrity(store.getState()), []);
  // 取り消すと元に戻る
  store.undo();
  assert.equal(sv().segments.length, 3);
});

test('後始末：つなぎ目の駅を消すとつながらなくなる。1区間だけの系統は、区間が無くなると消える', () => {
  const { store, d, S, opA, opB, type } = throughNetwork();
  const [route] = findRoutes(store.getState(), S.a0, S.c3);
  const through = d({ type: 'service/add', route: route.segments, typeId: type(opA, '急行') });
  const [local] = findRoutes(store.getState(), S.J1, S.b1);
  const short = d({ type: 'service/add', route: local.segments, typeId: type(opB, '各駅停車') });
  const removed = d({ type: 'station/delete', ids: [S.J1, S.b1] });
  assert.equal(removed, 1);
  const p = store.getState();
  assert.ok(!p.services.some((x) => x.id === short));
  const sv = p.services.find((x) => x.id === through);
  assert.equal(expandService(p, sv).ok, false);
  assert.deepEqual(checkIntegrity(p), []);
});

test('後始末：路線を2本に分けると、2本目だけを通る区間は新しい路線に付け替える', () => {
  const { store, d, S, opB, lineB, type } = throughNetwork();
  const [route] = findRoutes(store.getState(), S.b2, S.J2);
  const id = d({ type: 'service/add', route: route.segments, typeId: type(opB, '各駅停車') });
  const newLine = d({ type: 'line/cutSection', lineId: lineB, sectionIndex: 1 });
  const sv = store.getState().services.find((x) => x.id === id);
  assert.equal(sv.segments[0].lineId, newLine);
  assert.ok(expandService(store.getState(), sv).ok);
});

test('系統：項目の更新・複製・削除と、読み込み時の補完', () => {
  const { store, d, S, opB, type } = throughNetwork();
  const [route] = findRoutes(store.getState(), S.J1, S.J2);
  const id = d({ type: 'service/add', route: route.segments, typeId: type(opB, '各駅停車'), fields: { name: 'みなと' } });
  d({ type: 'service/update', serviceId: id, fields: { cars: 8, frequency: { morning: 12, day: 6, evening: 10, night: 4 }, bothDirections: false } });
  let sv = store.getState().services.find((x) => x.id === id);
  assert.equal(sv.cars, 8);
  assert.equal(sv.frequency.morning, 12);
  d({ type: 'service/update', serviceId: id, fields: { cars: undefined } });
  assert.ok(!('cars' in store.getState().services.find((x) => x.id === id)));
  const copy = d({ type: 'service/duplicate', serviceId: id });
  assert.equal(store.getState().services.find((x) => x.id === copy).name, 'みなと（コピー）');
  d({ type: 'service/delete', serviceId: copy });
  assert.equal(store.getState().services.length, 1);
  sv = normalizeProject({ ...store.getState(), services: [{ id: 'sv_x', segments: [] }] }).services[0];
  assert.equal(sv.stopsAuto, true);
  assert.equal(sv.bothDirections, true);
  assert.deepEqual(sv.stops, []);
  assert.deepEqual(Object.keys(sv.frequency), ['morning', 'day', 'evening', 'night']);
});
