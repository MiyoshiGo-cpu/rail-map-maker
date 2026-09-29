// 削除ツール（§4.4）：タップした駅・区間・路線を削除する。駅を消した場合、通っていた路線は前後の駅でつなぎ直す
import { sectionMenuItems } from './section-actions.js';

/**
 * @param {import('../editor.js').ToolContext} ed
 */
export function createDeleteTool(ed) {
  return {
    id: 'delete',
    cursor: 'pointer',
    /** @param {any} p @param {{ x: number, y: number }} w */
    onTap(p, w) {
      const hit = ed.hitTest(p, w, (tg) => tg.type === 'station' || tg.type === 'label' || tg.type === 'section');
      if (!hit) return;
      if (hit.type === 'station' || hit.type === 'label') {
        ed.deleteStations([hit.id]);
        return;
      }
      // 区間は「この区間だけ」か「路線全体」かを選んでもらう
      ed.select({ type: 'section', lineId: hit.lineId, index: hit.index });
      ed.openMenuAt(p, sectionMenuItems(ed, hit, w, { cut: true, deleteLine: true }));
    },
  };
}
