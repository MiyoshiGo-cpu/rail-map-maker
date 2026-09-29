// シンプレックスノイズ（2次元）と、それを重ねる fBm・尾根型（§6.7）。
// 乱数は createRng（sfc32）から作り、Math.random は使わない。
// 四則演算と Math.floor・Math.sqrt だけで計算するので、どのブラウザでも同じ値になる（Math.pow・exp・三角関数は使わない）。

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
/** 勾配（8方向） */
const GRAD = new Float64Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);

/**
 * シードつきの2次元シンプレックスノイズ（値はおよそ -1〜1）
 * @param {{ next: () => number }} rng
 * @returns {(x: number, y: number) => number}
 */
export function createNoise2D(rng) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates で並べ替える
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  const grad = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    grad[i] = (perm[i] & 7) * 2;
  }
  return function noise(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = grad[ii + perm[jj]];
      t0 *= t0;
      n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = grad[ii + i1 + perm[jj + j1]];
      t1 *= t1;
      n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = grad[ii + 1 + perm[jj + 1]];
      t2 *= t2;
      n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2);
    }
    return 70 * n;
  };
}

/**
 * fBm：周波数を2倍・振幅を半分にしながら重ねる（値はおよそ -1〜1）
 * @param {(x: number, y: number) => number} noise
 * @param {number} x
 * @param {number} y
 * @param {number} octaves
 */
export function fbm(noise, x, y, octaves) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    // オクターブごとに少しずらして、原点付近の模様の重なりを避ける
    sum += amp * noise(x * f + o * 17.31, y * f - o * 9.73);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/**
 * 尾根型のノイズ：|n| の谷を尾根にして重ねる（値は 0〜1。山脈の筋になる）
 * @param {(x: number, y: number) => number} noise
 * @param {number} x
 * @param {number} y
 * @param {number} octaves
 */
export function ridged(noise, x, y, octaves) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  let weight = 1;
  for (let o = 0; o < octaves; o++) {
    let r = 1 - Math.abs(noise(x * f + o * 31.7, y * f + o * 12.9));
    r *= r;
    // 高い尾根の上ほど細かい起伏を強くする
    r *= weight;
    weight = Math.min(1, r * 2);
    sum += amp * r;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
