// 所要時間（§6.4）：台形の速度曲線・停車時間・余裕率、表定速度と停車駅数
import { test, assert } from './harness.js';
import { newStore, throughNetwork } from './helpers.js';
import { runSeconds, serviceRuntime } from '../js/core/runtime.js';
import { findRoutes } from '../js/core/network.js';

test('所要時間：台形（最高速度まで出る）と三角形（出る前に減速する）', () => {
  const v = 100 / 3.6;
  const a = 2.5 / 3.6;
  const b = 3.5 / 3.6;
  // 最高速度に届く：V/a + V/b + 残り/V
  const need = v * v / (2 * a) + v * v / (2 * b);
  const t = runSeconds(2000, v, a, b);
  assert.ok(Math.abs(t - (v / a + v / b + (2000 - need) / v)) < 1e-9);
  // 届かない：vp = √(2abd/(a+b))
  const vp = Math.sqrt(2 * a * b * 500 / (a + b));
  assert.ok(Math.abs(runSeconds(500, v, a, b) - (vp / a + vp / b)) < 1e-9);
  assert.equal(runSeconds(0, v, a, b), 0);
});

test('所要時間の検算：全長10.0km・駅7つ等間隔・100km/h・加速2.5／減速3.5・30秒停車・余裕5% → 751.5秒', () => {
  const store = newStore();
  const d = (x) => store.dispatch(x);
  const ids = [0, 2, 4, 6, 8, 10, 12].map((x) => d({ type: 'station/add', x, y: 0 }));
  const lineId = d({ type: 'line/add', fields: { kind: 'conventional' }, stationIds: ids });
  d({ type: 'line/stop', lineId, index: 6, fields: { km: 10 } });
  const p0 = store.getState();
  assert.equal(p0.lines[0].defaults.maxSpeed, 100);
  d({ type: 'serviceType/addPreset', operatorId: p0.operators[0].id, presetId: 'jrConventional' });
  const local = store.getState().serviceTypes.find((x) => x.name === '普通');
  assert.equal(local.dwellSec, 30);
  const [route] = findRoutes(store.getState(), ids[0], ids[6]);
  const id = d({ type: 'service/add', route: route.segments, typeId: local.id });
  const p = store.getState();
  const r = serviceRuntime(p, p.services.find((x) => x.id === id));
  assert.ok(Math.abs(r.totalSec - 751.5) <= 1, String(r.totalSec));
  assert.equal(r.stopCount, 7);
  assert.ok(Math.abs(r.km - 10) < 1e-9);
  assert.ok(Math.abs(r.scheduledSpeed - 10 / (r.totalSec / 3600)) < 1e-9);
  assert.equal(r.legs.length, 6);
  assert.ok(Math.abs(r.depart[6] - r.totalSec) < 1e-9);
});

test('所要時間：区間の最高速度の最小値・通過駅・直通先の路線の加減速度', () => {
  const { store, d, S, opA, opB, type } = throughNetwork();
  const [route] = findRoutes(store.getState(), S.a0, S.c3);
  const id = d({ type: 'service/add', route: route.segments, typeId: type(opA, '急行') });
  const sv = () => store.getState().services.find((x) => x.id === id);
  const fast = serviceRuntime(store.getState(), sv());
  // B線内を各駅停車にすると停車駅が増えて遅くなる
  d({ type: 'service/segmentType', serviceId: id, index: 1, typeId: type(opB, '各駅停車') });
  const slow = serviceRuntime(store.getState(), sv());
  assert.ok(slow.totalSec > fast.totalSec);
  assert.equal(slow.stopCount, fast.stopCount + 1);
  // 区間の最高速度を下げると、その区間を含む駅間が遅くなる
  const lineA = store.getState().lines.find((l) => l.name === 'A線');
  d({ type: 'line/section', lineId: lineA.id, index: 0, fields: { maxSpeed: 40 } });
  const limited = serviceRuntime(store.getState(), sv());
  assert.equal(limited.legs[0].maxSpeed, 40);
  assert.ok(limited.totalSec > slow.totalSec);
});

test('所要時間：経路がつながっていなければ計算しない', () => {
  const { store, d, S, opA, type } = throughNetwork();
  const [route] = findRoutes(store.getState(), S.a0, S.c3);
  const id = d({ type: 'service/add', route: route.segments, typeId: type(opA, '急行') });
  d({ type: 'station/delete', ids: [S.J1] });
  assert.equal(serviceRuntime(store.getState(), store.getState().services.find((x) => x.id === id)), null);
});
