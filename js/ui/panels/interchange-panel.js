// 乗換グループのパネル（§3 Interchange）：駅の一覧・乗換の徒歩時間・連絡線の表示
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { field, numberInput, checkInput, group } from '../form.js';

/**
 * @param {{ store: any, es: any, toast: (m: string) => void }} ctx
 * @param {string} interchangeId
 */
export function createInterchangePanel(ctx, interchangeId) {
  const { store, es } = ctx;
  const set = (fields) => store.dispatch({ type: 'interchange/update', interchangeId, fields });
  const title = h('h2', { class: 'panel-title' });
  const list = h('ul', { class: 'ic-list' });
  const walk = numberInput({ step: 1, min: 0, max: 60, onChange: (v) => { if (v !== null && v >= 0) set({ walkMinutes: Math.round(v) }); } });
  const connector = checkInput({ label: t('interchange.showConnector'), onChange: (v) => set({ showConnector: v }) });
  const btn = (label, onClick) => h('button', { class: 'btn btn-small', type: 'button', on: { click: onClick } }, label);

  const el = h('div', {},
    h('div', { class: 'panel-head' }, title),
    group(t('interchange.stations'), [
      list,
      h('div', { class: 'panel-actions' },
        btn(t('interchange.addStation'), () => es.set({ pending: { kind: 'interchange', interchangeId } })),
      ),
    ]),
    group(t('panel.basic'), [
      field(t('interchange.walkMinutes'), walk),
      connector,
    ]),
    h('div', { class: 'panel-section' },
      h('div', { class: 'panel-actions' },
        btn(t('interchange.delete'), () => {
          store.dispatch({ type: 'interchange/delete', interchangeId });
          es.set({ selection: { type: 'none' } });
          ctx.toast(t('interchange.deleted'));
        }),
      ),
    ),
  );

  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      const ic = p.interchanges.find((x) => x.id === interchangeId);
      if (!ic) return;
      const name = (id) => p.stations.find((s) => s.id === id)?.name || t('station.unnamed');
      title.textContent = t('interchange.title', { names: ic.stationIds.map(name).join(t('common.listSep')) });
      walk.setValue(ic.walkMinutes);
      connector.setValue(ic.showConnector);
      list.replaceChildren(...ic.stationIds.map((id) => h('li', {},
        h('button', { class: 'link-btn', type: 'button', on: { click: () => es.set({ selection: { type: 'stations', ids: [id] } }) } }, name(id)),
        h('button', {
          class: 'btn btn-small',
          type: 'button',
          on: { click: () => store.dispatch({ type: 'interchange/removeStation', interchangeId, stationId: id }) },
        }, t('interchange.removeStation')),
      )));
    },
  };
}
