// 地理ビューの「地図記号」の線（§5.4。地形図の慣習）。DOM に依存しない。
// ・縞にする事業者（地域パックの geoSymbol.stripedCategories。日本では JR）は白黒の縞、それ以外は黒線に短い横線
// ・単線と複線以上は太さで区別する。路面電車・ケーブルカーは細く
// ・地下の区間は破線、トンネルは破線と坑口の印、橋梁は線の両側に細線
// ・建設中は破線、計画は点線で半透明、休止は灰色、廃止は既定で出さない
// 長さはすべて世界座標。画面の 1px に当たる長さ（unit）を掛けて、画面で一定の太さにする。

/** @typedef {{ x: number, y: number }} Pt */

export const SYMBOL_INK = '#262626';
const SYMBOL_GRAY = '#8A8F96';
const WHITE = '#FFFFFF';

/**
 * 線の太さ（画面の px）
 * @param {string} kind 路線の種類
 * @param {number} tracks 線路の数
 */
export function symbolWidth(kind, tracks) {
  if (kind === 'cable') return 1.4;
  if (kind === 'tram') return 1.8;
  return tracks >= 2 ? 3.6 : 2.4;
}

/** 並走する線どうしの間隔（画面の px。いちばん太い線＋すき間） */
export const SYMBOL_SPACING = 6;

/**
 * 状態による描き分け
 * @param {string} status
 * @param {boolean} showAbolished
 * @returns {{ hidden: boolean, alpha: number, gray: boolean, dash: 'construction'|'planned'|null }}
 */
export function symbolStatus(status, showAbolished) {
  switch (status) {
    case 'construction': return { hidden: false, alpha: 1, gray: false, dash: 'construction' };
    case 'planned': return { hidden: false, alpha: 0.5, gray: false, dash: 'planned' };
    case 'suspended': return { hidden: false, alpha: 1, gray: true, dash: null };
    case 'abolished': return { hidden: !showAbolished, alpha: 0.5, gray: true, dash: 'planned' };
    default: return { hidden: false, alpha: 1, gray: false, dash: null };
  }
}

/** 点の並びの範囲 */
function boxOf(flat, pad) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    if (flat[i] < minX) minX = flat[i];
    if (flat[i] > maxX) maxX = flat[i];
    if (flat[i + 1] < minY) minY = flat[i + 1];
    if (flat[i + 1] > maxY) maxY = flat[i + 1];
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

const flatOf = (pts) => {
  const out = [];
  for (const q of pts) out.push(q.x, q.y);
  return out;
};

