// 路線図の八方向の線（§5.1）：駅間を水平・垂直・45°だけで結ぶ。
// Δx＝0、Δy＝0、|Δx|＝|Δy| なら直線。それ以外は「斜め→直線」か「直線→斜め」の2本で結ぶ。
// auto のときは、前後の区間との角度の変化が小さい方を選ぶ。経由点がある場合は経由点ごとに同じ規則で結ぶ。

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {'auto'|'diagonalFirst'|'straightFirst'} Bend */

/** 向きの番号：0=東 1=南東 2=南 3=南西 4=西 5=北西 6=北 7=北東（y は下向き） */
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/**
 * 2点の向き。八方向でなければ最も近い八方向。同じ点なら null
 * @param {Pt} a @param {Pt} b
 * @returns {number | null}
 */
export function dirOf(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return null;
  const ang = Math.atan2(dy, dx);
  return ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
}

/**
 * 向きの変化（45°単位、0〜4）。どちらかが null なら 0
 * @param {number | null} a @param {number | null} b
 */
export function turn(a, b) {
  if (a === null || b === null) return 0;
  const d = Math.abs(a - b) % 8;
  return Math.min(d, 8 - d);
}

/** @param {number} dx @param {number} dy */
export function isOctilinear(dx, dy) {
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
}

/**
 * 2点を指定の曲がり方で結ぶ点の列（始点と終点を含む）
 * @param {Pt} a @param {Pt} b @param {'diagonalFirst'|'straightFirst'} bend
 * @returns {Pt[]}
 */
export function connect(a, b, bend) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (isOctilinear(dx, dy)) return [a, b];
  const m = Math.min(Math.abs(dx), Math.abs(dy));
  const diag = { x: Math.sign(dx) * m, y: Math.sign(dy) * m };
  if (bend === 'diagonalFirst') return [a, { x: a.x + diag.x, y: a.y + diag.y }, b];
  return [a, { x: b.x - diag.x, y: b.y - diag.y }, b];
}

/**
 * 点の列の最初と最後の向き
 * @param {Pt[]} pts
 */
function endDirs(pts) {
  return { first: dirOf(pts[0], pts[1]), last: dirOf(pts[pts.length - 2], pts[pts.length - 1]) };
}

/**
 * auto の曲がり方を選ぶ
 * @param {Pt} a @param {Pt} b
 * @param {number | null} inDir 手前から入ってくる向き
 * @param {number | null} outDir この先へ出ていく向き
 * @returns {'diagonalFirst'|'straightFirst'}
 */
export function chooseBend(a, b, inDir, outDir) {
  const d = endDirs(connect(a, b, 'diagonalFirst'));
  const s = endDirs(connect(a, b, 'straightFirst'));
  const costD = turn(inDir, d.first) + turn(d.last, outDir);
  const costS = turn(inDir, s.first) + turn(s.last, outDir);
  return costS < costD ? 'straightFirst' : 'diagonalFirst';
}

/**
 * 経由点を含む区間の経路。同じ点が続く場合は省く
 * @param {Pt[]} points 始点・経由点…・終点
 * @param {Bend} bend
 * @param {number | null} [inDir] 前の区間の最後の向き
 * @param {number | null} [outDir] 次の区間の最初の向き（おおよそでよい）
 * @returns {Pt[]}
 */
export function sectionPath(points, bend, inDir = null, outDir = null) {
  const out = [points[0]];
  let prevDir = inDir;
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k];
    const b = points[k + 1];
    if (a.x === b.x && a.y === b.y) continue;
    const next = k + 2 < points.length ? dirOf(b, points[k + 2]) : outDir;
    const mode = bend === 'auto' || !bend ? chooseBend(a, b, prevDir, next) : bend;
    const seg = connect(a, b, mode);
    for (let i = 1; i < seg.length; i++) out.push(seg[i]);
    prevDir = dirOf(seg[seg.length - 2], seg[seg.length - 1]);
  }
  return out;
}

/**
 * 実際に選ばれた曲がり方（切り替えボタン用）。直線なら null
 * @param {Pt} a @param {Pt} b @param {Bend} bend
 * @param {number | null} inDir @param {number | null} outDir
 */
export function resolvedBend(a, b, bend, inDir, outDir) {
  if (isOctilinear(b.x - a.x, b.y - a.y)) return null;
  return bend === 'auto' || !bend ? chooseBend(a, b, inDir, outDir) : bend;
}

/**
 * 点の列から、途中の一直線上の点を取り除く
 * @param {Pt[]} pts
 */
export function simplify(pts) {
  const out = [];
  for (const p of pts) {
    if (out.length && out[out.length - 1].x === p.x && out[out.length - 1].y === p.y) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if (dirOf(a, b) === dirOf(b, p)) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

export { DIRS };
