// 凡例とタイトル（§5.7）の表示リスト（DOM に依存しない）。
// 地図の外側に置く：上の角なら地図の上、下の角なら地図の下。同じ角ではタイトル → 凡例の順に積む。
// 文字は地図の言語で描く（mapT）。大きさは駅名の文字の大きさ（style.fontSize）を基準にする。
import { mix, readableTextColor } from '../core/color.js';
import { mapFont, inkOf, paperOf, subInkOf, strokeFor, tone } from './styles.js';
import { stationSymbol } from './station-symbol.js';

/** @typedef {import('../core/schema.js').Project} Project */
/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Box */
/** @typedef {(font: string, text: string) => number} Measure */

/**
 * 凡例の「記号」に出すもの（路線図に実際に出ているものだけ）
 * @typedef {object} LegendFacts
 * @property {Set<string>} lineIds 線を描いた路線
 * @property {Set<string>} symbols 駅の記号の種類（SYMBOL_ORDER の値）
 * @property {Set<string>} statuses 描いた区間の状態（open 以外）
 */

/** 記号の説明の並び順 */
export const SYMBOL_ORDER = ['terminal', 'major', 'station', 'tick', 'unstaffed', 'temporary', 'temporaryTick', 'interchange', 'connector', 'signal', 'freight', 'depot'];
const STATUS_ORDER = ['construction', 'planned', 'suspended', 'abolished'];

/** 要素の bbox をまとめた範囲 @param {any[]} items @returns {Box | null} */
export function unionBoxes(items) {
  let b = null;
  for (const it of items) {
    const x = it.bbox;
    if (!x) continue;
    if (!b) b = { ...x };
    else {
      b.minX = Math.min(b.minX, x.minX);
      b.minY = Math.min(b.minY, x.minY);
      b.maxX = Math.max(b.maxX, x.maxX);
      b.maxY = Math.max(b.maxY, x.maxY);
    }
  }
  return b;
}

/** 要素を平行移動した写し */
function moveItem(it, dx, dy) {
  const b = it.bbox;
  const out = { ...it, bbox: { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy } };
  if (it.pts) out.pts = it.pts.map((v, i) => v + (i % 2 ? dy : dx));
  if (it.x !== undefined) out.x = it.x + dx;
  if (it.y !== undefined) out.y = it.y + dy;
  if (it.x1 !== undefined) {
    out.x1 = it.x1 + dx;
    out.x2 = it.x2 + dx;
    out.y1 = it.y1 + dy;
    out.y2 = it.y2 + dy;
  }
  return out;
}

/**
 * @param {Project} p
 * @param {{ measure: Measure, mapT: (key: string, vars?: any) => string, mapBox: Box | null, facts: LegendFacts, orderIndex: Map<string, number> }} o
 * @returns {{ items: any[], bounds: Box | null }}
 */
export function buildLegend(p, o) {
  const style = p.style;
  const legend = style.legend;
  const title = style.title;
  if (!o.mapBox || (!(legend && legend.show) && !(title && title.show))) return { items: [], bounds: null };
  const u = style.fontSize;
  const ctx = {
    p,
    o,
    u,
    ink: inkOf(style),
    paper: paperOf(style),
    sub: subInkOf(style),
    neutral: mix(inkOf(style), paperOf(style), 0.55),
    text(str, x, y, font, color) {
      const w = o.measure(font, str);
      const size = parseFloat(font.split(' ')[1]) || u;
      return { kind: 'text', text: str, x, y, font, color, align: 'left', baseline: 'middle', bbox: { minX: x, minY: y - size * 0.6, maxX: x + w, maxY: y + size * 0.6 } };
    },
  };

  /** @type {Array<{ corner: string, w: number, h: number, items: any[] }>} */
  const blocks = [];
  if (title && title.show) {
    const b = titleBlock(ctx);
    if (b) blocks.push({ corner: title.corner, ...b });
  }
  if (legend && legend.show) {
    const b = legendBlock(ctx);
    if (b) blocks.push({ corner: legend.corner, ...b });
  }
  const items = placeBlocks(blocks, o.mapBox, u * 1.5);
  return { items, bounds: unionBoxes(items) };
}

/**
 * 角ごとに積み、地図の外側に置く。上の角の左右（下の角の左右）が重なるなら右側をずらす
 * @param {Array<{ corner: string, w: number, h: number, items: any[] }>} blocks
 * @param {Box} box
 * @param {number} gap
 */
