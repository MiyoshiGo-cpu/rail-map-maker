// チェック（§6.6）：問題の一覧。各項目の「移動」で、該当するものを選んで画面に出す。
// 架空の地形があるときは、トンネル・橋梁の提案（情報）も出し、「当てる」と「まとめて当てる」で区間の構造を変える
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, formatDistance } from '../i18n/i18n.js';
import { toast } from './toast.js';
import { runChecks } from '../core/validate.js';
import { suggestStructures, structureCheckItems } from '../core/structure-suggest.js';
import { loadGeoBase, readyGeoBase } from './geo-base.js';

/**
 * @param {{ store: any, close: () => void, go: (target: any) => void, refresh: () => void }} ctx refresh は地形を調べ終えたときに描き直す
 */
export function createCheckView(ctx) {
  const summary = h('span', { class: 'check-summary' });
  const list = h('ul', { class: 'check-list' });
  const apply = (fixes) => {
    ctx.store.dispatch({ type: 'line/applyStructures', items: fixes });
    toast(t('check.applied', { count: fixes.length }));
  };
  const bulkText = h('p', { class: 'panel-note' }, t('check.structureNote'));
  const bulkBtn = h('button', { class: 'btn btn-small', type: 'button', on: { click: () => apply(structureItems().map((it) => it.fix)) } });
  const bulk = h('div', { class: 'check-bulk', hidden: true }, bulkText, bulkBtn);
  const el = h('section', { class: 'ed-data ed-check', 'aria-label': t('check.title') },
    h('div', { class: 'data-head' },
      h('h2', { class: 'check-title' }, t('check.title')),
      summary,
      h('button', { class: 'icon-btn on-paper-btn', type: 'button', 'aria-label': t('common.close'), title: t('common.close'), on: { click: () => ctx.close() } }, icon('close')),
    ),
    h('div', { class: 'data-body' }, bulk, list),
  );

  let cache = { project: null, items: [] };
  /** 問題の一覧（プロジェクトが変わったときだけ数え直す） */
  function items() {
    const p = ctx.store.getState();
    if (cache.project !== p) cache = { project: p, items: runChecks(p) };
    return cache.items;
  }

  let sugCache = { project: null, base: null, items: [] };
  let surveying = false;
  /** トンネル・橋梁の提案（地形の下ごしらえがまだなら頼んで、できたら描き直す） */
  function structureItems() {
    const p = ctx.store.getState();
    if (p.world.mode !== 'fictional') return [];
    const base = readyGeoBase(p.world);
    if (!base) {
      if (!surveying) {
        surveying = true;
        loadGeoBase(p.world).then(() => {
          surveying = false;
          ctx.refresh();
        }, (e) => {
          surveying = false;
          console.error('[check]', e);
        });
      }
      return [];
    }
    if (sugCache.project !== p || sugCache.base !== base) {
      sugCache = { project: p, base, items: structureCheckItems(p, suggestStructures(p, base)) };
    }
    return sugCache.items;
  }

  return {
    el,
    items,
    /** エラーと警告の数（ボタンに出す） */
    count() {
      return items().filter((i) => i.level !== 'info').length;
    },
    update() {
      const sug = structureItems();
      const all = [...items(), ...sug];
      const n = (lv) => all.filter((i) => i.level === lv).length;
      summary.textContent = t('check.summary', { errors: n('error'), warnings: n('warning'), infos: n('info') });
      bulk.hidden = sug.length < 2;
      bulkBtn.textContent = t('check.applyAll', { count: sug.length });
      if (!all.length) {
        list.replaceChildren(h('li', { class: 'panel-empty' }, t(surveying ? 'check.surveying' : 'check.none')));
        return;
      }
      list.replaceChildren(...all.map((it) => h('li', { class: 'check-item', dataset: { level: it.level } },
        h('span', { class: 'check-level' }, t('check.level.' + it.level)),
        h('span', { class: 'check-text' }, t('check.' + it.code, formatParams(it.params))),
        it.target ? h('button', { class: 'btn btn-small', type: 'button', on: { click: () => ctx.go(it.target) } }, t('common.move')) : null,
        it.fix ? h('button', { class: 'btn btn-small', type: 'button', on: { click: () => apply([it.fix]) } }, t('check.apply')) : null,
      )));
    },
  };
}

/**
 * 差し込む値を表示用にする。距離は { distance, unit }（単位を付けて0.1単位）、
 * 列挙値などの名前は { key, vars? }（カタログのキー）、軌間は { gauge }（mm。null は対象外）で受け取る
 * @param {Record<string, any>} params
 */
function formatParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (!v || typeof v !== 'object') out[k] = v;
    else if ('distance' in v) out[k] = formatDistance(v.distance, v.unit);
    else if ('key' in v) out[k] = t(v.key, v.vars);
    else if ('gauge' in v) out[k] = v.gauge === null ? t('gauge.none') : t('unit.mm', { value: v.gauge });
    else out[k] = '';
  }
  return out;
}
