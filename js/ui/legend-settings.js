// 設定の「凡例とタイトル」の欄（§5.7）：出すかどうか・置く角・凡例に入れるもの・タイトル・作者・日付
import { h } from './dom.js';
import { t, formatDate, mapTranslator } from '../i18n/i18n.js';
import { LEGEND_CORNERS } from '../core/schema.js';
import { field, selectInput, checkInput, textInput, group, enumOptions } from './form.js';

/**
 * @param {{ store: any }} ctx
 * @returns {{ el: HTMLElement, refresh: () => void }}
 */
export function createLegendSettings(ctx) {
  const { store } = ctx;
  const style = () => store.getState().style;
  const setLegend = (fields) => {
    store.dispatch({ type: 'project/style', fields: { legend: { ...style().legend, ...fields } } });
    refresh();
  };
  const setTitle = (fields) => {
    store.dispatch({ type: 'project/style', fields: { title: { ...style().title, ...fields } } });
    refresh();
  };
  const corners = () => enumOptions(LEGEND_CORNERS, (v) => t('corner.' + v));

  // 凡例
  const legendShow = checkInput({ label: t('legend.show'), onChange: (v) => setLegend({ show: v }) });
  const legendCorner = selectInput({ options: corners(), onChange: (v) => setLegend({ corner: v }) });
  const legendItems = ['lines', 'types', 'symbols'].map((key) => {
    const c = checkInput({ label: t('legend.' + key), onChange: (v) => setLegend({ [key]: v }) });
    c.dataset.key = key;
    return c;
  });
  const legendDetails = h('div', {},
    field(t('legend.corner'), legendCorner),
    h('p', { class: 'field-label' }, t('legend.items')),
    legendItems,
  );

  // タイトル
  const titleShow = checkInput({ label: t('titleBlock.show'), onChange: (v) => setTitle({ show: v }) });
  const titleCorner = selectInput({ options: corners(), onChange: (v) => setTitle({ corner: v }) });
  const titleText = textInput({ onChange: (v) => setTitle({ text: v.trim() }) });
  const showAuthor = checkInput({ label: t('titleBlock.showAuthor'), onChange: (v) => setTitle({ showAuthor: v }) });
  const author = textInput({
    onChange: (v) => {
      store.dispatch({ type: 'project/update', fields: { author: v.trim() } });
      refresh();
    },
  });
  const date = textInput({ placeholder: t('titleBlock.datePlaceholder'), onChange: (v) => setTitle({ date: v.trim() }) });
  // 今日の日付を地図の言語で入れる（例：2026年9月29日現在）
  const today = h('button', {
    class: 'btn btn-small',
    type: 'button',
    on: {
      click: () => {
        const lang = store.getState().locale.mapLanguage;
        const d = formatDate(new Date(), lang, { year: 'numeric', month: 'long', day: 'numeric' });
        setTitle({ date: mapTranslator(lang)('map.title.asOf', { date: d }) });
      },
    },
  }, t('titleBlock.today'));
  const titleDetails = h('div', {},
    field(t('titleBlock.corner'), titleCorner),
    field(t('titleBlock.text'), titleText, { hint: t('titleBlock.textHint') }),
    showAuthor,
    field(t('titleBlock.author'), author),
    h('div', { class: 'field-row field-row-end' }, field(t('titleBlock.date'), date), today),
  );

  const el = group(t('legend.title'), [
    h('p', { class: 'panel-note' }, t('legend.hint')),
    titleShow,
    titleDetails,
    legendShow,
    legendDetails,
  ]);

  function refresh() {
    const p = store.getState();
    const { legend, title } = p.style;
    legendShow.setValue(legend.show);
    legendCorner.setValue(legend.corner);
    for (const c of legendItems) c.setValue(legend[c.dataset.key]);
    legendDetails.hidden = !legend.show;
    titleShow.setValue(title.show);
    titleCorner.setValue(title.corner);
    titleText.placeholder = p.name;
    titleText.setValue(title.text);
    showAuthor.setValue(title.showAuthor);
    author.setValue(p.author || '');
    author.disabled = !title.showAuthor;
    date.setValue(title.date);
    titleDetails.hidden = !title.show;
  }
  refresh();
  return { el, refresh };
}