function placeBlocks(blocks, box, gap) {
  const stacks = {};
  for (const b of blocks) (stacks[b.corner] = stacks[b.corner] || []).push(b);
  const size = (list) => list && {
    w: Math.max(...list.map((b) => b.w)),
    h: list.reduce((s, b) => s + b.h, 0) + gap * (list.length - 1),
  };
  const x0 = {};
  for (const c of ['tl', 'tr', 'bl', 'br']) {
    const s = size(stacks[c]);
    if (!s) continue;
    x0[c] = c[1] === 'l' ? box.minX : box.maxX - s.w;
  }
  for (const [l, r] of [['tl', 'tr'], ['bl', 'br']]) {
    if (x0[l] === undefined || x0[r] === undefined) continue;
    const right = x0[l] + size(stacks[l]).w + gap;
    if (x0[r] < right) x0[r] = right;
  }
  const out = [];
  for (const c of Object.keys(x0)) {
    const s = size(stacks[c]);
    let y = c[0] === 't' ? box.minY - gap - s.h : box.maxY + gap;
    for (const b of stacks[c]) {
      const x = c[1] === 'l' ? x0[c] : x0[c] + s.w - b.w;
      for (const it of b.items) out.push(moveItem(it, x, y));
      y += b.h + gap;
    }
  }
  return out;
}

/** タイトルと、作者・日付の行。原点は左上 */
function titleBlock(ctx) {
  const { p, u } = ctx;
  const t = p.style.title;
  const text = (t.text || '').trim() || p.name;
  const author = t.showAuthor && p.author ? p.author.trim() : '';
  const date = (t.date || '').trim();
  let byline = '';
  if (author && date) byline = ctx.o.mapT('map.title.dateAuthor', { date, name: author });
  else if (author) byline = ctx.o.mapT('map.title.author', { name: author });
  else byline = date;
  if (!text && !byline) return null;
  const right = t.corner[1] === 'r';
  const items = [];
  let y = 0;
  const lines = [];
  if (text) lines.push({ str: text, font: mapFont(p.style, u * 2, 700), color: ctx.ink, h: u * 2.5 });
  if (byline) lines.push({ str: byline, font: mapFont(p.style, u * 0.9, 500), color: ctx.sub, h: u * 1.4 });
  const w = Math.max(...lines.map((l) => ctx.o.measure(l.font, l.str)));
  for (const l of lines) {
    const lw = ctx.o.measure(l.font, l.str);
    items.push(ctx.text(l.str, right ? w - lw : 0, y + l.h / 2, l.font, l.color));
    y += l.h;
  }
  return { w, h: y, items };
}

/**
 * 凡例の箱：事業者ごとの路線・種別・記号の欄を、地図の幅に収まる範囲で段に分けて並べる
 */
function legendBlock(ctx) {
  const { u } = ctx;
  const sections = [
    ...(ctx.p.style.legend.lines ? lineSections(ctx) : []),
    ...(ctx.p.style.legend.types ? typeSections(ctx) : []),
    ...(ctx.p.style.legend.symbols ? symbolSections(ctx) : []),
  ];
  if (!sections.length) return null;
  const pad = u * 0.9;
  const colGap = u * 1.6;
  const secGap = u * 0.7;
  const maxW = ctx.o.mapBox.maxX - ctx.o.mapBox.minX;

  // 段の数を増やしながら、地図の幅に収まるうちで最も低い並べ方を選ぶ
  let best = null;
  for (let k = 1; k <= sections.length; k++) {
    const cols = flowColumns(sections, k, secGap);
    const w = cols.reduce((s, c) => s + c.w, 0) + colGap * (cols.length - 1) + pad * 2;
    const h = Math.max(...cols.map((c) => c.h)) + pad * 2;
    if (!best || (w <= Math.max(maxW, best.w) && h < best.h)) best = { cols, w, h };
    if (cols.length < k) break;
  }

  const items = [{
    kind: 'rrect', x: best.w / 2, y: best.h / 2, w: best.w, h: best.h, r: u * 0.5,
    fill: ctx.paper, stroke: mix(ctx.ink, ctx.paper, 0.7), lineWidth: 1,
    bbox: { minX: -0.5, minY: -0.5, maxX: best.w + 0.5, maxY: best.h + 0.5 },
  }];
  let x = pad;
  for (const col of best.cols) {
    let y = pad;
    col.list.forEach((sec, i) => {
      if (i > 0) y += secGap;
      for (const it of sec.items) items.push(moveItem(it, x, y));
      y += sec.h;
    });
    x += col.w + colGap;
  }
  return { w: best.w, h: best.h, items };
}

