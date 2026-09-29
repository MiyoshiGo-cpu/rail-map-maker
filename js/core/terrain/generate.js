// 地形の生成（§6.7 の手順1〜3）：ノイズ → 形のマスク → 海面。
// 位置は km で考え、ノイズの基本の波長は 100km。大きさ（size）は範囲（size × cellKm）を決め、
// プレビューは同じ範囲を少ないマスで計算する（形は本生成と同じになる）。
// 四則演算と Math.floor・sqrt・abs・min・max だけを使い、どのブラウザでも同じ結果にする。
import { createRng } from '../rng.js';
import { createNoise2D, fbm, ridged } from './noise.js';

/** @typedef {import('../schema.js').TerrainParams} TerrainParams */

/** 形 */
export const TERRAIN_SHAPES = /** @type {const} */ (['archipelago', 'island', 'coast', 'inland']);
/** 大きさ（1辺のマスの数） */
export const TERRAIN_SIZES = /** @type {const} */ ([256, 512, 1024]);

/** ノイズの基本の波長（km） */
const BASE_KM = 100;

/** @returns {TerrainParams} */
export function defaultTerrainParams() {
  return {
    shape: 'archipelago',
    size: 512,
    cellKm: 0.5,
    landRatio: 0.35,
    ruggedness: 0.5,
    coastComplexity: 0.5,
    riverAmount: 0.5,
    cityCount: 24,
    totalPopulation: 3000000,
  };
}

/**
 * 生成した標高
 * @typedef {object} Elevation
 * @property {number} width
 * @property {number} height
 * @property {number} cellKm 1マスの大きさ（プレビューでは本生成より大きい）
 * @property {Float32Array} data 標高（m）。0 以下は水（海・湖）
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 形のマスク（u, v は 0〜1。陸にしたい所ほど大きい値）
 * @param {TerrainParams['shape']} shape
 * @param {{ next: () => number }} rng
 * @param {(x: number, y: number) => number} noise 背骨の幅の揺らぎに使う
 * @returns {(u: number, v: number) => number}
 */
function shapeMask(shape, rng, noise) {
  const unit = () => {
    // 向きをランダムに選ぶ（三角関数を使わずに単位ベクトルにする）
    for (;;) {
      const x = rng.next() * 2 - 1;
      const y = rng.next() * 2 - 1;
      const d = x * x + y * y;
      if (d > 0.05 && d <= 1) {
        const l = Math.sqrt(d);
        return { x: x / l, y: y / l };
      }
    }
  };
  switch (shape) {
    case 'island':
      return (u, v) => {
        const dx = u - 0.5;
        const dy = v - 0.5;
        return 1 - Math.sqrt(dx * dx + dy * dy) * 3.2;
      };
    case 'coast': {
      const dir = unit();
      return (u, v) => 0.25 - ((u - 0.5) * dir.x + (v - 0.5) * dir.y) * 2.4;
    }
    case 'inland':
      // ほぼ全面が陸。低い所は湖になる（縁は高くして、水が縁につながらないようにする）
      return (u, v) => {
        const edge = Math.min(u, v, 1 - u, 1 - v);
        return 0.7 + (edge < 0.04 ? (0.04 - edge) * 20 : 0);
      };
    case 'archipelago':
    default: {
      // ゆるい曲線（3次ベジェ）の背骨に沿って細長い陸を作る
      const dir = unit();
      const side = { x: -dir.y, y: dir.x };
      const p0 = { x: 0.5 - dir.x * 0.42 + side.x * (rng.next() - 0.5) * 0.3, y: 0.5 - dir.y * 0.42 + side.y * (rng.next() - 0.5) * 0.3 };
      const p3 = { x: 0.5 + dir.x * 0.42 + side.x * (rng.next() - 0.5) * 0.3, y: 0.5 + dir.y * 0.42 + side.y * (rng.next() - 0.5) * 0.3 };
      const bend = (rng.next() - 0.5) * 0.7;
      const p1 = { x: p0.x + (p3.x - p0.x) / 3 + side.x * bend, y: p0.y + (p3.y - p0.y) / 3 + side.y * bend };
      const p2 = { x: p0.x + (p3.x - p0.x) * 2 / 3 - side.x * bend * 0.6, y: p0.y + (p3.y - p0.y) * 2 / 3 - side.y * bend * 0.6 };
      const N = 64;
      const xs = new Float64Array(N + 1);
      const ys = new Float64Array(N + 1);
      const ws = new Float64Array(N + 1);
      const ss = new Float64Array(N + 1);
      const wobble = rng.next() * 50;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const a = (1 - t) * (1 - t) * (1 - t);
        const b = 3 * (1 - t) * (1 - t) * t;
        const c = 3 * (1 - t) * t * t;
        const d = t * t * t;
        xs[k] = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
        ys[k] = a * p0.y + b * p1.y + c * p2.y + d * p3.y;
        // 幅は場所によって太さを変え、両端は細くする
        const taper = Math.min(1, t * 6, (1 - t) * 6);
        // ところどころ細くくびれさせ、くびれが強い所は海にして島の間の海峡を作る
        const raw = 0.8 + 0.9 * noise(t * 4 + wobble, wobble);
        ws[k] = 0.1 * (0.55 + 0.45 * taper) * Math.max(0.3, raw);
        ss[k] = clamp01(raw * 1.6);
      }
      return (u, v) => {
        let best = Infinity;
        let bw = ws[0];
        let bs = ss[0];
        for (let k = 0; k < N; k++) {
          const ax = xs[k];
          const ay = ys[k];
          const bx = xs[k + 1] - ax;
          const by = ys[k + 1] - ay;
          const len = bx * bx + by * by;
          let s = len > 0 ? ((u - ax) * bx + (v - ay) * by) / len : 0;
          s = s < 0 ? 0 : s > 1 ? 1 : s;
          const dx = u - ax - bx * s;
          const dy = v - ay - by * s;
          const d = dx * dx + dy * dy;
          if (d < best) {
            best = d;
            bw = ws[k] + (ws[k + 1] - ws[k]) * s;
            bs = ss[k] + (ss[k + 1] - ss[k]) * s;
          }
        }
        return bs * (1 - Math.sqrt(best) / bw) - (1 - bs) * 0.6;
      };
    }
  }
}

