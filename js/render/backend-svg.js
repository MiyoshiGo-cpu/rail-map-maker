// SVG の書き出し（§5.9）：表示リストから SVG の文字列を作る（DOM に依存しない）。
// Canvas の描画（backend-canvas.js）と同じ見た目にする。文字は text 要素のまま残し（ほかのソフトで編集できるように）、
// フォントは埋め込まずに書体名だけを書く。
import { pictogramSvg } from './pictograms.js';
import { MAP_INK } from './styles.js';

/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Box */

/** 数は小数2桁まで */
export function num(v) {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

/** XML の特別な文字を置き換える */
export function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** 属性の並び（値が無いものは書かない） */
function attrs(o) {
  let s = '';
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    s += ` ${k}="${typeof v === 'number' ? num(v) : escapeXml(v)}"`;
  }
  return s;
}

const deg = (rad) => (rad * 180) / Math.PI;
const dashOf = (dash) => (dash && dash.length ? dash.map(num).join(' ') : undefined);
const opacityOf = (a) => (a === undefined || a === 1 ? undefined : a);

/**
 * 角を丸めた折れ線の d 属性（backend-canvas.js の tracePath と同じ丸め方。arcTo を円弧にする）
 * @param {number[]} pts
 * @param {number} radius
 * @param {number[]} [radii]
 */
export function pathData(pts, radius, radii) {
  const n = pts.length / 2;
  let d = `M${num(pts[0])} ${num(pts[1])}`;
  for (let i = 1; i < n - 1; i++) {
    const px = pts[2 * i - 2], py = pts[2 * i - 1];
    const cx = pts[2 * i], cy = pts[2 * i + 1];
    const nx = pts[2 * i + 2], ny = pts[2 * i + 3];
    const r0 = radii ? radii[i] : radius;
    const l1 = Math.hypot(cx - px, cy - py);
    const l2 = Math.hypot(nx - cx, ny - cy);
    let th = Math.abs(Math.atan2(ny - cy, nx - cx) - Math.atan2(cy - py, cx - px));
    if (th > Math.PI) th = 2 * Math.PI - th;
    if (!r0 || th < 1e-6 || l1 < 1e-6 || l2 < 1e-6 || Math.PI - th < 1e-6) {
      d += `L${num(cx)} ${num(cy)}`;
      continue;
    }
    const r = Math.min(r0, Math.min(l1, l2) / 2 / Math.tan(th / 2));
    // 角から接点までの長さ（曲がる角度が th のとき r・tan(th/2)）
    const t = r * Math.tan(th / 2);
    const ax = cx - ((cx - px) / l1) * t, ay = cy - ((cy - py) / l1) * t;
    const bx = cx + ((nx - cx) / l2) * t, by = cy + ((ny - cy) / l2) * t;
    const sweep = (cx - px) * (ny - cy) - (cy - py) * (nx - cx) > 0 ? 1 : 0;
    d += `L${num(ax)} ${num(ay)}A${num(r)} ${num(r)} 0 0 ${sweep} ${num(bx)} ${num(by)}`;
  }
  d += `L${num(pts[2 * n - 2])} ${num(pts[2 * n - 1])}`;
  return d;
}

/**
 * Canvas の font（例：700 24px "Hiragino Sans", sans-serif）を SVG の属性にする
 * @param {string} font
 */
