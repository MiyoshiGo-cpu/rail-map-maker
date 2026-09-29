// 系統の画面で共通に使う部品：表示名、種別と駅の選択肢、経路の説明、要約（所要時間・表定速度・停車駅数）
import { t, formatDistance, formatDuration, formatNumber } from '../i18n/i18n.js';
import { serviceEnds, throughJoints } from '../core/services.js';
import { typesOfOperator } from '../core/actions/service-types.js';

/** @typedef {import('../core/schema.js').Project} Project */
/** @typedef {import('../core/schema.js').Service} Service */

/**
 * 系統の表示名：愛称があれば愛称、なければ「急行 a→b」
 * @param {Project} p
 * @param {Service} sv
 */
export function serviceLabel(p, sv) {
  const e = serviceEnds(p, sv);
  const route = t('service.route', { type: e.type ? e.type.name : '', from: e.from, to: e.to });
  return sv.name ? t('service.named', { name: sv.name, route }) : route;
}

/**
 * 系統の色：指定がなければ最初の区間の種別の色
 * @param {Project} p
 * @param {Service} sv
 */
export function serviceColor(p, sv) {
  if (sv.color) return sv.color;
  const first = sv.segments[0];
  return (first && p.serviceTypes.find((x) => x.id === first.typeId)?.color) || '#6E7780';
}

/** 直通運転か（事業者が変わるつなぎ目がある） */
export function isThrough(p, sv) {
  return throughJoints(p, sv).length > 0;
}

/**
 * 種別の選択肢。preferOperatorId の事業者の種別を先に、ほかの事業者の種別はあとに（名前に事業者の略称を添える）
 * @param {Project} p
 * @param {string} [preferOperatorId]
 */
export function typeOptions(p, preferOperatorId) {
  const ops = [...p.operators].sort((a, b) => (a.id === preferOperatorId ? -1 : b.id === preferOperatorId ? 1 : 0));
  const out = [];
  for (const op of ops) {
    for (const { type } of typesOfOperator(p.serviceTypes, op.id)) {
      out.push({ value: type.id, label: op.id === preferOperatorId ? type.name : t('service.typeOfOperator', { type: type.name, operator: op.shortName || op.name }) });
    }
  }
  return out;
}

/**
 * 駅の選択肢（路線に入っている駅だけ。同じ名前の駅を見分けられるよう路線名を添える）
 * @param {Project} p
 */
export function stationOptions(p) {
  const linesOf = new Map();
  for (const l of [...p.lines].sort((a, b) => a.order - b.order)) {
    for (const s of l.stops) {
      if (!linesOf.has(s.stationId)) linesOf.set(s.stationId, []);
      const list = linesOf.get(s.stationId);
      if (!list.includes(l)) list.push(l);
    }
  }
  return p.stations
    .filter((s) => linesOf.has(s.id))
    .sort((a, b) => (a.reading || a.name).localeCompare(b.reading || b.name, p.locale.mapLanguage))
    .map((s) => ({
      value: s.id,
      label: t('service.stationOption', { name: s.name || t('station.unnamed'), lines: linesOf.get(s.id).map((l) => l.displayName || l.name).join(t('common.listSep')) }),
    }));
}

/**
 * 経路の説明（例：A線 → B線 → C線）
 * @param {Project} p
 * @param {{ lineId: string, loopDir?: string }[]} segments
 */
export function routeText(p, segments) {
  return segments.map((seg) => {
    const l = p.lines.find((x) => x.id === seg.lineId);
    const name = l ? l.displayName || l.name : '';
    return seg.loopDir ? t('service.loopSegment', { name, dir: t('loopDir.' + seg.loopDir) }) : name;
  }).join(t('service.arrow'));
}

/**
 * 要約（所要時間・表定速度・停車駅数・営業キロ）
 * @param {Project} p
 * @param {import('../core/runtime.js').ServiceRuntime | null} rt
 */
export function runtimeSummary(p, rt) {
  if (!rt) return t('service.cannotCompute');
  return t('service.summary', {
    time: formatDuration(rt.totalSec),
    speed: t('unit.kmh', { value: formatNumber(rt.scheduledSpeed, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }),
    stops: rt.stopCount,
    km: formatDistance(rt.km, p.locale.distanceUnit),
  });
}
