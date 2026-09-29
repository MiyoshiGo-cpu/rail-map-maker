// 区間（駅間）のパネル：曲がり位置・経由点・区間属性の上書き（空なら路線の既定値）
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { ELECTRIFICATIONS, COLLECTIONS, TRACKS, STRUCTURES, LINE_STATUSES, BENDS, GAUGE_CANDIDATES } from '../../core/schema.js';
import { field, selectInput, numberInput, gaugeInput, group, enumOptions } from '../form.js';
import { gaugeLabels } from './line-panel.js';
import { nextViaPoint } from '../../core/schematic.js';

const INHERIT = '';

/**
 * @param {{ store: any, es: any, toast: (m: string) => void, deleteSection: (lineId: string, index: number) => void }} ctx
 * @param {string} lineId
 * @param {number} index
 */
export function createSectionPanel(ctx, lineId, index) {
  const { store, es } = ctx;
  const line = () => store.getState().lines.find((l) => l.id === lineId);
  const sec = () => line().sections[index] || {};
  const set = (fields) => store.dispatch({ type: 'line/section', lineId, index, fields });

  const title = h('h2', { class: 'panel-title' });
  const sub = h('p', { class: 'panel-note' });

  const bend = selectInput({ options: enumOptions(BENDS, (v) => t('bend.' + v)), onChange: (v) => set({ schematicBend: v === 'auto' ? null : v }) });
  const viaInfo = h('p', { class: 'panel-note' });
  const addVia = h('button', {
    class: 'btn btn-small',
    type: 'button',
    on: {
      click: () => {
        const p = store.getState();
        const l = line();
        const pos = (id) => p.stations.find((s) => s.id === id)?.schematic;
        const a = pos(l.stops[index].stationId);
        const b = pos(l.stops[(index + 1) % l.stops.length].stationId);
        if (!a || !b) return;
        const via = sec().schematicVia || [];
        const next = nextViaPoint([a, ...via, b]);
        if (!next) {
          ctx.toast(t('via.noRoom'));
          return;
        }
        const list = [...via];
        list.splice(next.index, 0, next.point);
        set({ schematicVia: list });
      },
    },
  }, t('via.add'));
  const clearVia = h('button', { class: 'btn btn-small', type: 'button', on: { click: () => set({ schematicVia: null }) } }, t('via.clear'));

  // 上書き（空欄・「路線の既定」なら null にして既定値を使う）
  const nullable = (values, labelOf, key, toValue = (v) => v) => {
    const s = selectInput({ options: [], onChange: (v) => set({ [key]: v === INHERIT ? null : toValue(v) }) });
    s.dataset.key = key;
    return { el: s, values, labelOf, key };
  };
  const elec = nullable(ELECTRIFICATIONS, (v) => t('electrification.' + v), 'electrification');
  const coll = nullable(COLLECTIONS, (v) => t('collection.' + v), 'collection');
  const tracks = nullable(TRACKS, (v) => t('tracks.' + v), 'tracks', Number);
  const structure = nullable(STRUCTURES, (v) => t('structure.' + v), 'structure');
  const status = nullable(LINE_STATUSES, (v) => t('status.' + v), 'status');
  const selects = [elec, coll, tracks, structure, status];
  // 上書きでは null が「路線の既定」の意味なので、「対象外」は選べない
  const gauge = gaugeInput({
    candidates: GAUGE_CANDIDATES,
    labels: gaugeLabels(' '),
    allowNone: false,
    onChange: (v) => set({ gauge: v === undefined ? null : v }),
  });
  const maxSpeed = numberInput({ step: 5, min: 1, onChange: (v) => set({ maxSpeed: v === null ? null : Math.round(v) }) });
  const opened = numberInput({ step: 1, onChange: (v) => set({ openedYear: v === null ? null : Math.round(v) }) });
  const closed = numberInput({ step: 1, onChange: (v) => set({ closedYear: v === null ? null : Math.round(v) }) });

  const el = h('div', {},
    h('div', { class: 'panel-head' }, title),
    h('div', { class: 'panel-section' }, sub,
      h('div', { class: 'panel-actions' },
        h('button', { class: 'btn btn-small', type: 'button', on: { click: () => es.set({ selection: { type: 'line', lineId } }) } }, t('section.openLine')),
      ),
    ),
    group(t('section.shape'), [
      field(t('section.bend'), bend),
      viaInfo,
      h('div', { class: 'panel-actions' }, addVia, clearVia),
    ]),
    group(t('section.overrides'), [
      h('p', { class: 'panel-note' }, t('section.overridesHint')),
      field(t('section.gauge'), gauge),
      h('div', { class: 'field-row' },
        field(t('section.electrification'), elec.el),
        field(t('section.collection'), coll.el),
      ),
      h('div', { class: 'field-row' },
        field(t('section.tracks'), tracks.el),
        field(t('section.maxSpeed'), maxSpeed),
      ),
      field(t('section.structure'), structure.el),
      field(t('line.status'), status.el),
      h('div', { class: 'field-row' },
        field(t('common.openedYear'), opened),
        field(t('common.closedYear'), closed),
      ),
    ], { collapsible: true }),
    h('div', { class: 'panel-section' },
      h('div', { class: 'panel-actions' },
        h('button', { class: 'btn btn-small', type: 'button', on: { click: () => ctx.deleteSection(lineId, index) } }, t('section.delete')),
      ),
    ),
  );

  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      const l = p.lines.find((x) => x.id === lineId);
      if (!l || index >= l.sections.length) return;
      const s = l.sections[index] || {};
      const name = (id) => p.stations.find((x) => x.id === id)?.name || t('station.unnamed');
      const a = l.stops[index].stationId;
      const b = l.stops[(index + 1) % l.stops.length].stationId;
      title.textContent = t('section.title', { a: name(a), b: name(b) });
      sub.textContent = t('section.ofLine', { name: l.displayName || l.name, index: index + 1 });
      bend.setValue(s.schematicBend || 'auto');
      const viaCount = (s.schematicVia || []).length;
      viaInfo.textContent = viaCount ? t('via.count', { count: viaCount }) : t('via.none');
      clearVia.disabled = !viaCount;

      const d = l.defaults;
      for (const x of selects) {
        const def = x.labelOf(String(d[x.key]));
        x.el.setOptions([
          { value: INHERIT, label: t('section.inherit', { value: def }) },
          ...enumOptions(x.values, x.labelOf),
        ]);
        x.el.setValue(s[x.key] === undefined || s[x.key] === null ? INHERIT : String(s[x.key]));
      }
      gauge.setInheritLabel(t('section.inherit', { value: d.gauge === null ? t('gauge.none') : t('unit.mm', { value: d.gauge }) }));
      gauge.setValue(s.gauge === undefined || s.gauge === null ? undefined : s.gauge);
      maxSpeed.setValue(s.maxSpeed ?? null);
      maxSpeed.placeholder = t('section.inheritShort', { value: d.maxSpeed });
      opened.setValue(s.openedYear ?? null);
      closed.setValue(s.closedYear ?? null);
    },
  };
}
