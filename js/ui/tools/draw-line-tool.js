// 「路線を引く」ツール（§4.4）
// ・駅を順にタップすると追加。空いた格子点をタップすると駅を作って追加する。
// ・完了ボタン・Enter・最後の駅のダブルタップで終了。始点の駅をタップすると環状線にするかを尋ねる。
// ・既存の路線の端の駅から続けてタップすると延長になる。
// ・区間をタップすると、駅の挿入と曲がり位置の切り替えのメニューを出す。
import { t } from '../../i18n/i18n.js';
import { snapToGrid } from '../../core/viewport.js';
import { sectionMenuItems } from './section-actions.js';

/**
 * @param {import('../editor.js').ToolContext} ed
 */
export function createDrawLineTool(ed) {
  const { store, es } = ed;

  function currentLine() {
    const d = es.get().drawing;
    return d ? store.getState().lines.find((l) => l.id === d.lineId) || null : null;
  }

  /** 路線の端（いま足している側）の駅 */
  function endStation(line, atStart) {
    if (!line || !line.stops.length) return null;
    return atStart ? line.stops[0].stationId : line.stops[line.stops.length - 1].stationId;
  }

  function newLineFields() {
    const n = es.get().newLine;
    const fields = {};
    if (n.operatorId) fields.operatorId = n.operatorId;
    if (n.name) fields.name = n.name;
    if (n.color) fields.color = n.color;
    if (n.symbol) fields.symbol = n.symbol;
    if (n.kind) fields.kind = n.kind;
    return fields;
  }

  /** 路線を引き始める（新しい路線か、選んだ既存の路線） */
  function start(target) {
    const choice = es.get().lineChoice;
    if (choice === 'new') {
      const lineId = store.dispatch({
        type: 'line/add',
        fields: newLineFields(),
        stationIds: target.stationId ? [target.stationId] : [],
        newStation: target.newStation,
      });
      // 次に新しい路線を作るときのために、入力中の値を空に戻す
      es.set({ drawing: { lineId, atStart: false }, lineChoice: lineId, newLine: { ...es.get().newLine, name: '', symbol: '', color: '' } });
      ed.select({ type: 'line', lineId });
      return;
    }
    const line = store.getState().lines.find((l) => l.id === choice);
    if (!line) {
      es.set({ lineChoice: 'new' });
      start(target);
      return;
    }
    const first = line.stops.length ? line.stops[0].stationId : null;
    const last = endStation(line, false);
    if (target.stationId && line.stops.length > 1 && target.stationId === first && !line.isLoop) {
      es.set({ drawing: { lineId: line.id, atStart: true } });
    } else if (target.stationId && target.stationId === last) {
      es.set({ drawing: { lineId: line.id, atStart: false } });
    } else {
      if (line.isLoop) {
        ed.toast(t('tool.line.loopCannotExtend'));
        return;
      }
      const r = store.dispatch({ type: 'line/appendStop', lineId: line.id, ...target });
      if (r === null) {
        ed.toast(t('tool.line.alreadyInLine'));
        return;
      }
      es.set({ drawing: { lineId: line.id, atStart: false } });
    }
    ed.select({ type: 'line', lineId: line.id });
  }

  /** @param {{ stationId?: string, newStation?: { x: number, y: number } }} target */
  async function add(target) {
    const d = es.get().drawing;
    const line = currentLine();
    if (!d || !line) {
      start(target);
      return;
    }
    if (target.stationId) {
      const id = target.stationId;
      if (id === endStation(line, d.atStart)) return;
      const other = endStation(line, !d.atStart);
      if (id === other && line.stops.length >= 3 && !line.isLoop) {
        const ok = await ed.confirm({ title: t('tool.line.loopTitle'), message: t('tool.line.loopMessage'), okLabel: t('tool.line.makeLoop') });
        if (ok) {
          store.dispatch({ type: 'line/setLoop', lineId: line.id, isLoop: true });
          finish();
        }
        return;
      }
      if (line.stops.some((s) => s.stationId === id)) {
        ed.toast(t('tool.line.alreadyInLine'));
        return;
      }
    }
    store.dispatch({ type: 'line/appendStop', lineId: line.id, atStart: d.atStart, ...target });
  }

  function finish() {
    const line = currentLine();
    es.set({ drawing: null });
    if (line) ed.select({ type: 'line', lineId: line.id });
  }

  return {
    id: 'line',
    cursor: 'crosshair',
    finish,
    /** この駅から新しい路線を引き始める（分岐） */
    branchFrom(stationId) {
      es.set({ lineChoice: 'new', drawing: null });
      start({ stationId });
    },
    /** @param {any} p @param {{ x: number, y: number }} w */
    onTap(p, w) {
      // 駅名の札は当たり判定に使わない（札の下の空いた格子点に駅を作れるように）
      const hit = ed.hitTest(p, w, (tg) => tg.type === 'station' || tg.type === 'section');
      if (hit && hit.type === 'station') {
        add({ stationId: hit.id });
        return;
      }
      const g = snapToGrid(w.x, w.y);
      const existing = ed.stationAt(g);
      if (existing) {
        add({ stationId: existing });
        return;
      }
      // 区間のメニューは、引いている途中でなければどの路線でも、引いている途中ならその路線だけに出す
      // （ほかの路線の区間の上なら、そこに駅を作って追加する）
      const d = es.get().drawing;
      if (hit && hit.type === 'section' && (!d || d.lineId === hit.lineId)) {
        ed.openMenuAt(p, sectionMenuItems(ed, hit, w, { insert: true, bend: true }));
        return;
      }
      add({ newStation: g });
    },
    /** 最後の駅のダブルタップで終了 */
    onDoubleTap(p, w) {
      const d = es.get().drawing;
      if (!d) return false;
      const line = currentLine();
      const hit = ed.hitTest(p, w, (tg) => tg.type === 'station');
      const id = hit ? hit.id : ed.stationAt(snapToGrid(w.x, w.y));
      if (line && id && id === endStation(line, d.atStart)) finish();
      return true;
    },
    /** @param {any} p @param {{ x: number, y: number }} w */
    onHover(p, w) {
      ed.setHover(snapToGrid(w.x, w.y));
    },
    /** @param {KeyboardEvent} e */
    onKey(e) {
      if (e.key === 'Enter' || e.key === 'Escape') {
        if (es.get().drawing) {
          finish();
          return true;
        }
      }
      return false;
    },
  };
}
