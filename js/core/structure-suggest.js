// トンネル・橋梁の提案（§7 フェーズ4）。DOM に依存しない。
// 地理の線路の曲線（core/geo-lines.js）に沿って 0.1km ごとに地形を調べる。
// ・線路の高さは、両端の駅の地面の高さを直線で結んだものとみなし、地面がそれより TUNNEL_DEPTH_M 以上高い所を「山の中」とする
// ・海・湖・川（流量が川のしきい値以上の陸のマス）の上を「水の上」とする。川は横切る所だけを数える
//   （川のマスが RIVER_CROSS_MAX_KM より長く続くのは、川に沿って谷を走っているとみなす）
// 構造は区間ごとにしか持たないので、山の中が区間の4分の1以上（かつ 0.3km 以上）ならトンネル、
// 水の上を通れば橋梁を提案する（両方なら長い方）。手で構造を決めた区間（上書きがある区間）と、
// もともと地上でない路線（地下鉄・高架など）の区間は提案しない。
import { computeGeoSections } from './geo-lines.js';
import { effectiveSectionAttrs } from './lines.js';

/** @typedef {import('./schema.js').Project} Project */

/** 調べる間隔（km） */
export const SAMPLE_STEP_KM = 0.1;
/** 地面が線路よりこれだけ高ければ山の中（m） */
export const TUNNEL_DEPTH_M = 30;
/** トンネルを提案する山の中の長さの下限（km）と、区間に占める割合の下限 */
const TUNNEL_MIN_KM = 0.3;
const TUNNEL_MIN_RATIO = 0.25;
/** 川を横切るとみなす長さの上限（km。マスは 0.5km なので、斜めに横切っても収まる長さ） */
export const RIVER_CROSS_MAX_KM = 0.8;
/** 提案する元の構造（地上と切通しだけ） */
const SURFACE = new Set(['ground', 'cutting']);

const SEA = 1;
const LAKE = 2;

/**
 * 地形の値
 * @typedef {object} TerrainGrid
 * @property {number} width
 * @property {number} height
 * @property {number} cellKm
 * @property {ArrayLike<number>} elevation 標高（m）
 * @property {ArrayLike<number>} water 水の種類（0 陸・1 海・2 湖）
 * @property {ArrayLike<number>} [river] 川のマス（1）
 */

/**
 * 地点の標高（マスの中心どうしの間で双一次補間）
 * @param {TerrainGrid} g
 * @param {number} x km
 * @param {number} y km
 */
export function elevationAt(g, x, y) {
  const fx = Math.min(g.width - 1, Math.max(0, x / g.cellKm - 0.5));
  const fy = Math.min(g.height - 1, Math.max(0, y / g.cellKm - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(g.width - 1, x0 + 1);
  const y1 = Math.min(g.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const e = g.elevation;
  const w = g.width;
  return (e[y0 * w + x0] * (1 - tx) + e[y0 * w + x1] * tx) * (1 - ty) + (e[y1 * w + x0] * (1 - tx) + e[y1 * w + x1] * tx) * ty;
}

/**
 * 地点の水（'sea'|'lake'|'river'|null）。いちばん近いマスで決める
 * @param {TerrainGrid} g
 * @param {number} x km
 * @param {number} y km
 */
export function waterAt(g, x, y) {
  const cx = Math.min(g.width - 1, Math.max(0, Math.floor(x / g.cellKm)));
  const cy = Math.min(g.height - 1, Math.max(0, Math.floor(y / g.cellKm)));
  const i = cy * g.width + cx;
  if (g.water[i] === SEA) return 'sea';
  if (g.water[i] === LAKE) return 'lake';
  if (g.river && g.river[i]) return 'river';
  return null;
}

/**
 * 折れ線に沿って等間隔の点（両端を含む）と、全長
 * @param {{ x: number, y: number }[]} pts km
 * @param {number} step
 */
function samplePolyline(pts, step) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const n = Math.max(1, Math.round(total / step));
  const out = [];
  let seg = 1;
  let segStart = 0;
  for (let k = 0; k <= n; k++) {
    const d = (total * k) / n;
    while (seg < pts.length - 1 && segStart + Math.hypot(pts[seg].x - pts[seg - 1].x, pts[seg].y - pts[seg - 1].y) < d) {
      segStart += Math.hypot(pts[seg].x - pts[seg - 1].x, pts[seg].y - pts[seg - 1].y);
      seg++;
    }
    const a = pts[seg - 1];
    const b = pts[seg];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const t = len ? Math.min(1, Math.max(0, (d - segStart) / len)) : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, t: k / n });
  }
  return { samples: out, total };
}

/**
 * 区間1つ分の地形の調べ
 * @param {{ x: number, y: number }[]} pts 区間の曲線（km）
 * @param {TerrainGrid} g
 * @returns {{ totalKm: number, tunnelKm: number, maxDepthM: number, waterKm: number, water: 'sea'|'lake'|'river'|null }}
 */
