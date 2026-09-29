import { test, assert } from './harness.js';
import { worldToScreen, screenToWorld, zoomAt, panBy, fitBounds, snapToGrid, stationBounds, clampZoom, GRID, MAX_ZOOM, MIN_ZOOM } from '../js/core/viewport.js';

const size = { width: 400, height: 300 };

test('表示：世界座標と画面座標の往復', () => {
  const v = { cx: 100, cy: -50, zoom: 2.5 };
  const s = worldToScreen(v, size, 130, -10);
  const w = screenToWorld(v, size, s.x, s.y);
  assert.close(w.x, 130, 1e-9);
  assert.close(w.y, -10, 1e-9);
  const c = worldToScreen(v, size, 100, -50);
  assert.deepEqual(c, { x: 200, y: 150 });
});

test('表示：ズームしても指の下の点は動かない', () => {
  const v = { cx: 10, cy: 20, zoom: 1 };
  const before = screenToWorld(v, size, 50, 260);
  const v2 = zoomAt(v, size, 50, 260, 1.7);
  const after = screenToWorld(v2, size, 50, 260);
  assert.close(after.x, before.x, 1e-9);
  assert.close(after.y, before.y, 1e-9);
  assert.close(v2.zoom, 1.7, 1e-12);
});

test('表示：倍率には上限と下限がある', () => {
  assert.equal(clampZoom(100), MAX_ZOOM);
  assert.equal(clampZoom(0.0001), MIN_ZOOM);
  const v = zoomAt({ cx: 0, cy: 0, zoom: MAX_ZOOM }, size, 0, 0, 2);
  assert.equal(v.zoom, MAX_ZOOM);
});

test('表示：パンは画面の動きと同じだけ動く', () => {
  const v = { cx: 0, cy: 0, zoom: 2 };
  const v2 = panBy(v, 40, -20);
  const s = worldToScreen(v2, size, 0, 0);
  assert.deepEqual(s, { x: 240, y: 130 });
});

test('全体表示：範囲が画面の中に収まる', () => {
  const b = { minX: -500, minY: 100, maxX: 700, maxY: 400 };
  const v = fitBounds(b, size, { padding: 20 });
  const a = worldToScreen(v, size, b.minX, b.minY);
  const c = worldToScreen(v, size, b.maxX, b.maxY);
  assert.ok(a.x >= 19.99 && a.y >= 19.99 && c.x <= 380.01 && c.y <= 280.01);
  assert.deepEqual(fitBounds(null, size), { cx: 0, cy: 0, zoom: 1 });
});

test('格子へのスナップと駅の範囲', () => {
  assert.deepEqual(snapToGrid(GRID * 2.4, -GRID * 0.6), { x: 2, y: -1 });
  const b = stationBounds([
    { schematic: { x: 1, y: 2 } },
    { schematic: null },
    { schematic: { x: -3, y: 5 } },
  ]);
  assert.deepEqual(b, { minX: -3 * GRID, minY: 2 * GRID, maxX: GRID, maxY: 5 * GRID });
  assert.equal(stationBounds([]), null);
});
