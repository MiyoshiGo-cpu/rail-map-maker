// 複数の駅の整列（§4.4）：横一列・縦一列・斜め一列・等間隔。
// どれも新しい位置 { [id]: { x, y } } を返すだけで、データは変えない。

/** @typedef {{ id: string, x: number, y: number }} P */

/**
 * 横一列：y を平均（四捨五入）にそろえる
 * @param {P[]} pts
 */
export function alignHorizontal(pts) {
  const y = Math.round(pts.reduce((s, p) => s + p.y, 0) / pts.length) + 0;
  return Object.fromEntries(pts.map((p) => [p.id, { x: p.x, y }]));
}

/**
 * 縦一列：x を平均にそろえる
 * @param {P[]} pts
 */
export function alignVertical(pts) {
  const x = Math.round(pts.reduce((s, p) => s + p.x, 0) / pts.length) + 0;
  return Object.fromEntries(pts.map((p) => [p.id, { x, y: p.y }]));
}

/**
 * 斜め一列：45°の直線に乗せる。向き（＼か／）は点の並びから選び、
 * 左端の駅を通る直線にそろえる（x はそのまま、y を動かす）
 * @param {P[]} pts
 */
export function alignDiagonal(pts) {
  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const first = sorted[0];
  // 右へ行くほど下がるか上がるか
  let cov = 0;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  for (const p of pts) cov += (p.x - mx) * (p.y - my);
  const slope = cov < 0 ? -1 : 1;
  return Object.fromEntries(pts.map((p) => [p.id, { x: p.x, y: first.y + slope * (p.x - first.x) + 0 }]));
}

/**
 * 等間隔：両端はそのままにして、あいだの駅を等しい間隔に並べ直す。
 * 並べる向きは、広がりの大きい方（横か縦）。斜めに並んでいればその斜めの向き
 * @param {P[]} pts
 */
export function distributeEvenly(pts) {
  if (pts.length < 3) return Object.fromEntries(pts.map((p) => [p.id, { x: p.x, y: p.y }]));
  const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  const h = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
  const byX = w >= h;
  const sorted = [...pts].sort((a, b) => (byX ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x));
  const a = sorted[0];
  const b = sorted[sorted.length - 1];
  const n = sorted.length - 1;
  const out = {};
  sorted.forEach((p, i) => {
    out[p.id] = {
      x: Math.round(a.x + ((b.x - a.x) * i) / n) + 0,
      y: Math.round(a.y + ((b.y - a.y) * i) / n) + 0,
    };
  });
  return out;
}

/**
 * 新しい位置が、ほかの駅や互いと重ならないか
 * @param {{ [id: string]: { x: number, y: number } }} positions
 * @param {import('./schema.js').Station[]} stations
 */
export function hasCollision(positions, stations) {
  const occupied = new Set();
  for (const s of stations) {
    if (!s.schematic) continue;
    const p = positions[s.id] || s.schematic;
    const k = p.x + ',' + p.y;
    if (occupied.has(k)) return true;
    occupied.add(k);
  }
  return false;
}