export function surveySection(pts, g) {
  const { samples, total } = samplePolyline(pts, SAMPLE_STEP_KM);
  const n = samples.length;
  const each = n > 1 ? total / (n - 1) : 0;
  const h0 = Math.max(0, elevationAt(g, samples[0].x, samples[0].y));
  const h1 = Math.max(0, elevationAt(g, samples[n - 1].x, samples[n - 1].y));
  let tunnel = 0;
  let maxDepth = 0;
  let wet = 0;
  /** @type {Record<string, number>} */
  const kinds = {};
  // 川の上が続いている数（横切っただけか、沿って走っているかを、続いた長さで見分ける）
  let riverRun = 0;
  const endRiverRun = () => {
    if (riverRun && (riverRun - 1) * each <= RIVER_CROSS_MAX_KM) {
      wet += riverRun;
      kinds.river = (kinds.river || 0) + riverRun;
    }
    riverRun = 0;
  };
  for (const s of samples) {
    const ground = elevationAt(g, s.x, s.y);
    const rail = h0 + (h1 - h0) * s.t;
    const depth = ground - rail;
    if (depth > TUNNEL_DEPTH_M) tunnel++;
    if (depth > maxDepth) maxDepth = depth;
    const w = waterAt(g, s.x, s.y);
    if (w === 'river') {
      riverRun++;
      continue;
    }
    endRiverRun();
    if (w) {
      wet++;
      kinds[w] = (kinds[w] || 0) + 1;
    }
  }
  endRiverRun();
  // 水の種類は、いちばん多いもの（同じなら海 → 湖 → 川）
  const water = /** @type {'sea'|'lake'|'river'|null} */ (['sea', 'lake', 'river'].reduce((best, k) => ((kinds[k] || 0) > (kinds[best] || 0) ? k : best), 'sea'));
  return {
    totalKm: total,
    tunnelKm: tunnel * each,
    maxDepthM: Math.round(maxDepth),
    waterKm: wet * each,
    water: wet ? water : null,
  };
}

/**
 * トンネル・橋梁の提案
 * @typedef {object} StructureSuggestion
 * @property {string} lineId
 * @property {number} index 駅間の番号
 * @property {'tunnel'|'bridge'} structure
 * @property {ReturnType<typeof surveySection>} survey
 */

/**
 * プロジェクトのすべての区間を調べて、トンネル・橋梁を提案する
 * @param {Project} p
 * @param {TerrainGrid} g
 * @param {Map<string, import('./geo-lines.js').GeoSection>} [sections] 計算済みなら渡す
 * @returns {StructureSuggestion[]}
 */
export function suggestStructures(p, g, sections = computeGeoSections(p)) {
  const lineById = new Map(p.lines.map((l) => [l.id, l]));
  const out = [];
  for (const sec of sections.values()) {
    const line = lineById.get(sec.lineId);
    // 手で構造を決めた区間と、地上でない路線は提案しない
    const override = line.sections[sec.index] && line.sections[sec.index].structure;
    if (override !== undefined && override !== null) continue;
    const attrs = effectiveSectionAttrs(line, sec.index);
    if (!SURFACE.has(attrs.structure) || attrs.status === 'abolished') continue;
    const sv = surveySection(sec.pts, g);
    const tunnel = sv.tunnelKm >= TUNNEL_MIN_KM && sv.tunnelKm >= sv.totalKm * TUNNEL_MIN_RATIO;
    const bridge = sv.waterKm > 0;
    let structure = null;
    if (tunnel && bridge) structure = sv.tunnelKm >= sv.waterKm ? 'tunnel' : 'bridge';
    else if (tunnel) structure = 'tunnel';
    else if (bridge) structure = 'bridge';
    if (structure && structure !== attrs.structure) out.push({ lineId: line.id, index: sec.index, structure, survey: sv });
  }
  return out;
}

/**
 * チェックの項目にする（情報。「移動」と「当てる」）
 * @param {Project} p
 * @param {StructureSuggestion[]} list
 * @returns {Array<import('./validate.js').CheckItem & { fix: { lineId: string, index: number, structure: string } }>}
 */
export function structureCheckItems(p, list) {
  const lineById = new Map(p.lines.map((l) => [l.id, l]));
  const stName = new Map(p.stations.map((s) => [s.id, s.name]));
  const unit = p.locale.distanceUnit;
  return list.map((s) => {
    const line = lineById.get(s.lineId);
    const n = line.stops.length;
    const params = {
      name: line.displayName || line.name,
      a: stName.get(line.stops[s.index].stationId) || '',
      b: stName.get(line.stops[(s.index + 1) % n].stationId) || '',
    };
    if (s.structure === 'tunnel') Object.assign(params, { km: { distance: s.survey.tunnelKm, unit }, depth: s.survey.maxDepthM });
    else Object.assign(params, { km: { distance: s.survey.waterKm, unit }, water: { key: 'water.' + s.survey.water } });
    return {
      level: 'info',
      code: s.structure === 'tunnel' ? 'suggestTunnel' : 'suggestBridge',
      params,
      target: { type: 'section', id: s.lineId, index: s.index },
      fix: { lineId: s.lineId, index: s.index, structure: s.structure },
    };
  });
}
