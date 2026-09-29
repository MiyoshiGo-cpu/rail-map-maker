// ヘルプ（§4.3：操作方法、iPhone での保存の注意、データの出典）
import { h } from './dom.js';
import { t } from '../i18n/i18n.js';
import { group } from './form.js';
import { openSheet } from './dialog.js';

/** 文言の中の改行で段落に分ける */
const paras = (key) => t(key).split('\n').filter(Boolean).map((s) => h('p', { class: 'help-p' }, s));

export function openHelp() {
  const keys = [
    ['V', 'tool.select'], ['S', 'tool.station.title'], ['L', 'tool.line.title'], ['E', 'tool.delete.title'],
    ['Delete', 'help.key.delete'], ['Ctrl+Z', 'editor.undo'], ['Ctrl+Y / Ctrl+Shift+Z', 'editor.redo'],
    ['Ctrl+A', 'help.key.selectAll'], ['Ctrl+D', 'help.key.duplicate'], ['↑ ↓ ← →', 'help.key.arrows'],
    ['Enter', 'tool.line.finish'], ['Esc', 'help.key.escape'], ['F', 'canvas.fit'], ['+ / −', 'help.key.zoom'],
    ['Ctrl+F', 'search.title'], ['Ctrl+S', 'backup.export'],
  ];
  openSheet({
    title: t('help.title'),
    wide: true,
    body: [
      group(t('help.basicsTitle'), paras('help.basics')),
      group(t('help.touchTitle'), paras('help.touch')),
      group(t('help.keysTitle'), [
        h('dl', { class: 'help-keys' }, keys.flatMap(([k, label]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, t(label))])),
      ], { collapsible: true }),
      group(t('help.saveTitle'), [...paras('help.save'), h('p', { class: 'help-p' }, t('help.iphoneStorage'))]),
      group(t('help.sourcesTitle'), paras('help.sources')),
    ],
  });
}
