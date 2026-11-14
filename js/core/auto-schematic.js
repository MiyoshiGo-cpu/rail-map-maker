// 地理の配置から路線図を自動で作る（§7 フェーズ4）。DOM に依存しない。
// 駅の地理座標（km）から、路線図の格子座標（整数）を決める。
// 1. 縮尺：駅間（地理）の長さの中央値が TARGET_STEPS マスになるように拡大する（長い駅間は少し縮める）
// 2. ならし：駅間ごとに近い八方向を割り当て（1つの駅で同じ向きが重ならないように）、
//    駅間がその向きにそろうように両端の駅を少しずつ動かす。駅どうし・駅と線が近づきすぎたら離す
// 3. 格子：整数に丸める。重なった駅は近くの空いた点へ
// 4. 手直し：駅を周りの格子点へ動かしてみて、八方向でない駅間・向きのずれ・短すぎる駅間・
//    ほかの駅の上を通る線が減るなら動かす（減らなくなるまで繰り返す）
// 乱数も三角関数も使わず、同じ入力なら同じ結果になる。
import { sectionCount } from './defaults.js';
import { estimateGeo } from './geo-layout.js';

/** @typedef {{ x: number, y: number }} Pt */

/** 駅間の長さの中央値（マス） */
export const TARGET_STEPS = 3;
/** 駅間の最短（マス。駅名の札が入るように） */
export const MIN_STEPS = 2;

/** ならしの回数と強さ */
const ITERATIONS = 160;
const STIFF = 0.5;
const LEN_PULL = 0.08;
const ANCHOR = 0.02;
/** 駅どうし・駅と線の、ならしでの最低限の間隔（マス） */
const NODE_SEP = 1.6;
const EDGE_SEP = 1;
/** 手直しの最大の回数 */
const MAX_PASSES = 40;

/** 手直しの重み */
const W_BEND = 3; // 八方向でない駅間（路線図では途中で曲がる）
const W_DIR = 1.5; // 割り当てた向きからのずれ（45°ごと）
const W_SHORT = 4; // 最短より短い駅間（1マスごと）
const W_LEN = 0.6; // 目安の長さとの差（割合）
const W_POS = 0.3; // ならした位置からの距離
const W_THROUGH = 6; // 線がほかの駅の上を通る
const W_GROUP = 4; // 乗換グループの駅が離れすぎ（1マスごと）

/** 向きの番号：0=東 1=南東 2=南 3=南西 4=西 5=北西 6=北 7=北東（y は下向き。octilinear.js と同じ） */
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const UNIT = DIRS.map(([x, y]) => (x && y ? [x * Math.SQRT1_2, y * Math.SQRT1_2] : [x, y]));

/** 格子点（整数）を1つの数にする */
const key = (x, y) => x * 1048576 + y;

/**
 * 8つの向きとの近さ（cos）
 * @param {number} dx @param {number} dy
 */
function octantScores(dx, dy) {
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return UNIT.map(([ux, uy]) => (dx * ux + dy * uy) / len);
}

/** いちばん近い八方向（同じ近さなら番号の小さい方） @param {number} dx @param {number} dy */
export function nearestOctant(dx, dy) {
  const s = octantScores(dx, dy);
  let best = 0;
  for (let o = 1; o < 8; o++) if (s[o] > s[best]) best = o;
  return best;
}

/** 向きの差（45°単位、0〜4） */
const turn = (a, b) => {
  const d = Math.abs(a - b) % 8;
  return Math.min(d, 8 - d);
};

/** @param {number} dx @param {number} dy */
const isOcti = (dx, dy) => dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);

/**
 * 2つの格子点を八方向で結んだときの、途中の格子点（両端は含まない）。
 * 八方向でなければ「斜め → 直線」で結んだとみなす
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {(x: number, y: number) => void} fn
 */
function forPath(x0, y0, x1, y1, fn) {
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  const ax = Math.abs(x1 - x0);
  const ay = Math.abs(y1 - y0);
  const diag = Math.min(ax, ay);
  const total = Math.max(ax, ay);
  let x = x0;
  let y = y0;
  for (let s = 1; s < total; s++) {
    if (s <= diag) {
      x += sx;
      y += sy;
    } else if (ax > ay) x += sx;
    else y += sy;
    fn(x, y);
  }
}

