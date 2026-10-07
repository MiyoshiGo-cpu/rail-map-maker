// 地理ビューに重ねて描くもの：地形（海・陸・湖）、編集の目印（経由点・引いている途中の線・指している所・範囲選択）、
// 画面の座標で描く縮尺バーと方位記号
import { GEO_UNIT } from '../core/viewport.js';
import { mapFont } from '../render/styles.js';
import { LAKE_COLOR, SHORE_COLOR } from '../render/terrain-raster.js';

const OVERLAY_INK = '#1F2933';
const OVERLAY_PAPER = 'rgba(255,255,255,0.85)';
/** 縮尺バーの長さの区切り（1・2・5 × 10 のべき） */
const NICE = [1, 2, 5];
const KM_PER_MILE = 1.609344;

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
 * 地形：海の画像の上に、海岸線の形で切り抜いた陸の画像を重ね、湖を塗って岸に細い線を引く
 * @param {CanvasRenderingContext2D} c 世界座標
 * @param {{ land: HTMLCanvasElement, sea: HTMLCanvasElement, landPath: Path2D, lakePath: Path2D }} tr
 * @param {number} w 地形の幅（世界座標）
 * @param {number} hgt
 * @param {number} zoom
 */
export function drawTerrain(c, tr, w, hgt, zoom) {
  c.imageSmoothingEnabled = true;
  c.drawImage(tr.sea, 0, 0, w, hgt);
  c.save();
  c.clip(tr.landPath, 'evenodd');
  c.drawImage(tr.land, 0, 0, w, hgt);
  c.restore();
  c.fillStyle = LAKE_COLOR;
  c.fill(tr.lakePath, 'evenodd');
  c.strokeStyle = SHORE_COLOR;
  c.lineWidth = 0.8 / zoom;
  c.lineJoin = 'round';
  c.stroke(tr.landPath);
  c.stroke(tr.lakePath);
}

/** 数を短く（0.5・10・200） */
const numText = (n) => String(Math.round(n * 1000) / 1000);

/**
 * 縮尺バー（左下。スマホではシートの上）。長さは 1・2・5 の区切りで、画面で140px 以内
 * @param {CanvasRenderingContext2D} c 画面の座標
 * @param {number} pxPerKm
 * @param {{ width: number, height: number }} size
 * @param {{ bottom: number, left: number }} insets
 * @param {import('../core/schema.js').Project} p
 * @param {(key: string, vars?: any) => string} mapT
 */
export function drawScaleBar(c, pxPerKm, size, insets, p, mapT) {
  const mile = p.locale.distanceUnit === 'mi';
  const pxPerUnit = pxPerKm * (mile ? KM_PER_MILE : 1);
  const maxPx = Math.min(140, size.width * 0.4);
  let best = null;
  for (let e = -2; e <= 4; e++) {
    for (const m of NICE) {
      const n = m * 10 ** e;
      const len = n * pxPerUnit;
      if (len <= maxPx && (!best || len > best.len)) best = { n, len };
    }
  }
  if (!best) return;
  const text = mapT(mile ? 'map.scale.mi' : 'map.scale.km', { n: numText(best.n) });
  const font = mapFont(p.style, 11, 600);
  c.font = font;
  const tw = c.measureText(text).width;
  const x = insets.left + 12;
  const y = size.height - insets.bottom - 14;
  const barH = 5;
  // 地（読みやすいように白い板を敷く）
  c.fillStyle = OVERLAY_PAPER;
  c.beginPath();
  c.roundRect(x - 6, y - 22, Math.max(best.len, tw) + 12, 30, 4);
  c.fill();
  // 半分ずつ黒と白の帯
  const half = best.len / 2;
  c.fillStyle = OVERLAY_INK;
  c.fillRect(x, y - barH, half, barH);
  c.fillStyle = '#FFFFFF';
  c.fillRect(x + half, y - barH, half, barH);
  c.strokeStyle = OVERLAY_INK;
  c.lineWidth = 1;
  c.strokeRect(x + 0.5, y - barH + 0.5, best.len - 1, barH - 1);
  c.fillStyle = OVERLAY_INK;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillText(text, x, y - barH - 4);
}

/**
 * 方位記号（左上）：北を指す矢じりと N
 * @param {CanvasRenderingContext2D} c 画面の座標
 * @param {{ top: number, left: number }} insets
 * @param {import('../core/schema.js').Project} p
 * @param {(key: string, vars?: any) => string} mapT
 */
export function drawNorthArrow(c, insets, p, mapT) {
  const cx = insets.left + 28;
  const cy = insets.top + 32;
  c.fillStyle = OVERLAY_PAPER;
  c.beginPath();
  c.arc(cx, cy, 19, 0, Math.PI * 2);
  c.fill();
  // 矢じり：左半分を塗り、右半分は白
  const top = cy - 5;
  const bottom = cy + 14;
  c.beginPath();
  c.moveTo(cx, top);
  c.lineTo(cx - 6, bottom);
  c.lineTo(cx, bottom - 4);
  c.closePath();
  c.fillStyle = OVERLAY_INK;
  c.fill();
  c.beginPath();
  c.moveTo(cx, top);
  c.lineTo(cx + 6, bottom);
  c.lineTo(cx, bottom - 4);
  c.closePath();
  c.fillStyle = '#FFFFFF';
  c.fill();
  c.strokeStyle = OVERLAY_INK;
  c.lineWidth = 1;
  c.lineJoin = 'round';
  c.stroke();
  c.font = mapFont(p.style, 10, 700);
  c.fillStyle = OVERLAY_INK;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.fillText(mapT('map.north'), cx, top - 2);
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
