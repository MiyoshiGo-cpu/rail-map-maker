// 停車駅案内図（§5.5）の表示リスト。横（駅を横に並べ、駅名は縦書き）と縦（駅を縦に並べる。スマホ向け）の2つのレイアウト。
// 停車は●、通過は線だけ。他社線の区間は背景を薄く塗り分け、直通先は端に矢印と「〇〇線直通」を描く。
import { mapFont, MAP_INK, MAP_PAPER } from './styles.js';
import { ROTATE_IN_VERTICAL } from './labels.js';
import { formatDuration } from '../i18n/i18n.js';

/** @typedef {import('../core/stopchart.js').StopChart} StopChart */
/** @typedef {(font: string, text: string) => number} Measure */

const GUIDE = '#E4E7EB';
const SUB = '#52606D';

/**
 * @typedef {object} ChartScene
 * @property {any[]} items
 * @property {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 * @property {{ bbox: { minX: number, minY: number, maxX: number, maxY: number }, serviceId: string }[]} rowBoxes 行を押したときに選ぶ系統
 */

/** 2つの箱を合わせた箱 */
function union(a, b) {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

/** 色を薄くする（背景の塗り分け用）：白と混ぜる */
function tint(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v) => Math.round(v + (255 - v) * (1 - k));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * 表示リストを作る道具（要素を足すたびに全体の範囲を広げる）
 */
function sceneBuilder() {
  const items = [];
  let bounds = null;
  const add = (it) => {
    items.push(it);
    bounds = bounds ? union(bounds, it.bbox) : { ...it.bbox };
    return it;
  };
  return {
    items,
    bounds: () => bounds || { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    rect(x, y, w, h, fill, r = 0) {
      return add({ kind: 'rrect', x: x + w / 2, y: y + h / 2, w, h, r, fill, bbox: { minX: x, minY: y, maxX: x + w, maxY: y + h } });
    },
    line(pts, color, width, dash = null) {
      const xs = pts.filter((_, i) => i % 2 === 0);
      const ys = pts.filter((_, i) => i % 2 === 1);
      return add({ kind: 'path', pts, radius: 0, width, color, dash, cap: 'butt', bbox: { minX: Math.min(...xs) - width, minY: Math.min(...ys) - width, maxX: Math.max(...xs) + width, maxY: Math.max(...ys) + width } });
    },
    dot(x, y, r, fill, stroke, lineWidth) {
      return add({ kind: 'circle', x, y, r, fill, stroke, lineWidth, bbox: { minX: x - r - lineWidth, minY: y - r - lineWidth, maxX: x + r + lineWidth, maxY: y + r + lineWidth } });
    },
    text(text, x, y, font, color, w, h, align = 'left', angle = 0) {
      const minX = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      return add({ kind: 'text', text, x, y, font, color, align, baseline: 'middle', angle, bbox: angle ? { minX: x - h, minY: y - h, maxX: x + h, maxY: y + w + h } : { minX, minY: y - h / 2, maxX: minX + w, maxY: y + h / 2 } });
    },
    /** 縦書き（1文字ずつ下へ。伸ばす記号などは回す） */
    vtext(text, x, y, font, size, color) {
      let cy = y;
      for (const ch of [...text]) {
        add({ kind: 'text', text: ch, x, y: cy + size / 2, font, color, align: 'center', baseline: 'middle', angle: ROTATE_IN_VERTICAL.has(ch) ? Math.PI / 2 : 0, bbox: { minX: x - size / 2, minY: cy, maxX: x + size / 2, maxY: cy + size } });
        cy += size * 1.05;
      }
      return cy - y;
    },
    /** 三角の矢印（dir：右 'r'・左 'l'・下 'd'・上 'u'） */
    arrow(x, y, s, dir, color) {
      const pts = {
        r: [x, y - s, x + s * 1.4, y, x, y + s],
        l: [x, y - s, x - s * 1.4, y, x, y + s],
        d: [x - s, y, x, y + s * 1.4, x + s, y],
        u: [x - s, y, x, y - s * 1.4, x + s, y],
      }[dir];
      return add({ kind: 'path', pts, radius: 0, width: s * 0.8, color, cap: 'round', bbox: { minX: x - s * 2, minY: y - s * 2, maxX: x + s * 2, maxY: y + s * 2 } });
    },
  };
}

/**
 * @param {import('../core/schema.js').Project} p
 * @param {StopChart} chart
 * @param {{ measure: Measure, layout: 'horizontal'|'vertical', mapT: (key: string, vars?: any) => string }} opt
 * @returns {ChartScene}
 */
export function buildStopChartScene(p, chart, opt) {
  const ctx = prepare(p, chart, opt);
  return opt.layout === 'vertical' ? verticalScene(ctx) : horizontalScene(ctx);
}

/** 両方のレイアウトで使う値 */
function prepare(p, chart, opt) {
  const style = p.style;
  const stById = new Map(p.stations.map((s) => [s.id, s]));
  const typeById = new Map(p.serviceTypes.map((x) => [x.id, x]));
  const lineById = new Map(p.lines.map((l) => [l.id, l]));
  const opById = new Map(p.operators.map((o) => [o.id, o]));
  const svById = new Map(p.services.map((s) => [s.id, s]));
  const lineName = (id) => { const l = lineById.get(id); return l ? l.displayName || l.name : ''; };
  const primaryOp = chart.bands[0] ? chart.bands[0].operatorId : '';
  /** 行の手本の系統の名前（愛称、なければ 始発→終着） */
  const serviceName = (row) => {
    const sv = svById.get(row.serviceIds[0]);
    if (!sv) return '';
    if (sv.name) return sv.name;
    const first = sv.segments[0];
    const last = sv.segments[sv.segments.length - 1];
    return opt.mapT('map.fromTo', { from: stById.get(first.from)?.name || '', to: stById.get(last.to)?.name || '' });
  };
  /** 行の駅間ごとの色と、種別が変わる列 */
  const hopColor = (row, c) => typeById.get(row.hops[c])?.color || MAP_INK;
  return { p, chart, opt, style, stById, typeById, lineById, opById, lineName, primaryOp, serviceName, hopColor, measure: opt.measure };
}

/**
 * 種別の札（角丸の四角に名前）
 * @returns {number} 札の幅
 */
function badge(b, ctx, type, x, y, h, text) {
  const font = mapFont(ctx.style, h * 0.62, 700);
  const w = ctx.measure(font, text) + h * 0.7;
  b.rect(x, y - h / 2, w, h, type ? type.color : MAP_INK, h * 0.22);
  b.text(text, x + w / 2, y, font, type ? type.textColor : MAP_PAPER, w, h, 'center');
  return w;
}

/** 行の中で種別が変わる列（最初の駅間は除く） */
function typeChanges(row) {
  const out = [];
  let prev = null;
  row.hops.forEach((id, c) => {
    if (!id) return;
    if (prev && id !== prev) out.push({ col: c, typeId: id });
    prev = id;
  });
  return out;
}

/** 行の最初の駅間の種別 */
const firstType = (row) => row.hops.find(Boolean) || row.typeIds[0];

// ---------- 横のレイアウト ----------

function horizontalScene(ctx) {
  const { chart, style, stById, typeById, opById, measure, opt } = ctx;
  const b = sceneBuilder();
  const n = chart.columns.length;
  const COL = 34;
  const ROW = 38;
  const BADGE_H = 22;
  const nameSize = 14;
  const nameStep = nameSize * 1.05;
  const smallFont = mapFont(style, 11, 500);
  const labelFont = mapFont(style, 11, 500);

  // 左の見出しの幅（種別の札と、系統名を添える行はその名前）
  let labelW = 72;
  for (const row of chart.rows) {
    const type = typeById.get(firstType(row));
    const w = measure(mapFont(style, BADGE_H * 0.62, 700), type ? type.name : '') + BADGE_H * 0.7;
    const sub = row.named ? measure(labelFont, ctx.serviceName(row)) : 0;
    labelW = Math.max(labelW, Math.max(w, sub) + 16);
  }
  // 直通の文字の幅（端の外に描く）
  const exitText = (e) => opt.mapT('map.throughTo', { name: ctx.lineName(e.lineId) });
  let leftExit = 0;
  let rightExit = 0;
  for (const row of chart.rows) {
    for (const e of row.exits) {
      const w = measure(smallFont, exitText(e)) + 24;
      if (e.side === 'before' && e.col === 0) leftExit = Math.max(leftExit, w);
      if (e.side === 'after' && e.col === n - 1) rightExit = Math.max(rightExit, w);
    }
  }
  const x0 = labelW + Math.max(16, leftExit);
  const xOf = (c) => x0 + c * COL + COL / 2;
  const width = xOf(n - 1) + COL / 2 + Math.max(16, rightExit);

  // 駅名の高さ（縦書き）
  const maxChars = Math.max(1, ...chart.columns.map((c) => [...(stById.get(c.stationId)?.name || '')].length));
  const bandH = 24;
  const nameTop = bandH + 10;
  const nameBottom = nameTop + maxChars * nameStep;
  const rowTop = nameBottom + 14;
  const rowsBottom = rowTop + Math.max(1, chart.rows.length) * ROW;

  // 路線ごとの範囲：他社線は背景を薄く塗り、上に路線の色の帯と路線名
  for (const band of chart.bands) {
    const left = band.start === 0 ? xOf(0) - COL / 2 : xOf(band.start);
    const right = band.end === n - 1 ? xOf(n - 1) + COL / 2 : xOf(band.end);
    const line = ctx.lineById.get(band.lineId);
    const op = opById.get(band.operatorId);
    if (band.operatorId !== ctx.primaryOp && op) b.rect(left, 0, right - left, rowsBottom + 6, tint(op.color, 0.1));
    b.rect(left, bandH - 6, right - left, 5, line ? line.color : MAP_INK);
    b.text(ctx.lineName(band.lineId), (left + right) / 2, bandH / 2 - 2, mapFont(style, 12, 700), MAP_INK, measure(mapFont(style, 12, 700), ctx.lineName(band.lineId)), 14, 'center');
  }

  // 駅名（縦書き）と、行を貫く薄い案内の線
  chart.columns.forEach((c, i) => {
    const st = stById.get(c.stationId);
    const major = st && (st.rank === 'terminal' || st.rank === 'major');
    b.vtext(st ? st.name : '', xOf(i), nameTop, mapFont(style, nameSize, major ? 700 : 500), nameSize, MAP_INK);
    b.line([xOf(i), nameBottom + 4, xOf(i), rowsBottom], GUIDE, 1);
  });

  /** @type {ChartScene['rowBoxes']} */
  const rowBoxes = [];
  chart.rows.forEach((row, r) => {
    const y = rowTop + r * ROW + ROW / 2;
    const type = typeById.get(firstType(row));
    badge(b, ctx, type, 8, row.named ? y - 6 : y, BADGE_H, type ? type.name : '');
    if (row.named) {
      const name = ctx.serviceName(row);
      b.text(name, 8, y + 12, labelFont, SUB, measure(labelFont, name), 12);
    }
    // 駅間の線（種別の色）
    for (let c = 0; c < n - 1; c++) {
      if (!row.hops[c]) continue;
      b.line([xOf(c), y, xOf(c + 1), y], ctx.hopColor(row, c), 6);
    }
    // 種別が変わるところに小さな札
    for (const ch of typeChanges(row)) {
      const t = typeById.get(ch.typeId);
      badge(b, ctx, t, xOf(ch.col) + 4, y - 13, 15, t ? t.shortName || t.name : '');
    }
    // 停車駅（●）
    row.cells.forEach((cell, c) => {
      if (!cell || !cell.stop) return;
      const color = ctx.hopColor(row, row.hops[c] ? c : c - 1);
      b.dot(xOf(c), y, 7, color, MAP_PAPER, 2);
    });
    // 直通先：端に矢印と「〇〇線直通」
    for (const e of row.exits) {
      const x = xOf(e.col);
      const color = ctx.hopColor(row, e.side === 'after' ? Math.max(0, e.col - 1) : e.col);
      const text = exitText(e);
      const tw = measure(smallFont, text);
      if (e.side === 'after') {
        b.line([x, y, x + 12, y], color, 6);
        b.arrow(x + 12, y, 5, 'r', color);
        const edge = e.col === n - 1;
        b.text(text, edge ? x + 22 : x + 4, edge ? y : y + 14, smallFont, SUB, tw, 12);
      } else {
        b.line([x - 12, y, x, y], color, 6);
        b.arrow(x - 12, y, 5, 'l', color);
        const edge = e.col === 0;
        b.text(text, edge ? x - 22 : x - 4, edge ? y : y + 14, smallFont, SUB, tw, 12, 'right');
      }
    }
    rowBoxes.push({ bbox: { minX: 0, minY: y - ROW / 2, maxX: width, maxY: y + ROW / 2 }, serviceId: row.serviceIds[0] });
  });

  const footer = timesFooter(b, ctx, 8, rowsBottom + 18);
  const bounds = union(b.bounds(), { minX: 0, minY: 0, maxX: width, maxY: footer });
  return { items: b.items, bounds, rowBoxes };
}

// ---------- 縦のレイアウト（スマホ向け） ----------

function verticalScene(ctx) {
  const { chart, style, stById, typeById, opById, measure, opt } = ctx;
  const b = sceneBuilder();
  const n = chart.columns.length;
  const ROWH = 32;
  const COL = 46;
  const BADGE_H = 22;
  const nameFontOf = (major) => mapFont(style, 14, major ? 700 : 500);
  const smallSize = 11;
  const smallFont = mapFont(style, smallSize, 500);

  // 左：路線の色の帯（8px）と駅名
  let nameW = 40;
  for (const c of chart.columns) {
    const st = stById.get(c.stationId);
    nameW = Math.max(nameW, measure(nameFontOf(st && (st.rank === 'terminal' || st.rank === 'major')), st ? st.name : ''));
  }
  const barX = 0;
  const nameX = 16;
  const colX0 = nameX + nameW + 16;
  const xOf = (r) => colX0 + r * COL + COL / 2;
  const width = xOf(Math.max(0, chart.rows.length - 1)) + COL / 2 + 8;

  // 上：種別の札（と系統名）、上へ続く直通の文字（縦書き）
  const exitText = (e) => opt.mapT('map.throughTo', { name: ctx.lineName(e.lineId) });
  const vLen = (text) => [...text].length * smallSize * 1.05;
  let topExit = 0;
  let bottomExit = 0;
  for (const row of chart.rows) {
    for (const e of row.exits) {
      const len = vLen(exitText(e)) + 26;
      if (e.side === 'before' && e.col === 0) topExit = Math.max(topExit, len);
      if (e.side === 'after' && e.col === n - 1) bottomExit = Math.max(bottomExit, len);
    }
  }
  const head = BADGE_H + (chart.rows.some((r) => r.named) ? 18 : 6);
  const y0 = head + Math.max(12, topExit);
  const yOf = (c) => y0 + c * ROWH + ROWH / 2;
  const bottom = yOf(n - 1) + ROWH / 2 + Math.max(12, bottomExit);

  // 路線ごとの範囲（左の帯と、他社線の背景）
  for (const band of chart.bands) {
    const top = band.start === 0 ? yOf(0) - ROWH / 2 : yOf(band.start);
    const bot = band.end === n - 1 ? yOf(n - 1) + ROWH / 2 : yOf(band.end);
    const line = ctx.lineById.get(band.lineId);
    const op = opById.get(band.operatorId);
    if (band.operatorId !== ctx.primaryOp && op) b.rect(0, top, width, bot - top, tint(op.color, 0.1));
    b.rect(barX, top, 8, bot - top, line ? line.color : MAP_INK, 2);
  }
  // 駅名と、列を貫く薄い案内の線
  chart.columns.forEach((c, i) => {
    const st = stById.get(c.stationId);
    const font = nameFontOf(st && (st.rank === 'terminal' || st.rank === 'major'));
    const name = st ? st.name : '';
    b.text(name, nameX, yOf(i), font, MAP_INK, measure(font, name), 16);
    b.line([colX0, yOf(i), width, yOf(i)], GUIDE, 1);
  });

  /** @type {ChartScene['rowBoxes']} */
  const rowBoxes = [];
  chart.rows.forEach((row, r) => {
    const x = xOf(r);
    const type = typeById.get(firstType(row));
    const label = type ? type.shortName || type.name : '';
    const w = measure(mapFont(style, BADGE_H * 0.62, 700), label) + BADGE_H * 0.7;
    badge(b, ctx, type, x - w / 2, BADGE_H / 2 + 2, BADGE_H, label);
    if (row.named) {
      const name = ctx.serviceName(row);
      const f = mapFont(style, 10, 500);
      b.text(name, x, BADGE_H + 12, f, SUB, measure(f, name), 11, 'center');
    }
    for (let c = 0; c < n - 1; c++) {
      if (!row.hops[c]) continue;
      b.line([x, yOf(c), x, yOf(c + 1)], ctx.hopColor(row, c), 6);
    }
    for (const ch of typeChanges(row)) {
      const t = typeById.get(ch.typeId);
      badge(b, ctx, t, x + 6, yOf(ch.col) + ROWH / 2 - 2, 14, t ? t.shortName || t.name : '');
    }
    row.cells.forEach((cell, c) => {
      if (!cell || !cell.stop) return;
      b.dot(x, yOf(c), 7, ctx.hopColor(row, row.hops[c] ? c : c - 1), MAP_PAPER, 2);
    });
    for (const e of row.exits) {
      const y = yOf(e.col);
      const color = ctx.hopColor(row, e.side === 'after' ? Math.max(0, e.col - 1) : e.col);
      const text = exitText(e);
      if (e.side === 'after') {
        b.line([x, y, x, y + 12], color, 6);
        b.arrow(x, y + 12, 5, 'd', color);
        b.vtext(text, x, y + 22, smallFont, smallSize, SUB);
      } else {
        b.line([x, y - 12, x, y], color, 6);
        b.arrow(x, y - 12, 5, 'u', color);
        b.vtext(text, x, y - 22 - vLen(text), smallFont, smallSize, SUB);
      }
    }
    rowBoxes.push({ bbox: { minX: x - COL / 2, minY: 0, maxX: x + COL / 2, maxY: bottom }, serviceId: row.serviceIds[0] });
  });

  const footer = timesFooter(b, ctx, 0, bottom + 12);
  const bounds = union(b.bounds(), { minX: 0, minY: 0, maxX: width, maxY: footer });
  return { items: b.items, bounds, rowBoxes };
}

/**
 * 表の下：種別ごとの代表区間の所要時間（行の手本の系統の、案内図の範囲の最初と最後の停車駅の間）
 * @returns {number} 下端の y
 */
function timesFooter(b, ctx, x, y) {
  const { chart, typeById, stById, style, measure, opt } = ctx;
  const font = mapFont(style, 12, 500);
  let cy = y;
  for (const row of chart.rows) {
    if (row.sec === null || !row.secSpan) continue;
    const type = typeById.get(firstType(row));
    const from = stById.get(chart.columns[row.secSpan[0]].stationId)?.name || '';
    const to = stById.get(chart.columns[row.secSpan[1]].stationId)?.name || '';
    const w = badge(b, ctx, type, x, cy, 18, type ? type.name : '');
    const text = opt.mapT('map.sectionTime', { from, to, time: formatDuration(row.sec, ctx.p.locale.mapLanguage) });
    b.text(text, x + w + 8, cy, font, MAP_INK, measure(font, text), 14);
    cy += 24;
  }
  return cy;
}