/**
 * 自動配置の結果の数
 * @typedef {object} LayoutStats
 * @property {number} sections 駅間の数（同じ2駅を結ぶものは1つ）
 * @property {number} octilinear そのうち八方向の直線で結べた数
 * @property {number} through ほかの駅の上を通る駅間の数
 */

/**
 * 駅の地理座標と駅間のつながりから、路線図の格子座標を決める
 * @param {{
 *   nodes: { id: string, geo: Pt }[],
 *   edges: { a: string, b: string }[],
 *   groups?: string[][],
 * }} input geo は km（y は下向き）。edges は路線の隣り合う駅、groups は乗換グループ
 * @returns {{ positions: Map<string, Pt>, stats: LayoutStats }}
 */
export function layoutSchematic(input) {
  const n = input.nodes.length;
  const index = new Map(input.nodes.map((nd, i) => [nd.id, i]));
  const geo = input.nodes.map((nd) => nd.geo);

  // 駅間（同じ2駅を結ぶものは1つにまとめる）
  /** @type {{ u: number, v: number, km: number, target: number, dir: number }[]} */
  const edges = [];
  const seen = new Set();
  for (const e of input.edges) {
    const u = index.get(e.a);
    const v = index.get(e.b);
    if (u === undefined || v === undefined || u === v) continue;
    const k = u < v ? u + ',' + v : v + ',' + u;
    if (seen.has(k)) continue;
    seen.add(k);
    const km = Math.sqrt((geo[v].x - geo[u].x) ** 2 + (geo[v].y - geo[u].y) ** 2);
    edges.push({ u, v, km, target: MIN_STEPS, dir: 0 });
  }
  /** @type {number[][]} */
  const adj = Array.from({ length: n }, () => []);
  edges.forEach((e, k) => {
    adj[e.u].push(k);
    adj[e.v].push(k);
  });
  // 乗換グループの相手
  /** @type {number[][]} */
  const groupOf = Array.from({ length: n }, () => []);
  for (const g of input.groups || []) {
    const ids = g.map((id) => index.get(id)).filter((i) => i !== undefined);
    for (const i of ids) for (const j of ids) if (i !== j && !groupOf[i].includes(j)) groupOf[i].push(j);
  }

  // ---------- 1. 縮尺 ----------
  const median = medianLength(edges.map((e) => e.km), geo);
  const scale = TARGET_STEPS / median;
  for (const e of edges) {
    const r = e.km / median;
    // 長い駅間は少し縮める（r と √r の間）
    e.target = Math.min(TARGET_STEPS * 6, Math.max(MIN_STEPS, (TARGET_STEPS * (r + Math.sqrt(r))) / 2));
  }
  let cx = 0;
  let cy = 0;
  for (const g of geo) {
    cx += g.x / (n || 1);
    cy += g.y / (n || 1);
  }
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    ax[i] = (geo[i].x - cx) * scale;
    ay[i] = (geo[i].y - cy) * scale;
  }
  const px = Float64Array.from(ax);
  const py = Float64Array.from(ay);

  // ---------- 2. ならし ----------
  const used = new Uint8Array(n * 8);
  const order = edges.map((_, k) => k);
  /** 駅間に向きを割り当てる（向きがはっきりしている駅間から。1つの駅で同じ向きを2回使わない） */
  function assignDirs() {
    used.fill(0);
    const scores = edges.map((e) => octantScores(px[e.v] - px[e.u], py[e.v] - py[e.u]));
    const fit = scores.map((s) => Math.max(...s));
    order.sort((a, b) => fit[b] - fit[a] || a - b);
    for (const k of order) {
      const e = edges[k];
      const s = scores[k];
      const cand = [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => s[b] - s[a] || a - b);
      let o = cand.find((c) => !used[e.u * 8 + c] && !used[e.v * 8 + ((c + 4) & 7)]);
      if (o === undefined) o = cand[0];
      used[e.u * 8 + o] = 1;
      used[e.v * 8 + ((o + 4) & 7)] = 1;
      e.dir = o;
    }
  }
  for (let it = 0; it < ITERATIONS; it++) {
    if (it % 5 === 0) assignDirs();
    // 駅間をその向きにそろえる
    for (const e of edges) {
      const [ux, uy] = UNIT[e.dir];
      const norm = e.dir & 1 ? Math.SQRT2 : 1;
      const dx = px[e.v] - px[e.u];
      const dy = py[e.v] - py[e.u];
      const steps = (dx * ux + dy * uy) / norm;
      const len = Math.max(MIN_STEPS, steps + (e.target - steps) * LEN_PULL) * norm;
      const fx = (ux * len - dx) * 0.5 * STIFF;
      const fy = (uy * len - dy) * 0.5 * STIFF;
      px[e.u] -= fx;
      py[e.u] -= fy;
      px[e.v] += fx;
      py[e.v] += fy;
    }
    // 乗換グループの駅は2マス以内に寄せる
    for (let i = 0; i < n; i++) {
      for (const j of groupOf[i]) {
        if (j < i) continue;
        const dx = px[j] - px[i];
        const dy = py[j] - py[i];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= 2) continue;
        const f = ((d - 2) / d) * 0.25;
        px[i] += dx * f;
        py[i] += dy * f;
        px[j] -= dx * f;
        py[j] -= dy * f;
      }
    }
    // 元の位置へ弱く引き戻す（全体の形を保つ）
    for (let i = 0; i < n; i++) {
      px[i] += (ax[i] - px[i]) * ANCHOR;
      py[i] += (ay[i] - py[i]) * ANCHOR;
    }
    separate(px, py, edges);
  }

  // ---------- 3. 格子に丸める（つながりの多い駅から） ----------
  const gx = new Int32Array(n);
  const gy = new Int32Array(n);
  /** @type {Map<number, number>} 格子点 → 駅 */
  const occ = new Map();
  const byDegree = [...Array(n).keys()].sort((a, b) => adj[b].length - adj[a].length || a - b);
  for (const i of byDegree) {
    const q = nearestFree(occ, px[i], py[i]);
    gx[i] = q.x;
    gy[i] = q.y;
    occ.set(key(q.x, q.y), i);
  }

  // ---------- 4. 手直し ----------
  /** @type {Map<number, number>} 格子点 → そこを通る駅間の数（端は含まない） */
  const cover = new Map();
  const coverEdge = (k, d) => {
    const e = edges[k];
    forPath(gx[e.u], gy[e.u], gx[e.v], gy[e.v], (x, y) => {
      const c = (cover.get(key(x, y)) || 0) + d;
      if (c) cover.set(key(x, y), c);
      else cover.delete(key(x, y));
    });
  };
  edges.forEach((_, k) => coverEdge(k, 1));

  /** 駅 i を (x, y) に置いたときの、i に関わる分の悪さ（i は occ・cover から外してから呼ぶ） */
  function nodeCost(i, x, y) {
    let c = (W_POS * ((x - px[i]) ** 2 + (y - py[i]) ** 2)) / (TARGET_STEPS * TARGET_STEPS);
    c += W_THROUGH * (cover.get(key(x, y)) || 0);
    for (const k of adj[i]) {
      const e = edges[k];
      const j = e.u === i ? e.v : e.u;
      const dx = gx[j] - x;
      const dy = gy[j] - y;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      if (!isOcti(dx, dy)) c += W_BEND;
      const want = e.u === i ? e.dir : (e.dir + 4) & 7;
      c += W_DIR * turn(nearestOctant(dx, dy), want);
      if (steps < MIN_STEPS) c += W_SHORT * (MIN_STEPS - steps);
      c += (W_LEN * Math.abs(steps - e.target)) / e.target;
      forPath(x, y, gx[j], gy[j], (qx, qy) => {
        if (occ.has(key(qx, qy))) c += W_THROUGH;
      });
    }
    for (const j of groupOf[i]) {
      const d = Math.max(Math.abs(gx[j] - x), Math.abs(gy[j] - y));
      if (d > 2) c += W_GROUP * (d - 2);
    }
    return c;
  }

  /** 駅 i を置いてみる格子点（周り2マスと、つながる駅から割り当てた向きに伸ばした点） */
  function candidates(i) {
    const out = new Map();
    const add = (x, y) => {
      const k = key(x, y);
      if (!occ.has(k) && !out.has(k)) out.set(k, { x, y });
    };
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) add(gx[i] + dx, gy[i] + dy);
    for (const k of adj[i]) {
      const e = edges[k];
      const j = e.u === i ? e.v : e.u;
      const back = e.u === i ? (e.dir + 4) & 7 : e.dir; // j から i への向き
      const cur = Math.max(Math.abs(gx[i] - gx[j]), Math.abs(gy[i] - gy[j]));
      const far = Math.max(cur + 1, Math.ceil(e.target) + 1);
      for (let s = MIN_STEPS; s <= far; s++) add(gx[j] + DIRS[back][0] * s, gy[j] + DIRS[back][1] * s);
    }
    return out.values();
  }

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false;
    for (const i of byDegree) {
      occ.delete(key(gx[i], gy[i]));
      for (const k of adj[i]) coverEdge(k, -1);
      let best = nodeCost(i, gx[i], gy[i]);
      let bx = gx[i];
      let by = gy[i];
      for (const q of candidates(i)) {
        const c = nodeCost(i, q.x, q.y);
        if (c < best - 1e-9) {
          best = c;
          bx = q.x;
          by = q.y;
        }
      }
      if (bx !== gx[i] || by !== gy[i]) moved = true;
      gx[i] = bx;
      gy[i] = by;
      occ.set(key(bx, by), i);
      for (const k of adj[i]) coverEdge(k, 1);
    }
    if (!moved) break;
  }

  // 左上を (0, 0) にそろえる
  let minX = Infinity;
  let minY = Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, gx[i]);
    minY = Math.min(minY, gy[i]);
  }
  /** @type {Map<string, Pt>} */
  const positions = new Map();
  input.nodes.forEach((nd, i) => positions.set(nd.id, { x: gx[i] - minX + 0, y: gy[i] - minY + 0 }));

  let octilinear = 0;
  let through = 0;
  for (const e of edges) {
    if (isOcti(gx[e.v] - gx[e.u], gy[e.v] - gy[e.u])) octilinear++;
    let hit = false;
    forPath(gx[e.u], gy[e.u], gx[e.v], gy[e.v], (x, y) => {
      if (occ.has(key(x, y))) hit = true;
    });
    if (hit) through++;
  }
  return { positions, stats: { sections: edges.length, octilinear, through } };
}

