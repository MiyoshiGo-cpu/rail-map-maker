// 地理ビューの線路の形（§5.4）：駅の地理座標と経由点（SectionOverride.geoVia）を曲線（Catmull–Rom）で結ぶ。
// 路線ごとに、地理座標のある駅が続くあいだを1本の曲線にしてから駅で区間に切る（駅で線が折れないように）。
// 同じ2駅を同じ経由点で結ぶ区間（並走）は束にし、並び順が先の路線の曲線をみんなで使う（平行にずらして描く）。
// 座標は km（x は東、y は南）。
import { catmullRomSpans } from './geometry.js';
import { sectionCount } from './defaults.js';
import { computeBundles } from './parallel.js';

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {import('./schema.js').Project} Project */
/** @typedef {import('./schema.js').Line} Line */

/** 曲線の細かさ（km ごとに1点ほど。1区間あたりの上限あり） */
const CURVE_STEP_KM = 0.25;
const CURVE_MAX_SEGMENTS = 48;

/**
 * 地理ビューの区間の形
 * @typedef {object} GeoSection
 * @property {string} lineId
 * @property {number} index 駅間の番号
 * @property {string} a 始点の駅 ID
 * @property {string} b 終点の駅 ID
 * @property {Pt[]} ctrl 通る点（駅・経由点・駅）
 * @property {Pt[]} pts 曲線の点の列（a から b へ）
 * @property {import('./parallel.js').BundleSlot} slot 並走の束の中での位置
 */

/**
 * 区間の通る点（駅・経由点・駅）。どちらかの駅に地理座標が無ければ null
 * @param {Line} line
 * @param {number} i
 * @param {Map<string, import('./schema.js').Station>} byId
 * @returns {Pt[] | null}
 */
export function sectionControls(line, i, byId) {
  const n = line.stops.length;
  const a = byId.get(line.stops[i].stationId);
  const b = byId.get(line.stops[(i + 1) % n].stationId);
  if (!a || !b || !a.geo || !b.geo || !('x' in a.geo) || !('x' in b.geo)) return null;
  const via = (line.sections[i] && line.sections[i].geoVia) || [];
  return [{ x: a.geo.x, y: a.geo.y }, ...via.filter((v) => 'x' in v).map((v) => ({ x: v.x, y: v.y })), { x: b.geo.x, y: b.geo.y }];
}

/**
 * 1本の路線の区間ごとの曲線。地理座標の無い駅にかかる区間は null
 * @param {Line} line
 * @param {Map<string, import('./schema.js').Station>} byId
 * @returns {{ ctrl: Pt[], pts: Pt[] }[] | null[]}
 */
export function lineCurves(line, byId) {
  const count = sectionCount(line);
  const ctrls = [];
  for (let i = 0; i < count; i++) ctrls.push(sectionControls(line, i, byId));
  /** @type {any[]} */
  const out = new Array(count).fill(null);
  const opt = { step: CURVE_STEP_KM, maxSegments: CURVE_MAX_SEGMENTS };

  // 環状線で全部つながっていれば、輪の曲線にする
  if (line.isLoop && count >= 3 && ctrls.every(Boolean)) {
    const pts = [];
    const starts = [];
    for (const c of ctrls) {
      starts.push(pts.length);
      for (let k = 0; k < c.length - 1; k++) pts.push(c[k]);
    }
    const spans = catmullRomSpans(pts, { ...opt, closed: true });
    ctrls.forEach((c, i) => {
      out[i] = { ctrl: c, pts: joinSpans(spans, starts[i], starts[i] + c.length - 1) };
    });
    return out;
  }

  // 続いている区間のまとまりごとに1本の曲線にする（環状線は、途切れた所から数え始める）
  let start = 0;
  if (line.isLoop) {
    const gap = ctrls.findIndex((c) => !c);
    start = gap < 0 ? 0 : gap + 1;
  }
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const pts = [];
    const starts = [];
    run.forEach((i, k) => {
      const c = ctrls[i];
      starts.push(Math.max(0, pts.length - 1));
      for (let j = k === 0 ? 0 : 1; j < c.length; j++) pts.push(c[j]);
    });
    const spans = catmullRomSpans(pts, opt);
    run.forEach((i, k) => {
      out[i] = { ctrl: ctrls[i], pts: joinSpans(spans, starts[k], starts[k] + ctrls[i].length - 1) };
    });
    run = [];
  };
  for (let k = 0; k < count; k++) {
    const i = (start + k) % count;
    if (ctrls[i]) run.push(i);
    else flush();
  }
  flush();
  return out;
}

