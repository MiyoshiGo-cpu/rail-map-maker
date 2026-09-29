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

test('チェック：駅2つ未満の路線・番号の重複・駅名/よみが空・どの路線にもない駅・近くの同名駅・使われていない事業者', async () => {
  const { runChecks } = await import('../js/core/validate.js');
  const { store, lineId, ids } = storeWithLine([[0, 0], [2, 0], [4, 0]]);
  const codes = () => runChecks(store.getState()).map((c) => c.code);
  // 名前もよみも空
  assert.ok(codes().includes('nameEmpty'));
  ids.forEach((id, i) => store.dispatch({ type: 'station/update', stationId: id, fields: { name: `駅${i}`, reading: `えき${i}` } }));
  // 営業キロを入れていないので、概算の情報だけが出る
  assert.deepEqual(codes(), ['kmEstimated']);
  // 番号の重複（エラー）
  store.dispatch({ type: 'line/numbering', lineId, fields: { enabled: true } });
  store.dispatch({ type: 'line/fixNumbers', lineId });
  store.dispatch({ type: 'line/stop', lineId, index: 2, fields: { number: '01' } });
  const dup = runChecks(store.getState()).find((c) => c.code === 'duplicateNumber');
  assert.equal(dup.level, 'error');
  assert.deepEqual(dup.target, { type: 'line', id: lineId });
  // どの路線にもない駅と、近くの同名駅（乗換グループにすれば出ない）
  const lone = store.dispatch({ type: 'station/add', x: 2, y: 2, fields: { name: '駅1', reading: 'えき1' } });
  assert.ok(codes().includes('stationOrphan'));
  assert.ok(codes().includes('sameNameNearby'));
  store.dispatch({ type: 'interchange/add', stationIds: [ids[1], lone] });
  assert.ok(!codes().includes('sameNameNearby'));
  // 駅が2つ未満の路線、使われていない事業者
  store.dispatch({ type: 'line/add', stationIds: [lone] });
  assert.ok(codes().includes('lineTooShort'));
  store.dispatch({ type: 'operator/add' });
  assert.ok(codes().includes('unusedOperator'));
  // エラー → 警告 → 情報 の順
  const levels = runChecks(store.getState()).map((c) => c.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b)));
});
