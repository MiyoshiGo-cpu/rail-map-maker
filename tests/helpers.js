// テスト用の小さな道具
import { createProject } from '../js/core/defaults.js';
import { createProjectStore } from '../js/core/actions/index.js';

/** 状態を書き換えていないか確かめるため、深く凍らせる */
export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

let clock = 0;
/** 決まった時刻を返す（updatedAt の比較をしやすくする） */
export const fixedNow = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString();

/** 空のプロジェクトとストア */
export function newStore(opt = {}) {
  const p = createProject({ id: 'pj_test', name: 'テスト', now: '2026-01-01T00:00:00.000Z' });
  return createProjectStore(deepFreeze(p), { now: fixedNow, ...opt });
}

/** 更新日時を除いて比べられる形にする */
export function strip(p) {
  const { updatedAt, ...rest } = p;
  void updatedAt;
  return rest;
}

/**
 * 格子に駅を並べて1本の路線を作る
 * @returns {{ store: any, lineId: string, ids: string[] }}
 */
export function storeWithLine(points = [[0, 0], [2, 0], [4, 0], [6, 0]]) {
  const store = newStore();
  const ids = points.map(([x, y]) => store.dispatch({ type: 'station/add', x, y }));
  const lineId = store.dispatch({ type: 'line/add', stationIds: ids });
  return { store, lineId, ids };
}
