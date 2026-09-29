// 次にタップする駅を待っている操作（乗換グループに足す駅・系統の始発駅と終着駅）
import { t } from '../i18n/i18n.js';
import { NO_SELECTION } from './editor-state.js';

/**
 * タップした駅で、待っている操作を進める
 * @param {{ store: any, es: any, hitTest: (p: any, w: any, filter?: (t: any) => boolean) => any, toast: (m: string) => void }} ctx
 * @param {any} p 画面の点
 * @param {{ x: number, y: number }} w 世界座標
 */
export function pickPending(ctx, p, w) {
  const { store, es, toast } = ctx;
  const pend = es.get().pending;
  const hit = ctx.hitTest(p, w, (tg) => tg.type === 'station' || tg.type === 'label');
  if (pend.kind === 'routeEnd') {
    const d = es.get().routeDraft;
    const onLine = hit && store.getState().lines.some((l) => l.stops.some((s) => s.stationId === hit.id));
    if (!hit || !onLine || !d) {
      toast(t('route.pickMiss'));
      return;
    }
    es.set({ pending: null, routeDraft: { ...d, [pend.which]: hit.id } });
    return;
  }
  // 乗換グループ
  if (!hit) {
    toast(t('interchange.pickMiss'));
    return;
  }
  const ic = pend.interchangeId && store.getState().interchanges.find((x) => x.id === pend.interchangeId);
  const ids = ic ? [...ic.stationIds, hit.id] : [pend.stationId, hit.id];
  if (new Set(ids).size < 2 || (ic && ic.stationIds.includes(hit.id))) {
    toast(t('interchange.pickOther'));
    return;
  }
  const id = store.dispatch({ type: 'interchange/add', stationIds: ids });
  es.set({ pending: null, selection: id ? { type: 'interchange', id } : NO_SELECTION });
  if (id) toast(t('interchange.added'));
}

/**
 * 待っている操作の案内（キャンバスの上に出す）
 * @param {{ kind: string, which?: string }} pend
 */
export function pendingHint(pend) {
  if (pend.kind === 'routeEnd') return t(pend.which === 'from' ? 'route.pickFromHint' : 'route.pickToHint');
  return t('interchange.pickHint');
}
