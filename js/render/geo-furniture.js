// 地理ビューの縮尺バーと方位記号（§5.4）。DOM に依存しない。
// 画面の px の座標で表示リストの要素にして、画面と書き出しで同じものを描く。
// 縮尺バーは左下（スマホではシートの上）に、1・2・5 の区切りの長さで 140px 以内。方位記号は左上。
import { mapFont } from './styles.js';

const INK = '#1F2933';
const PAPER = 'rgba(255,255,255,0.85)';
/** 縮尺バーの長さの区切り（1・2・5 × 10 のべき） */
const NICE = [1, 2, 5];
const KM_PER_MILE = 1.609344;

/** @typedef {{ top: number, right: number, bottom: number, left: number }} Insets */
/** @typedef {(font: string, text: string) => number} Measure */

/**
 * 縮尺バーの長さ（1・2・5 × 10 のべきのうち、maxPx 以内でいちばん長いもの）
 * @param {number} pxPerUnit 1単位（km か mi）の画面の長さ
 * @param {number} maxPx
 * @returns {{ n: number, len: number } | null}
 */
export function niceScaleLength(pxPerUnit, maxPx) {
  let best = null;
  for (let e = -2; e <= 4; e++) {
    for (const m of NICE) {
      const n = m * 10 ** e;
      const len = n * pxPerUnit;
      if (len <= maxPx && (!best || len > best.len)) best = { n, len };
    }
  }
  return best;
}

/** 数を短く（0.5・10・200） */
const numText = (n) => String(Math.round(n * 1000) / 1000);

const box = (x, y, w, h) => ({ minX: x, minY: y, maxX: x + w, maxY: y + h });

/**
 * 縮尺バー
 * @param {{
 *   pxPerKm: number,
 *   width: number,
 *   height: number,
 *   insets: Insets,
 *   style: import('../core/schema.js').MapStyle,
 *   mapT: (key: string, vars?: any) => string,
 *   distanceUnit: 'km'|'mi',
 *   measure: Measure,
 * }} o
 * @returns {any[]}
 */
export function scaleBarItems(o) {
  const mile = o.distanceUnit === 'mi';
  const best = niceScaleLength(o.pxPerKm * (mile ? KM_PER_MILE : 1), Math.min(140, o.width * 0.4));
  if (!best) return [];
  const text = o.mapT(mile ? 'map.scale.mi' : 'map.scale.km', { n: numText(best.n) });
  const font = mapFont(o.style, 11, 600);
  const tw = o.measure(font, text);
  const x = o.insets.left + 12;
  const y = o.height - o.insets.bottom - 14;
  const barH = 5;
  const half = best.len / 2;
  const bgW = Math.max(best.len, tw) + 12;
  return [
    // 地（読みやすいように白い板を敷く）
    { kind: 'rrect', x: x - 6 + bgW / 2, y: y - 7, w: bgW, h: 30, r: 4, fill: PAPER, bbox: box(x - 6, y - 22, bgW, 30) },
    // 半分ずつ黒と白の帯と、全体の縁
    { kind: 'rrect', x: x + half / 2, y: y - barH / 2, w: half, h: barH, r: 0, fill: INK, bbox: box(x, y - barH, half, barH) },
    { kind: 'rrect', x: x + half * 1.5, y: y - barH / 2, w: half, h: barH, r: 0, fill: '#FFFFFF', bbox: box(x + half, y - barH, half, barH) },
    { kind: 'rrect', x: x + best.len / 2, y: y - barH / 2, w: best.len - 1, h: barH - 1, r: 0, stroke: INK, lineWidth: 1, bbox: box(x, y - barH, best.len, barH) },
    { kind: 'text', x, y: y - barH - 4, text, font, color: INK, align: 'left', baseline: 'alphabetic', bbox: box(x, y - barH - 16, tw, 14) },
  ];
}

/**
 * 方位記号（北を指す矢じりと N）
 * @param {{ insets: Insets, style: import('../core/schema.js').MapStyle, mapT: (key: string, vars?: any) => string }} o
 * @returns {any[]}
 */
export function northArrowItems(o) {
  const cx = o.insets.left + 28;
  const cy = o.insets.top + 32;
  const top = cy - 5;
  const bottom = cy + 14;
  const b = box(cx - 19, cy - 19, 38, 38);
  return [
    { kind: 'circle', x: cx, y: cy, r: 19, fill: PAPER, bbox: b },
    // 矢じり：左半分を塗り、右半分は白
    { kind: 'poly', pts: [cx, top, cx - 6, bottom, cx, bottom - 4], fill: INK, bbox: b },
    { kind: 'poly', pts: [cx, top, cx + 6, bottom, cx, bottom - 4], fill: '#FFFFFF', stroke: INK, lineWidth: 1, bbox: b },
    { kind: 'text', x: cx, y: top - 2, text: o.mapT('map.north'), font: mapFont(o.style, 10, 700), color: INK, align: 'center', baseline: 'alphabetic', bbox: b },
  ];
}
