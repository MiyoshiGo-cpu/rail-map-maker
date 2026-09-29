import { test, assert } from './harness.js';
import { largestLandBounds, nearestLand, geoFromSchematic } from '../js/core/geo-layout.js';
import { analyzeHydrology, LAND } from '../js/core/terrain/hydrology.js';
import { generateWorld } from '../js/core/terrain/world.js';
import { defaultTerrainParams } from '../js/core/terrain/generate.js';
import { runTerrainJob } from '../js/core/terrain/jobs.js';
import { getRegion } from '../js/core/regions/index.js';
import { storeWithLine } from './helpers.js';

/** 海に囲まれた四角い島（1マス1km） */
function squareIsland(size = 40, from = 10, to = 30) {
  const elev = new Int16Array(size * size).fill(-50);
  for (let y = from; y < to; y++) for (let x = from; x < to; x++) elev[y * size + x] = 50;
  // 小さい島も1つ
  elev[2 * size + 2] = 30;
  const hydrology = analyzeHydrology(elev, size, size, { cellKm: 1, riverAmount: 0.5 });
  return { width: size, height: size, cellKm: 1, elevation: elev, hydrology, regionMap: new Int8Array(size * size) };
}

test('地理の配置：いちばん広い陸のまとまりの範囲', () => {
  const a = squareIsland();
  assert.deepEqual(largestLandBounds(a), { minX: 10, minY: 10, maxX: 29, maxY: 29 });
});

test('地理の配置：水の上の点は、いちばん近い陸のマスの中心へ移す', () => {
  const a = squareIsland();
  assert.deepEqual(nearestLand(a, { x: 15.2, y: 15.7 }), { x: 15.2, y: 15.7 }, '陸ならそのまま');
  const p = nearestLand(a, { x: 5.5, y: 20.5 });
  assert.deepEqual(p, { x: 10.5, y: 20.5 });
  assert.equal(a.hydrology.water[Math.floor(p.y) * 40 + Math.floor(p.x)], LAND);
});

test('地理の配置：路線図の配置を陸の中央7割に合わせ、並びの向きを保つ', () => {
  const a = squareIsland();
  const { store, ids } = storeWithLine([[0, 0], [4, 0], [8, 0], [8, 4]]);
  const geo = geoFromSchematic(store.getState().stations, a);
  assert.equal(geo.size, 4);
  const pts = ids.map((id) => geo.get(id));
  // 横に並んだ駅は同じ高さ、東へ行くほど x が大きい
  assert.equal(pts[0].y, pts[1].y);
  assert.ok(pts[0].x < pts[1].x && pts[1].x < pts[2].x);
  // 南（路線図の下）へ行くほど y が大きい
  assert.ok(pts[3].y > pts[2].y);
  // すべて陸の上、陸の範囲の中
  for (const p of pts) {
    assert.equal(a.hydrology.water[Math.floor(p.y) * 40 + Math.floor(p.x)], LAND);
    assert.ok(p.x >= 10 && p.x <= 30 && p.y >= 10 && p.y <= 30);
  }
  // 横幅は陸の7割（14km）
  assert.ok(Math.abs(pts[2].x - pts[0].x - 14) < 0.01, String(pts[2].x - pts[0].x));
});

test('地理の配置：生成した地形でも、すべての駅が陸の上に来る', () => {
  const { store } = storeWithLine([[0, 0], [3, 0], [6, 2], [9, 2], [12, 5], [15, 5]]);
  const params = { ...defaultTerrainParams(), size: 256 };
  const { analysis } = generateWorld('配置', params, getRegion('jp'), { resolution: 96 });
  const geo = geoFromSchematic(store.getState().stations, analysis);
  for (const p of geo.values()) {
    const c = Math.floor(p.y / analysis.cellKm) * analysis.width + Math.floor(p.x / analysis.cellKm);
    assert.equal(analysis.hydrology.water[c], LAND);
  }
});

test('地形を追加：Worker の仕事で世界と駅の地理座標を作り、アクションで入れる（取り消せる）', () => {
  const { store, ids } = storeWithLine([[0, 0], [4, 0], [8, 0]]);
  const p = store.getState();
  const r = runTerrainJob({
    kind: 'world',
    seed: 'add',
    params: { ...defaultTerrainParams(), size: 256 },
    regionId: 'jp',
    resolution: 64,
    stations: p.stations.map((s) => ({ id: s.id, schematic: s.schematic })),
  });
  assert.equal(r.kind, 'world');
  assert.equal(r.world.mode, 'fictional');
  assert.equal(Object.keys(r.stationGeo).length, 3);
  store.dispatch({ type: 'world/set', world: r.world, stationGeo: r.stationGeo });
  const after = store.getState();
  assert.equal(after.world.mode, 'fictional');
  for (const id of ids) assert.deepEqual(after.stations.find((s) => s.id === id).geo, r.stationGeo[id]);
  store.undo();
  assert.equal(store.getState().world.mode, 'none');
  assert.equal(store.getState().stations[0].geo, null);
});

test('プレビューの仕事：少ないマスの標高を返す', () => {
  const r = runTerrainJob({ kind: 'preview', seed: 'p', params: defaultTerrainParams(), resolution: 32 });
  assert.equal(r.kind, 'preview');
  assert.equal(r.width, 32);
  assert.equal(r.data.length, 32 * 32);
});
