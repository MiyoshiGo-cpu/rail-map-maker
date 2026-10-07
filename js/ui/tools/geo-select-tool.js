// 地理ビューの選択ツール（§4.4 を地理の位置で）
// ・タップで選択。PC は Shift / Ctrl を押しながらで駅を追加・解除
// ・駅の上からドラッグで地理の位置を動かす（選んでいる駅の上なら、選んだ駅をまとめて）。格子には合わせない
// ・選んだ区間の経由点（四角い点）はドラッグで動かし、長押しで消す
// ・駅名の札のドラッグで位置を微調整（label.geo の dx・dy。画面の px）
// ・範囲選択：PC は Shift＋ドラッグ、スマホは「範囲」ボタンを押してからドラッグ
// ・長押し（PC は右クリック）でその場のメニュー。区間なら「ここに駅を入れる」「ここに経由点を足す」も出す
import { t } from '../../i18n/i18n.js';
import { GEO_UNIT } from '../../core/viewport.js';
import { viaInsertIndex } from '../../core/geo-lines.js';
import { sectionMenuItems } from './section-actions.js';

/** 矢印キーで動かす長さ（画面の px） */
const KEY_STEP_PX = 10;

const round3 = (v) => Math.round(v * 1000) / 1000 + 0;
/** 世界座標 → 地理座標（km） */
const toKm = (w) => ({ x: round3(w.x / GEO_UNIT), y: round3(w.y / GEO_UNIT) });

/**
 * @param {import('../editor.js').ToolContext & { zoom: () => number, sceneZoom: () => number }} ed
 *   zoom は今の倍率、sceneZoom は表示リストを作った倍率の段階（札のずれを画面の px に直すのに使う）
 */
