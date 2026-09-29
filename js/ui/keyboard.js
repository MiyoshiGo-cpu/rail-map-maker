// キーボードショートカット（§4.5）。入力欄にフォーカスがあるとき・日本語の変換中・ダイアログ表示中は反応しない

/**
 * @typedef {object} ShortcutActions
 * @property {(tool: 'select'|'station'|'line'|'delete') => void} setTool
 * @property {() => void} undo
 * @property {() => void} redo
 * @property {() => void} deleteSelection
 * @property {() => void} selectAll
 * @property {() => void} duplicate
 * @property {() => void} escape
 * @property {() => void} fit
 * @property {(factor: number) => void} zoom
 * @property {(e: KeyboardEvent) => boolean} toolKey ツールが処理したら true（Enter・矢印など）
 * @property {() => void} [search]
 * @property {() => void} [exportJson]
 * @property {(n: number) => void} [view]
 */

/** @param {KeyboardEvent} e */
export function isTyping(e) {
  if (e.isComposing || e.keyCode === 229) return true;
  const el = /** @type {HTMLElement} */ (e.target);
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * @param {ShortcutActions} a
 * @returns {() => void} 解除する関数
 */
export function attachShortcuts(a) {
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (isTyping(e) || document.querySelector('dialog[open]') || document.querySelector('.menu')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let handled = true;
    if (mod && !e.altKey) {
      if (k === 'z' && !e.shiftKey) a.undo();
      else if ((k === 'z' && e.shiftKey) || k === 'y') a.redo();
      else if (k === 'a') a.selectAll();
      else if (k === 'd') a.duplicate();
      else if (k === 'f' && a.search) a.search();
      else if (k === 's' && a.exportJson) a.exportJson();
      else handled = false;
    } else if (e.altKey) {
      handled = false;
    } else if (a.toolKey(e)) {
      handled = true;
    } else {
      switch (k) {
        case 'v': a.setTool('select'); break;
        case 's': a.setTool('station'); break;
        case 'l': a.setTool('line'); break;
        case 'e': a.setTool('delete'); break;
        case 'Delete':
        case 'Backspace': a.deleteSelection(); break;
        case 'Escape': a.escape(); break;
        case 'f': a.fit(); break;
        case '+':
        case '=':
        case ';': a.zoom(1.25); break;
        case '-': a.zoom(0.8); break;
        case '1': case '2': case '3': case '4':
          if (a.view) a.view(Number(k));
          break;
        default: handled = false;
      }
    }
    if (handled) e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
