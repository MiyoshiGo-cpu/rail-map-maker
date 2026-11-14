// 駅のアクション
import { ID_PREFIX } from '../schema.js';
import { createStation } from '../defaults.js';
import { removeStop } from '../lines.js';
import { romanize } from '../romaji.js';
import { shrinkServices } from './services.js';
import { estimateGeo, estimateSchematic, freeGridPoint } from '../geo-layout.js';

/** @typedef {import('../patch.js').Tx} Tx */
/** @typedef {import('./context.js').ActionContext} Ctx */

/**
 * 自動生成が有効な駅の英字を、よみから作り直す（§6.1。地域パックが英字の自動生成を使い、地図の言語が合うときだけ）
 * @param {Tx} tx
 * @param {Ctx} ctx
 * @param {number} i 駅の位置
 */
export function applyRomaji(tx, ctx, i) {
  const p = tx.state;
  const r = ctx.region;
  if (!r.autoRomanize || p.locale.mapLanguage !== r.romanizeFrom) return;
  const st = p.stations[i];
  if (!st.autoRomanize) return;
  const en = romanize(st.reading || '', p.settings.romaji) || undefined;
  if ((st.names[r.romanizeTo] || undefined) === en) return;
  tx.set(['stations', i, 'names'], { ...st.names, [r.romanizeTo]: en });
}

const round3 = (v) => Math.round(v * 1000) / 1000 + 0;

/**
 * 架空の地形の中央（km）。対応のある駅が無いときに、路線図で置いた駅を地理のここに仮置きする
 * @param {import('../schema.js').World} world
 */
function worldCenter(world) {
  const km = world.mode === 'fictional' ? world.gen.size * world.gen.cellKm : 0;
  return { x: km / 2, y: km / 2 };
}

/**
 * 駅を足す。路線図の格子座標で置いたら、架空の地形があるときは地理にも近い位置に仮置きする。
 * 地理座標（pos.geo、km）で置いたら、路線図の近くの空いた格子点に仮置きする（§7 フェーズ4）
 * @param {Tx} tx
 * @param {Ctx} ctx
 * @param {{ x: number, y: number } | { geo: { x: number, y: number } }} pos
 * @param {object} [fields]
 * @returns {string}
 */
export function addStationTo(tx, ctx, pos, fields = {}) {
  const p = tx.state;
  let schematic;
  let geo = null;
  if ('geo' in pos && pos.geo) {
    geo = { x: round3(pos.geo.x), y: round3(pos.geo.y) };
    schematic = freeGridPoint(p.stations, estimateSchematic(p.stations, geo));
  } else {
    const q = /** @type {{ x: number, y: number }} */ (pos);
    schematic = { x: Math.round(q.x) + 0, y: Math.round(q.y) + 0 };
    if (p.world.mode === 'fictional') geo = estimateGeo(p.stations, schematic, worldCenter(p.world));
  }
  const st = createStation(ctx.region, {
    id: ctx.newId(ID_PREFIX.station),
    schematic,
    geo,
    ...fields,
  });
  tx.push(['stations'], st);
  applyRomaji(tx, ctx, tx.state.stations.length - 1);
  return st.id;
}

/**
 * 駅を消す。通っていた路線は前後の駅でつなぎ直し、乗換グループからも外す。
 * 系統は、消える駅を端にしている区間を隣の駅まで縮める（区間が無くなった系統は消す）
 * @param {Tx} tx
 * @param {string[]} ids
 * @returns {number} 消した系統の数
 */
export function deleteStationsFrom(tx, ids) {
  const del = new Set(ids);
  // 系統（路線を書き換える前に、元の駅の並びで縮める）
  const byLine = new Map();
  for (const line of tx.state.lines) {
    if (line.stops.some((s) => del.has(s.stationId))) byLine.set(line.id, del);
  }
  const removedServices = shrinkServices(tx, byLine);
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
  // 運行系統の停車駅
  tx.state.services.forEach((sv, i) => {
    if (sv.stops.some((id) => del.has(id))) tx.set(['services', i, 'stops'], sv.stops.filter((id) => !del.has(id)));
  });
  // 駅
  for (let i = tx.state.stations.length - 1; i >= 0; i--) {
    if (del.has(tx.state.stations[i].id)) tx.remove(['stations'], i);
  }
  return removedServices;
}

/** @type {Record<string, (tx: Tx, a: any, ctx: Ctx) => any>} */
export const stationReducers = {
  /** { x, y, fields? }（路線図の格子座標）か { geo: { x, y }, fields? }（地理座標 km）→ 新しい ID */
  'station/add'(tx, { x, y, geo, fields }, ctx) {
    return addStationTo(tx, ctx, geo ? { geo } : { x, y }, fields);
  },

  /** { stationId, fields }（undefined のキーは消す）。よみを変えたら英字も作り直す */
  'station/update'(tx, { stationId, fields }, ctx) {
    const i = tx.indexOf('stations', stationId);
    if (i < 0) return;
    tx.merge(['stations', i], fields);
    if ('reading' in fields || 'autoRomanize' in fields) applyRomaji(tx, ctx, i);
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

  /** 地理の位置を動かす { ids, dx, dy }（km） */
  'station/moveGeo'(tx, { ids, dx, dy }) {
    if (!dx && !dy) return;
    const set = new Set(ids);
    tx.state.stations.forEach((st, i) => {
      if (!set.has(st.id) || !st.geo || !('x' in st.geo)) return;
      tx.set(['stations', i, 'geo'], { x: round3(st.geo.x + dx), y: round3(st.geo.y + dy) });
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

  /**
   * 路線図を作り直す（地理から路線図を作る）{ positions: { [id]: { x, y } } }。
   * 駅を置き直し、路線図の経由点・曲がり方と、置き直した駅の札の位置（自動以外・ずらし）を消す
   */
  'station/autoLayout'(tx, { positions }) {
    stationReducers['station/place'](tx, { positions });
    tx.state.lines.forEach((line, li) => {
      line.sections.forEach((sec, si) => {
        if (sec && (sec.schematicVia !== undefined || sec.schematicBend !== undefined)) {
          tx.merge(['lines', li, 'sections', si], { schematicVia: undefined, schematicBend: undefined });
        }
      });
    });
    tx.state.stations.forEach((st, i) => {
      const lb = st.label && st.label.schematic;
      if (!positions[st.id] || !lb) return;
      if (lb.pos !== 'auto' || lb.dx !== undefined || lb.dy !== undefined) {
        tx.merge(['stations', i, 'label', 'schematic'], { pos: 'auto', dx: undefined, dy: undefined });
      }
    });
  },

  /** { ids } → 一緒に消えた系統の数 */
  'station/delete'(tx, { ids }) {
    return deleteStationsFrom(tx, ids);
  },

  /** 駅を複製して (dx, dy) ずらした位置に置く { ids, dx, dy } → 新しい ID の配列 */
  'station/duplicate'(tx, { ids, dx = 1, dy = 1 }, ctx) {
    const out = [];
    for (const id of ids) {
      const st = tx.find('stations', id);
      const schematic = st.schematic ? { x: st.schematic.x + dx, y: st.schematic.y + dy } : null;
      // 地理の位置も、路線図でずらした分だけ近くにずらす（同じ位置に重ならないように）
      const geo = st.geo && schematic && tx.state.world.mode === 'fictional' ? estimateGeo(tx.state.stations, schematic, st.geo) : st.geo;
      const copy = { ...st, id: ctx.newId(ID_PREFIX.station), schematic, geo };
      tx.push(['stations'], copy);
      out.push(copy.id);
    }
    return out;
  },
};
