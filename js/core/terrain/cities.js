// 都市（§6.7 の手順5）と県（手順6）。
// 都市：平坦・低地・海岸や川の近く・河口ほど点数を高くし、互いに間隔を空けて置く。人口は順位規模の法則（Zipf）で配る。
// 県：主要都市のまわりで陸地を分ける（山を越えるほど遠いとみなすので、境は尾根に沿いやすい）。各県で一番大きい都市が県庁所在地。
import { LAND, SEA } from './hydrology.js';

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
const DIST = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

/**
 * 候補の点数（陸のマスだけ。水は -1）
 * @param {Int16Array | Float32Array} elev
 * @param {ReturnType<import('./hydrology.js').analyzeHydrology>} hy
 * @param {number} cellKm
 * @returns {Float32Array}
 */
export function citySuitability(elev, hy, cellKm) {
  const { width, height, water, acc } = hy;
  const n = width * height;
  // 海までの距離（マス）を幅優先で数える（遠くは8km で打ち切り）
  const maxD = Math.max(2, Math.round(8 / cellKm));
  const seaDist = new Int16Array(n).fill(maxD);
  let front = [];
  for (let i = 0; i < n; i++) if (water[i] === SEA) { seaDist[i] = 0; front.push(i); }
  for (let d = 1; d < maxD && front.length; d++) {
    const next = [];
    for (const i of front) {
      const x = i % width;
      const y = (i - x) / width;
      for (let k = 0; k < 8; k += 2) {
        const nx = x + DX[k];
        const ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (seaDist[j] <= d) continue;
        seaDist[j] = d;
        next.push(j);
      }
    }
    front = next;
  }
  const score = new Float32Array(n).fill(-1);
  const riverT = hy.threshold;
  // 地図の縁の近く（1辺の3%）には置かない
  const m = Math.max(1, Math.round(Math.max(width, height) * 0.03));
  for (let y = m; y < height - m; y++) {
    for (let x = m; x < width - m; x++) {
      const i = y * width + x;
      if (water[i] !== LAND) continue;
      const h = elev[i];
      // 傾き（m/km）
      const gx = (elev[i + 1] - elev[i - 1]) / (2 * cellKm);
      const gy = (elev[i + width] - elev[i - width]) / (2 * cellKm);
      const slope = Math.sqrt(gx * gx + gy * gy);
      const flat = 1 / (1 + slope / 25);
      const low = h < 50 ? 1 : h < 400 ? 1 - (h - 50) / 500 : 0.2 * 150 / (h - 250);
      const coast = seaDist[i] < maxD ? 0.6 * (1 - seaDist[i] / maxD) : 0;
      const river = acc[i] >= riverT ? 0.5 + Math.min(0.5, acc[i] / (riverT * 20)) : acc[i] >= riverT * 0.3 ? 0.25 : 0;
      // 河口（川が海に出る所）
      const mouth = river > 0 && seaDist[i] <= 2 ? 0.8 : 0;
      score[i] = flat * low * (1 + coast + river + mouth);
    }
  }
  return score;
}

/**
 * 都市を置く
 * @param {{ next: () => number }} rng
 * @param {Float32Array} score citySuitability の結果
 * @param {number} width
 * @param {number} height
 * @param {{ cellKm: number, cityCount: number, totalPopulation: number, kindThresholds: { metropolis: number, city: number, town: number } }} opt
 * @returns {Array<{ cell: number, x: number, y: number, population: number, kind: 'metropolis'|'city'|'town'|'village' }>} x, y は km
 */
