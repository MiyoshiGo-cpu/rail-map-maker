// プロジェクトのパネル（何も選んでいないとき）：名前・作者と英字の規則（§6.1）
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { getRegion } from '../../core/regions/index.js';
import { field, textInput, selectInput, checkInput, group } from '../form.js';
import { toast } from '../toast.js';

/**
 * @param {{ store: any }} ctx
 */
export function createProjectPanel(ctx) {
  const { store } = ctx;
  const name = textInput({
    onChange: (v) => {
      const s = v.trim();
      if (!s) {
        name.value = store.getState().name;
        toast(t('error.nameRequired'), { kind: 'error' });
        return;
      }
      store.dispatch({ type: 'project/update', fields: { name: s } });
    },
  });
  const author = textInput({ onChange: (v) => store.dispatch({ type: 'project/update', fields: { author: v.trim() } }) });
  const counts = h('p', { class: 'panel-note' });

  // 英字の規則（変えると、自動生成中の駅の英字をまとめて作り直す）
  const setRomaji = (fields) => store.dispatch({ type: 'project/romaji', fields });
  const longVowel = selectInput({
    options: ['omit', 'macron', 'keep'].map((v) => ({ value: v, label: t('romaji.longVowel.' + v) })),
    onChange: (v) => setRomaji({ longVowel: v }),
  });
  const nBeforeBmp = selectInput({
    options: ['m', 'n'].map((v) => ({ value: v, label: t('romaji.nBeforeBmp.' + v) })),
    onChange: (v) => setRomaji({ nBeforeBmp: v }),
  });
  const capHyphen = checkInput({ label: t('romaji.capitalizeAfterHyphen'), onChange: (v) => setRomaji({ capitalizeAfterHyphen: v }) });
  const romajiGroup = group(t('romaji.title'), [
    h('p', { class: 'panel-note' }, t('romaji.hint')),
    field(t('romaji.longVowel'), longVowel),
    field(t('romaji.nBeforeBmp'), nBeforeBmp),
    capHyphen,
  ], { collapsible: true });

  const el = h('div', {},
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, t('panel.project.title'))),
    h('div', { class: 'panel-section' },
      field(t('newProject.name'), name),
      field(t('newProject.author'), author),
      counts,
    ),
    romajiGroup,
  );
  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      name.setValue(p.name);
      author.setValue(p.author || '');
      counts.textContent = t('plist.counts', { stations: p.stations.length, lines: p.lines.length });
      // 英字の自動生成を使わない地域では出さない
      romajiGroup.hidden = !getRegion(p.locale.region).autoRomanize;
      const r = p.settings.romaji;
      longVowel.setValue(r.longVowel);
      nBeforeBmp.setValue(r.nBeforeBmp);
      capHyphen.setValue(r.capitalizeAfterHyphen);
    },
  };
}
