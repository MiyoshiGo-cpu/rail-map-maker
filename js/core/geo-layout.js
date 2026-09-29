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
