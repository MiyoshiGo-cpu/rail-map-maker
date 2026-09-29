// 新しい系統を作るパネル：始発駅・終着駅・種別を選び、経路の候補から作る
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { createRoutePicker } from '../route-picker.js';

/**
 * @param {{ store: any, es: any, toast: (m: string) => void }} ctx
 */
export function createServiceNewPanel(ctx) {
  const { store, es } = ctx;
  const picker = createRoutePicker(ctx, {
    onPick(route, draft) {
      const id = store.dispatch({ type: 'service/add', route, typeId: draft.typeId });
      es.set({ routeDraft: null, pending: null, selection: { type: 'service', id } });
      ctx.toast(t('service.created'));
    },
  });
  const el = h('div', {},
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, t('service.new'))),
    h('div', { class: 'panel-section' },
      h('p', { class: 'panel-note' }, t('service.newHint')),
      picker.el,
      h('div', { class: 'panel-actions' },
        h('button', { class: 'btn btn-small', type: 'button', on: { click: () => es.set({ routeDraft: null, pending: null }) } }, t('common.cancel')),
      ),
    ),
  );
  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      picker.update(p);
    },
  };
}
