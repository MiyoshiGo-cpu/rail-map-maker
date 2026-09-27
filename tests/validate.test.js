import { test, assert } from './harness.js';
import { checkIntegrity } from '../js/core/validate.js';
import { createProject } from '../js/core/defaults.js';
import { storeWithLine } from './helpers.js';

test('整合性：新しいプロジェクトと、操作したプロジェクトは問題なし', () => {
  assert.deepEqual(checkIntegrity(createProject({ name: 'a' })), []);
  const { store, lineId } = storeWithLine();
  store.dispatch({ type: 'line/setLoop', lineId, isLoop: true });
  store.dispatch({ type: 'interchange/add', stationIds: store.getState().stations.slice(0, 2).map((s) => s.id) });
  assert.deepEqual(checkIntegrity(store.getState()), []);
});

test('整合性：存在しない駅への参照を見つける', () => {
  const { store } = storeWithLine();
  const p = store.getState();
  const broken = { ...p, lines: [{ ...p.lines[0], stops: [...p.lines[0].stops, { stationId: 'st_none' }], sections: [...p.lines[0].sections, {}] }] };
  assert.deepEqual(checkIntegrity(broken).map((x) => x.code), ['ref']);
});

test('整合性：ID の重複・駅間の数の食い違い・座標が整数でない', () => {
  const { store } = storeWithLine();
  const p = store.getState();
  const s0 = p.stations[0];
  const broken = {
    ...p,
    stations: [...p.stations, { ...s0 }],
    lines: [{ ...p.lines[0], sections: [] }],
  };
  const codes = checkIntegrity(broken).map((x) => x.code);
  assert.ok(codes.includes('duplicateId'));
  assert.ok(codes.includes('sectionCount'));
  const moved = { ...p, stations: [{ ...s0, schematic: { x: 0.5, y: 0 } }, ...p.stations.slice(1)] };
  assert.deepEqual(checkIntegrity(moved).map((x) => x.code), ['stationPos']);
});

test('整合性：配列がない・版が違う', () => {
  const p = createProject({ name: 'a' });
  assert.deepEqual(checkIntegrity({ ...p, lines: null }).map((x) => x.code), ['collection']);
  assert.deepEqual(checkIntegrity({ ...p, schemaVersion: 99 }).map((x) => x.code), ['version']);
});
