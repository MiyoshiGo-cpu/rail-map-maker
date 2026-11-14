// 地形ブラシ（§6.7）。DOM に依存しない。
// 1回のなぞり（ストローク）を { tool, r, s, pts } で記録し（World.terrain.edits）、元の標高（Int16）に順に当てて作り直す。
// ・盛る／削る：なぞった範囲を、中心ほど強く上げ下げする
// ・平らに：なぞり始めの高さに近づける　・なめらかに：周りの平均に近づける
// ・陸にする／海にする：範囲の中を陸（2m 以上）／水（-2m 以下）にする。海につながらない水は湖になる
// ・川を描く：なぞった道筋を高い方から低い方へ下り続ける溝に掘り、道筋を水系の計算に渡す（hydrology.js の channels）
// 都市を置くブラシは地形を変えないので、ここでは扱わない（World.cities に直接足す）。
// 計算は四則演算と比較・丸めだけにして、どのブラウザでも同じ結果にする。

/** @typedef {'raise'|'lower'|'flatten'|'smooth'|'land'|'sea'|'river'|'city'} BrushTool */
/**
 * 1回のなぞり
 * @typedef {object} BrushStroke
 * @property {Exclude<BrushTool, 'city'>} tool
 * @property {number} r 半径（km）
 * @property {number} s 強さ（0〜1）
 * @property {number[]} pts なぞった点（km。x, y の並び）
 */

/** ブラシの種類（パネルの並び順） */
export const BRUSH_TOOLS = /** @type {BrushTool[]} */ (['raise', 'lower', 'flatten', 'smooth', 'land', 'sea', 'river', 'city']);
/** 地形を変えるブラシ */
const TERRAIN_TOOLS = new Set(['raise', 'lower', 'flatten', 'smooth', 'land', 'sea', 'river']);

/** 標高の範囲（m） */
const ELEV_MIN = -8000;
const ELEV_MAX = 6000;
/** 盛る・削るの、強さ 100% で中心を動かす高さ（m） */
export const RAISE_M = 200;
/** 陸にする：いちばん低い所の高さと、中心の上げ幅（強さ 100%） */
const LAND_MIN = 2;
const LAND_RISE = 30;
/** 海にする：いちばん浅い所の深さと、中心の下げ幅（強さ 100%） */
const SEA_MAX = -2;
const SEA_DEPTH = 30;
/** 川：周りより掘る深さと、1マスごとに下げる高さ（m） */
export const RIVER_DEPTH = 6;
const RIVER_DROP = 1;

const clampElev = (v) => Math.min(ELEV_MAX, Math.max(ELEV_MIN, Math.round(v)));
const round2 = (v) => Math.round(v * 100) / 100 + 0;

/**
 * 記録する形にそろえる（点は 0.01km 単位、強さは 0〜1）
 * @param {BrushStroke} s
 * @returns {BrushStroke}
 */
export function normalizeStroke(s) {
  return {
    tool: s.tool,
    r: Math.max(0.01, round2(s.r)),
    s: Math.min(1, Math.max(0, round2(s.s))),
    pts: s.pts.map(round2),
  };
}

/**
 * 点の並びを、間隔 step 以下になるように点を足す（元の点は残す）
 * @param {number[]} pts x, y の並び
 * @param {number} step
 */
function densify(pts, step) {
  const out = [pts[0], pts[1]];
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const ax = pts[i - 2];
    const ay = pts[i - 1];
    const dx = pts[i] - ax;
    const dy = pts[i + 1] - ay;
    const n = Math.ceil(Math.sqrt(dx * dx + dy * dy) / step);
    for (let k = 1; k <= n; k++) out.push(ax + (dx * k) / n, ay + (dy * k) / n);
  }
  return out;
}

/**
 * なぞった範囲の重み（ブラシの中心で 1、半径の所で 0。重なった所は大きい方）
 * @param {BrushStroke} stroke
 * @param {number} width @param {number} height @param {number} cellKm
 * @returns {{ x0: number, y0: number, bw: number, bh: number, m: Float64Array } | null} マスの範囲と重み（範囲の外なら null）
 */
