// 既定値を作る関数と、読み込んだデータの補完（schema.js の型に合わせる）
import { SCHEMA_VERSION, DEFAULT_WALK_MINUTES, ID_PREFIX } from './schema.js';
import { getRegion, defaultDwellSec } from './regions/index.js';
import { readableTextColor } from './color.js';
import { newId } from './ids.js';

/** @typedef {import('./schema.js').Project} Project */
/** @typedef {import('./schema.js').RegionPack} RegionPack */
/** @typedef {import('./schema.js').Station} Station */
/** @typedef {import('./schema.js').Line} Line */
/** @typedef {import('./schema.js').Operator} Operator */

/** @returns {import('./schema.js').MapStyle} */
export function defaultStyle() {
  return {
    preset: 'urban',
    lineWidth: 6,
    lineGap: 2,
    cornerRadius: 8,
    stationRadius: 5,
    fontFamily: 'gothic',
    fontSize: 12,
    showSubNames: true,
    showNumbering: true,
    stationStroke: 'black',
    background: '#FFFFFF',
    showGrid: true,
    showAbolished: false,
    ink: '#1F2933',
    paper: '#FFFFFF',
    colorMode: 'color',
    stationSymbol: 'circle',
  };
}

/**
 * @param {RegionPack} region
 * @returns {import('./schema.js').ProjectSettings}
 */
export function defaultSettings(region) {
  return {
    romaji: { ...region.romajiDefaults },
    curveFactor: 1.10,
    viaCurveFactor: 1.03,
    runtimeMargin: 0.05,
  };
}

export function defaultView() {
  return {
    schematic: { cx: 0, cy: 0, zoom: 1 },
    geo: { cx: 0, cy: 0, zoom: 1 },
  };
}

/**
 * @param {{ id?: string, name: string, author?: string, regionId?: string, now?: string }} opt
 * @returns {Project}
 */
export function createProject({ id, name, author, regionId, now }) {
  const region = getRegion(regionId);
  const t = now || new Date().toISOString();
  /** @type {Project} */
  const p = {
    schemaVersion: SCHEMA_VERSION,
    id: id || newId(ID_PREFIX.project),
    name,
    createdAt: t,
    updatedAt: t,
    locale: { ...region.locale, subLanguages: [...region.locale.subLanguages] },
    world: { mode: 'none' },
    operators: [],
    lines: [],
    stations: [],
    interchanges: [],
    serviceTypes: [],
    services: [],
    rollingStock: [],
    fareTables: [],
    style: defaultStyle(),
    settings: defaultSettings(region),
    view: defaultView(),
    meta: {},
  };
  if (author) p.author = author;
  return p;
}

/** @returns {import('./schema.js').LabelOpt} */
export function createLabelOpt() {
  return { pos: 'auto', orientation: 'horizontal' };
}

/**
 * @param {RegionPack} region
 * @param {Partial<Station> & { id: string }} fields
 * @returns {Station}
 */
export function createStation(region, fields) {
  return {
    name: '',
    reading: '',
    names: {},
    autoRomanize: region.autoRomanize,
    rank: 'normal',
    structure: 'ground',
    facilities: [],
    geo: null,
    schematic: null,
    label: { schematic: createLabelOpt(), geo: createLabelOpt() },
    ...fields,
  };
}

/**
 * 路線の種類に合わせた区間属性の既定値
 * @param {RegionPack} region
 * @param {string} kind
 * @returns {import('./schema.js').SectionAttrs}
 */
export function createSectionAttrs(region, kind) {
  const d = region.lineKindDefaults[kind] || region.lineKindDefaults[region.defaultLineKind];
  return {
    gauge: d.gauge,
    electrification: d.electrification,
    collection: d.collection,
    tracks: d.tracks,
    maxSpeed: d.maxSpeed,
    structure: d.structure,
    status: 'open',
  };
}

/** 種類で変わる区間属性のキー（種類を変えたときに既定値を合わせ直す） */
export const KIND_DEPENDENT_ATTRS = ['gauge', 'electrification', 'collection', 'tracks', 'maxSpeed', 'structure'];

/**
 * @param {RegionPack} region
 * @returns {import('./schema.js').NumberingRule}
 */
export function createNumberingRule(region) {
  return { ...region.numberingDefaults };
}

/**
 * @param {RegionPack} region
 * @param {Partial<Operator> & { id: string, name: string }} fields
 * @returns {Operator}
 */
export function createOperator(region, fields) {
  return {
    shortName: fields.name,
    names: {},
    category: region.operatorDefaults.category,
    color: '#0079C2',
    textColor: '#FFFFFF',
    badgeShape: region.operatorDefaults.badgeShape,
    ...fields,
  };
}

/**
 * @param {RegionPack} region
 * @param {Partial<Line> & { id: string, operatorId: string, name: string, order: number }} fields
 * @returns {Line}
 */
export function createLine(region, fields) {
  const kind = fields.kind || region.defaultLineKind;
  return {
    names: {},
    kind,
    color: '#0079C2',
    symbol: '',
    isLoop: false,
    upDirection: 'toStart',
    stops: [],
    defaults: createSectionAttrs(region, kind),
    sections: [],
    numbering: createNumberingRule(region),
    status: 'open',
    ...fields,
  };
}

/**
 * @param {{ id: string, stationIds: string[], walkMinutes?: number, showConnector?: boolean }} fields
 * @returns {import('./schema.js').Interchange}
 */
export function createInterchange(fields) {
  return { walkMinutes: DEFAULT_WALK_MINUTES, showConnector: true, ...fields };
}

/** 種別の既定の色（各駅停車の灰色） */
const DEFAULT_TYPE_COLOR = '#6E7780';