/**
 * 駅間の長さの中央値（km）。駅間が無ければ、いちばん近い駅までの距離の中央値
 * @param {number[]} lens
 * @param {Pt[]} geo
 */
function medianLength(lens, geo) {
  let list = lens.filter((v) => v > 1e-6);
  if (!list.length) {
    list = geo.map((a, i) => {
      let best = Infinity;
      geo.forEach((b, j) => {
        if (i !== j) best = Math.min(best, Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
      });
      return best;
    }).filter((v) => v > 1e-6 && Number.isFinite(v));
  }
  if (!list.length) return 1;
  list.sort((a, b) => a - b);
  return list[list.length >> 1];
}

/**
 * ならしの途中で、駅どうし・駅と線が近づきすぎたら離す
 * @param {Float64Array} px @param {Float64Array} py
 * @param {{ u: number, v: number }[]} edges
 */
function separate(px, py, edges) {
  const n = px.length;
  const cell = 2;
  /** @type {Map<number, number[]>} */
  const grid = new Map();
  const cellOf = (v) => Math.floor(v / cell);
  for (let i = 0; i < n; i++) {
    const k = key(cellOf(px[i]), cellOf(py[i]));
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  }
  // 駅どうし
  for (let i = 0; i < n; i++) {
    const cx = cellOf(px[i]);
    const cy = cellOf(py[i]);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of grid.get(key(cx + dx, cy + dy)) || []) {
          if (j <= i) continue;
          let vx = px[j] - px[i];
          let vy = py[j] - py[i];
          let d = Math.sqrt(vx * vx + vy * vy);
          if (d >= NODE_SEP) continue;
          if (d < 1e-6) {
            vx = 1;
            vy = 0;
            d = 0;
          } else {
            vx /= d;
            vy /= d;
          }
          const push = (NODE_SEP - d) / 2;
          px[i] -= vx * push;
          py[i] -= vy * push;
          px[j] += vx * push;
          py[j] += vy * push;
        }
      }
    }
  }
  // 駅と線（線の端の駅は除く）
  for (const e of edges) {
    const x0 = px[e.u];
    const y0 = py[e.u];
    const ex = px[e.v] - x0;
    const ey = py[e.v] - y0;
    const len2 = ex * ex + ey * ey;
    if (len2 < 1e-9) continue;
    const c0x = cellOf(Math.min(x0, px[e.v]) - EDGE_SEP);
    const c1x = cellOf(Math.max(x0, px[e.v]) + EDGE_SEP);
    const c0y = cellOf(Math.min(y0, py[e.v]) - EDGE_SEP);
    const c1y = cellOf(Math.max(y0, py[e.v]) + EDGE_SEP);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        for (const w of grid.get(key(cx, cy)) || []) {
          if (w === e.u || w === e.v) continue;
          const t = ((px[w] - x0) * ex + (py[w] - y0) * ey) / len2;
          if (t <= 0.05 || t >= 0.95) continue;
          let nx = px[w] - (x0 + ex * t);
          let ny = py[w] - (y0 + ey * t);
          let d = Math.sqrt(nx * nx + ny * ny);
          if (d >= EDGE_SEP) continue;
          if (d < 1e-6) {
            // 線の真上なら、線の右側へ
            const l = Math.sqrt(len2);
            nx = -ey / l;
            ny = ex / l;
            d = 0;
          } else {
            nx /= d;
            ny /= d;
          }
          const push = EDGE_SEP - d;
          px[w] += nx * push * 0.5;
          py[w] += ny * push * 0.5;
          px[e.u] -= nx * push * 0.25;
          py[e.u] -= ny * push * 0.25;
          px[e.v] -= nx * push * 0.25;
          py[e.v] -= ny * push * 0.25;
        }
      }
    }
  }
}

