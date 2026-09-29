// 路線の駅の並び：並べ替え（ドラッグ・上下ボタン）、営業キロの入力、路線から外す
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, formatNumber } from '../i18n/i18n.js';
import { stopNumbers, fullCode } from '../core/numbering.js';
import { kmToUnit, unitToKm, round1 } from '../core/units.js';
import { numberInput } from './form.js';
import { enableRowDrag } from './row-drag.js';

/**
 * @param {{ store: any, es: any, back: () => void, activateStation: (id: string) => void }} ctx
 * @param {string} lineId
 */
export function createStopsEditor(ctx, lineId) {
  const { store } = ctx;
  const title = h('h3', { class: 'stops-title' });
  const note = h('p', { class: 'panel-note' });
  const list = h('ol', { class: 'stops-editor' });
  const el = h('div', { class: 'stops-wrap' },
    h('div', { class: 'stops-head' },
      h('button', { class: 'btn btn-small', type: 'button', on: { click: () => ctx.back() } }, icon('back'), t('data.backToLines')),
      title,
    ),
    note,
    list,
  );
  const detach = enableRowDrag(list, (from, to) => store.dispatch({ type: 'line/moveStop', lineId, from, to }));

  /** 行を作り直す（駅の数や順番が変わるたび。入力中の欄があれば作り直さない） */
  let lastKey = '';
  function update(p) {
    const line = p.lines.find((l) => l.id === lineId);
    if (!line) {
      ctx.back();
      return;
    }
    const unit = p.locale.distanceUnit;
    title.textContent = line.displayName || line.name;
    note.textContent = t('data.stopsHint', { unit: t('unit.' + unit + 'Name') });
    const key = JSON.stringify([line.stops, line.numbering, unit, p.stations.map((s) => s.name)]);
    if (key === lastKey || list.contains(document.activeElement)) return;
    lastKey = key;
    const byId = new Map(p.stations.map((s) => [s.id, s]));
    const numbers = stopNumbers(line);
    const n = line.stops.length;
    list.replaceChildren(...line.stops.map((s, i) => {
      const st = byId.get(s.stationId);
      const prev = i > 0 ? line.stops[i - 1].km : undefined;
      const interval = s.km !== undefined && prev !== undefined ? round1(kmToUnit(s.km - prev, unit)) : null;
      const km = numberInput({
        step: 0.1,
        min: 0,
        // 入力した値をそのまま持ち、表示だけ0.1単位にする（§6.3）
        onChange: (v) => store.dispatch({ type: 'line/stop', lineId, index: i, fields: { km: v === null ? undefined : unitToKm(v, unit) } }),
      });
      km.classList.add('stop-km');
      km.setAttribute('aria-label', t('data.kmOf', { name: (st && st.name) || '' }));
      km.setValue(s.km === undefined ? null : round1(kmToUnit(s.km, unit)));
      const move = (to) => store.dispatch({ type: 'line/moveStop', lineId, from: i, to });
      return h('li', { class: 'stop-row' },
        h('span', { class: 'drag-grip', dataset: { dragHandle: '' }, 'aria-hidden': 'true' }, icon('grip')),
        h('span', { class: 'stop-code' }, fullCode(line, numbers[i]) || String(i + 1)),
        h('button', { class: 'link-btn stop-name', type: 'button', on: { click: () => ctx.activateStation(s.stationId) } }, (st && st.name) || t('station.unnamed')),
        km,
        h('span', { class: 'stop-interval num' }, interval === null ? '' : t('data.interval', { value: formatNumber(interval, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })),
        h('span', { class: 'stop-buttons' },
          h('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': t('common.moveUp'), disabled: i === 0, on: { click: () => move(i - 1) } }, icon('arrowUp')),
          h('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': t('common.moveDown'), disabled: i === n - 1, on: { click: () => move(i + 1) } }, icon('arrowDown')),
          h('button', {
            class: 'btn btn-small',
            type: 'button',
            on: { click: () => store.dispatch({ type: 'line/removeStop', lineId, index: i }) },
          }, t('data.removeStop')),
        ),
      );
    }));
  }

  return { el, update, dispose: detach };
}
