// 幾何の小さな道具（世界座標。y は下向き）

/** @typedef {{ x: number, y: number }} Pt */

/**
 * 進む向きに対して右側の単位法線（画面は y が下向きなので (-dy, dx)）
 * @param {Pt} a @param {Pt} b
 * @returns {Pt}
 */
export function rightNormal(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/**
 * 頂点での曲がる向き：右に曲がれば +1、左なら -1、まっすぐなら 0
 * @param {Pt} a @param {Pt} b @param {Pt} c
 */
export function turnSign(a, b, c) {
  const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  if (Math.abs(cross) < 1e-9) return 0;
  return cross > 0 ? 1 : -1;
}

/**
 * 折れ線を右側へ d だけずらす（角は留め継ぎ）。d が負なら左
 * @param {Pt[]} pts
 * @param {number} d
 * @returns {Pt[]}
 */
export function offsetPolyline(pts, d) {
  if (!d || pts.length < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const n = pts.length;
  const normals = [];
  for (let i = 0; i < n - 1; i++) normals.push(rightNormal(pts[i], pts[i + 1]));
  const out = [];
  for (let i = 0; i < n; i++) {
    let m;
    if (i === 0) m = normals[0];
    else if (i === n - 1) m = normals[n - 2];
    else {
      const n1 = normals[i - 1];
      const n2 = normals[i];
      const den = 1 + n1.x * n2.x + n1.y * n2.y;
      // 折り返し（180°）に近いときは留め継ぎが伸びすぎるので後ろの法線だけ使う
      m = den < 0.1 ? n2 : { x: (n1.x + n2.x) / den, y: (n1.y + n2.y) / den };
    }
    out.push({ x: pts[i].x + m.x * d, y: pts[i].y + m.y * d });
  }
  return out;
}

/**
 * 点の集まりが一直線上に並んでいるか。並んでいれば両端を返す
 * @param {Pt[]} pts
 * @param {number} [eps]
 * @returns {{ a: Pt, b: Pt } | null}
 */
export function collinearExtent(pts, eps = 0.5) {
  if (pts.length === 0) return null;
  // 最も離れた2点を軸にする
  let a = pts[0];
  let b = pts[0];
  let best = -1;
  for (const p of pts) {
    for (const q of pts) {
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (d > best) {
        best = d;
        a = p;
        b = q;
      }
    }
  }
  const len = Math.sqrt(best);
  if (len < 1e-9) return { a, b: a };
  for (const p of pts) {
    const dist = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
    if (dist > eps) return null;
  }
  return { a, b };
}

/**
 * @param {Pt[]} pts
 */
export function boundsOf(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}
