// ビューの切り替え（路線図・停車駅案内図）。できたビューだけヘッダーに出す（§4.2）
import { t } from '../i18n/i18n.js';

/** ヘッダーに出すビュー */
export function viewTabs() {
  return [
    { id: 'schematic', label: t('views.schematic') },
    { id: 'stopChart', label: t('views.stopChart') },
  ];
}

/** 数字キーとビュー（SPEC の順番：1 路線図・2 地理・3 案内図・4 駅名標。まだ無いビューは null） */
const KEY_VIEWS = { 1: 'schematic', 3: 'stopChart' };

/**
 * @param {{ store: any, es: any, chartView: { targetFor: (p: any, sel: any) => string } }} ctx
 */
export function createViewSwitcher(ctx) {
  const { store, es } = ctx;
  /** @param {'schematic'|'stopChart'} view */
  function setView(view) {
    const s = es.get();
    if (s.view === view) return;
    const patch = { view, drawing: null, hover: null, rangeMode: false, marquee: null, pending: null };
    if (view === 'stopChart') {
      // 案内図では描くツールを使わない。選んでいる路線・系統があれば、それを対象にする
      patch.tool = 'select';
      const target = ctx.chartView.targetFor(store.getState(), s.selection);
      if (target) patch.chartTarget = target;
    }
    es.set(patch);
  }
  return {
    setView,
    /** @param {number} n 数字キー @returns {'schematic'|'stopChart'|null} */
    viewForKey(n) {
      return KEY_VIEWS[n] || null;
    },
  };
}
