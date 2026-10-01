import { test, assert } from './harness.js';
import { simplifyPolyline, chaikin, catmullRomSpans } from '../js/core/geometry.js';
import { lineCurves, computeGeoSections } from '../js/core/geo-lines.js';
import { riverClass, riverFeatures, regionBorders, waterOutlines } from '../js/core/terrain/features.js';
import { runTerrainJob } from '../js/core/terrain/jobs.js';
import { defaultTerrainParams } from '../js/core/terrain/generate.js';
import { newStore } from './helpers.js';

/** 駅を地理座標（km）に置いたストア。lines は駅の番号の並び */
function geoStore(points, lines, opt = {}) {
  const store = newStore();
  const ids = points.map((_, i) => store.dispatch({ type: 'station/add', x: i * 2, y: 0 }));
  const stationGeo = Object.fromEntries(ids.map((id, i) => [id, { x: points[i][0], y: points[i][1] }]));
  store.dispatch({ type: 'world/set', world: { mode: 'none' }, stationGeo });
  const lineIds = lines.map((l) => store.dispatch({ type: 'line/add', stationIds: l.map((i) => ids[i]) }));
  if (opt.loop) for (const lineId of lineIds) store.dispatch({ type: 'line/setLoop', lineId, isLoop: true });
  return { store, ids, lineIds };
}

const near = (a, b, eps = 1e-9) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

test('曲線：間引きは両端を残し、まっすぐな所の点を消す', () => {
  const pts = [{ x: 0, y: 0 }, { x: 1, y: 0.01 }, { x: 2, y: 0 }, { x: 3, y: 5 }];
  const s = simplifyPolyline(pts, 0.1);
  assert.deepEqual(s, [pts[0], pts[2], pts[3]]);
});

test('曲線：Chaikin は両端を動かさず、角を削る', () => {
  const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }];
  const s = chaikin(pts, 2);
  assert.ok(near(s[0], pts[0]) && near(s[s.length - 1], pts[2]));
  assert.ok(!s.some((p) => near(p, pts[1])), '角の点は残らない');
  const ring = chaikin([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], 1, true);
  assert.equal(ring.length, 8);
});

test('曲線：Catmull–Rom は通る点を必ず通り、区間の端どうしがつながる', () => {
  const pts = [{ x: 0, y: 0 }, { x: 3, y: 1 }, { x: 5, y: 4 }, { x: 9, y: 4 }];
  const spans = catmullRomSpans(pts, { step: 0.5 });
  assert.equal(spans.length, 3);
  spans.forEach((sp, i) => {
    assert.ok(near(sp[0], pts[i]));
    assert.ok(near(sp[sp.length - 1], pts[i + 1]));
    assert.ok(sp.length >= 3);
  });
  // 一直線に並んだ点なら、曲線も一直線
  const line = catmullRomSpans([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }], { step: 0.2 });
  for (const sp of line) for (const p of sp) assert.close(p.y, 0, 1e-9);
  // 輪は最後の点から最初の点へ戻る
  const ring = catmullRomSpans([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], { closed: true });
  assert.equal(ring.length, 4);
  assert.ok(near(ring[3][ring[3].length - 1], { x: 0, y: 0 }));
});

test('地理の線路：駅と経由点を通り、駅で折れない（前後の区間の向きがそろう）', () => {
  const { store, lineIds } = geoStore([[0, 0], [5, 2], [10, 0]], [[0, 1, 2]]);
  const p = store.getState();
  const line = p.lines.find((l) => l.id === lineIds[0]);
  const byId = new Map(p.stations.map((s) => [s.id, s]));
  const [c0, c1] = lineCurves(line, byId);
  assert.ok(near(c0.pts[0], { x: 0, y: 0 }) && near(c0.pts[c0.pts.length - 1], { x: 5, y: 2 }));
  assert.ok(near(c1.pts[0], { x: 5, y: 2 }) && near(c1.pts[c1.pts.length - 1], { x: 10, y: 0 }));
  // 真ん中の駅での向き：区間0の最後の向きと区間1の最初の向きがほぼ同じ
  const a = c0.pts[c0.pts.length - 2];
  const b = c1.pts[1];
  const d1 = Math.atan2(2 - a.y, 5 - a.x);
  const d2 = Math.atan2(b.y - 2, b.x - 5);
  assert.ok(Math.abs(d1 - d2) < 0.15, `${d1} と ${d2}`);
});

test('地理の線路：地理座標の無い駅にかかる区間は描かない。経由点も通る', () => {
  const { store, ids, lineIds } = geoStore([[0, 0], [5, 0], [10, 0], [15, 0]], [[0, 1, 2, 3]]);
  const p = store.getState();
  // 3番目の駅の地理座標を消し、最初の区間に経由点を入れた状態を作る
  const stations = p.stations.map((s) => (s.id === ids[2] ? { ...s, geo: null } : s));
  const l0 = p.lines.find((l) => l.id === lineIds[0]);
  const line = { ...l0, sections: l0.sections.map((x, i) => (i === 0 ? { ...x, geoVia: [{ x: 2.5, y: 3 }] } : x)) };
  const byId = new Map(stations.map((s) => [s.id, s]));
  const cs = lineCurves(line, byId);
  assert.ok(cs[0] && !cs[1] && !cs[2]);
  assert.ok(cs[0].pts.some((q) => near(q, { x: 2.5, y: 3 })), '経由点を通る');
});

