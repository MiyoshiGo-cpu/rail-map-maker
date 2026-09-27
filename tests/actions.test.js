// アクションごとに「操作 → Undo で元どおり → Redo で操作後どおり」を確かめる
import { test, assert } from './harness.js';
import { newStore, strip, storeWithLine } from './helpers.js';

/**
 * @param {any} store
 * @param {any} action
 */
function roundTrip(store, action) {
  const before = strip(store.getState());
  const result = store.dispatch(action);
  const after = strip(store.getState());
  assert.ok(store.undo(), `${action.type} を取り消せる`);
  assert.deepEqual(strip(store.getState()), before, `${action.type} の取り消し`);
  assert.ok(store.redo());
  assert.deepEqual(strip(store.getState()), after, `${action.type} のやり直し`);
  return result;
}

test('路線を足すと、事業者がなければ自動で作る', () => {
  const store = newStore();
  const a = store.dispatch({ type: 'station/add', x: 0, y: 0 });
  const b = store.dispatch({ type: 'station/add', x: 3, y: 0 });
  const lineId = roundTrip(store, { type: 'line/add', stationIds: [a, b] });
  const p = store.getState();
  assert.equal(p.operators.length, 1);
  const line = p.lines.find((l) => l.id === lineId);
  assert.equal(line.operatorId, p.operators[0].id);
  assert.equal(line.name, '路線1');
  assert.equal(line.sections.length, 1);
  assert.equal(line.defaults.gauge, 1067);
});

test('端に駅を足す・新しい駅を作って足す・同じ駅は足さない', () => {
  const { store, lineId, ids } = storeWithLine();
  const newId = roundTrip(store, { type: 'line/appendStop', lineId, newStation: { x: 8, y: 2 } });
  let line = store.getState().lines[0];
  assert.equal(line.stops.length, 5);
  assert.equal(line.stops[4].stationId, newId);
  assert.equal(line.sections.length, 4);
  roundTrip(store, { type: 'line/appendStop', lineId, newStation: { x: -2, y: 0 }, atStart: true });
  line = store.getState().lines[0];
  assert.equal(line.stops.length, 6);
  assert.equal(line.stops[1].stationId, ids[0]);
  assert.equal(store.dispatch({ type: 'line/appendStop', lineId, stationId: ids[2] }), null);
});

test('駅間に駅を挿入すると、区間の属性（形以外）を引き継ぐ', () => {
  const { store, lineId } = storeWithLine();
  store.dispatch({ type: 'line/section', lineId, index: 1, fields: { maxSpeed: 60, schematicBend: 'diagonalFirst' } });
  roundTrip(store, { type: 'line/insertStop', lineId, sectionIndex: 1, newStation: { x: 3, y: 1 } });
  const line = store.getState().lines[0];
  assert.equal(line.stops.length, 5);
  assert.deepEqual(line.sections[1], { maxSpeed: 60 });
  assert.deepEqual(line.sections[2], { maxSpeed: 60 });
});

test('駅を消すと路線は前後の駅でつなぎ直す', () => {
  const { store, ids } = storeWithLine();
  store.dispatch({ type: 'interchange/add', stationIds: [ids[1], ids[3]] });
  roundTrip(store, { type: 'station/delete', ids: [ids[1]] });
  const p = store.getState();
  assert.deepEqual(p.lines[0].stops.map((s) => s.stationId), [ids[0], ids[2], ids[3]]);
  assert.equal(p.lines[0].sections.length, 2);
  assert.equal(p.interchanges.length, 0, '2駅未満の乗換グループは消える');
  assert.equal(p.stations.length, 3);
});

test('環状線：駅間の数が駅の数と同じになる。3駅未満では環状にしない', () => {
  const { store, lineId } = storeWithLine();
  roundTrip(store, { type: 'line/setLoop', lineId, isLoop: true });
  let line = store.getState().lines[0];
  assert.equal(line.isLoop, true);
  assert.equal(line.sections.length, 4);
  store.dispatch({ type: 'line/removeStop', lineId, index: 0 });
  store.dispatch({ type: 'line/removeStop', lineId, index: 0 });
  line = store.getState().lines[0];
  assert.equal(line.isLoop, false);
  assert.equal(line.sections.length, 1);
});

test('環状線の駅間を消すと、そこで切り開いた1本の路線になる', () => {
  const { store, lineId, ids } = storeWithLine();
  store.dispatch({ type: 'line/setLoop', lineId, isLoop: true });
  roundTrip(store, { type: 'line/cutSection', lineId, sectionIndex: 1 });
  const line = store.getState().lines[0];
  assert.equal(line.isLoop, false);
  assert.deepEqual(line.stops.map((s) => s.stationId), [ids[2], ids[3], ids[0], ids[1]]);
});

