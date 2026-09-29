// 運行系統（§3 Service）の経路の展開、停車駅の自動決定、区間の種別の既定、直通運転の判定
import { sectionCount } from './defaults.js';

/** @typedef {import('./schema.js').Project} Project */
/** @typedef {import('./schema.js').Line} Line */
/** @typedef {import('./schema.js').Service} Service */
/** @typedef {import('./schema.js').ServiceSegment} ServiceSegment */
/** @typedef {import('./schema.js').ServiceType} ServiceType */

/** 旅客列車が止まらない駅のランク（信号場・貨物駅・車両基地） */
const NON_PASSENGER_RANKS = new Set(['signal', 'freight', 'depot']);

/**
 * 環状線の駅の並び（起点 → 終点）が、路線図の上で時計回りか。位置がわからなければ時計回りとみなす
 * @param {Project} p
 * @param {Line} line
 */
export function loopClockwise(p, line) {
  const pos = new Map(p.stations.map((s) => [s.id, s.schematic]));
  const pts = line.stops.map((s) => pos.get(s.stationId)).filter(Boolean);
  if (pts.length < 3) return true;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  // 画面の座標は y が下向きなので、和が正なら見た目は時計回り
  return sum >= 0;
}

/**
 * 路線の上での向き（stops の順に進むなら true）から loopDir を決める
 * @param {boolean} forward
 * @param {boolean} clockwise loopClockwise の結果
 * @returns {'cw'|'ccw'}
 */
export function loopDirOf(forward, clockwise) {
  return forward === clockwise ? 'cw' : 'ccw';
}

/**
 * 区間を路線の駅の並びに展開する。駅の位置（stops の添字）の列を返す。
 * 環状線で from と to が同じなら一周する。
 * @param {Line} line
 * @param {ServiceSegment} seg
 * @param {boolean} clockwise 環状線の向き（loopClockwise）
 * @returns {{ idx: number[], sections: number[] } | null} idx は駅の位置、sections は通る駅間の番号
 */
export function expandSegment(line, seg, clockwise) {
  const n = line.stops.length;
  const i = line.stops.findIndex((s) => s.stationId === seg.from);
  const j = line.stops.findIndex((s) => s.stationId === seg.to);
  if (i < 0 || j < 0) return null;
  const idx = [i];
  const sections = [];
  if (line.isLoop && sectionCount(line) === n) {
    // loopDir が無ければ近い方へ
    const fwdHops = (j - i + n) % n || n;
    const forward = seg.loopDir ? (seg.loopDir === 'cw') === clockwise : fwdHops <= n - fwdHops;
    const hops = forward ? fwdHops : ((i - j + n) % n || n);
    let k = i;
    for (let h = 0; h < hops; h++) {
      const next = forward ? (k + 1) % n : (k - 1 + n) % n;
      sections.push(forward ? k : next);
      idx.push(next);
      k = next;
    }
    return { idx, sections };
  }
  if (i === j) return null;
  const step = j > i ? 1 : -1;
  for (let k = i; k !== j; k += step) {
    sections.push(step > 0 ? k : k - 1);
    idx.push(k + step);
  }
  return { idx, sections };
}

/**
 * @typedef {object} ServicePath
 * @property {boolean} ok 区間がすべて路線の上にあり、つながっている
 * @property {string[]} stations 経路の駅（つなぎ目の駅は1回だけ）
 * @property {({ lineId: string, section: number, seg: number } | null)[]} hops stations[k] から stations[k+1] への駅間（つながっていない所は null）
 * @property {{ start: number, end: number }[]} segs 区間ごとの stations の範囲（壊れた区間は start = end = -1）
 * @property {{ code: 'badSegment'|'gap', seg: number }[]} problems
 */

/**
 * 系統の経路を駅の列に展開する
 * @param {Project} p
 * @param {Service} sv
 * @param {Map<string, Line>} [lineById]
 * @returns {ServicePath}
 */
