// 駅名ラベル（§5.3）：主表記・副表記（既定は英字）・付帯施設のマークをまとめた札を作り、
// 8方向の候補から線の向きに直交する側を優先して、重要な駅から順に重ならない位置へ置く。
// どこも重なる場合は、重なりが最小の位置にする。手動の方向・微調整・縦書き・±45°・改行にも対応する。
import { createSpatialIndex } from './spatial-index.js';
import { mapFont, MAP_INK, MAP_PAPER } from './styles.js';

/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Box */
/** @typedef {(font: string, text: string) => number} Measure */

export const DIRECTIONS = ['E', 'W', 'N', 'S', 'NE', 'SE', 'NW', 'SW'];
const UNIT = {
  E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1],
  NE: [Math.SQRT1_2, -Math.SQRT1_2], SE: [Math.SQRT1_2, Math.SQRT1_2], NW: [-Math.SQRT1_2, -Math.SQRT1_2], SW: [-Math.SQRT1_2, Math.SQRT1_2],
};
const SUB_COLOR = '#52606D';
/** 縦書きで横に倒して書く文字（長音・ダッシュ・波ダッシュ・かっこ） */
const ROTATE_IN_VERTICAL = new Set(['\u30FC', '\u2015', '\u2014', '\u2010', '-', '\u301C', '\uFF5E', '~', '(', ')', '\uFF08', '\uFF09', '[', ']', '\u300C', '\u300D']);
const MAJOR_RANKS = new Set(['terminal', 'major']);
const RANK_ORDER = { terminal: 0, major: 1, normal: 2, unstaffed: 3, temporary: 3, freight: 4, depot: 4, signal: 5 };

/**
 * ズームに応じて隠す段階（§5.3：ズームアウトで一般駅の副表記 → 一般駅の駅名の順に隠す）
 * @param {number} zoom
 * @returns {0|1|2}
 */
export function labelLevel(zoom) {
  if (zoom >= 0.7) return 0;
  if (zoom >= 0.4) return 1;
  return 2;
}

/**
 * 札の中身を組み立てる。座標は札の左上を原点にする
 * @param {import('../core/schema.js').Station} st
 * @param {{ style: import('../core/schema.js').MapStyle, subLanguages: string[], measure: Measure, level: number, align: 'left'|'center'|'right', vertical: boolean }} o
 */
export function buildBlock(st, o) {
  const { style, measure } = o;
  const size = style.fontSize * (st.rank === 'terminal' ? 1.15 : st.rank === 'unstaffed' || st.rank === 'temporary' ? 0.9 : 1);
  const weight = MAJOR_RANKS.has(st.rank) ? 700 : 600;
  const font = mapFont(style, size, weight);
  const subSize = Math.max(6, size * 0.62);
  const subFont = mapFont(style, subSize, 500);
  const minor = !MAJOR_RANKS.has(st.rank);
  const showSub = style.showSubNames && !(minor && o.level >= 1);
  const text = st.label.schematic.text || st.name;
  const mainLines = text.split('\n').filter((s) => s !== '');
  const subs = showSub ? o.subLanguages.slice(0, 2).map((l) => st.names[l]).filter(Boolean) : [];
  const icons = st.facilities || [];
  const iconSize = size * 0.95;
  const runs = [];

  if (o.vertical) {
    // 縦書き：主表記を1文字ずつ縦に並べ、副表記は右に90°回して置く
    const chars = [...mainLines.join('')];
    const step = size * 1.05;
    let y = 0;
    for (const ch of chars) {
      runs.push({ kind: 'text', text: ch, font, color: MAP_INK, x: size / 2, y: y + step / 2, align: 'center', rot: ROTATE_IN_VERTICAL.has(ch) ? Math.PI / 2 : 0 });
      y += step;
    }
    let x = size + 2;
    let hgt = y;
    for (const s of subs) {
      const w = measure(subFont, s);
      runs.push({ kind: 'text', text: s, font: subFont, color: SUB_COLOR, x: x + subSize * 0.6, y: 0, align: 'left', rot: Math.PI / 2 });
      x += subSize * 1.25;
      hgt = Math.max(hgt, w);
    }
    icons.forEach((ic, i) => runs.push({ kind: 'icon', icon: ic, x: 0, y: hgt + 2 + i * (iconSize + 2), size: iconSize, color: MAP_INK }));
    if (icons.length) hgt += 2 + icons.length * (iconSize + 2);
    return { runs, w: x, h: hgt, size };
  }

  // 横書き
  const lineH = size * 1.25;
  const subH = subSize * 1.3;
  const widths = mainLines.map((s, i) => measure(font, s) + (i === 0 && icons.length ? icons.length * (iconSize + 2) + 2 : 0));
  const subWidths = subs.map((s) => measure(subFont, s));
  const w = Math.max(1, ...widths, ...subWidths);
  const xOf = (lw) => (o.align === 'left' ? 0 : o.align === 'right' ? w - lw : (w - lw) / 2);
  let y = 0;
  mainLines.forEach((s, i) => {
    const x0 = xOf(widths[i]);
    runs.push({ kind: 'text', text: s, font, color: MAP_INK, x: x0, y: y + lineH / 2, align: 'left' });
    if (i === 0) {
      let ix = x0 + measure(font, s) + 3;
      for (const ic of icons) {
        runs.push({ kind: 'icon', icon: ic, x: ix, y: y + (lineH - iconSize) / 2, size: iconSize, color: MAP_INK });
        ix += iconSize + 2;
      }
    }
    y += lineH;
  });
  subs.forEach((s, i) => {
    runs.push({ kind: 'text', text: s, font: subFont, color: SUB_COLOR, x: xOf(subWidths[i]), y: y + subH / 2, align: 'left' });
    y += subH;
  });
  return { runs, w, h: y, size };
}

