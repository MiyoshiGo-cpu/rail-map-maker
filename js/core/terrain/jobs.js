// 地形の仕事（Worker と、Worker が使えないときの画面側の両方から呼ぶ）
import { generateElevation } from './generate.js';
import { generateWorld, loadWorld } from './world.js';
import { riverFeatures, regionBorders, waterOutlines } from './features.js';
import { terrainRGBA } from '../../render/terrain-raster.js';
import { getRegion } from '../regions/index.js';
import { geoFromSchematic } from '../geo-layout.js';

/** プレビューのマスの数 */
export const PREVIEW_RESOLUTION = 128;
/** 地理ビューの地形の画像の1辺の画素数の目安 */
const IMAGE_SIZE = 1024;

/**
 * 地理ビューで使うもの（保存した世界から作り直す）
 * @typedef {object} GeoBase
 * @property {'analyze'} kind
 * @property {number} width
 * @property {number} height
 * @property {number} cellKm
 * @property {Int16Array} elevation
 * @property {Uint8Array} water 水の種類（hydrology.js の LAND・SEA・LAKE）
 * @property {Int8Array} regionMap
 * @property {number} threshold 川にする流量（km²）
 * @property {Uint8ClampedArray} rgba 陸の画像（段彩と陰影。imageWidth × imageHeight）。海岸線の形に切り抜いて描く
 * @property {number} imageWidth
 * @property {number} imageHeight
 * @property {Uint8ClampedArray} seaRgba 海の画像（深さの濃淡。width × height）
 * @property {{ land: number[][], lakes: number[][] }} outlines 海岸線と湖岸の輪（km）
 * @property {Array<{ pts: number[], cls: number, flow: number }>} rivers 川の線（km）
 * @property {number[][]} borders 県境の線（km）
 */

/**
 * 保存した世界から、地理ビューで使うもの（地形の画像・川・県境）を作る
 * @param {Extract<import('../schema.js').World, { mode: 'fictional' }>} world
 * @returns {GeoBase}
 */
export function analyzeForView(world) {
  const a = loadWorld(world);
  const { width, height, cellKm, elevation, hydrology, regionMap } = a;
  // 画像は1辺 1024 画素ほどまで細かくする（小は4倍、中は2倍、大はそのまま）
  const scale = Math.max(1, Math.floor(IMAGE_SIZE / width));
  return {
    kind: 'analyze',
    width,
    height,
    cellKm,
    elevation,
    water: hydrology.water,
    regionMap,
    threshold: hydrology.threshold,
    rgba: terrainRGBA(elevation, width, height, { cellKm, scale, layer: 'land' }),
    imageWidth: width * scale,
    imageHeight: height * scale,
    seaRgba: terrainRGBA(elevation, width, height, { cellKm, layer: 'sea' }),
    outlines: waterOutlines(elevation, hydrology.water, hydrology.filled, width, height, cellKm),
    rivers: riverFeatures(hydrology, cellKm),
    borders: regionBorders(regionMap, width, height, cellKm),
  };
}

/**
 * @param {{ kind: 'preview'|'world'|'analyze', seed?: string, params?: import('../schema.js').TerrainParams, regionId?: string, resolution?: number, romaji?: any, stations?: Array<{ id: string, schematic: { x: number, y: number } | null }>, world?: any }} job
 *   stations があれば、路線図の配置から駅の地理座標を仮に作って stationGeo（駅 ID → km）で返す。analyze は world（保存した世界）から GeoBase を作る
 * @param {(ratio: number) => void} [onProgress]
 */
export function runTerrainJob(job, onProgress) {
  const t0 = Date.now();
  if (job.kind === 'analyze') return { ...analyzeForView(job.world), ms: Date.now() - t0 };
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
