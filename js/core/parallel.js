// 並走（§5.1）：同じ2駅を同じ形で結ぶ区間を束にし、Line.order の順に平行にずらす。
//
// ずらす向きは、束ごとに「最初にその区間を通った路線（並び順が先）」の進む向きを基準にする。
// こうすると、何駅も一緒に並走する路線どうしが途中で入れ替わらない。

/** @typedef {import('./schematic.js').SectionGeom} SectionGeom */

/**
 * @typedef {object} BundleSlot
 * @property {number} offset この区間を自分の進む向きで見たときの、右側へのずらし量（線の間隔を1とする）
 * @property {number} size 束の本数
 * @property {number} rank 束の中での順番（0 から）
 * @property {string} key 束の鍵
 */

/** @param {{ x: number, y: number }[]} pts */
function shapeString(pts) {
  return pts.map((p) => p.x + ',' + p.y).join(';');
}

/**
 * @param {import('./schema.js').Line[]} lines
 * @param {Map<string, (SectionGeom | null)[]>} geom computeSchematicGeometry の結果
 * @returns {Map<string, BundleSlot>} `${lineId}:${index}` → ずらし量
 */
export function computeBundles(lines, geom) {
  const sorted = [...lines].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
  /** 束の鍵 → { forward: 基準の向きの形の文字列, members: [{ line, index, forward }] } */
  const bundles = new Map();
  for (const line of sorted) {
    const gs = geom.get(line.id) || [];
    gs.forEach((g, index) => {
      if (!g) return;
      const f = shapeString(g.pts);
      const r = shapeString([...g.pts].reverse());
      const key = f < r ? f : r;
      let b = bundles.get(key);
      if (!b) {
        b = { forward: f, members: [] };
        bundles.set(key, b);
      }
      b.members.push({ lineId: line.id, index, forward: f === b.forward });
    });
  }
  /** @type {Map<string, BundleSlot>} */
  const out = new Map();
  for (const [key, b] of bundles) {
    const n = b.members.length;
    b.members.forEach((m, rank) => {
      const base = rank - (n - 1) / 2;
      out.set(`${m.lineId}:${m.index}`, { offset: m.forward ? base : -base, size: n, rank, key });
    });
  }
  return out;
}
