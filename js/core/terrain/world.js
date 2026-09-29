// 架空の世界（§3 World の mode: 'fictional'）を作る：標高 → 水系 → 都市 → 県 → 名前。
// 保存するのは標高（Int16 の base64）・都市・県だけ。水系と県の範囲は、読み込んだときに analyzeWorld で作り直す。
import { createRng } from '../rng.js';
import { generateElevation } from './generate.js';
import { quantizeElevation, encodeElevation, decodeElevation } from './codec.js';
import { analyzeHydrology, LAND, SEA } from './hydrology.js';
import { citySuitability, placeCities, regionCount, partitionRegions } from './cities.js';
import { createPlaceNamer } from '../placenames.js';
import { romanize } from '../romaji.js';

/** @typedef {import('../schema.js').TerrainParams} TerrainParams */
/** @typedef {import('../schema.js').RegionPack} RegionPack */
/** @typedef {import('../schema.js').City} City */
/** @typedef {import('../schema.js').Region} Region */

/**
 * 標高から作り直せるもの（保存しない）
 * @typedef {object} WorldAnalysis
 * @property {number} width
 * @property {number} height
 * @property {number} cellKm
 * @property {Int16Array} elevation
 * @property {ReturnType<typeof analyzeHydrology>} hydrology
 * @property {Int8Array} regionMap マスごとの県の番号（world.regions の添字。水は -1）
 */

/**
 * 地名を付ける場所の地形
 * @param {WorldAnalysis['hydrology']} hy
 * @param {Int16Array} elev
 * @param {number} cell
 * @param {number} cellKm
 */
export function placeTerrain(hy, elev, cell, cellKm) {
  const { width, height, water, acc } = hy;
  const x = cell % width;
  const y = (cell - x) / width;
  const r = Math.max(1, Math.round(2 / cellKm));
  let sea = false;
  let river = false;
  for (let dy = -r; dy <= r && !sea; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (water[j] === SEA) { sea = true; break; }
      if (water[j] === LAND && acc[j] >= hy.threshold) river = true;
    }
  }
  if (sea) return 'coast';
  if (elev[cell] > 300) return 'mountain';
  if (river) return 'river';
  return 'plain';
}

/**
 * 標高から水系と県の範囲を作る（生成したときと、読み込んだとき）
 * @param {Int16Array} elevation
 * @param {number} width
 * @param {number} height
 * @param {TerrainParams} params
 * @param {Array<{ pos: { x: number, y: number } }>} capitals 県庁所在地（県の並び順）
 * @returns {WorldAnalysis}
 */
export function analyzeWorld(elevation, width, height, params, capitals) {
  const cellKm = (params.size * params.cellKm) / width;
  const hydrology = analyzeHydrology(elevation, width, height, { cellKm, riverAmount: params.riverAmount });
  const seeds = capitals.map((c) => {
    const x = Math.min(width - 1, Math.max(0, Math.floor(c.pos.x / cellKm)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(c.pos.y / cellKm)));
    return y * width + x;
  });
  const regionMap = seeds.length ? partitionRegions(elevation, hydrology.water, width, height, cellKm, seeds) : new Int8Array(width * height).fill(-1);
  return { width, height, cellKm, elevation, hydrology, regionMap };
}

/**
 * 世界を作る
 * @param {string} seed
 * @param {TerrainParams} params
 * @param {RegionPack} region
 * @param {{ resolution?: number, onProgress?: (ratio: number) => void, romaji?: any }} [opt]
 * @returns {{ world: Extract<import('../schema.js').World, { mode: 'fictional' }>, analysis: WorldAnalysis }}
 */
export function generateWorld(seed, params, region, opt = {}) {
  const progress = opt.onProgress || (() => {});
  const el = generateElevation(seed, params, { resolution: opt.resolution, onProgress: (r) => progress(r * 0.6) });
  const elevation = quantizeElevation(el.data);
  const { width, height, cellKm } = el;
  const hydrology = analyzeHydrology(elevation, width, height, { cellKm, riverAmount: params.riverAmount });
  progress(0.8);

  // 都市：点数の高い順に置き、人口を配る
  const score = citySuitability(elevation, hydrology, cellKm);
  const placed = placeCities(createRng(`${seed}:cities`), score, width, height, {
    cellKm,
    cityCount: params.cityCount,
    totalPopulation: params.totalPopulation,
    kindThresholds: region.cityKindThresholds,
  });

  // 県：大きい都市から数を決めて分け、その都市を県庁所在地にする（ほかの都市はどれも小さいので、県で一番大きい都市になる）
  let land = 0;
  for (let i = 0; i < hydrology.water.length; i++) if (hydrology.water[i] === LAND) land++;
  const k = placed.length ? regionCount(land * cellKm * cellKm, placed.length) : 0;
  const regionMap = k ? partitionRegions(elevation, hydrology.water, width, height, cellKm, placed.slice(0, k).map((c) => c.cell)) : new Int8Array(width * height).fill(-1);
  progress(0.9);

  // 名前：都市は場所の地形に合わせ、県は6割を県庁所在地と同じ名前にする
  const nameRng = createRng(`${seed}:names`);
  const namer = createPlaceNamer(nameRng, region.placeNames);
  const en = (reading) => (region.autoRomanize ? romanize(reading, opt.romaji || region.romajiDefaults) : '');
  /** @type {City[]} */
  const cities = placed.map((c, idx) => {
    const n = namer.name(placeTerrain(hydrology, elevation, c.cell, cellKm));
    return {
      id: `city_${idx + 1}`,
      name: n.name,
      reading: n.reading,
      names: { en: en(n.reading) },
      pos: { x: c.x, y: c.y },
      population: c.population,
      kind: c.kind,
    };
  });
  /** @type {Region[]} */
  const regions = [];
  for (let r = 0; r < k; r++) {
    const capital = cities[r];
    const same = nameRng.next() < 0.6;
    const n = same ? { name: capital.name, reading: capital.reading } : namer.name('plain');
    regions.push({ id: `pref_${r + 1}`, name: n.name, reading: n.reading, names: { en: en(n.reading) }, capitalCityId: capital.id });
  }
  placed.forEach((c, idx) => {
    const r = regionMap[c.cell];
    if (r >= 0) cities[idx].regionId = regions[r].id;
  });
  progress(1);

  return {
    world: {
      mode: 'fictional',
      seed,
      gen: { ...params },
      terrain: { width, height, elevation: encodeElevation(elevation), edits: [] },
      cities,
      regions,
    },
    analysis: { width, height, cellKm, elevation, hydrology, regionMap },
  };
}

/**
 * 保存された世界から、水系と県の範囲を作り直す
 * @param {Extract<import('../schema.js').World, { mode: 'fictional' }>} world
 * @returns {WorldAnalysis}
 */
export function loadWorld(world) {
  const { width, height } = world.terrain;
  const elevation = decodeElevation(world.terrain.elevation, width, height);
  const byId = new Map(world.cities.map((c) => [c.id, c]));
  const capitals = world.regions.map((r) => byId.get(r.capitalCityId)).filter(Boolean);
  return analyzeWorld(elevation, width, height, world.gen, capitals);
}