/** spans[from]〜spans[to - 1] をつないだ点の列（つなぎ目の点は1つにする） */
function joinSpans(spans, from, to) {
  const out = [];
  for (let s = from; s < to; s++) {
    const span = spans[s];
    for (let j = s === from ? 0 : 1; j < span.length; j++) out.push(span[j]);
  }
  return out;
}

/**
 * すべての路線の区間の形と、並走の束
 * @param {Project} p
 * @returns {Map<string, GeoSection>} `${lineId}:${index}` → 区間の形（地理座標が無い区間は入れない）
 */
export function computeGeoSections(p) {
  const byId = new Map(p.stations.map((s) => [s.id, s]));
  /** @type {Map<string, any[]>} */
  const curves = new Map();
  /** 束を作るための形（通る点で比べる） */
  const shapes = new Map();
  for (const line of p.lines) {
    const cs = lineCurves(line, byId);
    curves.set(line.id, cs);
    const n = line.stops.length;
    shapes.set(line.id, cs.map((c, i) => (c ? { a: line.stops[i].stationId, b: line.stops[(i + 1) % n].stationId, pts: c.ctrl } : null)));
  }
  const slots = computeBundles(p.lines, shapes);
  // 束ごとに、並び順が先の路線（rank 0）の曲線を使う
  const ref = new Map();
  for (const line of p.lines) {
    shapes.get(line.id).forEach((g, i) => {
      const slot = g && slots.get(`${line.id}:${i}`);
      if (slot && slot.rank === 0) ref.set(slot.key, { a: g.a, pts: curves.get(line.id)[i].pts });
    });
  }
  /** @type {Map<string, GeoSection>} */
  const out = new Map();
  for (const line of p.lines) {
    shapes.get(line.id).forEach((g, i) => {
      if (!g) return;
      const key = `${line.id}:${i}`;
      const slot = slots.get(key);
      const r = ref.get(slot.key);
      let pts = curves.get(line.id)[i].pts;
      if (r && slot.size > 1) pts = r.a === g.a ? r.pts : [...r.pts].reverse();
      out.set(key, { lineId: line.id, index: i, a: g.a, b: g.b, ctrl: g.pts, pts, slot });
    });
  }
  return out;
}

/**
 * 地理の経由点を足す位置（通る点の折れ線のうち、点にいちばん近い辺の番号＝ geoVia に入れる位置）
 * @param {Pt[]} ctrl 通る点（駅・経由点・駅）
 * @param {Pt} q
 * @returns {number} 0 なら最初の経由点の前
 */
export function viaInsertIndex(ctrl, q) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i + 1 < ctrl.length; i++) {
    const a = ctrl[i];
    const b = ctrl[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2)) : 0;
    const d = Math.hypot(q.x - (a.x + dx * t), q.y - (a.y + dy * t));
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * 区間のパネルの「経由点を追加」で足す点：通る点の折れ線のいちばん長い辺の中点
 * @param {Pt[]} ctrl
 * @returns {{ index: number, point: Pt } | null} 辺が短すぎれば null
 */
export function nextGeoViaPoint(ctrl) {
  let best = -1;
  let bestLen = 0;
  for (let i = 0; i + 1 < ctrl.length; i++) {
    const len = Math.hypot(ctrl[i + 1].x - ctrl[i].x, ctrl[i + 1].y - ctrl[i].y);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  if (best < 0 || bestLen < 0.05) return null;
  const a = ctrl[best];
  const b = ctrl[best + 1];
  const r = (v) => Math.round(v * 1000) / 1000 + 0;
  return { index: best, point: { x: r((a.x + b.x) / 2), y: r((a.y + b.y) / 2) } };
}
