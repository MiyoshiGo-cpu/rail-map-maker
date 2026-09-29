// 種別（§3.3）：プリセットからの一括追加・1つずつ追加・並べ替え（rank の入れ替え）・削除・読み込み時の補完
import { test, assert } from './harness.js';
import { newStore, deepFreeze } from './helpers.js';
import { typesOfOperator } from '../js/core/actions/service-types.js';
import { createProjectStore } from '../js/core/actions/index.js';
import { normalizeProject } from '../js/core/defaults.js';
import { getRegion, defaultServiceSet } from '../js/core/regions/index.js';

function withOperator() {
  const store = newStore();
  const operatorId = store.dispatch({ type: 'operator/add', fields: { name: '湾岸電鉄', category: 'major' } });
  const names = () => typesOfOperator(store.getState().serviceTypes, operatorId).map((x) => x.type.name);
  return { store, operatorId, names };
}

test('種別：プリセットからまとめて追加する（名前・略称・色・rank・停車ルール・停車時間・英語表記）', () => {
  const { store, operatorId, names } = withOperator();
  const ids = store.dispatch({ type: 'serviceType/addPreset', operatorId, presetId: 'private' });
  assert.equal(ids.length, 8);
  assert.deepEqual(names(), ['各駅停車', '区間準急', '準急', '区間急行', '急行', '快速急行', '特急', '有料特急']);
  const types = store.getState().serviceTypes;
  const exp = types.find((x) => x.name === '急行');
  assert.equal(exp.shortName, '急');
  assert.equal(exp.color, '#E8541E');
  assert.equal(exp.rank, 6);
  assert.deepEqual(exp.stopRule, { base: 'majorAndAbove', interchanges: true });
  assert.equal(exp.dwellSec, 40);
  assert.equal(exp.names.en, 'Express');
  const local = types.find((x) => x.name === '各駅停車');
  assert.equal(local.dwellSec, 30);
  const paid = types.find((x) => x.name === '有料特急');
  assert.equal(paid.surcharge, true);
  assert.equal(paid.seating, 'reserved');
  assert.equal(paid.dwellSec, 60);
  // もう一度追加しても、同じ名前の種別は増えない
  assert.deepEqual(store.dispatch({ type: 'serviceType/addPreset', operatorId, presetId: 'private' }), []);
  // 取り消すとまとめて消える
  store.undo();
  store.undo();
  assert.equal(store.getState().serviceTypes.length, 0);
});

test('種別：1つずつ追加すると、いちばん速い種別の次の rank になる', () => {
  const { store, operatorId } = withOperator();
  const a = store.dispatch({ type: 'serviceType/add', operatorId });
  const b = store.dispatch({ type: 'serviceType/add', operatorId });
  const types = store.getState().serviceTypes;
  assert.equal(types.find((x) => x.id === a).name, '種別1');
  assert.equal(types.find((x) => x.id === a).rank, 1);
  assert.equal(types.find((x) => x.id === b).rank, 2);
});

test('種別：並べ替えは隣の種別と rank を入れ替える（同じ rank なら並びを入れ替える）', () => {
  const { store, operatorId, names } = withOperator();
  store.dispatch({ type: 'serviceType/addPreset', operatorId, presetId: 'subway' });
  const exp = store.getState().serviceTypes.find((x) => x.name === '急行');
  store.dispatch({ type: 'serviceType/move', typeId: exp.id, delta: -1 });
  assert.deepEqual(names(), ['急行', '各駅停車']);
  assert.equal(store.getState().serviceTypes.find((x) => x.id === exp.id).rank, 1);
  // 端より先には動かない
  store.dispatch({ type: 'serviceType/move', typeId: exp.id, delta: -1 });
  assert.deepEqual(names(), ['急行', '各駅停車']);
  // 同じ rank
  const local = store.getState().serviceTypes.find((x) => x.name === '各駅停車');
  store.dispatch({ type: 'serviceType/update', typeId: local.id, fields: { rank: 1 } });
  store.dispatch({ type: 'serviceType/move', typeId: local.id, delta: -1 });
  assert.deepEqual(names(), ['各駅停車', '急行']);
});

test('種別：系統が使っている種別は消せない。使っていなければ消せる', () => {
  const { store, operatorId } = withOperator();
  const [a, b] = store.dispatch({ type: 'serviceType/addPreset', operatorId, presetId: 'subway' });
  const s = store.getState();
  const p = deepFreeze({ ...s, services: [{ id: 'sv_1', segments: [{ lineId: 'ln_x', from: 'st_a', to: 'st_b', typeId: a }], stops: [], stopsAuto: true, frequency: { morning: 1, day: 1, evening: 1, night: 1 }, bothDirections: true }] });
  const store2 = createProjectStore(p);
  assert.equal(store2.dispatch({ type: 'serviceType/delete', typeId: a }), false);
  assert.equal(store2.dispatch({ type: 'serviceType/delete', typeId: b }), true);
  assert.deepEqual(store2.getState().serviceTypes.map((x) => x.id), [a]);
});

test('種別：停車時間を rank の既定に戻す・事業者の種別があると事業者は消せない', () => {
  const { store, operatorId } = withOperator();
  const id = store.dispatch({ type: 'serviceType/add', operatorId, fields: { rank: 9 } });
  store.dispatch({ type: 'serviceType/update', typeId: id, fields: { dwellSec: 15 } });
  store.dispatch({ type: 'serviceType/resetDwell', typeId: id });
  assert.equal(store.getState().serviceTypes[0].dwellSec, 60);
  assert.equal(store.dispatch({ type: 'operator/delete', operatorId }), false);
});

test('種別：読み込んだデータの足りない項目を補う', () => {
  const s = newStore().getState();
  const p = normalizeProject({ ...s, operators: [{ id: 'op_1', name: 'a' }], serviceTypes: [{ id: 'ty_1', operatorId: 'op_1', name: '快速', rank: 3, stopRule: { base: 'majorAndAbove' } }] });
  const x = p.serviceTypes[0];
  assert.equal(x.shortName, '快速');
  assert.deepEqual(x.stopRule, { base: 'majorAndAbove', interchanges: false });
  assert.equal(x.dwellSec, 40);
  assert.deepEqual(x.names, {});
  assert.equal(x.seating, 'free');
});

test('種別：事業者に合ったプリセット（路線の種類を優先し、なければ区分）', () => {
  const jp = getRegion('jp');
  assert.equal(defaultServiceSet(jp, { category: 'jr' }, ['conventional']), 'jrConventional');
  assert.equal(defaultServiceSet(jp, { category: 'jr' }, ['shinkansen', 'shinkansen', 'conventional']), 'shinkansen');
  assert.equal(defaultServiceSet(jp, { category: 'public' }, []), 'subway');
  assert.equal(defaultServiceSet(jp, { category: 'major' }, ['subway']), 'subway');
  assert.equal(defaultServiceSet(jp, { category: 'thirdSector' }, ['conventional']), 'private');
});
