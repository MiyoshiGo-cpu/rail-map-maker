// 直通チェック（§6.5）と系統のチェック（§6.6）
import { test, assert } from './harness.js';
import { newStore, throughNetwork } from './helpers.js';
import { runChecks } from '../js/core/validate.js';
import { findRoutes } from '../js/core/network.js';

/** A線 → B線 → C線 の直通急行を作る */
function withThrough() {
  const net = throughNetwork();
  const [route] = findRoutes(net.store.getState(), net.S.a0, net.S.c3);
  const serviceId = net.d({ type: 'service/add', route: route.segments, typeId: net.type(net.opA, '急行') });
  const items = () => runChecks(net.store.getState()).filter((c) => c.target && c.target.id === serviceId);
  return { ...net, serviceId, items };
}

test('直通チェック：同じ軌間・電化方式なら系統の問題はない', () => {
  const { items } = withThrough();
  assert.deepEqual(items(), []);
});

test('直通チェック：軌間が違う路線への直通はエラー（どこで変わるか）', () => {
  const { d, lineC, items } = withThrough();
  d({ type: 'line/defaults', lineId: lineC, fields: { gauge: 1435 } });
  const errs = items().filter((c) => c.code === 'gaugeMismatch');
  assert.equal(errs.length, 1);
  assert.equal(errs[0].level, 'error');
  assert.equal(errs[0].params.station, 'J2');
  assert.deepEqual([errs[0].params.a, errs[0].params.b], [{ gauge: 1067 }, { gauge: 1435 }]);
});

test('直通チェック：電化方式が違うと警告。区間ごとの上書きも見る', () => {
  const { d, lineB, items } = withThrough();
  d({ type: 'line/defaults', lineId: lineB, fields: { electrification: 'dc750' } });
  let warns = items().filter((c) => c.code === 'electrificationMismatch');
  assert.deepEqual(warns.map((c) => c.level), ['warning', 'warning']);
  assert.deepEqual(warns.map((c) => c.params.station), ['J1', 'J2']);
  assert.deepEqual(warns[0].params.a, { key: 'electrification.dc1500' });
  // B線の最初の駅間だけ dc1500 に戻すと、J1 の警告は b1 に移る
  d({ type: 'line/section', lineId: lineB, index: 0, fields: { electrification: 'dc1500' } });
  warns = items().filter((c) => c.code === 'electrificationMismatch');
  assert.deepEqual(warns.map((c) => c.params.station), ['b1', 'J2']);
});

test('直通チェック：車両が両方の軌間・電化方式に対応していれば出さない。非電化の区間を電車が走るとエラー', () => {
  const { store, d, lineB, lineC, serviceId } = withThrough();
  d({ type: 'line/defaults', lineId: lineB, fields: { electrification: 'dc750' } });
  d({ type: 'line/defaults', lineId: lineC, fields: { gauge: 1435 } });
  const stock = { id: 'rs_1', name: '車両', kind: 'emu', maxSpeed: 110, accel: 3, decel: 3.5, electrifications: ['dc1500', 'dc750'], gauges: [1067, 1435], capacityPerCar: 140, defaultCars: 8, bodyColor: '#FFFFFF', bandColor: '#000000' };
  const s = store.getState();
  const p = { ...s, rollingStock: [stock], services: s.services.map((x) => (x.id === serviceId ? { ...x, rollingStockId: 'rs_1' } : x)) };
  const codes = (q) => runChecks(q).filter((c) => c.target && c.target.id === serviceId).map((c) => c.code);
  assert.deepEqual(codes(p), []);
  const nonElec = { ...p, lines: p.lines.map((l) => (l.id === lineC ? { ...l, defaults: { ...l.defaults, electrification: 'none' } } : l)) };
  assert.ok(codes(nonElec).includes('emuOnNonElectrified'));
  // 気動車なら非電化でもよい
  const dmu = { ...nonElec, rollingStock: [{ ...stock, kind: 'dmu', electrifications: ['none', 'dc1500', 'dc750'] }] };
  assert.ok(!codes(dmu).includes('emuOnNonElectrified'));
});

test('系統のチェック：経路がつながっていない（エラー）・環状線の向きがない（エラー）', () => {
  const { d, S, items } = withThrough();
  d({ type: 'station/delete', ids: [S.J1] });
  assert.deepEqual(items().map((c) => [c.level, c.code]), [['error', 'serviceBroken']]);

  const store = newStore();
  const ids = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => store.dispatch({ type: 'station/add', x, y }));
  const lineId = store.dispatch({ type: 'line/add', stationIds: ids });
  store.dispatch({ type: 'line/setLoop', lineId, isLoop: true });
  store.dispatch({ type: 'serviceType/addPreset', operatorId: store.getState().operators[0].id, presetId: 'tram' });
  const typeId = store.getState().serviceTypes[0].id;
  const s = store.getState();
  const p = { ...s, services: [{ id: 'sv_1', segments: [{ lineId, from: ids[0], to: ids[2], typeId }], stops: [], stopsAuto: true, frequency: { morning: 1, day: 1, evening: 1, night: 1 }, bothDirections: true }] };
  assert.ok(runChecks(p).some((c) => c.code === 'loopDirMissing' && c.level === 'error'));
});

test('系統のチェック：停車駅が2つ未満（警告）・使われていない種別（情報）', () => {
  const store = newStore();
  const ids = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => store.dispatch({ type: 'station/add', x, y }));
  const lineId = store.dispatch({ type: 'line/add', stationIds: ids });
  store.dispatch({ type: 'line/setLoop', lineId, isLoop: true });
  store.dispatch({ type: 'serviceType/addPreset', operatorId: store.getState().operators[0].id, presetId: 'subway' });
  const [local, express] = store.getState().serviceTypes;
  const [loop] = findRoutes(store.getState(), ids[0], ids[0]);
  const id = store.dispatch({ type: 'service/add', route: loop.segments, typeId: local.id });
  for (const st of ids.slice(1)) store.dispatch({ type: 'service/setStop', serviceId: id, stationId: st, stop: false });
  const items = runChecks(store.getState());
  const few = items.find((c) => c.code === 'serviceFewStops');
  assert.equal(few.level, 'warning');
  assert.deepEqual(few.target, { type: 'service', id });
  const unused = items.filter((c) => c.code === 'unusedServiceType');
  assert.deepEqual(unused.map((c) => c.target.id), [express.id]);
  assert.equal(unused[0].level, 'info');
  // 名前のない系統は「種別 始発→終着」の部品を渡す
  assert.equal(few.params.service.key, 'service.route');
});
