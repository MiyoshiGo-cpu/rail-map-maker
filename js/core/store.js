// 状態の置き場所。変更は必ず dispatch(action) を通す。
// 各アクションはパッチ（と逆パッチ）として記録され、Undo/Redo はアクション単位（最大200手）。
import { createTx, applyOps } from './patch.js';

/** @typedef {import('./patch.js').PatchOp} PatchOp */
/** @typedef {import('./patch.js').Tx} Tx */
/** @typedef {{ type: string, silent?: boolean, [k: string]: any }} Action */
/** @typedef {(tx: Tx, action: Action, ctx: any) => any} Reducer */
/** @typedef {{ type: string, ops: PatchOp[], inverse: PatchOp[] }} HistoryEntry */
/** @typedef {{ kind: 'do'|'undo'|'redo'|'replace'|'preview', type?: string, silent?: boolean }} ChangeInfo */

export const MAX_HISTORY = 200;

/** 記録しない（Undo の対象外の）アクションが触ってよい場所 */
const SILENT_ROOTS = new Set(['view', 'meta']);

/**
 * @param {any} initialState
 * @param {{
 *   reducers: Record<string, Reducer>,
 *   makeContext?: (state: any) => any,
 *   maxHistory?: number,
 *   now?: () => string,
 *   touchKey?: string | null,
 * }} options
 */
export function createStore(initialState, options) {
  const { reducers, makeContext = () => ({}), maxHistory = MAX_HISTORY, now = () => new Date().toISOString() } = options;
  const touchKey = options.touchKey === undefined ? 'updatedAt' : options.touchKey;

  let state = initialState;
  /** プレビュー中の状態（ドラッグ中など。確定するまで履歴に入れない） */
  let previewState = null;
  /** @type {HistoryEntry[]} */
  let undoStack = [];
  /** @type {HistoryEntry[]} */
  let redoStack = [];
  /** @type {Set<(state: any, info: ChangeInfo) => void>} */
  const listeners = new Set();

  function emit(info) {
    const s = previewState || state;
    for (const fn of [...listeners]) fn(s, info);
  }

  function touch(s) {
    return touchKey ? { ...s, [touchKey]: now() } : s;
  }

  /**
   * アクションを当てたトランザクションを作る（状態はまだ変えない）
   * @param {any} base
   * @param {Action} action
   */
  function run(base, action) {
    const reducer = reducers[action.type];
    if (!reducer) throw new Error(`unknown action: ${action.type}`);
    const tx = createTx(base);
    const result = reducer(tx, action, makeContext(base));
    if (action.silent) {
      for (const op of tx.ops) {
        if (!SILENT_ROOTS.has(String(op.path[0]))) throw new Error(`silent action ${action.type} touched ${op.path.join('.')}`);
      }
    }
    return { tx, result };
  }

  const store = {
    getState() {
      return previewState || state;
    },

    /** 確定済みの状態（プレビューを含まない） */
    getCommittedState() {
      return state;
    },

    /**
     * @param {Action} action
     * @returns {any} アクションの戻り値（新しく作った ID など）
     */
    dispatch(action) {
      previewState = null;
      const { tx, result } = run(state, action);
      if (tx.ops.length === 0) return result;
      state = action.silent ? tx.state : touch(tx.state);
      if (!action.silent) {
        undoStack.push({ type: action.type, ops: tx.ops, inverse: tx.inverse });
        if (undoStack.length > maxHistory) undoStack.splice(0, undoStack.length - maxHistory);
        redoStack = [];
      }
      emit({ kind: 'do', type: action.type, silent: !!action.silent });
      return result;
    },

    /**
     * ドラッグ中などの仮の変更。確定済みの状態に当てた結果を表示用に持つ
     * @param {Action} action
     */
    preview(action) {
      const { tx, result } = run(state, action);
      previewState = tx.ops.length ? tx.state : null;
      emit({ kind: 'preview', type: action.type });
      return result;
    },

    /** プレビューをやめて確定済みの状態に戻す */
    cancelPreview() {
      if (!previewState) return;
      previewState = null;
      emit({ kind: 'preview' });
    },

    isPreviewing() {
      return !!previewState;
    },

    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },

    undo() {
      previewState = null;
      const entry = undoStack.pop();
      if (!entry) return false;
      state = touch(applyOps(state, [...entry.inverse].reverse()));
      redoStack.push(entry);
      emit({ kind: 'undo', type: entry.type });
      return true;
    },

    redo() {
      previewState = null;
      const entry = redoStack.pop();
      if (!entry) return false;
      state = touch(applyOps(state, entry.ops));
      undoStack.push(entry);
      emit({ kind: 'redo', type: entry.type });
      return true;
    },

    /**
     * 状態を丸ごと入れ替え、履歴を消す（プロジェクトを開いたとき・復元したとき）
     * @param {any} next
     */
    replace(next) {
      state = next;
      previewState = null;
      undoStack = [];
      redoStack = [];
      emit({ kind: 'replace' });
    },

    /** @param {(state: any, info: ChangeInfo) => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    historySize() {
      return { undo: undoStack.length, redo: redoStack.length };
    },
  };
  return store;
}
