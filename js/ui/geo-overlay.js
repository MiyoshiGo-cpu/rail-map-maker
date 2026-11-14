// 地理ビューの描画の道具：地形の画像と海岸線の Path2D を作る、地形の表示リストの要素、
// 編集の目印（経由点・引いている途中の線・指している所・範囲選択・選んだ都市）と、地形ブラシの下書き
import { GEO_UNIT } from '../core/viewport.js';
import { LAKE_COLOR, SHORE_COLOR } from '../render/terrain-raster.js';

/**
 * 画素の配列を canvas に描く
 * @param {Uint8ClampedArray} rgba
 * @param {number} width
 * @param {number} height
 */
export function makeImage(rgba, width, height) {
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const c = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  c.putImageData(new ImageData(rgba, width, height), 0, 0);
  return cv;
}

/**
 * 輪（km の x, y の並び）を世界座標の Path2D にする
 * @param {number[][]} rings
 */
export function ringsPath(rings) {
  const path = new Path2D();
  for (const r of rings) {
    path.moveTo(r[0] * GEO_UNIT, r[1] * GEO_UNIT);
    for (let i = 2; i < r.length; i += 2) path.lineTo(r[i] * GEO_UNIT, r[i + 1] * GEO_UNIT);
    path.closePath();
  }
  return path;
}

/**
 * 地形の表示リストの要素（backend-canvas と backend-svg の terrain）。SVG に入れる画像の data URI は、使うときに1回だけ作る
 * @param {{ width: number, height: number, cellKm: number, outlines: { land: number[][], lakes: number[][] } }} base
 * @param {{ land: HTMLCanvasElement, sea: HTMLCanvasElement, landPath: Path2D, lakePath: Path2D }} tr
 * @returns {(shoreWidth: number) => any} 岸の線の太さ（世界座標）を渡すと要素を返す
 */
export function terrainItemMaker(base, tr) {
  const w = base.width * base.cellKm * GEO_UNIT;
  const h = base.height * base.cellKm * GEO_UNIT;
  const toWorld = (rings) => rings.map((r) => r.map((v) => v * GEO_UNIT));
  const landRings = toWorld(base.outlines.land);
  const lakeRings = toWorld(base.outlines.lakes);
  let hrefs = null;
  const href = (k) => {
    if (!hrefs) hrefs = { sea: tr.sea.toDataURL('image/png'), land: tr.land.toDataURL('image/png') };
    return hrefs[k];
  };
  return (shoreWidth) => ({
    kind: 'terrain',
    x: 0,
    y: 0,
    w,
    h,
    sea: tr.sea,
    land: tr.land,
    landPath: tr.landPath,
    lakePath: tr.lakePath,
    landRings,
    lakeRings,
    lakeColor: LAKE_COLOR,
    shoreColor: SHORE_COLOR,
    shoreWidth,
    get seaHref() { return href('sea'); },
    get landHref() { return href('land'); },
    bbox: { minX: 0, minY: 0, maxX: w, maxY: h },
  });
}

/**
 * 編集の目印（世界座標）：選んだ区間の経由点、路線を引いている途中の端の駅から指している所までの線、
 * 駅を置く・路線を引くツールで指している所、範囲選択の四角
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   project: import('../core/schema.js').Project,
 *   es: import('./editor-state.js').EditorState,
 *   zoom: number,
 *   accent: string,
 *   ring: (stationId: string, color: string) => void,
 * }} o es.hover は地理座標（km）
 */
