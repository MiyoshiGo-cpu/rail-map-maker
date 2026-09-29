// 印刷（§5.9）：今表示しているビューの SVG をページに入れ、印刷用の CSS（css/export.css）で用紙に収める。
// 用紙は A4・A3（横が既定）。印刷が終わったら（afterprint）取り除く。
import { renderSvg } from '../render/backend-svg.js';
import { EXPORT_MARGIN } from '../core/export-size.js';

/** 用紙の大きさ（横向きの mm） */
export const PAPERS = { a4: { w: 297, h: 210 }, a3: { w: 420, h: 297 } };
export const PRINT_MARGIN_MM = 10;

/**
 * 印刷する中身をページに入れる（印刷の画面を開く前の準備。確認用に単独でも呼べる）
 * @param {import('./exporter.js').ExportTarget} target
 * @param {{ paper?: 'a4'|'a3', orientation?: 'landscape'|'portrait', title?: string }} opt
 */
export function preparePrint(target, opt = {}) {
  cleanupPrint();
  const size = PAPERS[opt.paper || 'a4'] || PAPERS.a4;
  const [w, h] = opt.orientation === 'portrait' ? [size.h, size.w] : [size.w, size.h];
  const svg = renderSvg(target.items, { bounds: target.bounds, margin: EXPORT_MARGIN, background: target.background, title: opt.title });
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = document.createElement('div');
  root.className = 'print-root';
  root.style.setProperty('--print-w', `${w - PRINT_MARGIN_MM * 2}mm`);
  root.style.setProperty('--print-h', `${h - PRINT_MARGIN_MM * 2}mm`);
  root.append(document.importNode(doc.documentElement, true));
  const page = document.createElement('style');
  page.id = 'print-page';
  page.textContent = `@page { size: ${w}mm ${h}mm; margin: ${PRINT_MARGIN_MM}mm; }`;
  document.head.append(page);
  document.body.append(root);
  document.documentElement.classList.add('is-printing');
}

/** 印刷の中身を取り除く */
export function cleanupPrint() {
  const page = document.getElementById('print-page');
  if (page) page.remove();
  for (const el of document.querySelectorAll('.print-root')) el.remove();
  document.documentElement.classList.remove('is-printing');
}

/**
 * 印刷の画面を開く
 * @param {import('./exporter.js').ExportTarget} target
 * @param {{ paper?: 'a4'|'a3', orientation?: 'landscape'|'portrait', title?: string }} opt
 */
export function printTarget(target, opt) {
  preparePrint(target, opt);
  window.addEventListener('afterprint', cleanupPrint, { once: true });
  window.print();
}
