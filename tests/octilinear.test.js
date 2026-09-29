import { test, assert } from './harness.js';
import { connect, sectionPath, dirOf, turn, chooseBend, isOctilinear, simplify } from '../js/core/octilinear.js';
import { computeSchematicGeometry } from '../js/core/schematic.js';
import { createRng } from '../js/core/rng.js';
import { storeWithLine, newStore } from './helpers.js';

/** 生成した線の角度が 0・45・90° の倍数だけか */
function assertOctilinear(pts, msg) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    assert.ok(dx !== 0 || dy !== 0, `${msg}：同じ点が続いている`);
    assert.ok(isOctilinear(dx, dy), `${msg}：(${dx}, ${dy}) は八方向でない`);
  }
}

test('八方向：直線で結べるときは2点のまま', () => {
  assert.deepEqual(connect({ x: 0, y: 0 }, { x: 5, y: 0 }, 'diagonalFirst'), [{ x: 0, y: 0 }, { x: 5, y: 0 }]);
  assert.deepEqual(connect({ x: 0, y: 0 }, { x: 0, y: -3 }, 'straightFirst').length, 2);
  assert.deepEqual(connect({ x: 0, y: 0 }, { x: -4, y: 4 }, 'straightFirst').length, 2);
});

test('八方向：斜め→直線と直線→斜め', () => {
  assert.deepEqual(connect({ x: 0, y: 0 }, { x: 5, y: 2 }, 'diagonalFirst'), [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 5, y: 2 }]);
  assert.deepEqual(connect({ x: 0, y: 0 }, { x: 5, y: 2 }, 'straightFirst'), [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 5, y: 2 }]);
  assert.deepEqual(connect({ x: 0, y: 0 }, { x: -1, y: -4 }, 'diagonalFirst'), [{ x: 0, y: 0 }, { x: -1, y: -1 }, { x: -1, y: -4 }]);
});

test('八方向：乱数で作った点どうしを結んでも、角度は45°の倍数だけ', () => {
  const rng = createRng('octilinear');
  for (let k = 0; k < 500; k++) {
    const pts = [];
    const n = 2 + rng.int(0, 3);
    for (let i = 0; i < n; i++) pts.push({ x: rng.int(-20, 20), y: rng.int(-20, 20) });
    const bend = rng.pick(['auto', 'diagonalFirst', 'straightFirst']);
    const path = simplify(sectionPath(pts, bend, rng.pick([null, 0, 3, 6]), rng.pick([null, 1, 4])));
    if (path.length < 2) continue;
    assertOctilinear(path, `#${k}`);
  }
});

test('向きと曲がりの大きさ', () => {
  assert.equal(dirOf({ x: 0, y: 0 }, { x: 1, y: 0 }), 0);
  assert.equal(dirOf({ x: 0, y: 0 }, { x: 1, y: 1 }), 1);
  assert.equal(dirOf({ x: 0, y: 0 }, { x: 0, y: -1 }), 6);
  assert.equal(dirOf({ x: 0, y: 0 }, { x: 0, y: 0 }), null);
  assert.equal(turn(0, 4), 4);
  assert.equal(turn(7, 1), 2);
  assert.equal(turn(null, 3), 0);
});

test('auto：前後の区間との角度の変化が小さい方を選ぶ', () => {
  // 東から入ってきて (3,1) 先へ：直線→斜めなら入口で曲がらない
  assert.equal(chooseBend({ x: 0, y: 0 }, { x: 3, y: 1 }, 0, null), 'straightFirst');
  // 南東から入ってきたら斜め→直線
  assert.equal(chooseBend({ x: 0, y: 0 }, { x: 3, y: 1 }, 1, null), 'diagonalFirst');
  // 出口が東なら、最後が東になる斜め→直線
  assert.equal(chooseBend({ x: 0, y: 0 }, { x: 3, y: 1 }, null, 0), 'diagonalFirst');
});

test('経由点がある区間は、経由点ごとに八方向で結ぶ', () => {
  const path = sectionPath([{ x: 0, y: 0 }, { x: 3, y: 3 }, { x: 8, y: 4 }], 'straightFirst');
  assert.deepEqual(path[0], { x: 0, y: 0 });
  assert.deepEqual(path[path.length - 1], { x: 8, y: 4 });
  assert.ok(path.some((q) => q.x === 3 && q.y === 3));
  assertOctilinear(path, '経由点');
});

test('路線の形：駅の位置から全区間の形を作る。環状線は駅の数だけ区間がある', () => {
  const { store, lineId } = storeWithLine([[0, 0], [4, 1], [8, 1], [9, 5]]);
  store.dispatch({ type: 'line/setLoop', lineId, isLoop: true });
  const g = computeSchematicGeometry(store.getState()).get(lineId);
  assert.equal(g.length, 4);
  for (const sec of g) assertOctilinear(sec.pts, sec.index);
  assert.deepEqual(g[3].pts[g[3].pts.length - 1], { x: 0, y: 0 });
});

test('路線の形：同じ2駅を結ぶ auto の区間は、並び順が先の路線の形にそろう', () => {
  const store = newStore();
  const a = store.dispatch({ type: 'station/add', x: 0, y: 0 });
  const b = store.dispatch({ type: 'station/add', x: 5, y: 2 });
  const c = store.dispatch({ type: 'station/add', x: 5, y: 8 });
  const l1 = store.dispatch({ type: 'line/add', stationIds: [a, b] });
  // 2本目は逆向きで、先に別の向きから入ってくる
  const l2 = store.dispatch({ type: 'line/add', stationIds: [c, b, a] });
  const g = computeSchematicGeometry(store.getState());
  const p1 = g.get(l1)[0].pts;
  const p2 = [...g.get(l2)[1].pts].reverse();
  assert.deepEqual(p2, p1);
});
