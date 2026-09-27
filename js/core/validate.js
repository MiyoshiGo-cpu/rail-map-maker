// 保存前の整合性チェック（壊れたデータは保存しない）。
// §6.6 の利用者向けチェックはステップ15でここに足す。
import { SCHEMA_VERSION } from './schema.js';
import { sectionCount } from './defaults.js';

/** @typedef {import('./schema.js').Project} Project */
/** @typedef {{ code: string, id?: string, detail?: string }} IntegrityProblem */

const COLLECTIONS = ['operators', 'lines', 'stations', 'interchanges', 'serviceTypes', 'services', 'rollingStock', 'fareTables'];

const isInt = (v) => Number.isInteger(v);

/**
 * データの形と参照を調べる。問題がなければ空の配列
 * @param {Project} p
 * @returns {IntegrityProblem[]}
 */
export function checkIntegrity(p) {
  /** @type {IntegrityProblem[]} */
  const out = [];
  if (!p || typeof p !== 'object') return [{ code: 'notObject' }];
  if (p.schemaVersion !== SCHEMA_VERSION) out.push({ code: 'version', detail: String(p.schemaVersion) });
  if (typeof p.id !== 'string' || !p.id) out.push({ code: 'projectId' });
  if (typeof p.name !== 'string') out.push({ code: 'projectName' });
  for (const key of COLLECTIONS) {
    if (!Array.isArray(p[key])) out.push({ code: 'collection', detail: key });
  }
  if (out.length) return out;

  // ID の重複
  const seen = new Set();
  for (const key of COLLECTIONS) {
    for (const item of p[key]) {
      if (!item || typeof item.id !== 'string' || !item.id) out.push({ code: 'missingId', detail: key });
      else if (seen.has(item.id)) out.push({ code: 'duplicateId', id: item.id });
      else seen.add(item.id);
    }
  }

  const ids = (key) => new Set(p[key].map((x) => x.id));
  const stationIds = ids('stations');
  const operatorIds = ids('operators');
  const lineIds = ids('lines');
  const typeIds = ids('serviceTypes');

  for (const st of p.stations) {
    if (typeof st.name !== 'string') out.push({ code: 'stationName', id: st.id });
    if (st.schematic !== null && !(st.schematic && isInt(st.schematic.x) && isInt(st.schematic.y))) {
      out.push({ code: 'stationPos', id: st.id });
    }
    if (!st.label || !st.label.schematic || !st.label.geo) out.push({ code: 'stationLabel', id: st.id });
    if (st.managedBy && !operatorIds.has(st.managedBy)) out.push({ code: 'ref', id: st.id, detail: 'managedBy' });
  }

  for (const line of p.lines) {
    if (!operatorIds.has(line.operatorId)) out.push({ code: 'ref', id: line.id, detail: 'operatorId' });
    if (!Array.isArray(line.stops) || !Array.isArray(line.sections)) {
      out.push({ code: 'lineShape', id: line.id });
      continue;
    }
    const inLine = new Set();
    for (const s of line.stops) {
      if (!stationIds.has(s.stationId)) out.push({ code: 'ref', id: line.id, detail: 'stops' });
      if (inLine.has(s.stationId)) out.push({ code: 'duplicateStop', id: line.id });
      inLine.add(s.stationId);
    }
    if (line.sections.length !== sectionCount(line)) out.push({ code: 'sectionCount', id: line.id });
    if (line.isLoop && line.stops.length < 3) out.push({ code: 'loopTooShort', id: line.id });
  }

  for (const ic of p.interchanges) {
    if (!Array.isArray(ic.stationIds)) out.push({ code: 'interchangeShape', id: ic.id });
    else if (ic.stationIds.some((id) => !stationIds.has(id))) out.push({ code: 'ref', id: ic.id, detail: 'stationIds' });
  }

  for (const t of p.serviceTypes) {
    if (!operatorIds.has(t.operatorId)) out.push({ code: 'ref', id: t.id, detail: 'operatorId' });
  }
  for (const sv of p.services) {
    for (const seg of sv.segments || []) {
      if (!lineIds.has(seg.lineId) || !stationIds.has(seg.from) || !stationIds.has(seg.to) || !typeIds.has(seg.typeId)) {
        out.push({ code: 'ref', id: sv.id, detail: 'segments' });
        break;
      }
    }
    if ((sv.stops || []).some((id) => !stationIds.has(id))) out.push({ code: 'ref', id: sv.id, detail: 'stops' });
  }
  for (const f of p.fareTables) {
    if (!operatorIds.has(f.operatorId)) out.push({ code: 'ref', id: f.id, detail: 'operatorId' });
  }
  return out;
}

/**
 * 問題を短い文字列にする（ログ・画面の補足用）
 * @param {IntegrityProblem[]} problems
 */
export function describeProblems(problems) {
  return problems.slice(0, 3).map((x) => [x.code, x.detail, x.id].filter(Boolean).join(':')).join(', ');
}
