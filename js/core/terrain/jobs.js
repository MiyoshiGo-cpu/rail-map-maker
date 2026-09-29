// 地形の仕事（Worker と、Worker が使えないときの画面側の両方から呼ぶ）
import { generateElevation } from './generate.js';
import { generateWorld } from './world.js';
import { getRegion } from '../regions/index.js';
import { geoFromSchematic } from '../geo-layout.js';

/** プレビューのマスの数 */
export const PREVIEW_RESOLUTION = 128;

/**
 * @param {{ kind: 'preview'|'world', seed: string, params: import('../schema.js').TerrainParams, regionId?: string, resolution?: number, romaji?: any, stations?: Array<{ id: string, schematic: { x: number, y: number } | null }> }} job
 *   stations があれば、路線図の配置から駅の地理座標を仮に作って stationGeo（駅 ID → km）で返す
 * @param {(ratio: number) => void} [onProgress]
 */
export function runTerrainJob(job, onProgress) {
  const t0 = Date.now();
  if (job.kind === 'preview') {
    const el = generateElevation(job.seed, job.params, { resolution: job.resolution || PREVIEW_RESOLUTION });
    return { kind: 'preview', width: el.width, height: el.height, data: el.data };
  }
  const { world, analysis } = generateWorld(job.seed, job.params, getRegion(job.regionId), { resolution: job.resolution, onProgress, romaji: job.romaji });
  /** @type {Record<string, { x: number, y: number }>} */
  const stationGeo = {};
  if (job.stations && job.stations.length) {
    for (const [id, g] of geoFromSchematic(/** @type {any} */ (job.stations), analysis)) stationGeo[id] = g;
  }
  return { kind: 'world', world, stationGeo, ms: Date.now() - t0 };
}
