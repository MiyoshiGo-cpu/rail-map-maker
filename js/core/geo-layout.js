// 路線図と地理の位置の対応（§7 フェーズ4「地形を追加」）。
// 路線図だけのプロジェクトに地形を付けるときは、路線図の配置を陸地（いちばん広い陸のまとまり）の中央7割に合わせて
// 地理座標を仮に作り、水の上に来た駅は近い陸へ移す。地理座標は km（y は下向き＝南）。
import { LAND } from './terrain/hydrology.js';

/** @typedef {import('./terrain/world.js').WorldAnalysis} WorldAnalysis */
/** @typedef {{ x: number, y: number }} Pt */

/**
 * いちばん広い陸のまとまりの範囲（マス）
 * @param {WorldAnalysis} a
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
 */
export function largestLandBounds(a) {
  const { width, height } = a;
  const water = a.hydrology.water;
  const seen = new Uint8Array(width * height);
  let best = null;
  let bestCount = 0;
  for (let i = 0; i < width * height; i++) {
    if (seen[i] || water[i] !== LAND) continue;
    const st = [i];
    seen[i] = 1;
    let count = 0;
    const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    while (st.length) {
      const c = st.pop();
      count++;
      const x = c % width;
      const y = (c - x) / width;
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y;
      if (y > b.maxY) b.maxY = y;
      if (x > 0 && !seen[c - 1] && water[c - 1] === LAND) { seen[c - 1] = 1; st.push(c - 1); }
      if (x < width - 1 && !seen[c + 1] && water[c + 1] === LAND) { seen[c + 1] = 1; st.push(c + 1); }
      if (y > 0 && !seen[c - width] && water[c - width] === LAND) { seen[c - width] = 1; st.push(c - width); }
      if (y < height - 1 && !seen[c + width] && water[c + width] === LAND) { seen[c + width] = 1; st.push(c + width); }
    }
    if (count > bestCount) {
      bestCount = count;
      best = b;
    }
  }
  return best;
}

/**
 * いちばん近い陸のマスの中心（km）。すでに陸ならそのまま
 * @param {WorldAnalysis} a
 * @param {Pt} p km
 * @returns {Pt}
 */
export function nearestLand(a, p) {
  const { width, height, cellKm } = a;
  const water = a.hydrology.water;
  const cx = Math.min(width - 1, Math.max(0, Math.floor(p.x / cellKm)));
  const cy = Math.min(height - 1, Math.max(0, Math.floor(p.y / cellKm)));
  if (water[cy * width + cx] === LAND) return p;
  // 近い順に四角の輪を広げて探す
  for (let r = 1; r < Math.max(width, height); r++) {
    let best = null;
    let bd = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= width || y >= height || water[y * width + x] !== LAND) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { x, y }; }
      }
    }
    if (best) return { x: round2((best.x + 0.5) * cellKm), y: round2((best.y + 0.5) * cellKm) };
  }
  return p;
}

const round2 = (v) => Math.round(v * 100) / 100 + 0;

/**
 * 路線図の配置から地理座標を仮に作る
 * @param {import('./schema.js').Station[]} stations
 * @param {WorldAnalysis} a
 * @returns {Map<string, Pt>} 駅 ID → 地理座標（km）
 */
export function geoFromSchematic(stations, a) {
  const out = new Map();
  const placed = stations.filter((s) => s.schematic);
  const land = largestLandBounds(a);
  if (!placed.length || !land) return out;
  const { cellKm } = a;
  // 陸の範囲の中央7割（km）
  const lw = (land.maxX - land.minX + 1) * cellKm;
  const lh = (land.maxY - land.minY + 1) * cellKm;
  const lcx = (land.minX + land.maxX + 1) / 2 * cellKm;
  const lcy = (land.minY + land.maxY + 1) / 2 * cellKm;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of placed) {
    minX = Math.min(minX, s.schematic.x);
    maxX = Math.max(maxX, s.schematic.x);
    minY = Math.min(minY, s.schematic.y);
    maxY = Math.max(maxY, s.schematic.y);
  }
  const sw = maxX - minX;
  const sh = maxY - minY;
  // 縦横の比を保って、はみ出さない方に合わせる（1マスは 0.3〜3km の間）
  let k = Math.min(sw ? (lw * 0.7) / sw : Infinity, sh ? (lh * 0.7) / sh : Infinity);
  if (!Number.isFinite(k)) k = 1;
  k = Math.min(3, Math.max(0.3, k));
  const scx = (minX + maxX) / 2;
  const scy = (minY + maxY) / 2;
  for (const s of placed) {
    const p = { x: round2(lcx + (s.schematic.x - scx) * k), y: round2(lcy + (s.schematic.y - scy) * k) };
    out.set(s.id, nearestLand(a, p));
  }
  return out;
}

// ---------- 片方のビューで置いた駅を、もう片方のビューに仮置きする（§7 フェーズ4） ----------

