// 地形の下ごしらえ（core/terrain/jobs.js の GeoBase）を、世界ごとに1回だけ Worker に頼んで使い回す。
// 地理ビュー（地形の画像・川・県境）と、チェックのトンネル・橋梁の提案の両方で使う。
// 標高・パラメータ・県が同じなら同じ世界とみなす（都市の名前を変えただけなら作り直さない）。
import { requestTerrain } from './terrain-client.js';

/** @typedef {import('../core/terrain/jobs.js').GeoBase} GeoBase */

/** @type {{ key: any[], promise: Promise<GeoBase>, base: GeoBase | null } | null} */
let current = null;

/** @param {any} world */
const keyOf = (world) => [world.terrain, world.gen, world.regions];
const same = (a, b) => a.every((v, i) => v === b[i]);

/**
 * 地形の下ごしらえを頼む（同じ世界なら、前の結果か作っている途中のものを返す）
 * @param {Extract<import('../core/schema.js').World, { mode: 'fictional' }>} world
 * @returns {Promise<GeoBase>}
 */
export function loadGeoBase(world) {
  const key = keyOf(world);
  if (current && same(current.key, key)) return current.promise;
  /** @type {any} */
  const entry = { key, base: null, promise: null };
  entry.promise = requestTerrain({ kind: 'analyze', world }).then((res) => {
    entry.base = res;
    return res;
  }, (e) => {
    // 失敗したら、次に頼まれたときにやり直す
    if (current === entry) current = null;
    throw e;
  });
  current = entry;
  return entry.promise;
}

/**
 * 読み込み済みなら地形の下ごしらえ（まだなら null）
 * @param {Extract<import('../core/schema.js').World, { mode: 'fictional' }>} world
 * @returns {GeoBase | null}
 */
export function readyGeoBase(world) {
  return current && same(current.key, keyOf(world)) ? current.base : null;
}

/** 覚えている結果を捨てる（エディタを閉じたとき。画像の分の画素が大きいので） */
export function clearGeoBase() {
  current = null;
}
