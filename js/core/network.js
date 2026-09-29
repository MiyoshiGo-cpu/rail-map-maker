// 路線網（駅と、路線の駅間でできたグラフ）と、始発駅から終着駅までの経路の候補（系統の経路の自動作成。§7 フェーズ2）
// 経路は同じ駅（同じ Station.id）でしか路線をまたがない。乗換グループで結んだ別の駅は線路がつながっていない扱い（§6.5）。
import { sectionCount } from './defaults.js';
import { allLineKm } from './distance.js';
import { loopClockwise, loopDirOf } from './services.js';

/** @typedef {import('./schema.js').Project} Project */

/** 路線をまたぐたびに足す重み（km 相当）。乗り継ぎの少ない経路を選びやすくする */
const CHANGE_PENALTY_KM = 2;
/** 候補を探す回数の上限 */
const MAX_SEARCHES = 24;

/**
 * @typedef {object} Edge
 * @property {string} to
 * @property {string} lineId
 * @property {number} section
 * @property {boolean} forward stops の順に進むか
 * @property {number} km
 */

/**
 * @typedef {object} RouteCandidate
 * @property {{ lineId: string, from: string, to: string, loopDir?: 'cw'|'ccw' }[]} segments
 * @property {number} km 営業キロの合計
 * @property {string[]} lineIds 通る路線（順番に）
 */

/**
 * 駅 ID → 出ていく駅間の一覧（廃止の路線は使わない）
 * @param {Project} p
 * @returns {Map<string, Edge[]>}
 */
export function buildNetwork(p) {
  const kms = allLineKm(p);
  /** @type {Map<string, Edge[]>} */
  const adj = new Map();
  const add = (id, e) => {
    if (!adj.has(id)) adj.set(id, []);
    adj.get(id).push(e);
  };
  for (const line of p.lines) {
    if (line.status === 'abolished') continue;
    const n = line.stops.length;
    const lk = kms.get(line.id);
    for (let i = 0; i < sectionCount(line); i++) {
      const a = line.stops[i].stationId;
      const b = line.stops[(i + 1) % n].stationId;
      const km = lk.sections[i].km;
      add(a, { to: b, lineId: line.id, section: i, forward: true, km });
      add(b, { to: a, lineId: line.id, section: i, forward: false, km });
    }
  }
  return adj;
}

/** 小さな二分ヒープ（コストの小さい順） */
function heap() {
  const a = [];
  return {
    get size() { return a.length; },
    push(x) {
      a.push(x);
      let i = a.length - 1;
      while (i > 0) {
        const j = (i - 1) >> 1;
        if (a[j].cost <= a[i].cost) break;
        [a[i], a[j]] = [a[j], a[i]];
        i = j;
      }
    },
    pop() {
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < a.length && a[l].cost < a[m].cost) m = l;
          if (r < a.length && a[r].cost < a[m].cost) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]];
          i = m;
        }
      }
      return top;
    },
  };
}

/**
 * いちばん短い経路（駅間の列）。via の路線をすべて通り、banned の路線は使わない
 * @param {Map<string, Edge[]>} adj
 * @param {string} from
 * @param {string} to
 * @param {string[]} via
 * @param {Set<string>} banned
 * @returns {Edge[] | null}
 */
function shortest(adj, from, to, via, banned) {
  const full = (1 << via.length) - 1;
  const key = (st, line, fwd, mask) => `${st}|${line}|${fwd ? 1 : 0}|${mask}`;
  const dist = new Map();
  const prev = new Map();
  const q = heap();
  const startKey = key(from, '', true, 0);
  dist.set(startKey, 0);
  q.push({ cost: 0, st: from, line: '', fwd: true, mask: 0, k: startKey });
  while (q.size) {
    const cur = q.pop();
    if (cur.cost > dist.get(cur.k)) continue;
    if (cur.st === to && cur.mask === full && cur.line) {
      const edges = [];
      for (let k = cur.k; prev.has(k); k = prev.get(k).k) edges.unshift(prev.get(k).e);
      return edges;
    }
    for (const e of adj.get(cur.st) || []) {
      if (banned.has(e.lineId)) continue;
      // 同じ路線で向きを変える（折り返す）ことはしない
      if (e.lineId === cur.line && e.forward !== cur.fwd) continue;
      const v = via.indexOf(e.lineId);
      const mask = v >= 0 ? cur.mask | (1 << v) : cur.mask;
      const cost = cur.cost + e.km + (cur.line && e.lineId !== cur.line ? CHANGE_PENALTY_KM : 0);
      const k = key(e.to, e.lineId, e.forward, mask);
      if (cost < (dist.has(k) ? dist.get(k) : Infinity)) {
        dist.set(k, cost);
        prev.set(k, { k: cur.k, e });
        q.push({ cost, st: e.to, line: e.lineId, fwd: e.forward, mask, k });
      }
    }
  }
  return null;
}

