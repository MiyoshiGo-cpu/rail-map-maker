// ビューの切り替え（路線図・停車駅案内図・駅名標）。できたビューだけヘッダーに出す（§4.2）
// 路線図のほかのビュー（案内図・駅名標）は、ここで作ってまとめて扱う。
import { t } from '../i18n/i18n.js';
import { createStopChartView } from './stopchart-view.js';
import { createSignboardView } from './signboard-view.js';

/** @typedef {'schematic'|'stopChart'|'signboard'} ViewId */

/** ヘッダーに出すビュー */
export function viewTabs() {
  return [
    { id: 'schematic', label: t('views.schematic') },
    { id: 'stopChart', label: t('views.stopChart') },
    { id: 'signboard', label: t('views.signboard') },
  ];
}

/** 数字キーとビュー（SPEC の順番：1 路線図・2 地理・3 案内図・4 駅名標。まだ無いビューは null） */
const KEY_VIEWS = { 1: 'schematic', 3: 'stopChart', 4: 'signboard' };

/**
 * 案内図と駅名標のビュー
 * @param {{ store: any, es: any, onSelectService: (id: string) => void }} ctx
 */
export function createOtherViews(ctx) {
  const chart = createStopChartView({ store: ctx.store, es: ctx.es, onSelectService: ctx.onSelectService });
  const sign = createSignboardView({ store: ctx.store, es: ctx.es });
  const byId = { stopChart: chart, signboard: sign };
  return {
    chart,
    sign,
    els: [chart.el, sign.el],
    /** 表示しているビューだけ見せて描き直す @param {any} p @param {ViewId} view */
    update(p, view) {
      chart.el.hidden = view !== 'stopChart';
      sign.el.hidden = view !== 'signboard';
      if (byId[view]) byId[view].update(p);
    },
    /** @param {ViewId} view */
    get: (view) => byId[view] || null,
    dispose() {
      chart.dispose();
      sign.dispose();
    },
  };
}

/**
 * @param {{ store: any, es: any, others: ReturnType<typeof createOtherViews> }} ctx
 */
export function createViewSwitcher(ctx) {
  const { store, es, others } = ctx;
  /** @param {ViewId} view */
  function setView(view) {
    const s = es.get();
    if (s.view === view) return;
    const patch = { view, drawing: null, hover: null, rangeMode: false, marquee: null, pending: null };
    if (view !== 'schematic') {
      // 案内図・駅名標では描くツールを使わない。選んでいる路線・系統・駅があれば、それを対象にする
      patch.tool = 'select';
      const p = store.getState();
      if (view === 'stopChart') {
        const target = others.chart.targetFor(p, s.selection);
        if (target) patch.chartTarget = target;
      } else {
        Object.assign(patch, others.sign.targetFor(p, s.selection) || {});
      }
    }
    es.set(patch);
  }
  return {
    setView,
    /** @param {number} n 数字キー @returns {ViewId|null} */
    viewForKey(n) {
      return KEY_VIEWS[n] || null;
    },
  };
}
