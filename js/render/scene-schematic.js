// 路線図ビューの表示リストを作る（DOM に依存しない）。
// 表示リストの要素：path（折れ線・角丸）、circle、capsule、rrect、text。どれも bbox と、当たり判定用の target を持つ。
import { GRID } from '../core/viewport.js';
import { computeSchematicGeometry } from '../core/schematic.js';
import { computeBundles } from '../core/parallel.js';
import { offsetPolyline, turnSign, collinearExtent, boundsOf } from '../core/geometry.js';
import { effectiveSectionAttrs } from '../core/lines.js';
import { createSpatialIndex } from './spatial-index.js';
import { strokeFor, bundleSpacing, mapFont, MAP_INK, MAP_PAPER } from './styles.js';

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
 * @param {{ measure: Measure }} opt
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
  const passOf = (id) => {
    let v = passes.get(id);
    if (!v) passes.set(id, (v = { pts: [], dirs: [], lineIds: new Set() }));
    return v;
  };

  // ---------- 区間 ----------
  // 並び順の大きい路線を下に描く
  const lines = [...p.lines].sort((a, b) => b.order - a.order);
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
      const s = strokeFor(style, line.kind, attrs.status, line.color);
      if (s.hidden) return;
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
  const lineColor = new Map(p.lines.map((l) => [l.id, l.color]));
  const orderOf = new Map(p.lines.map((l) => [l.id, l.order]));
  for (const st of p.stations) {
    if (!st.schematic) continue;
    const center = { x: st.schematic.x * GRID, y: st.schematic.y * GRID };
    const pass = passes.get(st.id);
    const ids = pass ? [...pass.lineIds].sort((a, b) => orderOf.get(a) - orderOf.get(b)) : [];
    const stroke = style.stationStroke === 'line' && ids.length ? lineColor.get(ids[0]) : MAP_INK;
    const items = stationSymbol(st, center, pass, ids.length, style, stroke);
    for (const it of items) symbolItems.push(it);
    stationItems.set(st.id, items[0]);
  }

  // ---------- 駅名（仮：右側に置く。自動配置はステップ11） ----------
  const labelItems = [];
  const fontMain = mapFont(style, style.fontSize, 600);
  const fontTerminal = mapFont(style, style.fontSize * 1.1, 700);
  for (const st of p.stations) {
    const sym = stationItems.get(st.id);
    if (!sym || !st.name || (st.label.schematic && st.label.schematic.hidden) || st.rank === 'signal') continue;
    const font = st.rank === 'terminal' ? fontTerminal : fontMain;
    const x = sym.bbox.maxX + 4;
    const y = (sym.bbox.minY + sym.bbox.maxY) / 2;
    const w = opt.measure(font, st.name);
    const hgt = style.fontSize * 1.2;
    labelItems.push({
      kind: 'text',
      x,
      y,
      text: st.name,
      font,
      color: MAP_INK,
      align: 'left',
      halo: MAP_PAPER,
      target: { type: 'label', id: st.id },
      bbox: { minX: x, minY: y - hgt / 2, maxX: x + w, maxY: y + hgt / 2 },
    });
  }

  const items = [...lineItems, ...symbolItems, ...labelItems];
  const index = createSpatialIndex();
  for (const it of items) index.insert(it);
  return { items, index, sectionItems, stationItems, geom, bundles };
}

/**
 * 駅の記号（§5.2）。最初の要素が駅そのもの（選択の輪を合わせる）
 * @param {import('../core/schema.js').Station} st
 * @param {Pt} center
 * @param {{ pts: Pt[], dirs: Pt[] } | undefined} pass
 * @param {number} lineCount
 * @param {import('../core/schema.js').MapStyle} style
 * @param {string} stroke
 * @returns {any[]}
 */
