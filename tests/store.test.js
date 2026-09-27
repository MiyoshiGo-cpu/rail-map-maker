import { test, assert } from './harness.js';
import { applyOp, applyOps, createTx } from '../js/core/patch.js';
import { createStore } from '../js/core/store.js';
import { deepFreeze, newStore, strip, storeWithLine } from './helpers.js';

test('パッチ：set・insert・remove と逆操作で元に戻る', () => {
  const s0 = deepFreeze({ a: { b: 1 }, list: [1, 2, 3] });
  const tx = createTx(s0);
  tx.set(['a', 'b'], 2);
  tx.set(['a', 'c'], 'x');
  tx.insert(['list'], 1, 9);
  tx.remove(['list'], 0);
  tx.set(['a', 'c'], undefined);
  assert.deepEqual(tx.state, { a: { b: 2 }, list: [9, 2, 3] });
  assert.deepEqual(applyOps(tx.state, [...tx.inverse].reverse()), s0);
  assert.deepEqual(applyOps(s0, tx.ops), tx.state);
});

test('パッチ：変わっていない部分は同じオブジェクトを使う', () => {
  const s0 = deepFreeze({ a: { x: 1 }, b: { y: 2 } });
  const [s1] = applyOp(s0, { op: 'set', path: ['a', 'x'], value: 5 });
  assert.ok(s1.b === s0.b);
  assert.ok(s1.a !== s0.a);
});

test('Undo/Redo：アクション単位で戻せて、やり直せる', () => {
  const store = newStore();
  const p0 = store.getState();
  const id = store.dispatch({ type: 'station/add', x: 1, y: 2 });
  const p1 = store.getState();
  store.dispatch({ type: 'station/update', stationId: id, fields: { name: '中央' } });
  const p2 = store.getState();
  assert.ok(store.undo());
  assert.deepEqual(strip(store.getState()), strip(p1));
  assert.ok(store.undo());
  assert.deepEqual(strip(store.getState()), strip(p0));
  assert.equal(store.undo(), false);
  assert.ok(store.redo());
  assert.ok(store.redo());
  assert.deepEqual(strip(store.getState()), strip(p2));
  assert.equal(store.redo(), false);
});

test('Undo/Redo：新しい操作をするとやり直しは消える', () => {
  const store = newStore();
  store.dispatch({ type: 'station/add', x: 0, y: 0 });
  store.undo();
  assert.ok(store.canRedo());
  store.dispatch({ type: 'station/add', x: 1, y: 0 });
  assert.equal(store.canRedo(), false);
});

test('Undo/Redo：履歴は最大200手', () => {
  const store = newStore();
  for (let i = 0; i < 205; i++) store.dispatch({ type: 'station/add', x: i, y: 0 });
  assert.equal(store.historySize().undo, 200);
  let n = 0;
  while (store.undo()) n++;
  assert.equal(n, 200);
  assert.equal(store.getState().stations.length, 5);
});

test('表示位置の変更は履歴に入らない（silent）', () => {
  const store = newStore();
  store.dispatch({ type: 'project/view', view: 'schematic', state: { cx: 10, cy: 5, zoom: 2 }, silent: true });
  assert.equal(store.canUndo(), false);
  assert.equal(store.getState().view.schematic.zoom, 2);
});

test('silent のアクションが view・meta 以外を触るとエラー', () => {
  const store = newStore();
  assert.throws(() => store.dispatch({ type: 'station/add', x: 0, y: 0, silent: true }), /silent/);
});

test('プレビュー：確定するまで履歴に入らず、取り消せる', () => {
  const { store, ids } = storeWithLine();
  const before = store.getState();
  store.preview({ type: 'station/move', ids: [ids[0]], dx: 0, dy: 3 });
  assert.equal(store.getState().stations[0].schematic.y, 3);
  assert.equal(store.getCommittedState(), before);
  store.cancelPreview();
  assert.equal(store.getState(), before);
  store.preview({ type: 'station/move', ids: [ids[0]], dx: 0, dy: 3 });
  store.dispatch({ type: 'station/move', ids: [ids[0]], dx: 0, dy: 3 });
  assert.equal(store.getState().stations[0].schematic.y, 3);
  store.undo();
  assert.equal(store.getState().stations[0].schematic.y, 0);
});

test('変化のないアクションは履歴に入らない', () => {
  const store = newStore();
  store.dispatch({ type: 'station/move', ids: [], dx: 0, dy: 0 });
  assert.equal(store.canUndo(), false);
});

test('購読：変更のたびに通知される', () => {
  const store = createStore({ n: 0 }, { reducers: { inc: (tx) => tx.set(['n'], tx.state.n + 1) }, touchKey: null });
  const kinds = [];
  store.subscribe((s, info) => kinds.push(info.kind + ':' + s.n));
  store.dispatch({ type: 'inc' });
  store.undo();
  store.redo();
  assert.deepEqual(kinds, ['do:1', 'undo:0', 'redo:1']);
});
