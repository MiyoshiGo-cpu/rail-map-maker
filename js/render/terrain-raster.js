// 地形の画像（§5.4）：標高の段彩（海は深さで青の濃淡、低地は緑、山地は茶から白）と、北西からの光の陰影。
// 結果は RGBA のバイト列（canvas の ImageData にそのまま入れられる）。DOM には依存しない。

/** 陸の段彩（標高 m → 色） */
const LAND_STOPS = [
  [0, [141, 187, 119]],
  [150, [176, 204, 132]],
  [400, [214, 205, 150]],
  [800, [196, 164, 118]],
  [1300, [160, 126, 96]],
  [1900, [214, 206, 196]],
  [2600, [250, 250, 250]],
];
/** 海の深さ（m、負の値）→ 色 */
const SEA_STOPS = [
  [-1800, [47, 104, 164]],
  [-600, [84, 146, 204]],
  [-100, [140, 190, 230]],
  [0, [178, 215, 240]],
];
const LAKE = [128, 184, 226];
/** 湖の色（地理ビューで湖岸の形に塗る） */
export const LAKE_COLOR = `rgb(${LAKE.join(',')})`;
/** 海岸線と湖岸の細い線の色 */
export const SHORE_COLOR = 'rgba(46,96,150,0.55)';

function ramp(stops, h, out) {
  if (h <= stops[0][0]) {
    out[0] = stops[0][1][0]; out[1] = stops[0][1][1]; out[2] = stops[0][1][2];
    return;
  }
  for (let i = 1; i < stops.length; i++) {
    if (h <= stops[i][0]) {
      const [h0, c0] = stops[i - 1];
      const [h1, c1] = stops[i];
      const t = (h - h0) / (h1 - h0);
      out[0] = c0[0] + (c1[0] - c0[0]) * t;
      out[1] = c0[1] + (c1[1] - c0[1]) * t;
      out[2] = c0[2] + (c1[2] - c0[2]) * t;
      return;
    }
  }
  const last = stops[stops.length - 1][1];
  out[0] = last[0]; out[1] = last[1]; out[2] = last[2];
}

/**
 * マスごとの陰影（1 が平ら。北西（左上）45°からの光。起伏が見えるように高さを強調する）
 * @param {ArrayLike<number>} elev
 * @param {number} width
 * @param {number} height
 * @param {number} cellKm
 */
function shading(elev, width, height, cellKm) {
  const out = new Float32Array(width * height);
  const cellM = cellKm * 1000;
  const z = 4 / cellM * Math.max(1, 500 / cellM);
  const lx = -0.5;
  const ly = -0.5;
  const lz = Math.SQRT1_2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const hl = elev[y * width + (x > 0 ? x - 1 : x)];
      const hr = elev[y * width + (x < width - 1 ? x + 1 : x)];
      const hu = elev[(y > 0 ? y - 1 : y) * width + x];
      const hd = elev[(y < height - 1 ? y + 1 : y) * width + x];
      const dx = (hr - hl) * z;
      const dy = (hd - hu) * z;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      // 光に向いた斜面は明るく、影の斜面は暗く
      const sh = ((-dx * lx - dy * ly + lz) / len) / lz;
      out[y * width + x] = sh < 0.5 ? 0.5 : sh > 1.25 ? 1.25 : sh;
    }
  }
  return out;
}

/**
 * 地形の画像。scale が 2 以上なら、標高・陰影・水を補間して細かい画像にする（拡大しても海岸線がなめらかに見えるように）
 * @param {ArrayLike<number>} elev 標高（m）
 * @param {number} width
 * @param {number} height
 * @param {{ cellKm: number, water?: Uint8Array, filled?: ArrayLike<number>, scale?: number, layer?: 'all'|'land'|'sea' }} opt water があれば海（1）と湖（2）を塗り分ける。無ければ 0 以下を海とみなす。
 *   filled（窪地を埋めた標高）があれば、湖の岸を水の深さの補間で決める（なめらかになる）。
 *   layer が land なら全体を陸の色（段彩と陰影）で、sea なら全体を海の色で塗る（地理ビューで、海岸線の形に切り抜いて重ねる）
 * @returns {Uint8ClampedArray} 大きさは (width × scale) × (height × scale)
 */
export function terrainRGBA(elev, width, height, opt) {
  const k = Math.max(1, Math.floor(opt.scale || 1));
  const W = width * k;
  const H = height * k;
  const out = new Uint8ClampedArray(W * H * 4);
  const shade = shading(elev, width, height, opt.cellKm);
  const water = opt.water || null;
  const filled = opt.filled || null;
  const layer = opt.layer || 'all';
  const c = [0, 0, 0];
  for (let Y = 0; Y < H; Y++) {
    // 細かい画素の中心が、元のマスのどこに当たるか（マスの中心どうしの間で補間する）
    const fy = Math.min(height - 1, Math.max(0, (Y + 0.5) / k - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(height - 1, y0 + 1);
    const ty = fy - y0;
    for (let X = 0; X < W; X++) {
      const fx = Math.min(width - 1, Math.max(0, (X + 0.5) / k - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(width - 1, x0 + 1);
      const tx = fx - x0;
      const i00 = y0 * width + x0;
      const i01 = y0 * width + x1;
      const i10 = y1 * width + x0;
      const i11 = y1 * width + x1;
      const w00 = (1 - tx) * (1 - ty);
      const w01 = tx * (1 - ty);
      const w10 = (1 - tx) * ty;
      const w11 = tx * ty;
      const h = elev[i00] * w00 + elev[i01] * w01 + elev[i10] * w10 + elev[i11] * w11;
      let kind;
      if (layer === 'land') kind = 0;
      else if (layer === 'sea') kind = 1;
      else if (water) {
        const frac = (v) => (water[i00] === v ? w00 : 0) + (water[i01] === v ? w01 : 0) + (water[i10] === v ? w10 : 0) + (water[i11] === v ? w11 : 0);
        const lake = frac(2);
        const sea = frac(1);
        // 湖は、湖のマスに接していて補間した水の深さが 2m を超えるとき（filled が無ければ半分以上が湖のとき）。
        // 海は、補間した標高が 0 以下で海のマスに接しているとき
        let isLake = lake > 0.5;
        if (filled && lake > 0) {
          const depth = (filled[i00] - elev[i00]) * w00 + (filled[i01] - elev[i01]) * w01 + (filled[i10] - elev[i10]) * w10 + (filled[i11] - elev[i11]) * w11;
          isLake = depth > 2 || lake > 0.99;
        }
        kind = isLake ? 2 : (sea > 0 && h <= 0) || sea > 0.5 ? 1 : 0;
      } else kind = h > 0 ? 0 : 1;
      if (kind === 2) {
        c[0] = LAKE[0]; c[1] = LAKE[1]; c[2] = LAKE[2];
      } else if (kind === 1) {
        ramp(SEA_STOPS, Math.min(0, h), c);
      } else {
        ramp(LAND_STOPS, Math.max(0, h), c);
        const sh = shade[i00] * w00 + shade[i01] * w01 + shade[i10] * w10 + shade[i11] * w11;
        c[0] *= sh; c[1] *= sh; c[2] *= sh;
      }
      const o = (Y * W + X) * 4;
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
      out[o + 3] = 255;
    }
  }
  return out;
}
