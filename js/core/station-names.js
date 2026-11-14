// 駅名の候補（§6.8）。DOM に依存しない。
// 駅の地理の位置と、近くの都市（広さは人口から見積もる）から候補を作る：
// ・都市の中なら都市名、中心の近くなら「〇〇中央」「市役所前」（市と大都市）、「〇〇公園前」など
// ・中心から離れていれば「東〇〇」のように方角を付けた名前、もっと離れていれば「〇〇口」
// ・新幹線の駅が中心から離れていれば「新〇〇」
// ・駅の場所の地形に合った地名（地名の作り方は地域パックの placeNames）
// 名前の形（方角の語・「新」「口」「前」など）は地域パックの stationNames に置く。ほかの駅と同じ名前は出さない。
import { createPlaceNamer } from './placenames.js';
import { createRng } from './rng.js';

/** @typedef {import('./schema.js').Project} Project */
/** @typedef {import('./schema.js').RegionPack} RegionPack */
/**
 * 駅名の候補
 * @typedef {object} NameCandidate
 * @property {string} name
 * @property {string} reading
 * @property {'city'|'center'|'cityHall'|'landmark'|'shin'|'direction'|'guchi'|'place'} kind
 */

/** 候補の数の上限 */
const MAX_CANDIDATES = 8;
/** 都市名を使う範囲（都市の広さに対する割合） */
const NEAR_LIMIT = 2.5;

/**
 * 都市の広さの目安（中心から市街地の端までの km）：人口が多いほど広い
 * @param {number} population
 */
export function cityRadiusKm(population) {
  return Math.min(12, 1 + Math.sqrt(Math.max(0, population)) / 250);
}

/** {c}・{d}・{l} を置き換える */
const fill = (tpl, vars) => tpl.replace(/\{(\w)\}/g, (_, k) => vars[k] ?? '');

/** 文字列から決まった数を作る（施設の選び方を駅ごとに変えるため） */
function hashOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * 駅名の候補
 * @param {Project} p
 * @param {string} stationId
 * @param {RegionPack} region
 * @param {{ terrainAt?: (pos: { x: number, y: number }) => import('./placenames.js').PlaceTerrain, max?: number }} [opt]
 *   terrainAt があれば、駅の場所の地形に合った地名も出す
 * @returns {NameCandidate[]}
 */
export function suggestStationNames(p, stationId, region, opt = {}) {
  const st = p.stations.find((s) => s.id === stationId);
  const rules = region.stationNames;
  if (!st || !st.geo || !('x' in st.geo) || p.world.mode !== 'fictional' || !rules) return [];
  const world = p.world;
  const g = st.geo;
  // ほかの駅が使っている名前は出さない
  const taken = new Set(p.stations.filter((s) => s.id !== stationId).map((s) => s.name));
  /** @type {NameCandidate[]} */
  const out = [];
  const seen = new Set();
  const add = (name, reading, kind) => {
    if (!name || seen.has(name) || taken.has(name)) return;
    seen.add(name);
    out.push({ name, reading, kind });
  };
  const f = rules.forms;
  const form = (key, vars, rvars, kind) => add(fill(f[key].k, vars), fill(f[key].r, rvars), kind);

  // 近い都市（広さで割った距離の近い順に2つまで）
  const near = world.cities
    .map((c) => {
      const dx = g.x - c.pos.x;
      const dy = g.y - c.pos.y;
      const d = Math.hypot(dx, dy);
      return { c, d, dx, dy, k: d / cityRadiusKm(c.population) };
    })
    .filter((x) => x.k <= NEAR_LIMIT)
    .sort((a, b) => a.k - b.k || (a.c.id < b.c.id ? -1 : 1))
    .slice(0, 2);
  const shinkansen = p.lines.some((l) => l.kind === 'shinkansen' && l.stops.some((s) => s.stationId === stationId));
  const landmark = rules.landmarks.length ? rules.landmarks[hashOf(stationId) % rules.landmarks.length] : null;

  for (const { c, d, dx, dy, k } of near) {
    const cv = { c: c.name };
    const cr = { c: c.reading || '' };
    if (k <= 1) add(c.name, c.reading || '', 'city');
    // 新幹線の駅が中心から離れているとき
    if (shinkansen && d >= 1) form('shin', cv, cr, 'shin');
    // 中心の近く
    if (k <= 0.3) {
      form('center', cv, cr, 'center');
      if (c.kind === 'city' || c.kind === 'metropolis') form('cityHall', cv, cr, 'cityHall');
    }
    if (k <= 1 && landmark) form('landmark', { ...cv, l: landmark.k }, { ...cr, l: landmark.r }, 'landmark');
    // 中心から離れていれば方角を付ける（東西と南北の、ずれの大きい方。y は下向き＝南）
    if (k >= 0.35) {
      const dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'E' : 'W') : (dy >= 0 ? 'S' : 'N');
      const w = rules.directions[dir];
      form('direction', { ...cv, d: w.k }, { ...cr, d: w.r }, 'direction');
    }
    if (k >= 0.5) form('guchi', cv, cr, 'guchi');
  }

  // 駅の場所の地形に合った地名（都市名とも重ならないように）
  if (opt.terrainAt) {
    const rng = createRng(`${world.seed}:station:${stationId}`);
    const namer = createPlaceNamer(rng, region.placeNames, [...taken, ...world.cities.map((c) => c.name)]);
    const terrain = opt.terrainAt(g);
    for (let i = 0; i < 2; i++) {
      const n = namer.name(terrain);
      add(n.name, n.reading, 'place');
    }
  }
  return out.slice(0, opt.max ?? MAX_CANDIDATES);
}
