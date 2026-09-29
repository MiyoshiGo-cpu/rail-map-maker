// 駅名標（§5.6）の表示リスト（DOM に依存しない）。テンプレートは3つ：
// ・帯型（band）：上に駅名、下にラインカラーの帯と前後の駅・矢印
// ・ナンバリング強調型（number）：左に大きな駅番号、下に細い帯と前後の駅
// ・ひらがな主体型（kana）：大きなひらがなと小さな漢字、上に細い帯
// 特定の会社の駅名標をそのまま写さないよう、形と大きさはこのアプリの独自のものにする。
import { mix, readableTextColor } from '../core/color.js';
import { mapFont, inkOf, paperOf, tone } from './styles.js';

/** @typedef {import('../core/signboard.js').Signboard} Signboard */
/** @typedef {import('../core/signboard.js').SignStation} SignStation */
/** @typedef {(font: string, text: string) => number} Measure */

/** 駅名標の幅（ズーム1の px） */
export const SIGN_WIDTH = 720;
const RADIUS = 10;

/**
 * @param {import('../core/schema.js').Project} p
 * @param {Signboard} sb
 * @param {{ measure: Measure, mapT: (key: string, vars?: any) => string }} opt
 * @returns {{ items: any[], bounds: { minX: number, minY: number, maxX: number, maxY: number }, hits: Array<{ bbox: any, stationId: string }> }}
 */
export function buildSignboardScene(p, sb, opt) {
  const style = p.style;
  const set = style.signboard;
  const ink = inkOf(style);
  const paper = paperOf(style);
  const color = tone(style, sb.color);
  const c = {
    style,
    measure: opt.measure,
    mapT: opt.mapT,
    items: set.items,
    ink,
    paper,
    sub: mix(ink, paper, 0.4),
    color,
    onColor: readableTextColor(color),
    out: [],
    hits: [],
  };
  const layout = set.template === 'number' ? numberTemplate : set.template === 'kana' ? kanaTemplate : bandTemplate;
  const h = layout(c, sb);
  // 外枠（塗りの上に縁だけ描く）
  c.out.push(rect(SIGN_WIDTH / 2, h / 2, SIGN_WIDTH, h, { r: RADIUS, stroke: mix(ink, paper, 0.7), lineWidth: 1.5 }));
  return { items: c.out, bounds: { minX: -1, minY: -1, maxX: SIGN_WIDTH + 1, maxY: h + 1 }, hits: c.hits };
}

// ---------- 部品 ----------

/** 四角（中心・幅・高さ）。corners は角ごとの半径 */
function rect(cx, cy, w, h, o = {}) {
  return {
    kind: 'rrect', x: cx, y: cy, w, h, r: o.r || 0, corners: o.corners, fill: o.fill, stroke: o.stroke, lineWidth: o.lineWidth,
    bbox: { minX: cx - w / 2, minY: cy - h / 2, maxX: cx + w / 2, maxY: cy + h / 2 },
  };
}

/** 幅に収まる文字の大きさ */
function fitSize(c, str, size, weight, maxW) {
  const w = c.measure(mapFont(c.style, size, weight), str);
  return w > maxW && w > 0 ? Math.max(8, (size * maxW) / w) : size;
}

/** 文字（align：left・center・right） */
function text(c, str, x, y, size, weight, color, align = 'center') {
  const font = mapFont(c.style, size, weight);
  const w = c.measure(font, str);
  const minX = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const item = { kind: 'text', text: str, x, y, font, color, align, baseline: 'middle', bbox: { minX, minY: y - size * 0.6, maxX: minX + w, maxY: y + size * 0.6 } };
  c.out.push(item);
  return item;
}

/**
 * 大きな駅名。2〜3文字なら字の間をあけて並べる（駅名標らしく見せる）
 * @returns {number} 使った幅
 */
