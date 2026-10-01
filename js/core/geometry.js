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

/**
 * 折れ線を間引く（Douglas–Peucker）。両端は残す
 * @param {Pt[]} pts
 * @param {number} tol 残す点の、線からの最小の離れ
 * @returns {Pt[]}
 */
export function simplifyPolyline(pts, tol) {
  const n = pts.length;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [0, n - 1];
  while (stack.length) {
    const b = stack.pop();
    const a = stack.pop();
    let best = -1;
    let bd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(pts[i], pts[a], pts[b]);
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push(a, best, best, b);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** @param {Pt} p @param {Pt} a @param {Pt} b */
function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * 角を削ってなめらかにする（Chaikin）。閉じていなければ両端は動かさない
 * @param {Pt[]} pts
 * @param {number} iterations
 * @param {boolean} [closed] 最後の点から最初の点に戻る輪（最初の点を最後に繰り返さない）
 * @returns {Pt[]}
 */
export function chaikin(pts, iterations, closed = false) {
  let cur = pts;
  for (let k = 0; k < iterations && cur.length > 2; k++) {
    const out = [];
    const n = cur.length;
    if (!closed) out.push(cur[0]);
    const m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % n];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!closed) out.push(cur[n - 1]);
    cur = out;
  }
  return cur;
}

/**
 * 点を順に通る曲線（求心型の Catmull–Rom）。区間ごとに、両端を含む点の列を返す
 * @param {Pt[]} pts 通る点（2つ以上）
 * @param {{ closed?: boolean, step?: number, maxSegments?: number }} [opt] closed は最後の点から最初の点に戻る輪。step は細かさの目安の長さ
 * @returns {Pt[][]} 区間 i は pts[i] から pts[i + 1]（輪なら最後は pts[n - 1] から pts[0]）
 */
export function catmullRomSpans(pts, opt = {}) {
  const n = pts.length;
  const closed = !!opt.closed && n >= 3;
  const step = opt.step || 1;
  const maxSeg = opt.maxSegments || 48;
  const at = (i) => {
    if (closed) return pts[((i % n) + n) % n];
    if (i < 0) return { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y };
    if (i >= n) return { x: 2 * pts[n - 1].x - pts[n - 2].x, y: 2 * pts[n - 1].y - pts[n - 2].y };
    return pts[i];
  };
  const spans = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (len < 1e-9) {
      spans.push([{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }]);
      continue;
    }
    // 点の間隔の平方根で媒介変数を進める（とがりや輪ができにくい）
    const knot = (a, b) => Math.max(1e-6, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    const segs = Math.max(2, Math.min(maxSeg, Math.ceil(len / step)));
    const out = [{ x: p1.x, y: p1.y }];
    for (let s = 1; s < segs; s++) {
      const t = t1 + ((t2 - t1) * s) / segs;
      const lerp = (a, b, ta, tb) => {
        const u = (t - ta) / (tb - ta);
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      };
      const a1 = lerp(p0, p1, t0, t1);
      const a2 = lerp(p1, p2, t1, t2);
      const a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, t0, t2);
      const b2 = lerp(a2, a3, t1, t3);
      out.push(lerp(b1, b2, t1, t2));
    }
    out.push({ x: p2.x, y: p2.y });
    spans.push(out);
  }
  return spans;
}
