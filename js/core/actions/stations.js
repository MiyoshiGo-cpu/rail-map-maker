// 駅のアクション
import { ID_PREFIX } from '../schema.js';
import { createStation } from '../defaults.js';
import { removeStop } from '../lines.js';

/** @typedef {import('../patch.js').Tx} Tx */
/** @typedef {import('./context.js').ActionContext} Ctx */

/**
 * 駅を足す
 * @param {Tx} tx
 * @param {Ctx} ctx
 * @param {{ x: number, y: number }} pos 路線図の格子座標
 * @param {object} [fields]
 * @returns {string}
 */
export function addStationTo(tx, ctx, pos, fields = {}) {
  const st = createStation(ctx.region, {
    id: ctx.newId(ID_PREFIX.station),
    schematic: { x: Math.round(pos.x) + 0, y: Math.round(pos.y) + 0 },
    ...fields,
  });
  tx.push(['stations'], st);
  return st.id;
}

/**
 * 駅を消す。通っていた路線は前後の駅でつなぎ直し、乗換グループからも外す
 * @param {Tx} tx
 * @param {string[]} ids
 */
export function deleteStationsFrom(tx, ids) {
  const del = new Set(ids);
  // 路線
  tx.state.lines.forEach((line, li) => {
    if (!line.stops.some((s) => del.has(s.stationId))) return;
    let next = line;
    for (let k = next.stops.length - 1; k >= 0; k--) {
      if (del.has(next.stops[k].stationId)) next = removeStop(next, k);
    }
    tx.set(['lines', li], next);
  });
  // 乗換グループ（2駅未満になったらグループを消す）
  for (let i = tx.state.interchanges.length - 1; i >= 0; i--) {
    const ic = tx.state.interchanges[i];
    if (!ic.stationIds.some((id) => del.has(id))) continue;
    const rest = ic.stationIds.filter((id) => !del.has(id));
    if (rest.length < 2) tx.remove(['interchanges'], i);
    else tx.set(['interchanges', i, 'stationIds'], rest);
  }
  // 運行系統の停車駅（フェーズ2で経路の扱いを決める）
  tx.state.services.forEach((sv, i) => {
    if (sv.stops.some((id) => del.has(id))) tx.set(['services', i, 'stops'], sv.stops.filter((id) => !del.has(id)));
  });
  // 駅
  for (let i = tx.state.stations.length - 1; i >= 0; i--) {
    if (del.has(tx.state.stations[i].id)) tx.remove(['stations'], i);
  }
}

/** @type {Record<string, (tx: Tx, a: any, ctx: Ctx) => any>} */
export const stationReducers = {
  /** { x, y, fields? } → 新しい ID */
  'station/add'(tx, { x, y, fields }, ctx) {
    return addStationTo(tx, ctx, { x, y }, fields);
  },

  /** { stationId, fields }（undefined のキーは消す） */
  'station/update'(tx, { stationId, fields }) {
    const i = tx.indexOf('stations', stationId);
    if (i < 0) return;
    tx.merge(['stations', i], fields);
  },

  /** ラベルの設定を変える { stationId, view: 'schematic'|'geo', fields } */
  'station/label'(tx, { stationId, view = 'schematic', fields }) {
    const i = tx.indexOf('stations', stationId);
    if (i < 0) return;
    tx.merge(['stations', i, 'label', view], fields);
  },

  /** 路線図の位置を動かす { ids, dx, dy } */
  'station/move'(tx, { ids, dx, dy }) {
    if (!dx && !dy) return;
    const set = new Set(ids);
    tx.state.stations.forEach((st, i) => {
      if (!set.has(st.id) || !st.schematic) return;
      tx.set(['stations', i, 'schematic'], { x: st.schematic.x + dx, y: st.schematic.y + dy });
    });
  },

  /** 路線図の位置をまとめて決める { positions: { [id]: { x, y } } } */
  'station/place'(tx, { positions }) {
    tx.state.stations.forEach((st, i) => {
      const p = positions[st.id];
      if (!p) return;
      if (st.schematic && st.schematic.x === p.x && st.schematic.y === p.y) return;
      tx.set(['stations', i, 'schematic'], { x: Math.round(p.x) + 0, y: Math.round(p.y) + 0 });
    });
  },

  /** { ids } */
  'station/delete'(tx, { ids }) {
    deleteStationsFrom(tx, ids);
  },

  /** 駅を複製して (dx, dy) ずらした位置に置く { ids, dx, dy } → 新しい ID の配列 */
  'station/duplicate'(tx, { ids, dx = 1, dy = 1 }, ctx) {
    const out = [];
    for (const id of ids) {
      const st = tx.find('stations', id);
      const copy = {
        ...st,
        id: ctx.newId(ID_PREFIX.station),
        schematic: st.schematic ? { x: st.schematic.x + dx, y: st.schematic.y + dy } : null,
      };
      tx.push(['stations'], copy);
      out.push(copy.id);
    }
    return out;
  },
};
