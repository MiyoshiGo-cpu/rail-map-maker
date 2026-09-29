// 地形（§3 World）のアクション
/** @typedef {import('../patch.js').Tx} Tx */

/** @type {Record<string, (tx: Tx, a: any, ctx: any) => any>} */
export const worldReducers = {
  /**
   * 地形を付ける・作り直す { world, stationGeo?: { [stationId]: { x, y } } }
   * stationGeo があれば駅の地理座標も入れる（「地形を追加」で路線図の配置から仮に作った位置）
   */
  'world/set'(tx, { world, stationGeo }) {
    tx.set(['world'], world);
    if (!stationGeo) return;
    tx.state.stations.forEach((st, i) => {
      const g = stationGeo[st.id];
      if (g) tx.set(['stations', i, 'geo'], { x: g.x, y: g.y });
    });
  },
};