export function expandService(p, sv, lineById = new Map(p.lines.map((l) => [l.id, l]))) {
  /** @type {ServicePath} */
  const out = { ok: true, stations: [], hops: [], segs: [], problems: [] };
  sv.segments.forEach((seg, s) => {
    const line = lineById.get(seg.lineId);
    const ex = line && expandSegment(line, seg, line.isLoop ? loopClockwise(p, line) : true);
    if (!ex) {
      out.ok = false;
      out.problems.push({ code: 'badSegment', seg: s });
      out.segs.push({ start: -1, end: -1 });
      return;
    }
    const ids = ex.idx.map((k) => line.stops[k].stationId);
    const last = out.stations[out.stations.length - 1];
    let start;
    if (out.stations.length && last === ids[0]) {
      start = out.stations.length - 1;
    } else {
      if (out.stations.length) {
        out.ok = false;
        out.problems.push({ code: 'gap', seg: s });
      }
      start = out.stations.length;
      out.stations.push(ids[0]);
    }
    for (let k = 1; k < ids.length; k++) {
      // つながっていないところ（gap）の前後には駅間が無い
      if (out.hops.length < out.stations.length - 1) out.hops.push(null);
      out.hops.push({ lineId: line.id, section: ex.sections[k - 1], seg: s });
      out.stations.push(ids[k]);
    }
    out.segs.push({ start, end: out.stations.length - 1 });
  });
  if (!sv.segments.length) out.ok = false;
  return out;
}

/**
 * 経路の駅の位置 k の区間（つなぎ目の駅は出ていく側の区間）
 * @param {ServicePath} path
 * @param {number} k
 */
export function segmentAt(path, k) {
  let found = -1;
  path.segs.forEach((r, s) => {
    if (r.start < 0) return;
    if (k >= r.start && k < r.end) found = s;
    else if (k === r.end && found < 0) found = s;
  });
  return found;
}

/**
 * 乗換駅か（ほかの路線も止まる駅、または乗換グループの駅）
 * @param {Project} p
 */
export function interchangeStations(p) {
  const count = new Map();
  for (const l of p.lines) {
    if (l.status === 'abolished') continue;
    for (const id of new Set(l.stops.map((s) => s.stationId))) count.set(id, (count.get(id) || 0) + 1);
  }
  const out = new Set([...count].filter(([, n]) => n >= 2).map(([id]) => id));
  for (const ic of p.interchanges) for (const id of ic.stationIds) out.add(id);
  return out;
}

/**
 * 種別の停車ルールで止まるか
 * @param {ServiceType | undefined} type
 * @param {import('./schema.js').Station | undefined} st
 * @param {boolean} isInterchange
 */
export function ruleStops(type, st, isInterchange) {
  if (!st || NON_PASSENGER_RANKS.has(st.rank)) return false;
  const rule = type ? type.stopRule : { base: 'all', interchanges: false };
  if (rule.interchanges && isInterchange) return true;
  switch (rule.base) {
    case 'majorAndAbove': return st.rank === 'terminal' || st.rank === 'major';
    case 'terminalOnly': return st.rank === 'terminal';
    default: return true; // all と manual（初めは全駅）
  }
}

/**
 * 種別のルールから決めた停車駅（経路の位置ごとに true/false）。
 * 始発・終着、事業者か種別が変わるつなぎ目の駅は停車にする。
 * @param {Project} p
 * @param {Service} sv
 * @param {ServicePath} path
 * @returns {boolean[]}
 */
export function autoStopFlags(p, sv, path) {
  const stById = new Map(p.stations.map((s) => [s.id, s]));
  const typeById = new Map(p.serviceTypes.map((x) => [x.id, x]));
  const lineById = new Map(p.lines.map((l) => [l.id, l]));
  const ic = interchangeStations(p);
  const last = path.stations.length - 1;
  return path.stations.map((id, k) => {
    if (k === 0 || k === last) return true;
    const s = segmentAt(path, k);
    const seg = sv.segments[s];
    // つなぎ目：直前の区間と事業者か種別が変わるなら停車
    const prevHop = path.hops[k - 1];
    if (prevHop && prevHop.seg !== s) {
      const prevSeg = sv.segments[prevHop.seg];
      const opA = lineById.get(prevSeg.lineId)?.operatorId;
      const opB = lineById.get(seg.lineId)?.operatorId;
      if (opA !== opB || prevSeg.typeId !== seg.typeId) return true;
    }
    return ruleStops(typeById.get(seg && seg.typeId), stById.get(id), ic.has(id));
  });
}

