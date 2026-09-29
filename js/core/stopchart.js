// 停車駅案内図（§5.5）の中身：対象の駅の並び（列）と、停車駅が同じ系統をまとめた行。DOM に依存しない
import { expandService, stopFlags, segmentAt } from './services.js';
import { serviceRuntime } from './runtime.js';
import { allLineKm } from './distance.js';

/** @typedef {import('./schema.js').Project} Project */
/** @typedef {import('./schema.js').Service} Service */

/**
 * @typedef {object} ChartTarget
 * @property {string} id 'line:<路線ID>' か 'chain:<路線IDを|でつないだもの>'
 * @property {'line'|'chain'} kind
 * @property {string[]} lineIds 通る順
 * @property {string} [serviceId] 直通の並びの手本にする系統
 */

/**
 * @typedef {object} ChartCell
 * @property {boolean} stop
 * @property {string} typeId
 */

/**
 * @typedef {object} ChartExit 行が案内図の外（ほかの路線）へ続くところ
 * @property {number} col 出ていく列
 * @property {'before'|'after'} side 列の小さい側・大きい側
 * @property {string} lineId 続く先の路線
 */

/**
 * @typedef {object} ChartRow
 * @property {string[]} serviceIds まとめた系統（先頭が手本）
 * @property {(ChartCell | null)[]} cells 列ごと（走らない列は null）
 * @property {number} start 最初に走る列
 * @property {number} end 最後に走る列
 * @property {ChartExit[]} exits
 * @property {number} rank 並べる順（種別の rank の最大）
 * @property {string[]} typeIds 通る順の種別（続けて同じものは1つ）
 * @property {boolean} named 同じ種別の行がほかにもある（系統名を添える）
 * @property {number | null} sec 手本の系統の、この行の範囲の所要時間（秒）
 */

/**
 * @typedef {object} StopChart
 * @property {ChartTarget} target
 * @property {{ stationId: string }[]} columns
 * @property {{ start: number, end: number, lineId: string, operatorId: string }[]} bands 路線ごとの列の範囲（隣どうしはつなぎ目の列を共有）
 * @property {ChartRow[]} rows
 */

/** 通る路線の並び（続けて同じ路線は1つ） */
function lineSeq(sv) {
  const out = [];
  for (const seg of sv.segments) if (out[out.length - 1] !== seg.lineId) out.push(seg.lineId);
  return out;
}

/**
 * 案内図にできるもの：路線1本ずつと、直通運転の系統が通る路線の並び
 * @param {Project} p
 * @returns {ChartTarget[]}
 */
export function chartTargets(p) {
  const out = [...p.lines]
    .filter((l) => l.stops.length >= 2)
    .sort((a, b) => a.order - b.order)
    .map((l) => ({ id: 'line:' + l.id, kind: /** @type {const} */ ('line'), lineIds: [l.id] }));
  /** @type {Map<string, { ids: string[], sv: Service, len: number }>} */
  const chains = new Map();
  for (const sv of p.services) {
    const seq = lineSeq(sv);
    if (seq.length < 2) continue;
    const path = expandService(p, sv);
    if (!path.ok) continue;
    // 向きが逆の並びは同じものとして扱う
    const fwd = seq.join('|');
    const rev = [...seq].reverse().join('|');
    const key = fwd < rev ? fwd : rev;
    const cur = chains.get(key);
    if (!cur || path.stations.length > cur.len) chains.set(key, { ids: seq, sv, len: path.stations.length });
  }
  for (const [key, c] of chains) out.push({ id: 'chain:' + key, kind: 'chain', lineIds: c.ids, serviceId: c.sv.id });
  return out;
}

/**
 * 路線の端まで伸ばす（環状線は伸ばさない）
 * @param {import('./schema.js').Line} line
 * @param {string} at 伸ばし始める駅
 * @param {string} toward その駅の、伸ばす向きと反対側の隣の駅
 * @returns {string[]} at の先の駅（近い順）
 */
function extendToEnd(line, at, toward) {
  if (line.isLoop) return [];
  const ids = line.stops.map((s) => s.stationId);
  const i = ids.indexOf(at);
  const j = ids.indexOf(toward);
  if (i < 0 || j < 0) return [];
  const step = i - j > 0 ? 1 : -1;
  const out = [];
  for (let k = i + step; k >= 0 && k < ids.length; k += step) out.push(ids[k]);
  return out;
}

/**
 * 対象の列（駅）と、列の間の路線
 * @param {Project} p
 * @param {ChartTarget} target
 * @returns {{ stations: string[], hopLines: string[] } | null}
 */
