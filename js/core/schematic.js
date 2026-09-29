// 路線図の線の形（格子座標の点の列）をまとめて計算する。
// 同じ2駅を結ぶ区間は、曲がり方が auto で経由点がなければ、並び順（Line.order）が先の路線の形にそろえる
// （並走する線が同じ形になるように）。
import { sectionPath, dirOf } from './octilinear.js';
import { sectionCount } from './defaults.js';

/** @typedef {import('./octilinear.js').Pt} Pt */
/**
 * @typedef {object} SectionGeom
 * @property {string} lineId
 * @property {number} index 駅間の番号
 * @property {string} a 始点の駅 ID
 * @property {string} b 終点の駅 ID
 * @property {Pt[]} pts 格子座標の点の列（a から b へ）
 */

/**
 * @param {import('./schema.js').Project} p
 * @returns {Map<string, (SectionGeom | null)[]>} 路線 ID → 駅間ごとの形（駅の位置がなければ null）
 */
export function computeSchematicGeometry(p) {
  /** @type {Map<string, Pt>} */
  const pos = new Map();
  for (const s of p.stations) if (s.schematic) pos.set(s.id, s.schematic);

  /** 共有の形：`小さいID|大きいID` → 小さいID側から見た点の列 */
  const shared = new Map();
  const out = new Map();
  const lines = [...p.lines].sort((x, y) => x.order - y.order || (x.id < y.id ? -1 : 1));

  for (const line of lines) {
    const n = sectionCount(line);
    const len = line.stops.length;
    /** @type {(SectionGeom | null)[]} */
    const geoms = [];
    const pointsOf = (i) => {
      const a = pos.get(line.stops[i].stationId);
      const b = pos.get(line.stops[(i + 1) % len].stationId);
      if (!a || !b) return null;
      const via = (line.sections[i] && line.sections[i].schematicVia) || [];
      return [a, ...via, b];
    };
    // 環状線の最初の区間は、最後の区間から入ってくる向きを使う
    let prevDir = null;
    if (line.isLoop && n > 0) {
      const last = pointsOf(n - 1);
      if (last) prevDir = dirOf(last[last.length - 2], last[last.length - 1]);
    }
    for (let i = 0; i < n; i++) {
      const pts = pointsOf(i);
      if (!pts) {
        geoms.push(null);
        prevDir = null;
        continue;
      }
      const a = line.stops[i].stationId;
      const b = line.stops[(i + 1) % len].stationId;
      const sec = line.sections[i] || {};
      const bend = sec.schematicBend || 'auto';
      const plain = bend === 'auto' && pts.length === 2;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      let path;
      if (plain && shared.has(key)) {
        const s = shared.get(key);
        path = a < b ? s : [...s].reverse();
      } else {
        let outDir = null;
        if (i + 1 < n || line.isLoop) {
          const next = pointsOf((i + 1) % n);
          if (next) outDir = dirOf(next[0], next[1]);
        }
        path = sectionPath(pts, bend, prevDir, outDir);
        if (plain) shared.set(key, a < b ? path : [...path].reverse());
      }
      geoms.push({ lineId: line.id, index: i, a, b, pts: path });
      prevDir = dirOf(path[path.length - 2], path[path.length - 1]);
    }
    out.set(line.id, geoms);
  }
  return out;
}

/**
 * 経由点を1つ足す位置：いちばん長い区切りの中点（格子に丸める）
 * @param {{ x: number, y: number }[]} pts 始点・経由点…・終点
 * @returns {{ index: number, point: { x: number, y: number } } | null} index は経由点の配列に入れる位置
 */
export function nextViaPoint(pts) {
  let best = -1;
  let bestLen = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  if (best < 0 || bestLen < 2) return null;
  const a = pts[best];
  const b = pts[best + 1];
  return { index: best, point: { x: Math.round((a.x + b.x) / 2) + 0, y: Math.round((a.y + b.y) / 2) + 0 } };
}
