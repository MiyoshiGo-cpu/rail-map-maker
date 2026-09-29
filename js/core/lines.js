// 路線の駅の並びと駅間（sections）を扱う純粋な関数。どれも新しい Line を返す。
import { sectionCount } from './defaults.js';

/** @typedef {import('./schema.js').Line} Line */
/** @typedef {import('./schema.js').SectionOverride} SectionOverride */

export { sectionCount };

/** 形に関わる上書き（駅の並びが変わったら意味がなくなる） */
const GEOM_KEYS = ['schematicBend', 'schematicVia', 'geoVia'];

/** @param {SectionOverride} s */
export function stripGeom(s) {
  if (!s) return {};
  const out = { ...s };
  for (const k of GEOM_KEYS) delete out[k];
  return out;
}

/**
 * 向きを逆にしたときの上書き（曲がり位置を入れ替え、経由点を逆順に）
 * @param {SectionOverride} s
 */
export function flipGeom(s) {
  const out = { ...s };
  if (out.schematicBend === 'diagonalFirst') out.schematicBend = 'straightFirst';
  else if (out.schematicBend === 'straightFirst') out.schematicBend = 'diagonalFirst';
  if (out.schematicVia) out.schematicVia = [...out.schematicVia].reverse();
  if (out.geoVia) out.geoVia = [...out.geoVia].reverse();
  return out;
}

/** @param {Line} line */
export function stationIdsOf(line) {
  return line.stops.map((s) => s.stationId);
}

/**
 * 駅間 i の両端の駅の位置（stops の添字）
 * @param {Line} line
 * @param {number} i
 * @returns {[number, number]}
 */
export function sectionEnds(line, i) {
  return [i, (i + 1) % line.stops.length];
}

/**
 * 駅の並びを変えたあと、駅間の上書きを引き継ぐ。
 * 同じ2駅を結ぶ駅間はそのまま（逆向きなら形を反転）、新しくできた駅間は
 * 元の駅間の属性（形以外）を引き継ぐ。
 * @param {Line} oldLine
 * @param {import('./schema.js').LineStop[]} newStops
 * @param {boolean} newIsLoop
 * @returns {Line}
 */
export function withStops(oldLine, newStops, newIsLoop) {
  const oldIds = stationIdsOf(oldLine);
  const n = oldIds.length;
  const oc = sectionCount(oldLine);
  const pair = new Map();
  const leaving = new Map();
  const entering = new Map();
  for (let j = 0; j < oc; j++) {
    const a = oldIds[j];
    const b = oldIds[(j + 1) % n];
    const s = oldLine.sections[j] || {};
    pair.set(a + '>' + b, s);
    leaving.set(a, s);
    entering.set(b, s);
  }
  const m = newStops.length;
  const isLoop = newIsLoop && m >= 3;
  const count = isLoop ? m : Math.max(0, m - 1);
  const sections = [];
  for (let i = 0; i < count; i++) {
    const a = newStops[i].stationId;
    const b = newStops[(i + 1) % m].stationId;
    if (pair.has(a + '>' + b)) sections.push(pair.get(a + '>' + b));
    else if (pair.has(b + '>' + a)) sections.push(flipGeom(pair.get(b + '>' + a)));
    else sections.push(stripGeom(leaving.get(a) || entering.get(b) || {}));
  }
  const out = { ...oldLine, stops: newStops, isLoop, sections };
  // 一周の営業キロは環状線のときだけ意味がある
  if (!isLoop) delete out.loopKm;
  return out;
}

/**
 * 端に駅を足す
 * @param {Line} line
 * @param {string} stationId
 * @param {boolean} [atStart]
 * @param {Partial<import('./schema.js').LineStop>} [extra]
 */
export function appendStop(line, stationId, atStart = false, extra = {}) {
  const stop = { stationId, ...extra };
  const stops = atStart ? [stop, ...line.stops] : [...line.stops, stop];
  return withStops(line, stops, line.isLoop);
}

/**
 * 駅間 sectionIndex の間に駅を挿入する
 * @param {Line} line
 * @param {number} sectionIndex
 * @param {string} stationId
 * @param {Partial<import('./schema.js').LineStop>} [extra]
 */
export function insertStop(line, sectionIndex, stationId, extra = {}) {
  const stops = line.stops.slice();
  stops.splice(sectionIndex + 1, 0, { stationId, ...extra });
  return withStops(line, stops, line.isLoop);
}

/**
 * stops[index] を外す（前後の駅でつなぎ直す）
 * @param {Line} line
 * @param {number} index
 */
export function removeStop(line, index) {
  const stops = line.stops.slice();
  stops.splice(index, 1);
  return withStops(line, stops, line.isLoop);
}

/**
 * 駅の順番を入れ替える
 * @param {Line} line
 * @param {number} from
 * @param {number} to
 */
export function moveStop(line, from, to) {
  const stops = line.stops.slice();
  const [s] = stops.splice(from, 1);
  stops.splice(to, 0, s);
  return withStops(line, stops, line.isLoop);
}

/**
 * 環状線にする・やめる
 * @param {Line} line
 * @param {boolean} isLoop
 */
export function setLoop(line, isLoop) {
  return withStops(line, line.stops, isLoop);
}

/**
 * 駅間を消す。環状線なら、そこで切り開いた1本の路線にする。
 * 途中の駅間なら2本に分かれる（2本目は呼び出し側で新しい ID を付ける）。
 * 駅が1つだけになる側は、その駅を路線から外す。
 * @param {Line} line
 * @param {number} sectionIndex
 * @returns {{ first: Line | null, second: Line | null }}
 */
export function cutSection(line, sectionIndex) {
  if (line.isLoop) {
    const k = sectionIndex;
    const stops = [...line.stops.slice(k + 1), ...line.stops.slice(0, k + 1)];
    return { first: withStops(line, stops, false), second: null };
  }
  const a = line.stops.slice(0, sectionIndex + 1);
  const b = line.stops.slice(sectionIndex + 1);
  const first = a.length >= 2 ? withStops(line, a, false) : null;
  const second = b.length >= 2 ? withStops(line, b, false) : null;
  if (!first && !second) {
    // 2駅だけの路線の駅間を消した：駅のない路線として残す
    return { first: withStops(line, [], false), second: null };
  }
  if (!first) return { first: second, second: null };
  return { first, second };
}

/**
 * 駅間 i の上書き（キーが無い・null なら路線の既定値）を合わせた属性
 * @param {Line} line
 * @param {number} i
 * @returns {import('./schema.js').SectionAttrs}
 */
export function effectiveSectionAttrs(line, i) {
  const out = { ...line.defaults };
  const s = line.sections[i] || {};
  for (const k of Object.keys(out)) {
    if (s[k] !== undefined && s[k] !== null) out[k] = s[k];
  }
  for (const k of ['openedYear', 'closedYear']) {
    if (s[k] !== undefined && s[k] !== null) out[k] = s[k];
  }
  return out;
}
