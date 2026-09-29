// 見た目の設定（§5.8 MapStyle）：スタイルプリセットの適用
import { getRegion } from './regions/index.js';

/** @typedef {import('./schema.js').MapStyle} MapStyle */

/**
 * 地域パックのスタイルプリセット
 * @param {string} [regionId]
 */
export function stylePresets(regionId) {
  return getRegion(regionId).stylePresets;
}

/**
 * プリセットの値で詳細設定をまとめて書き換えた設定（プリセットに無い項目はそのまま）
 * @param {MapStyle} style
 * @param {string} presetId
 * @param {string} [regionId]
 * @returns {MapStyle}
 */
export function applyStylePreset(style, presetId, regionId) {
  const preset = stylePresets(regionId).find((x) => x.id === presetId);
  if (!preset) return style;
  return { ...style, ...preset.values, preset: presetId };
}

/**
 * 今の設定がプリセットの値と同じか（詳細設定を変えたら false）
 * @param {MapStyle} style
 * @param {string} [regionId]
 */
export function matchesPreset(style, regionId) {
  const preset = stylePresets(regionId).find((x) => x.id === style.preset);
  return !!preset && Object.entries(preset.values).every(([k, v]) => style[k] === v);
}
