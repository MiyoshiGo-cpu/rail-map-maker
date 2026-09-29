// 路線のアクション
import { ID_PREFIX } from '../schema.js';
import { createLine, createSectionAttrs, KIND_DEPENDENT_ATTRS } from '../defaults.js';
import { LINE_PALETTE, nextColor } from '../color.js';
import * as L from '../lines.js';
import { addOperatorTo } from './operators.js';
import { addStationTo } from './stations.js';
import { autoNumbers, numberForEnd, branchNumber } from '../numbering.js';
import { shrinkServices, dropLineFromServices, moveSegmentsToLine } from './services.js';

/** @typedef {import('../patch.js').Tx} Tx */
/** @typedef {import('./context.js').ActionContext} Ctx */
/** @typedef {import('../schema.js').Line} Line */

function nextOrder(lines) {
  return lines.reduce((m, l) => Math.max(m, l.order), -1) + 1;
}

/**
 * 路線を足す
 * @param {Tx} tx
 * @param {Ctx} ctx
 * @param {Partial<Line>} [fields]
 * @param {string[]} [stationIds]
 */
export function addLineTo(tx, ctx, fields = {}, stationIds = []) {
  let operatorId = fields.operatorId;
  if (!operatorId || tx.indexOf('operators', operatorId) < 0) {
    operatorId = tx.state.operators.length ? tx.state.operators[0].id : addOperatorTo(tx, ctx);
  }
  const lines = tx.state.lines;
  const base = createLine(ctx.region, {
    id: ctx.newId(ID_PREFIX.line),
    operatorId,
    name: ctx.mapT('map.default.lineName', { n: lines.length + 1 }),
    color: nextColor(LINE_PALETTE, lines.map((l) => l.color)),
    order: nextOrder(lines),
    ...fields,
  });
  base.operatorId = operatorId;
  if (fields.kind) base.defaults = createSectionAttrs(ctx.region, fields.kind);
  const line = L.withStops(base, stationIds.map((stationId) => ({ stationId })), false);
  tx.push(['lines'], line);
  return line.id;
}

/**
 * 路線を置き換える（ID から位置を探す）
 * @param {Tx} tx
 * @param {string} lineId
 * @param {(line: Line) => Line} fn
 */
function updateLine(tx, lineId, fn) {
  const i = tx.indexOf('lines', lineId);
  if (i < 0) throw new Error(`line not found: ${lineId}`);
  const next = fn(tx.state.lines[i]);
  tx.set(['lines', i], next);
  return next;
}

/** 番号を確定して持つ設定か（fixed） */
const isFixed = (line) => line.numbering.enabled && line.numbering.mode === 'fixed';

/**
 * 駅ごとの番号の部分を書き換えた路線
 * @param {Line} line @param {(string|undefined)[]} numbers
 */
function withNumbers(line, numbers) {
  return {
    ...line,
    stops: line.stops.map((s, i) => {
      const next = { ...s };
      if (numbers[i]) next.number = numbers[i];
      else delete next.number;
      return next;
    }),
  };
}

/**
 * 駅を指定するか、新しい駅を作ってその ID を返す
 * @param {Tx} tx @param {Ctx} ctx
 * @param {{ stationId?: string, newStation?: { x: number, y: number, fields?: object } }} a
 */
function resolveStation(tx, ctx, a) {
  if (a.stationId) return a.stationId;
  if (a.newStation) return addStationTo(tx, ctx, a.newStation, a.newStation.fields);
  throw new Error('stationId or newStation is required');
}

