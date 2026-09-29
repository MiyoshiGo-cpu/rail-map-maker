// 色の扱い（16進数の検査、文字色の自動選択、既定のラインカラー）

/** 新しい路線に順番に割り当てる色（見分けやすいもの） */
export const LINE_PALETTE = [
  '#0079C2', '#E8541E', '#2E9E4F', '#D7263D', '#7A4FBF', '#F7A600',
  '#0E9AA7', '#8C6239', '#E85298', '#1E3A8A', '#9ACD32', '#6E7780',
];

/** 新しい事業者の色 */
export const OPERATOR_PALETTE = ['#0079C2', '#2E9E4F', '#D7263D', '#1E3A8A', '#E8541E', '#7A4FBF'];

/** @param {string} s */
export function isHexColor(s) {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

/**
 * '#abc' や 'abc' も受け付けて '#AABBCC' にそろえる。不正なら null
 * @param {string} s
 */
export function normalizeHex(s) {
  if (typeof s !== 'string') return null;
  let v = s.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
  return '#' + v.toUpperCase();
}

/** @param {string} hex */
export function hexToRgb(hex) {
  const v = normalizeHex(hex) || '#000000';
  return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
}

/** WCAG の相対輝度 */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** コントラスト比 */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * 背景色の上で読みやすい文字色（白か濃い灰色）
 * @param {string} bg
 */
export function readableTextColor(bg) {
  return contrastRatio(bg, '#FFFFFF') >= contrastRatio(bg, '#1F2933') ? '#FFFFFF' : '#1F2933';
}

/**
 * 使われている色の少ない順に次の色を選ぶ
 * @param {string[]} palette
 * @param {string[]} used
 */
export function nextColor(palette, used) {
  const count = new Map(palette.map((c) => [c, 0]));
  for (const u of used) {
    const k = normalizeHex(u);
    if (k && count.has(k)) count.set(k, count.get(k) + 1);
  }
  let best = palette[0];
  for (const c of palette) if (count.get(c) < count.get(best)) best = c;
  return best;
}

/** [r, g, b] を '#RRGGBB' にする */
export function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return ('#' + c(r) + c(g) + c(b)).toUpperCase();
}

/**
 * 2つの色を混ぜる（t = 0 なら a、1 なら b）
 * @param {string} a @param {string} b @param {number} t
 */
export function mix(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}

/**
 * 同じ明るさの灰色（モノクロ印刷用）
 * @param {string} hex
 */
export function toGray(hex) {
  // 相対輝度から、同じ輝度になる sRGB の値に戻す
  const l = luminance(hex);
  const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  const v = s * 255;
  return rgbToHex([v, v, v]);
}

// ---------- 色の差（CIEDE2000。§6.6 の「ラインカラーが似すぎ」） ----------

/**
 * sRGB の16進数を CIE L*a*b*（D65）にする
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToLab(hex) {
  const lin = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * CIEDE2000 の色差（Sharma ほか 2005 の式）
 * @param {[number, number, number]} lab1
 * @param {[number, number, number]} lab2
 */
export function ciede2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b, a) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lmp = (L1 + L2) / 2;
  const Cmp = (C1p + C2p) / 2;
  let hmp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hmp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    else hmp = (h1p + h2p) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hmp - 30) * rad) + 0.24 * Math.cos(2 * hmp * rad)
    + 0.32 * Math.cos((3 * hmp + 6) * rad) - 0.20 * Math.cos((4 * hmp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hmp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lmp - 50) ** 2) / Math.sqrt(20 + (Lmp - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp;
  const Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/**
 * 2つの16進数の色の差（CIEDE2000）
 * @param {string} a @param {string} b
 */
export function colorDistance(a, b) {
  return ciede2000(hexToLab(a), hexToLab(b));
}
