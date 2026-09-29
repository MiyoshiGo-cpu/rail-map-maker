// 営業キロ（§6.3）：手入力の値を最優先し、なければ地理座標から、それもなければ路線の種類ごとの既定の駅間で出す
import { getRegion } from './regions/index.js';
import { sectionCount } from './defaults.js';

/** @typedef {import('./schema.js').Project} Project */
/** @typedef {import('./schema.js').Line} Line */
/** @typedef {import('./schema.js').GeoPos} GeoPos */

/** 地球の半径（km。大円距離に使う） */
const EARTH_RADIUS_KM = 6371.0088;

/** 駅間が極端とみなす長さ（km。§6.6） */
export const SHORT_SECTION_KM = 0.3;
export const LONG_SECTION_KM = 50;

/**
 * 2点の距離（km）。架空の地形は平面の距離、実在は大円距離
 * @param {GeoPos} a
 * @param {GeoPos} b
 */
export function geoDistance(a, b) {
  if ('lat' in a && 'lat' in b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  if ('x' in a && 'x' in b) return Math.hypot(b.x - a.x, b.y - a.y);
  return NaN;
}

/**
 * @typedef {object} SectionKm
 * @property {number} km 駅間の長さ
 * @property {'manual'|'geo'|'estimate'} source manual＝手入力の値から、geo＝地理座標から、estimate＝既定の駅間（概算）
 */

/**
 * @typedef {object} LineKm
 * @property {number[]} stops 各駅の起点からの営業キロ
 * @property {SectionKm[]} sections 駅間ごと（環状なら最後の駅から起点に戻る区間を含む）
 * @property {number} total 全長（環状なら一周）
 * @property {boolean} approx 概算の駅間がある
 */

/**
 * 地理座標か既定の駅間から、駅間の長さの見込みを出す
 * @param {Project} p
 * @param {Line} line
 * @param {Map<string, import('./schema.js').Station>} byId
 */
function estimates(p, line, byId) {
  const region = getRegion(p.locale && p.locale.region);
  const kind = region.lineKindDefaults[line.kind] || region.lineKindDefaults[region.defaultLineKind];
  const n = line.stops.length;
  const out = [];
  for (let i = 0; i < sectionCount(line); i++) {
    const a = byId.get(line.stops[i].stationId);
    const b = byId.get(line.stops[(i + 1) % n].stationId);
    const via = (line.sections[i] && line.sections[i].geoVia) || [];
    let km = NaN;
    if (a && b && a.geo && b.geo) {
      const pts = [a.geo, ...via, b.geo];
      let d = 0;
      for (let j = 1; j < pts.length; j++) d += geoDistance(pts[j - 1], pts[j]);
      km = d * (via.length ? p.settings.viaCurveFactor : p.settings.curveFactor);
    }
    out.push(Number.isFinite(km) ? { km, source: 'geo' } : { km: kind.spacingKm, source: 'estimate' });
  }
  return out;
}

/**
 * 路線の営業キロ。手入力の駅（と環状線の一周 loopKm）を基準にし、
 * 基準の間は見込みの長さの比で配る。最後の基準より先は見込みの長さを足していく。
 * @param {Project} p
 * @param {Line} line
 * @param {Map<string, import('./schema.js').Station>} [byId]
 * @returns {LineKm}
 */
export function lineKm(p, line, byId = new Map(p.stations.map((s) => [s.id, s]))) {
  const n = line.stops.length;
  if (n === 0) return { stops: [], sections: [], total: 0, approx: false };
  const count = sectionCount(line);
  const est = estimates(p, line, byId);
  // 基準：添字 → 起点からの距離。環状線の一周は添字 n（起点にもう一度着く点）
  /** @type {Map<number, number>} */
  const anchors = new Map();
  line.stops.forEach((s, i) => {
    if (typeof s.km === 'number' && Number.isFinite(s.km)) anchors.set(i, s.km);
  });
  if (!anchors.has(0)) anchors.set(0, 0);
  if (line.isLoop && count === n && typeof line.loopKm === 'number' && Number.isFinite(line.loopKm)) {
    anchors.set(n, anchors.get(0) + line.loopKm);
  }
  const keys = [...anchors.keys()].sort((a, b) => a - b);
  /** @type {SectionKm[]} */
  const sections = est.map((e) => ({ ...e }));
  for (let k = 0; k + 1 < keys.length; k++) {
    const from = keys[k];
    const to = keys[k + 1];
    const span = Math.max(0, anchors.get(to) - anchors.get(from));
    let sum = 0;
    for (let i = from; i < to; i++) sum += est[i].km;
    for (let i = from; i < to; i++) {
      const share = sum > 0 ? est[i].km / sum : 1 / (to - from);
      sections[i] = { km: span * share, source: 'manual' };
    }
  }
  const stops = [anchors.get(0)];
  for (let i = 1; i < n; i++) stops.push(anchors.has(i) ? anchors.get(i) : stops[i - 1] + sections[i - 1].km);
  const total = sections.reduce((s, x) => s + x.km, 0);
  return { stops, sections, total, approx: sections.some((x) => x.source === 'estimate') };
}

/**
 * すべての路線の営業キロ（路線 ID → LineKm）
 * @param {Project} p
 * @returns {Map<string, LineKm>}
 */
export function allLineKm(p) {
  const byId = new Map(p.stations.map((s) => [s.id, s]));
  return new Map(p.lines.map((l) => [l.id, lineKm(p, l, byId)]));
}

/**
 * 駅間が極端か（0.3km未満、または新幹線以外で50km超。概算の駅間は対象外）
 * @param {Line} line
 * @param {SectionKm} s
 * @returns {'short'|'long'|null}
 */
export function extremeSection(line, s) {
  if (s.source === 'estimate') return null;
  if (s.km < SHORT_SECTION_KM) return 'short';
  if (line.kind !== 'shinkansen' && s.km > LONG_SECTION_KM) return 'long';
  return null;
}
