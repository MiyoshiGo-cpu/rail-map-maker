// 地理ビューに線で描く地物（§5.4）：川・県境・海岸線と湖岸。マスの並びから、なめらかな線（km）にする。
// 川は流量で太さの段階を分け、段階ごとに切った線をなめらかにする（つなぎ目は同じ点）。
// 県境は、違う県の陸のマスどうしの境目（マスの辺）をつないだ線。水の中には引かない。
// 海岸線と湖岸は、標高（湖は埋めた深さ）を補間して 0 になる所を輪にする（マーチングスクエア）。
import { simplifyPolyline, chaikin } from '../geometry.js';
import { SEA, LAKE } from './hydrology.js';

/** @typedef {{ x: number, y: number }} Pt */

/** 川の太さの段階の数（流量がしきい値の 1・2・4・8・16倍以上） */
export const RIVER_CLASSES = 5;

/**
 * 流量から太さの段階（0〜RIVER_CLASSES - 1）
 * @param {number} flow
 * @param {number} threshold 川にする流量
 */
export function riverClass(flow, threshold) {
  const r = flow / threshold;
  let c = 0;
  while (c < RIVER_CLASSES - 1 && r >= 2 ** (c + 1)) c++;
  return c;
}

/**
 * 点の列（マス）を間引いてなめらかにし、km にして平らな配列で返す
 * @param {Pt[]} pts マスの座標
 * @param {number} cellKm
 * @param {number} tol 間引きの許容（マス）
 * @param {boolean} closed
 */
function smoothToKm(pts, cellKm, tol, closed) {
  let s = simplifyPolyline(pts, tol);
  if (closed && s.length > 3) s = s.slice(0, -1);
  s = chaikin(s, 2, closed);
  const out = [];
  for (const p of s) out.push(Math.round(p.x * cellKm * 1000) / 1000, Math.round(p.y * cellKm * 1000) / 1000);
  if (closed && s.length) out.push(out[0], out[1]);
  return out;
}

/**
 * 川の線
 * @param {{ rivers: Array<{ pts: number[], flow: number[] }>, threshold: number }} hydrology
 * @param {number} cellKm
 * @returns {Array<{ pts: number[], cls: number, flow: number }>} pts は km の x, y の並び。flow はその線の中の最大の流量
 */
export function riverFeatures(hydrology, cellKm) {
  const out = [];
  for (const r of hydrology.rivers) {
    const n = r.flow.length;
    let from = 0;
    while (from < n - 1) {
      const cls = riverClass(r.flow[from], hydrology.threshold);
      let to = from + 1;
      while (to < n - 1 && riverClass(r.flow[to], hydrology.threshold) === cls) to++;
      const pts = [];
      for (let i = from; i <= to; i++) pts.push({ x: r.pts[2 * i], y: r.pts[2 * i + 1] });
      out.push({ pts: smoothToKm(pts, cellKm, 0.35, false), cls, flow: r.flow[to] });
      from = to;
    }
  }
  return out;
}

/**
 * 県境の線
 * @param {Int8Array} regionMap マスごとの県の番号（水は -1）
 * @param {number} width
 * @param {number} height
 * @param {number} cellKm
 * @returns {number[][]} それぞれ km の x, y の並び
 */
export function regionBorders(regionMap, width, height, cellKm) {
  const W = width + 1;
  /** マスの角（頂点）→ つながる角 */
  const adj = new Map();
  const link = (a, b) => {
    let la = adj.get(a);
    if (!la) adj.set(a, (la = []));
    la.push(b);
    let lb = adj.get(b);
    if (!lb) adj.set(b, (lb = []));
    lb.push(a);
  };
  const differ = (i, j) => regionMap[i] >= 0 && regionMap[j] >= 0 && regionMap[i] !== regionMap[j];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      // 左のマスとの境目は縦の辺、上のマスとの境目は横の辺
      if (x > 0 && differ(i, i - 1)) link(y * W + x, (y + 1) * W + x);
      if (y > 0 && differ(i, i - width)) link(y * W + x, y * W + x + 1);
    }
  }
  const used = new Set();
  const edgeKey = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const toPt = (v) => ({ x: v % W, y: Math.floor(v / W) });
  const walk = (start, next) => {
    const pts = [toPt(start)];
    let prev = start;
    let cur = next;
    used.add(edgeKey(prev, cur));
    for (;;) {
      pts.push(toPt(cur));
      const ns = adj.get(cur);
      if (ns.length !== 2) break;
      const nx = ns[0] === prev ? ns[1] : ns[0];
      if (used.has(edgeKey(cur, nx))) break;
      used.add(edgeKey(cur, nx));
      prev = cur;
      cur = nx;
    }
    return pts;
  };
  const out = [];
  // 端（3つ以上の県が会う角や、水に出る角）から順にたどり、残りは輪
  const verts = [...adj.keys()].sort((a, b) => a - b);
  for (const pass of [0, 1]) {
    for (const v of verts) {
      const ns = adj.get(v);
      if (pass === 0 && ns.length === 2) continue;
      for (const nx of ns) {
        if (used.has(edgeKey(v, nx))) continue;
        const pts = walk(v, nx);
        const closed = pts.length > 3 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y;
        out.push(smoothToKm(pts, cellKm, 0.6, closed));
      }
    }
  }
  return out;
}

