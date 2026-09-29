// データ表のフェーズ2のタブ（種別）：行の作り方、PC の列、スマホのカード
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../i18n/i18n.js';
import { STOP_RULES, SEATINGS } from '../core/schema.js';
import { matchesAny } from '../core/search.js';
import { readableTextColor } from '../core/color.js';
import { typesOfOperator } from '../core/actions/service-types.js';
import { textInput, selectInput, numberInput, enumOptions } from './form.js';
import { inputCell } from './data-tabs.js';
import { cells } from './grid.js';

/** チェックボックスのセル */
function checkCell(label, get, onChange) {
  const el = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', class: 'grid-check', 'aria-label': label }));
  let cur = null;
  el.addEventListener('change', () => onChange(cur, el.checked));
  return { el, update: (r) => { cur = r; el.checked = get(r); } };
}

/** 種別を遅い方・速い方へ動かすボタン */
function typeOrderCell(ctx) {
  const up = h('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': t('serviceType.moveSlower'), title: t('serviceType.moveSlower') }, icon('arrowUp'));
  const down = h('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': t('serviceType.moveFaster'), title: t('serviceType.moveFaster') }, icon('arrowDown'));
  const el = h('span', { class: 'order-cell' }, up, down);
  let row = null;
  const move = (delta) => ctx.store.dispatch({ type: 'serviceType/move', typeId: row.type.id, delta });
  up.addEventListener('click', () => move(-1));
  down.addEventListener('click', () => move(1));
  return { el, update: (r) => { row = r; up.disabled = r.pos === 0; down.disabled = r.pos === r.count - 1; } };
}

/** @type {Record<string, any>} */
export const SERVICE_TABS = {
  serviceTypes: {
    label: 'data.tab.serviceTypes',
    empty: 'data.noTypes',
    // 事業者の順に、それぞれ遅い順（rank の小さい順）に並べる
    rows(p, q) {
      const out = [];
      for (const op of p.operators) {
        const list = typesOfOperator(p.serviceTypes, op.id);
        list.forEach(({ type }, pos) => {
          if (!matchesAny(q, [type.name, type.shortName, ...Object.values(type.names), op.name, op.shortName])) return;
          out.push({ type, operator: op, pos, count: list.length });
        });
      }
      return out;
    },
    rowKey: (r) => r.type.id,
    selectedKey: (sel) => (sel.type === 'serviceType' ? sel.id : null),
    columns(ctx) {
      const set = (row, fields) => ctx.store.dispatch({ type: 'serviceType/update', typeId: row.type.id, fields });
      return [
        { key: 'order', label: t('data.col.order'), className: 'col-order', create: () => typeOrderCell(ctx) },
        {
          key: 'color', label: t('common.color'), className: 'col-narrow',
          create: (row) => {
            const el = /** @type {HTMLInputElement} */ (h('input', { type: 'color', class: 'grid-color', 'aria-label': t('common.color') }));
            let cur = row;
            el.addEventListener('change', () => set(cur, { color: el.value.toUpperCase(), textColor: readableTextColor(el.value) }));
            return { el, update: (r) => { cur = r; el.value = r.type.color.toLowerCase(); } };
          },
        },
        { key: 'operator', label: t('serviceType.operator'), sortValue: (r) => r.operator.name, create: () => cells.text((r) => r.operator.name) },
        {
          key: 'name', label: t('serviceType.name'), sortValue: (r) => r.type.name,
          create: (row) => { let cur = row; return inputCell(() => textInput({ onChange: (v) => { if (v.trim()) set(cur, { name: v.trim() }); } }), (r) => { cur = r; return r.type.name; }); },
        },
        {
          key: 'short', label: t('serviceType.shortName'), className: 'col-short', sortValue: (r) => r.type.shortName,
          create: (row) => { let cur = row; return inputCell(() => textInput({ maxLength: 4, onChange: (v) => set(cur, { shortName: v.trim() || cur.type.name }) }), (r) => { cur = r; return r.type.shortName; }); },
        },
        {
          key: 'rank', label: t('serviceType.rank'), className: 'num col-short', sortValue: (r) => r.type.rank,
          create: (row) => { let cur = row; return inputCell(() => numberInput({ step: 1, min: 0, max: 99, onChange: (v) => { if (v !== null) set(cur, { rank: Math.round(v) }); } }), (r) => { cur = r; return r.type.rank; }); },
        },
        {
          key: 'rule', label: t('serviceType.stopRule'), sortValue: (r) => STOP_RULES.indexOf(r.type.stopRule.base),
          create: (row) => {
            let cur = row;
            return inputCell(() => selectInput({ options: enumOptions(STOP_RULES, (v) => t('stopRule.' + v)), onChange: (v) => set(cur, { stopRule: { ...cur.type.stopRule, base: v } }) }), (r) => { cur = r; return r.type.stopRule.base; });
          },
        },
        {
          key: 'interchanges', label: t('serviceType.stopAtInterchangesShort'),
          create: () => checkCell(t('serviceType.stopAtInterchangesShort'), (r) => r.type.stopRule.interchanges, (r, v) => set(r, { stopRule: { ...r.type.stopRule, interchanges: v } })),
        },
        {
          key: 'dwell', label: t('serviceType.dwellSec'), className: 'num col-short', sortValue: (r) => r.type.dwellSec,
          create: (row) => { let cur = row; return inputCell(() => numberInput({ step: 5, min: 0, max: 600, onChange: (v) => { if (v !== null && v >= 0) set(cur, { dwellSec: Math.round(v) }); } }), (r) => { cur = r; return r.type.dwellSec; }); },
        },
        {
          key: 'surcharge', label: t('serviceType.surchargeShort'),
          create: () => checkCell(t('serviceType.surcharge'), (r) => r.type.surcharge, (r, v) => set(r, { surcharge: v })),
        },
        {
          key: 'seating', label: t('serviceType.seating'), sortValue: (r) => SEATINGS.indexOf(r.type.seating),
          create: (row) => { let cur = row; return inputCell(() => selectInput({ options: enumOptions(SEATINGS, (v) => t('seating.' + v)), onChange: (v) => set(cur, { seating: v }) }), (r) => { cur = r; return r.type.seating; }); },
        },
      ];
    },
    card: (r) => ({
      color: r.type.color,
      title: r.type.name,
      sub: [r.operator.shortName || r.operator.name, r.type.shortName, t('serviceType.rankValue', { value: r.type.rank }), t('stopRule.' + r.type.stopRule.base)].filter(Boolean).join(t('common.dot')),
    }),
    activate: (r, ctx) => ctx.activate({ type: 'serviceType', id: r.type.id }),
  },
};

export const SERVICE_TAB_ORDER = ['serviceTypes'];
