// 地理ビューの描画の道具：地形の画像と海岸線の Path2D を作る、地形の表示リストの要素、
// 編集の目印（経由点・引いている途中の線・指している所・範囲選択）
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