/**
 * 駅間の列を、同じ路線・同じ向きのまとまり（区間）にする
 * @param {Project} p
 * @param {string} from
 * @param {Edge[]} edges
 * @returns {RouteCandidate}
 */
function toCandidate(p, from, edges) {
  const lineById = new Map(p.lines.map((l) => [l.id, l]));
  const segments = [];
  let km = 0;
  let at = from;
  for (const e of edges) {
    km += e.km;
    const last = segments[segments.length - 1];
    if (last && last.lineId === e.lineId && last.forward === e.forward) {
      last.to = e.to;
    } else {
      segments.push({ lineId: e.lineId, from: at, to: e.to, forward: e.forward });
    }
    at = e.to;
  }
  return {
    segments: segments.map((s) => {
      const line = lineById.get(s.lineId);
      const out = { lineId: s.lineId, from: s.from, to: s.to };
      if (line.isLoop) out.loopDir = loopDirOf(s.forward, loopClockwise(p, line));
      return out;
    }),
    km,
    lineIds: segments.map((s) => s.lineId),
  };
}

/** 同じ駅を2回通るか（始発に戻る一周は除く） */
function revisits(from, edges) {
  const seen = new Set([from]);
  for (let i = 0; i < edges.length; i++) {
    const id = edges[i].to;
    if (seen.has(id) && !(i === edges.length - 1 && id === from)) return true;
    seen.add(id);
  }
  return false;
}

/**
 * 始発駅から終着駅までの経路の候補（短い順。通る路線の並びが違うものを最大 max 件）。
 * via の路線をすべて通るものだけを探す。始発と終着が同じなら、その駅を通る環状線を一周する。
 * @param {Project} p
 * @param {string} from
 * @param {string} to
 * @param {{ via?: string[], max?: number }} [opt]
 * @returns {RouteCandidate[]}
 */
export function findRoutes(p, from, to, opt = {}) {
  const via = [...new Set(opt.via || [])];
  const max = opt.max || 5;
  if (from === to) return loopRoutes(p, from, via);
  const adj = buildNetwork(p);
  /** @type {Map<string, { c: RouteCandidate, edges: any[] }>} */
  const found = new Map();
  const tried = new Set();
  const queue = [new Set()];
  let searches = 0;
  while (queue.length && searches < MAX_SEARCHES && found.size < max * 2) {
    const banned = queue.shift();
    const bk = [...banned].sort().join(',');
    if (tried.has(bk)) continue;
    tried.add(bk);
    searches++;
    const edges = shortest(adj, from, to, via, banned);
    if (!edges || revisits(from, edges)) continue;
    const c = toCandidate(p, from, edges);
    const sig = c.segments.map((s) => `${s.lineId}:${s.from}>${s.to}`).join('|');
    if (!found.has(sig)) found.set(sig, { c, edges });
    // 使った路線を1本ずつ使わないことにして、別の経路を探す（経由に指定した路線は外さない）
    for (const lineId of new Set(c.lineIds)) {
      if (via.includes(lineId)) continue;
      queue.push(new Set([...banned, lineId]));
    }
  }
  return [...found.values()]
    .map((x) => x.c)
    .sort((a, b) => a.km + a.lineIds.length * CHANGE_PENALTY_KM - (b.km + b.lineIds.length * CHANGE_PENALTY_KM))
    .slice(0, max);
}

/**
 * 始発と終着が同じ：その駅を通る環状線を、両方の向きに一周する
 * @param {Project} p
 * @param {string} stationId
 * @param {string[]} via
 */
function loopRoutes(p, stationId, via) {
  const kms = allLineKm(p);
  const out = [];
  for (const line of p.lines) {
    if (!line.isLoop || line.status === 'abolished' || !line.stops.some((s) => s.stationId === stationId)) continue;
    if (via.some((id) => id !== line.id)) continue;
    for (const loopDir of /** @type {const} */ (['cw', 'ccw'])) {
      out.push({ segments: [{ lineId: line.id, from: stationId, to: stationId, loopDir }], km: kms.get(line.id).total, lineIds: [line.id] });
    }
  }
  return out;
}
