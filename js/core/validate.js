// 保存前の整合性チェック（壊れたデータは保存しない）。
// あわせて、§6.6 の利用者向けチェック（フェーズ1で判定できる項目）もここに置く。
import { SCHEMA_VERSION } from './schema.js';
import { sectionCount } from './defaults.js';
import { duplicateNumbers } from './numbering.js';
import { allLineKm, extremeSection } from './distance.js';
import { serviceChecks } from './validate-services.js';

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

// ---------- 利用者向けのチェック（§6.6） ----------

/**
 * @typedef {object} CheckItem
 * @property {'error'|'warning'|'info'} level
 * @property {string} code 画面の文言のキー（check.<code>）
 * @property {Record<string, any>} params 文言に差し込む値
 * @property {{ type: 'station'|'line'|'operator'|'interchange'|'serviceType'|'service', id: string } | { type: 'section', id: string, index: number } | null} target 「移動」で選ぶもの（section の id は路線）
 */

/** 同名の駅を近くと判定する距離（路線図の格子のマス数。§6.6） */
export const NEARBY_SAME_NAME_CELLS = 3;

/**
 * 利用者向けのチェック（色の近さはフェーズ3）
 * @param {Project} p
 * @returns {CheckItem[]}
 */
export function runChecks(p) {
  /** @type {CheckItem[]} */
  const out = [];
  const lineName = (l) => l.displayName || l.name;

  // エラー：存在しない ID への参照（読み込んだファイルなど）
  for (const pr of checkIntegrity(p)) {
    if (pr.code !== 'ref') continue;
    out.push({ level: 'error', code: 'badReference', params: { detail: pr.detail || '' }, target: null });
  }

  for (const line of p.lines) {
    // エラー：駅が2つ未満の路線
    if (line.stops.length < 2) {
      out.push({ level: 'error', code: 'lineTooShort', params: { name: lineName(line), count: line.stops.length }, target: { type: 'line', id: line.id } });
    }
    // エラー：同じ路線の中で駅番号が重なっている
    const dups = duplicateNumbers(line);
    if (dups.length) {
      out.push({ level: 'error', code: 'duplicateNumber', params: { name: lineName(line), numbers: dups.join(', ') }, target: { type: 'line', id: line.id } });
    }
  }

  // 警告：駅間が極端（0.3km未満、新幹線以外で50km超）／情報：営業キロが概算の路線
  const kms = allLineKm(p);
  const stName = new Map(p.stations.map((s) => [s.id, s.name]));
  const unit = p.locale.distanceUnit;
  for (const line of p.lines) {
    const lk = kms.get(line.id);
    lk.sections.forEach((sec, i) => {
      const kind = extremeSection(line, sec);
      if (!kind) return;
      const a = stName.get(line.stops[i].stationId) || '';
      const b = stName.get(line.stops[(i + 1) % line.stops.length].stationId) || '';
      out.push({
        level: 'warning',
        code: kind === 'short' ? 'sectionShort' : 'sectionLong',
        params: { name: lineName(line), a, b, km: { distance: sec.km, unit } },
        target: { type: 'section', id: line.id, index: i },
      });
    });
    if (lk.approx && line.stops.length >= 2) {
      out.push({ level: 'info', code: 'kmEstimated', params: { name: lineName(line) }, target: { type: 'line', id: line.id } });
    }
  }

  const onLine = new Set(p.lines.flatMap((l) => l.stops.map((s) => s.stationId)));
  const groupOf = new Map();
  for (const ic of p.interchanges) for (const id of ic.stationIds) groupOf.set(id, ic.id);

  for (const st of p.stations) {
    // 警告：駅名かよみが空（英字を作れない）
    if (!st.name || !st.reading) {
      out.push({ level: 'warning', code: st.name ? 'readingEmpty' : 'nameEmpty', params: { name: st.name }, target: { type: 'station', id: st.id } });
    }
    // 警告：どの路線にも属さない駅
    if (!onLine.has(st.id)) {
      out.push({ level: 'warning', code: 'stationOrphan', params: { name: st.name }, target: { type: 'station', id: st.id } });
    }
  }

  // 警告：乗換グループに入っていない同名の駅が近くにある（路線図で3マス以内）
  const byName = new Map();
  for (const st of p.stations) {
    if (!st.name || !st.schematic) continue;
    if (!byName.has(st.name)) byName.set(st.name, []);
    byName.get(st.name).push(st);
  }
  for (const [name, list] of byName) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const d = Math.max(Math.abs(a.schematic.x - b.schematic.x), Math.abs(a.schematic.y - b.schematic.y));
        const sameGroup = groupOf.has(a.id) && groupOf.get(a.id) === groupOf.get(b.id);
        if (d <= NEARBY_SAME_NAME_CELLS && !sameGroup) {
          out.push({ level: 'warning', code: 'sameNameNearby', params: { name }, target: { type: 'station', id: a.id } });
        }
      }
    }
  }

  // 系統と種別（直通チェックなど）
  out.push(...serviceChecks(p));

  // 情報：使われていない事業者
  for (const op of p.operators) {
    const used = p.lines.some((l) => l.operatorId === op.id) || p.serviceTypes.some((t) => t.operatorId === op.id);
    if (!used) out.push({ level: 'info', code: 'unusedOperator', params: { name: op.name }, target: { type: 'operator', id: op.id } });
  }

  const rank = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
