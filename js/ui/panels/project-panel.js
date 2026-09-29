// プロジェクトのパネル（何も選んでいないとき）：名前と作者。英字の規則などは「設定」にある
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { field, textInput } from '../form.js';
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
  const el = h('div', {},
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, t('panel.project.title'))),
    h('div', { class: 'panel-section' },
      field(t('newProject.name'), name),
      field(t('newProject.author'), author),
      counts,
      h('p', { class: 'panel-note' }, t('panel.project.settingsHint')),
    ),
  );
  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      name.setValue(p.name);
      author.setValue(p.author || '');
      counts.textContent = t('plist.counts', { stations: p.stations.length, lines: p.lines.length });
    },
  };
}
