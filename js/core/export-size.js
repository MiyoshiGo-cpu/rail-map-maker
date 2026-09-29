// 書き出す画像の大きさ（§5.9）。iPhone の canvas の上限（約1,600万画素）を超えないようにする
/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Box */

/** 総画素数の上限（4096×4096 相当より少し小さく） */
export const MAX_EXPORT_PIXELS = 16_000_000;
/** 1辺の上限（ブラウザの canvas の上限より小さく） */
export const MAX_EXPORT_SIDE = 16_384;
/** 絵のまわりの余白（ズーム1の px） */
export const EXPORT_MARGIN = 24;
/** 選べる倍率 */
export const EXPORT_SCALES = [1, 2, 3, 4];
export const DEFAULT_EXPORT_SCALE = 2;

/**
 * 倍率を掛けた画像の大きさ
 * @param {Box} bounds 絵の範囲（世界座標）
 * @param {number} scale
 * @param {number} [margin]
 * @returns {{ width: number, height: number, pixels: number, fits: boolean }}
 */
export function exportSize(bounds, scale, margin = EXPORT_MARGIN) {
  const width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX + margin * 2) * scale));
  const height = Math.max(1, Math.ceil((bounds.maxY - bounds.minY + margin * 2) * scale));
  const pixels = width * height;
  return { width, height, pixels, fits: pixels <= MAX_EXPORT_PIXELS && width <= MAX_EXPORT_SIDE && height <= MAX_EXPORT_SIDE };
}

/**
 * 上限に収まる最も大きい倍率（選べる倍率から。1倍でも収まらなければ 0.1 刻みで下げる）
 * @param {Box} bounds
 * @param {number} [margin]
 */
export function fittingScale(bounds, margin = EXPORT_MARGIN) {
  for (const s of [...EXPORT_SCALES].reverse()) if (exportSize(bounds, s, margin).fits) return s;
  const one = exportSize(bounds, 1, margin);
  let s = Math.floor(Math.min(Math.sqrt(MAX_EXPORT_PIXELS / one.pixels), MAX_EXPORT_SIDE / Math.max(one.width, one.height)) * 10) / 10;
  while (s > 0.1 && !exportSize(bounds, s, margin).fits) s = Math.round((s - 0.1) * 10) / 10;
  return Math.max(0.1, s);
}