export function parseFont(font) {
  const m = /^(\S+)\s+([\d.]+)px\s+(.*)$/.exec(font || '');
  if (!m) return { 'font-weight': '400', 'font-size': 12, 'font-family': 'sans-serif' };
  return { 'font-weight': m[1], 'font-size': Number(m[2]), 'font-family': m[3].replace(/"/g, "'") };
}

const ANCHOR = { left: 'start', start: 'start', center: 'middle', right: 'end', end: 'end' };
const BASELINE = { middle: 'central', top: 'hanging', hanging: 'hanging', bottom: 'text-after-edge', alphabetic: 'alphabetic' };

/** 1つの文字列。halo があれば縁取り（paint-order で縁取りを下に） */
function textEl(o) {
  const tr = `translate(${num(o.x)} ${num(o.y)})${o.rot ? ` rotate(${num(deg(o.rot))})` : ''}`;
  return `<text${attrs({
    transform: tr,
    ...parseFont(o.font),
    'text-anchor': ANCHOR[o.align || 'left'] || 'start',
    'dominant-baseline': BASELINE[o.baseline || 'middle'] || 'central',
    fill: o.fill,
    stroke: o.stroke,
    'stroke-width': o.stroke ? o.strokeWidth : undefined,
    'stroke-linejoin': o.stroke ? 'round' : undefined,
    'paint-order': o.stroke && o.fill !== 'none' ? 'stroke' : undefined,
    opacity: opacityOf(o.alpha),
  })}>${escapeXml(o.text)}</text>`;
}

/** 塗りと縁（backend-canvas.js の fillStroke と同じ） */
function paint(it) {
  const stroke = it.stroke && it.lineWidth ? it.stroke : undefined;
  return {
    fill: it.fill || 'none',
    stroke,
    'stroke-width': stroke ? it.lineWidth : undefined,
    'stroke-dasharray': stroke ? dashOf(it.dash) : undefined,
    opacity: opacityOf(it.alpha),
  };
}

/** 角丸の四角（Canvas の roundRect と同じく、半径は辺の半分までに縮める） */
function rectEl(x, y, w, h, r, extra) {
  const rr = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  return `<rect${attrs({ x, y, width: w, height: h, rx: rr || undefined, ry: rr || undefined, ...extra })}/>`;
}

function pathItem(it) {
  const d = pathData(it.pts, it.radius, it.radii);
  const base = {
    d,
    fill: 'none',
    'stroke-linecap': it.cap || 'round',
    'stroke-linejoin': 'round',
    'stroke-dasharray': dashOf(it.dash),
  };
  let s = `<path${attrs({ ...base, stroke: it.color, 'stroke-width': it.width, opacity: opacityOf(it.alpha) })}/>`;
  if (it.inner) s += `<path${attrs({ ...base, stroke: it.inner.color, 'stroke-width': it.inner.width, opacity: opacityOf(it.alpha) })}/>`;
  return s;
}

function capsuleItem(it) {
  const len = Math.hypot(it.x2 - it.x1, it.y2 - it.y1);
  const ang = Math.atan2(it.y2 - it.y1, it.x2 - it.x1);
  return rectEl(-it.r, -it.r, len + it.r * 2, it.r * 2, it.r, {
    transform: `translate(${num(it.x1)} ${num(it.y1)}) rotate(${num(deg(ang))})`,
    ...paint(it),
  });
}

function rrectItem(it) {
  return rectEl(-it.w / 2, -it.h / 2, it.w, it.h, it.r, {
    transform: `translate(${num(it.x)} ${num(it.y)})${it.angle ? ` rotate(${num(deg(it.angle))})` : ''}`,
    ...paint(it),
  });
}

/** 駅番号のバッジ（backend-canvas.js の drawBadge と同じ） */
function badgeEl(b) {
  const lw = Math.max(1.2, b.h * 0.09);
  const r = b.shape === 'square' ? 0.5 : b.shape === 'roundSquare' ? b.h * 0.22 : Math.min(b.w, b.h) / 2;
  let s = '';
  if (b.shape !== 'none') s += rectEl(b.x + lw / 2, b.y + lw / 2, b.w - lw, b.h - lw, r, { fill: '#FFFFFF', stroke: b.color, 'stroke-width': lw });
  const cx = b.x + b.w / 2;
  const txt = (text, y, font) => textEl({ text, x: cx, y, font, align: 'center', fill: MAP_INK });
  if (b.prefix) s += txt(b.prefix, b.y + b.h * 0.32, b.topFont) + txt(b.number, b.y + b.h * 0.68, b.bottomFont);
  else s += txt(b.number, b.y + b.h / 2, b.bottomFont);
  return s;
}

/** 駅名の札（先に縁取りをすべて描き、そのあとで文字・マーク・バッジを描く） */
function labelItem(it) {
  let tr = '';
  if (it.angle) tr += `translate(${num(it.ax)} ${num(it.ay)}) rotate(${num(deg(it.angle))}) translate(${num(-it.ax)} ${num(-it.ay)}) `;
  tr += `translate(${num(it.x)} ${num(it.y)})`;
  let halo = '';
  let body = '';
  for (const r of it.runs) {
    if (r.kind === 'icon') {
      body += pictogramSvg(r.icon, r.x, r.y, r.size, r.color, it.halo, num);
    } else if (r.kind === 'badge') {
      body += badgeEl(r);
    } else {
      const o = { text: r.text, x: r.x, y: r.y, rot: r.rot, font: r.font, align: r.align || 'left' };
      if (it.halo) halo += textEl({ ...o, fill: 'none', stroke: it.halo, strokeWidth: 3 });
      body += textEl({ ...o, fill: r.color });
    }
  }
  return `<g transform="${tr}"${attrs({ opacity: opacityOf(it.alpha) })}>${halo}${body}</g>`;
}

/**
 * 表示リストの要素1つ
 * @param {any} it
 */
export function itemSvg(it) {
  switch (it.kind) {
    case 'path': return pathItem(it);
    case 'circle': return `<circle${attrs({ cx: it.x, cy: it.y, r: it.r, ...paint(it) })}/>`;
    case 'capsule': return capsuleItem(it);
    case 'rrect': return rrectItem(it);
    case 'text': return textEl({
      text: it.text, x: it.x, y: it.y, rot: it.angle, font: it.font, align: it.align, baseline: it.baseline,
      fill: it.color, stroke: it.halo, strokeWidth: it.haloWidth || 3, alpha: it.alpha,
    });
    case 'label': return labelItem(it);
    default: return '';
  }
}

/**
 * SVG の文書
 * @param {any[]} items
 * @param {{ bounds: Box, margin: number, background: string, transparent?: boolean, title?: string }} opt
 */
export function renderSvg(items, opt) {
  const b = opt.bounds;
  const m = opt.margin;
  const x = b.minX - m;
  const y = b.minY - m;
  const w = b.maxX - b.minX + m * 2;
  const h = b.maxY - b.minY + m * 2;
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg"${attrs({ width: Math.ceil(w), height: Math.ceil(h), viewBox: `${num(x)} ${num(y)} ${num(w)} ${num(h)}` })}>`,
  ];
  if (opt.title) out.push(`<title>${escapeXml(opt.title)}</title>`);
  if (!opt.transparent) out.push(`<rect${attrs({ x, y, width: w, height: h, fill: opt.background })}/>`);
  for (const it of items) {
    const s = itemSvg(it);
    if (s) out.push(s);
  }
  out.push('</svg>');
  return out.join('\n') + '\n';
}
