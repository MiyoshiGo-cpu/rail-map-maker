// 区間に対する操作（駅の挿入・曲がり位置の切り替え・区間の削除・路線の削除）。
// 路線を引くツール・削除ツール・長押しメニューで共通に使う。
import { t } from '../../i18n/i18n.js';
import { snapToGrid } from '../../core/viewport.js';
import { isOctilinear } from '../../core/octilinear.js';
import { openDialog } from '../dialog.js';

/**
 * 番号を確定している路線に途中の駅を足すときは、枝番か振り直しかを選んでもらう（§6.2）
 * @param {import('../../core/schema.js').Line} line
 * @param {(numbering?: 'branch'|'renumber') => void} insert
 */
export async function insertWithNumbering(line, insert) {
  if (!line.numbering.enabled || line.numbering.mode !== 'fixed') {
    insert();
    return;
  }
  const v = await openDialog({
    title: t('numbering.insertTitle'),
    message: t('numbering.insertMessage'),
    actions: [
      { label: t('common.cancel'), value: 'cancel' },
      { label: t('numbering.insertRenumber'), value: 'renumber' },
      { label: t('numbering.insertBranch'), value: 'branch', kind: 'primary' },
    ],
  });
  if (v === 'branch' || v === 'renumber') insert(v);
}

/**
 * @param {import('../editor.js').ToolContext} ed
 * @param {{ lineId: string, index: number }} hit
 * @param {{ x: number, y: number }} w タップした世界座標
 * @param {{ insert?: boolean, bend?: boolean, cut?: boolean, deleteLine?: boolean }} which
 * @returns {import('../menu.js').MenuItem[]}
 */
export function sectionMenuItems(ed, hit, w, which) {
  const { store } = ed;
  const line = store.getState().lines.find((l) => l.id === hit.lineId);
  if (!line) return [];
  const items = [];
  if (which.insert) {
    items.push({
      label: t('tool.line.insertStation'),
      onSelect: () => {
        const g = snapToGrid(w.x, w.y);
        const existing = ed.stationAt(g);
        if (existing && line.stops.some((s) => s.stationId === existing)) {
          ed.toast(t('tool.line.alreadyInLine'));
          return;
        }
        const target = existing ? { stationId: existing } : { newStation: g };
        insertWithNumbering(line, (numbering) => {
          store.dispatch({ type: 'line/insertStop', lineId: line.id, sectionIndex: hit.index, ...target, numbering });
        });
      },
    });
  }
  if (which.bend) {
    const geom = ed.getScene().geom.get(line.id)?.[hit.index];
    const sec = line.sections[hit.index] || {};
    const straight = !geom || (geom.pts.length === 2 && isOctilinear(geom.pts[1].x - geom.pts[0].x, geom.pts[1].y - geom.pts[0].y));
    items.push({
      label: t('tool.line.toggleBend'),
      disabled: straight,
      onSelect: () => {
        let cur = sec.schematicBend;
        if (!cur || cur === 'auto') {
          // いま描かれている形から、どちらになっているかを読み取る
          const a = geom.pts[0];
          const b = geom.pts[1];
          cur = a.x !== b.x && a.y !== b.y ? 'diagonalFirst' : 'straightFirst';
        }
        store.dispatch({
          type: 'line/section',
          lineId: line.id,
          index: hit.index,
          fields: { schematicBend: cur === 'diagonalFirst' ? 'straightFirst' : 'diagonalFirst' },
        });
      },
    });
  }
  if (which.cut) {
    items.push({
      label: t('section.delete'),
      danger: true,
      onSelect: () => {
        store.dispatch({ type: 'line/cutSection', lineId: line.id, sectionIndex: hit.index });
        ed.toast(t('section.deleted'));
      },
    });
  }
  if (which.deleteLine) {
    items.push({
      label: t('line.deleteNamed', { name: line.displayName || line.name }),
      danger: true,
      onSelect: () => ed.deleteLine(line.id),
    });
  }
  return items;
}
