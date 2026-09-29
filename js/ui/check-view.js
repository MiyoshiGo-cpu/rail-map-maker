// チェック（§6.6）：問題の一覧。各項目の「移動」で、該当するものを選んで画面に出す
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, formatDistance } from '../i18n/i18n.js';
import { runChecks } from '../core/validate.js';

/**
 * @param {{ store: any, close: () => void, go: (target: any) => void }} ctx
 */
export function createCheckView(ctx) {
  const summary = h('span', { class: 'check-summary' });
  const list = h('ul', { class: 'check-list' });
  const el = h('section', { class: 'ed-data ed-check', 'aria-label': t('check.title') },
    h('div', { class: 'data-head' },
      h('h2', { class: 'check-title' }, t('check.title')),
      summary,
      h('button', { class: 'icon-btn on-paper-btn', type: 'button', 'aria-label': t('common.close'), title: t('common.close'), on: { click: () => ctx.close() } }, icon('close')),
    ),
    h('div', { class: 'data-body' }, list),
  );

  let cache = { project: null, items: [] };
  /** 問題の一覧（プロジェクトが変わったときだけ数え直す） */
  function items() {
    const p = ctx.store.getState();
    if (cache.project !== p) cache = { project: p, items: runChecks(p) };
    return cache.items;
  }

  return {
    el,
    items,
    /** エラーと警告の数（ボタンに出す） */
    count() {
      return items().filter((i) => i.level !== 'info').length;
    },
    update() {
      const all = items();
      const n = (lv) => all.filter((i) => i.level === lv).length;
      summary.textContent = t('check.summary', { errors: n('error'), warnings: n('warning'), infos: n('info') });
      if (!all.length) {
        list.replaceChildren(h('li', { class: 'panel-empty' }, t('check.none')));
        return;
      }
      list.replaceChildren(...all.map((it) => h('li', { class: 'check-item', dataset: { level: it.level } },
        h('span', { class: 'check-level' }, t('check.level.' + it.level)),
        h('span', { class: 'check-text' }, t('check.' + it.code, formatParams(it.params))),
        it.target ? h('button', { class: 'btn btn-small', type: 'button', on: { click: () => ctx.go(it.target) } }, t('common.move')) : null,
      )));
    },
  };
}

/**
 * 差し込む値を表示用にする（距離は { distance, unit } で受け取り、単位を付けて0.1単位にする）
 * @param {Record<string, any>} params
 */
function formatParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = v && typeof v === 'object' && 'distance' in v ? formatDistance(v.distance, v.unit) : v;
  }
  return out;
}
