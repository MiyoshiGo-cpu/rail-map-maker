// ビューの切り替え（路線図・地理・停車駅案内図・駅名標）。できたビューだけヘッダーに出す（§4.2）
// 路線図のほかのビュー（地理・案内図・駅名標）は、ここで作ってまとめて扱う。
import { t } from '../i18n/i18n.js';
import { createStopChartView } from './stopchart-view.js';
import { createSignboardView } from './signboard-view.js';
import { createGeoView } from './geo-view.js';

/** @typedef {'schematic'|'geo'|'stopChart'|'signboard'} ViewId */

/** ヘッダーに出すビュー */
export function viewTabs() {
  return [
    { id: 'schematic', label: t('views.schematic') },
    { id: 'geo', label: t('views.geo') },
    { id: 'stopChart', label: t('views.stopChart') },
    { id: 'signboard', label: t('views.signboard') },
  ];
}

/**
 * 今のプロジェクトで使えるビュー（地理は架空の地形があるときだけ。実在の地図はフェーズ5）
 * @param {import('../core/schema.js').Project} p
 * @returns {ViewId[]}
 */
export function availableViews(p) {
  return p.world.mode === 'fictional' ? ['schematic', 'geo', 'stopChart', 'signboard'] : ['schematic', 'stopChart', 'signboard'];
}

/** 数字キーとビュー（SPEC の順番：1 路線図・2 地理・3 案内図・4 駅名標） */
const KEY_VIEWS = { 1: 'schematic', 2: 'geo', 3: 'stopChart', 4: 'signboard' };

/**
 * 地理・案内図・駅名標のビュー
 * @param {{ store: any, es: any, onSelectService: (id: string) => void, getInsets?: () => { top: number, right: number, bottom: number, left: number } }} ctx
 */
export function createOtherViews(ctx) {
  const geo = createGeoView({ store: ctx.store, es: ctx.es, getInsets: ctx.getInsets });
  const chart = createStopChartView({ store: ctx.store, es: ctx.es, onSelectService: ctx.onSelectService });
  const sign = createSignboardView({ store: ctx.store, es: ctx.es });
  const byId = { geo, stopChart: chart, signboard: sign };
  return {
    geo,
    chart,
    sign,
    els: [geo.el, chart.el, sign.el],
    /** 表示しているビューだけ見せて描き直す @param {any} p @param {ViewId} view */
    update(p, view) {
      geo.el.hidden = view !== 'geo';
      chart.el.hidden = view !== 'stopChart';
      sign.el.hidden = view !== 'signboard';
      if (byId[view]) byId[view].update(p);
    },
    /** @param {ViewId} view */
    get: (view) => byId[view] || null,
    dispose() {
      geo.dispose();
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
    const p = store.getState();
    if (s.view === view || !availableViews(p).includes(view)) return;
    const patch = { view, drawing: null, hover: null, rangeMode: false, marquee: null, pending: null };
    if (view !== 'schematic') {
      // 地理（ステップ5まで）・案内図・駅名標では描くツールを使わない。選んでいる路線・系統・駅があれば、それを対象にする
      patch.tool = 'select';
      if (view === 'stopChart') {
        const target = others.chart.targetFor(p, s.selection);
        if (target) patch.chartTarget = target;
      } else if (view === 'signboard') {
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
