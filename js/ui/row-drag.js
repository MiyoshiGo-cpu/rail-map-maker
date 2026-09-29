// 行のドラッグで順番を入れ替える（表の行・カード・駅の一覧で共通）。
// つまみ（[data-drag-handle]）を押してから上下に動かし、離したところへ移す。

/**
 * @param {HTMLElement} container 行の親（tbody や ul）
 * @param {(from: number, to: number) => void} onMove 元の位置と、移したい位置（並べ直したあとの位置）
 * @returns {() => void} 解除する関数
 */
export function enableRowDrag(container, onMove) {
  let drag = null;

  const rowsOf = () => /** @type {HTMLElement[]} */ ([...container.children]);

  function onDown(e) {
    const handle = /** @type {HTMLElement} */ (e.target).closest('[data-drag-handle]');
    if (!handle || !container.contains(handle)) return;
    // つまみを含む、container の直下の要素（行）
    let row = handle;
    while (row && row.parentElement !== container) row = row.parentElement;
    if (!row) return;
    e.preventDefault();
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // 捕捉できなくても続ける
    }
    const list = rowsOf();
    drag = { handle, row, from: list.indexOf(row), to: list.indexOf(row), y0: e.clientY };
    row.classList.add('is-dragging');
  }

  function onMoveEv(e) {
    if (!drag) return;
    const dy = e.clientY - drag.y0;
    drag.row.style.transform = `translateY(${dy}px)`;
    // 指の位置より上にある行の数が、移す先の位置
    const list = rowsOf().filter((r) => r !== drag.row);
    let to = 0;
    for (const r of list) {
      const b = r.getBoundingClientRect();
      if (e.clientY > b.top + b.height / 2) to++;
    }
    drag.to = to;
    rowsOf().forEach((r) => r.classList.toggle('drop-before', r !== drag.row && list.indexOf(r) === to));
  }

  function onUp() {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.row.style.transform = '';
    d.row.classList.remove('is-dragging');
    rowsOf().forEach((r) => r.classList.remove('drop-before'));
    if (d.to !== d.from) onMove(d.from, d.to);
  }

  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMoveEv);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);
  return () => {
    container.removeEventListener('pointerdown', onDown);
    container.removeEventListener('pointermove', onMoveEv);
    container.removeEventListener('pointerup', onUp);
    container.removeEventListener('pointercancel', onUp);
  };
}