/** 方向ごとの札の左上と揃え */
function placeAt(dir, sym, w, h, gap) {
  const cx = (sym.minX + sym.maxX) / 2;
  const cy = (sym.minY + sym.maxY) / 2;
  const d = gap * 0.4;
  switch (dir) {
    case 'E': return { x: sym.maxX + gap, y: cy - h / 2, align: 'left', ax: sym.maxX + gap, ay: cy };
    case 'W': return { x: sym.minX - gap - w, y: cy - h / 2, align: 'right', ax: sym.minX - gap, ay: cy };
    case 'N': return { x: cx - w / 2, y: sym.minY - gap - h, align: 'center', ax: cx, ay: sym.minY - gap };
    case 'S': return { x: cx - w / 2, y: sym.maxY + gap, align: 'center', ax: cx, ay: sym.maxY + gap };
    case 'NE': return { x: sym.maxX + d, y: sym.minY - d - h, align: 'left', ax: sym.maxX + d, ay: sym.minY - d };
    case 'SE': return { x: sym.maxX + d, y: sym.maxY + d, align: 'left', ax: sym.maxX + d, ay: sym.maxY + d };
    case 'NW': return { x: sym.minX - d - w, y: sym.minY - d - h, align: 'right', ax: sym.minX - d, ay: sym.minY - d };
    default: return { x: sym.minX - d - w, y: sym.maxY + d, align: 'right', ax: sym.minX - d, ay: sym.maxY + d };
  }
}

/** 四角どうしの重なりの面積 */
function overlapArea(a, b) {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return w > 0 && h > 0 ? w * h : 0;
}

/** 線分が四角（half だけ太らせる）に触れるか（Liang–Barsky） */
function segmentHitsBox(x1, y1, x2, y2, b, half) {
  const minX = b.minX - half;
  const minY = b.minY - half;
  const maxX = b.maxX + half;
  const maxY = b.maxY + half;
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, x1 - minX) && clip(dx, maxX - x1) && clip(-dy, y1 - minY) && clip(dy, maxY - y1);
}

/** 回転した札の外接四角 */
function rotatedBox(x, y, w, h, ax, ay, angle) {
  const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [ax + (px - ax) * c - (py - ay) * s, ay + (px - ax) * s + (py - ay) * c];
  });
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxX: Math.max(...pts.map((p) => p[0])),
    maxY: Math.max(...pts.map((p) => p[1])),
  };
}

