// 描画の見た目（線の描き分け・書体）。値の元は Project.style（MapStyle）
// 長さはすべて世界座標の px（ズーム1基準）。

/** 地図に描く文字の書体（OS 標準） */
const FONT_STACKS = {
  gothic: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Meiryo", system-ui, sans-serif',
  mincho: '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif',
  maru: '"Hiragino Maru Gothic ProN", "Yu Gothic", "Meiryo", sans-serif',
};

export const MAP_INK = '#1F2933';
export const MAP_PAPER = '#FFFFFF';
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
 * @returns {StrokeStyle}
 */
export function strokeFor(style, kind, status, color) {
  const w = style.lineWidth;
  /** @type {StrokeStyle} */
  const s = { color, width: w, dash: null, alpha: 1, inner: null, hidden: false };
  switch (kind) {
    case 'shinkansen':
      s.width = w * 1.3;
      s.inner = { color: MAP_PAPER, width: Math.max(1, w * 0.3) };
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