/** 欄を k 段に順に詰める（1段の高さの目安は、全体の高さ ÷ k か、いちばん高い欄） */
function flowColumns(sections, k, gap) {
  const total = sections.reduce((s, x) => s + x.h, 0) + gap * (sections.length - 1);
  const target = Math.max(Math.max(...sections.map((x) => x.h)), total / k);
  const cols = [];
  let cur = null;
  for (const sec of sections) {
    if (cur && cur.h + gap + sec.h > target + 0.01) cur = null;
    if (!cur) cols.push((cur = { list: [], w: 0, h: 0 }));
    cur.h += (cur.list.length ? gap : 0) + sec.h;
    cur.w = Math.max(cur.w, sec.w);
    cur.list.push(sec);
  }
  return cols;
}

/**
 * 見出しと行から欄を作る。行は { h, w, items }（原点は行の左上）
 * @returns {{ w: number, h: number, items: any[] }}
 */
function section(ctx, head, rows) {
  const { u } = ctx;
  const font = mapFont(ctx.p.style, u * 0.85, 700);
  const headH = u * 1.5;
  const items = [ctx.text(head, 0, headH / 2, font, ctx.ink)];
  let w = ctx.o.measure(font, head);
  let y = headH;
  for (const r of rows) {
    for (const it of r.items) items.push(moveItem(it, 0, y));
    y += r.h;
    w = Math.max(w, r.w);
  }
  return { w, h: y, items };
}