/**
 * すべての駅名ラベルを置く
 * @param {import('../core/schema.js').Project} p
 * @param {{
 *   measure: Measure,
 *   level: number,
 *   symbols: Map<string, any>,
 *   passes: Map<string, { dirs: { x: number, y: number }[], lineIds: Set<string> }>,
 *   obstacles: any[],
 * }} o obstacles は線と駅記号の表示リスト
 * @returns {{ items: any[], info: Map<string, { pos: string, box: Box }> }}
 */
export function layoutLabels(p, o) {
  const style = p.style;
  const gap = 3;
  const obstacleIndex = createSpatialIndex();
  for (const it of o.obstacles) obstacleIndex.insert(it);
  const placed = createSpatialIndex();
  const items = [];
  const info = new Map();

  const stations = p.stations
    .filter((st) => {
      if (!st.name && !st.label.schematic.text) return false;
      if (!o.symbols.has(st.id)) return false;
      const lb = st.label.schematic;
      if (lb.hidden === true) return false;
      if (st.rank === 'signal' && lb.hidden !== false) return false; // 信号場は既定で出さない
      if (o.level >= 2 && !MAJOR_RANKS.has(st.rank)) return false;
      return true;
    })
    .sort((a, b) => (RANK_ORDER[a.rank] ?? 9) - (RANK_ORDER[b.rank] ?? 9)
      || (o.passes.get(b.id)?.lineIds.size || 0) - (o.passes.get(a.id)?.lineIds.size || 0)
      || (a.id < b.id ? -1 : 1));

  for (const st of stations) {
    const lb = st.label.schematic;
    const sym = o.symbols.get(st.id).bbox;
    const vertical = lb.orientation === 'vertical';
    const angle = lb.orientation === 'rot45' ? -Math.PI / 4 : lb.orientation === 'rotMinus45' ? Math.PI / 4 : 0;
    const dirs = (o.passes.get(st.id)?.dirs || []).map((d) => {
      const len = Math.hypot(d.x, d.y) || 1;
      return [d.x / len, d.y / len];
    });
    const candidates = lb.pos && lb.pos !== 'auto' ? [lb.pos] : DIRECTIONS;

    let best = null;
    candidates.forEach((dir, order) => {
      const probe = buildBlock(st, { style, subLanguages: p.locale.subLanguages, measure: o.measure, level: o.level, align: 'left', vertical });
      const at = placeAt(dir, sym, probe.w, probe.h, gap);
      const x = at.x + (lb.dx || 0);
      const y = at.y + (lb.dy || 0);
      const ax = at.ax + (lb.dx || 0);
      const ay = at.ay + (lb.dy || 0);
      const box = angle ? rotatedBox(x, y, probe.w, probe.h, ax, ay, angle) : { minX: x, minY: y, maxX: x + probe.w, maxY: y + probe.h };
      let score = order * 0.5;
      if (candidates.length > 1) {
        // 線の向きに沿う側は避ける（直交する側を優先）
        const u = UNIT[dir];
        let along = 0;
        for (const d of dirs) along = Math.max(along, Math.abs(u[0] * d[0] + u[1] * d[1]));
        score += along * 40;
        const area = probe.size * probe.size;
        for (const other of placed.query(box)) score += (overlapArea(box, other.bbox) / area) * 30;
        for (const ob of obstacleIndex.query(box)) {
          if (ob.target && ob.target.type === 'station' && ob.target.id === st.id) continue;
          if (ob.kind === 'path') {
            const pts = ob.pts;
            for (let i = 0; i + 3 < pts.length; i += 2) {
              if (segmentHitsBox(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], box, ob.width / 2)) score += 12;
            }
          } else {
            score += (overlapArea(box, ob.bbox) / area) * 30 + 5;
          }
        }
      }
      if (!best || score < best.score) best = { dir, x, y, ax, ay, box, score, align: at.align };
    });

    const block = buildBlock(st, { style, subLanguages: p.locale.subLanguages, measure: o.measure, level: o.level, align: best.align, vertical });
    const item = {
      kind: 'label',
      x: best.x,
      y: best.y,
      angle,
      ax: best.ax,
      ay: best.ay,
      runs: block.runs,
      halo: MAP_PAPER,
      target: { type: 'label', id: st.id },
      bbox: best.box,
    };
    items.push(item);
    placed.insert(item);
    info.set(st.id, { pos: best.dir, box: best.box });
  }
  return { items, info };
}
