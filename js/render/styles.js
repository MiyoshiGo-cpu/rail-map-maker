// 描画の見た目（線の描き分け・書体・色づかい）。値の元は Project.style（MapStyle）
// 長さはすべて世界座標の px（ズーム1基準）。
import { mix, toGray } from '../core/color.js';

/** 地図に描く文字の書体（OS 標準） */
const FONT_STACKS = {
  gothic: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Meiryo", system-ui, sans-serif',
  mincho: '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif',
  maru: '"Hiragino Maru Gothic ProN", "HGMaruGothicMPRO", "Yu Gothic", "Meiryo", sans-serif',
};

export const MAP_INK = '#1F2933';
export const MAP_PAPER = '#FFFFFF';

/** 文字と駅の縁の色 @param {import('../core/schema.js').MapStyle} style */
export const inkOf = (style) => style.ink || MAP_INK;
/** 駅の地と、文字の縁取りの色 @param {import('../core/schema.js').MapStyle} style */
export const paperOf = (style) => style.paper || MAP_PAPER;
/** 副表記など、少し薄い文字の色 @param {import('../core/schema.js').MapStyle} style */
export const subInkOf = (style) => mix(inkOf(style), style.background || MAP_PAPER, 0.3);

/**
 * 色づかいに合わせた色（モノクロなら同じ明るさの灰色、明るくするなら白を混ぜる）
 * @param {import('../core/schema.js').MapStyle} style
 * @param {string} color
 */
export function tone(style, color) {
  if (style.colorMode === 'mono') return toGray(color);
  if (style.colorMode === 'bright') return mix(color, '#FFFFFF', 0.18);
  return color;
}

/** モノクロで路線を区別する濃淡と破線（並び順で割り当てる） */
const MONO_SHADES = ['#222222', '#666666', '#9A9A9A'];
const MONO_DASHES = [null, [1.8, 0.9], [0.35, 0.9], [2.2, 0.7, 0.35, 0.7]];

/**
 * 路線の基本の色と破線（状態による描き分けの前）
 * @param {import('../core/schema.js').MapStyle} style
 * @param {string} color 路線の色
 * @param {number} index 路線の並び順（モノクロの区別に使う）
 * @returns {{ color: string, dash: number[] | null }}
 */
export function lineAppearance(style, color, index) {
  if (style.colorMode !== 'mono') return { color: tone(style, color), dash: null };
  const i = Math.max(0, index);
  const d = MONO_DASHES[Math.floor(i / MONO_SHADES.length) % MONO_DASHES.length];
  return { color: MONO_SHADES[i % MONO_SHADES.length], dash: d ? d.map((x) => x * style.lineWidth) : null };
}
const GRAY = '#9AA5B1';
const FREIGHT_GRAY = '#7B8794';

/**
 * @param {import('../core/schema.js').MapStyle} style
 * @param {number} size
 * @param {number} [weight]
 */
export function mapFont(style, size, weight = 500) {
  return `${weight} ${size}px ${FONT_STACKS[style.fontFamily] || FONT_STACKS.gothic}`;
}

/**
 * @typedef {object} StrokeStyle
 * @property {string} color
 * @property {number} width
 * @property {number[] | null} dash
 * @property {number} alpha
 * @property {{ color: string, width: number } | null} inner 中央の細線（新幹線）
 * @property {boolean} hidden
 */

/**
 * 路線の種類と状態による線の描き分け（§5.1）
 * @param {import('../core/schema.js').MapStyle} style
 * @param {string} kind
 * @param {string} status
 * @param {string} color
 * @param {number} [index] 路線の並び順（モノクロの区別に使う）
 * @param {number} [unit] 画面の1px に当たる長さ（地理ビューで、決まった太さを縮尺に合わせる）
 * @returns {StrokeStyle}
 */
export function strokeFor(style, kind, status, color, index = 0, unit = 1) {
  const w = style.lineWidth;
  const base = lineAppearance(style, color, index);
  /** @type {StrokeStyle} */
  const s = { color: base.color, width: w, dash: base.dash, alpha: 1, inner: null, hidden: false };
  switch (kind) {
    case 'shinkansen':
      s.width = w * 1.3;
      s.inner = { color: paperOf(style), width: Math.max(unit, w * 0.3) };
      break;
    case 'tram':
      s.width = w * 0.6;
      break;
    case 'cable':
      s.width = w * 0.5;
      s.dash = [w * 0.9, w * 0.6];
      break;
    case 'freight':
      s.width = w * 0.5;
      s.color = FREIGHT_GRAY;
      break;
    default:
      break;
  }
  switch (status) {
    case 'construction':
      s.dash = [w * 1.6, w];
      break;
    case 'planned':
      s.dash = [w * 0.5, w * 0.8];
      s.alpha = 0.5;
      break;
    case 'suspended':
      s.color = GRAY;
      break;
    case 'abolished':
      s.hidden = !style.showAbolished;
      s.color = GRAY;
      s.dash = [w * 0.5, w * 0.8];
      s.alpha = 0.5;
      break;
    default:
      break;
  }
  return s;
}

/** 並走するときの線どうしの間隔（線の中心どうし） */
export function bundleSpacing(style) {
  return style.lineWidth + style.lineGap;
}
