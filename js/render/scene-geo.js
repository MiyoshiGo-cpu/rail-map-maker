// 地理ビューの表示リスト（§5.4。DOM に依存しない）：県境（破線）・川（流量で太さ）・都市（人口で点の大きさと名前）・
// 線路（駅と経由点を通る曲線。並走は平行にずらす）・駅の記号・駅名。地形の段彩と陰影は画像で、ui/geo-view.js が下に敷く。
// 世界座標は地理座標（km）× GEO_UNIT。線の太さや文字の大きさは画面で一定に見えるように、
// 倍率の段階（geoZoomLevel）ごとに「画面の1px に当たる長さ（unit）」を掛けて作り直す。
import { GEO_UNIT } from '../core/viewport.js';
import { offsetPolyline } from '../core/geometry.js';
import { effectiveSectionAttrs } from '../core/lines.js';
import { createSpatialIndex } from './spatial-index.js';
import { strokeFor, inkOf, paperOf, lineAppearance, mapFont } from './styles.js';
import { layoutLabels } from './labels.js';
import { stationSymbol } from './station-symbol.js';

/** @typedef {import('../core/schema.js').Project} Project */
/** @typedef {import('../core/geo-lines.js').GeoSection} GeoSection */
/** @typedef {(font: string, text: string) => number} Measure */
/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Box */

/** 地理ビューの線と駅の記号の大きさ（路線図の何倍か。地形の上なので控えめにする） */
const LINE_SCALE = 0.6;
const STATION_SCALE = 0.8;

const RIVER_COLOR = '#4A8CD0';
const RIVER_WIDTHS = [0.7, 1.1, 1.6, 2.2, 3];
const BORDER_COLOR = '#6F5A86';
const CITY_INK = '#33404D';
const CITY_DOT = '#4B5560';
const HALO = 'rgba(255,255,255,0.88)';

/** 都市の種類ごとの点の半径・文字（画面の px）と、出し始める縮尺（1km の画面の長さ） */
const CITY_LOOK = {
  metropolis: { r: 4.5, size: 14, weight: 700, minPx: 0 },
  city: { r: 3.2, size: 12.5, weight: 600, minPx: 0 },
  town: { r: 2.4, size: 11, weight: 500, minPx: 2.5 },
  village: { r: 1.8, size: 10, weight: 500, minPx: 6 },
};

/**
 * 倍率の段階（√2 ごと）。この段階が変わったときだけ表示リストを作り直す
 * @param {number} zoom
 */
export function geoZoomLevel(zoom) {
  return 2 ** (Math.round(Math.log2(zoom) * 2) / 2);
}

/**
 * 駅名を隠す段階（labels.js の level。1km の画面の長さで決める）
 * @param {number} pxPerKm
 * @returns {0|1|2}
 */
export function geoLabelLevel(pxPerKm) {
  if (pxPerKm >= 16) return 0;
  if (pxPerKm >= 4) return 1;
  return 2;
}

/** km の点の並びを世界座標にし、範囲も求める */
function toWorld(kmPts) {
  const pts = new Array(kmPts.length);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < kmPts.length; i += 2) {
    const x = kmPts[i] * GEO_UNIT;
    const y = kmPts[i + 1] * GEO_UNIT;
    pts[i] = x;
    pts[i + 1] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { pts, bbox: { minX, minY, maxX, maxY } };
}

/**
 * 地形の線（川と県境）を世界座標にする（地形が変わったときに1回だけ）
 * @param {import('../core/terrain/jobs.js').GeoBase} base
 */
export function geoBaseVectors(base) {
  return {
    extent: { minX: 0, minY: 0, maxX: base.width * base.cellKm * GEO_UNIT, maxY: base.height * base.cellKm * GEO_UNIT },
    threshold: base.threshold,
    rivers: base.rivers.map((r) => ({ ...toWorld(r.pts), cls: r.cls, flow: r.flow })),
    borders: base.borders.map((b) => toWorld(b)),
  };
}

const grow = (b, d) => ({ minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d });
const overlaps = (a, b) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/**
 * @param {Project} p
 * @param {{
 *   measure: Measure,
 *   zoom: number,
 *   sections: Map<string, GeoSection>,
 *   vectors?: ReturnType<typeof geoBaseVectors> | null,
 * }} opt zoom は geoZoomLevel の段階。sections は core/geo-lines.js の computeGeoSections
 */
