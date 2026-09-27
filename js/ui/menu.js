// 小さなメニュー（ボタンの下・タップした位置に出す）
import { h } from './dom.js';

/**
 * @typedef {object} MenuItem
 * @property {string} [label]
 * @property {() => void} [onSelect]
 * @property {boolean} [danger]
 * @property {boolean} [disabled]
 * @property {boolean} [separator]
 */

let current = null;

export function closeMenu() {
  if (current) {
    current.remove();
    current = null;
  }
}

/**
 * @param {{ x: number, y: number } | Element} at 位置か、下に出す要素
 * @param {MenuItem[]} items
 * @param {{ label?: string }} [opt]
 */
export function openMenu(at, items, opt = {}) {
  closeMenu();
  const menu = h('div', { class: 'menu', role: 'menu', 'aria-label': opt.label || null });
  for (const it of items) {
    if (it.separator) {
      menu.append(h('div', { class: 'menu-sep', role: 'separator' }));
      continue;
    }
    menu.append(h('button', {
      class: 'menu-item',
      type: 'button',
      role: 'menuitem',
      disabled: !!it.disabled,
      dataset: it.danger ? { danger: '' } : undefined,
      on: {
        click: () => {
          closeMenu();
          if (it.onSelect) it.onSelect();
        },
      },
    }, it.label));
  }
  document.body.append(menu);
  current = menu;

  // 位置：画面からはみ出さないように
  let x;
  let y;
  if (at instanceof Element) {
    const r = at.getBoundingClientRect();
    x = r.right - menu.offsetWidth;
    y = r.bottom + 4;
  } else {
    x = at.x;
    y = at.y;
  }
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  x = Math.max(8, Math.min(x, vw - menu.offsetWidth - 8));
  if (y + menu.offsetHeight > vh - 8) y = Math.max(8, vh - menu.offsetHeight - 8);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const first = menu.querySelector('.menu-item:not([disabled])');
  if (first) /** @type {HTMLElement} */ (first).focus();

  menu.addEventListener('keydown', (e) => {
    const items2 = [...menu.querySelectorAll('.menu-item:not([disabled])')];
    const i = items2.indexOf(/** @type {Element} */ (document.activeElement));
    if (e.key === 'Escape') { closeMenu(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { /** @type {HTMLElement} */ (items2[(i + 1) % items2.length]).focus(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { /** @type {HTMLElement} */ (items2[(i - 1 + items2.length) % items2.length]).focus(); e.preventDefault(); }
  });
  // 外側を押したら閉じる（開いた操作そのものでは閉じない）
  setTimeout(() => {
    const onDown = (e) => {
      if (!current || current.contains(/** @type {Node} */ (e.target))) return;
      closeMenu();
      document.removeEventListener('pointerdown', onDown, true);
    };
    document.addEventListener('pointerdown', onDown, true);
  }, 0);
  return menu;
}
