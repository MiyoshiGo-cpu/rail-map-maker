// ラインカラーのパレット：よく使われる色（地域パック）・最近使った色（端末ごと）・16進数の入力
import { h } from './dom.js';
import { t } from '../i18n/i18n.js';
import { normalizeHex } from '../core/color.js';

const RECENT_KEY = 'rmm:recentColors';
const RECENT_MAX = 8;

/** 最近使った色（新しい順）。保存できない環境では空 */
export function recentColors() {
  try {
    const list = JSON.parse(globalThis.localStorage?.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.map(normalizeHex).filter(Boolean).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** 最近使った色に足す @param {string} hex */
export function rememberColor(hex) {
  const c = normalizeHex(hex);
  if (!c) return;
  try {
    const list = [c, ...recentColors().filter((x) => x !== c)].slice(0, RECENT_MAX);
    globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // 保存できなくても色は変える
  }
}

let current = null;
function closePalette() {
  if (current) {
    current.el.remove();
    document.removeEventListener('pointerdown', current.onDown, true);
    current = null;
  }
}

/**
 * パレットを開く（ボタンの下に出す）
 * @param {HTMLElement} anchor
 * @param {{ value: string, palette: { id: string, hex: string }[], onPick: (hex: string) => void }} opt
 */
export function openColorPalette(anchor, opt) {
  closePalette();
  const pick = (hex) => {
    const c = normalizeHex(hex);
    if (!c) return;
    rememberColor(c);
    closePalette();
    opt.onPick(c);
  };
  const swatch = (hex, name) => h('button', {
    class: ['palette-swatch', normalizeHex(opt.value) === hex ? 'is-current' : ''],
    type: 'button',
    title: name ? `${name} ${hex}` : hex,
    'aria-label': name ? `${name} ${hex}` : hex,
    style: { background: hex },
    on: { click: () => pick(hex) },
  });
  const hexInput = /** @type {HTMLInputElement} */ (h('input', {
    class: 'input',
    type: 'text',
    maxlength: 7,
    value: normalizeHex(opt.value) || '',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': t('palette.hex'),
    on: { keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); pick(hexInput.value); } } },
  }));
  const recent = recentColors();
  const el = h('div', { class: 'palette', role: 'dialog', 'aria-label': t('palette.title') },
    h('p', { class: 'palette-head' }, t('palette.common')),
    h('div', { class: 'palette-grid' }, opt.palette.map((x) => swatch(x.hex, t('palette.' + x.id)))),
    recent.length ? h('p', { class: 'palette-head' }, t('palette.recent')) : null,
    recent.length ? h('div', { class: 'palette-grid' }, recent.map((c) => swatch(c, ''))) : null,
    h('div', { class: 'palette-hex' },
      hexInput,
      h('button', { class: 'btn btn-small', type: 'button', on: { click: () => pick(hexInput.value) } }, t('palette.apply')),
    ),
  );
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closePalette(); anchor.focus(); } });
  document.body.append(el);
  // 位置：ボタンの下か上の、広い方に出す（入りきらなければ中をスクロール）
  const r = anchor.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  el.style.left = Math.max(8, Math.min(r.left, vw - el.offsetWidth - 8)) + 'px';
  const below = vh - r.bottom - 12;
  const above = r.top - 12;
  if (below >= 320 || below >= above) {
    el.style.top = r.bottom + 4 + 'px';
    el.style.maxHeight = below + 'px';
  } else {
    el.style.bottom = vh - r.top + 4 + 'px';
    el.style.maxHeight = above + 'px';
  }
  const first = el.querySelector('.palette-swatch');
  if (first) /** @type {HTMLElement} */ (first).focus();
  // 外側を押したら閉じる
  const onDown = (e) => { if (!el.contains(e.target) && e.target !== anchor) closePalette(); };
  setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
  current = { el, onDown };
}
