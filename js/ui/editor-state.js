// エディタの画面の状態（ツール・選択・路線を引いている途中など）。Undo の対象外
/**
 * @typedef {{ type: 'none' }
 *   | { type: 'stations', ids: string[] }
 *   | { type: 'line', lineId: string }
 *   | { type: 'section', lineId: string, index: number }
 *   | { type: 'interchange', id: string }
 *   | { type: 'operator', id: string }} Selection
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
