// 事業者のパネル（§3 Operator）
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { BADGE_SHAPES } from '../../core/schema.js';
import { getRegion, defaultServiceSet } from '../../core/regions/index.js';
import { typesOfOperator } from '../../core/actions/service-types.js';
import { readableTextColor } from '../../core/color.js';
import { field, textInput, textArea, selectInput, colorInput, group, enumOptions } from '../form.js';

/**
 * @param {{ store: any, es: any, toast: (m: string) => void }} ctx
 * @param {string} operatorId
 */
export function createOperatorPanel(ctx, operatorId) {
  const { store, es } = ctx;
  const cur = () => store.getState().operators.find((o) => o.id === operatorId);
  const set = (fields) => store.dispatch({ type: 'operator/update', operatorId, fields });
  const region = getRegion(store.getState().locale.region);

  const title = h('h2', { class: 'panel-title' });
  const name = textInput({ onChange: (v) => { if (v.trim()) set({ name: v.trim() }); } });
  const shortName = textInput({ onChange: (v) => set({ shortName: v.trim() || cur().name }) });
  const nameEn = textInput({ onChange: (v) => set({ names: { ...cur().names, en: v.trim() || undefined } }), lang: 'en' });
  const category = selectInput({
    options: enumOptions(region.operatorCategories, (v) => t(region.operatorCategoryKeyPrefix + v)),
    onChange: (v) => set({ category: v }),
  });
  // 色を変えたら、文字の色も読みやすい方に合わせる（あとから変えられる）
  const color = colorInput({ onChange: (v) => set({ color: v, textColor: readableTextColor(v) }), label: t('operator.color'), palette: region.linePalette });
  const textColor = colorInput({ onChange: (v) => set({ textColor: v }), label: t('common.textColor') });
  const badge = selectInput({ options: enumOptions(BADGE_SHAPES, (v) => t('badgeShape.' + v)), onChange: (v) => set({ badgeShape: v }) });
  const note = textArea({ onChange: (v) => set({ note: v.trim() || undefined }) });
  const lineList = h('ul', { class: 'chip-list' });

  // 種別：プリセット（地域パック）からまとめて追加・1つずつ追加
  const typeList = h('ul', { class: 'chip-list' });
  const preset = selectInput({ options: region.serviceTypePresets.map((x) => ({ value: x.id, label: t(x.labelKey) })), onChange: () => {} });
  const selectType = (id) => es.set({ selection: { type: 'serviceType', id } });
  const addPreset = h('button', {
    class: 'btn btn-small',
    type: 'button',
    on: {
      click: () => {
        const ids = store.dispatch({ type: 'serviceType/addPreset', operatorId, presetId: preset.value });
        ctx.toast(ids.length ? t('serviceType.added', { count: ids.length }) : t('serviceType.addedNone'));
      },
    },
  }, t('operator.addPreset'));
  const addType = h('button', {
    class: 'btn btn-small',
    type: 'button',
    on: { click: () => selectType(store.dispatch({ type: 'serviceType/add', operatorId })) },
  }, t('serviceType.addOne'));
  let presetTouched = false;
  preset.addEventListener('change', () => { presetTouched = true; });
  const del = h('button', {
    class: 'btn btn-small',
    type: 'button',
    on: {
      click: () => {
        const ok = store.dispatch({ type: 'operator/delete', operatorId });
        if (ok) {
          es.set({ selection: { type: 'none' } });
          ctx.toast(t('operator.deleted'));
        } else ctx.toast(t('operator.inUse'));
      },
    },
  }, t('operator.delete'));

  const el = h('div', {},
    h('div', { class: 'panel-head' }, title),
    group(t('panel.basic'), [
      field(t('operator.name'), name),
      h('div', { class: 'field-row' },
        field(t('operator.shortName'), shortName),
        field(t('operator.category'), category),
      ),
      field(t('common.nameEn'), nameEn),
      h('div', { class: 'field-row' },
        field(t('operator.color'), color),
        field(t('common.textColor'), textColor),
      ),
      field(t('operator.badgeShape'), badge),
    ]),
    group(t('operator.lines'), [lineList]),
    group(t('operator.types'), [
      typeList,
      h('div', { class: 'field-row field-row-end' }, field(t('operator.preset'), preset), addPreset),
      h('div', { class: 'panel-actions' }, addType),
    ]),
    group(t('common.note'), [note], { collapsible: true }),
    h('div', { class: 'panel-section' }, h('div', { class: 'panel-actions' }, del)),
  );

  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      const o = p.operators.find((x) => x.id === operatorId);
      if (!o) return;
      title.textContent = o.name;
      name.setValue(o.name);
      shortName.setValue(o.shortName);
      nameEn.setValue(o.names.en || '');
      category.setValue(o.category);
      color.setValue(o.color);
      textColor.setValue(o.textColor);
      badge.setValue(o.badgeShape);
      note.setValue(o.note || '');
      const lines = p.lines.filter((l) => l.operatorId === operatorId).sort((a, b) => a.order - b.order);
      lineList.replaceChildren(...(lines.length
        ? lines.map((l) => h('li', {}, h('button', {
          class: 'chip',
          type: 'button',
          style: { '--chip': l.color },
          on: { click: () => es.set({ selection: { type: 'line', lineId: l.id } }) },
        }, l.displayName || l.name)))
        : [h('li', { class: 'panel-note' }, t('operator.noLines'))]));
      const types = typesOfOperator(p.serviceTypes, operatorId).map((x) => x.type);
      typeList.replaceChildren(...(types.length
        ? types.map((x) => h('li', {}, h('button', {
          class: 'chip',
          type: 'button',
          style: { '--chip': x.color },
          on: { click: () => selectType(x.id) },
        }, x.name)))
        : [h('li', { class: 'panel-note' }, t('operator.noTypes'))]));
      // プリセットの既定は、路線の種類と事業者の区分に合わせる（選び直したらそのまま）
      if (!presetTouched) preset.setValue(defaultServiceSet(region, o, lines.map((l) => l.kind)));
    },
  };
}
