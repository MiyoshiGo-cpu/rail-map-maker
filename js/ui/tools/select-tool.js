// 選択ツール（§4.4）
// ・タップで選択。PC は Shift / Ctrl を押しながらで駅を追加・解除
// ・駅の上からドラッグで移動（格子にスナップ）。選んでいる駅の上なら選んだ駅をまとめて動かす
// ・範囲選択：PC は Shift＋ドラッグ、スマホは「範囲」ボタンを押してからドラッグ
// ・何もない所のドラッグはパン。長押し（PC は右クリック）でその場のメニュー
import { t } from '../../i18n/i18n.js';
import { GRID } from '../../core/viewport.js';
import { hasCollision } from '../../core/align.js';
import { sectionMenuItems } from './section-actions.js';

/**
 * @param {import('../editor.js').ToolContext} ed
 */
export function createSelectTool(ed) {
  const { store, es } = ed;

  function selectedStationIds() {
    const sel = es.get().selection;
    return sel.type === 'stations' ? sel.ids : [];
  }

  /** 駅をドラッグして動かす */
  function moveDrag(hitId, w0) {
    const cur = selectedStationIds();
    const ids = cur.includes(hitId) ? cur : [hitId];
    if (!cur.includes(hitId)) ed.select({ type: 'stations', ids });
    let delta = { dx: 0, dy: 0 };
    return {
      move(q) {
        const w = ed.toWorld(q);
        const dx = Math.round((w.x - w0.x) / GRID);
        const dy = Math.round((w.y - w0.y) / GRID);
        if (dx === delta.dx && dy === delta.dy) return;
        delta = { dx, dy };
        if (dx || dy) store.preview({ type: 'station/move', ids, dx, dy });
        else store.cancelPreview();
      },
      end() {
        store.cancelPreview();
        const { dx, dy } = delta;
        if (!dx && !dy) return;
        ed.moveStations(ids, dx, dy);
      },
      cancel() {
        store.cancelPreview();
      },
    };
  }

  /** 選んだ区間の経由点の近くなら、その番号 */
  function viaAt(p, w) {
    const sel = es.get().selection;
    if (sel.type !== 'section') return null;
    const line = store.getState().lines.find((l) => l.id === sel.lineId);
    const via = line && line.sections[sel.index] && line.sections[sel.index].schematicVia;
    if (!via) return null;
    const r = ed.hitRadius(p);
    let best = null;
    let bestD = Infinity;
    via.forEach((v, i) => {
      const d = Math.hypot(v.x * GRID - w.x, v.y * GRID - w.y);
      if (d <= r && d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best === null ? null : { lineId: sel.lineId, index: sel.index, via, i: best };
  }

  /** 経由点をドラッグして動かす */
  function viaDrag(v) {
    let last = null;
    const withMoved = (g) => v.via.map((q, k) => (k === v.i ? g : q));
    return {
      move(q) {
        const w = ed.toWorld(q);
        const g = { x: Math.round(w.x / GRID) + 0, y: Math.round(w.y / GRID) + 0 };
        if (last && last.x === g.x && last.y === g.y) return;
        last = g;
        store.preview({ type: 'line/section', lineId: v.lineId, index: v.index, fields: { schematicVia: withMoved(g) } });
      },
      end() {
        store.cancelPreview();
        const orig = v.via[v.i];
        if (!last || (last.x === orig.x && last.y === orig.y)) return;
        store.dispatch({ type: 'line/section', lineId: v.lineId, index: v.index, fields: { schematicVia: withMoved(last) } });
      },
      cancel() {
        store.cancelPreview();
      },
    };
  }

  /** 範囲選択 */
  function marqueeDrag(w0, additive) {
    return {
      move(q) {
        const w = ed.toWorld(q);
        es.set({ marquee: { x0: w0.x, y0: w0.y, x1: w.x, y1: w.y } });
      },
      end(q) {
        const w = ed.toWorld(q);
        const minX = Math.min(w0.x, w.x) / GRID;
        const maxX = Math.max(w0.x, w.x) / GRID;
        const minY = Math.min(w0.y, w.y) / GRID;
        const maxY = Math.max(w0.y, w.y) / GRID;
        const inside = store.getState().stations
          .filter((s) => s.schematic && s.schematic.x >= minX && s.schematic.x <= maxX && s.schematic.y >= minY && s.schematic.y <= maxY)
          .map((s) => s.id);
        const ids = additive ? [...new Set([...selectedStationIds(), ...inside])] : inside;
        es.set({ marquee: null, selection: ids.length ? { type: 'stations', ids } : { type: 'none' } });
      },
      cancel() {
        es.set({ marquee: null });
      },
    };
  }

  return {
    id: 'select',
    cursor: 'default',
    /** @param {any} p @param {{ x: number, y: number }} w */
    onTap(p, w) {
      const hit = ed.hitTest(p, w);
      const additive = p.shiftKey || p.ctrlKey || p.metaKey;
      if (additive && hit && (hit.type === 'station' || hit.type === 'label')) {
        const cur = selectedStationIds();
        const ids = cur.includes(hit.id) ? cur.filter((id) => id !== hit.id) : [...cur, hit.id];
        ed.select(ids.length ? { type: 'stations', ids } : { type: 'none' });
        return;
      }
      ed.selectTarget(hit);
    },
    /** @param {any} p @param {{ x: number, y: number }} w */
    onDragStart(p, w) {
      const range = es.get().rangeMode || (p.pointerType === 'mouse' && p.shiftKey);
      // 範囲選択は選び直し。Ctrl（Mac は ⌘）も押していれば今の選択に足す
      if (range) return marqueeDrag(w, p.ctrlKey || p.metaKey);
      const v = viaAt(p, w);
      if (v) return viaDrag(v);
      const hit = ed.hitTest(p, w, (tg) => tg.type === 'station' || tg.type === 'label');
      if (hit) return moveDrag(hit.id, w);
      return null;
    },
    /** 長押し・右クリックのメニュー */
    onLongPress(p, w) {
      const v = viaAt(p, w);
      if (v) {
        ed.openMenuAt(p, [{
          label: t('via.remove'),
          danger: true,
          onSelect: () => {
            const rest = v.via.filter((_, k) => k !== v.i);
            store.dispatch({ type: 'line/section', lineId: v.lineId, index: v.index, fields: { schematicVia: rest.length ? rest : null } });
          },
        }]);
        return;
      }
      const hit = ed.hitTest(p, w);
      if (!hit) return;
      if (hit.type === 'station' || hit.type === 'label') {
        if (!selectedStationIds().includes(hit.id)) ed.select({ type: 'stations', ids: [hit.id] });
        ed.openMenuAt(p, ed.stationMenuItems(hit.id));
        return;
      }
      if (hit.type === 'section') {
        ed.select({ type: 'section', lineId: hit.lineId, index: hit.index });
        ed.openMenuAt(p, sectionMenuItems(ed, hit, w, { insert: true, bend: true, cut: true, deleteLine: true }));
      }
    },
    /** 矢印キーで1マス（Shift で5マス）動かす */
    onKey(e) {
      const step = e.shiftKey ? 5 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d || e.ctrlKey || e.metaKey || e.altKey) return false;
      const ids = selectedStationIds();
      if (!ids.length) return false;
      ed.moveStations(ids, d[0], d[1]);
      return true;
    },
  };
}

/**
 * 駅を動かす（ほかの駅と重なるなら動かさない）
 * @param {any} store
 * @param {string[]} ids
 * @param {number} dx
 * @param {number} dy
 * @param {(msg: string) => void} toast
 */
export function moveStationsSafely(store, ids, dx, dy, toast) {
  const set = new Set(ids);
  const stations = store.getState().stations;
  const positions = {};
  for (const s of stations) if (set.has(s.id) && s.schematic) positions[s.id] = { x: s.schematic.x + dx, y: s.schematic.y + dy };
  if (hasCollision(positions, stations)) {
    toast(t('move.blocked'));
    return false;
  }
  store.dispatch({ type: 'station/move', ids, dx, dy });
  return true;
}
