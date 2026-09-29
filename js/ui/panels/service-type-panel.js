// 種別のパネル（§3 ServiceType）：名前・色・rank（並べ替え）・停車駅の決め方・停車時間・料金・座席
import { h } from '../dom.js';
import { getRegion } from '../../core/regions/index.js';
import { t } from '../../i18n/i18n.js';
import { STOP_RULES, SEATINGS } from '../../core/schema.js';
import { readableTextColor } from '../../core/color.js';
import { typesOfOperator } from '../../core/actions/service-types.js';
import { field, textInput, selectInput, numberInput, checkInput, colorInput, group, enumOptions } from '../form.js';

/**
 * @param {{ store: any, es: any, toast: (m: string) => void }} ctx
 * @param {string} typeId
 */
export function createServiceTypePanel(ctx, typeId) {
  const { store, es } = ctx;
  const cur = () => store.getState().serviceTypes.find((x) => x.id === typeId);
  const set = (fields) => store.dispatch({ type: 'serviceType/update', typeId, fields });
  const btn = (label, onClick) => h('button', { class: 'btn btn-small', type: 'button', on: { click: onClick } }, label);

  const title = h('h2', { class: 'panel-title' });
  const operator = h('button', { class: 'link-btn', type: 'button', on: { click: () => es.set({ selection: { type: 'operator', id: cur().operatorId } }) } });
  const name = textInput({ onChange: (v) => { if (v.trim()) set({ name: v.trim() }); } });
  const shortName = textInput({ maxLength: 4, onChange: (v) => set({ shortName: v.trim() || cur().name }) });
  const nameEn = textInput({ lang: 'en', onChange: (v) => set({ names: { ...cur().names, en: v.trim() || undefined } }) });
  // 色を変えたら、文字の色も読みやすい方に合わせる（あとから変えられる）
  const color = colorInput({ label: t('common.color'), onChange: (v) => set({ color: v, textColor: readableTextColor(v) }), palette: getRegion(store.getState().locale.region).linePalette });
  const textColor = colorInput({ label: t('common.textColor'), onChange: (v) => set({ textColor: v }) });
  const rank = numberInput({ step: 1, min: 0, max: 99, onChange: (v) => { if (v !== null) set({ rank: Math.round(v) }); } });
  const slower = btn(t('serviceType.moveSlower'), () => store.dispatch({ type: 'serviceType/move', typeId, delta: -1 }));
  const faster = btn(t('serviceType.moveFaster'), () => store.dispatch({ type: 'serviceType/move', typeId, delta: 1 }));
  const base = selectInput({
    options: enumOptions(STOP_RULES, (v) => t('stopRule.' + v)),
    onChange: (v) => set({ stopRule: { ...cur().stopRule, base: v } }),
  });
  const interchanges = checkInput({ label: t('serviceType.stopAtInterchanges'), onChange: (v) => set({ stopRule: { ...cur().stopRule, interchanges: v } }) });
  const dwell = numberInput({ step: 5, min: 0, max: 600, onChange: (v) => { if (v !== null && v >= 0) set({ dwellSec: Math.round(v) }); } });
  const surcharge = checkInput({ label: t('serviceType.surcharge'), onChange: (v) => set({ surcharge: v }) });
  const seating = selectInput({ options: enumOptions(SEATINGS, (v) => t('seating.' + v)), onChange: (v) => set({ seating: v }) });

  const el = h('div', {},
    h('div', { class: 'panel-head' }, title),
    h('div', { class: 'panel-section' }, h('p', { class: 'panel-note' }, t('serviceType.operator'), ' ', operator)),
    group(t('panel.basic'), [
      h('div', { class: 'field-row' },
        field(t('serviceType.name'), name),
        field(t('serviceType.shortName'), shortName),
      ),
      field(t('common.nameEn'), nameEn),
      h('div', { class: 'field-row' },
        field(t('common.color'), color),
        field(t('common.textColor'), textColor),
      ),
      field(t('serviceType.rank'), rank, { hint: t('serviceType.rankHint') }),
      h('div', { class: 'panel-actions' }, slower, faster),
    ]),
    group(t('serviceType.stopRule'), [
      field(t('serviceType.stopRule'), base),
      interchanges,
      field(t('serviceType.dwellSec'), dwell),
      h('div', { class: 'panel-actions' }, btn(t('serviceType.resetDwell'), () => store.dispatch({ type: 'serviceType/resetDwell', typeId }))),
    ]),
    group(t('panel.details'), [
      surcharge,
      field(t('serviceType.seating'), seating),
    ], { collapsible: true }),
    h('div', { class: 'panel-section' },
      h('div', { class: 'panel-actions' },
        btn(t('serviceType.delete'), () => {
          const ok = store.dispatch({ type: 'serviceType/delete', typeId });
          if (ok) {
            es.set({ selection: { type: 'none' } });
            ctx.toast(t('serviceType.deleted'));
          } else ctx.toast(t('serviceType.inUse'));
        }),
      ),
    ),
  );

  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      const x = p.serviceTypes.find((y) => y.id === typeId);
      if (!x) return;
      title.textContent = x.name;
      operator.textContent = p.operators.find((o) => o.id === x.operatorId)?.name || t('common.unset');
      name.setValue(x.name);
      shortName.setValue(x.shortName);
      nameEn.setValue(x.names.en || '');
      color.setValue(x.color);
      textColor.setValue(x.textColor);
      rank.setValue(x.rank);
      const list = typesOfOperator(p.serviceTypes, x.operatorId);
      const i = list.findIndex((y) => y.type.id === typeId);
      slower.disabled = i <= 0;
      faster.disabled = i >= list.length - 1;
      base.setValue(x.stopRule.base);
      interchanges.setValue(x.stopRule.interchanges);
      dwell.setValue(x.dwellSec);
      surcharge.setValue(x.surcharge);
      seating.setValue(x.seating);
    },
  };
}
