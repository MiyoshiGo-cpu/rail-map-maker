// 路線図のキャンバス：大きさの追従、描画の予約、パン・ズーム（ホイール・ピンチ・ボタン）、全体表示。
// ツールの操作（タップ・ドラッグなど）は setInput で受け取った関数に渡す。
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../i18n/i18n.js';
import { attachGestures } from './gestures.js';
import { fitCanvas, drawBackground, setWorldTransform } from '../render/backend-canvas.js';
import { zoomAt, panBy, fitBounds, screenToWorld } from '../core/viewport.js';

/** @typedef {import('../core/viewport.js').ViewState} ViewState */
/** @typedef {import('./gestures.js').GesturePoint} GesturePoint */

/**
 * @typedef {object} CanvasInput ツール側が受け取る操作。座標は世界座標（world）と画面座標（p）の両方を渡す
 * @property {(p: GesturePoint, world: { x: number, y: number }) => void} [onTap]
 * @property {(p: GesturePoint, world: { x: number, y: number }) => boolean} [onDoubleTap] true なら既定の拡大をしない
 * @property {(p: GesturePoint, world: { x: number, y: number }) => void} [onLongPress]
 * @property {(p: GesturePoint, world: { x: number, y: number }) => import('./gestures.js').DragHandler | null} [onDragStart]
 * @property {(p: GesturePoint, world: { x: number, y: number }) => void} [onHover]
 */

/**
 * @param {{
 *   getStyle: () => { background: string, showGrid: boolean },
 *   initialView: ViewState,
 *   onViewChange: (v: ViewState) => void,
 *   getBounds: () => ({ minX: number, minY: number, maxX: number, maxY: number } | null),
 *   getInsets?: () => { top: number, right: number, bottom: number, left: number },
 * }} opt
 */
