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
 * @param {ArrayLike<number>} elev 標高（m）
 * @param {number} width
 * @param {number} height
 * @param {{ cellKm: number, water?: Uint8Array }} opt water があれば湖（2）を塗り分ける。無ければ 0 以下を海とみなす
 * @returns {Uint8ClampedArray}
 */
export function terrainRGBA(elev, width, height, opt) {
  const out = new Uint8ClampedArray(width * height * 4);
  const c = [0, 0, 0];
  // 陰影：北西（左上）45°からの光。起伏が見えるように高さを強調する
  const cellM = opt.cellKm * 1000;
  const z = 4 / cellM * Math.max(1, 500 / cellM);
  const lx = -0.5;
  const ly = -0.5;
  const lz = Math.SQRT1_2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const h = elev[i];
      const w = opt.water ? opt.water[i] : h > 0 ? 0 : 1;
      if (w === 2) {
        c[0] = LAKE[0]; c[1] = LAKE[1]; c[2] = LAKE[2];
      } else if (w === 1) {
        ramp(SEA_STOPS, Math.min(0, h), c);
      } else {
        ramp(LAND_STOPS, Math.max(0, h), c);
        const hl = elev[y * width + (x > 0 ? x - 1 : x)];
        const hr = elev[y * width + (x < width - 1 ? x + 1 : x)];
        const hu = elev[(y > 0 ? y - 1 : y) * width + x];
        const hd = elev[(y < height - 1 ? y + 1 : y) * width + x];
        const dx = (hr - hl) * z;
        const dy = (hd - hu) * z;
        const len = Math.sqrt(dx * dx + dy * dy + 1);
        // 平らなら 1。光に向いた斜面は明るく、影の斜面は暗く
        const shade = ((-dx * lx - dy * ly + lz) / len) / lz;
        const s = shade < 0.5 ? 0.5 : shade > 1.25 ? 1.25 : shade;
        c[0] *= s; c[1] *= s; c[2] *= s;
      }
      const o = i * 4;
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
      out[o + 3] = 255;
    }
  }
  return out;
}