test('地理の線路：環状線は輪の曲線にする', () => {
  const { store, lineIds } = geoStore([[0, 0], [6, 0], [6, 6], [0, 6]], [[0, 1, 2, 3]], { loop: true });
  const p = store.getState();
  const line = p.lines.find((l) => l.id === lineIds[0]);
  assert.ok(line.isLoop);
  const cs = lineCurves(line, new Map(p.stations.map((s) => [s.id, s])));
  assert.equal(cs.length, 4);
  assert.ok(near(cs[3].pts[cs[3].pts.length - 1], { x: 0, y: 0 }));
  // 角の駅でも折れずに外へふくらむ
  assert.ok(cs[0].pts.some((q) => q.y < -0.01));
});

test('地理の線路：同じ2駅を結ぶ路線は束にして、同じ曲線を使う', () => {
  const { store, lineIds } = geoStore([[0, 0], [5, 0], [10, 3], [10, -3]], [[0, 1, 2], [3, 1, 0]]);
  const secs = computeGeoSections(store.getState());
  const a = secs.get(`${lineIds[0]}:0`);
  const b = secs.get(`${lineIds[1]}:1`);
  assert.equal(a.slot.size, 2);
  assert.equal(b.slot.size, 2);
  // 向きは逆だが同じ形
  assert.deepEqual(b.pts, [...a.pts].reverse());
  assert.ok(a.slot.offset !== b.slot.offset || a.a !== b.a);
  assert.equal(secs.get(`${lineIds[0]}:1`).slot.size, 1);
});

test('川と県境：流量の段階、県境は違う県の陸の境目だけ', () => {
  assert.equal(riverClass(10, 10), 0);
  assert.equal(riverClass(25, 10), 1);
  assert.equal(riverClass(10000, 10), 4);
  // 左右に2つの県、右下は水
  const w = 8;
  const h = 6;
  const map = new Int8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) map[y * w + x] = x < 4 ? 0 : y >= 4 ? -1 : 1;
  const borders = regionBorders(map, w, h, 0.5);
  assert.equal(borders.length, 1);
  const b = borders[0];
  // x = 4 マス（2km）の縦の線で、水の所（y >= 4 マス）までは引かない
  for (let i = 0; i < b.length; i += 2) assert.close(b[i], 2, 1e-9);
  assert.close(Math.max(...b.filter((_, i) => i % 2 === 1)), 2, 1e-9);
  // 川：流量が増えると段階を分ける（つなぎ目は同じ点）
  const rivers = riverFeatures({ threshold: 10, rivers: [{ pts: [0.5, 0.5, 1.5, 0.5, 2.5, 0.5, 3.5, 0.5, 4.5, 0.5], flow: [10, 12, 30, 35, 40] }] }, 1);
  assert.equal(rivers.length, 2);
  assert.deepEqual([rivers[0].cls, rivers[1].cls], [0, 1]);
  assert.deepEqual(rivers[0].pts.slice(-2), rivers[1].pts.slice(0, 2));
});

test('地理ビューの下ごしらえ：画像の大きさ、川と県境ができる', () => {
  const params = { ...defaultTerrainParams(), size: 256 };
  const { world } = runTerrainJob({ kind: 'world', seed: 'geo-view', params, regionId: 'jp' });
  const base = runTerrainJob({ kind: 'analyze', world });
  assert.equal(base.kind, 'analyze');
  assert.equal(base.rgba.length, base.imageWidth * base.imageHeight * 4);
  assert.equal(base.imageWidth, base.width * 4, "小サイズは4倍の細かさ");
  assert.equal(base.elevation.length, base.width * base.height);
  assert.ok(base.rivers.length > 0, '川がある');
  if (world.regions.length > 1) assert.ok(base.borders.length > 0, '県境がある');
  const ext = base.width * base.cellKm;
  for (const r of base.rivers) for (const v of r.pts) assert.ok(v >= 0 && v <= ext);
});

test('海岸線と湖岸：四角い島は1つの輪、湖は島の中の輪、縁に接する陸は縁で切る', () => {
  const w = 20;
  const h = 20;
  const elev = new Int16Array(w * h).fill(-50);
  const water = new Uint8Array(w * h).fill(1);
  const filled = new Float32Array(w * h);
  for (let y = 4; y < 16; y++) {
    for (let x = 4; x < 16; x++) {
      elev[y * w + x] = 50;
      water[y * w + x] = 0;
      filled[y * w + x] = 50;
    }
  }
  // 湖（3×3、深さ10m）
  for (let y = 8; y < 11; y++) for (let x = 8; x < 11; x++) { elev[y * w + x] = 40; water[y * w + x] = 2; }
  for (let i = 0; i < w * h; i++) if (water[i] === 1) filled[i] = elev[i];
  const o = waterOutlines(elev, water, filled, w, h, 1);
  assert.equal(o.land.length, 1);
  assert.equal(o.lakes.length, 1);
  const xs = o.land[0].filter((_, i) => i % 2 === 0);
  // 標高 -50 と 50 のちょうど中間（マスの境目 x = 4）で切れる
  assert.close(Math.min(...xs), 4, 1e-6);
  assert.close(Math.max(...xs), 16, 1e-6);
  const lx = o.lakes[0].filter((_, i) => i % 2 === 0);
  assert.ok(Math.min(...lx) > 7 && Math.max(...lx) < 12);
  // 全部が陸なら、地図の縁で切れる輪が1つ
  const all = waterOutlines(new Int16Array(16).fill(10), new Uint8Array(16), new Float32Array(16).fill(10), 4, 4, 0.5);
  assert.equal(all.land.length, 1);
  const ax = all.land[0].filter((_, i) => i % 2 === 0);
  assert.close(Math.min(...ax), 0, 1e-6);
  assert.close(Math.max(...ax), 2, 1e-6);
  assert.equal(all.lakes.length, 0);
});