export function drawGeoEditOverlay(ctx, o) {
  const { project: p, es, zoom, accent } = o;
  const px = (n) => n / zoom;
  const sel = es.selection;
  if (sel.type === 'section') {
    const line = p.lines.find((l) => l.id === sel.lineId);
    const via = line && line.sections[sel.index] && line.sections[sel.index].geoVia;
    if (via) {
      const s = px(10);
      for (const v of via) {
        if (!('x' in v)) continue;
        ctx.beginPath();
        ctx.rect(v.x * GEO_UNIT - s / 2, v.y * GEO_UNIT - s / 2, s, s);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = px(2.5);
        ctx.stroke();
      }
    }
  }
  const hover = es.hover;
  if (es.tool === 'line' && es.drawing) {
    const line = p.lines.find((l) => l.id === es.drawing.lineId);
    if (line && line.stops.length) {
      const endId = es.drawing.atStart ? line.stops[0].stationId : line.stops[line.stops.length - 1].stationId;
      o.ring(endId, line.color);
      const st = p.stations.find((s) => s.id === endId);
      if (st && st.geo && 'x' in st.geo && hover) {
        ctx.beginPath();
        ctx.moveTo(st.geo.x * GEO_UNIT, st.geo.y * GEO_UNIT);
        ctx.lineTo(hover.x * GEO_UNIT, hover.y * GEO_UNIT);
        ctx.setLineDash([px(6), px(5)]);
        ctx.strokeStyle = line.color;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = px(3);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }
  }
  if ((es.tool === 'station' || es.tool === 'line') && hover) {
    ctx.beginPath();
    ctx.arc(hover.x * GEO_UNIT, hover.y * GEO_UNIT, px(5), 0, Math.PI * 2);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = px(2);
    ctx.setLineDash([px(3), px(3)]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
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
}

/** 地形ブラシの下書きの色（種類ごと） */
const BRUSH_COLORS = {
  raise: '#A0522D',
  lower: '#5B4B8A',
  flatten: '#C29A2E',
  smooth: '#4E9A6B',
  land: '#3E8E3E',
  sea: '#1F6FB8',
  river: '#1E88E5',
  city: '#C0392B',
};
/** 川の下書きの太さ（画面の px） */
const RIVER_PREVIEW_PX = 4;

/**
 * 地形ブラシの下書き：塗った範囲を半透明の帯で、マウスの位置にブラシの円を描く（世界座標の変換のまま）
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ strokes: Array<{ tool: string, r: number, pts: number[] }>, hover: { x: number, y: number } | null, brush: { tool: string, size: number } }} pv
 * @param {number} zoom
 */
export function drawBrushPreview(ctx, pv, zoom) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of pv.strokes) {
    const river = s.tool === 'river';
    const w = river ? RIVER_PREVIEW_PX / zoom : s.r * 2 * GEO_UNIT;
    ctx.globalAlpha = river ? 0.85 : 0.3;
    ctx.strokeStyle = BRUSH_COLORS[s.tool] || '#888';
    ctx.fillStyle = ctx.strokeStyle;
    if (s.pts.length === 2) {
      ctx.beginPath();
      ctx.arc(s.pts[0] * GEO_UNIT, s.pts[1] * GEO_UNIT, w / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let i = 0; i < s.pts.length; i += 2) {
      const x = s.pts[i] * GEO_UNIT;
      const y = s.pts[i + 1] * GEO_UNIT;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // ブラシの円（都市と川は小さな十字）
  if (pv.hover) {
    const { x, y } = pv.hover;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeStyle = '#1F2933';
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    ctx.beginPath();
    if (pv.brush.tool === 'city' || pv.brush.tool === 'river') {
      const a = 8 / zoom;
      ctx.setLineDash([]);
      ctx.moveTo(x - a, y);
      ctx.lineTo(x + a, y);
      ctx.moveTo(x, y - a);
      ctx.lineTo(x, y + a);
    } else {
      ctx.arc(x, y, pv.brush.size * GEO_UNIT, 0, Math.PI * 2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 選んでいる都市の印（点のまわりの輪）
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../core/schema.js').Project} p
 * @param {any} sel
 * @param {number} zoom
 * @param {string} color
 */
export function drawCityRing(ctx, p, sel, zoom, color) {
  if (sel.type !== 'city' || p.world.mode !== 'fictional') return;
  const c = p.world.cities.find((x) => x.id === sel.id);
  if (!c) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 / zoom;
  ctx.beginPath();
  ctx.arc(c.pos.x * GEO_UNIT, c.pos.y * GEO_UNIT, 11 / zoom, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
