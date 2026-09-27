// 事業者のアクション
import { ID_PREFIX } from '../schema.js';
import { createOperator } from '../defaults.js';
import { OPERATOR_PALETTE, nextColor, readableTextColor } from '../color.js';

/** @typedef {import('../patch.js').Tx} Tx */
/** @typedef {import('./context.js').ActionContext} Ctx */

/**
 * 既定の名前で事業者を足す（路線を引くときに事業者が1つもない場合にも使う）
 * @param {Tx} tx
 * @param {Ctx} ctx
 * @param {object} [fields]
 * @returns {string} 新しい ID
 */
export function addOperatorTo(tx, ctx, fields = {}) {
  const ops = tx.state.operators;
  const n = ops.length + 1;
  const color = nextColor(OPERATOR_PALETTE, ops.map((o) => o.color));
  const op = createOperator(ctx.region, {
    id: ctx.newId(ID_PREFIX.operator),
    name: ctx.mapT('map.default.operatorName', { n }),
    shortName: ctx.mapT('map.default.operatorShort', { n }),
    color,
    textColor: readableTextColor(color),
    ...fields,
  });
  tx.push(['operators'], op);
  return op.id;
}

/** @type {Record<string, (tx: Tx, a: any, ctx: Ctx) => any>} */
export const operatorReducers = {
  /** { fields? } → 新しい ID */
  'operator/add'(tx, { fields }, ctx) {
    return addOperatorTo(tx, ctx, fields);
  },

  /** { operatorId, fields } */
  'operator/update'(tx, { operatorId, fields }) {
    const i = tx.indexOf('operators', operatorId);
    if (i < 0) return;
    tx.merge(['operators', i], fields);
  },

  /** 使われていない事業者だけ消せる { operatorId } → 消せたら true */
  'operator/delete'(tx, { operatorId }) {
    const s = tx.state;
    const used = s.lines.some((l) => l.operatorId === operatorId) ||
      s.serviceTypes.some((t) => t.operatorId === operatorId) ||
      s.fareTables.some((f) => f.operatorId === operatorId);
    if (used) return false;
    const i = tx.indexOf('operators', operatorId);
    if (i < 0) return false;
    tx.remove(['operators'], i);
    // 管理事業者の参照を外す
    s.stations.forEach((st, j) => {
      if (st.managedBy === operatorId) tx.set(['stations', j, 'managedBy'], undefined);
    });
    return true;
  },
};
