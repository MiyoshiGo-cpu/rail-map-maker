// エディタの画面の状態（ツール・選択・路線を引いている途中など）。Undo の対象外
/**
 * @typedef {{ type: 'none' }
 *   | { type: 'stations', ids: string[] }
 *   | { type: 'line', lineId: string }
 *   | { type: 'section', lineId: string, index: number }
 *   | { type: 'interchange', id: string }
 *   | { type: 'operator', id: string }
 *   | { type: 'serviceType', id: string }} Selection
 */

/**
 * @typedef {object} EditorState
 * @property {'select'|'station'|'line'|'delete'} tool
 * @property {Selection} selection
 * @property {{ lineId: string, atStart: boolean } | null} drawing 路線を引いている途中
 * @property {string} lineChoice 路線を引くときの対象（'new' か路線 ID）
 * @property {{ operatorId: string, name: string, color: string, symbol: string, kind: string }} newLine 新しい路線の入力中の値
 * @property {{ x: number, y: number } | null} hover マウスが指している格子点
 * @property {boolean} rangeMode スマホの範囲選択
 * @property {{ x0: number, y0: number, x1: number, y1: number } | null} marquee 範囲選択中の四角（世界座標）
 * @property {{ kind: 'interchange', stationId?: string, interchangeId?: string } | null} pending 次にタップする駅を待っている操作
 * @property {null|'data'|'check'} drawer 開いている一覧（データ表かチェック）
 */

/** @param {EditorState} initial */
export function createEditorState(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    /** @returns {EditorState} */
    get: () => state,
    /** @param {Partial<EditorState>} patch */
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of [...listeners]) fn(state);
    },
    /** @param {(s: EditorState) => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** @type {Selection} */
export const NO_SELECTION = { type: 'none' };

const DEFAULT_ACCENT = '#0079C2';

/**
 * アクセント色：引いている路線・選んでいる路線（駅なら最初の所属路線）の色。なければ既定の青（§4.1）
 * @param {import('../core/schema.js').Project} p
 * @param {EditorState} s
 */
export function accentFor(p, s) {
  const lineColor = (id) => p.lines.find((l) => l.id === id)?.color;
  if (s.drawing) return lineColor(s.drawing.lineId) || DEFAULT_ACCENT;
  if (s.selection.type === 'line' || s.selection.type === 'section') return lineColor(s.selection.lineId) || DEFAULT_ACCENT;
  if (s.selection.type === 'serviceType') return p.serviceTypes.find((x) => x.id === s.selection.id)?.color || DEFAULT_ACCENT;
  if (s.selection.type === 'stations' && s.selection.ids.length) {
    const id = s.selection.ids[0];
    const line = [...p.lines].sort((a, b) => a.order - b.order).find((l) => l.stops.some((x) => x.stationId === id));
    if (line) return line.color;
  }
  return DEFAULT_ACCENT;
}

/**
 * 消えたものを指している状態を直すための変更。直す必要がなければ null
 * @param {import('../core/schema.js').Project} p
 * @param {EditorState} s
 * @returns {Partial<EditorState> | null}
 */
export function repairFor(p, s) {
  const sel = s.selection;
  const hasLine = (id) => p.lines.some((l) => l.id === id);
  if ((sel.type === 'line' || sel.type === 'section') && !hasLine(sel.lineId)) return { selection: NO_SELECTION };
  if (sel.type === 'section') {
    const line = p.lines.find((l) => l.id === sel.lineId);
    if (sel.index >= line.sections.length) return { selection: { type: 'line', lineId: line.id } };
  }
  if (sel.type === 'stations') {
    const ids = sel.ids.filter((id) => p.stations.some((st) => st.id === id));
    if (ids.length !== sel.ids.length) return { selection: ids.length ? { type: 'stations', ids } : NO_SELECTION };
  }
  if (sel.type === 'interchange' && !p.interchanges.some((x) => x.id === sel.id)) return { selection: NO_SELECTION };
  if (sel.type === 'operator' && !p.operators.some((x) => x.id === sel.id)) return { selection: NO_SELECTION };
  if (sel.type === 'serviceType' && !p.serviceTypes.some((x) => x.id === sel.id)) return { selection: NO_SELECTION };
  if (s.drawing && !hasLine(s.drawing.lineId)) return { drawing: null };
  if (s.lineChoice !== 'new' && !hasLine(s.lineChoice)) return { lineChoice: 'new' };
  return null;
}