/**
 * 実際の停車駅（経路の位置ごと）。自動のときは種別のルール、手で決めたときは stops。始発・終着はいつも停車
 * @param {Project} p
 * @param {Service} sv
 * @param {ServicePath} [path]
 * @returns {boolean[]}
 */
export function stopFlags(p, sv, path = expandService(p, sv)) {
  if (sv.stopsAuto) return autoStopFlags(p, sv, path);
  const set = new Set(sv.stops);
  const last = path.stations.length - 1;
  return path.stations.map((id, k) => k === 0 || k === last || set.has(id));
}

/**
 * 停車駅の ID の列（経路の順。同じ駅は1回だけ）
 * @param {ServicePath} path
 * @param {boolean[]} flags
 */
export function stopIds(path, flags) {
  const out = [];
  path.stations.forEach((id, k) => {
    if (flags[k] && !out.includes(id)) out.push(id);
  });
  return out;
}

/**
 * 区間の種別の既定：その路線の事業者の種別から、基準の種別と同じ名前か、rank が近いもの（基準以下で最大）を選ぶ。
 * 事業者に種別が無ければ基準の種別のまま
 * @param {Project} p
 * @param {string} lineId
 * @param {string} baseTypeId
 */
export function defaultTypeFor(p, lineId, baseTypeId) {
  const base = p.serviceTypes.find((x) => x.id === baseTypeId);
  const line = p.lines.find((l) => l.id === lineId);
  if (!base || !line || line.operatorId === base.operatorId) return baseTypeId;
  const mine = p.serviceTypes.filter((x) => x.operatorId === line.operatorId);
  if (!mine.length) return baseTypeId;
  const same = mine.find((x) => x.name === base.name);
  if (same) return same.id;
  const below = mine.filter((x) => x.rank <= base.rank).sort((a, b) => b.rank - a.rank);
  if (below.length) return below[0].id;
  return [...mine].sort((a, b) => a.rank - b.rank)[0].id;
}

/**
 * 経路（種別なしの区間の列）に種別を付ける。前の区間の種別を引き継げる路線はそれを使う
 * @param {Project} p
 * @param {Omit<ServiceSegment, 'typeId'>[]} route
 * @param {string} baseTypeId 基準の種別（ほかの事業者の路線では、その事業者の近い種別にする）
 * @param {ServiceSegment[]} [previous] 経路を組み直す前の区間（同じ路線なら種別を引き継ぐ）
 * @returns {ServiceSegment[]}
 */
export function assignTypes(p, route, baseTypeId, previous = []) {
  return route.map((seg, i) => {
    const old = previous.find((x) => x.lineId === seg.lineId);
    const typeId = old ? old.typeId : defaultTypeFor(p, seg.lineId, baseTypeId);
    const out = { lineId: seg.lineId, from: seg.from, to: seg.to, typeId };
    if (seg.loopDir) out.loopDir = seg.loopDir;
    return out;
  });
}

/**
 * 直通運転のつなぎ目（事業者が変わるところ）
 * @param {Project} p
 * @param {Service} sv
 * @returns {{ seg: number, stationId: string, from: string, to: string }[]} from・to は事業者の ID
 */
export function throughJoints(p, sv) {
  const lineById = new Map(p.lines.map((l) => [l.id, l]));
  const out = [];
  for (let s = 1; s < sv.segments.length; s++) {
    const a = lineById.get(sv.segments[s - 1].lineId);
    const b = lineById.get(sv.segments[s].lineId);
    if (a && b && a.operatorId !== b.operatorId) out.push({ seg: s, stationId: sv.segments[s].from, from: a.operatorId, to: b.operatorId });
  }
  return out;
}

/**
 * 系統の表示名（愛称、なければ「種別 始発→終着」）に使う部品
 * @param {Project} p
 * @param {Service} sv
 */
export function serviceEnds(p, sv) {
  const first = sv.segments[0];
  const last = sv.segments[sv.segments.length - 1];
  const name = (id) => p.stations.find((s) => s.id === id)?.name || '';
  return {
    type: first ? p.serviceTypes.find((x) => x.id === first.typeId) : undefined,
    from: first ? name(first.from) : '',
    to: last ? name(last.to) : '',
  };
}
