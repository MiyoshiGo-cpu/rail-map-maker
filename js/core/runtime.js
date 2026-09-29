// 所要時間（§6.4）：停車駅から次の停車駅までを台形の速度曲線で計算し、停車時間を足して余裕率を掛ける
import { getRegion } from './regions/index.js';
import { allLineKm } from './distance.js';
import { effectiveSectionAttrs } from './lines.js';
import { expandService, stopFlags, segmentAt } from './services.js';

/** @typedef {import('./schema.js').Project} Project */
/** @typedef {import('./schema.js').Service} Service */

/**
 * 1つの駅間（停車駅から次の停車駅まで）を走る時間（秒）
 * @param {number} dM 距離（m）
 * @param {number} v 制限速度（m/s）
 * @param {number} a 加速度（m/s²）
 * @param {number} b 減速度（m/s²）
 */
export function runSeconds(dM, v, a, b) {
  if (dM <= 0) return 0;
  const need = (v * v) / (2 * a) + (v * v) / (2 * b);
  if (dM >= need) return v / a + v / b + (dM - need) / v;
  const vp = Math.sqrt((2 * a * b * dM) / (a + b));
  return vp / a + vp / b;
}

/**
 * @typedef {object} RuntimeLeg
 * @property {number} from 経路の位置（停車駅）
 * @property {number} to 経路の位置（次の停車駅）
 * @property {number} km
 * @property {number} runSec
 * @property {number} maxSpeed km/h
 */

/**
 * @typedef {object} ServiceRuntime
 * @property {number} totalSec 余裕率を掛けたあとの所要時間
 * @property {number} km 営業キロ（始発から終着まで）
 * @property {number} scheduledSpeed 表定速度（km/h）
 * @property {number} stopCount 停車駅の数（始発・終着を含む）
 * @property {RuntimeLeg[]} legs
 * @property {number[]} depart 経路の位置ごとの、始発からの時間（秒。余裕率込み。通過駅は通過する時刻の見込み）
 */

/**
 * 系統の所要時間。経路がつながっていなければ null
 * @param {Project} p
 * @param {Service} sv
 * @param {{ path?: ReturnType<typeof expandService>, flags?: boolean[], kms?: Map<string, import('./distance.js').LineKm> }} [opt]
 * @returns {ServiceRuntime | null}
 */
export function serviceRuntime(p, sv, opt = {}) {
  const path = opt.path || expandService(p, sv);
  if (!path.ok || path.stations.length < 2) return null;
  const flags = opt.flags || stopFlags(p, sv, path);
  const kms = opt.kms || allLineKm(p);
  const region = getRegion(p.locale.region);
  const lineById = new Map(p.lines.map((l) => [l.id, l]));
  const typeById = new Map(p.serviceTypes.map((x) => [x.id, x]));
  const stock = sv.rollingStockId ? p.rollingStock.find((r) => r.id === sv.rollingStockId) : null;
  const margin = 1 + (p.settings.runtimeMargin || 0);

  /** 駅間ごとの長さ・最高速度・加減速度 */
  const hopInfo = path.hops.map((hp) => {
    const line = lineById.get(hp.lineId);
    const kind = region.lineKindDefaults[line.kind] || region.lineKindDefaults[region.defaultLineKind];
    return {
      km: kms.get(line.id).sections[hp.section].km,
      maxSpeed: effectiveSectionAttrs(line, hp.section).maxSpeed,
      accel: stock ? stock.accel : kind.accel,
      decel: stock ? stock.decel : kind.decel,
    };
  });

  const stops = [];
  flags.forEach((f, k) => { if (f) stops.push(k); });
  /** @type {RuntimeLeg[]} */
  const legs = [];
  const depart = new Array(path.stations.length).fill(0);
  let t = 0;
  let km = 0;
  for (let s = 0; s + 1 < stops.length; s++) {
    const a = stops[s];
    const b = stops[s + 1];
    // 途中の停車駅では、そこから出ていく区間の種別の停車時間を足す
    if (s > 0) {
      const type = typeById.get(sv.segments[segmentAt(path, a)]?.typeId);
      t += type ? type.dwellSec : 0;
    }
    depart[a] = t;
    let d = 0;
    let v = Infinity;
    let acc = Infinity;
    let dec = Infinity;
    for (let k = a; k < b; k++) {
      const h = hopInfo[k];
      d += h.km;
      v = Math.min(v, h.maxSpeed);
      acc = Math.min(acc, h.accel);
      dec = Math.min(dec, h.decel);
    }
    if (stock) v = Math.min(v, stock.maxSpeed);
    const runSec = runSeconds(d * 1000, v / 3.6, acc / 3.6, dec / 3.6);
    // 通過駅の時刻は、距離の割合で見込む
    let run = 0;
    for (let k = a + 1; k < b; k++) {
      run += hopInfo[k - 1].km;
      depart[k] = t + (d > 0 ? runSec * (run / d) : 0);
    }
    legs.push({ from: a, to: b, km: d, runSec, maxSpeed: v });
    t += runSec;
    km += d;
  }
  depart[stops[stops.length - 1]] = t;
  const totalSec = t * margin;
  return {
    totalSec,
    km,
    scheduledSpeed: totalSec > 0 ? km / (totalSec / 3600) : 0,
    stopCount: stops.length,
    legs,
    depart: depart.map((x) => x * margin),
  };
}
