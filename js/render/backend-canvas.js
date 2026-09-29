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

// ---------- 表示リストの描画 ----------

/**
 * 角を丸めた折れ線をなぞる。radii があれば頂点ごとの半径を使う
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[]} pts
 * @param {number} radius
 * @param {number[]} [radii]
 */
export function tracePath(ctx, pts, radius, radii) {
  const n = pts.length / 2;
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n - 1; i++) {
    const px = pts[2 * i - 2], py = pts[2 * i - 1];
    const cx = pts[2 * i], cy = pts[2 * i + 1];
    const nx = pts[2 * i + 2], ny = pts[2 * i + 3];
    const r0 = radii ? radii[i] : radius;
    const l1 = Math.hypot(cx - px, cy - py);
    const l2 = Math.hypot(nx - cx, ny - cy);
    let th = Math.abs(Math.atan2(ny - cy, nx - cx) - Math.atan2(cy - py, cx - px));
    if (th > Math.PI) th = 2 * Math.PI - th;
    if (!r0 || th < 1e-6 || l1 < 1e-6 || l2 < 1e-6) {
      ctx.lineTo(cx, cy);
      continue;
    }
    // 丸めの接点が線分の半分を超えないように半径を抑える
    const maxR = Math.min(l1, l2) / 2 / Math.tan(th / 2);
    ctx.arcTo(cx, cy, nx, ny, Math.min(r0, maxR));
  }
  ctx.lineTo(pts[2 * n - 2], pts[2 * n - 1]);
}

function intersects(b, v) {
  return !(b.maxX < v.minX || b.minX > v.maxX || b.maxY < v.minY || b.minY > v.maxY);
}

/**
 * @param {CanvasRenderingContext2D} ctx 世界座標の変換を設定済み
 * @param {any[]} items
 * @param {{ minX: number, minY: number, maxX: number, maxY: number } | null} visible 見えている範囲（外は描かない）
 */
export function drawItems(ctx, items, visible) {
  for (const it of items) {
    if (visible && !intersects(it.bbox, visible)) continue;
    ctx.globalAlpha = it.alpha ?? 1;
    switch (it.kind) {
      case 'path': drawPathItem(ctx, it); break;
      case 'circle': drawCircleItem(ctx, it); break;
      case 'capsule': drawCapsuleItem(ctx, it); break;
      case 'rrect': drawRRectItem(ctx, it); break;
      case 'text': drawTextItem(ctx, it); break;
      default: break;
    }
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

function drawPathItem(ctx, it) {
  ctx.lineCap = it.cap || 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(it.dash || []);
  ctx.beginPath();
  tracePath(ctx, it.pts, it.radius, it.radii);
  ctx.strokeStyle = it.color;
  ctx.lineWidth = it.width;
  ctx.stroke();
  if (it.inner) {
    ctx.setLineDash([]);
    ctx.strokeStyle = it.inner.color;
    ctx.lineWidth = it.inner.width;
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function fillStroke(ctx, it) {
  if (it.fill) {
    ctx.fillStyle = it.fill;
    ctx.fill();
  }
  if (it.stroke && it.lineWidth) {
    ctx.setLineDash(it.dash || []);
    ctx.strokeStyle = it.stroke;
    ctx.lineWidth = it.lineWidth;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawCircleItem(ctx, it) {
  ctx.beginPath();
  ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
  fillStroke(ctx, it);
}

/** 2点を結ぶ丸い端の四角（複数の路線が通る駅） */
function drawCapsuleItem(ctx, it) {
  const len = Math.hypot(it.x2 - it.x1, it.y2 - it.y1);
  const ang = Math.atan2(it.y2 - it.y1, it.x2 - it.x1);
  ctx.save();
  ctx.translate(it.x1, it.y1);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.roundRect(-it.r, -it.r, len + it.r * 2, it.r * 2, it.r);
  fillStroke(ctx, it);
  ctx.restore();
}

function drawRRectItem(ctx, it) {
  ctx.save();
  ctx.translate(it.x, it.y);
  if (it.angle) ctx.rotate(it.angle);
  ctx.beginPath();
  ctx.roundRect(-it.w / 2, -it.h / 2, it.w, it.h, it.r || 0);
  fillStroke(ctx, it);
  ctx.restore();
}

function drawTextItem(ctx, it) {
  ctx.save();
  ctx.translate(it.x, it.y);
  if (it.angle) ctx.rotate(it.angle);
  ctx.font = it.font;
  ctx.textAlign = it.align || 'left';
  ctx.textBaseline = it.baseline || 'middle';
  if (it.halo) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = it.halo;
    ctx.lineWidth = it.haloWidth || 3;
    ctx.strokeText(it.text, 0, 0);
  }
  ctx.fillStyle = it.color;
  ctx.fillText(it.text, 0, 0);
  ctx.restore();
}

/**
 * 文字の幅を測る関数（Canvas を1つ使い回す）
 * @returns {(font: string, text: string) => number}
 */
export function createMeasure() {
  const c = document.createElement('canvas');
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const cache = new Map();
  return (font, text) => {
    const k = font + '\u0000' + text;
    let w = cache.get(k);
    if (w === undefined) {
      ctx.font = font;
      w = ctx.measureText(text).width;
      if (cache.size > 5000) cache.clear();
      cache.set(k, w);
    }
    return w;
  };
}
