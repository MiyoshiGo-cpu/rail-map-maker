// 複数の駅を選んだときのパネル：整列（横一列・縦一列・斜め一列・等間隔）と削除
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';

/**
 * @param {{ align: (mode: 'horizontal'|'vertical'|'diagonal'|'even') => void, deleteSelection: () => void }} ctx
 */
export function createStationsPanel(ctx) {
  const title = h('h2', { class: 'panel-title' });
  const btn = (label, onClick, cls = '') => h('button', { class: ['btn', cls], type: 'button', on: { click: onClick } }, label);
  const el = h('div', {},
    h('div', { class: 'panel-head' }, title),
    h('div', { class: 'panel-section' },
      h('h3', {}, t('align.title')),
      h('div', { class: 'panel-actions align-actions' },
        btn(t('align.horizontal'), () => ctx.align('horizontal')),
        btn(t('align.vertical'), () => ctx.align('vertical')),
        btn(t('align.diagonal'), () => ctx.align('diagonal')),
        btn(t('align.even'), () => ctx.align('even')),
      ),
    ),
    h('div', { class: 'panel-section' },
      h('div', { class: 'panel-actions' }, btn(t('stations.delete'), () => ctx.deleteSelection(), 'btn-small')),
    ),
  );
  return {
    el,
    /** @param {any} _p @param {import('../editor-state.js').EditorState} [s] */
    update(_p, s) {
      const n = s && s.selection.type === 'stations' ? s.selection.ids.length : 0;
      title.textContent = t('stations.selected', { count: n });
    },
  };
}
