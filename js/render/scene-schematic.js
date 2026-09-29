// 路線図ビューの表示リストを作る（DOM に依存しない）。
// 表示リストの要素：path（折れ線・角丸）、circle、capsule、rrect、text。どれも bbox と、当たり判定用の target を持つ。
import { GRID } from '../core/viewport.js';
import { computeSchematicGeometry } from '../core/schematic.js';
import { computeBundles } from '../core/parallel.js';
import { offsetPolyline, turnSign } from '../core/geometry.js';
import { effectiveSectionAttrs } from '../core/lines.js';
import { createSpatialIndex } from './spatial-index.js';
import { strokeFor, bundleSpacing, inkOf, paperOf, lineAppearance } from './styles.js';
import { layoutLabels } from './labels.js';
import { stationSymbol } from './station-symbol.js';
import { buildLegend, unionBoxes } from './scene-legend.js';
import { mapTranslator } from '../i18n/i18n.js';
import { stationNumbers } from '../core/numbering.js';

/** @typedef {import('../core/schema.js').Project} Project */
/** @typedef {(font: string, text: string) => number} Measure 文字の幅を測る */
/** @typedef {{ x: number, y: number }} Pt */

/**
 * @param {number[]} pts 平らにした座標
 * @param {number} pad
 */
function bboxOfPts(pts, pad) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]);
    maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]);
    maxY = Math.max(maxY, pts[i + 1]);
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/**
 * @param {Project} p
 * @param {{ measure: Measure, level?: number, mapT?: (key: string, vars?: any) => string }} opt level はズームで隠す段階（labels.js の labelLevel）。mapT は地図の言語の文言（凡例・タイトル）
 */
