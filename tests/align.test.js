import { test, assert } from './harness.js';
import { alignHorizontal, alignVertical, alignDiagonal, distributeEvenly, hasCollision } from '../js/core/align.js';
import { storeWithLine } from './helpers.js';

const pts = [
  { id: 'a', x: 0, y: 1 },
  { id: 'b', x: 3, y: 2 },
  { id: 'c', x: 7, y: 4 },
];

test('整列：横一列は y を平均にそろえる', () => {
  const r = alignHorizontal(pts);
  assert.deepEqual(r, { a: { x: 0, y: 2 }, b: { x: 3, y: 2 }, c: { x: 7, y: 2 } });
});

test('整列：縦一列は x を平均にそろえる', () => {
  const r = alignVertical(pts);
  assert.deepEqual(r, { a: { x: 3, y: 1 }, b: { x: 3, y: 2 }, c: { x: 3, y: 4 } });
});

test('整列：斜め一列は 45° の直線に乗る（右下がり）', () => {
  const r = alignDiagonal(pts);
  for (const id of ['a', 'b', 'c']) assert.equal(r[id].y - r.a.y, r[id].x - r.a.x, id);
});

test('整列：斜め一列（右上がり）', () => {
  const r = alignDiagonal([{ id: 'a', x: 0, y: 5 }, { id: 'b', x: 2, y: 2 }, { id: 'c', x: 5, y: 1 }]);
  for (const id of ['a', 'b', 'c']) assert.equal(r[id].y - r.a.y + (r[id].x - r.a.x), 0, id);
});

test('整列：等間隔は両端を残して間を均等に', () => {
  const r = distributeEvenly([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }, { id: 'c', x: 8, y: 0 }, { id: 'd', x: 2, y: 0 }]);
  assert.deepEqual([r.a.x, r.b.x, r.d.x, r.c.x], [0, 3, 5, 8]);
});

test('整列：ほかの駅と重なるかどうか', () => {
  const stations = [
    { id: 'a', schematic: { x: 0, y: 0 } },
    { id: 'b', schematic: { x: 1, y: 0 } },
  ];
  assert.equal(hasCollision({ a: { x: 1, y: 0 } }, stations), true);
  assert.equal(hasCollision({ a: { x: 2, y: 0 } }, stations), false);
  assert.equal(hasCollision({ a: { x: 1, y: 0 }, b: { x: 2, y: 0 } }, stations), false);
});

test('駅の複製：ずらした位置に同じ項目の駅を作り、取り消せる', () => {
  const { store, ids } = storeWithLine();
  store.dispatch({ type: 'station/update', stationId: ids[0], fields: { name: '本町', rank: 'major' } });
  const copies = store.dispatch({ type: 'station/duplicate', ids: [ids[0]], dx: 1, dy: 1 });
  const st = store.getState().stations.find((s) => s.id === copies[0]);
  assert.equal(st.name, '本町');
  assert.deepEqual(st.schematic, { x: 1, y: 1 });
  store.undo();
  assert.equal(store.getState().stations.length, 4);
});
