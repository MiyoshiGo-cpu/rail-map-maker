// 種別のアクション（§3 ServiceType。事業者ごとに定義する）
import { ID_PREFIX } from '../schema.js';
import { createServiceType, serviceTypeFromPreset } from '../defaults.js';
import { defaultDwellSec } from '../regions/index.js';

/** @typedef {import('../patch.js').Tx} Tx */
/** @typedef {import('./context.js').ActionContext} Ctx */
/** @typedef {import('../schema.js').ServiceType} ServiceType */

/**
 * 事業者の種別を、遅い順（rank の小さい順。同じなら配列の順）に並べる
 * @param {ServiceType[]} types
 * @param {string} operatorId
 * @returns {{ type: ServiceType, index: number }[]}
 */
export function typesOfOperator(types, operatorId) {
  return types
    .map((type, index) => ({ type, index }))
    .filter((x) => x.type.operatorId === operatorId)
    .sort((a, b) => a.type.rank - b.type.rank || a.index - b.index);
}

/** @type {Record<string, (tx: Tx, a: any, ctx: Ctx) => any>} */
export const serviceTypeReducers = {
  /** 種別を1つ足す { operatorId, fields? } → ID。名前の既定は地図の言語の「種別{n}」 */
  'serviceType/add'(tx, { operatorId, fields = {} }, ctx) {
    const mine = typesOfOperator(tx.state.serviceTypes, operatorId);
    const rank = fields.rank ?? (mine.length ? mine[mine.length - 1].type.rank + 1 : 1);
    const type = createServiceType(ctx.region, {
      id: ctx.newId(ID_PREFIX.serviceType),
      operatorId,
      name: ctx.mapT('map.default.typeName', { n: mine.length + 1 }),
      rank,
      ...fields,
    });
    tx.push(['serviceTypes'], type);
    return type.id;
  },

  /**
   * プリセット（地域パック）の種別をまとめて足す { operatorId, presetId } → 足した ID の配列。
   * 同じ事業者に同じ名前の種別があれば足さない。
   */
  'serviceType/addPreset'(tx, { operatorId, presetId }, ctx) {
    const preset = ctx.region.serviceTypePresets.find((x) => x.id === presetId);
    if (!preset) return [];
    const names = new Set(tx.state.serviceTypes.filter((x) => x.operatorId === operatorId).map((x) => x.name));
    const ids = [];
    for (const x of preset.types) {
      if (names.has(x.name)) continue;
      const type = { id: ctx.newId(ID_PREFIX.serviceType), operatorId, ...serviceTypeFromPreset(ctx.region, x) };
      tx.push(['serviceTypes'], type);
      ids.push(type.id);
    }
    return ids;
  },

  /** { typeId, fields } */
  'serviceType/update'(tx, { typeId, fields }) {
    const i = tx.indexOf('serviceTypes', typeId);
    if (i < 0) return;
    const next = { ...tx.state.serviceTypes[i], ...fields };
    for (const [k, v] of Object.entries(fields)) if (v === undefined) delete next[k];
    tx.set(['serviceTypes', i], next);
  },

  /**
   * 並べ替え：遅い順の並びで delta（-1 か 1）だけ動かす。隣の種別と rank を入れ替える。
   * rank が同じなら配列の中の順番を入れ替える。
   */
  'serviceType/move'(tx, { typeId, delta }) {
    const t0 = tx.state.serviceTypes.find((x) => x.id === typeId);
    if (!t0) return;
    const list = typesOfOperator(tx.state.serviceTypes, t0.operatorId);
    const i = list.findIndex((x) => x.type.id === typeId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = list[i];
    const b = list[j];
    if (a.type.rank !== b.type.rank) {
      tx.set(['serviceTypes', a.index, 'rank'], b.type.rank);
      tx.set(['serviceTypes', b.index, 'rank'], a.type.rank);
    } else {
      tx.set(['serviceTypes', a.index], b.type);
      tx.set(['serviceTypes', b.index], a.type);
    }
  },

  /** rank に合わせて停車時間を既定に戻す { typeId } */
  'serviceType/resetDwell'(tx, { typeId }, ctx) {
    const i = tx.indexOf('serviceTypes', typeId);
    if (i < 0) return;
    tx.set(['serviceTypes', i, 'dwellSec'], defaultDwellSec(ctx.region, tx.state.serviceTypes[i].rank));
  },

  /** 種別を消す { typeId } → 系統が使っていれば消さずに false */
  'serviceType/delete'(tx, { typeId }) {
    const used = tx.state.services.some((sv) => sv.segments.some((seg) => seg.typeId === typeId));
    if (used) return false;
    const i = tx.indexOf('serviceTypes', typeId);
    if (i < 0) return false;
    tx.remove(['serviceTypes'], i);
    return true;
  },
};
