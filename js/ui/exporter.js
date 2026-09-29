// 書き出しの中身（§5.9）：今表示しているビューの絵（表示リストと範囲）を作り、PNG か SVG にする。
// 書き出す絵には格子を入れず、駅名はズームに関係なくすべて出す。作業用の canvas は使い終えたら解放する。
import { buildSchematicScene } from '../render/scene-schematic.js';
import { unionBoxes } from '../render/scene-legend.js';
import { drawItems, createMeasure } from '../render/backend-canvas.js';
import { renderSvg } from '../render/backend-svg.js';
import { exportSize, EXPORT_MARGIN } from '../core/export-size.js';
import { mapTranslator } from '../i18n/i18n.js';

/**
 * 書き出す絵
 * @typedef {object} ExportTarget
 * @property {'schematic'|'stopChart'|'signboard'} view
 * @property {any[]} items 表示リスト
 * @property {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 * @property {string} background
 */

let measure = null;

/**
 * 今表示しているビューの絵（書き出すものが無ければ null）
 * @param {import('../core/schema.js').Project} p
 * @param {'schematic'|'stopChart'|'signboard'} view
 * @param {any} [viewScene] 案内図・駅名標のビューが表示している表示リスト
 * @returns {ExportTarget | null}
 */
export function exportTarget(p, view, viewScene) {
  if (view !== 'schematic') {
    if (!viewScene || !viewScene.items.length) return null;
    return { view, items: viewScene.items, bounds: viewScene.bounds, background: p.style.background };
  }
  if (!measure) measure = createMeasure();
  const scene = buildSchematicScene(p, { measure, level: 0, mapT: mapTranslator(p.locale.mapLanguage) });
  const bounds = unionBoxes(scene.items);
  if (!bounds) return null;
  return { view: 'schematic', items: scene.items, bounds, background: p.style.background };
}

/**
 * PNG にする
 * @param {ExportTarget} target
 * @param {{ scale: number, transparent: boolean }} opt
 * @returns {Promise<Blob>}
 */
export async function renderPng(target, opt) {
  const size = exportSize(target.bounds, opt.scale);
  const canvas = document.createElement('canvas');
  try {
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    if (!opt.transparent) {
      ctx.fillStyle = target.background;
      ctx.fillRect(0, 0, size.width, size.height);
    }
    const s = opt.scale;
    ctx.setTransform(s, 0, 0, s, (EXPORT_MARGIN - target.bounds.minX) * s, (EXPORT_MARGIN - target.bounds.minY) * s);
    drawItems(ctx, target.items, null);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });
  } finally {
    // iPhone では canvas の画素が残ると次の書き出しで上限を超えるので、すぐに解放する
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * SVG にする（大きさの上限はない）
 * @param {ExportTarget} target
 * @param {{ transparent: boolean, title?: string }} opt
 * @returns {Blob}
 */
export function renderSvgBlob(target, opt) {
  const text = renderSvg(target.items, { bounds: target.bounds, margin: EXPORT_MARGIN, background: target.background, transparent: opt.transparent, title: opt.title });
  return new Blob([text], { type: 'image/svg+xml' });
}