function columnsOf(p, target) {
  const lineById = new Map(p.lines.map((l) => [l.id, l]));
  if (target.kind === 'line') {
    const line = lineById.get(target.lineIds[0]);
    if (!line) return null;
    const stations = line.stops.map((s) => s.stationId);
    // 環状線は起点に戻るところまで
    if (line.isLoop && stations.length >= 3) stations.push(stations[0]);
    return { stations, hopLines: stations.slice(1).map(() => line.id) };
  }
  const sv = p.services.find((x) => x.id === target.serviceId);
  if (!sv) return null;
  const path = expandService(p, sv, lineById);
  if (!path.ok) return null;
  const stations = [...path.stations];
  const hopLines = path.hops.map((hp) => hp.lineId);
  // 最初と最後の路線は、端の駅まで伸ばす
  const firstLine = lineById.get(hopLines[0]);
  const before = extendToEnd(firstLine, stations[0], stations[1]);
  const lastLine = lineById.get(hopLines[hopLines.length - 1]);
  const after = extendToEnd(lastLine, stations[stations.length - 1], stations[stations.length - 2]);
  return {
    stations: [...[...before].reverse(), ...stations, ...after],
    hopLines: [...before.map(() => firstLine.id), ...hopLines, ...after.map(() => lastLine.id)],
  };
}

/**
 * 系統の経路が案内図の列に重なるところ（駅の並びが同じ向きか逆向きで続くところ）を、長い順に重ならないように取り出す
 * @param {string[]} path 系統の経路の駅
 * @param {string[]} cols 案内図の列の駅
 * @returns {{ p0: number, c0: number, len: number, dir: 1|-1 }[]} 経路の p0 から len 駅が、列の c0 から dir の向きに重なる
 */
function matchRuns(path, cols) {
  const runs = [];
  for (const dir of /** @type {const} */ ([1, -1])) {
    for (let i = 0; i < path.length; i++) {
      for (let c = 0; c < cols.length; c++) {
        if (path[i] !== cols[c]) continue;
        // 前の駅から続いているなら、そこが始まりではない
        if (i > 0 && c - dir >= 0 && c - dir < cols.length && path[i - 1] === cols[c - dir]) continue;
        let len = 1;
        while (i + len < path.length && c + dir * len >= 0 && c + dir * len < cols.length && path[i + len] === cols[c + dir * len]) len++;
        if (len >= 2) runs.push({ p0: i, c0: c, len, dir });
      }
    }
  }
  runs.sort((a, b) => b.len - a.len);
  const usedP = new Set();
  const usedC = new Set();
  const out = [];
  for (const r of runs) {
    let clash = false;
    for (let k = 0; k < r.len; k++) {
      // つなぎ目の1駅だけの重なりは許す（環状線の起点など）
      if ((k > 0 && k < r.len - 1) && (usedP.has(r.p0 + k) || usedC.has(r.c0 + r.dir * k))) clash = true;
    }
    if (clash) continue;
    for (let k = 1; k < r.len - 1; k++) {
      usedP.add(r.p0 + k);
      usedC.add(r.c0 + r.dir * k);
    }
    out.push(r);
  }
  return out;
}

/**
 * 2つの行を1つにできるか。重なる列の停車・種別（名前）が同じで、2列以上重なるか、種別の名前の並びが同じ。
 * 事業者ごとの「各駅停車」のように、名前が同じ種別は同じ行にまとめる
 * @param {ChartRow & { names: string[] }} a
 * @param {ChartRow & { names: string[] }} b
 * @param {(id: string) => string} nameOf
 */
function compatible(a, b, nameOf) {
  let overlap = 0;
  for (let c = 0; c < a.cells.length; c++) {
    const x = a.cells[c];
    const y = b.cells[c];
    if (!x || !y) continue;
    overlap++;
    if (x.stop !== y.stop || nameOf(x.typeId) !== nameOf(y.typeId)) return false;
  }
  if (overlap >= 2) return true;
  return a.names.join('|') === b.names.join('|');
}

/** 種別の名前の並び（続けて同じ名前は1つ） */
function namesOf(typeIds, nameOf) {
  const out = [];
  for (const id of typeIds) if (out[out.length - 1] !== nameOf(id)) out.push(nameOf(id));
  return out;
}

/**
 * 停車駅案内図の中身
 * @param {Project} p
 * @param {string} targetId
 * @returns {StopChart | null}
 */