/** @type {Record<string, (tx: Tx, a: any, ctx: Ctx) => any>} */
export const lineReducers = {
  /**
   * { fields?, stationIds?, newStation? } → 新しい ID。
   * newStation を渡すと、その位置に駅を作って最初の駅にする（1手で取り消せるように）
   */
  'line/add'(tx, { fields, stationIds = [], newStation }, ctx) {
    const ids = [...stationIds];
    if (newStation) ids.push(addStationTo(tx, ctx, newStation, newStation.fields));
    return addLineTo(tx, ctx, fields, ids);
  },

  /**
   * 路線の項目を変える { lineId, fields }。
   * 種類を変えたら、種類で決まる区間属性の既定値を合わせ直す。状態・開業年などは既定値にも写す。
   */
  'line/update'(tx, { lineId, fields }, ctx) {
    updateLine(tx, lineId, (line) => {
      const next = { ...line, ...fields };
      for (const [k, v] of Object.entries(fields)) if (v === undefined) delete next[k];
      if (fields.kind && fields.kind !== line.kind) {
        const d = createSectionAttrs(ctx.region, fields.kind);
        next.defaults = { ...next.defaults };
        for (const k of KIND_DEPENDENT_ATTRS) next.defaults[k] = d[k];
      }
      for (const k of ['status', 'openedYear', 'closedYear']) {
        if (k in fields) {
          next.defaults = { ...next.defaults };
          if (fields[k] === undefined) delete next.defaults[k];
          else next.defaults[k] = fields[k];
        }
      }
      return next;
    });
  },

  /** 区間属性の既定値を変える { lineId, fields } */
  'line/defaults'(tx, { lineId, fields }) {
    const i = tx.indexOf('lines', lineId);
    tx.merge(['lines', i, 'defaults'], fields);
  },

  /** 採番規則を変える { lineId, fields } */
  'line/numbering'(tx, { lineId, fields }) {
    const i = tx.indexOf('lines', lineId);
    tx.merge(['lines', i, 'numbering'], fields);
  },

  /**
   * 端に駅を足す { lineId, stationId? | newStation?, atStart? } → 駅の ID
   * 同じ駅は2回入れない（環状にするときは line/setLoop を使う）
   */
  'line/appendStop'(tx, a, ctx) {
    const line = tx.find('lines', a.lineId);
    if (a.stationId && line.stops.some((s) => s.stationId === a.stationId)) return null;
    const stationId = resolveStation(tx, ctx, a);
    updateLine(tx, a.lineId, (l) => {
      // 番号を確定している路線なら、端に足した駅には次（起点側なら前）の番号を付ける
      const extra = isFixed(l) ? { number: numberForEnd(l, !!a.atStart) || undefined } : {};
      if (!extra.number) delete extra.number;
      return L.appendStop(l, stationId, !!a.atStart, extra);
    });
    return stationId;
  },

  /**
   * 駅間に駅を挿入する { lineId, sectionIndex, stationId? | newStation?, numbering? } → 駅の ID。
   * 番号を確定している路線では numbering で「枝番を振る（branch）」「以降を振り直す（renumber）」「番号なし（none）」を選ぶ
   */
  'line/insertStop'(tx, a, ctx) {
    const line = tx.find('lines', a.lineId);
    if (a.stationId && line.stops.some((s) => s.stationId === a.stationId)) return null;
    const stationId = resolveStation(tx, ctx, a);
    updateLine(tx, a.lineId, (l) => {
      let next = L.insertStop(l, a.sectionIndex, stationId);
      if (!isFixed(l)) return next;
      const mode = a.numbering || 'branch';
      if (mode === 'renumber') return withNumbers(next, autoNumbers(next));
      if (mode === 'branch') {
        const used = new Set(l.stops.map((s) => s.number).filter(Boolean));
        const prev = l.stops[a.sectionIndex].number;
        const num = branchNumber(prev, used);
        next = withNumbers(next, next.stops.map((s, i) => (i === a.sectionIndex + 1 ? num : s.number)));
      }
      return next;
    });
    return stationId;
  },

  /** 番号を確定する（auto → fixed。いまの連番を各駅に持たせる） { lineId } */
  'line/fixNumbers'(tx, { lineId }) {
    updateLine(tx, lineId, (l) => {
      const next = withNumbers(l, autoNumbers(l));
      return { ...next, numbering: { ...l.numbering, mode: 'fixed' } };
    });
  },

  /** 確定した番号を連番で振り直す（fixed のまま） { lineId } */
  'line/renumber'(tx, { lineId }) {
    updateLine(tx, lineId, (l) => withNumbers(l, autoNumbers(l)));
  },

  /** 確定をやめて常に連番にする（fixed → auto。持っていた番号は消す） { lineId } */
  'line/unfixNumbers'(tx, { lineId }) {
    updateLine(tx, lineId, (l) => {
      const next = withNumbers(l, l.stops.map(() => undefined));
      return { ...next, numbering: { ...l.numbering, mode: 'auto' } };
    });
  },

  /** 路線から駅を外す（駅そのものは残す） { lineId, index } → 一緒に消えた系統の数 */
  'line/removeStop'(tx, { lineId, index }) {
    const line = tx.find('lines', lineId);
    const removed = shrinkServices(tx, new Map([[lineId, new Set([line.stops[index].stationId])]]));
    updateLine(tx, lineId, (l) => L.removeStop(l, index));
    return removed;
  },

  /** 駅の順番を変える { lineId, from, to } */
  'line/moveStop'(tx, { lineId, from, to }) {
    if (from === to) return;
    updateLine(tx, lineId, (l) => L.moveStop(l, from, to));
  },

  /** 路線上の駅の項目（営業キロ・確定した番号） { lineId, index, fields } */
  'line/stop'(tx, { lineId, index, fields }) {
    const i = tx.indexOf('lines', lineId);
    tx.merge(['lines', i, 'stops', index], fields);
  },

  /** 環状線にする・やめる { lineId, isLoop }（駅が3つ未満なら環状にしない） */
  'line/setLoop'(tx, { lineId, isLoop }) {
    updateLine(tx, lineId, (l) => L.setLoop(l, isLoop));
  },

  /** 駅間の上書き { lineId, index, fields }（null・undefined のキーは消して既定値に戻す） */
  'line/section'(tx, { lineId, index, fields }) {
    const i = tx.indexOf('lines', lineId);
    for (const [k, v] of Object.entries(fields)) {
      tx.set(['lines', i, 'sections', index, k], v === null ? undefined : v);
    }
  },

  /**
   * 駅間を消す { lineId, sectionIndex } → 分かれてできた路線の ID（無ければ null）
   */
  'line/cutSection'(tx, { lineId, sectionIndex }, ctx) {
    const i = tx.indexOf('lines', lineId);
    const line = tx.state.lines[i];
    const { first, second } = L.cutSection(line, sectionIndex);
    tx.set(['lines', i], first);
    if (!second) return null;
    const id = ctx.newId(ID_PREFIX.line);
    // 2本目だけを通る系統の区間は、新しい路線に付け替える
    moveSegmentsToLine(tx, lineId, id, new Set(L.stationIdsOf(second)), new Set(L.stationIdsOf(first)));
    tx.push(['lines'], {
      ...second,
      id,
      name: ctx.mapT('map.lineSplitSuffix', { name: line.name, n: 2 }),
      order: nextOrder(tx.state.lines),
    });
    return id;
  },

  /** { lineId } → 一緒に消えた系統の数（通っていた区間は系統から外す） */
  'line/delete'(tx, { lineId }) {
    const i = tx.indexOf('lines', lineId);
    if (i < 0) return 0;
    const removed = dropLineFromServices(tx, lineId);
    tx.remove(['lines'], i);
    return removed;
  },

  /** 路線を複製する { lineId } → 新しい ID */
  'line/duplicate'(tx, { lineId }, ctx) {
    const line = tx.find('lines', lineId);
    const id = ctx.newId(ID_PREFIX.line);
    tx.push(['lines'], {
      ...line,
      id,
      name: ctx.mapT('map.copySuffix', { name: line.name }),
      order: nextOrder(tx.state.lines),
    });
    return id;
  },

  /** 並走の並び順を決め直す { lineIds }（並べた順に 0,1,2…） */
  'line/reorder'(tx, { lineIds }) {
    lineIds.forEach((id, order) => {
      const i = tx.indexOf('lines', id);
      if (i >= 0) tx.set(['lines', i, 'order'], order);
    });
  },
};