/**
 * @param {RegionPack} region
 * @param {Partial<import('./schema.js').ServiceType> & { id: string, operatorId: string, name: string }} fields
 * @returns {import('./schema.js').ServiceType}
 */
export function createServiceType(region, fields) {
  const rank = fields.rank ?? 1;
  const color = fields.color || DEFAULT_TYPE_COLOR;
  return {
    shortName: fields.name,
    names: {},
    color,
    textColor: readableTextColor(color),
    rank,
    surcharge: false,
    seating: 'free',
    stopRule: { base: 'all', interchanges: false },
    dwellSec: defaultDwellSec(region, rank),
    ...fields,
  };
}

/**
 * プリセットの1つから種別の項目を作る（ID と事業者は呼び出し側で付ける）
 * @param {RegionPack} region
 * @param {import('./schema.js').ServiceTypePreset} x
 */
export function serviceTypeFromPreset(region, x) {
  return {
    name: x.name,
    shortName: x.shortName,
    names: x.en ? { en: x.en } : {},
    color: x.color,
    textColor: readableTextColor(x.color),
    rank: x.rank,
    surcharge: !!x.surcharge,
    seating: x.seating || 'free',
    stopRule: { base: x.base, interchanges: !!x.interchanges },
    dwellSec: defaultDwellSec(region, x.rank),
  };
}

/** 1時間あたりの本数の既定（片道） */
export const DEFAULT_FREQUENCY = { morning: 6, day: 4, evening: 6, night: 2 };

/**
 * @param {Partial<import('./schema.js').Service> & { id: string }} fields
 * @returns {import('./schema.js').Service}
 */
export function createService(fields) {
  return {
    segments: [],
    stops: [],
    stopsAuto: true,
    frequency: { ...DEFAULT_FREQUENCY },
    bothDirections: true,
    ...fields,
  };
}

/** 駅間の数（環状なら駅の数） */
export function sectionCount(line) {
  const n = line.stops.length;
  if (line.isLoop) return n >= 2 ? n : 0;
  return Math.max(0, n - 1);
}

// ---------- 読み込んだデータの補完 ----------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * 足りない項目を既定値で補う（同じデータに何度かけても結果は同じ）。
 * マイグレーションのあとに呼ぶ。
 * @param {any} p
 * @returns {Project}
 */
export function normalizeProject(p) {
  const region = getRegion(p.locale && p.locale.region);
  const base = createProject({ id: p.id, name: p.name ?? '', regionId: region.id, now: p.createdAt });
  const out = {
    ...base,
    ...p,
    locale: { ...base.locale, ...(isObj(p.locale) ? p.locale : {}) },
    world: isObj(p.world) && p.world.mode ? p.world : { mode: 'none' },
    style: { ...base.style, ...(isObj(p.style) ? p.style : {}) },
    settings: {
      ...base.settings,
      ...(isObj(p.settings) ? p.settings : {}),
      romaji: { ...base.settings.romaji, ...(isObj(p.settings) && isObj(p.settings.romaji) ? p.settings.romaji : {}) },
    },
    view: {
      schematic: { ...base.view.schematic, ...(isObj(p.view) && isObj(p.view.schematic) ? p.view.schematic : {}) },
      geo: { ...base.view.geo, ...(isObj(p.view) && isObj(p.view.geo) ? p.view.geo : {}) },
    },
    meta: isObj(p.meta) ? p.meta : {},
    updatedAt: p.updatedAt || base.updatedAt,
  };
  for (const key of ['rollingStock', 'fareTables']) out[key] = arr(p[key]);
  out.services = arr(p.services).map((x) => {
    const sv = createService({ ...x, segments: arr(x.segments), stops: arr(x.stops) });
    sv.frequency = { ...DEFAULT_FREQUENCY, ...(isObj(x.frequency) ? x.frequency : {}) };
    return sv;
  });
  out.serviceTypes = arr(p.serviceTypes).map((x) => {
    const st = createServiceType(region, { ...x, name: x.name ?? '' });
    st.names = isObj(x.names) ? x.names : {};
    st.stopRule = { base: 'all', interchanges: false, ...(isObj(x.stopRule) ? x.stopRule : {}) };
    return st;
  });

  out.operators = arr(p.operators).map((o) => ({ names: {}, ...o }));
  out.stations = arr(p.stations).map((s) => {
    const st = createStation(region, s);
    const label = isObj(s.label) ? s.label : {};
    st.label = {
      schematic: { ...createLabelOpt(), ...(isObj(label.schematic) ? label.schematic : {}) },
      geo: { ...createLabelOpt(), ...(isObj(label.geo) ? label.geo : {}) },
    };
    st.names = isObj(s.names) ? s.names : {};
    st.facilities = arr(s.facilities);
    return st;
  });
  out.lines = arr(p.lines).map((l, i) => {
    const kind = l.kind || region.defaultLineKind;
    const line = createLine(region, { order: i, ...l, kind });
    line.names = isObj(l.names) ? l.names : {};
    line.stops = arr(l.stops);
    line.defaults = { ...createSectionAttrs(region, kind), ...(isObj(l.defaults) ? l.defaults : {}) };
    line.numbering = { ...createNumberingRule(region), ...(isObj(l.numbering) ? l.numbering : {}) };
    // 駅間の数に合わせる（足りなければ空の上書きを足し、多ければ切る）
    const count = sectionCount(line);
    const sections = arr(l.sections).slice(0, count);
    while (sections.length < count) sections.push({});
    line.sections = sections;
    return line;
  });
  out.interchanges = arr(p.interchanges).map((ic) => createInterchange({ ...ic, stationIds: arr(ic.stationIds) }));
  return out;
}