export function buildStopChart(p, targetId) {
  const target = chartTargets(p).find((x) => x.id === targetId);
  if (!target) return null;
  const cols = columnsOf(p, target);
  if (!cols) return null;
  const lineById = new Map(p.lines.map((l) => [l.id, l]));
  const typeById = new Map(p.serviceTypes.map((x) => [x.id, x]));
  const kms = allLineKm(p);
  const n = cols.stations.length;
  const nameOf = (id) => typeById.get(id)?.name || '';

  // 路線ごとの範囲
  const bands = [];
  cols.hopLines.forEach((lineId, c) => {
    const last = bands[bands.length - 1];
    if (last && last.lineId === lineId) last.end = c + 1;
    else bands.push({ start: c, end: c + 1, lineId, operatorId: lineById.get(lineId)?.operatorId || '' });
  });

  // 系統ごとの行
  /** @type {ChartRow[]} */
  const rows = [];
  for (const sv of p.services) {
    const path = expandService(p, sv, lineById);
    if (!path.ok) continue;
    const runs = matchRuns(path.stations, cols.stations);
    if (!runs.length) continue;
    const flags = stopFlags(p, sv, path);
    /** @type {(ChartCell | null)[]} */
    const cells = new Array(n).fill(null);
    /** @type {ChartExit[]} */
    const exits = [];
    /** 列 → 経路の位置（所要時間に使う） */
    const posOf = new Map();
    for (const r of runs) {
      for (let k = 0; k < r.len; k++) {
        const pos = r.p0 + k;
        const c = r.c0 + r.dir * k;
        // 種別は、この重なりの中を走る駅間の区間のもの（端の駅で次の区間の種別にしない）
        const hop = path.hops[k < r.len - 1 ? pos : pos - 1];
        cells[c] = { stop: flags[pos], typeId: sv.segments[hop ? hop.seg : segmentAt(path, pos)].typeId };
        posOf.set(c, pos);
      }
      // 経路がこの重なりの外へ続くところ
      const ends = [
        { pos: r.p0, c: r.c0, next: r.p0 - 1, hop: r.p0 - 1, side: r.dir === 1 ? 'before' : 'after' },
        { pos: r.p0 + r.len - 1, c: r.c0 + r.dir * (r.len - 1), next: r.p0 + r.len, hop: r.p0 + r.len - 1, side: r.dir === 1 ? 'after' : 'before' },
      ];
      for (const e of ends) {
        if (e.next < 0 || e.next >= path.stations.length) continue;
        const hop = path.hops[e.hop];
        if (!hop) continue;
        exits.push({ col: e.c, side: /** @type {'before'|'after'} */ (e.side), lineId: hop.lineId });
      }
    }
    const covered = cells.map((x, c) => (x ? c : -1)).filter((c) => c >= 0);
    const typeIds = [];
    for (const c of covered) if (typeIds[typeIds.length - 1] !== cells[c].typeId) typeIds.push(cells[c].typeId);
    // 所要時間：この行の範囲の最初と最後の停車駅の間
    const rt = serviceRuntime(p, sv, { path, flags, kms });
    const stopCols = covered.filter((c) => cells[c].stop);
    const sec = rt && stopCols.length >= 2 ? Math.abs(rt.depart[posOf.get(stopCols[stopCols.length - 1])] - rt.depart[posOf.get(stopCols[0])]) : null;
    rows.push({
      serviceIds: [sv.id],
      cells,
      start: covered[0],
      end: covered[covered.length - 1],
      // 案内図の路線の中で続く（環状線を回り続けるなど）のは直通ではない
      exits: exits.filter((e) => !target.lineIds.includes(e.lineId)),
      rank: Math.max(...typeIds.map((id) => typeById.get(id)?.rank ?? 0)),
      typeIds,
      named: false,
      sec,
    });
  }

  // 停車駅が同じ系統を1行にまとめる（長いものから）
  rows.sort((a, b) => (b.end - b.start) - (a.end - a.start));
  /** @type {(ChartRow & { names: string[] })[]} */
  const merged = [];
  for (const r0 of rows) {
    const r = { ...r0, names: namesOf(r0.typeIds, nameOf) };
    const into = merged.find((m) => compatible(m, r, nameOf));
    if (!into) {
      merged.push(r);
      continue;
    }
    into.serviceIds.push(...r.serviceIds);
    r.cells.forEach((x, c) => { if (x && !into.cells[c]) into.cells[c] = x; });
    into.typeIds = [];
    for (let c = 0; c < n; c++) {
      const x = into.cells[c];
      if (x && into.typeIds[into.typeIds.length - 1] !== x.typeId) into.typeIds.push(x.typeId);
    }
    into.names = namesOf(into.typeIds, nameOf);
    into.rank = Math.max(into.rank, r.rank);
    into.start = Math.min(into.start, r.start);
    into.end = Math.max(into.end, r.end);
    for (const e of r.exits) {
      if (!into.exits.some((x) => x.col === e.col && x.side === e.side && x.lineId === e.lineId)) into.exits.push(e);
    }
  }
  // 遅い順（rank の小さい順）。同じ種別の行が2つ以上あれば系統名を添える
  merged.sort((a, b) => a.rank - b.rank || a.start - b.start);
  const headCount = new Map();
  for (const m of merged) headCount.set(m.names.join('|'), (headCount.get(m.names.join('|')) || 0) + 1);
  for (const m of merged) m.named = headCount.get(m.names.join('|')) > 1;

  return {
    target,
    columns: cols.stations.map((stationId) => ({ stationId })),
    bands,
    rows: merged.map(({ names, ...m }) => (void names, m)),
  };
}
