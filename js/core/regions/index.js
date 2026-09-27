// 地域パックの取得。フェーズ9でほかの地域を足す
import jp from './jp.js';

/** @typedef {import('../schema.js').RegionPack} RegionPack */

/** @type {Record<string, RegionPack>} */
const packs = { jp };

export const DEFAULT_REGION = 'jp';

/**
 * @param {string} [id]
 * @returns {RegionPack}
 */
export function getRegion(id) {
  return packs[id || DEFAULT_REGION] || packs[DEFAULT_REGION];
}

/** 選べる地域の一覧 */
export function listRegions() {
  return Object.keys(packs);
}

/**
 * 種別の rank から途中駅の停車時間（秒）の既定を返す
 * @param {RegionPack} region
 * @param {number} rank
 */
export function defaultDwellSec(region, rank) {
  for (const r of region.dwellSecByRank) if (rank <= r.maxRank) return r.sec;
  return region.dwellSecByRank[region.dwellSecByRank.length - 1].sec;
}
