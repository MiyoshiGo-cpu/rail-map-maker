// プロジェクト全体に関わるアクション

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

  /** 表示位置と倍率（履歴に入れない） { view: 'schematic'|'geo', state } */
  'project/view'(tx, { view, state }) {
    tx.set(['view', view], { ...state });
  },

  /** メタ情報（履歴に入れない） { fields } */
  'project/meta'(tx, { fields }) {
    tx.merge(['meta'], fields);
  },
};
