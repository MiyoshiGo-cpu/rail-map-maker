// データ表のフェーズ2のタブ（種別・系統）：行の作り方、PC の列、スマホのカード
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, formatDuration, formatNumber } from '../i18n/i18n.js';
import { STOP_RULES, SEATINGS } from '../core/schema.js';
import { matchesAny } from '../core/search.js';
import { readableTextColor } from '../core/color.js';
import { typesOfOperator } from '../core/actions/service-types.js';
import { expandService, stopFlags } from '../core/services.js';
import { serviceRuntime } from '../core/runtime.js';
import { allLineKm } from '../core/distance.js';
import { serviceLabel, serviceColor, isThrough, routeText } from './service-ui.js';
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

/** 系統の行：経路・所要時間などをまとめて計算しておく */
function serviceRows(p, q) {
  const kms = allLineKm(p);
  const stName = (id) => p.stations.find((s) => s.id === id)?.name || '';
  return p.services.map((sv) => {
    const path = expandService(p, sv);
    const flags = stopFlags(p, sv, path);
    const rt = serviceRuntime(p, sv, { path, flags, kms });
    const first = sv.segments[0];
    const last = sv.segments[sv.segments.length - 1];
    return {
      sv,
      label: serviceLabel(p, sv),
      color: serviceColor(p, sv),
      from: first ? stName(first.from) : '',
      to: last ? stName(last.to) : '',
      route: routeText(p, sv.segments),
      types: [...new Set(sv.segments.map((seg) => p.serviceTypes.find((x) => x.id === seg.typeId)?.name || ''))].join(t('service.arrow')),
      through: isThrough(p, sv),
      rt,
      ok: path.ok,
    };
  }).filter((r) => matchesAny(q, [r.sv.name, r.label, r.from, r.to, r.route, r.types]));
}

/** 所要時間の表示（計算できなければ「—」） */
const timeText = (r) => (r.rt ? formatDuration(r.rt.totalSec) : t('service.noValue'));
const speedText = (r) => (r.rt ? formatNumber(r.rt.scheduledSpeed, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : t('service.noValue'));

SERVICE_TABS.services = {
  label: 'data.tab.services',
  empty: 'data.noServices',
  rows: serviceRows,
  rowKey: (r) => r.sv.id,
  selectedKey: (sel) => (sel.type === 'service' ? sel.id : null),
  columns(ctx) {
    const set = (row, fields) => ctx.store.dispatch({ type: 'service/update', serviceId: row.sv.id, fields });
    return [
      { key: 'color', label: t('common.color'), className: 'col-narrow', create: () => cells.swatch((r) => r.color) },
      {
        key: 'name', label: t('service.name'), sortValue: (r) => r.sv.name || '',
        create: (row) => { let cur = row; return inputCell(() => textInput({ onChange: (v) => set(cur, { name: v.trim() || undefined }) }), (r) => { cur = r; return r.sv.name || ''; }); },
      },
      { key: 'types', label: t('data.col.types'), sortValue: (r) => r.types, create: () => cells.text((r) => r.types) },
      { key: 'from', label: t('route.from'), sortValue: (r) => r.from, create: () => cells.text((r) => r.from) },
      { key: 'to', label: t('route.to'), sortValue: (r) => r.to, create: () => cells.text((r) => r.to) },
      { key: 'route', label: t('data.col.route'), sortValue: (r) => r.route, create: () => cells.text((r) => (r.ok ? r.route : t('service.brokenShort'))) },
      { key: 'through', label: t('service.through'), sortValue: (r) => (r.through ? 1 : 0), create: () => cells.text((r) => (r.through ? t('service.through') : '')) },
      { key: 'stops', label: t('data.col.stopCount'), className: 'num', sortValue: (r) => (r.rt ? r.rt.stopCount : -1), create: () => cells.text((r) => (r.rt ? String(r.rt.stopCount) : t('service.noValue'))) },
      { key: 'time', label: t('data.col.time'), className: 'num', sortValue: (r) => (r.rt ? r.rt.totalSec : -1), create: () => cells.text(timeText) },
      { key: 'speed', label: t('data.col.speed'), className: 'num', sortValue: (r) => (r.rt ? r.rt.scheduledSpeed : -1), create: () => cells.text(speedText) },
      {
        key: 'day', label: t('data.col.dayFrequency'), className: 'num col-short', sortValue: (r) => r.sv.frequency.day,
        create: (row) => { let cur = row; return inputCell(() => numberInput({ step: 1, min: 0, max: 60, onChange: (v) => { if (v !== null && v >= 0) set(cur, { frequency: { ...cur.sv.frequency, day: Math.round(v) } }); } }), (r) => { cur = r; return r.sv.frequency.day; }); },
      },
      {
        key: 'cars', label: t('service.cars'), className: 'num col-short', sortValue: (r) => r.sv.cars || 0,
        create: (row) => { let cur = row; return inputCell(() => numberInput({ step: 1, min: 1, max: 20, onChange: (v) => set(cur, { cars: v === null ? undefined : Math.max(1, Math.round(v)) }) }), (r) => { cur = r; return r.sv.cars ?? null; }); },
      },
    ];
  },
  card: (r) => ({
    color: r.color,
    title: r.label,
    sub: [r.ok ? r.route : t('service.brokenShort'), r.through ? t('service.through') : '', r.rt ? formatDuration(r.rt.totalSec) : ''].filter(Boolean).join(t('common.dot')),
  }),
  activate: (r, ctx) => ctx.activate({ type: 'service', id: r.sv.id }),
};

export const SERVICE_TAB_ORDER = ['serviceTypes', 'services'];
