// 乗換グループのアクション
import { ID_PREFIX } from '../schema.js';
import { createInterchange } from '../defaults.js';

/** @typedef {import('../patch.js').Tx} Tx */
/** @typedef {import('./context.js').ActionContext} Ctx */

/** @type {Record<string, (tx: Tx, a: any, ctx: Ctx) => any>} */
export const interchangeReducers = {
  /**
   * 駅どうしを乗換グループにする { stationIds } → グループの ID。
   * すでにグループに入っている駅があれば、そのグループにまとめる。
   */
  'interchange/add'(tx, { stationIds }, ctx) {
    const ids = [...new Set(stationIds)];
    const groups = tx.state.interchanges
      .map((ic, i) => ({ ic, i }))
      .filter(({ ic }) => ic.stationIds.some((id) => ids.includes(id)));
    if (groups.length === 0) {
      if (ids.length < 2) return null;
      const ic = createInterchange({ id: ctx.newId(ID_PREFIX.interchange), stationIds: ids });
      tx.push(['interchanges'], ic);
      return ic.id;
    }
    // 最初のグループに集め、ほかのグループは消す
    const [keep, ...rest] = groups;
    const merged = [...keep.ic.stationIds];
    for (const g of rest) for (const id of g.ic.stationIds) if (!merged.includes(id)) merged.push(id);
    for (const id of ids) if (!merged.includes(id)) merged.push(id);
    tx.set(['interchanges', keep.i, 'stationIds'], merged);
    for (const g of [...rest].sort((a, b) => b.i - a.i)) tx.remove(['interchanges'], g.i);
    return keep.ic.id;
  },

  /** グループから駅を外す。2駅未満になったらグループを消す { interchangeId, stationId } */
  'interchange/removeStation'(tx, { interchangeId, stationId }) {
    const i = tx.indexOf('interchanges', interchangeId);
    if (i < 0) return;
    const rest = tx.state.interchanges[i].stationIds.filter((id) => id !== stationId);
    if (rest.length < 2) tx.remove(['interchanges'], i);
    else tx.set(['interchanges', i, 'stationIds'], rest);
  },

  /** { interchangeId, fields: { walkMinutes?, showConnector? } } */
  'interchange/update'(tx, { interchangeId, fields }) {
    const i = tx.indexOf('interchanges', interchangeId);
    if (i < 0) return;
    tx.merge(['interchanges', i], fields);
  },

  /** { interchangeId } */
  'interchange/delete'(tx, { interchangeId }) {
    const i = tx.indexOf('interchanges', interchangeId);
    if (i < 0) return;
    tx.remove(['interchanges'], i);
  },
};
