// 系統と種別のチェック（§6.5 直通チェック・§6.6 のフェーズ2の項目）
import { expandService, stopFlags } from './services.js';
import { effectiveSectionAttrs } from './lines.js';

/** @typedef {import('./schema.js').Project} Project */
/** @typedef {import('./validate.js').CheckItem} CheckItem */

/**
 * 系統の表示名（チェックの文に差し込む）：愛称があれば愛称、なければ「種別 始発→終着」（画面の言語で組み立てる）
 * @param {Project} p
 * @param {import('./schema.js').Service} sv
 */
function serviceParams(p, sv) {
  if (sv.name) return { service: sv.name };
  const name = (id) => p.stations.find((s) => s.id === id)?.name || '';
  const first = sv.segments[0];
  const last = sv.segments[sv.segments.length - 1];
  return {
    service: {
      key: 'service.route',
      vars: {
        type: (first && p.serviceTypes.find((x) => x.id === first.typeId)?.name) || '',
        from: first ? name(first.from) : '',
        to: last ? name(last.to) : '',
      },
    },
  };
}

/** 軌間が同じか（null は対象外の路線どうしなら同じとみなす） */
const sameGauge = (a, b) => a === b;

/**
 * 系統と種別のチェック
 * @param {Project} p
 * @returns {CheckItem[]}
 */
export function serviceChecks(p) {
  /** @type {CheckItem[]} */
  const out = [];
  const lineById = new Map(p.lines.map((l) => [l.id, l]));
  const stName = (id) => p.stations.find((s) => s.id === id)?.name || '';

  for (const sv of p.services) {
    const base = serviceParams(p, sv);
    const target = { type: 'service', id: sv.id };
    const path = expandService(p, sv, lineById);
    const stock = sv.rollingStockId ? p.rollingStock.find((r) => r.id === sv.rollingStockId) : null;

    // エラー：経路がつながっていない（区間が路線の上にない・つなぎ目が同じ駅でない）
    if (!path.ok) {
      out.push({ level: 'error', code: 'serviceBroken', params: base, target });
      continue;
    }
    // エラー：環状線を通る区間に回る向きがない
    sv.segments.forEach((seg) => {
      const line = lineById.get(seg.lineId);
      if (line.isLoop && !seg.loopDir) out.push({ level: 'error', code: 'loopDirMissing', params: { ...base, line: line.name }, target });
    });

    // 経路に沿って、軌間・電化方式が変わるところ
    for (let k = 1; k < path.hops.length; k++) {
      const a = path.hops[k - 1];
      const b = path.hops[k];
      const attrA = effectiveSectionAttrs(lineById.get(a.lineId), a.section);
      const attrB = effectiveSectionAttrs(lineById.get(b.lineId), b.section);
      const at = { ...base, station: stName(path.stations[k]) };
      if (!sameGauge(attrA.gauge, attrB.gauge) && !(stock && stock.gauges.includes(attrA.gauge) && stock.gauges.includes(attrB.gauge))) {
        out.push({ level: 'error', code: 'gaugeMismatch', params: { ...at, a: { gauge: attrA.gauge }, b: { gauge: attrB.gauge } }, target });
      }
      if (attrA.electrification !== attrB.electrification && !(stock && stock.electrifications.includes(attrA.electrification) && stock.electrifications.includes(attrB.electrification))) {
        out.push({ level: 'warning', code: 'electrificationMismatch', params: { ...at, a: { key: 'electrification.' + attrA.electrification }, b: { key: 'electrification.' + attrB.electrification } }, target });
      }
    }
    // エラー：非電化の区間を電車が走る（車両を指定しているとき）
    if (stock && stock.kind !== 'dmu' && stock.kind !== 'locoHauled') {
      const hop = path.hops.find((hp) => effectiveSectionAttrs(lineById.get(hp.lineId), hp.section).electrification === 'none');
      if (hop) out.push({ level: 'error', code: 'emuOnNonElectrified', params: { ...base, line: lineById.get(hop.lineId).name }, target });
    }

    // 警告：停車駅が2つ未満
    const flags = stopFlags(p, sv, path);
    const stops = new Set(path.stations.filter((_, k) => flags[k]));
    if (stops.size < 2) out.push({ level: 'warning', code: 'serviceFewStops', params: base, target });
  }

  // 情報：使われていない種別
  const used = new Set(p.services.flatMap((sv) => sv.segments.map((seg) => seg.typeId)));
  for (const x of p.serviceTypes) {
    if (!used.has(x.id)) out.push({ level: 'info', code: 'unusedServiceType', params: { name: x.name, operator: p.operators.find((o) => o.id === x.operatorId)?.name || '' }, target: { type: 'serviceType', id: x.id } });
  }
  return out;
}