/** 単位ベクトル */
function unitVec(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * 点の並びを左右にずらす（角は留め継ぎ。geometry.js の offsetPolyline と同じだが、ここでは依存を増やさない）
 * @param {Pt[]} pts
 * @param {number} d 進む向きの右が正
 */
function offset(pts, d) {
  const n = pts.length;
  const normals = [];
  for (let i = 0; i < n - 1; i++) {
    const t = unitVec(pts[i], pts[i + 1]);
    normals.push({ x: -t.y, y: t.x });
  }
  return pts.map((p, i) => {
    let m;
    if (i === 0) m = normals[0];
    else if (i === n - 1) m = normals[n - 2];
    else {
      const a = normals[i - 1];
      const b = normals[i];
      const den = 1 + a.x * b.x + a.y * b.y;
      m = den < 0.1 ? b : { x: (a.x + b.x) / den, y: (a.y + b.y) / den };
    }
    return { x: p.x + m.x * d, y: p.y + m.y * d };
  });
}

/**
 * トンネルの坑口の印（「⊐」の形。開いた側がトンネルの外）
 * @param {Pt} p 端の点
 * @param {Pt} into トンネルの中へ向かう単位ベクトル
 * @param {number} half 横棒の半分の長さ
 * @param {number} arm 外へ出る腕の長さ
 */
function portalPts(p, into, half, arm) {
  const nx = -into.y;
  const ny = into.x;
  return [
    p.x + nx * half - into.x * arm, p.y + ny * half - into.y * arm,
    p.x + nx * half, p.y + ny * half,
    p.x - nx * half, p.y - ny * half,
    p.x - nx * half - into.x * arm, p.y - ny * half - into.y * arm,
  ];
}

/**
 * 区間1つ分の地図記号の線（表示リストの path の並び）。最初の要素が線そのもの（当たり判定と選択の強調に使う）
 * @param {{
 *   pts: Pt[],
 *   kind: string,
 *   tracks: number,
 *   structure: string,
 *   status: string,
 *   striped: boolean,
 *   unit: number,
 *   showAbolished: boolean,
 *   portalStart?: boolean,
 *   portalEnd?: boolean,
 * }} o pts は世界座標。portalStart・portalEnd はトンネルの坑口を描く端（隣の区間がトンネルでないとき）
 * @returns {any[]} 空なら描かない（廃止で非表示など）
 */
export function symbolSectionItems(o) {
  const st = symbolStatus(o.status, o.showAbolished);
  if (st.hidden || o.pts.length < 2) return [];
  const u = o.unit;
  const w = symbolWidth(o.kind, o.tracks) * u;
  const ink = st.gray ? SYMBOL_GRAY : SYMBOL_INK;
  const flat = flatOf(o.pts);
  const base = { kind: 'path', pts: flat, radius: 0, alpha: st.alpha, bbox: boxOf(flat, w) };
  const items = [];
  const thin = Math.max(u, w * 0.55);

  if (st.dash) {
    // 建設中・計画・廃止：黒い破線（点線）だけ
    const dash = st.dash === 'construction' ? [w * 1.6, w * 0.9] : [w * 0.5, w * 0.9];
    items.push({ ...base, width: thin, color: ink, dash, cap: 'butt' });
  } else if (o.structure === 'underground' || o.structure === 'tunnel') {
    // 地下・トンネル：破線
    items.push({ ...base, width: thin, color: ink, dash: [5 * u, 3 * u], cap: 'butt' });
  } else if (o.striped) {
    // 縞：黒い線の中に白い破線
    items.push({ ...base, width: w, color: ink, cap: 'butt' });
    items.push({ ...base, width: w * 0.5, color: WHITE, dash: [w * 1.8, w * 1.8], cap: 'butt', bbox: base.bbox });
  } else {
    // 黒線に短い横線（太い線をごく短い破線にすると、線に直交する横線になる）
    items.push({ ...base, width: thin, color: ink, cap: 'butt' });
    items.push({ ...base, width: w * 2.2, color: ink, dash: [Math.max(0.8 * u, w * 0.3), w * 2.4], cap: 'butt', bbox: boxOf(flat, w * 1.2) });
  }

  // 橋梁：線の両側に細線（端は外へ少し開く）
  if (o.structure === 'bridge' && !st.dash) {
    const gap = w / 2 + 1.8 * u;
    const flare = 1.8 * u;
    // 始点・終点の進む向き（t0・t1）と、その右側の法線（n0・n1）
    const t0 = unitVec(o.pts[0], o.pts[1]);
    const t1 = unitVec(o.pts[o.pts.length - 2], o.pts[o.pts.length - 1]);
    const n0 = { x: -t0.y, y: t0.x };
    const n1 = { x: -t1.y, y: t1.x };
    for (const side of [1, -1]) {
      const line = offset(o.pts, gap * side);
      const start = line[0];
      const end = line[line.length - 1];
      // 端は、線の外（進む向きの逆・先）へ、線から離れる向きに開く
      const pts = [
        { x: start.x + (-t0.x + n0.x * side) * flare, y: start.y + (-t0.y + n0.y * side) * flare },
        ...line,
        { x: end.x + (t1.x + n1.x * side) * flare, y: end.y + (t1.y + n1.y * side) * flare },
      ];
      const f = flatOf(pts);
      items.push({ kind: 'path', pts: f, radius: 0, width: 0.9 * u, color: ink, alpha: st.alpha, cap: 'butt', bbox: boxOf(f, u) });
    }
  }

  // トンネルの坑口
  if (o.structure === 'tunnel' && !st.dash) {
    const n = o.pts.length;
    const ends = [];
    if (o.portalStart) ends.push({ p: o.pts[0], into: unitVec(o.pts[0], o.pts[1]) });
    if (o.portalEnd) ends.push({ p: o.pts[n - 1], into: unitVec(o.pts[n - 1], o.pts[n - 2]) });
    for (const e of ends) {
      const f = portalPts(e.p, e.into, w * 0.9 + 1.5 * u, 2 * u);
      items.push({ kind: 'path', pts: f, radius: 0, width: 1.2 * u, color: ink, alpha: st.alpha, cap: 'butt', bbox: boxOf(f, u) });
    }
  }
  return items;
}
