// Pointer Events でマウス・タッチ・ペンを一本化し、タップ・ドラッグ・長押し・ダブルタップ・ピンチに分ける（§4.4）
//
// タップかドラッグかは、タッチなら8px、マウス・ペンなら4px 動いたかで判定する。
// 長押しは500ms。ダブルタップは300ms以内・24px以内の2回目のタップ。

const MOVE_THRESHOLD = { touch: 8, mouse: 4, pen: 4 };
const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DIST = 24;

/**
 * @typedef {object} GesturePoint
 * @property {number} x キャンバス内の CSS px
 * @property {number} y
 * @property {string} pointerType 'mouse' | 'touch' | 'pen'
 * @property {boolean} shiftKey
 * @property {boolean} ctrlKey
 * @property {boolean} metaKey
 * @property {number} button
 */

/**
 * @typedef {object} DragHandler
 * @property {(p: GesturePoint) => void} move
 * @property {(p: GesturePoint) => void} end
 * @property {() => void} [cancel] 2本目の指が触れたときなど
 */

/**
 * @typedef {object} GestureHandlers
 * @property {(p: GesturePoint) => void} [onTap]
 * @property {(p: GesturePoint) => void} [onDoubleTap]
 * @property {(p: GesturePoint) => void} [onLongPress] 右クリックもこれで受ける
 * @property {(p: GesturePoint) => DragHandler | null | undefined} [onDragStart] null ならパン
 * @property {(p: GesturePoint) => DragHandler} onPanStart パン（何もないところのドラッグ・中ボタン）
 * @property {() => void} [onPinchStart]
 * @property {(e: { cx: number, cy: number, scale: number, dx: number, dy: number }) => void} onPinch 前回からの変化
 * @property {() => void} [onPinchEnd]
 * @property {(p: GesturePoint, deltaY: number, e: WheelEvent) => void} [onWheel]
 * @property {(p: GesturePoint) => void} [onHover] ボタンを押していないマウスの移動
 */

/**
 * @param {HTMLElement} el
 * @param {GestureHandlers} handlers
 * @returns {() => void} 解除する関数
 */
export function attachGestures(el, handlers) {
  /** @type {Map<number, { x: number, y: number, type: string }>} */
  const pointers = new Map();
  /** 1本指の状態 */
  let single = null;
  /** ピンチの状態 */
  let pinch = null;
  let lastTap = null;

  /** @param {PointerEvent | MouseEvent} e @returns {GesturePoint} */
  function point(e) {
    const r = el.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      pointerType: /** @type {PointerEvent} */ (e).pointerType || 'mouse',
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      button: e.button,
    };
  }

  function clearLongPress() {
    if (single && single.timer) {
      clearTimeout(single.timer);
      single.timer = null;
    }
  }

  function startPinch() {
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    if (handlers.onPinchStart) handlers.onPinchStart();
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button === 2) return; // 右クリックは contextmenu で扱う
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // 合成イベントなどで捕捉できなくても続ける
    }
    const p = point(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y, type: p.pointerType });

    if (pointers.size === 2) {
      // 2本目の指：1本指の操作をやめてピンチにする
      if (single) {
        clearLongPress();
        if (single.drag && single.drag.cancel) single.drag.cancel();
        single = null;
      }
      startPinch();
      e.preventDefault();
      return;
    }
    if (pointers.size > 2) return;

    single = {
      id: e.pointerId,
      start: p,
      last: p,
      drag: null,
      moved: false,
      middle: e.pointerType === 'mouse' && e.button === 1,
      timer: null,
      longPressed: false,
    };
    if (!single.middle) {
      const s = single;
      s.timer = setTimeout(() => {
        s.timer = null;
        if (single !== s || s.moved) return;
        s.longPressed = true;
        if (handlers.onLongPress) handlers.onLongPress(s.start);
      }, LONG_PRESS_MS);
    }
    e.preventDefault();
  }

  function onMove(e) {
    const p = point(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse' && handlers.onHover) handlers.onHover(p);
      return;
    }
    pointers.set(e.pointerId, { x: p.x, y: p.y, type: p.pointerType });

    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      handlers.onPinch({ cx, cy, scale: dist / pinch.dist, dx: cx - pinch.cx, dy: cy - pinch.cy });
      pinch = { dist, cx, cy };
      return;
    }
    if (!single || single.id !== e.pointerId || single.longPressed) return;
    single.last = p;
    if (!single.moved) {
      const th = MOVE_THRESHOLD[p.pointerType] ?? 4;
      if (Math.hypot(p.x - single.start.x, p.y - single.start.y) < th) return;
      single.moved = true;
      clearLongPress();
      let drag = null;
      if (!single.middle && handlers.onDragStart) drag = handlers.onDragStart(single.start);
      single.drag = drag || handlers.onPanStart(single.start);
    }
    single.drag.move(p);
  }

  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = point(e);
    pointers.delete(e.pointerId);
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);

    if (pinch) {
      if (pointers.size < 2) {
        pinch = null;
        if (handlers.onPinchEnd) handlers.onPinchEnd();
      }
      return;
    }
    if (!single || single.id !== e.pointerId) return;
    const s = single;
    single = null;
    clearLongPress();
    if (s.timer) clearTimeout(s.timer);
    if (e.type === 'pointercancel') {
      if (s.drag && s.drag.cancel) s.drag.cancel();
      return;
    }
    if (s.moved) {
      s.drag.end(p);
      return;
    }
    if (s.longPressed || s.middle) return;
    // タップ・ダブルタップ
    const now = performance.now();
    if (lastTap && now - lastTap.time < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < DOUBLE_TAP_DIST) {
      lastTap = null;
      if (handlers.onTap) handlers.onTap(s.start);
      if (handlers.onDoubleTap) handlers.onDoubleTap(s.start);
      return;
    }
    lastTap = { time: now, x: p.x, y: p.y };
    if (handlers.onTap) handlers.onTap(s.start);
  }

  function onContextMenu(e) {
    e.preventDefault();
    if (handlers.onLongPress && e.pointerType !== 'touch') handlers.onLongPress(point(e));
  }

  function onWheel(e) {
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= 400;
    if (handlers.onWheel) handlers.onWheel(point(e), dy, e);
  }

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('contextmenu', onContextMenu);
  el.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('contextmenu', onContextMenu);
    el.removeEventListener('wheel', onWheel);
  };
}