export function buildSchematicScene(p, opt) {
  const style = p.style;
  const geom = computeSchematicGeometry(p);
  const bundles = computeBundles(p.lines, geom);
  const spacing = bundleSpacing(style);
  const lineItems = [];
  /** @type {Map<string, any>} `${lineId}:${index}` → 区間の要素 */
  const sectionItems = new Map();
  /** 駅 ID → 線が通る点と向き（駅記号の形を決める） */
  /** @type {Map<string, { pts: Pt[], dirs: Pt[], lineIds: Set<string> }>} */
  const passes = new Map();
  // 凡例の「記号」に出すもの（実際に描いたものだけ）
  const facts = { lineIds: new Set(), symbols: new Set(), statuses: new Set() };
  const passOf = (id) => {
    let v = passes.get(id);
    if (!v) passes.set(id, (v = { pts: [], dirs: [], lineIds: new Set() }));
    return v;
  };

  // ---------- 区間 ----------
  // 並び順の大きい路線を下に描く。モノクロでは並び順で濃淡と破線を割り当てる
  const lines = [...p.lines].sort((a, b) => b.order - a.order);
  const orderIndex = new Map([...p.lines].sort((a, b) => a.order - b.order).map((l, i) => [l.id, i]));
  for (const line of lines) {
    const gs = geom.get(line.id) || [];
    gs.forEach((g, i) => {
      if (!g) return;
      const slot = bundles.get(`${line.id}:${i}`);
      const d = slot ? slot.offset * spacing : 0;
      const world = g.pts.map((q) => ({ x: q.x * GRID, y: q.y * GRID }));
      const shifted = offsetPolyline(world, d);
      // 同心の角丸：束の中心線の半径を「角の半径＋束の半幅」にして、内側ほど小さくする
      const half = slot ? ((slot.size - 1) / 2) * spacing : 0;
      const baseR = style.cornerRadius + half;
      const radii = shifted.map((_, k) => (k === 0 || k === shifted.length - 1 ? 0 : Math.max(0.5, baseR - d * turnSign(world[k - 1], world[k], world[k + 1]))));

      // 駅記号のために、線が通る点を覚える
      const n = shifted.length;
      const pa = passOf(g.a);
      pa.pts.push(shifted[0]);
      pa.dirs.push({ x: world[1].x - world[0].x, y: world[1].y - world[0].y });
      pa.lineIds.add(line.id);
      const pb = passOf(g.b);
      pb.pts.push(shifted[n - 1]);
      pb.dirs.push({ x: world[n - 1].x - world[n - 2].x, y: world[n - 1].y - world[n - 2].y });
      pb.lineIds.add(line.id);

      const attrs = effectiveSectionAttrs(line, i);
      const s = strokeFor(style, line.kind, attrs.status, line.color, orderIndex.get(line.id));
      if (s.hidden) return;
      facts.lineIds.add(line.id);
      if (attrs.status !== 'open') facts.statuses.add(attrs.status);
      const pts = [];
      for (const q of shifted) pts.push(q.x, q.y);
      const item = {
        kind: 'path',
        pts,
        radius: baseR,
        radii,
        width: s.width,
        color: s.color,
        dash: s.dash,
        alpha: s.alpha,
        inner: s.inner,
        target: { type: 'section', lineId: line.id, index: i },
        bbox: bboxOfPts(pts, s.width / 2),
      };
      lineItems.push(item);
      sectionItems.set(`${line.id}:${i}`, item);
    });
  }

  // ---------- 駅 ----------
  const stationItems = new Map();
  const symbolItems = [];
  const lineColor = new Map(p.lines.map((l) => [l.id, lineAppearance(style, l.color, orderIndex.get(l.id)).color]));
  const orderOf = new Map(p.lines.map((l) => [l.id, l.order]));
  for (const st of p.stations) {
    if (!st.schematic) continue;
    const center = { x: st.schematic.x * GRID, y: st.schematic.y * GRID };
    const pass = passes.get(st.id);
    const ids = pass ? [...pass.lineIds].sort((a, b) => orderOf.get(a) - orderOf.get(b)) : [];
    const stroke = style.stationStroke === 'line' && ids.length ? lineColor.get(ids[0]) : inkOf(style);
    const items = stationSymbol(st, center, pass, ids.length, style, stroke, ids.length ? lineColor.get(ids[0]) : inkOf(style));
    for (const it of items) symbolItems.push(it);
    stationItems.set(st.id, items[0]);
    facts.symbols.add(symbolKind(st, ids.length, pass, style));
  }

  // ---------- 乗換グループの連絡線（§5.2：白地に黒縁の太い線で駅の記号を結ぶ） ----------
  const connectorItems = buildConnectors(p, stationItems, style);
  if (connectorItems.length) facts.symbols.add('connector');

  // ---------- 駅名 ----------
  const operatorOf = new Map(p.operators.map((o) => [o.id, o]));
  const labels = layoutLabels(p, {
    measure: opt.measure,
    level: opt.level ?? 0,
    symbols: stationItems,
    passes,
    obstacles: [...lineItems, ...connectorItems, ...symbolItems],
    // 駅番号のバッジ（表示の設定がオンのとき）。形は事業者の設定、縁は路線の色
    badgesOf: (id) => (style.showNumbering
      ? stationNumbers(p, id).map((n) => ({
        prefix: n.prefix,
        number: n.number,
        color: lineColor.get(n.line.id) || n.line.color,
        shape: operatorOf.get(n.line.operatorId)?.badgeShape || 'roundSquare',
      }))
      : []),
  });
  const labelItems = labels.items;

  // ---------- 凡例とタイトル（地図の外側。当たり判定には入れない） ----------
  // 地図の範囲は、線と駅記号に駅名の分の余白を足したもの（ズームで駅名が隠れても位置が動きにくいように）と、駅名の範囲を合わせる
  const core = unionBoxes([...lineItems, ...connectorItems, ...symbolItems]);
  const pad = style.fontSize * 3;
  const mapBox = core && unionBoxes([
    { bbox: { minX: core.minX - pad, minY: core.minY - pad, maxX: core.maxX + pad, maxY: core.maxY + pad } },
    ...labelItems,
  ]);
  const legend = buildLegend(p, { measure: opt.measure, mapT: opt.mapT || mapTranslator(p.locale.mapLanguage), mapBox, facts, orderIndex });

  const mapItems = [...lineItems, ...connectorItems, ...symbolItems, ...labelItems];
  const index = createSpatialIndex();
  for (const it of mapItems) index.insert(it);
  const items = legend.items.length ? [...mapItems, ...legend.items] : mapItems;
  return { items, index, sectionItems, stationItems, geom, bundles, labelInfo: labels.info, level: opt.level ?? 0, mapBox, legendBounds: legend.bounds };
}

