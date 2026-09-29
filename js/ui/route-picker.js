// 系統の経路を選ぶ部品：始発駅・終着駅（一覧か地図のタップ）、経由する路線、経路の候補。
// 新しい系統を作るときと、経路を組み直すときに使う。選んでいる途中の値は editor-state の routeDraft に持つ。
import { h } from './dom.js';
import { t, formatDistance } from '../i18n/i18n.js';
import { findRoutes } from '../core/network.js';
import { field, selectInput } from './form.js';
import { stationOptions, typeOptions, routeText } from './service-ui.js';

const NONE = '';

/**
 * @param {{ store: any, es: any, toast: (m: string) => void }} ctx
 * @param {{ onPick: (route: any[], draft: import('./editor-state.js').RouteDraft) => void }} opt
 */
export function createRoutePicker(ctx, opt) {
  const { store, es } = ctx;
  const draft = () => es.get().routeDraft;
  const setDraft = (fields) => es.set({ routeDraft: { ...draft(), ...fields } });
  const btn = (label, onClick, cls = 'btn btn-small') => h('button', { class: cls, type: 'button', on: { click: onClick } }, label);

  const from = selectInput({ options: [], onChange: (v) => setDraft({ from: v }) });
  const to = selectInput({ options: [], onChange: (v) => setDraft({ to: v }) });
  const pickFrom = btn(t('route.pickOnMap'), () => es.set({ pending: { kind: 'routeEnd', which: 'from' } }));
  const pickTo = btn(t('route.pickOnMap'), () => es.set({ pending: { kind: 'routeEnd', which: 'to' } }));
  const swap = btn(t('route.swap'), () => { const d = draft(); setDraft({ from: d.to, to: d.from }); });
  const type = selectInput({ options: [], onChange: (v) => setDraft({ typeId: v }) });
  const typeField = field(t('route.type'), type);
  const noTypes = h('p', { class: 'panel-warn', hidden: true }, t('route.noTypes'));
  const via = h('ul', { class: 'chip-list' });
  const list = h('ul', { class: 'route-list' });
  const note = h('p', { class: 'panel-note' });

  const el = h('div', { class: 'route-picker' },
    h('div', { class: 'field-row field-row-end' }, field(t('route.from'), from), pickFrom),
    h('div', { class: 'field-row field-row-end' }, field(t('route.to'), to), pickTo),
    h('div', { class: 'panel-actions' }, swap),
    typeField,
    noTypes,
    field(t('route.via'), via, { hint: t('route.viaHint') }),
    h('h3', { class: 'route-head' }, t('route.candidates')),
    note,
    list,
  );

  /** 候補の計算は、路線・駅・始発・終着・経由が変わったときだけ */
  let cache = { key: null, routes: [] };
  function routesFor(p, d) {
    const key = [p.lines, p.stations, d.from, d.to, d.via.join(',')];
    if (!cache.key || cache.key.some((v, i) => v !== key[i])) {
      cache = { key, routes: d.from && d.to ? findRoutes(p, d.from, d.to, { via: d.via }) : [] };
    }
    return cache.routes;
  }

  return {
    el,
    /** @param {import('../core/schema.js').Project} p */
    update(p) {
      const d = draft();
      if (!d) return;
      const stations = [{ value: NONE, label: t('route.choose') }, ...stationOptions(p)];
      from.setOptions(stations);
      to.setOptions(stations);
      from.setValue(d.from);
      to.setValue(d.to);
      const pend = es.get().pending;
      pickFrom.setAttribute('aria-pressed', String(!!pend && pend.kind === 'routeEnd' && pend.which === 'from'));
      pickTo.setAttribute('aria-pressed', String(!!pend && pend.kind === 'routeEnd' && pend.which === 'to'));

      // 種別（新しい系統のときだけ）。始発駅を通る路線の事業者の種別を先に出す
      const isNew = !d.serviceId;
      typeField.hidden = !isNew;
      const startLine = p.lines.find((l) => l.stops.some((s) => s.stationId === d.from));
      const types = typeOptions(p, startLine && startLine.operatorId);
      type.setOptions(types);
      noTypes.hidden = !isNew || types.length > 0;
      if (isNew && types.length && !types.some((x) => x.value === d.typeId)) {
        setDraft({ typeId: types[0].value });
        return;
      }
      type.setValue(d.typeId);

      via.replaceChildren(...[...p.lines].sort((a, b) => a.order - b.order).map((l) => {
        const on = d.via.includes(l.id);
        return h('li', {}, h('button', {
          class: 'chip',
          type: 'button',
          'aria-pressed': String(on),
          style: { '--chip': l.color },
          on: { click: () => setDraft({ via: on ? d.via.filter((x) => x !== l.id) : [...d.via, l.id] }) },
        }, l.displayName || l.name));
      }));

      const routes = routesFor(p, d);
      if (!d.from || !d.to) note.textContent = t('route.chooseEnds');
      else if (!routes.length) note.textContent = t('route.none');
      else note.textContent = t('route.pickOne');
      const canCreate = !isNew || types.length > 0;
      list.replaceChildren(...routes.map((r) => h('li', {}, h('button', {
        class: 'route-item',
        type: 'button',
        disabled: !canCreate,
        on: { click: () => opt.onPick(r.segments, draft()) },
      },
      h('span', { class: 'route-lines' }, routeText(p, r.segments)),
      h('span', { class: 'route-km num' }, formatDistance(r.km, p.locale.distanceUnit))))));
    },
  };
}