export function buildGeoScene(p, opt) {
  const u = 1 / opt.zoom;
  const pxPerKm = opt.zoom * GEO_UNIT;
  const style = p.style;
  // 縮小したとき（1km が 12px 未満）は、駅の記号と線を少し小さくする（駅が線を隠さないように）
  const shrink = Math.min(1, Math.max(0.5, Math.sqrt(pxPerKm / 12)));
  // 画面で一定の大きさに見えるように、長さを unit 倍した見た目
  const sStyle = {
    ...style,
    lineWidth: style.lineWidth * LINE_SCALE * Math.max(0.7, shrink) * u,
    lineGap: style.lineGap * LINE_SCALE * Math.max(0.7, shrink) * u,
    stationRadius: style.stationRadius * STATION_SCALE * shrink * u,
    fontSize: style.fontSize * u,
    cornerRadius: 0,
  };
  const v = opt.vectors || null;

  // ---------- 県境と川 ----------
  const borderItems = [];
  const riverItems = [];
  if (v) {
    for (const b of v.borders) {
      borderItems.push({
        kind: 'path', pts: b.pts, radius: 0, width: 1.3 * u, color: BORDER_COLOR, alpha: 0.85, cap: 'butt',
        dash: [6 * u, 2.5 * u, 1.5 * u, 2.5 * u], bbox: grow(b.bbox, u),
      });
    }
    // 縮小したときは小さな川を省く。拡大したときは少し太くする
    const minFlow = v.threshold * Math.max(1, (3 / pxPerKm) ** 2);
    const wk = Math.min(2, Math.max(1, Math.sqrt(pxPerKm / 16)));
    for (const r of v.rivers) {
      if (r.flow < minFlow) continue;
      const w = RIVER_WIDTHS[r.cls] * wk * u;
      riverItems.push({ kind: 'path', pts: r.pts, radius: 0, width: w, color: RIVER_COLOR, bbox: grow(r.bbox, w) });
    }
  }

  // ---------- 線路 ----------
  const lineById = new Map(p.lines.map((l) => [l.id, l]));
  const orderIndex = new Map([...p.lines].sort((a, b) => a.order - b.order).map((l, i) => [l.id, i]));
  const spacing = sStyle.lineWidth + sStyle.lineGap;
  /** @type {Map<string, { pts: { x: number, y: number }[], dirs: { x: number, y: number }[], lineIds: Set<string> }>} */
  const passes = new Map();
  const passOf = (id) => {
    let x = passes.get(id);
    if (!x) passes.set(id, (x = { pts: [], dirs: [], lineIds: new Set() }));
    return x;
  };
  const lineItems = [];
  /** @type {Map<string, any>} */
  const sectionItems = new Map();
  const secs = [...opt.sections.values()].sort((a, b) => lineById.get(b.lineId).order - lineById.get(a.lineId).order);
  for (const g of secs) {
    const line = lineById.get(g.lineId);
    const world = g.pts.map((q) => ({ x: q.x * GEO_UNIT, y: q.y * GEO_UNIT }));
    const shifted = g.slot.offset ? offsetPolyline(world, g.slot.offset * spacing) : world;
    const n = shifted.length;
    const pa = passOf(g.a);
    pa.pts.push(shifted[0]);
    pa.dirs.push({ x: world[1].x - world[0].x, y: world[1].y - world[0].y });
    pa.lineIds.add(line.id);
    const pb = passOf(g.b);
    pb.pts.push(shifted[n - 1]);
    pb.dirs.push({ x: world[n - 1].x - world[n - 2].x, y: world[n - 1].y - world[n - 2].y });
    pb.lineIds.add(line.id);

    const attrs = effectiveSectionAttrs(line, g.index);
    const s = strokeFor(sStyle, line.kind, attrs.status, line.color, orderIndex.get(line.id), u);
    if (s.hidden) continue;
    const pts = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const q of shifted) {
      pts.push(q.x, q.y);
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.y > maxY) maxY = q.y;
    }
    const item = {
      kind: 'path', pts, radius: 0, width: s.width, color: s.color, dash: s.dash, alpha: s.alpha, inner: s.inner,
      target: { type: 'section', lineId: line.id, index: g.index },
      bbox: grow({ minX, minY, maxX, maxY }, s.width / 2),
    };
    lineItems.push(item);
    sectionItems.set(`${line.id}:${g.index}`, item);
  }

  // ---------- 駅 ----------
  const symbolItems = [];
  /** @type {Map<string, any>} */
  const stationItems = new Map();
  const lineColor = new Map(p.lines.map((l) => [l.id, lineAppearance(sStyle, l.color, orderIndex.get(l.id)).color]));
  for (const st of p.stations) {
    if (!st.geo || !('x' in st.geo)) continue;
    const center = { x: st.geo.x * GEO_UNIT, y: st.geo.y * GEO_UNIT };
    const pass = passes.get(st.id);
    const ids = pass ? [...pass.lineIds].sort((a, b) => lineById.get(a).order - lineById.get(b).order) : [];
    const stroke = style.stationStroke === 'line' && ids.length ? lineColor.get(ids[0]) : inkOf(style);
    // 縁の太さなども、縮小したときは記号に合わせて細くする
    const items = stationSymbol(st, center, pass, ids.length, sStyle, stroke, ids.length ? lineColor.get(ids[0]) : inkOf(style), u * Math.max(0.6, shrink));
    for (const it of items) symbolItems.push(it);
    stationItems.set(st.id, items[0]);
  }

  // ---------- 駅名（ほかの札と重なるものは出さない） ----------
  const labels = layoutLabels(p, {
    measure: opt.measure,
    level: geoLabelLevel(pxPerKm),
    symbols: stationItems,
    passes,
    obstacles: [...lineItems, ...symbolItems],
    labelKey: 'geo',
    style: sStyle,
    unit: u,
    skipOverlap: true,
  });

  // ---------- 都市（人口の多い順に、駅名や駅とも重ならない所に名前を置く） ----------
  const cityDots = [];
  const cityLabels = [];
  const cities = p.world.mode === 'fictional' ? [...p.world.cities].sort((a, b) => b.population - a.population) : [];
  const taken = labels.placed;
  for (const it of symbolItems) taken.insert(it);
  for (const c of cities) {
    const look = CITY_LOOK[c.kind] || CITY_LOOK.town;
    if (pxPerKm < look.minPx || !c.name) continue;
    const x = c.pos.x * GEO_UNIT;
    const y = c.pos.y * GEO_UNIT;
    const r = look.r * u;
    const font = mapFont(style, look.size * u, look.weight);
    const w = opt.measure(font, c.name);
    const h = look.size * 1.2 * u;
    const gap = r + 3 * u;
    const candidates = [
      { x: x + gap, y, align: 'left', box: { minX: x + gap, minY: y - h / 2, maxX: x + gap + w, maxY: y + h / 2 } },
      { x: x - gap, y, align: 'right', box: { minX: x - gap - w, minY: y - h / 2, maxX: x - gap, maxY: y + h / 2 } },
      { x, y: y - gap - h / 2, align: 'center', box: { minX: x - w / 2, minY: y - gap - h, maxX: x + w / 2, maxY: y - gap } },
      { x, y: y + gap + h / 2, align: 'center', box: { minX: x - w / 2, minY: y + gap, maxX: x + w / 2, maxY: y + gap + h } },
    ];
    const dotBox = { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
    const at = candidates.find((cd) => !taken.query(cd.box).some((o) => overlaps(cd.box, o.bbox)));
    if (!at) continue;
    const dot = { kind: 'circle', x, y, r, fill: CITY_DOT, stroke: HALO, lineWidth: 1.2 * u, bbox: grow(dotBox, u) };
    const label = {
      kind: 'text', x: at.x, y: at.y, text: c.name, font, color: CITY_INK, align: at.align, baseline: 'middle',
      halo: HALO, haloWidth: 3 * u, bbox: at.box,
    };
    cityDots.push(dot);
    cityLabels.push(label);
    taken.insert(label);
    taken.insert(dot);
  }

  const index = createSpatialIndex(96 * u);
  for (const it of [...lineItems, ...symbolItems, ...labels.items]) if (it.target) index.insert(it);
  const items = [...borderItems, ...riverItems, ...cityDots, ...lineItems, ...symbolItems, ...cityLabels, ...labels.items];
  return {
    items,
    index,
    stationItems,
    sectionItems,
    zoom: opt.zoom,
    unit: u,
    paper: paperOf(style),
  };
}

/** @typedef {ReturnType<typeof buildGeoScene>} GeoScene */
