// データ表の各タブ（事業者・路線・駅・乗換）：行の作り方、PC の列、スマホのカード
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../i18n/i18n.js';
import { LINE_KINDS, LINE_STATUSES, STATION_RANKS, BADGE_SHAPES } from '../core/schema.js';
import { getRegion } from '../core/regions/index.js';
import { stationNumbers } from '../core/numbering.js';
import { matchesAny } from '../core/search.js';
import { readableTextColor } from '../core/color.js';
import { textInput, selectInput, numberInput, enumOptions } from './form.js';
import { cells } from './grid.js';

/**
 * @typedef {object} TabCtx
 * @property {any} store
 * @property {(sel: any, opt?: { reveal?: import('../core/schema.js').Station | null }) => void} activate
 * @property {(lineId: string) => void} openStops
 * @property {(lineId: string, delta: number) => void} moveLineOrder
 */

/** 入力欄のセル（値の取り出し方と、変えたときの処理） */
export function inputCell(make, get) {
  const el = make();
  el.classList.add('grid-input');
  return { el, update: (row) => el.setValue(get(row)) };
}

/** 行を1つ上・下へ（並走の並び順）とドラッグのつまみ */
function orderCell(ctx) {
  const up = h('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': t('common.moveUp') }, icon('arrowUp'));
  const down = h('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': t('common.moveDown') }, icon('arrowDown'));
  const grip = h('span', { class: 'drag-grip', dataset: { dragHandle: '' }, 'aria-hidden': 'true' }, icon('grip'));
  const el = h('span', { class: 'order-cell' }, grip, up, down);
  let id = '';
  up.addEventListener('click', () => ctx.moveLineOrder(id, -1));
  down.addEventListener('click', () => ctx.moveLineOrder(id, 1));
  return { el, update: (row) => { id = row.line.id; } };
}

