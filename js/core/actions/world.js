// 地形（§3 World）のアクション
import { normalizeStroke } from '../terrain/brush.js';

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

  /** ブラシの1回のなぞり { stroke }（地形の編集の差分に足す。1手で取り消せる） */
  'world/brush'(tx, { stroke }) {
    const w = tx.state.world;
    if (w.mode !== 'fictional') return;
    const st = normalizeStroke(stroke);
    if (Array.isArray(w.terrain.edits)) tx.push(['world', 'terrain', 'edits'], st);
    else tx.set(['world', 'terrain', 'edits'], [st]);
  },

  /** 都市を置く { city }（ID の無い City）→ 新しい ID */
  'world/cityAdd'(tx, { city }) {
    const w = tx.state.world;
    if (w.mode !== 'fictional') return null;
    let n = 0;
    for (const c of w.cities) {
      const m = /^city_(\d+)$/.exec(c.id);
      if (m) n = Math.max(n, Number(m[1]));
    }
    const id = `city_${n + 1}`;
    tx.push(['world', 'cities'], { ...city, id });
    return id;
  },

  /** 都市を書き換える { id, fields }（undefined のキーは消す） */
  'world/cityUpdate'(tx, { id, fields }) {
    const i = cityIndex(tx, id);
    if (i >= 0) tx.merge(['world', 'cities', i], fields);
  },

  /** 都市を消す { id } → 消せたか（県庁所在地は県の範囲の元なので消さない） */
  'world/cityDelete'(tx, { id }) {
    const w = tx.state.world;
    const i = cityIndex(tx, id);
    if (i < 0 || w.regions.some((r) => r.capitalCityId === id)) return false;
    tx.remove(['world', 'cities'], i);
    return true;
  },
};

/** @param {Tx} tx @param {string} id */
function cityIndex(tx, id) {
  const w = tx.state.world;
  return w.mode === 'fictional' ? w.cities.findIndex((c) => c.id === id) : -1;
}
