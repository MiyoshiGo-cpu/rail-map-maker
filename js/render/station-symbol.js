// 駅の記号（§5.2）：白丸・カプセル・角丸四角・目盛り・信号場・貨物駅・車両基地。路線図と凡例で使う
import { collinearExtent, boundsOf } from '../core/geometry.js';
import { paperOf } from './styles.js';

/** @typedef {{ x: number, y: number }} Pt */

/**
 * 駅の記号（§5.2）。最初の要素が駅そのもの（選択の輪を合わせる）
 * @param {import('../core/schema.js').Station} st
 * @param {Pt} center
 * @param {{ pts: Pt[], dirs: Pt[] } | undefined} pass
 * @param {number} lineCount
 * @param {import('../core/schema.js').MapStyle} style
 * @param {string} stroke
 * @param {string} tickColor 目盛り（広域のスタイルの一般駅）の色＝通る路線の色
 * @param {number} [unit] 画面の1px に当たる長さ（地理ビューで、決まった太さの縁などを縮尺に合わせる）
 * @returns {any[]}
 */
export function stationSymbol(st, center, pass, lineCount, style, stroke, tickColor, unit = 1) {
  const target = { type: 'station', id: st.id };
  const base = style.stationRadius;
  const sw = 2 * unit; // 縁の太さ
  const paper = paperOf(style);
  const circle = (c, r, extra = {}) => ({
    kind: 'circle', x: c.x, y: c.y, r, fill: paper, stroke, lineWidth: sw, target,
    bbox: { minX: c.x - r - sw, minY: c.y - r - sw, maxX: c.x + r + sw, maxY: c.y + r + sw },
    ...extra,
  });
  const pts = pass ? pass.pts : [];
  const dir = pass && pass.dirs.length ? pass.dirs[0] : { x: 1, y: 0 };
  const dlen = Math.hypot(dir.x, dir.y) || 1;
  const along = { x: dir.x / dlen, y: dir.y / dlen };
  const across = { x: -along.y, y: along.x };

  switch (st.rank) {
    case 'signal': {
      // 線に直交する短い線
      const L = base + 3 * unit;
      const c = pts[0] || center;
      return [{
        kind: 'path', pts: [c.x - across.x * L, c.y - across.y * L, c.x + across.x * L, c.y + across.y * L],
        radius: 0, width: 2.5 * unit, color: stroke, cap: 'butt', target,
        bbox: { minX: c.x - L - sw, minY: c.y - L - sw, maxX: c.x + L + sw, maxY: c.y + L + sw },
      }];
    }
    case 'freight': {
      const s = base * 1.8;
      const c = pts[0] || center;
      return [{
        kind: 'rrect', x: c.x, y: c.y, w: s, h: s, r: unit, fill: paper, stroke, lineWidth: sw, target,
        bbox: { minX: c.x - s / 2 - sw, minY: c.y - s / 2 - sw, maxX: c.x + s / 2 + sw, maxY: c.y + s / 2 + sw },
      }];
    }
    case 'depot': {
      // 本線の脇の小さな四角と短い引込線
      const c = pts[0] || center;
      const off = base * 2.6;
      const q = { x: c.x + across.x * off, y: c.y + across.y * off };
      const s = base * 1.4;
      return [
        {
          kind: 'rrect', x: q.x, y: q.y, w: s, h: s, r: unit, fill: paper, stroke, lineWidth: sw, target,
          bbox: { minX: Math.min(c.x, q.x) - s, minY: Math.min(c.y, q.y) - s, maxX: Math.max(c.x, q.x) + s, maxY: Math.max(c.y, q.y) + s },
        },
        {
          kind: 'path', pts: [c.x, c.y, q.x, q.y], radius: 0, width: 1.5 * unit, color: stroke, cap: 'butt',
          bbox: { minX: Math.min(c.x, q.x) - unit, minY: Math.min(c.y, q.y) - unit, maxX: Math.max(c.x, q.x) + unit, maxY: Math.max(c.y, q.y) + unit },
        },
      ];
    }
    default:
      break;
  }

  // 広域のスタイル：1つの路線だけが通る一般駅は、線の片側に出た短い目盛り
  if (style.stationSymbol === 'tick' && lineCount <= 1 && pts.length && (st.rank === 'normal' || st.rank === 'unstaffed' || st.rank === 'temporary')) {
    const c = pts[0];
    const L = style.lineWidth / 2 + Math.max(4 * unit, style.lineWidth * 1.4);
    const w = Math.max(1.5 * unit, style.lineWidth * 0.6);
    const e = { x: c.x + across.x * L, y: c.y + across.y * L };
    return [{
      kind: 'path', pts: [c.x, c.y, e.x, e.y], radius: 0, width: w, color: tickColor, cap: 'butt', target,
      dash: st.rank === 'temporary' ? [w, w * 0.6] : null,
      bbox: { minX: Math.min(c.x, e.x) - w, minY: Math.min(c.y, e.y) - w, maxX: Math.max(c.x, e.x) + w, maxY: Math.max(c.y, e.y) + w },
    }];
  }

  let r = base;
  if (st.rank === 'terminal') r = base * 1.4;
  else if (st.rank === 'unstaffed') r = base * 0.75;
  const dash = st.rank === 'temporary' ? [2.5 * unit, 2 * unit] : null;

  if (lineCount >= 2 && pts.length) {
    // 複数の路線が通る駅：線が通る点をすべて覆う白いカプセル（一直線に並ばなければ角丸四角）
    const rc = Math.max(r, style.lineWidth / 2 + sw + unit);
    const ext = collinearExtent(pts, 0.5 * unit);
    if (ext) {
      if (ext.a.x === ext.b.x && ext.a.y === ext.b.y) return [circle(ext.a, rc + unit, { dash })];
      return [{
        kind: 'capsule', x1: ext.a.x, y1: ext.a.y, x2: ext.b.x, y2: ext.b.y, r: rc,
        fill: paper, stroke, lineWidth: sw, dash, target,
        bbox: {
          minX: Math.min(ext.a.x, ext.b.x) - rc - sw, minY: Math.min(ext.a.y, ext.b.y) - rc - sw,
          maxX: Math.max(ext.a.x, ext.b.x) + rc + sw, maxY: Math.max(ext.a.y, ext.b.y) + rc + sw,
        },
      }];
    }
    const b = boundsOf(pts);
    const w = b.maxX - b.minX + rc * 2;
    const hgt = b.maxY - b.minY + rc * 2;
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    return [{
      kind: 'rrect', x: c.x, y: c.y, w, h: hgt, r: rc, fill: paper, stroke, lineWidth: sw, dash, target,
      bbox: { minX: c.x - w / 2 - sw, minY: c.y - hgt / 2 - sw, maxX: c.x + w / 2 + sw, maxY: c.y + hgt / 2 + sw },
    }];
  }
  return [circle(pts[0] || center, r, { dash })];
}