/** 対応が無いときの 1マスの長さ（km） */
const DEFAULT_KM_PER_CELL = 1;
/** 近くの駅のずれを足すときの、ずれを 0 とみなす重み（遠い所はずれを足さない） */
const NEAR_COUNT = 4;

/**
 * 路線図と地理の両方に位置がある駅の組
 * @param {import('./schema.js').Station[]} stations
 * @returns {{ s: Pt, g: Pt }[]}
 */
function pairsOf(stations) {
  const out = [];
  for (const st of stations) {
    if (st.schematic && st.geo && 'x' in st.geo) out.push({ s: st.schematic, g: { x: st.geo.x, y: st.geo.y } });
  }
  return out;
}

/**
 * 対応のある点の組から、a → b の拡大と平行移動（最小二乗）を求め、近くの組のずれを距離で重みづけして足す
 * @param {{ a: Pt, b: Pt }[]} list
 * @param {Pt} q a の側の点
 * @param {number} defaultScale 組が1つ以下のときの拡大率
 * @param {number} nearScale ずれを足す範囲の目安（a の側の長さ）
 * @returns {Pt | null} 組が無ければ null
 */
function fitAndMap(list, q, defaultScale, nearScale) {
  const n = list.length;
  if (!n) return null;
  let ax = 0;
  let ay = 0;
  let bx = 0;
  let by = 0;
  for (const { a, b } of list) {
    ax += a.x; ay += a.y; bx += b.x; by += b.y;
  }
  ax /= n; ay /= n; bx /= n; by /= n;
  let num = 0;
  let den = 0;
  for (const { a, b } of list) {
    num += (a.x - ax) * (b.x - bx) + (a.y - ay) * (b.y - by);
    den += (a.x - ax) ** 2 + (a.y - ay) ** 2;
  }
  let k = den > 1e-9 ? num / den : defaultScale;
  if (!(k > 0)) k = defaultScale;
  const map = (p) => ({ x: bx + (p.x - ax) * k, y: by + (p.y - ay) * k });
  // 近い組のずれ（全体の対応から外れた分）を、距離の2乗の逆数で重みづけして足す
  const near = list
    .map((pr) => ({ pr, d2: (pr.a.x - q.x) ** 2 + (pr.a.y - q.y) ** 2 }))
    .sort((x, y) => x.d2 - y.d2)
    .slice(0, NEAR_COUNT);
  const base = map(q);
  let wx = 0;
  let wy = 0;
  let ws = 1 / (nearScale * nearScale);
  for (const { pr, d2 } of near) {
    const w = 1 / (d2 + 1e-6 * nearScale * nearScale);
    const m = map(pr.a);
    wx += (pr.b.x - m.x) * w;
    wy += (pr.b.y - m.y) * w;
    ws += w;
  }
  return { x: base.x + wx / ws, y: base.y + wy / ws };
}

const round3 = (v) => Math.round(v * 1000) / 1000 + 0;

/**
 * 路線図の格子点に置いた駅の、地理の仮の位置（km）
 * @param {import('./schema.js').Station[]} stations 今ある駅
 * @param {Pt} s 路線図の格子座標
 * @param {Pt} fallback 対応のある駅が無いときの位置（地形の中央など）
 * @returns {Pt}
 */
export function estimateGeo(stations, s, fallback) {
  const list = pairsOf(stations).map((x) => ({ a: x.s, b: x.g }));
  const g = fitAndMap(list, s, DEFAULT_KM_PER_CELL, 6);
  const p = g || fallback;
  return { x: round3(p.x), y: round3(p.y) };
}

/**
 * 地理に置いた駅の、路線図の仮の位置（格子座標。まだ丸めない）
 * @param {import('./schema.js').Station[]} stations
 * @param {Pt} g 地理座標（km）
 * @returns {Pt}
 */
export function estimateSchematic(stations, g) {
  const list = pairsOf(stations).map((x) => ({ a: x.g, b: x.s }));
  return fitAndMap(list, g, 1 / DEFAULT_KM_PER_CELL, 6 * DEFAULT_KM_PER_CELL) || { x: 0, y: 0 };
}

/**
 * 近くの空いた格子点（ほかの駅が使っていない点）。近い順に四角の輪を広げて探す
 * @param {import('./schema.js').Station[]} stations
 * @param {Pt} s 格子座標（丸める前でもよい）
 * @returns {Pt}
 */
export function freeGridPoint(stations, s) {
  const used = new Set();
  for (const st of stations) if (st.schematic) used.add(st.schematic.x + ',' + st.schematic.y);
  const cx = Math.round(s.x) + 0;
  const cy = Math.round(s.y) + 0;
  for (let r = 0; r < 64; r++) {
    let best = null;
    let bd = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = cx + dx + 0;
        const y = cy + dy + 0;
        if (used.has(x + ',' + y)) continue;
        const d = (x - s.x) ** 2 + (y - s.y) ** 2;
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
    }
    if (best) return best;
  }
  return { x: cx, y: cy };
}
