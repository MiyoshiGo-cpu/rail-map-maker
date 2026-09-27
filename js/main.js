// 起動（ステップ1：レイアウトの骨組みだけ。画面の中身は後のステップで作る）
import { h } from './ui/dom.js';
import { icon } from './ui/icons.js';

const app = document.getElementById('app');

function toolBadge(name, pressed = false) {
  return h('button', { class: 'badge-btn', type: 'button', 'aria-pressed': String(pressed) }, icon(name));
}

app.append(
  h('div', { class: 'editor' },
    h('header', { class: 'ed-header on-sign' },
      h('button', { class: 'icon-btn', type: 'button' }, icon('menu')),
      h('div', { class: 'ed-header-actions' },
        h('button', { class: 'icon-btn', type: 'button' }, icon('undo')),
        h('button', { class: 'icon-btn', type: 'button' }, icon('redo')),
        h('button', { class: 'icon-btn', type: 'button' }, icon('more')),
      ),
    ),
    h('nav', { class: 'ed-tools' },
      toolBadge('select', true), toolBadge('station'), toolBadge('line'), toolBadge('data'), toolBadge('check'),
    ),
    h('main', { class: 'ed-stage' }, h('canvas', { class: 'ed-canvas' })),
    h('aside', { class: 'ed-panel', dataset: { stage: 'peek' } },
      h('div', { class: 'sheet-handle' }),
      h('div', { class: 'panel-accent' }),
      h('div', { class: 'ed-panel-body' }),
    ),
    h('section', { class: 'ed-data', hidden: window.innerWidth < 900 }),
  ),
);
