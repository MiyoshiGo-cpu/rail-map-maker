// 駅の検索（Ctrl+F）：漢字・よみ・英字・駅番号で探し、選ぶとその駅へ移動する
import { h } from './dom.js';
import { t, getUiLang } from '../i18n/i18n.js';
import { normalizeForSearch, stationMatchScore } from '../core/search.js';
import { stationNumbers } from '../core/numbering.js';
import { openSheet } from './dialog.js';

const MAX_RESULTS = 40;

/**
 * @param {import('../core/schema.js').Project} p
 * @param {(stationId: string) => void} onPick
 */
export function openStationSearch(p, onPick) {
  const input = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'search', placeholder: t('search.placeholder'), 'aria-label': t('search.placeholder'), autocomplete: 'off' }));
  const list = h('ul', { class: 'search-results', role: 'listbox' });
  const rows = p.stations.map((st) => ({ st, codes: stationNumbers(p, st.id).map((n) => n.code) }));
  let sheet = null;
  const collator = new Intl.Collator(getUiLang());

  function render() {
    const q = normalizeForSearch(input.value);
    if (!q) {
      list.replaceChildren(h('li', { class: 'panel-note' }, t('search.hint')));
      return;
    }
    const hits = rows
      .map((r) => ({ ...r, score: stationMatchScore(r.st, q, r.codes) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score || collator.compare(a.st.reading || a.st.name, b.st.reading || b.st.name))
      .slice(0, MAX_RESULTS);
    if (!hits.length) {
      list.replaceChildren(h('li', { class: 'panel-note' }, t('search.none')));
      return;
    }
    list.replaceChildren(...hits.map((r) => h('li', { role: 'option' },
      h('button', {
        class: 'search-hit',
        type: 'button',
        on: { click: () => { sheet.close(); onPick(r.st.id); } },
      },
      h('span', { class: 'search-name' }, r.st.name || t('station.unnamed')),
      h('span', { class: 'search-sub' }, [r.st.reading, r.st.names.en, r.codes.join(' ')].filter(Boolean).join(t('common.dot')))),
    )));
  }

  input.addEventListener('input', render);
  // Enter で最初の候補へ（日本語の変換中は無視）
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const first = list.querySelector('.search-hit');
    if (first) {
      e.preventDefault();
      /** @type {HTMLButtonElement} */ (first).click();
    }
  });
  sheet = openSheet({ title: t('search.title'), body: [input, list] });
  render();
  input.focus();
}
