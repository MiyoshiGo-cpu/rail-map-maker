// 「駅を置く」ツール：空いた所をタップすると駅を作り、駅名の入力欄を開く（§4.4）。
// 路線図では格子点に、地理ビューではタップした地理の位置に置く（ed.spotAt が決める）
/**
 * @param {import('../editor.js').ToolContext} ed
 */
export function createPlaceStationTool(ed) {
  return {
    id: 'station',
    cursor: 'crosshair',
    /** @param {any} p @param {{ x: number, y: number }} w */
    onTap(p, w) {
      // 駅名の札の上でも、そこが空いた所なら駅を置く（札では駅を選ばない）
      const hit = ed.hitTest(p, w, (tg) => tg.type === 'station');
      if (hit) {
        ed.select({ type: 'stations', ids: [hit.id] });
        return;
      }
      const spot = ed.spotAt(w);
      if (spot.stationId) {
        ed.select({ type: 'stations', ids: [spot.stationId] });
        return;
      }
      const id = ed.store.dispatch({ type: 'station/add', ...spot.newStation });
      ed.select({ type: 'stations', ids: [id] });
      ed.focusStationName();
    },
    /** @param {any} p @param {{ x: number, y: number }} w */
    onHover(p, w) {
      ed.setHover(ed.spotAt(w).hover);
    },
  };
}