test('途中の駅間を消すと2本に分かれる', () => {
  const { store, lineId, ids } = storeWithLine();
  const second = roundTrip(store, { type: 'line/cutSection', lineId, sectionIndex: 1 });
  const p = store.getState();
  assert.equal(p.lines.length, 2);
  assert.deepEqual(p.lines[0].stops.map((s) => s.stationId), [ids[0], ids[1]]);
  const l2 = p.lines.find((l) => l.id === second);
  assert.deepEqual(l2.stops.map((s) => s.stationId), [ids[2], ids[3]]);
  assert.equal(l2.name, '路線1（2）');
});

test('端の駅間を消すと、端の駅を路線から外す', () => {
  const { store, lineId, ids } = storeWithLine();
  const r = store.dispatch({ type: 'line/cutSection', lineId, sectionIndex: 2 });
  assert.equal(r, null);
  assert.deepEqual(store.getState().lines[0].stops.map((s) => s.stationId), [ids[0], ids[1], ids[2]]);
});

test('駅の並べ替え：同じ2駅の区間は上書きを引き継ぎ、逆向きなら曲がり位置を入れ替える', () => {
  const { store, lineId, ids } = storeWithLine();
  store.dispatch({ type: 'line/section', lineId, index: 0, fields: { schematicBend: 'diagonalFirst', maxSpeed: 70 } });
  roundTrip(store, { type: 'line/moveStop', lineId, from: 0, to: 1 });
  const line = store.getState().lines[0];
  assert.deepEqual(line.stops.map((s) => s.stationId), [ids[1], ids[0], ids[2], ids[3]]);
  assert.deepEqual(line.sections[0], { schematicBend: 'straightFirst', maxSpeed: 70 });
});

test('路線の種類を変えると、種類で決まる既定値を合わせ直す', () => {
  const { store, lineId } = storeWithLine();
  roundTrip(store, { type: 'line/update', lineId, fields: { kind: 'shinkansen', symbol: 'AB' } });
  const line = store.getState().lines[0];
  assert.equal(line.defaults.gauge, 1435);
  assert.equal(line.defaults.electrification, 'ac25k60');
  assert.equal(line.symbol, 'AB');
});

test('路線の複製・並び順・削除', () => {
  const { store, lineId } = storeWithLine();
  const copy = roundTrip(store, { type: 'line/duplicate', lineId });
  let p = store.getState();
  assert.equal(p.lines.length, 2);
  assert.equal(p.lines[1].name, '路線1（コピー）');
  assert.ok(p.lines[1].order > p.lines[0].order);
  roundTrip(store, { type: 'line/reorder', lineIds: [copy, lineId] });
  p = store.getState();
  assert.equal(p.lines.find((l) => l.id === copy).order, 0);
  roundTrip(store, { type: 'line/delete', lineId: copy });
  assert.equal(store.getState().lines.length, 1);
});

test('事業者：使われている事業者は消せない', () => {
  const { store } = storeWithLine();
  const opId = store.getState().operators[0].id;
  assert.equal(store.dispatch({ type: 'operator/delete', operatorId: opId }), false);
  const other = roundTrip(store, { type: 'operator/add' });
  assert.equal(store.getState().operators[1].name, '事業者2');
  assert.equal(roundTrip(store, { type: 'operator/delete', operatorId: other }), true);
});

test('乗換グループ：駅が重なるグループはまとめる', () => {
  const { store, ids } = storeWithLine();
  const g1 = store.dispatch({ type: 'interchange/add', stationIds: [ids[0], ids[1]] });
  store.dispatch({ type: 'interchange/add', stationIds: [ids[2], ids[3]] });
  const g = roundTrip(store, { type: 'interchange/add', stationIds: [ids[1], ids[2]] });
  const p = store.getState();
  assert.equal(p.interchanges.length, 1);
  assert.equal(g, g1);
  assert.deepEqual([...p.interchanges[0].stationIds].sort(), [...ids].sort());
  roundTrip(store, { type: 'interchange/removeStation', interchangeId: g, stationId: ids[0] });
  assert.equal(store.getState().interchanges[0].stationIds.length, 3);
});

test('駅：項目の変更・移動・ラベル', () => {
  const { store, ids } = storeWithLine();
  roundTrip(store, { type: 'station/update', stationId: ids[0], fields: { name: '本町', reading: 'ほんまち', rank: 'terminal' } });
  roundTrip(store, { type: 'station/move', ids: [ids[0], ids[1]], dx: 1, dy: -1 });
  roundTrip(store, { type: 'station/label', stationId: ids[0], fields: { pos: 'N', dx: 3 } });
  roundTrip(store, { type: 'station/place', positions: { [ids[3]]: { x: 10, y: 10 } } });
  const st = store.getState().stations;
  assert.equal(st[0].name, '本町');
  assert.deepEqual(st[0].schematic, { x: 1, y: -1 });
  assert.deepEqual(st[3].schematic, { x: 10, y: 10 });
  assert.equal(st[0].label.schematic.pos, 'N');
});
