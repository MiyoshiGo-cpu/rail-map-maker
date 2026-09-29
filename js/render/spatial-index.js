// 表示リストの当たり判定（格子ハッシュ）。座標は世界座標
// 優先度：駅 → 駅名 → 連絡線 → 区間。同じ優先度なら近いもの。

const PRIORITY = { station: 0, handle: 0, label: 1, interchange: 2, section: 3 };

/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Box */

/**
 * @param {any} item 表示リストの要素（bbox と target を持つもの）
 * @param {number} x @param {number} y
 * @returns {number} 点からの距離（中なら0）
 */
export function distanceTo(item, x, y) {
  if (item.kind === 'circle') return Math.max(0, Math.hypot(x - item.x, y - item.y) - item.r - (item.lineWidth || 0) / 2);
  if (item.kind === 'path') {
    let best = Infinity;
    const p = item.pts;
    for (let i = 0; i + 3 < p.length; i += 2) best = Math.min(best, distSeg(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]));
    return Math.max(0, best - item.width / 2);
  }
  if (item.kind === 'capsule') {
    return Math.max(0, distSeg(x, y, item.x1, item.y1, item.x2, item.y2) - item.r);
  }
  // それ以外は外接する四角で判定
  const b = item.bbox;
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dy = Math.max(b.minY - y, 0, y - b.maxY);
  return Math.hypot(dx, dy);
}

/** 点と線分の距離 */
export function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/**
 * @param {number} [cellSize] 世界座標の px
 */
export function createSpatialIndex(cellSize = 96) {
  /** @type {Map<string, any[]>} */
  const cells = new Map();

  function* cellsOf(b) {
    const x0 = Math.floor(b.minX / cellSize);
    const x1 = Math.floor(b.maxX / cellSize);
    const y0 = Math.floor(b.minY / cellSize);
    const y1 = Math.floor(b.maxY / cellSize);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) yield cx + ',' + cy;
  }

  return {
    /** @param {any} item */
    insert(item) {
      for (const k of cellsOf(item.bbox)) {
        let list = cells.get(k);
        if (!list) cells.set(k, (list = []));
        list.push(item);
      }
    },
    /**
     * 範囲に重なるかもしれない要素（重複なし）
     * @param {Box} b
     */
    query(b) {
      const seen = new Set();
      const out = [];
      for (const k of cellsOf(b)) {
        for (const it of cells.get(k) || []) {
          if (seen.has(it)) continue;
          seen.add(it);
          if (it.bbox.maxX < b.minX || it.bbox.minX > b.maxX || it.bbox.maxY < b.minY || it.bbox.minY > b.maxY) continue;
          out.push(it);
        }
      }
      return out;
    },
    /**
     * 点の近くで最も優先度の高い対象
     * @param {number} x @param {number} y @param {number} radius
     * @param {(target: any) => boolean} [filter]
     */
    hitTest(x, y, radius, filter) {
      let best = null;
      let bestScore = Infinity;
      for (const it of this.query({ minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius })) {
        if (!it.target || (filter && !filter(it.target))) continue;
        const d = distanceTo(it, x, y);
        if (d > radius) continue;
        const score = (PRIORITY[it.target.type] ?? 9) * 1e6 + d;
        if (score < bestScore) {
          bestScore = score;
          best = it;
        }
      }
      return best ? best.target : null;
    },
  };
}
