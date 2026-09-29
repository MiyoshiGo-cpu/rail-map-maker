// 操作の目印：選択の強調、路線を引いているときの端と予告線、指している格子点
import { GRID } from '../core/viewport.js';
import { connect, isOctilinear } from '../core/octilinear.js';
import { tracePath } from '../render/backend-canvas.js';

/**
 * 表示リストの下に描く目印（選んだ路線・区間の縁）
 * @param {CanvasRenderingContext2D} ctx 世界座標の変換を設定済み
 * @param {{
 *   project: import('../core/schema.js').Project,
 *   scene: import('../render/scene-schematic.js').SchematicScene,
 *   es: import('./editor-state.js').EditorState,
 *   zoom: number,
 *   accent: string,
 * }} o
 */
export function drawUnderlay(ctx, o) {
  const { scene, es, zoom, accent } = o;
  const px = (n) => n / zoom;
  const sel = es.selection;
  // 路線・区間の強調（線の外側にアクセント色の縁。駅や線の下に描く）
  const hl = (item) => {
    ctx.beginPath();
    tracePath(ctx, item.pts, item.radius, item.radii);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = item.width + px(10);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  if (sel.type === 'line' || sel.type === 'section') {
    for (const [k, item] of scene.sectionItems) {
      const [lineId, idx] = k.split(':');
      if (lineId !== sel.lineId) continue;
      if (sel.type === 'section' && Number(idx) !== sel.index) continue;
      hl(item);
    }
  }
}

/**
 * 表示リストの上に描く目印
 * @param {CanvasRenderingContext2D} ctx
 * @param {Parameters<typeof drawUnderlay>[1]} o
 */
export function drawOverlay(ctx, o) {
  const { project: p, scene, es, zoom, accent } = o;
  const px = (n) => n / zoom; // 画面の px を世界座標にする
  const sel = es.selection;

  // 駅の選択（アクセント色の輪）
  const ring = (id, color) => {
    const st = scene.stationItems.get(id);
    if (!st) return;
    ctx.beginPath();
    if (st.kind === 'capsule') {
      const r = st.r + px(4);
      const len = Math.hypot(st.x2 - st.x1, st.y2 - st.y1);
      const ang = Math.atan2(st.y2 - st.y1, st.x2 - st.x1);
      ctx.save();
      ctx.translate(st.x1, st.y1);
      ctx.rotate(ang);
      ctx.roundRect(-r, -r, len + r * 2, r * 2, r);
      ctx.restore();
    } else if (st.kind === 'rrect') {
      const m = px(4);
      ctx.save();
      ctx.translate(st.x, st.y);
      ctx.roundRect(-st.w / 2 - m, -st.h / 2 - m, st.w + m * 2, st.h + m * 2, (st.r || 0) + m);
      ctx.restore();
    } else if (st.kind === 'circle') {
      ctx.arc(st.x, st.y, st.r + px(4), 0, Math.PI * 2);
    } else {
      const b = st.bbox;
      ctx.arc((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2 + px(3), 0, Math.PI * 2);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = px(3);
    ctx.stroke();
  };
  if (sel.type === 'stations') for (const id of sel.ids) ring(id, accent);
  // 乗換グループ：所属する駅に輪を付ける
  if (sel.type === 'interchange') {
    const ic = p.interchanges.find((x) => x.id === sel.id);
    if (ic) for (const id of ic.stationIds) ring(id, accent);
  }
  // 乗換グループにする駅を選んでいる途中：元の駅
  if (es.pending) {
    const ids = es.pending.stationId ? [es.pending.stationId]
      : (p.interchanges.find((x) => x.id === es.pending.interchangeId)?.stationIds || []);
    for (const id of ids) ring(id, accent);
  }

  // 路線を引いている途中：端の駅と、指している点までの予告線
  if (es.tool === 'line' && es.drawing) {
    const line = p.lines.find((l) => l.id === es.drawing.lineId);
    if (line && line.stops.length) {
      const endId = es.drawing.atStart ? line.stops[0].stationId : line.stops[line.stops.length - 1].stationId;
      const st = p.stations.find((s) => s.id === endId);
      ring(endId, line.color);
      if (st && st.schematic && es.hover && (es.hover.x !== st.schematic.x || es.hover.y !== st.schematic.y)) {
        const a = st.schematic;
        const b = es.hover;
        const pts = isOctilinear(b.x - a.x, b.y - a.y) ? [a, b] : connect(a, b, 'diagonalFirst');
        ctx.beginPath();
        tracePath(ctx, pts.flatMap((q) => [q.x * GRID, q.y * GRID]), p.style.cornerRadius);
        ctx.setLineDash([px(6), px(5)]);
        ctx.strokeStyle = line.color;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = p.style.lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }
  }

  // 選んだ区間の経由点（ドラッグで動かせる四角）
  if (sel.type === 'section') {
    const line = p.lines.find((l) => l.id === sel.lineId);
    const via = line && line.sections[sel.index] && line.sections[sel.index].schematicVia;
    if (via) {
      const s = px(10);
      for (const v of via) {
        ctx.beginPath();
        ctx.rect(v.x * GRID - s / 2, v.y * GRID - s / 2, s, s);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = px(2.5);
        ctx.stroke();
      }
    }
  }

  // 範囲選択の四角
  if (es.marquee) {
    const m = es.marquee;
    ctx.beginPath();
    ctx.rect(Math.min(m.x0, m.x1), Math.min(m.y0, m.y1), Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.08;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash([px(4), px(3)]);
    ctx.strokeStyle = accent;
    ctx.lineWidth = px(1.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 駅を置く・路線を引くツールで、指している格子点
  if ((es.tool === 'station' || es.tool === 'line') && es.hover) {
    ctx.beginPath();
    ctx.arc(es.hover.x * GRID, es.hover.y * GRID, p.style.stationRadius, 0, Math.PI * 2);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = px(2);
    ctx.setLineDash([px(3), px(3)]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}
