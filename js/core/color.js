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
