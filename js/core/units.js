// 距離の単位（内部は常に km。表示と入力は Project.locale.distanceUnit）

export const KM_PER_MILE = 1.609344;

/**
 * @param {number} km
 * @param {'km'|'mi'} unit
 */
export function kmToUnit(km, unit) {
  return unit === 'mi' ? km / KM_PER_MILE : km;
}

/**
 * @param {number} v
 * @param {'km'|'mi'} unit
 */
export function unitToKm(v, unit) {
  return unit === 'mi' ? v * KM_PER_MILE : v;
}

/**
 * 0.1単位に丸める（表示用）
 * @param {number} v
 */
export function round1(v) {
  return Math.round(v * 10) / 10 + 0;
}
