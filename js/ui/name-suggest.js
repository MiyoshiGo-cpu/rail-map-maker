// 駅名の候補（§6.8）：駅のパネルの駅名の欄の下に出す。押すと駅名とよみを入れる（よみを変えるので英字も作り直す）。
// 架空の地形があり、駅に地理の位置があるときだけ出す。地形に合った地名は、地形の下ごしらえ（geo-base.js）ができてから足す。
import { h } from './dom.js';
import { t } from '../i18n/i18n.js';
import { getRegion } from '../core/regions/index.js';
import { suggestStationNames } from '../core/station-names.js';
import { terrainKindAt } from '../core/terrain/world.js';
import { loadGeoBase, readyGeoBase } from './geo-base.js';

/**
 * @param {{ store: any }} ctx
 * @param {string} stationId
 */
export function createNameSuggest(ctx, stationId) {
  const { store } = ctx;
  const list = h('div', { class: 'name-suggest-list' });
  const el = h('div', { class: 'field name-suggest', hidden: true },
    h('span', { class: 'field-label' }, t('station.nameSuggest')),
    list,
  );
  let lastKey = null;
  let waiting = false;

  /** @param {import('../core/schema.js').Project} p */
  function update(p) {
    const st = p.stations.find((s) => s.id === stationId);
    if (p.world.mode !== 'fictional' || !st || !st.geo || !('x' in st.geo)) {
      el.hidden = true;
      lastKey = null;
      return;
    }
    const base = readyGeoBase(p.world);
    if (!base && !waiting) {
      waiting = true;
      loadGeoBase(p.world).then(() => {
        waiting = false;
        update(store.getState());
      }, () => {
        waiting = false;
      });
    }
    const key = [p.stations, p.lines, p.world, base];
    if (lastKey && key.every((v, i) => v === lastKey[i])) return;
    lastKey = key;
    const cands = suggestStationNames(p, stationId, getRegion(p.locale.region), { terrainAt: base ? (g) => terrainKindAt(base, g) : undefined });
    el.hidden = cands.length === 0;
    list.replaceChildren(...cands.map((c) => h('button', {
      class: 'name-chip',
      type: 'button',
      title: c.reading,
      'aria-pressed': String(c.name === st.name),
      on: { click: () => store.dispatch({ type: 'station/update', stationId, fields: { name: c.name, reading: c.reading } }) },
    }, c.name)));
  }

  return { el, update };
}