export function createGeoSelectTool(ed) {
  const { store, es } = ed;

  function selectedStationIds() {
    const sel = es.get().selection;
    return sel.type === 'stations' ? sel.ids : [];
  }

  /** 駅をドラッグして地理の位置を動かす */
  function moveDrag(hitId, w0) {
    const cur = selectedStationIds();
    const ids = cur.includes(hitId) ? cur : [hitId];
    if (!cur.includes(hitId)) ed.select({ type: 'stations', ids });
    let delta = null;
    return {
      move(q) {
        const w = ed.toWorld(q);
        delta = { dx: round3((w.x - w0.x) / GEO_UNIT), dy: round3((w.y - w0.y) / GEO_UNIT) };
        if (delta.dx || delta.dy) store.preview({ type: 'station/moveGeo', ids, ...delta });
        else store.cancelPreview();
      },
      end() {
        store.cancelPreview();
        if (delta && (delta.dx || delta.dy)) store.dispatch({ type: 'station/moveGeo', ids, ...delta });
      },
      cancel() {
        store.cancelPreview();
      },
    };
  }

  /** 選んだ区間の地理の経由点の近くなら、その番号 */
  function viaAt(p, w) {
    const sel = es.get().selection;
    if (sel.type !== 'section') return null;
    const line = store.getState().lines.find((l) => l.id === sel.lineId);
    const via = line && line.sections[sel.index] && line.sections[sel.index].geoVia;
    if (!via) return null;
    const r = ed.hitRadius(p);
    let best = null;
    let bestD = Infinity;
    via.forEach((v, i) => {
      if (!('x' in v)) return;
      const d = Math.hypot(v.x * GEO_UNIT - w.x, v.y * GEO_UNIT - w.y);
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
        last = toKm(ed.toWorld(q));
        store.preview({ type: 'line/section', lineId: v.lineId, index: v.index, fields: { geoVia: withMoved(last) } });
      },
      end() {
        store.cancelPreview();
        if (last) store.dispatch({ type: 'line/section', lineId: v.lineId, index: v.index, fields: { geoVia: withMoved(last) } });
      },
      cancel() {
        store.cancelPreview();
      },
    };
  }

  /** 駅名の札をドラッグして微調整する（自動の位置なら、いまの方向に固定してからずらす） */
  function labelDrag(stationId, w0) {
    const st = store.getState().stations.find((s) => s.id === stationId);
    const lb = st.label.geo;
    const pos = lb.pos && lb.pos !== 'auto' ? lb.pos : (ed.getScene().labelInfo.get(stationId)?.pos || 'E');
    const dx0 = lb.dx || 0;
    const dy0 = lb.dy || 0;
    // 札は表示リストを作った倍率の段階で置かれるので、その段階で画面の px に直す
    const k = ed.sceneZoom();
    ed.select({ type: 'stations', ids: [stationId] });
    let last = null;
    return {
      move(q) {
        const w = ed.toWorld(q);
        last = { pos, dx: Math.round(dx0 + (w.x - w0.x) * k), dy: Math.round(dy0 + (w.y - w0.y) * k) };
        store.preview({ type: 'station/label', stationId, view: 'geo', fields: last });
      },
      end() {
        store.cancelPreview();
        if (last) store.dispatch({ type: 'station/label', stationId, view: 'geo', fields: last });
      },
      cancel() {
        store.cancelPreview();
      },
    };
  }

  /** 範囲選択（地理の位置で） */
  function marqueeDrag(w0, additive) {
    return {
      move(q) {
        const w = ed.toWorld(q);
        es.set({ marquee: { x0: w0.x, y0: w0.y, x1: w.x, y1: w.y } });
      },
      end(q) {
        const w = ed.toWorld(q);
        const minX = Math.min(w0.x, w.x) / GEO_UNIT;
        const maxX = Math.max(w0.x, w.x) / GEO_UNIT;
        const minY = Math.min(w0.y, w.y) / GEO_UNIT;
        const maxY = Math.max(w0.y, w.y) / GEO_UNIT;
        const inside = store.getState().stations
          .filter((s) => s.geo && 'x' in s.geo && s.geo.x >= minX && s.geo.x <= maxX && s.geo.y >= minY && s.geo.y <= maxY)
          .map((s) => s.id);
        const ids = additive ? [...new Set([...selectedStationIds(), ...inside])] : inside;
        es.set({ marquee: null, selection: ids.length ? { type: 'stations', ids } : { type: 'none' } });
      },
      cancel() {
        es.set({ marquee: null });
      },
    };
  }

  /** 区間の長押しメニュー：ここに駅を入れる・ここに経由点を足す・区間の削除・路線の削除 */
  function sectionMenu(hit, w) {
    const line = store.getState().lines.find((l) => l.id === hit.lineId);
    if (!line) return [];
    const viaItem = {
      label: t('via.addHere'),
      onSelect: () => {
        const p = store.getState();
        const n = line.stops.length;
        const geoOf = (id) => p.stations.find((s) => s.id === id)?.geo;
        const a = geoOf(line.stops[hit.index].stationId);
        const b = geoOf(line.stops[(hit.index + 1) % n].stationId);
        if (!a || !b) return;
        const via = (line.sections[hit.index] && line.sections[hit.index].geoVia) || [];
        const list = [...via];
        list.splice(viaInsertIndex([a, ...via, b], toKm(w)), 0, toKm(w));
        store.dispatch({ type: 'line/section', lineId: line.id, index: hit.index, fields: { geoVia: list } });
        ed.select({ type: 'section', lineId: line.id, index: hit.index });
      },
    };
    const [insert, ...rest] = sectionMenuItems(ed, hit, w, { insert: true, cut: true, deleteLine: true });
    return [insert, viaItem, ...rest];
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
      if (range) return marqueeDrag(w, p.ctrlKey || p.metaKey);
      const v = viaAt(p, w);
      if (v) return viaDrag(v);
      const hit = ed.hitTest(p, w, (tg) => tg.type === 'station' || tg.type === 'label');
      if (hit && hit.type === 'label') return labelDrag(hit.id, w);
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
            store.dispatch({ type: 'line/section', lineId: v.lineId, index: v.index, fields: { geoVia: rest.length ? rest : null } });
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
        ed.openMenuAt(p, sectionMenu(hit, w));
      }
    },
    /** 矢印キーで画面の 10px（Shift で 50px）ぶん動かす */
    onKey(e) {
      const step = (e.shiftKey ? 5 : 1) * KEY_STEP_PX / (ed.zoom() * GEO_UNIT);
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d || e.ctrlKey || e.metaKey || e.altKey) return false;
      const ids = selectedStationIds();
      if (!ids.length) return false;
      store.dispatch({ type: 'station/moveGeo', ids, dx: round3(d[0]), dy: round3(d[1]) });
      return true;
    },
  };
}