/**
 * 凡例の「記号」の種類（scene-legend.js の SYMBOL_ORDER）
 * @param {import('../core/schema.js').Station} st
 * @param {number} lineCount
 * @param {{ pts: Pt[] } | undefined} pass
 * @param {import('../core/schema.js').MapStyle} style
 */
function symbolKind(st, lineCount, pass, style) {
  if (st.rank === 'signal' || st.rank === 'freight' || st.rank === 'depot') return st.rank;
  const onLine = !!(pass && pass.pts.length);
  if (lineCount >= 2 && onLine) return 'interchange';
  const tick = style.stationSymbol === 'tick' && onLine;
  if (tick && (st.rank === 'normal' || st.rank === 'unstaffed')) return 'tick';
  if (tick && st.rank === 'temporary') return 'temporaryTick';
  // 白丸のスタイルでは主要駅も一般駅と同じ記号
  if (st.rank === 'major') return tick ? 'major' : 'station';
  if (st.rank === 'normal') return 'station';
  return st.rank;
}

/** 駅の記号の中心 */
export function symbolCenter(it) {
  if (it.kind === 'capsule') return { x: (it.x1 + it.x2) / 2, y: (it.y1 + it.y2) / 2 };
  if (it.kind === 'circle' || it.kind === 'rrect') return { x: it.x, y: it.y };
  return { x: (it.bbox.minX + it.bbox.maxX) / 2, y: (it.bbox.minY + it.bbox.maxY) / 2 };
}

/**
 * 乗換グループの連絡線。3駅以上なら、短い順につないで全体を結ぶ（最小全域木）
 * @param {Project} p
 * @param {Map<string, any>} stationItems
 * @param {import('../core/schema.js').MapStyle} style
 */
function buildConnectors(p, stationItems, style) {
  const out = [];
  const inner = Math.max(3, style.stationRadius * 1.1);
  const casing = inner + 3.5;
  for (const ic of p.interchanges) {
    if (!ic.showConnector) continue;
    const pts = ic.stationIds.map((id) => stationItems.get(id)).filter(Boolean).map(symbolCenter);
    if (pts.length < 2) continue;
    // Prim 法：つながった点から最も近い点を順に足す
    const used = [0];
    const edges = [];
    while (used.length < pts.length) {
      let best = null;
      for (const i of used) {
        for (let j = 0; j < pts.length; j++) {
          if (used.includes(j)) continue;
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (!best || d < best.d) best = { i, j, d };
        }
      }
      used.push(best.j);
      edges.push([pts[best.i], pts[best.j]]);
    }
    const target = { type: 'interchange', id: ic.id };
    for (const [a, b] of edges) {
      const bbox = {
        minX: Math.min(a.x, b.x) - casing / 2, minY: Math.min(a.y, b.y) - casing / 2,
        maxX: Math.max(a.x, b.x) + casing / 2, maxY: Math.max(a.y, b.y) + casing / 2,
      };
      out.push({ kind: 'path', pts: [a.x, a.y, b.x, b.y], radius: 0, width: casing, color: inkOf(style), cap: 'round', target, bbox });
      out.push({ kind: 'path', pts: [a.x, a.y, b.x, b.y], radius: 0, width: inner, color: paperOf(style), cap: 'round', bbox });
    }
  }
  return out;
}

/** @typedef {ReturnType<typeof buildSchematicScene>} SchematicScene */
