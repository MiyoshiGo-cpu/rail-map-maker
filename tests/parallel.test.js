import { test, assert } from './harness.js';
import { computeBundles } from '../js/core/parallel.js';
import { computeSchematicGeometry } from '../js/core/schematic.js';
import { offsetPolyline, turnSign, collinearExtent, rightNormal } from '../js/core/geometry.js';
import { buildSchematicScene } from '../js/render/scene-schematic.js';
import { newStore } from './helpers.js';

/** A-B-C を通る路線2本（同じ向き） */
function twoLines() {
  const store = newStore();
  const a = store.dispatch({ type: 'station/add', x: 0, y: 0 });
  const b = store.dispatch({ type: 'station/add', x: 4, y: 0 });
  const c = store.dispatch({ type: 'station/add', x: 8, y: 2 });
  const l1 = store.dispatch({ type: 'line/add', stationIds: [a, b, c] });
  const l2 = store.dispatch({ type: 'line/add', stationIds: [a, b, c] });
  return { store, a, b, c, l1, l2 };
}

test('並走：同じ2駅を結ぶ区間は束になり、並び順で左右に分かれる', () => {
  const { store, l1, l2 } = twoLines();
  const p = store.getState();
  const b = computeBundles(p.lines, computeSchematicGeometry(p));
  assert.equal(b.get(`${l1}:0`).size, 2);
  assert.equal(b.get(`${l1}:0`).offset, -0.5);
  assert.equal(b.get(`${l2}:0`).offset, 0.5);
  assert.equal(b.get(`${l1}:1`).offset, -0.5);
  assert.equal(b.get(`${l2}:1`).offset, 0.5);
});

test('並走：並び順を入れ替えると左右が入れ替わる', () => {
  const { store, l1, l2 } = twoLines();
  store.dispatch({ type: 'line/reorder', lineIds: [l2, l1] });
  const p = store.getState();
  const b = computeBundles(p.lines, computeSchematicGeometry(p));
  assert.equal(b.get(`${l2}:0`).offset, -0.5);
  assert.equal(b.get(`${l1}:0`).offset, 0.5);
});

test('並走：逆向きに通る路線も同じ側に並ぶ（進む向きで見ると符号が反対）', () => {
  const store = newStore();
  const a = store.dispatch({ type: 'station/add', x: 0, y: 0 });
  const b = store.dispatch({ type: 'station/add', x: 4, y: 0 });
  const l1 = store.dispatch({ type: 'line/add', stationIds: [a, b] });
  const l2 = store.dispatch({ type: 'line/add', stationIds: [b, a] });
  const p = store.getState();
  const bs = computeBundles(p.lines, computeSchematicGeometry(p));
  // l1 は東向き・左（北）、l2 は西向き。北側でなく南側に来るには、西向きで見て左＝南 → offset は -(+0.5)
  assert.equal(bs.get(`${l1}:0`).offset, -0.5);
  assert.equal(bs.get(`${l2}:0`).offset, -0.5);
  // 実際の位置：l1 は y<0（北）、l2 は y>0（南）
  const scene = buildSchematicScene(p, { measure: () => 10 });
  const y1 = scene.sectionItems.get(`${l1}:0`).pts[1];
  const y2 = scene.sectionItems.get(`${l2}:0`).pts[1];
  assert.ok(y1 < 0 && y2 > 0, `${y1} ${y2}`);
});

test('並走：1本だけの区間はずらさない', () => {
  const store = newStore();
  const a = store.dispatch({ type: 'station/add', x: 0, y: 0 });
  const b = store.dispatch({ type: 'station/add', x: 4, y: 0 });
  const l1 = store.dispatch({ type: 'line/add', stationIds: [a, b] });
  const p = store.getState();
  const bs = computeBundles(p.lines, computeSchematicGeometry(p));
  assert.equal(bs.get(`${l1}:0`).offset, 0);
  assert.equal(bs.get(`${l1}:0`).size, 1);
});

test('並走：2本の線は、描いたときに線の間隔だけ離れて平行になる', () => {
  const { store, l1, l2 } = twoLines();
  const p = store.getState();
  const scene = buildSchematicScene(p, { measure: () => 10 });
  const s1 = scene.sectionItems.get(`${l1}:1`).pts;
  const s2 = scene.sectionItems.get(`${l2}:1`).pts;
  const spacing = p.style.lineWidth + p.style.lineGap;
  // 最初の線分どうしの距離
  const n = rightNormal({ x: s1[0], y: s1[1] }, { x: s1[2], y: s1[3] });
  const dist = (s2[0] - s1[0]) * n.x + (s2[1] - s1[1]) * n.y;
  assert.close(dist, spacing, 1e-6);
});

test('共通の駅はカプセル形になる', () => {
  const { store, b } = twoLines();
  const scene = buildSchematicScene(store.getState(), { measure: () => 10 });
  assert.equal(scene.stationItems.get(b).kind, 'capsule');
});

test('幾何：折れ線を平行にずらす（留め継ぎ）と曲がる向き', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const o = offsetPolyline(pts, 2);
  // 東向きの右は南（y が増える）
  assert.deepEqual(o[0], { x: 0, y: 2 });
  assert.close(o[1].x, 8, 1e-9);
  assert.close(o[1].y, 2, 1e-9);
  assert.equal(turnSign(pts[0], pts[1], pts[2]), 1);
  assert.equal(turnSign(pts[2], pts[1], pts[0]), -1);
  assert.equal(turnSign({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }), 0);
});

test('幾何：一直線に並んだ点の両端', () => {
  const e = collinearExtent([{ x: 0, y: 1 }, { x: 0, y: -3 }, { x: 0, y: 5 }]);
  assert.deepEqual([e.a.y, e.b.y].sort((a, b) => a - b), [-3, 5]);
  assert.equal(collinearExtent([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 2, y: 3 }]), null);
});

test('乗換グループ：離れた2駅は連絡線で結ばれ、3駅なら2本。連絡線を描かない設定もある', () => {
  const store = newStore();
  const a = store.dispatch({ type: 'station/add', x: 0, y: 0 });
  const b = store.dispatch({ type: 'station/add', x: 3, y: 0 });
  const c = store.dispatch({ type: 'station/add', x: 3, y: 4 });
  const count = () => buildSchematicScene(store.getState(), { measure: () => 10 }).items
    .filter((it) => it.target && it.target.type === 'interchange').length;
  const ic = store.dispatch({ type: 'interchange/add', stationIds: [a, b] });
  assert.equal(count(), 1);
  store.dispatch({ type: 'interchange/add', stationIds: [b, c] });
  assert.equal(count(), 2);
  store.dispatch({ type: 'interchange/update', interchangeId: ic, fields: { showConnector: false } });
  assert.equal(count(), 0);
});