export function createCanvasView(opt) {
  const canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { class: 'ed-canvas', role: 'img', 'aria-label': t('views.schematic') }));
  const zoomIn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('canvas.zoomIn'), title: t('canvas.zoomIn'), on: { click: () => zoomBy(1.25) } }, icon('plus'));
  const zoomOut = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('canvas.zoomOut'), title: t('canvas.zoomOut'), on: { click: () => zoomBy(0.8) } }, icon('minus'));
  const fitBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('canvas.fit'), title: t('canvas.fit'), on: { click: () => fitAll() } }, icon('fit'));
  const hint = h('p', { class: 'ed-hint', hidden: true });
  const controls = h('div', { class: 'zoom-ctl on-paper' }, zoomIn, zoomOut, fitBtn);
  const el = h('div', { class: 'canvas-view' }, canvas, controls, hint);

  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  let size = { width: 1, height: 1 };
  let dpr = 1;
  /** @type {ViewState} */
  let view = { ...opt.initialView };
  let frame = 0;
  /** @type {CanvasInput} */
  let input = {};
  /** 描画の追加（表示リスト・ツールの重ね描き）。世界座標の変換を設定した状態で呼ぶ */
  /** @type {((ctx: CanvasRenderingContext2D, view: ViewState, size: { width: number, height: number }, dpr: number) => void)[]} */
  const layers = [];
  let viewTimer = null;
  let firstLayout = true;

  function requestRender() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  function draw() {
    drawBackground(ctx, view, size, dpr, opt.getStyle());
    for (const layer of layers) {
      setWorldTransform(ctx, view, size, dpr);
      ctx.save();
      layer(ctx, view, size, dpr);
      ctx.restore();
    }
  }

  /** @param {ViewState} v */
  function setView(v) {
    view = v;
    requestRender();
    // 表示位置の保存は、動かし終わってから少し待ってまとめて行う
    clearTimeout(viewTimer);
    viewTimer = setTimeout(() => opt.onViewChange(view), 400);
  }

  function zoomBy(factor) {
    currentSize();
    setView(zoomAt(view, size, size.width / 2, size.height / 2, factor));
  }

  function fitAll() {
    currentSize();
    const insets = opt.getInsets ? opt.getInsets() : undefined;
    setView(fitBounds(opt.getBounds(), size, { padding: Math.min(48, size.width / 8), insets }));
  }

  /** 大きさをまだ測っていなければ（最初の描画の前など）、その場で測る */
  function currentSize() {
    if (size.width <= 1 || size.height <= 1) {
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) size = { width: r.width, height: r.height };
    }
    return size;
  }
  const world = (p) => screenToWorld(view, currentSize(), p.x, p.y);

  // 大きさの追従
  const ro = new ResizeObserver(() => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    size = { width: r.width, height: r.height };
    dpr = fitCanvas(canvas, r.width, r.height);
    if (firstLayout) {
      firstLayout = false;
      // 初めて開いたとき（表示位置が既定のまま）で駅があれば全体を表示
      const v = opt.initialView;
      if (v.cx === 0 && v.cy === 0 && v.zoom === 1 && opt.getBounds()) fitAll();
    }
    draw();
  });
  ro.observe(el);

  const detach = attachGestures(canvas, {
    onTap: (p) => input.onTap && input.onTap(p, world(p)),
    onDoubleTap: (p) => {
      if (input.onDoubleTap && input.onDoubleTap(p, world(p))) return;
      setView(zoomAt(view, size, p.x, p.y, 1.6));
    },
    onLongPress: (p) => input.onLongPress && input.onLongPress(p, world(p)),
    onDragStart: (p) => (input.onDragStart ? input.onDragStart(p, world(p)) : null),
    onPanStart: (p) => {
      let last = p;
      return {
        move(q) {
          const dx = q.x - last.x;
          const dy = q.y - last.y;
          last = q;
          setView(panBy(view, dx, dy));
        },
        end() {},
      };
    },
    onPinch: (e) => {
      let v = panBy(view, e.dx, e.dy);
      v = zoomAt(v, size, e.cx, e.cy, e.scale);
      setView(v);
    },
    onWheel: (p, dy, e) => {
      // ホイールは拡大縮小（トラックパッドのピンチは ctrlKey 付きで届く）
      const k = e.ctrlKey ? 0.01 : 0.0015;
      setView(zoomAt(view, size, p.x, p.y, Math.exp(-dy * k)));
    },
    onHover: (p) => input.onHover && input.onHover(p, world(p)),
  });

  return {
    el,
    canvas,
    requestRender,
    /** @param {CanvasInput} next */
    setInput(next) {
      input = next || {};
    },
    /** ズームボタンの上にボタンを足す @param {HTMLElement} btn */
    addControl(btn) {
      controls.prepend(btn);
    },
    /** @param {(ctx: CanvasRenderingContext2D, view: ViewState, size: { width: number, height: number }, dpr: number) => void} fn */
    addLayer(fn) {
      layers.push(fn);
    },
    getView: () => view,
    getSize: () => currentSize(),
    setView,
    zoomBy,
    fitAll,
    /** 世界座標の点が画面の中に入るように動かす（入っていれば何もしない） */
    reveal(wx, wy) {
      currentSize();
      const s = { x: (wx - view.cx) * view.zoom + size.width / 2, y: (wy - view.cy) * view.zoom + size.height / 2 };
      const m = 48;
      if (s.x < m || s.y < m || s.x > size.width - m || s.y > size.height - m) setView({ ...view, cx: wx, cy: wy });
    },
    /** @param {string | null} text 何もない画面での案内 */
    setHint(text) {
      hint.hidden = !text;
      hint.textContent = text || '';
    },
    /** @param {string} cursor */
    setCursor(cursor) {
      canvas.style.cursor = cursor;
    },
    dispose() {
      ro.disconnect();
      detach();
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(viewTimer);
      opt.onViewChange(view);
    },
  };
}