/**
 * (x, y) にいちばん近い空いた格子点
 * @param {Map<number, number>} occ
 * @param {number} x @param {number} y
 * @returns {Pt}
 */
function nearestFree(occ, x, y) {
  const cx = Math.round(x);
  const cy = Math.round(y);
  let best = null;
  let bd = Infinity;
  for (let r = 0; r < 256; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const qx = cx + dx;
        const qy = cy + dy;
        if (occ.has(key(qx, qy))) continue;
        const d = (qx - x) ** 2 + (qy - y) ** 2;
        if (d < bd) {
          bd = d;
          best = { x: qx, y: qy };
        }
      }
    }
    // 次の輪の点は (r + 0.5) より遠いので、それより近い点が見つかっていれば終わり
    if (best && bd <= (r + 0.5) ** 2) break;
  }
  return best || { x: cx, y: cy };
}

/**
 * プロジェクトの駅と路線から、路線図の格子座標を作る。
 * 地理座標の無い駅は、路線図の位置から地理の位置を見積もって使う（どちらも無い駅は動かさない）
 * @param {import('./schema.js').Project} p
 * @returns {{ positions: Record<string, Pt>, stats: LayoutStats }}
 */
export function autoSchematic(p) {
  const nodes = [];
  for (const st of p.stations) {
    let g = st.geo && 'x' in st.geo ? { x: st.geo.x, y: st.geo.y } : null;
    if (!g && st.schematic) g = estimateGeo(p.stations, st.schematic, { x: 0, y: 0 });
    if (g) nodes.push({ id: st.id, geo: g });
  }
  const edges = [];
  for (const line of p.lines) {
    const len = line.stops.length;
    const count = sectionCount(line);
    for (let i = 0; i < count; i++) edges.push({ a: line.stops[i].stationId, b: line.stops[(i + 1) % len].stationId });
  }
  const res = layoutSchematic({ nodes, edges, groups: p.interchanges.map((ic) => ic.stationIds) });
  return { positions: Object.fromEntries(res.positions), stats: res.stats };
}