function bigName(c, str, cx, y, size, color, maxW, align = 'center') {
  const chars = [...str];
  const gap = chars.length === 2 ? size * 0.7 : chars.length === 3 ? size * 0.35 : 0;
  const s = fitSize(c, str, size, 700, maxW - gap * (chars.length - 1));
  if (!gap || s < size) {
    const it = text(c, str, cx, y, s, 700, color, align);
    return it.bbox.maxX - it.bbox.minX;
  }
  const font = mapFont(c.style, s, 700);
  const widths = chars.map((ch) => c.measure(font, ch));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let x = align === 'center' ? cx - total / 2 : align === 'right' ? cx - total : cx;
  chars.forEach((ch, i) => {
    text(c, ch, x + widths[i] / 2, y, s, 700, color, 'center');
    x += widths[i] + gap;
  });
  return total;
}

/** 前後の駅を示す矢印（くの字）。dir は -1 が左、1 が右 */
function chevron(c, x, y, size, dir, color) {
  const w = size * 0.6 * -dir;
  c.out.push({
    kind: 'path', pts: [x + w, y - size, x, y, x + w, y + size], radius: 0, width: size * 0.34, color, cap: 'round',
    bbox: { minX: Math.min(x, x + w) - size, minY: y - size * 1.2, maxX: Math.max(x, x + w) + size, maxY: y + size * 1.2 },
  });
}

/** 駅番号のバッジ（角丸の四角に路線記号と番号） */
function badge(c, number, cx, cy, size) {
  c.out.push(rect(cx, cy, size, size, { r: size * 0.18, fill: c.paper, stroke: c.color, lineWidth: Math.max(2, size * 0.08) }));
  if (number.prefix) {
    text(c, number.prefix, cx, cy - size * 0.2, fitSize(c, number.prefix, size * 0.27, 700, size * 0.78), 700, c.ink);
    text(c, number.number, cx, cy + size * 0.16, fitSize(c, number.number, size * 0.4, 700, size * 0.78), 700, c.ink);
  } else {
    text(c, number.number, cx, cy, fitSize(c, number.number, size * 0.46, 700, size * 0.8), 700, c.ink);
  }
}

/** 駅名の下に並べる小さな行（副駅名・英字・多言語）。y から下へ積み、次の y を返す */
function subLines(c, st, cx, y, sizes, align) {
  if (c.items.subName && st.subName) {
    text(c, c.mapT('map.sign.subName', { name: st.subName }), cx, y + sizes.subName / 2, sizes.subName, 500, c.ink, align);
    y += sizes.subName * 1.45;
  }
  if (c.items.en && st.en) {
    text(c, st.en, cx, y + sizes.en / 2, sizes.en, 500, c.ink, align);
    y += sizes.en * 1.4;
  }
  if (c.items.multilingual && st.others.length) {
    text(c, st.others.join('  '), cx, y + sizes.other / 2, sizes.other, 500, c.sub, align);
    y += sizes.other * 1.45;
  }
  return y;
}

/**
 * 前後の駅（左右の片側）。side は -1 が左（起点側）、1 が右（終点側）
 * @param {any} c
 * @param {SignStation} st
 * @param {-1|1} side
 * @param {number} y 行の中央
 * @param {{ pad: number, size: number, color: string, arrow: string, sub: string, kana?: boolean }} o
 */
