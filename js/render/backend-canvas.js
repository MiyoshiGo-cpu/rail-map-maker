// Canvas 2D の描画：高精細（devicePixelRatio）への合わせ込み、格子、表示リストの描画
import { GRID, visibleWorldRect } from '../core/viewport.js';
import { luminance } from '../core/color.js';

/** iPhone の canvas の上限（約1,600万画素）を超えないようにする */
const MAX_CANVAS_PIXELS = 16_000_000;

/**
 * キャンバスの画素数を CSS の大きさ × 倍率に合わせる
 * @param {HTMLCanvasElement} canvas
 * @param {number} cssW
 * @param {number} cssH
 * @returns {number} 実際に使う倍率
 */
export function fitCanvas(canvas, cssW, cssH) {
  let dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
  if (cssW * cssH * dpr * dpr > MAX_CANVAS_PIXELS) dpr = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, cssW * cssH));
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return dpr;
}

/**
 * 世界座標で描けるように変換行列を設定する
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../core/viewport.js').ViewState} v
 * @param {{ width: number, height: number }} size CSS px
 * @param {number} dpr
 */
export function setWorldTransform(ctx, v, size, dpr) {
  const z = v.zoom * dpr;
  ctx.setTransform(z, 0, 0, z, dpr * (size.width / 2 - v.cx * v.zoom), dpr * (size.height / 2 - v.cy * v.zoom));
}

/**
 * 背景と格子。線は画面の画素にそろえて描く
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../core/viewport.js').ViewState} v
 * @param {{ width: number, height: number }} size
 * @param {number} dpr
 * @param {{ background: string, showGrid: boolean }} style
 */
export function drawBackground(ctx, v, size, dpr, style) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, size.width, size.height);
  if (!style.showGrid) return;

  const dark = luminance(style.background) < 0.3;
  const minor = dark ? 'rgba(255,255,255,0.07)' : 'rgba(31,41,51,0.07)';
  const major = dark ? 'rgba(255,255,255,0.14)' : 'rgba(31,41,51,0.14)';
  const step = GRID * v.zoom;
  const r = visibleWorldRect(v, size);
  const gx0 = Math.floor(r.minX / GRID);
  const gx1 = Math.ceil(r.maxX / GRID);
  const gy0 = Math.floor(r.minY / GRID);
  const gy1 = Math.ceil(r.maxY / GRID);
  const toSx = (gx) => (gx * GRID - v.cx) * v.zoom + size.width / 2;
  const toSy = (gy) => (gy * GRID - v.cy) * v.zoom + size.height / 2;
  // 1px の線を画素の中央に置いてにじませない
  const align = (s) => Math.round(s) + 0.5;

  // 線の間隔が画面で8px以上のときだけ描く（1マスごとの線と、5マスごとの濃い線）
  for (const [every, color] of [[1, minor], [5, major]]) {
    if (step * every < 8) continue;
    ctx.beginPath();
    for (let gx = Math.ceil(gx0 / every) * every; gx <= gx1; gx += every) {
      if (every === 1 && gx % 5 === 0) continue;
      const x = align(toSx(gx));
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size.height);
    }
    for (let gy = Math.ceil(gy0 / every) * every; gy <= gy1; gy += every) {
      if (every === 1 && gy % 5 === 0) continue;
      const y = align(toSy(gy));
      ctx.moveTo(0, y);
      ctx.lineTo(size.width, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
