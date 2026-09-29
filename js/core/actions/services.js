// 運行系統のアクションと、駅・路線を消したときの系統の後始末
import { ID_PREFIX } from '../schema.js';
import { createService } from '../defaults.js';
import { expandSegment, expandService, loopClockwise, assignTypes, stopFlags, stopIds } from '../services.js';

/** @typedef {import('../patch.js').Tx} Tx */
/** @typedef {import('./context.js').ActionContext} Ctx */
/** @typedef {import('../schema.js').Service} Service */
/** @typedef {import('../schema.js').Project} Project */

/**
 * 停車駅を自動で決める系統なら、いまの経路と種別から停車駅を入れ直す（データの見本として持つ）
 * @param {Project} p
 * @param {Service} sv
 * @returns {Service}
 */
function withAutoStops(p, sv) {
  if (!sv.stopsAuto) return sv;
  const path = expandService(p, sv);
  return { ...sv, stops: stopIds(path, stopFlags(p, sv, path)) };
}

/**
 * 系統を置き換える（ID から位置を探す）
 * @param {Tx} tx
 * @param {string} serviceId
 * @param {(sv: Service) => Service} fn
 */
function updateService(tx, serviceId, fn) {
  const i = tx.indexOf('services', serviceId);
  if (i < 0) return;
  tx.set(['services', i], withAutoStops(tx.state, fn(tx.state.services[i])));
}

/**
 * 路線から駅が外れる（消える）とき、その駅を端にしている区間を、同じ路線の隣の駅まで縮める。
 * 縮められない区間は外し、区間が無くなった系統は消す。路線を書き換える前に呼ぶ。
 * @param {Tx} tx
 * @param {Map<string, Set<string>>} removedByLine 路線 ID → 外れる駅の ID
 * @returns {number} 消した系統の数
 */
export function shrinkServices(tx, removedByLine) {
  const p = tx.state;
  const lineById = new Map(p.lines.map((l) => [l.id, l]));
  const drop = [];
  p.services.forEach((sv, i) => {
    let changed = false;
    const segments = [];
    for (const seg of sv.segments) {
      const removed = removedByLine.get(seg.lineId);
      if (!removed || (!removed.has(seg.from) && !removed.has(seg.to))) {
        segments.push(seg);
        continue;
      }
      changed = true;
      const line = lineById.get(seg.lineId);
      const ex = line && expandSegment(line, seg, line.isLoop ? loopClockwise(p, line) : true);
      if (!ex) continue;
      const rest = ex.idx.map((k) => line.stops[k].stationId).filter((id) => !removed.has(id));
      if (!rest.length) continue;
      const loop = seg.from === seg.to;
      const from = rest[0];
      const to = loop ? from : rest[rest.length - 1];
      if (!loop && from === to) continue;
      segments.push({ ...seg, from, to });
    }
    if (!changed) return;
    if (!segments.length) drop.push(i);
    else tx.set(['services', i, 'segments'], segments);
  });
  for (const i of drop.reverse()) tx.remove(['services'], i);
  return drop.length;
}

/**
 * 路線を消すとき、その路線を通る区間を外す。区間が無くなった系統は消す
 * @param {Tx} tx
 * @param {string} lineId
 * @returns {number} 消した系統の数
 */
export function dropLineFromServices(tx, lineId) {
  const drop = [];
  tx.state.services.forEach((sv, i) => {
    if (!sv.segments.some((seg) => seg.lineId === lineId)) return;
    const segments = sv.segments.filter((seg) => seg.lineId !== lineId);
    if (!segments.length) drop.push(i);
    else tx.set(['services', i, 'segments'], segments);
  });
  for (const i of drop.reverse()) tx.remove(['services'], i);
  return drop.length;
}

/**
 * 路線を2本に分けたとき、2本目だけを通る区間の路線を付け替える
 * @param {Tx} tx
 * @param {string} oldLineId
 * @param {string} newLineId
 * @param {Set<string>} secondStations 2本目の路線の駅
 * @param {Set<string>} firstStations 1本目に残った駅
 */
