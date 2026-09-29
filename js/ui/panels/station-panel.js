// 駅のパネル（ステップ7では駅名とよみ。全項目はステップ10で足す）
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { field, textInput } from '../form.js';

/**
 * @param {{ store: any, onDelete: (ids: string[]) => void }} ctx
 * @param {string} stationId
 */
export function createStationPanel(ctx, stationId) {
  const { store } = ctx;
  const set = (fields) => store.dispatch({ type: 'station/update', stationId, fields });
  const title = h('h2', { class: 'panel-title' });
  const name = textInput({ onChange: (v) => set({ name: v.trim() }) });
  const reading = textInput({ onChange: (v) => set({ reading: v.trim() }), inputMode: 'kana' });
  const el = h('div', {},
    h('div', { class: 'panel-head' }, title),
    h('div', { class: 'panel-section' },
      field(t('station.name'), name),
      field(t('station.reading'), reading),
      h('div', { class: 'panel-actions' },
        h('button', { class: 'btn btn-small', type: 'button', on: { click: () => ctx.onDelete([stationId]) } }, t('station.delete')),
      ),
    ),
  );
  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      const st = p.stations.find((s) => s.id === stationId);
      if (!st) return;
      title.textContent = st.name || t('station.unnamed');
      name.setValue(st.name);
      reading.setValue(st.reading || '');
    },
    focusName() {
      name.focus();
      name.select();
    },
  };
}