/**
 * 標高を作る
 * @param {string} seed
 * @param {TerrainParams} params
 * @param {{ resolution?: number, onProgress?: (ratio: number) => void }} [opt] resolution はプレビュー用のマスの数
 * @returns {Elevation}
 */
export function generateElevation(seed, params, opt = {}) {
  const n = opt.resolution || params.size;
  const extentKm = params.size * params.cellKm;
  const cellKm = extentKm / n;
  const rng = createRng(`${seed}:terrain`);
  const base = createNoise2D(rng);
  const warpX = createNoise2D(rng);
  const warpY = createNoise2D(rng);
  const ridge = createNoise2D(rng);
  const mask = shapeMask(params.shape, rng, createNoise2D(rng));
  const cc = clamp01(params.coastComplexity);
  const rug = clamp01(params.ruggedness);
  const warpAmt = 0.05 + 0.2 * cc;
  const detail = 0.4 + 0.35 * cc;

  // 1. ノイズと形（ドメインワーピングで海岸線を自然にし、尾根型のノイズで山脈を作る）
  const e = new Float32Array(n * n);
  let emin = Infinity;
  let emax = -Infinity;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const xk = (i + 0.5) * cellKm / BASE_KM;
      const yk = (j + 0.5) * cellKm / BASE_KM;
      const wx = xk + warpAmt * fbm(warpX, xk * 1.5, yk * 1.5, 3);
      const wy = yk + warpAmt * fbm(warpY, xk * 1.5 + 7.3, yk * 1.5 - 4.1, 3);
      // マスクもワーピングした位置で見て、形の縁をなじませる
      const u = wx * BASE_KM / extentKm;
      const v = wy * BASE_KM / extentKm;
      let h = mask(u, v) + detail * fbm(base, wx, wy, 6);
      const landness = clamp01(h * 2 + 0.3);
      h += rug * 0.9 * landness * ridged(ridge, wx * 1.3 + 5.2, wy * 1.3 - 3.1, 5);
      e[j * n + i] = h;
      if (h < emin) emin = h;
      if (h > emax) emax = h;
    }
    if (opt.onProgress && (j & 15) === 15) opt.onProgress((j + 1) / n * 0.9);
  }

  // 2. 海面：陸地の割合になるように分位点で決める
  const sorted = e.slice().sort();
  const q = Math.min(n * n - 1, Math.max(0, Math.floor((1 - clamp01(params.landRatio)) * n * n)));
  const sea = sorted[q];

  // 3. 高さを m にする（低地を広く、山を高く。水は岸の近くほど浅く）
  const maxH = 400 + 2600 * rug;
  const data = new Float32Array(n * n);
  const landSpan = emax - sea || 1;
  const seaSpan = sea - emin || 1;
  for (let k = 0; k < n * n; k++) {
    const h = e[k];
    if (h > sea) {
      const t = (h - sea) / landSpan;
      data[k] = 1 + (0.4 * t * Math.sqrt(t) + 0.6 * t * t) * maxH;
    } else {
      const t = (sea - h) / seaSpan;
      data[k] = -2 - t * Math.sqrt(t) * 1800;
    }
  }
  if (opt.onProgress) opt.onProgress(1);
  return { width: n, height: n, cellKm, data };
}

/**
 * 陸地の割合・最高点などの集計（テストと画面の表示用）
 * @param {Elevation} el
 */
export function elevationStats(el) {
  let land = 0;
  let max = -Infinity;
  let min = Infinity;
  for (const h of el.data) {
    if (h > 0) land++;
    if (h > max) max = h;
    if (h < min) min = h;
  }
  return { landRatio: land / el.data.length, max, min };
}
