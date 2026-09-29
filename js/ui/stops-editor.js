// 路線の駅の並び：並べ替え（ドラッグ・上下ボタン）、営業キロの入力、路線から外す
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, formatNumber } from '../i18n/i18n.js';
import { stopNumbers, fullCode } from '../core/numbering.js';
import { kmToUnit, unitToKm, round1 } from '../core/units.js';
import { lineKm } from '../core/distance.js';
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
  // 環状線の「起点に戻る」の行（並べ替えの対象にしないので、一覧の外に置く）
  const loopRow = h('div', { class: 'stops-editor stops-loop' });
  const el = h('div', { class: 'stops-wrap' },
    h('div', { class: 'stops-head' },
      h('button', { class: 'btn btn-small', type: 'button', on: { click: () => ctx.back() } }, icon('back'), t('data.backToLines')),
      title,
    ),
    note,
    list,
    loopRow,
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
    const key = JSON.stringify([line.stops, line.isLoop, line.loopKm, line.kind, line.numbering, unit, p.stations.map((s) => s.name)]);
    if (key === lastKey || el.contains(document.activeElement)) return;
    lastKey = key;
    const byId = new Map(p.stations.map((s) => [s.id, s]));
    const numbers = stopNumbers(line);
    const lk = lineKm(p, line, byId);
    const n = line.stops.length;
    const fmt = (v) => formatNumber(round1(kmToUnit(v, unit)), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    /** 駅間の表示（概算なら印を付ける） */
    const intervalText = (sec) => {
      if (!sec) return '';
      const v = t('data.interval', { value: fmt(sec.km) });
      return sec.source === 'estimate' ? t('km.withEstimated', { value: v }) : v;
    };
    /** 営業キロの入力欄（空欄のときは計算した値を薄く出す） */
    const kmInput = (value, computed, label, onChange) => {
      const el = numberInput({ step: 0.1, min: 0, onChange });
      el.classList.add('stop-km');
      el.setAttribute('aria-label', label);
      el.setValue(value === undefined ? null : round1(kmToUnit(value, unit)));
      el.placeholder = computed === undefined ? '' : fmt(computed);
      return el;
    };
    const rows = line.stops.map((s, i) => {
      const st = byId.get(s.stationId);
      // 入力した値をそのまま持ち、表示だけ0.1単位にする（§6.3）
      const km = kmInput(s.km, lk.stops[i], t('data.kmOf', { name: (st && st.name) || '' }),
        (v) => store.dispatch({ type: 'line/stop', lineId, index: i, fields: { km: v === null ? undefined : unitToKm(v, unit) } }));
      const move = (to) => store.dispatch({ type: 'line/moveStop', lineId, from: i, to });
      return h('li', { class: 'stop-row' },
        h('span', { class: 'drag-grip', dataset: { dragHandle: '' }, 'aria-hidden': 'true' }, icon('grip')),
        h('span', { class: 'stop-code' }, fullCode(line, numbers[i]) || String(i + 1)),
        h('button', { class: 'link-btn stop-name', type: 'button', on: { click: () => ctx.activateStation(s.stationId) } }, (st && st.name) || t('station.unnamed')),
        km,
        h('span', { class: 'stop-interval num' }, i > 0 ? intervalText(lk.sections[i - 1]) : ''),
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
    });
    // 環状線：最後の駅から起点に戻る区間は、一周の営業キロで決める
    if (line.isLoop && lk.sections.length === n) {
      const loop = kmInput(line.loopKm, lk.total, t('km.loopOf', { name: line.displayName || line.name }),
        (v) => store.dispatch({ type: 'line/update', lineId, fields: { loopKm: v === null ? undefined : unitToKm(v, unit) } }));
      loopRow.replaceChildren(h('div', { class: 'stop-row' },
        h('span', { class: 'drag-grip is-placeholder', 'aria-hidden': 'true' }),
        h('span', { class: 'stop-code' }),
        h('span', { class: 'stop-name' }, t('km.loopBack')),
        loop,
        h('span', { class: 'stop-interval num' }, intervalText(lk.sections[n - 1])),
        h('span', { class: 'stop-buttons' }),
      ));
    } else {
      loopRow.replaceChildren();
    }
    list.replaceChildren(...rows);
  }

  return { el, update, dispose: detach };
}
