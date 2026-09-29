// 「駅を置く」ツール：空いた格子点をタップすると駅を作り、駅名の入力欄を開く（§4.4）
import { snapToGrid } from '../../core/viewport.js';

/**
 * @param {import('../editor.js').ToolContext} ed
 */
export function createPlaceStationTool(ed) {
  return {
    id: 'station',
    cursor: 'crosshair',
    /** @param {any} p @param {{ x: number, y: number }} w */
    onTap(p, w) {
      // 駅名の札の上でも、そこが空いた格子点なら駅を置く（札では駅を選ばない）
      const hit = ed.hitTest(p, w, (tg) => tg.type === 'station');
      if (hit) {
        ed.select({ type: 'stations', ids: [hit.id] });
        return;
      }
      const g = snapToGrid(w.x, w.y);
      const existing = ed.stationAt(g);
      if (existing) {
        ed.select({ type: 'stations', ids: [existing] });
        return;
      }
      const id = ed.store.dispatch({ type: 'station/add', x: g.x, y: g.y });
      ed.select({ type: 'stations', ids: [id] });
      ed.focusStationName();
    },
    /** @param {any} p @param {{ x: number, y: number }} w */
    onHover(p, w) {
      ed.setHover(snapToGrid(w.x, w.y));
    },
  };
}
