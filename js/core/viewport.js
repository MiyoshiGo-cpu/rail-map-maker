// 表示位置と倍率の計算（路線図ビュー）。
// 座標は3種類：格子（整数）→ 世界（ズーム1の px。格子1マス＝GRID px）→ 画面（キャンバスの CSS px）
// ViewState { cx, cy, zoom } は、画面の中心に来る世界座標と倍率。

/** 格子1マスの大きさ（ズーム1の px。§5.1） */
export const GRID = 24;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

/** @typedef {import('./schema.js').ViewState} ViewState */
/** @typedef {{ width: number, height: number }} Size */

/** @param {number} z */
export function clampZoom(z) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/**
 * @param {ViewState} v @param {Size} size @param {number} wx @param {number} wy
 * @returns {{ x: number, y: number }}
 */
export function worldToScreen(v, size, wx, wy) {
  return { x: (wx - v.cx) * v.zoom + size.width / 2, y: (wy - v.cy) * v.zoom + size.height / 2 };
}

/**
 * @param {ViewState} v @param {Size} size @param {number} sx @param {number} sy
 * @returns {{ x: number, y: number }}
 */
export function screenToWorld(v, size, sx, sy) {
  return { x: (sx - size.width / 2) / v.zoom + v.cx, y: (sy - size.height / 2) / v.zoom + v.cy };
}

/**
 * 世界座標に最も近い格子点
 * @param {number} wx @param {number} wy
 */
export function snapToGrid(wx, wy) {
  // + 0 で -0 を 0 にする（JSON の往復で値が変わらないように）
  return { x: Math.round(wx / GRID) + 0, y: Math.round(wy / GRID) + 0 };
}

/**
 * 画面の点を動かさずに倍率を変える
 * @param {ViewState} v @param {Size} size @param {number} sx @param {number} sy @param {number} factor
 * @returns {ViewState}
 */
export function zoomAt(v, size, sx, sy, factor) {
  const zoom = clampZoom(v.zoom * factor);
  const w = screenToWorld(v, size, sx, sy);
  // 同じ世界座標が同じ画面の点に来るように中心を動かす
  return {
    zoom,
    cx: w.x - (sx - size.width / 2) / zoom,
    cy: w.y - (sy - size.height / 2) / zoom,
  };
}

/**
 * 画面上で (dx, dy) だけ動かす
 * @param {ViewState} v @param {number} dx @param {number} dy
 * @returns {ViewState}
 */
export function panBy(v, dx, dy) {
  return { zoom: v.zoom, cx: v.cx - dx / v.zoom, cy: v.cy - dy / v.zoom };
}

/**
 * 世界座標の範囲が画面に収まる表示。insets は画面の端で隠れている部分（スマホのボトムシートなど）
 * @param {{ minX: number, minY: number, maxX: number, maxY: number } | null} b
 * @param {Size} size
 * @param {{ padding?: number, maxZoom?: number, insets?: { top: number, right: number, bottom: number, left: number } }} [opt]
 * @returns {ViewState}
 */
export function fitBounds(b, size, opt = {}) {
  const padding = opt.padding ?? 48;
  const maxZoom = opt.maxZoom ?? 2;
  const ins = opt.insets || { top: 0, right: 0, bottom: 0, left: 0 };
  if (!b) return { cx: 0, cy: 0, zoom: 1 };
  const w = Math.max(b.maxX - b.minX, 1);
  const h = Math.max(b.maxY - b.minY, 1);
  const availW = Math.max(size.width - ins.left - ins.right - padding * 2, 40);
  const availH = Math.max(size.height - ins.top - ins.bottom - padding * 2, 40);
  const zoom = clampZoom(Math.min(availW / w, availH / h, maxZoom));
  // 見えている部分の中心に範囲の中心が来るようにする
  const offX = (ins.left - ins.right) / 2 / zoom;
  const offY = (ins.top - ins.bottom) / 2 / zoom;
  return { cx: (b.minX + b.maxX) / 2 - offX, cy: (b.minY + b.maxY) / 2 - offY, zoom };
}

/**
 * 画面に見えている世界座標の範囲
 * @param {ViewState} v @param {Size} size
 */
export function visibleWorldRect(v, size) {
  const a = screenToWorld(v, size, 0, 0);
  const b = screenToWorld(v, size, size.width, size.height);
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
}

/**
 * 駅の路線図座標の範囲（世界座標）。駅がなければ null
 * @param {import('./schema.js').Station[]} stations
 */
export function stationBounds(stations) {
  let b = null;
  for (const s of stations) {
    if (!s.schematic) continue;
    const x = s.schematic.x * GRID;
    const y = s.schematic.y * GRID;
    if (!b) b = { minX: x, minY: y, maxX: x, maxY: y };
    else {
      b.minX = Math.min(b.minX, x);
      b.minY = Math.min(b.minY, y);
      b.maxX = Math.max(b.maxX, x);
      b.maxY = Math.max(b.maxY, y);
    }
  }
  return b;
}