export function strokeMask(stroke, width, height, cellKm) {
  if (!stroke.pts.length) return null;
  const rc = Math.max(0.75, stroke.r / cellKm);
  const pts = densify(stroke.pts, Math.max(cellKm * 0.5, stroke.r * 0.25));
  // マスの中心を整数に合わせた座標
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] / cellKm - 0.5;
    const y = pts[i + 1] / cellKm - 0.5;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const x0 = Math.max(0, Math.floor(minX - rc));
  const y0 = Math.max(0, Math.floor(minY - rc));
  const x1 = Math.min(width - 1, Math.ceil(maxX + rc));
  const y1 = Math.min(height - 1, Math.ceil(maxY + rc));
  if (x1 < x0 || y1 < y0) return null;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const m = new Float64Array(bw * bh);
  const r2 = rc * rc;
  for (let i = 0; i < pts.length; i += 2) {
    const sx = pts[i] / cellKm - 0.5;
    const sy = pts[i + 1] / cellKm - 0.5;
    const cx0 = Math.max(x0, Math.ceil(sx - rc));
    const cx1 = Math.min(x1, Math.floor(sx + rc));
    const cy0 = Math.max(y0, Math.ceil(sy - rc));
    const cy1 = Math.min(y1, Math.floor(sy + rc));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const d2 = (cx - sx) * (cx - sx) + (cy - sy) * (cy - sy);
        if (d2 >= r2) continue;
        let f = 1 - d2 / r2;
        f *= f;
        const k = (cy - y0) * bw + (cx - x0);
        if (f > m[k]) m[k] = f;
      }
    }
  }
  return { x0, y0, bw, bh, m };
}

/**
 * 周りの平均（窓は (2k+1) 四方。地図の外は数えない）
 * @param {Int16Array} elev
 * @param {number} width @param {number} height
 * @param {{ x0: number, y0: number, bw: number, bh: number }} box
 * @param {number} k
 * @returns {Float64Array} box の中の平均
 */
function boxAverage(elev, width, height, box, k) {
  // 窓が届く範囲の累積和
  const ex0 = Math.max(0, box.x0 - k);
  const ey0 = Math.max(0, box.y0 - k);
  const ex1 = Math.min(width - 1, box.x0 + box.bw - 1 + k);
  const ey1 = Math.min(height - 1, box.y0 + box.bh - 1 + k);
  const ew = ex1 - ex0 + 1;
  const eh = ey1 - ey0 + 1;
  const sum = new Float64Array((ew + 1) * (eh + 1));
  for (let y = 0; y < eh; y++) {
    let row = 0;
    for (let x = 0; x < ew; x++) {
      row += elev[(ey0 + y) * width + ex0 + x];
      sum[(y + 1) * (ew + 1) + x + 1] = sum[y * (ew + 1) + x + 1] + row;
    }
  }
  const out = new Float64Array(box.bw * box.bh);
  for (let y = 0; y < box.bh; y++) {
    for (let x = 0; x < box.bw; x++) {
      const gx = box.x0 + x - ex0;
      const gy = box.y0 + y - ey0;
      const ax = Math.max(0, gx - k);
      const ay = Math.max(0, gy - k);
      const bx = Math.min(ew - 1, gx + k) + 1;
      const by = Math.min(eh - 1, gy + k) + 1;
      const s = sum[by * (ew + 1) + bx] - sum[ay * (ew + 1) + bx] - sum[by * (ew + 1) + ax] + sum[ay * (ew + 1) + ax];
      out[y * box.bw + x] = s / ((bx - ax) * (by - ay));
    }
  }
  return out;
}

/** 点（km）のマス */
function cellAt(x, y, width, height, cellKm) {
  const cx = Math.min(width - 1, Math.max(0, Math.floor(x / cellKm)));
  const cy = Math.min(height - 1, Math.max(0, Math.floor(y / cellKm)));
  return cy * width + cx;
}

/**
 * なぞった道筋のマス（隣り合う8方向でつながる並び。同じマスに戻ったら、その間の輪は外す）
 * @param {number[]} pts km
 * @param {number} width @param {number} height @param {number} cellKm
 * @returns {number[]}
 */