export function placeCities(rng, score, width, height, opt) {
  const n = width * height;
  let land = 0;
  for (let i = 0; i < n; i++) if (score[i] >= 0) land++;
  const count = Math.max(0, Math.round(opt.cityCount));
  if (!count || !land) return [];
  // 間隔：陸の面積を都市の数で割った広さの目安の半分ほど
  const spacing = Math.max(3, 0.55 * Math.sqrt((land * opt.cellKm * opt.cellKm) / count)) / opt.cellKm;
  // 点数に少しゆらぎを足して並べる（2マスおきに調べて速くする）
  const cand = [];
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const i = y * width + x;
      if (score[i] <= 0) continue;
      cand.push({ i, s: score[i] * (0.85 + 0.3 * rng.next()) });
    }
  }
  cand.sort((a, b) => b.s - a.s || a.i - b.i);
  const chosen = [];
  const s2 = spacing * spacing;
  for (const c of cand) {
    if (chosen.length >= count) break;
    const x = c.i % width;
    const y = (c.i - x) / width;
    if (chosen.some((o) => (o.gx - x) * (o.gx - x) + (o.gy - y) * (o.gy - y) < s2)) continue;
    chosen.push({ cell: c.i, gx: x, gy: y });
  }
  // 人口：点数の高い順に 1/順位 で配る
  let hsum = 0;
  for (let r = 1; r <= chosen.length; r++) hsum += 1 / r;
  const t = opt.kindThresholds;
  return chosen.map((c, k) => {
    const population = Math.round((opt.totalPopulation / hsum) / (k + 1));
    const kind = population >= t.metropolis ? 'metropolis' : population >= t.city ? 'city' : population >= t.town ? 'town' : 'village';
    return { cell: c.cell, x: (c.gx + 0.5) * opt.cellKm, y: (c.gy + 0.5) * opt.cellKm, population, kind };
  });
}

/**
 * 県の数の目安（陸の面積から。都市の数より多くしない）
 * @param {number} landKm2
 * @param {number} cityCount
 */
export function regionCount(landKm2, cityCount) {
  return Math.max(1, Math.min(12, cityCount, Math.round(landKm2 / 7000)));
}

/**
 * 陸地を県に分ける（主要都市から広げる。山を登るほど遠いとみなす）
 * @param {Int16Array | Float32Array} elev
 * @param {Uint8Array} water
 * @param {number} width
 * @param {number} height
 * @param {number} cellKm
 * @param {number[]} seedCells 県庁所在地のマス
 * @returns {Int8Array} マスごとの県の番号（水は -1）
 */
export function partitionRegions(elev, water, width, height, cellKm, seedCells) {
  const n = width * height;
  const region = new Int8Array(n).fill(-1);
  const cost = new Float64Array(n).fill(Infinity);
  // 単純な二分ヒープ
  const heapI = [];
  const heapC = [];
  const push = (i, c) => {
    let k = heapI.length;
    heapI.push(i);
    heapC.push(c);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapC[p] <= c) break;
      heapI[k] = heapI[p];
      heapC[k] = heapC[p];
      k = p;
    }
    heapI[k] = i;
    heapC[k] = c;
  };
  const pop = () => {
    const top = heapI[0];
    const li = heapI.pop();
    const lc = heapC.pop();
    if (heapI.length) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= heapI.length) break;
        if (c + 1 < heapI.length && heapC[c + 1] < heapC[c]) c++;
        if (heapC[c] >= lc) break;
        heapI[k] = heapI[c];
        heapC[k] = heapC[c];
        k = c;
      }
      heapI[k] = li;
      heapC[k] = lc;
    }
    return top;
  };
  seedCells.forEach((c, r) => {
    cost[c] = 0;
    region[c] = r;
    push(c, 0);
  });
  while (heapI.length) {
    const i = pop();
    const x = i % width;
    const y = (i - x) / width;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (water[j] !== LAND) continue;
      // 登りは高さ 50m ごとに 1km 分遠いとみなす
      const climb = Math.max(0, elev[j] - elev[i]);
      const c = cost[i] + DIST[d] * cellKm + climb / 50;
      if (c < cost[j]) {
        cost[j] = c;
        region[j] = region[i];
        push(j, c);
      }
    }
  }
  // 都市から陸でつながらない島は、いちばん近い県庁所在地の県にする
  const seeds = seedCells.map((c) => ({ x: c % width, y: Math.floor(c / width) }));
  for (let i = 0; i < n; i++) {
    if (water[i] !== LAND || region[i] >= 0) continue;
    const x = i % width;
    const y = (i - x) / width;
    let best = 0;
    let bd = Infinity;
    seeds.forEach((s, r) => {
      const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bd) { bd = d; best = r; }
    });
    region[i] = best;
  }
  return region;
}