function stationSymbol(st, center, pass, lineCount, style, stroke) {
  const target = { type: 'station', id: st.id };
  const base = style.stationRadius;
  const sw = 2; // 縁の太さ
  const circle = (c, r, extra = {}) => ({
    kind: 'circle', x: c.x, y: c.y, r, fill: MAP_PAPER, stroke, lineWidth: sw, target,
    bbox: { minX: c.x - r - sw, minY: c.y - r - sw, maxX: c.x + r + sw, maxY: c.y + r + sw },
    ...extra,
  });
  const pts = pass ? pass.pts : [];
  const dir = pass && pass.dirs.length ? pass.dirs[0] : { x: 1, y: 0 };
  const dlen = Math.hypot(dir.x, dir.y) || 1;
  const along = { x: dir.x / dlen, y: dir.y / dlen };
  const across = { x: -along.y, y: along.x };

  switch (st.rank) {
    case 'signal': {
      // 線に直交する短い線
      const L = base + 3;
      const c = pts[0] || center;
      return [{
        kind: 'path', pts: [c.x - across.x * L, c.y - across.y * L, c.x + across.x * L, c.y + across.y * L],
        radius: 0, width: 2.5, color: stroke, cap: 'butt', target,
        bbox: { minX: c.x - L - 2, minY: c.y - L - 2, maxX: c.x + L + 2, maxY: c.y + L + 2 },
      }];
    }
    case 'freight': {
      const s = base * 1.8;
      const c = pts[0] || center;
      return [{
        kind: 'rrect', x: c.x, y: c.y, w: s, h: s, r: 1, fill: MAP_PAPER, stroke, lineWidth: sw, target,
        bbox: { minX: c.x - s / 2 - sw, minY: c.y - s / 2 - sw, maxX: c.x + s / 2 + sw, maxY: c.y + s / 2 + sw },
      }];
    }
    case 'depot': {
      // 本線の脇の小さな四角と短い引込線
      const c = pts[0] || center;
      const off = base * 2.6;
      const q = { x: c.x + across.x * off, y: c.y + across.y * off };
      const s = base * 1.4;
      return [
        {
          kind: 'rrect', x: q.x, y: q.y, w: s, h: s, r: 1, fill: MAP_PAPER, stroke, lineWidth: sw, target,
          bbox: { minX: Math.min(c.x, q.x) - s, minY: Math.min(c.y, q.y) - s, maxX: Math.max(c.x, q.x) + s, maxY: Math.max(c.y, q.y) + s },
        },
        {
          kind: 'path', pts: [c.x, c.y, q.x, q.y], radius: 0, width: 1.5, color: stroke, cap: 'butt',
          bbox: { minX: Math.min(c.x, q.x) - 1, minY: Math.min(c.y, q.y) - 1, maxX: Math.max(c.x, q.x) + 1, maxY: Math.max(c.y, q.y) + 1 },
        },
      ];
    }
    default:
      break;
  }

  let r = base;
  if (st.rank === 'terminal') r = base * 1.4;
  else if (st.rank === 'unstaffed') r = base * 0.75;
  const dash = st.rank === 'temporary' ? [2.5, 2] : null;

  if (lineCount >= 2 && pts.length) {
    // 複数の路線が通る駅：線が通る点をすべて覆う白いカプセル（一直線に並ばなければ角丸四角）
    const rc = Math.max(r, style.lineWidth / 2 + sw + 1);
    const ext = collinearExtent(pts);
    if (ext) {
      if (ext.a.x === ext.b.x && ext.a.y === ext.b.y) return [circle(ext.a, rc + 1, { dash })];
      return [{
        kind: 'capsule', x1: ext.a.x, y1: ext.a.y, x2: ext.b.x, y2: ext.b.y, r: rc,
        fill: MAP_PAPER, stroke, lineWidth: sw, dash, target,
        bbox: {
          minX: Math.min(ext.a.x, ext.b.x) - rc - sw, minY: Math.min(ext.a.y, ext.b.y) - rc - sw,
          maxX: Math.max(ext.a.x, ext.b.x) + rc + sw, maxY: Math.max(ext.a.y, ext.b.y) + rc + sw,
        },
      }];
    }
    const b = boundsOf(pts);
    const w = b.maxX - b.minX + rc * 2;
    const hgt = b.maxY - b.minY + rc * 2;
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    return [{
      kind: 'rrect', x: c.x, y: c.y, w, h: hgt, r: rc, fill: MAP_PAPER, stroke, lineWidth: sw, dash, target,
      bbox: { minX: c.x - w / 2 - sw, minY: c.y - hgt / 2 - sw, maxX: c.x + w / 2 + sw, maxY: c.y + hgt / 2 + sw },
    }];
  }
  return [circle(pts[0] || center, r, { dash })];
}

/** @typedef {ReturnType<typeof buildSchematicScene>} SchematicScene */