export function pathCells(pts, width, height, cellKm) {
  const out = [];
  /** @type {Map<number, number>} マス → out の中の位置 */
  const at = new Map();
  const add = (c) => {
    const k = at.get(c);
    if (k !== undefined) {
      // 輪を外す
      for (let j = k + 1; j < out.length; j++) at.delete(out[j]);
      out.length = k + 1;
      return;
    }
    at.set(c, out.length);
    out.push(c);
  };
  let prev = -1;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const c = cellAt(pts[i], pts[i + 1], width, height, cellKm);
    if (prev < 0) {
      add(c);
    } else if (c !== prev) {
      const px = prev % width;
      const py = (prev - px) / width;
      const dx = (c % width) - px;
      const dy = (c - (c % width)) / width - py;
      const n = Math.max(Math.abs(dx), Math.abs(dy));
      for (let k = 1; k <= n; k++) add((py + Math.round((dy * k) / n)) * width + px + Math.round((dx * k) / n));
    }
    prev = c;
  }
  return out;
}

/**
 * 川を描く：道筋を高い方から低い方へ向け、下り続ける溝に掘る。水（0m 以下）に着いたらそこまで
 * @returns {Int32Array} 掘った道筋（上流から下流へ）
 */
function carveRiver(elev, width, height, cellKm, stroke) {
  let cells = pathCells(stroke.pts, width, height, cellKm);
  if (!cells.length) return new Int32Array(0);
  // 川は高い方から流れる
  if (elev[cells[0]] < elev[cells[cells.length - 1]]) cells = cells.reverse();
  const out = [];
  let level = Infinity;
  for (const c of cells) {
    const e = elev[c];
    if (e <= 0) break;
    level = Math.min(level - RIVER_DROP, e - RIVER_DEPTH);
    // 陸は陸のまま（海や湖にしない）
    elev[c] = clampElev(Math.max(Math.min(e, level), Math.min(e, 1)));
    out.push(c);
  }
  return Int32Array.from(out);
}

/**
 * 1回のなぞりを標高に当てる（elev を書き換える）
 * @param {Int16Array} elev
 * @param {number} width @param {number} height @param {number} cellKm
 * @param {BrushStroke} stroke
 * @returns {Int32Array | null} 川を描いたときは掘った道筋
 */
export function applyStroke(elev, width, height, cellKm, stroke) {
  if (stroke.tool === 'river') return carveRiver(elev, width, height, cellKm, stroke);
  const mk = strokeMask(stroke, width, height, cellKm);
  if (!mk) return null;
  const s = Math.min(1, Math.max(0, stroke.s));
  const { x0, y0, bw, bh, m } = mk;
  const target = stroke.tool === 'flatten' ? elev[cellAt(stroke.pts[0], stroke.pts[1], width, height, cellKm)] : 0;
  const avg = stroke.tool === 'smooth' ? boxAverage(elev, width, height, mk, Math.max(1, Math.round(stroke.r / cellKm / 3))) : null;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const w = m[y * bw + x];
      if (w <= 0) continue;
      const i = (y0 + y) * width + x0 + x;
      const e = elev[i];
      let v = e;
      switch (stroke.tool) {
        case 'raise': v = e + w * s * RAISE_M; break;
        case 'lower': v = e - w * s * RAISE_M; break;
        case 'flatten': v = e + (target - e) * w * s; break;
        case 'smooth': v = e + (avg[y * bw + x] - e) * w * s; break;
        case 'land': v = Math.max(e, LAND_MIN + LAND_RISE * s * w); break;
        case 'sea': v = Math.min(e, SEA_MAX - SEA_DEPTH * s * w); break;
        default: break;
      }
      elev[i] = clampElev(v);
    }
  }
  return null;
}

/**
 * 元の標高に、記録したなぞりを順に当てる
 * @param {Int16Array} base 元の標高（書き換えない）
 * @param {number} width @param {number} height @param {number} cellKm
 * @param {BrushStroke[] | undefined} edits
 * @returns {{ elevation: Int16Array, channels: Int32Array[] }} 当てた標高と、川を描いた道筋
 */
export function applyEdits(base, width, height, cellKm, edits) {
  const list = (edits || []).filter((e) => e && TERRAIN_TOOLS.has(e.tool) && Array.isArray(e.pts) && e.pts.length >= 2);
  if (!list.length) return { elevation: base, channels: [] };
  const elevation = Int16Array.from(base);
  const channels = [];
  for (const st of list) {
    const ch = applyStroke(elevation, width, height, cellKm, st);
    if (ch && ch.length > 1) channels.push(ch);
  }
  return { elevation, channels };
}
