// 路線図ビューの表示リストを作る（DOM に依存しない）。
// 表示リストの要素：path（折れ線・角丸）、circle、capsule、rrect、text。どれも bbox と、当たり判定用の target を持つ。
import { GRID } from '../core/viewport.js';
import { computeSchematicGeometry } from '../core/schematic.js';
import { effectiveSectionAttrs } from '../core/lines.js';
import { createSpatialIndex } from './spatial-index.js';
import { strokeFor, mapFont, MAP_INK, MAP_PAPER } from './styles.js';

/** @typedef {import('../core/schema.js').Project} Project */
/** @typedef {(font: string, text: string) => number} Measure 文字の幅を測る */

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
  const items = [];
  /** @type {Map<string, any>} `${lineId}:${index}` → 区間の要素 */
  const sectionItems = new Map();
  /** @type {Map<string, any>} 駅 ID → 駅記号の要素 */
  const stationItems = new Map();

  // 区間（並び順の大きい路線を下に描く）
  const lines = [...p.lines].sort((a, b) => b.order - a.order);
  for (const line of lines) {
    const gs = geom.get(line.id) || [];
    gs.forEach((g, i) => {
      if (!g) return;
      const attrs = effectiveSectionAttrs(line, i);
      const s = strokeFor(style, line.kind, attrs.status, line.color);
      if (s.hidden) return;
      const pts = [];
      for (const q of g.pts) pts.push(q.x * GRID, q.y * GRID);
      const item = {
        kind: 'path',
        pts,
        radius: style.cornerRadius,
        width: s.width,
        color: s.color,
        dash: s.dash,
        alpha: s.alpha,
        inner: s.inner,
        target: { type: 'section', lineId: line.id, index: i },
        bbox: bboxOfPts(pts, s.width / 2),
      };
      items.push(item);
      sectionItems.set(`${line.id}:${i}`, item);
    });
  }

  // 駅
  const r = style.stationRadius;
  for (const st of p.stations) {
    if (!st.schematic) continue;
    const x = st.schematic.x * GRID;
    const y = st.schematic.y * GRID;
    const item = {
      kind: 'circle',
      x,
      y,
      r,
      fill: MAP_PAPER,
      stroke: MAP_INK,
      lineWidth: 2,
      target: { type: 'station', id: st.id },
      bbox: { minX: x - r - 1, minY: y - r - 1, maxX: x + r + 1, maxY: y + r + 1 },
    };
    items.push(item);
    stationItems.set(st.id, item);
  }

  // 駅名（仮：右側に置く。自動配置はステップ11）
  const fontMain = mapFont(style, style.fontSize, 600);
  for (const st of p.stations) {
    if (!st.schematic || !st.name || (st.label.schematic && st.label.schematic.hidden)) continue;
    const x = st.schematic.x * GRID + r + 5;
    const y = st.schematic.y * GRID;
    const w = opt.measure(fontMain, st.name);
    const hgt = style.fontSize * 1.2;
    items.push({
      kind: 'text',
      x,
      y,
      text: st.name,
      font: fontMain,
      color: MAP_INK,
      align: 'left',
      halo: MAP_PAPER,
      target: { type: 'label', id: st.id },
      bbox: { minX: x, minY: y - hgt / 2, maxX: x + w, maxY: y + hgt / 2 },
    });
  }

  const index = createSpatialIndex();
  for (const it of items) index.insert(it);
  return { items, index, sectionItems, stationItems, geom };
}

/** @typedef {ReturnType<typeof buildSchematicScene>} SchematicScene */
