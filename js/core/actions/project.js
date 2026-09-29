// プロジェクト全体に関わるアクション
import { applyRomaji } from './stations.js';
import { applyStylePreset } from '../map-style.js';

/** @typedef {import('../patch.js').Tx} Tx */

/** @type {Record<string, (tx: Tx, a: any, ctx: any) => any>} */
export const projectReducers = {
  /** 名前・作者を変える { fields: { name?, author? } } */
  'project/update'(tx, { fields }) {
    const allowed = {};
    if ('name' in fields) allowed.name = String(fields.name);
    if ('author' in fields) allowed.author = fields.author ? String(fields.author) : undefined;
    tx.merge([], allowed);
  },

  /** 見た目の設定を変える { fields } */
  'project/style'(tx, { fields }) {
    tx.merge(['style'], fields);
  },

  /** スタイルプリセットを選ぶ（詳細設定をまとめて書き換える） { presetId } */
  'project/stylePreset'(tx, { presetId }) {
    const next = applyStylePreset(tx.state.style, presetId, tx.state.locale.region);
    tx.merge(['style'], next);
  },

  /** 英字の規則を変え、自動生成中の駅の英字をまとめて作り直す { fields } */
  'project/romaji'(tx, { fields }, ctx) {
    tx.merge(['settings', 'romaji'], fields);
    tx.state.stations.forEach((_, i) => applyRomaji(tx, ctx, i));
  },

  /** 表示位置と倍率（履歴に入れない） { view: 'schematic'|'geo', state } */
  'project/view'(tx, { view, state }) {
    tx.set(['view', view], { ...state });
  },

  /** メタ情報（履歴に入れない） { fields } */
  'project/meta'(tx, { fields }) {
    tx.merge(['meta'], fields);
  },
};