/** 記号（線の見本や駅の記号）と文字の行。記号は原点のまわりに作った要素 */
function iconRow(ctx, iconItems, label, iconW, sub) {
  const { u } = ctx;
  const font = mapFont(ctx.p.style, u * 0.9, 500);
  const b = unionBoxes(iconItems) || { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const h = Math.max(u * 1.6, b.maxY - b.minY + u * 0.4);
  const items = iconItems.map((it) => moveItem(it, (iconW - (b.maxX - b.minX)) / 2 - b.minX, h / 2 - (b.minY + b.maxY) / 2));
  const tx = iconW + u * 0.6;
  items.push(ctx.text(label, tx, h / 2, font, ctx.ink));
  let w = tx + ctx.o.measure(font, label);
  if (sub) {
    const sf = mapFont(ctx.p.style, u * 0.7, 500);
    items.push(ctx.text(sub, w + u * 0.4, h / 2, sf, ctx.sub));
    w += u * 0.4 + ctx.o.measure(sf, sub);
  }
  return { w, h, items };
}

/** 線の見本（原点から右へ） */
function swatch(style, kind, status, color, index, len) {
  const s = strokeFor(style, kind, status, color, index);
  return {
    kind: 'path', pts: [0, 0, len, 0], radius: 0, width: s.width, color: s.color, dash: s.dash, alpha: s.alpha, inner: s.inner, cap: 'butt',
    bbox: { minX: 0, minY: -s.width / 2, maxX: len, maxY: s.width / 2 },
  };
}

/** 事業者ごとの路線一覧 */
function lineSections(ctx) {
  const { p, u } = ctx;
  const style = p.style;
  const len = u * 2.4;
  const out = [];
  for (const op of p.operators) {
    const lines = p.lines.filter((l) => l.operatorId === op.id && ctx.o.facts.lineIds.has(l.id)).sort((a, b) => a.order - b.order);
    if (!lines.length) continue;
    const rows = lines.map((l) => iconRow(
      ctx,
      [swatch(style, l.kind, l.status, l.color, ctx.o.orderIndex.get(l.id) ?? 0, len)],
      l.name,
      len,
      style.showSubNames ? (l.names && l.names.en) || '' : '',
    ));
    out.push(section(ctx, op.name, rows));
  }
  return out;
}

/** 種別（系統で使っているもの）。事業者ごとに1行（長ければ折り返す）に札を並べる */
function typeSections(ctx) {
  const { p, u } = ctx;
  const used = new Set();
  for (const sv of p.services) for (const seg of sv.segments) used.add(seg.typeId);
  const types = p.serviceTypes.filter((x) => used.has(x.id));
  if (!types.length) return [];
  const ops = p.operators.filter((op) => types.some((x) => x.operatorId === op.id));
  const font = mapFont(p.style, u * 0.85, 700);
  const opFont = mapFont(p.style, u * 0.75, 500);
  const chipH = u * 1.35;
  const rowH = chipH + u * 0.35;
  const maxW = u * 18;
  const rows = [];
  for (const op of ops) {
    const list = types.filter((x) => x.operatorId === op.id).sort((a, b) => a.rank - b.rank);
    let items = [];
    let x = 0;
    let w = 0;
    const flush = () => {
      rows.push({ w, h: rowH, items });
      items = [];
      x = 0;
    };
    // 事業者が2つ以上なら、行の頭に事業者の略称
    const lead = ops.length > 1 ? (op.shortName || op.name) : '';
    const indent = lead ? ctx.o.measure(opFont, lead) + u * 0.5 : 0;
    if (lead) items.push(ctx.text(lead, 0, rowH / 2, opFont, ctx.sub));
    x = indent;
    for (const ty of list) {
      const tw = ctx.o.measure(font, ty.name) + u * 0.9;
      if (x > indent && x + tw > maxW) flush();
      if (x === 0) x = indent;
      const fill = tone(p.style, ty.color);
      const color = p.style.colorMode === 'color' ? ty.textColor : readableTextColor(fill);
      items.push({
        kind: 'rrect', x: x + tw / 2, y: rowH / 2, w: tw, h: chipH, r: u * 0.3, fill,
        bbox: { minX: x, minY: rowH / 2 - chipH / 2, maxX: x + tw, maxY: rowH / 2 + chipH / 2 },
      });
      const text = ctx.text(ty.name, x + tw / 2, rowH / 2, font, color);
      text.align = 'center';
      text.bbox = { ...text.bbox, minX: x, maxX: x + tw };
      items.push(text);
      x += tw + u * 0.35;
      w = Math.max(w, x - u * 0.35);
    }
    flush();
  }
  return [section(ctx, ctx.o.mapT('map.legend.types'), rows)];
}

/** 記号の説明：駅の記号と、線の状態 */
function symbolSections(ctx) {
  const { p, u } = ctx;
  const style = p.style;
  const len = u * 2.4;
  const rows = [];
  for (const kind of SYMBOL_ORDER) {
    if (!ctx.o.facts.symbols.has(kind)) continue;
    rows.push(iconRow(ctx, symbolIcon(ctx, kind, len), ctx.o.mapT('map.legend.' + kind), len));
  }
  for (const status of STATUS_ORDER) {
    if (!ctx.o.facts.statuses.has(status)) continue;
    rows.push(iconRow(ctx, [swatch(style, 'conventional', status, ctx.neutral, 0, len)], ctx.o.mapT('map.legend.' + status), len));
  }
  if (!rows.length) return [];
  return [section(ctx, ctx.o.mapT('map.legend.symbols'), rows)];
}

/** 記号の説明の見本（原点のまわりに作る。線の上に駅の記号） */
function symbolIcon(ctx, kind, len) {
  const style = ctx.p.style;
  const line = (y) => ({
    kind: 'path', pts: [-len / 2, y, len / 2, y], radius: 0, width: style.lineWidth, color: ctx.neutral, cap: 'butt',
    bbox: { minX: -len / 2, minY: y - style.lineWidth / 2, maxX: len / 2, maxY: y + style.lineWidth / 2 },
  });
  const strip = (items) => items.map(({ target, ...rest }) => rest);
  const dir = [{ x: 1, y: 0 }];
  const sym = (rank, pts, count) => strip(stationSymbol({ id: '', rank }, pts[0], { pts, dirs: pts.map(() => dir[0]) }, count, style, ctx.ink, ctx.neutral));
  const o = { x: 0, y: 0 };
  switch (kind) {
    case 'terminal': return [line(0), ...sym('terminal', [o], 1)];
    case 'major': return [line(0), ...sym('major', [o], 1)];
    case 'station': return [line(0), ...sym('normal', [o], 1)];
    case 'tick': return [line(0), ...sym('normal', [o], 1)];
    case 'unstaffed': return [line(0), ...sym('unstaffed', [o], 1)];
    case 'temporary':
    case 'temporaryTick': return [line(0), ...sym('temporary', [o], 1)];
    case 'interchange': {
      const s = (style.lineWidth + style.lineGap) / 2;
      return [line(-s), line(s), ...sym('normal', [{ x: 0, y: -s }, { x: 0, y: s }], 2)];
    }
    case 'connector': {
      // 乗換グループの連絡線（路線図と同じ太さ）で2つの駅を結ぶ
      const inner = Math.max(3, style.stationRadius * 1.1);
      const casing = inner + 3.5;
      const a = { x: -len / 2 + 2, y: 0 };
      const b = { x: len / 2 - 2, y: 0 };
      const bbox = { minX: a.x - casing / 2, minY: -casing / 2, maxX: b.x + casing / 2, maxY: casing / 2 };
      return [
        { kind: 'path', pts: [a.x, 0, b.x, 0], radius: 0, width: casing, color: ctx.ink, cap: 'round', bbox },
        { kind: 'path', pts: [a.x, 0, b.x, 0], radius: 0, width: inner, color: ctx.paper, cap: 'round', bbox },
        ...sym('major', [a], 0),
        ...sym('major', [b], 0),
      ];
    }
    default: return [line(0), ...sym(kind, [o], 1)];
  }
}
