// 駅名標（§5.6）の中身：駅名・よみ・英字・副駅名・駅番号・前後の駅。
// 前後の駅は、左＝起点側・右＝終点側。終端の駅は片側だけ、環状線は一周でつなぐ。
// 信号場・貨物駅・車両基地は旅客の駅ではないので、前後の駅には出さずに飛ばす。
import { stopNumbers, prefixOf, fullCode } from './numbering.js';

/** @typedef {import('./schema.js').Project} Project */
/** @typedef {import('./schema.js').Line} Line */
/** @typedef {import('./schema.js').Station} Station */

/** 前後の駅に出さない駅 */
const NOT_PASSENGER = new Set(['signal', 'freight', 'depot']);

/** 駅名標のテンプレート */
export const SIGNBOARD_TEMPLATES = /** @type {const} */ (['band', 'number', 'kana']);
/** 表示項目 */
export const SIGNBOARD_ITEMS = /** @type {const} */ (['reading', 'en', 'subName', 'number', 'neighbors', 'multilingual']);

/**
 * 駅名標の1つの駅
 * @typedef {object} SignStation
 * @property {string} id
 * @property {string} name
 * @property {string} reading
 * @property {string} en
 * @property {string} subName
 * @property {string[]} others 英字と地図の言語のほかの表記（多言語）
 * @property {{ prefix: string, number: string, code: string } | null} number この路線での駅番号
 */

/**
 * @typedef {object} Signboard
 * @property {SignStation} station
 * @property {Line} line
 * @property {string} color 路線の色
 * @property {SignStation | null} prev 左（起点側）
 * @property {SignStation | null} next 右（終点側）
 */

/**
 * 駅名標を作れる路線（その駅を通る路線。並び順）
 * @param {Project} p
 * @param {string} stationId
 */
export function signboardLines(p, stationId) {
  return [...p.lines].sort((a, b) => a.order - b.order).filter((l) => l.stops.some((s) => s.stationId === stationId));
}

/**
 * 駅名標を作れる駅（どれかの路線に入っている旅客の駅）
 * @param {Project} p
 */
export function signboardStations(p) {
  const onLine = new Set(p.lines.flatMap((l) => l.stops.map((s) => s.stationId)));
  return p.stations.filter((s) => onLine.has(s.id) && !NOT_PASSENGER.has(s.rank));
}

/**
 * 路線の中で、位置 i から dir の向きにある次の旅客の駅の位置（無ければ -1）。環状線は一周する
 * @param {Line} line
 * @param {Map<string, Station>} byId
 * @param {number} i
 * @param {1|-1} dir
 */
export function neighborIndex(line, byId, i, dir) {
  const n = line.stops.length;
  for (let k = 1; k < n; k++) {
    let j = i + dir * k;
    if (line.isLoop) j = ((j % n) + n) % n;
    else if (j < 0 || j >= n) return -1;
    const st = byId.get(line.stops[j].stationId);
    if (st && !NOT_PASSENGER.has(st.rank)) return j === i ? -1 : j;
  }
  return -1;
}

/**
 * @param {Project} p
 * @param {string} stationId
 * @param {string} [lineId] 省略したら並び順が最初の路線
 * @returns {Signboard | null}
 */
export function buildSignboard(p, stationId, lineId) {
  const byId = new Map(p.stations.map((s) => [s.id, s]));
  const st = byId.get(stationId);
  if (!st) return null;
  const lines = signboardLines(p, stationId);
  const line = lines.find((l) => l.id === lineId) || lines[0];
  if (!line) return null;
  const i = line.stops.findIndex((s) => s.stationId === stationId);
  const numbers = stopNumbers(line);
  const mapLang = p.locale.mapLanguage;
  const entry = (k) => {
    const s = byId.get(line.stops[k].stationId);
    const number = numbers[k] ? { prefix: prefixOf(line), number: numbers[k], code: fullCode(line, numbers[k]) } : null;
    return {
      id: s.id,
      name: s.name,
      reading: s.reading || '',
      en: (s.names && s.names.en) || '',
      subName: s.subName || '',
      others: Object.entries(s.names || {}).filter(([lang, v]) => lang !== 'en' && lang !== mapLang && v).map(([, v]) => v),
      number,
    };
  };
  const pi = neighborIndex(line, byId, i, -1);
  const ni = neighborIndex(line, byId, i, 1);
  return {
    station: entry(i),
    line,
    color: line.color,
    prev: pi >= 0 ? entry(pi) : null,
    next: ni >= 0 ? entry(ni) : null,
  };
}
