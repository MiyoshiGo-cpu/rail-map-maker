// アクションに渡す文脈：地域パック、地図の言語の定型文、ID の発行
import { getRegion } from '../regions/index.js';
import { mapTranslator } from '../../i18n/i18n.js';
import { newId, collectIds } from '../ids.js';

/**
 * @param {import('../schema.js').Project} state
 */
export function makeContext(state) {
  const region = getRegion(state.locale && state.locale.region);
  /** @type {Set<string> | null} */
  let taken = null;
  return {
    region,
    mapT: mapTranslator(state.locale ? state.locale.mapLanguage : region.locale.mapLanguage),
    /** @param {string} prefix */
    newId(prefix) {
      if (!taken) taken = collectIds(state);
      const id = newId(prefix, taken);
      taken.add(id);
      return id;
    },
  };
}

/** @typedef {ReturnType<typeof makeContext>} ActionContext */