function neighbor(c, st, side, y, o) {
  const align = side < 0 ? 'left' : 'right';
  const edge = side < 0 ? o.pad : SIGN_WIDTH - o.pad;
  chevron(c, edge, y, o.size * 0.45, side, o.arrow);
  let x = edge - side * o.size * 0.95;
  const maxW = SIGN_WIDTH / 2 - o.pad - o.size * 1.6;
  const start = c.out.length;
  // 駅番号（表示する設定のとき）は矢印の隣に小さく
  if (c.items.number && st.number) {
    const it = text(c, st.number.code, x, y, o.size * 0.55, 700, o.color, align);
    x -= side * (it.bbox.maxX - it.bbox.minX + o.size * 0.35);
  }
  // ひらがな主体型は、ひらがなを大きく漢字を小さく。ほかは駅名と英字
  const useKana = !!(o.kana && c.items.reading && st.reading);
  const main = useKana ? st.reading : st.name;
  const second = useKana ? st.name : c.items.en ? st.en : '';
  const hasSecond = !!second && second !== main;
  const size = fitSize(c, main, o.size, 700, maxW - Math.abs(x - edge));
  text(c, main, x, hasSecond ? y - o.size * 0.3 : y, size, 700, o.color, align);
  const secondSize = o.size * (useKana ? 0.55 : 0.48);
  if (hasSecond) text(c, second, x, y + o.size * 0.58, fitSize(c, second, secondSize, 500, maxW - Math.abs(x - edge)), 500, o.sub, align);
  // 押すとその駅の駅名標に移る
  const box = c.out.slice(start - 1).reduce((b, it) => ({
    minX: Math.min(b.minX, it.bbox.minX), minY: Math.min(b.minY, it.bbox.minY), maxX: Math.max(b.maxX, it.bbox.maxX), maxY: Math.max(b.maxY, it.bbox.maxY),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  c.hits.push({ bbox: box, stationId: st.id });
}

// ---------- テンプレート ----------

/** 帯型：上に駅名、下にラインカラーの帯と前後の駅 */
function bandTemplate(c, sb) {
  const st = sb.station;
  const W = SIGN_WIDTH;
  const pad = 36;
  const hasBadge = c.items.number && st.number;
  const badgeSize = 70;
  // 上の部分の中身の高さを先に測るため、いったん仮の位置に並べてから下にずらす
  const top = [];
  let y = 26;
  if (c.items.reading && st.reading) {
    top.push(() => text(c, st.reading, W / 2, 26 + 12, 22, 500, c.sub));
    y += 34;
  }
  const nameY = y + 34;
  y += 74;
  const afterName = y;
  const T = Math.max(afterName + subHeight(c, st, { subName: 18, en: 24, other: 16 }) + 18, hasBadge ? badgeSize + 56 : 0);
  const B = c.items.neighbors ? 84 : 20;
  // 地と帯
  c.out.push(rect(W / 2, T / 2, W, T, { corners: [RADIUS, RADIUS, 0, 0], fill: c.paper }));
  c.out.push(rect(W / 2, T + B / 2, W, B, { corners: [0, 0, RADIUS, RADIUS], fill: c.color }));
  for (const f of top) f();
  const reserve = hasBadge ? badgeSize + 24 : 0;
  bigName(c, st.name, W / 2, nameY, 60, c.ink, W - pad * 2 - reserve * 2);
  subLines(c, st, W / 2, afterName, { subName: 18, en: 24, other: 16 }, 'center');
  if (hasBadge) badge(c, st.number, pad + badgeSize / 2, nameY, badgeSize);
  if (c.items.neighbors) {
    const o = { pad: pad - 8, size: 26, color: c.onColor, arrow: c.onColor, sub: mix(c.onColor, c.color, 0.2) };
    if (sb.prev) neighbor(c, sb.prev, -1, T + B / 2, o);
    if (sb.next) neighbor(c, sb.next, 1, T + B / 2, o);
  }
  return T + B;
}

/** ナンバリング強調型：左に大きな駅番号、右に駅名、下に細い帯と前後の駅 */
function numberTemplate(c, sb) {
  const st = sb.station;
  const W = SIGN_WIDTH;
  const pad = 32;
  const hasBadge = c.items.number && st.number;
  const S = 136;
  const x0 = hasBadge ? pad + S + 30 : pad;
  const readH = c.items.reading && st.reading ? 32 : 0;
  const colH = readH + 66 + subHeight(c, st, { subName: 18, en: 22, other: 16 });
  const U = Math.max(hasBadge ? S : 0, colH) + pad * 2;
  const stripe = 10;
  const B = c.items.neighbors ? 64 : 14;
  const H = U + stripe + B;
  c.out.push(rect(W / 2, H / 2, W, H, { r: RADIUS, fill: c.paper }));
  c.out.push(rect(W / 2, U + stripe / 2, W, stripe, { fill: c.color }));
  if (hasBadge) badge(c, st.number, pad + S / 2, U / 2, S);
  let y = (U - colH) / 2;
  if (readH) text(c, st.reading, x0, y + 12, 20, 500, c.sub, 'left');
  y += readH;
  bigName(c, st.name, x0, y + 30, 56, c.ink, W - x0 - pad, 'left');
  subLines(c, st, x0, y + 66, { subName: 18, en: 22, other: 16 }, 'left');
  if (c.items.neighbors) {
    const o = { pad: pad - 6, size: 22, color: c.ink, arrow: c.color, sub: c.sub };
    if (sb.prev) neighbor(c, sb.prev, -1, U + stripe + B / 2, o);
    if (sb.next) neighbor(c, sb.next, 1, U + stripe + B / 2, o);
  }
  return H;
}

/** ひらがな主体型：上に細い帯、大きなひらがなと小さな漢字、下に前後の駅 */
function kanaTemplate(c, sb) {
  const st = sb.station;
  const W = SIGN_WIDTH;
  const pad = 34;
  const stripe = 16;
  const kana = c.items.reading && st.reading;
  const hasBadge = c.items.number && st.number;
  const badgeSize = 62;
  const mainY = stripe + 26 + 34;
  let y = mainY + 42;
  const kanjiY = kana ? y + 16 : 0;
  if (kana) y += 40;
  const afterKanji = y;
  const Tbody = afterKanji + subHeight(c, st, { subName: 16, en: 20, other: 15 }) + 10;
  const B = c.items.neighbors ? 70 : 8;
  const H = Tbody + B + 6;
  c.out.push(rect(W / 2, H / 2, W, H, { r: RADIUS, fill: c.paper }));
  c.out.push(rect(W / 2, stripe / 2, W, stripe, { corners: [RADIUS, RADIUS, 0, 0], fill: c.color }));
  const reserve = hasBadge ? badgeSize + 24 : 0;
  bigName(c, kana ? st.reading : st.name, W / 2, mainY, 64, c.ink, W - pad * 2 - reserve * 2);
  if (kana) text(c, st.name, W / 2, kanjiY, fitSize(c, st.name, 26, 700, W - pad * 2), 700, c.ink);
  subLines(c, st, W / 2, afterKanji, { subName: 16, en: 20, other: 15 }, 'center');
  if (hasBadge) badge(c, st.number, pad + badgeSize / 2, mainY, badgeSize);
  if (c.items.neighbors) {
    // 前後の駅との間に細い線
    c.out.push({
      kind: 'path', pts: [pad, Tbody, W - pad, Tbody], radius: 0, width: 1.5, color: mix(c.ink, c.paper, 0.7), cap: 'butt',
      bbox: { minX: pad, minY: Tbody - 1, maxX: W - pad, maxY: Tbody + 1 },
    });
    const o = { pad: pad - 4, size: 22, color: c.ink, arrow: c.color, sub: c.sub, kana: true };
    if (sb.prev) neighbor(c, sb.prev, -1, Tbody + B / 2 + 3, o);
    if (sb.next) neighbor(c, sb.next, 1, Tbody + B / 2 + 3, o);
  }
  return H;
}

/** 駅名の下の小さな行の高さの合計（subLines と同じ積み方） */
function subHeight(c, st, sizes) {
  let h = 0;
  if (c.items.subName && st.subName) h += sizes.subName * 1.45;
  if (c.items.en && st.en) h += sizes.en * 1.4;
  if (c.items.multilingual && st.others.length) h += sizes.other * 1.45;
  return h;
}