export function moveSegmentsToLine(tx, oldLineId, newLineId, secondStations, firstStations) {
  tx.state.services.forEach((sv, i) => {
    sv.segments.forEach((seg, j) => {
      if (seg.lineId !== oldLineId) return;
      const inSecond = secondStations.has(seg.from) && secondStations.has(seg.to);
      const inFirst = firstStations.has(seg.from) && firstStations.has(seg.to);
      if (inSecond && !inFirst) tx.set(['services', i, 'segments', j, 'lineId'], newLineId);
    });
  });
}

/** @type {Record<string, (tx: Tx, a: any, ctx: Ctx) => any>} */
export const serviceReducers = {
  /**
   * 系統を足す { route, typeId, fields? } → ID。
   * route は経路の区間（種別なし）。区間の種別は typeId をもとに、路線の事業者の種別から決める
   */
  'service/add'(tx, { route, typeId, fields = {} }, ctx) {
    const sv = createService({
      id: ctx.newId(ID_PREFIX.service),
      ...fields,
      segments: assignTypes(tx.state, route, typeId),
    });
    tx.push(['services'], withAutoStops(tx.state, sv));
    return sv.id;
  },

  /** 経路を組み直す { serviceId, route }。同じ路線を通る区間は種別を引き継ぐ */
  'service/setRoute'(tx, { serviceId, route }) {
    updateService(tx, serviceId, (sv) => {
      const base = sv.segments[0] ? sv.segments[0].typeId : '';
      return { ...sv, segments: assignTypes(tx.state, route, base, sv.segments) };
    });
  },

  /** 区間の種別を変える { serviceId, index, typeId } */
  'service/segmentType'(tx, { serviceId, index, typeId }) {
    updateService(tx, serviceId, (sv) => ({
      ...sv,
      segments: sv.segments.map((seg, i) => (i === index ? { ...seg, typeId } : seg)),
    }));
  },

  /** 系統の項目（愛称・本数・両数・両方向・色・メモ） { serviceId, fields }（undefined のキーは消す） */
  'service/update'(tx, { serviceId, fields }) {
    updateService(tx, serviceId, (sv) => {
      const next = { ...sv, ...fields };
      for (const [k, v] of Object.entries(fields)) if (v === undefined) delete next[k];
      return next;
    });
  },

  /**
   * 停車駅を手で変える { serviceId, stationId, stop }。
   * 自動で決めていたときは、いまの停車駅を写してから手で決める状態にする
   */
  'service/setStop'(tx, { serviceId, stationId, stop }) {
    updateService(tx, serviceId, (sv) => {
      const path = expandService(tx.state, sv);
      const cur = stopIds(path, stopFlags(tx.state, sv, path));
      const set = new Set(cur);
      if (stop) set.add(stationId);
      else set.delete(stationId);
      // 経路の順に並べる
      const stops = [...new Set(path.stations)].filter((id) => set.has(id));
      return { ...sv, stopsAuto: false, stops };
    });
  },

  /** 停車駅を種別のルールで決める状態に戻す { serviceId } */
  'service/autoStops'(tx, { serviceId }) {
    updateService(tx, serviceId, (sv) => ({ ...sv, stopsAuto: true }));
  },

  /** 系統を複製する { serviceId } → 新しい ID */
  'service/duplicate'(tx, { serviceId }, ctx) {
    const sv = tx.find('services', serviceId);
    const copy = { ...sv, id: ctx.newId(ID_PREFIX.service) };
    if (sv.name) copy.name = ctx.mapT('map.copySuffix', { name: sv.name });
    tx.push(['services'], copy);
    return copy.id;
  },

  /** { serviceId } */
  'service/delete'(tx, { serviceId }) {
    const i = tx.indexOf('services', serviceId);
    if (i < 0) return;
    tx.remove(['services'], i);
  },
};