/** @type {Record<string, { label: string, rows: Function, rowKey: Function, columns: Function, card: Function, activate: Function, selectedKey: Function }>} */
export const TABS = {
  operators: {
    label: 'data.tab.operators',
    rows(p, q) {
      return p.operators
        .filter((o) => matchesAny(q, [o.name, o.shortName, ...Object.values(o.names)]))
        .map((o) => ({ op: o, lineCount: p.lines.filter((l) => l.operatorId === o.id).length }));
    },
    rowKey: (r) => r.op.id,
    selectedKey: (sel) => (sel.type === 'operator' ? sel.id : null),
    columns(ctx) {
      const set = (row, fields) => ctx.store.dispatch({ type: 'operator/update', operatorId: row.op.id, fields });
      const region = getRegion(ctx.store.getState().locale.region);
      return [
        {
          key: 'color', label: t('common.color'), className: 'col-narrow',
          create: (row) => {
            const el = /** @type {HTMLInputElement & { setValue(v: string): void }} */ (h('input', { type: 'color', class: 'grid-color', 'aria-label': t('operator.color') }));
            let cur = row;
            el.addEventListener('change', () => set(cur, { color: el.value.toUpperCase(), textColor: readableTextColor(el.value) }));
            return { el, update: (r) => { cur = r; el.value = r.op.color.toLowerCase(); } };
          },
        },
        {
          key: 'name', label: t('operator.name'), sortValue: (r) => r.op.name,
          create: (row) => { let cur = row; return inputCell(() => textInput({ onChange: (v) => { if (v.trim()) set(cur, { name: v.trim() }); } }), (r) => { cur = r; return r.op.name; }); },
        },
        {
          key: 'short', label: t('operator.shortName'), sortValue: (r) => r.op.shortName,
          create: (row) => { let cur = row; return inputCell(() => textInput({ onChange: (v) => set(cur, { shortName: v.trim() || cur.op.name }) }), (r) => { cur = r; return r.op.shortName; }); },
        },
        {
          key: 'category', label: t('operator.category'), sortValue: (r) => region.operatorCategories.indexOf(r.op.category),
          create: (row) => {
            let cur = row;
            return inputCell(() => selectInput({ options: enumOptions(region.operatorCategories, (v) => t(region.operatorCategoryKeyPrefix + v)), onChange: (v) => set(cur, { category: v }) }), (r) => { cur = r; return r.op.category; });
          },
        },
        {
          key: 'badge', label: t('operator.badgeShape'),
          create: (row) => {
            let cur = row;
            return inputCell(() => selectInput({ options: enumOptions(BADGE_SHAPES, (v) => t('badgeShape.' + v)), onChange: (v) => set(cur, { badgeShape: v }) }), (r) => { cur = r; return r.op.badgeShape; });
          },
        },
        { key: 'lines', label: t('data.col.lines'), className: 'num', sortValue: (r) => r.lineCount, create: () => cells.text((r) => String(r.lineCount)) },
      ];
    },
    card: (r) => ({ color: r.op.color, title: r.op.name, sub: `${t('operatorCategory.' + r.op.category)}${t('common.dot')}${t('data.lineCount', { count: r.lineCount })}` }),
    activate: (r, ctx) => ctx.activate({ type: 'operator', id: r.op.id }),
  },

  lines: {
    label: 'data.tab.lines',
    rows(p, q) {
      const ops = new Map(p.operators.map((o) => [o.id, o]));
      return [...p.lines]
        .sort((a, b) => a.order - b.order)
        .filter((l) => matchesAny(q, [l.name, l.displayName, l.symbol, ...Object.values(l.names)]))
        .map((l, i) => ({ line: l, operator: ops.get(l.operatorId), index: i }));
    },
    rowKey: (r) => r.line.id,
    selectedKey: (sel) => (sel.type === 'line' || sel.type === 'section' ? sel.lineId : null),
    columns(ctx) {
      const set = (row, fields) => ctx.store.dispatch({ type: 'line/update', lineId: row.line.id, fields });
      return [
        { key: 'order', label: t('data.col.order'), className: 'col-order', create: () => orderCell(ctx) },
        {
          key: 'color', label: t('common.color'), className: 'col-narrow',
          create: (row) => {
            const el = /** @type {HTMLInputElement} */ (h('input', { type: 'color', class: 'grid-color', 'aria-label': t('line.color') }));
            let cur = row;
            el.addEventListener('change', () => set(cur, { color: el.value.toUpperCase() }));
            return { el, update: (r) => { cur = r; el.value = r.line.color.toLowerCase(); } };
          },
        },
        {
          key: 'symbol', label: t('line.symbol'), className: 'col-short', sortValue: (r) => r.line.symbol,
          create: (row) => { let cur = row; return inputCell(() => textInput({ maxLength: 4, onChange: (v) => set(cur, { symbol: v.trim() }) }), (r) => { cur = r; return r.line.symbol; }); },
        },
        {
          key: 'name', label: t('line.name'), sortValue: (r) => r.line.name,
          create: (row) => { let cur = row; return inputCell(() => textInput({ onChange: (v) => { if (v.trim()) set(cur, { name: v.trim() }); } }), (r) => { cur = r; return r.line.name; }); },
        },
        {
          key: 'operator', label: t('line.operator'), sortValue: (r) => (r.operator ? r.operator.name : ''),
          create: (row) => {
            let cur = row;
            const el = selectInput({ options: [], onChange: (v) => set(cur, { operatorId: v }) });
            el.classList.add('grid-input');
            return {
              el,
              update: (r) => {
                cur = r;
                el.setOptions(ctx.store.getState().operators.map((o) => ({ value: o.id, label: o.name })));
                el.setValue(r.line.operatorId);
              },
            };
          },
        },
        {
          key: 'kind', label: t('line.kind'), sortValue: (r) => LINE_KINDS.indexOf(r.line.kind),
          create: (row) => { let cur = row; return inputCell(() => selectInput({ options: enumOptions(LINE_KINDS, (v) => t('lineKind.' + v)), onChange: (v) => set(cur, { kind: v }) }), (r) => { cur = r; return r.line.kind; }); },
        },
        {
          key: 'status', label: t('line.status'), sortValue: (r) => LINE_STATUSES.indexOf(r.line.status),
          create: (row) => { let cur = row; return inputCell(() => selectInput({ options: enumOptions(LINE_STATUSES, (v) => t('status.' + v)), onChange: (v) => set(cur, { status: v }) }), (r) => { cur = r; return r.line.status; }); },
        },
        { key: 'stops', label: t('data.col.stations'), className: 'num', sortValue: (r) => r.line.stops.length, create: () => cells.text((r) => String(r.line.stops.length)) },
        {
          key: 'actions', label: t('data.col.actions'),
          create: (row) => {
            let cur = row;
            const el = h('span', { class: 'grid-actions' },
              h('button', { class: 'btn btn-small', type: 'button', on: { click: () => ctx.openStops(cur.line.id) } }, t('data.stops')),
              h('button', {
                class: 'btn btn-small',
                type: 'button',
                on: { click: () => ctx.store.dispatch({ type: 'line/duplicate', lineId: cur.line.id }) },
              }, t('common.duplicate')),
            );
            return { el, update: (r) => { cur = r; } };
          },
        },
      ];
    },
    card: (r) => ({
      color: r.line.color,
      title: r.line.displayName || r.line.name,
      sub: [r.line.symbol, r.operator && r.operator.name, t('lineKind.' + r.line.kind), t('data.stationCount', { count: r.line.stops.length })].filter(Boolean).join(t('common.dot')),
      line: r.line,
    }),
    activate: (r, ctx) => ctx.activate({ type: 'line', lineId: r.line.id }),
  },

  stations: {
    label: 'data.tab.stations',
    rows(p, q) {
      return p.stations
        .map((st) => {
          const nums = stationNumbers(p, st.id);
          return { st, codes: nums.map((n) => n.code), lines: p.lines.filter((l) => l.stops.some((s) => s.stationId === st.id)) };
        })
        .filter((r) => matchesAny(q, [r.st.name, r.st.reading, ...Object.values(r.st.names), r.st.subName, r.st.code3, ...r.codes]));
    },
    rowKey: (r) => r.st.id,
    selectedKey: (sel) => (sel.type === 'stations' && sel.ids.length === 1 ? sel.ids[0] : null),
    columns(ctx) {
      const set = (row, fields) => ctx.store.dispatch({ type: 'station/update', stationId: row.st.id, fields });
      return [
        {
          key: 'name', label: t('station.name'), sortValue: (r) => r.st.reading || r.st.name,
          create: (row) => { let cur = row; return inputCell(() => textInput({ onChange: (v) => set(cur, { name: v.trim() }) }), (r) => { cur = r; return r.st.name; }); },
        },
        {
          key: 'reading', label: t('station.reading'), sortValue: (r) => r.st.reading || '',
          create: (row) => { let cur = row; return inputCell(() => textInput({ inputMode: 'kana', onChange: (v) => set(cur, { reading: v.trim() }) }), (r) => { cur = r; return r.st.reading || ''; }); },
        },
        {
          key: 'en', label: t('common.nameEn'), sortValue: (r) => r.st.names.en || '',
          create: (row) => {
            let cur = row;
            const el = textInput({ lang: 'en', onChange: (v) => set(cur, { names: { ...cur.st.names, en: v.trim() || undefined } }) });
            el.classList.add('grid-input');
            return { el, update: (r) => { cur = r; el.setValue(r.st.names.en || ''); el.disabled = r.st.autoRomanize; } };
          },
        },
        {
          key: 'rank', label: t('station.rank'), sortValue: (r) => STATION_RANKS.indexOf(r.st.rank),
          create: (row) => { let cur = row; return inputCell(() => selectInput({ options: enumOptions(STATION_RANKS, (v) => t('rank.' + v)), onChange: (v) => set(cur, { rank: v }) }), (r) => { cur = r; return r.st.rank; }); },
        },
        { key: 'codes', label: t('data.col.numbers'), sortValue: (r) => r.codes.join(' '), create: () => cells.text((r) => r.codes.join(' ')) },
        { key: 'lines', label: t('data.col.lines'), sortValue: (r) => r.lines.length, create: () => cells.text((r) => r.lines.map((l) => l.displayName || l.name).join(t('common.listSep'))) },
      ];
    },
    card: (r) => ({
      color: r.lines[0] ? r.lines[0].color : '',
      title: r.st.name || t('station.unnamed'),
      sub: [r.st.reading, r.st.names.en, r.codes.join(' ')].filter(Boolean).join(t('common.dot')),
    }),
    activate: (r, ctx) => ctx.activate({ type: 'stations', ids: [r.st.id] }, { reveal: r.st }),
  },

  interchanges: {
    label: 'data.tab.interchanges',
    rows(p, q) {
      const name = (id) => p.stations.find((s) => s.id === id)?.name || t('station.unnamed');
      return p.interchanges
        .map((ic) => ({ ic, names: ic.stationIds.map(name) }))
        .filter((r) => matchesAny(q, r.names));
    },
    rowKey: (r) => r.ic.id,
    selectedKey: (sel) => (sel.type === 'interchange' ? sel.id : null),
    columns(ctx) {
      const set = (row, fields) => ctx.store.dispatch({ type: 'interchange/update', interchangeId: row.ic.id, fields });
      return [
        { key: 'names', label: t('interchange.stations'), sortValue: (r) => r.names.join(' '), create: () => cells.text((r) => r.names.join(t('common.listSep'))) },
        {
          key: 'walk', label: t('interchange.walkMinutes'), className: 'num', sortValue: (r) => r.ic.walkMinutes,
          create: (row) => {
            let cur = row;
            return inputCell(() => numberInput({ min: 0, max: 60, step: 1, onChange: (v) => { if (v !== null && v >= 0) set(cur, { walkMinutes: Math.round(v) }); } }), (r) => { cur = r; return r.ic.walkMinutes; });
          },
        },
        {
          key: 'connector', label: t('interchange.showConnector'),
          create: (row) => {
            let cur = row;
            const el = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', class: 'grid-check', 'aria-label': t('interchange.showConnector') }));
            el.addEventListener('change', () => set(cur, { showConnector: el.checked }));
            return { el, update: (r) => { cur = r; el.checked = r.ic.showConnector; } };
          },
        },
      ];
    },
    card: (r) => ({ color: '', title: r.names.join(t('common.listSep')), sub: t('unit.minutes', { value: r.ic.walkMinutes }) }),
    activate: (r, ctx) => ctx.activate({ type: 'interchange', id: r.ic.id }),
  },
};

export const TAB_ORDER = ['operators', 'lines', 'stations', 'interchanges'];
