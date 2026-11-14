// 都市のパネル（§3 City・架空の地形）：名前・よみ・英字・規模・人口と、都市の削除（県庁所在地は消せない）
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { field, textInput, numberInput, selectInput, group } from '../form.js';
import { getRegion } from '../../core/regions/index.js';
import { romanize } from '../../core/romaji.js';
import { cityKindOf } from '../../core/terrain/world.js';

const KINDS = ['metropolis', 'city', 'town', 'village'];

/**
 * @param {{ store: any, es: any, toast: (m: string) => void }} ctx
 * @param {string} cityId
 */
export function createCityPanel(ctx, cityId) {
  const { store, es } = ctx;
  const region = () => getRegion(store.getState().locale.region);
  const set = (fields) => store.dispatch({ type: 'world/cityUpdate', id: cityId, fields });
  const city = () => {
    const w = store.getState().world;
    return w.mode === 'fictional' ? w.cities.find((c) => c.id === cityId) : null;
  };

  const title = h('h2', { class: 'panel-title' });
  const name = textInput({
    onChange: (v) => {
      const s = v.trim();
      if (!s) {
        name.value = city()?.name || '';
        ctx.toast(t('error.nameRequired'));
        return;
      }
      set({ name: s });
    },
  });
  // よみを変えたら、英字も作り直す（地域パックが英字の自動生成を使うとき）
  const reading = textInput({
    onChange: (v) => {
      const r = region();
      const c = city();
      const fields = { reading: v.trim() || undefined };
      if (r.autoRomanize && c) fields.names = { ...c.names, [r.romanizeTo]: romanize(v.trim(), store.getState().settings.romaji) || undefined };
      set(fields);
    },
  });
  const en = textInput({
    lang: 'en',
    onChange: (v) => {
      const c = city();
      if (c) set({ names: { ...c.names, en: v.trim() || undefined } });
    },
  });
  const kind = selectInput({
    options: KINDS.map((k) => ({ value: k, label: t('city.kind.' + k) })),
    onChange: (v) => set({ kind: v }),
  });
  // 人口を変えたら、規模も人口に合わせる（あとから規模だけ変えてもよい）
  const population = numberInput({
    min: 0,
    step: 1000,
    onChange: (v) => {
      if (v === null || v < 0) return;
      const n = Math.round(v);
      set({ population: n, kind: cityKindOf(n, region()) });
    },
  });
  const regionText = h('p', { class: 'panel-note' });
  const capitalNote = h('p', { class: 'panel-note', hidden: true });
  const del = h('button', {
    class: 'btn btn-danger btn-small',
    type: 'button',
    on: {
      click: () => {
        const c = city();
        if (!c) return;
        if (store.dispatch({ type: 'world/cityDelete', id: cityId })) {
          es.set({ selection: { type: 'none' } });
          ctx.toast(t('city.deleted', { name: c.name }));
        }
      },
    },
  }, t('city.delete'));

  const el = h('div', {},
    h('div', { class: 'panel-head' }, title),
    group(t('panel.basic'), [
      field(t('city.name'), name),
      field(t('city.reading'), reading),
      field(t('city.en'), en),
      field(t('city.kind'), kind),
      field(t('city.population'), population),
      regionText,
    ]),
    h('div', { class: 'panel-section' },
      capitalNote,
      h('div', { class: 'panel-actions' }, del),
    ),
  );

  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      const c = city();
      if (!c || p.world.mode !== 'fictional') return;
      title.textContent = c.name;
      name.setValue(c.name);
      reading.setValue(c.reading || '');
      en.setValue((c.names && c.names.en) || '');
      kind.setValue(c.kind);
      population.setValue(c.population);
      const reg = p.world.regions.find((r) => r.id === c.regionId);
      const capital = p.world.regions.some((r) => r.capitalCityId === c.id);
      const admin1 = t(getRegion(p.locale.region).adminLabelKeys.admin1);
      regionText.textContent = reg ? t(capital ? 'city.regionCapital' : 'city.region', { admin1, name: reg.name }) : '';
      capitalNote.hidden = !capital;
      capitalNote.textContent = t('city.capitalNote', { admin1 });
      del.disabled = capital;
    },
  };
}
