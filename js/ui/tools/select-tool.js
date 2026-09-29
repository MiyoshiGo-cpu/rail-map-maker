// 選択ツール（ステップ7ではタップで選ぶだけ。移動・範囲選択・整列はステップ9）

/**
 * @param {import('../editor.js').ToolContext} ed
 */
export function createSelectTool(ed) {
  return {
    id: 'select',
    cursor: 'default',
    /** @param {any} p @param {{ x: number, y: number }} w */
    onTap(p, w) {
      ed.selectTarget(ed.hitTest(p, w));
    },
  };
}
