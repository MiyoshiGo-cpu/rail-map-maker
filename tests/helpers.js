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

/**
 * 私鉄A線（a0 a1 J1）→ 地下鉄B線（J1 b1 b2 J2）→ 私鉄C線（J2 c1 c2 c3）の直通の路線網。
 * a1・b2・c1 は主要駅、J1・J2 は2つの路線が通る駅
 */
export function throughNetwork() {
  const store = newStore();
  const d = (a) => store.dispatch(a);
  const S = {};
  const st = (key, x, rank = 'normal') => { S[key] = d({ type: 'station/add', x, y: 0, fields: { name: key, reading: 'えき', rank } }); };
  st('a0', 0, 'terminal'); st('a1', 2, 'major'); st('J1', 4);
  st('b1', 6); st('b2', 8, 'major'); st('J2', 10);
  st('c1', 12, 'major'); st('c2', 14); st('c3', 16, 'terminal');
  const opA = d({ type: 'operator/add', fields: { name: 'A電鉄', category: 'major' } });
  const opB = d({ type: 'operator/add', fields: { name: 'B交通局', category: 'public' } });
  const opC = d({ type: 'operator/add', fields: { name: 'C電鉄', category: 'major' } });
  const lineA = d({ type: 'line/add', fields: { operatorId: opA, name: 'A線' }, stationIds: [S.a0, S.a1, S.J1] });
  const lineB = d({ type: 'line/add', fields: { operatorId: opB, name: 'B線', kind: 'subway' }, stationIds: [S.J1, S.b1, S.b2, S.J2] });
  const lineC = d({ type: 'line/add', fields: { operatorId: opC, name: 'C線' }, stationIds: [S.J2, S.c1, S.c2, S.c3] });
  d({ type: 'serviceType/addPreset', operatorId: opA, presetId: 'private' });
  d({ type: 'serviceType/addPreset', operatorId: opB, presetId: 'subway' });
  d({ type: 'serviceType/addPreset', operatorId: opC, presetId: 'private' });
  const type = (op, name) => store.getState().serviceTypes.find((x) => x.operatorId === op && x.name === name).id;
  return { store, d, S, opA, opB, opC, lineA, lineB, lineC, type };
}
