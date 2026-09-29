// 路線図で系統を選んだときの強調（§7 フェーズ2）：ほかを薄くし、経路を強調して、停車駅に印を付ける（通過駅は薄いまま）
import { drawItems, tracePath } from '../render/backend-canvas.js';
import { expandService, stopFlags } from '../core/services.js';

/** 経路と停車駅の位置の計算は、プロジェクトと系統が変わったときだけ */
let cache = { project: null, serviceId: '', path: null, flags: null };

/**
 * @param {CanvasRenderingContext2D} ctx 世界座標の変換を設定済み
 * @param {{
 *   project: import('../core/schema.js').Project,
 *   scene: import('../render/scene-schematic.js').SchematicScene,
 *   zoom: number,
 *   accent: string,
 *   serviceId: string,
 *   visible: { minX: number, minY: number, maxX: number, maxY: number },
 * }} o
 */
export function drawServiceHighlight(ctx, o) {
  const { project: p, scene, zoom, accent, visible } = o;
  const sv = p.services.find((x) => x.id === o.serviceId);
  if (!sv) return;
  if (cache.project !== p || cache.serviceId !== sv.id) {
    const path = expandService(p, sv);
    cache = { project: p, serviceId: sv.id, path, flags: stopFlags(p, sv, path) };
  }
  const { path, flags } = cache;
  const px = (n) => n / zoom;

  // ほかを薄くする（背景の色で覆う）
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = p.style.background;
  ctx.fillRect(visible.minX, visible.minY, visible.maxX - visible.minX, visible.maxY - visible.minY);
  ctx.restore();

  // 経路の駅間：外側に系統の色の縁を付けてから、線をもう一度描く
  const items = [];
  const seen = new Set();
  for (const hop of path.hops) {
    if (!hop) continue;
    const key = `${hop.lineId}:${hop.section}`;
    const item = scene.sectionItems.get(key);
    if (!item || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  for (const item of items) {
    ctx.beginPath();
    tracePath(ctx, item.pts, item.radius, item.radii);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = item.width + px(10);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawItems(ctx, items, visible);

  // 停車駅：駅の記号と駅名を濃く描き直し、経路の線の上に印を付ける
  const stopIds = new Set(path.stations.filter((_, k) => flags[k]));
  const again = [];
  for (const id of stopIds) {
    const sym = scene.stationItems.get(id);
    if (sym) again.push(sym);
  }
  for (const it of scene.items) {
    if (it.target && it.target.type === 'label' && stopIds.has(it.target.id)) again.push(it);
  }
  drawItems(ctx, again, visible);

  const r = p.style.stationRadius + 1;
  path.stations.forEach((id, k) => {
    if (!flags[k]) return;
    const at = pointOnRoute(scene, path, k);
    if (!at) return;
    ctx.beginPath();
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = Math.max(px(2), p.style.lineWidth * 0.45);
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(at.x, at.y, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  });
}

/**
 * 経路の位置 k の駅で、経路の線が通る点（並走でずらした線の上）
 * @param {any} scene
 * @param {ReturnType<typeof expandService>} path
 * @param {number} k
 */
function pointOnRoute(scene, path, k) {
  const out = path.hops[k] && scene.sectionItems.get(`${path.hops[k].lineId}:${path.hops[k].section}`);
  const inn = k > 0 && path.hops[k - 1] && scene.sectionItems.get(`${path.hops[k - 1].lineId}:${path.hops[k - 1].section}`);
  // 駅間の要素の点は、駅間の向き（stops の順）に並んでいる
  const id = path.stations[k];
  const endOf = (item) => {
    if (!item) return null;
    const g = item.target;
    const n = item.pts.length;
    const first = { x: item.pts[0], y: item.pts[1] };
    const last = { x: item.pts[n - 2], y: item.pts[n - 1] };
    const geom = scene.geom.get(g.lineId)?.[g.index];
    if (!geom) return first;
    return geom.a === id ? first : last;
  };
  return endOf(out) || endOf(inn);
}
