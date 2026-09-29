// 表（PC のデータ表）。行は鍵で使い回し、入力中の欄を書き換えない。
// 見出しを押すと並べ替え、行の入力欄以外を押すと onActivate を呼ぶ。
import { h } from './dom.js';
import { t, getUiLang } from '../i18n/i18n.js';

/**
 * @typedef {object} Cell
 * @property {HTMLElement} el
 * @property {(row: any) => void} update
 */

/**
 * @typedef {object} Column
 * @property {string} key
 * @property {string} label
 * @property {(row: any) => (string|number)} [sortValue] ないと並べ替えできない
 * @property {(row: any) => Cell} create
 * @property {string} [className]
 */

/**
 * @param {{
 *   columns: Column[],
 *   rowKey: (row: any) => string,
 *   onActivate?: (row: any) => void,
 *   caption?: string,
 * }} opt
 */
export function createGrid(opt) {
  let sortKey = '';
  let sortDir = 1;
  /** @type {Map<string, { tr: HTMLTableRowElement, cells: Cell[], row: any }>} */
  const rows = new Map();
  let lastRows = [];
  let onSortChange = () => {};

  const heads = opt.columns.map((c) => {
    const th = h('th', { scope: 'col', class: c.className || null });
    if (c.sortValue) {
      const b = h('button', {
        class: 'grid-sort',
        type: 'button',
        on: {
          click: () => {
            if (sortKey === c.key) sortDir = -sortDir;
            else {
              sortKey = c.key;
              sortDir = 1;
            }
            onSortChange();
            render(lastRows);
          },
        },
      }, c.label);
      th.append(b);
    } else {
      th.textContent = c.label;
    }
    return th;
  });
  const tbody = h('tbody');
  const table = h('table', { class: 'grid' },
    opt.caption ? h('caption', { class: 'visually-hidden' }, opt.caption) : null,
    h('thead', {}, h('tr', {}, heads)),
    tbody,
  );

  tbody.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('input, select, textarea, button, label')) return;
    const tr = target.closest('tr');
    if (!tr || !opt.onActivate) return;
    const r = rows.get(tr.dataset.key);
    if (r) opt.onActivate(r.row);
  });

  function sorted(list) {
    const col = opt.columns.find((c) => c.key === sortKey);
    if (!col || !col.sortValue) return list;
    const collator = new Intl.Collator(getUiLang(), { numeric: true });
    return [...list].sort((a, b) => {
      const va = col.sortValue(a);
      const vb = col.sortValue(b);
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : collator.compare(String(va), String(vb));
      return r * sortDir;
    });
  }

  /** @param {any[]} list */
  function render(list) {
    lastRows = list;
    const next = sorted(list);
    const keep = new Set();
    let prev = null;
    for (const row of next) {
      const key = opt.rowKey(row);
      keep.add(key);
      let r = rows.get(key);
      if (!r) {
        const cells = opt.columns.map((c) => c.create(row));
        const tr = /** @type {HTMLTableRowElement} */ (h('tr', { dataset: { key } }, cells.map((c, i) => h('td', { class: opt.columns[i].className || null }, c.el))));
        r = { tr, cells, row };
        rows.set(key, r);
      }
      r.row = row;
      r.cells.forEach((c) => c.update(row));
      // 並び順どおりに置く（動かす必要があるときだけ）
      const want = prev ? prev.nextSibling : tbody.firstChild;
      if (want !== r.tr) tbody.insertBefore(r.tr, want);
      prev = r.tr;
    }
    for (const [key, r] of rows) {
      if (!keep.has(key)) {
        r.tr.remove();
        rows.delete(key);
      }
    }
    heads.forEach((th, i) => {
      const c = opt.columns[i];
      th.setAttribute('aria-sort', c.key === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none');
    });
  }

  return {
    el: table,
    tbody,
    render,
    /** 並べ替えを解く（並び順の列で並べるときなど） */
    resetSort() {
      sortKey = '';
      sortDir = 1;
    },
    isSorted: () => !!sortKey,
    /** @param {() => void} fn */
    onSort(fn) {
      onSortChange = fn;
    },
    /** 選んでいる行に印を付ける @param {(key: string) => boolean} isSelected */
    markSelected(isSelected) {
      for (const [key, r] of rows) r.tr.classList.toggle('is-selected', isSelected(key));
    },
    empty: () => h('p', { class: 'panel-empty' }, t('data.empty')),
  };
}

/**
 * よく使う列の部品
 */
export const cells = {
  /** 文字だけ */
  text(get) {
    const el = h('span', {});
    return { el, update: (row) => { el.textContent = get(row) ?? ''; } };
  },
  /** 色の見本 */
  swatch(get) {
    const el = h('span', { class: 'swatch' });
    return { el, update: (row) => { el.style.background = get(row); } };
  },
};