/**
 * 値が 0 になる所の輪郭（マーチングスクエア）。マスの中心を格子点とし、外側は pad の値とみなして輪を必ず閉じる
 * @param {(i: number) => number} valueAt マスの値（正が内側。0 にはしない）
 * @param {number} width
 * @param {number} height
 * @param {(edge: number) => number} pad 縁のマスの値から、外側の値を決める
 * @returns {Pt[][]} 輪（マスの座標。最初の点を最後に繰り返さない）
 */
export function contourRings(valueAt, width, height, pad) {
  const W = width + 2;
  const H = height + 2;
  // 外側を1マス足した格子（格子点 (i, j) はマスの中心 (i - 0.5, j - 0.5)）
  const v = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = i - 1;
      const y = j - 1;
      if (x >= 0 && y >= 0 && x < width && y < height) v[j * W + i] = valueAt(y * width + x);
      else v[j * W + i] = pad(valueAt(Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))));
    }
  }
  /** 辺の番号：横の辺 (i, j)-(i+1, j) は偶数、縦の辺 (i, j)-(i, j+1) は奇数 */
  const hEdge = (i, j) => (j * W + i) * 2;
  const vEdge = (i, j) => (j * W + i) * 2 + 1;
  const pts = new Map();
  /** 辺 → つながる線分（2つ） */
  const adj = new Map();
  const point = (key, x, y) => {
    if (!pts.has(key)) pts.set(key, { x: x - 0.5, y: y - 0.5 });
  };
  const seg = (k1, k2) => {
    for (const [a, b] of [[k1, k2], [k2, k1]]) {
      let l = adj.get(a);
      if (!l) adj.set(a, (l = []));
      l.push(b);
    }
  };
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const va = v[j * W + i];
      const vb = v[j * W + i + 1];
      const vc = v[(j + 1) * W + i + 1];
      const vd = v[(j + 1) * W + i];
      const code = (va > 0 ? 8 : 0) | (vb > 0 ? 4 : 0) | (vc > 0 ? 2 : 0) | (vd > 0 ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const T = hEdge(i, j);
      const B = hEdge(i, j + 1);
      const L = vEdge(i, j);
      const R = vEdge(i + 1, j);
      // 辺の上で 0 になる位置（線形補間）
      if ((va > 0) !== (vb > 0)) point(T, i + va / (va - vb), j);
      if ((vd > 0) !== (vc > 0)) point(B, i + vd / (vd - vc), j + 1);
      if ((va > 0) !== (vd > 0)) point(L, i, j + va / (va - vd));
      if ((vb > 0) !== (vc > 0)) point(R, i + 1, j + vb / (vb - vc));
      const center = (va + vb + vc + vd) / 4 > 0;
      switch (code) {
        case 1: case 14: seg(L, B); break;
        case 2: case 13: seg(B, R); break;
        case 3: case 12: seg(L, R); break;
        case 4: case 11: seg(T, R); break;
        case 6: case 9: seg(T, B); break;
        case 7: case 8: seg(T, L); break;
        case 5: if (center) { seg(T, L); seg(R, B); } else { seg(T, R); seg(L, B); } break;
        case 10: if (center) { seg(T, R); seg(L, B); } else { seg(T, L); seg(R, B); } break;
        default: break;
      }
    }
  }
  // つないで輪にする（どの点もちょうど2本の線分につながる）
  const rings = [];
  const used = new Set();
  for (const start of adj.keys()) {
    if (used.has(start)) continue;
    const ring = [];
    let prev = -1;
    let cur = start;
    while (!used.has(cur)) {
      used.add(cur);
      ring.push(pts.get(cur));
      const ns = adj.get(cur);
      const next = ns[0] !== prev ? ns[0] : ns[1];
      prev = cur;
      cur = next;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/** 輪を間引いて km の平らな配列にする（最初の点で閉じる） */
function ringToKm(ring, cellKm) {
  const closed = [...ring, ring[0]];
  const s = simplifyPolyline(closed, 0.08);
  const out = [];
  for (const p of s) out.push(Math.round(p.x * cellKm * 1000) / 1000, Math.round(p.y * cellKm * 1000) / 1000);
  return out;
}

/**
 * 海岸線と湖岸の輪（地形の画像を、この形で切り抜いて描く。拡大しても岸がくっきり見えるように）
 * @param {ArrayLike<number>} elev 標高
 * @param {Uint8Array} water 水の種類（hydrology.js の LAND・SEA・LAKE）
 * @param {ArrayLike<number>} filled 窪地を埋めた標高
 * @param {number} width
 * @param {number} height
 * @param {number} cellKm
 * @returns {{ land: number[][], lakes: number[][] }} land は海と陸の境（内側が陸。穴は偶奇で）、lakes は湖の岸。それぞれ km の x, y の並び
 */
export function waterOutlines(elev, water, filled, width, height, cellKm) {
  // 陸：海のマスは標高（負）、それ以外は正の標高。0 になる所が海岸線
  const landValue = (i) => (water[i] === SEA ? Math.min(elev[i], -0.5) : Math.max(elev[i], 0.5));
  // 地図の縁に接する陸は、縁でちょうど切れるように外側を反対の値にする
  const land = contourRings(landValue, width, height, (e) => (e > 0 ? -e : -1));
  // 湖：埋めた深さが 2m を超える所（水系の湖と同じ決め方）
  const lakeValue = (i) => (water[i] === LAKE ? Math.max(filled[i] - elev[i] - 2, 0.5) : Math.min(filled[i] - elev[i] - 2, -0.5));
  const lakes = contourRings(lakeValue, width, height, (e) => (e > 0 ? -e : -1));
  return { land: land.map((r) => ringToKm(r, cellKm)), lakes: lakes.map((r) => ringToKm(r, cellKm)) };
}
