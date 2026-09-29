// 駅名標のビュー（§5.6）：駅・路線・テンプレートを選び、表示する項目を決めてキャンバスに描く。
// 前後の駅を押すと、その駅の駅名標に移る。テンプレートと表示項目はプロジェクト（MapStyle）に保存し、
// 表示中の駅・路線は保存しない（エディタの状態に持つ）。
import { h } from './dom.js';
import { t, mapTranslator } from '../i18n/i18n.js';
import { selectInput, checkInput } from './form.js';
import { openSheet } from './dialog.js';
import { createCanvasView } from './canvas-view.js';
import { buildSignboard, signboardLines, signboardStations, SIGNBOARD_TEMPLATES, SIGNBOARD_ITEMS } from '../core/signboard.js';
import { buildSignboardScene } from '../render/scene-signboard.js';
import { drawItems, createMeasure } from '../render/backend-canvas.js';
import { visibleWorldRect } from '../core/viewport.js';

/**
 * @param {{ store: any, es: any }} ctx
 */
export function createSignboardView(ctx) {
  const { store, es } = ctx;
  const measure = createMeasure();
  const style = () => store.getState().style.signboard;
  const setSign = (fields) => store.dispatch({ type: 'project/style', fields: { signboard: { ...style(), ...fields } } });

  const station = selectInput({ options: [], onChange: (v) => es.set({ signStation: v }) });
  station.setAttribute('aria-label', t('sign.station'));
  const line = selectInput({ options: [], onChange: (v) => es.set({ signLine: v }) });
  line.setAttribute('aria-label', t('sign.line'));
  const template = selectInput({
    options: SIGNBOARD_TEMPLATES.map((v) => ({ value: v, label: t('sign.template.' + v) })),
    onChange: (v) => setSign({ template: v }),
  });
  template.setAttribute('aria-label', t('sign.template'));
  const itemsBtn = h('button', { class: 'btn btn-small', type: 'button', on: { click: () => openItems() } }, t('sign.items'));
  const bar = h('div', { class: 'chart-bar sign-bar on-paper' }, station, line, template, itemsBtn);

  let scene = null;
  let sceneKey = null;
  const canvasView = createCanvasView({
    label: t('views.signboard'),
    getStyle: () => ({ background: store.getState().style.background, showGrid: false }),
    initialView: { cx: 0, cy: 0, zoom: 1 },
    onViewChange: () => {},
    getBounds: () => (scene ? scene.bounds : null),
  });
  canvasView.addLayer((c, view, size) => {
    if (scene) drawItems(c, scene.items, visibleWorldRect(view, size));
  });
  canvasView.setInput({
    // 前後の駅を押すと、その駅の駅名標に移る（路線はそのまま）
    onTap: (p, w) => {
      const hit = scene && scene.hits.find((x) => w.x >= x.bbox.minX - 6 && w.x <= x.bbox.maxX + 6 && w.y >= x.bbox.minY - 6 && w.y <= x.bbox.maxY + 6);
      if (hit) es.set({ signStation: hit.stationId });
    },
  });
  const el = h('div', { class: 'chart-view sign-view' }, bar, h('div', { class: 'chart-canvas' }, canvasView.el));

  /** 表示する項目（シートでチェック） */
  function openItems() {
    const checks = SIGNBOARD_ITEMS.map((key) => checkInput({
      label: t('sign.item.' + key),
      checked: style().items[key],
      onChange: (v) => setSign({ items: { ...style().items, [key]: v } }),
    }));
    openSheet({ title: t('sign.items'), body: [h('div', { class: 'panel-section' }, checks)] });
  }

  /** 今の駅と路線（無くなっていれば選び直す） */
  function current(p) {
    const s = es.get();
    const stations = orderedStations(p);
    const st = stations.find((x) => x.id === s.signStation) || stations[0];
    if (!st) return { stations, st: null, lines: [], ln: null };
    const lines = signboardLines(p, st.id);
    const ln = lines.find((l) => l.id === s.signLine) || lines[0];
    return { stations, st, lines, ln };
  }

  /** @param {import('../core/schema.js').Project} p */
  function update(p) {
    const { stations, st, lines, ln } = current(p);
    station.setOptions(stations.map((x) => ({ value: x.id, label: x.name || t('station.unnamed') })));
    station.setValue(st ? st.id : '');
    station.disabled = !st;
    line.setOptions(lines.map((l) => ({ value: l.id, label: l.displayName || l.name })));
    line.setValue(ln ? ln.id : '');
    line.disabled = lines.length < 2;
    template.setValue(p.style.signboard.template);

    const key = [p.stations, p.lines, p.style, p.locale, st && st.id, ln && ln.id];
    if (!sceneKey || sceneKey.some((v, i) => v !== key[i])) {
      const moved = !sceneKey || !scene;
      sceneKey = key;
      const sb = st && ln ? buildSignboard(p, st.id, ln.id) : null;
      scene = sb ? buildSignboardScene(p, sb, { measure, mapT: mapTranslator(p.locale.mapLanguage) }) : null;
      canvasView.setHint(scene ? null : t('sign.noStations'));
      // 最初に出したときと、駅名標の高さが変わったときは全体を表示し直す
      if (scene && (moved || scene.bounds.maxY !== lastHeight)) canvasView.fitAll();
      lastHeight = scene ? scene.bounds.maxY : 0;
    }
    canvasView.requestRender();
  }
  let lastHeight = 0;

  return {
    el,
    update,
    /** 表示している表示リスト（書き出しに使う） */
    getScene: () => scene,
    /** 開くときの駅と路線（選んでいる駅・路線に合わせる） */
    targetFor(p, sel) {
      if (sel.type === 'stations' && sel.ids.length) {
        const lines = signboardLines(p, sel.ids[0]);
        if (lines.length) return { signStation: sel.ids[0], signLine: lines[0].id };
      }
      if (sel.type === 'line' || sel.type === 'section') {
        const l = p.lines.find((x) => x.id === sel.lineId);
        const cur = es.get().signStation;
        if (l && l.stops.some((s) => s.stationId === cur)) return { signLine: l.id };
        const first = l && orderedStations(p).find((s) => l.stops.some((x) => x.stationId === s.id));
        if (first) return { signStation: first.id, signLine: l.id };
      }
      return null;
    },
    /** 表示位置（確認用） */
    getView: () => canvasView.getView(),
    fitAll: () => canvasView.fitAll(),
    zoomBy: (f) => canvasView.zoomBy(f),
    dispose() {
      canvasView.dispose();
    },
  };
}

/**
 * 選べる駅を、路線の並び順・路線の中の順に並べる
 * @param {import('../core/schema.js').Project} p
 */
function orderedStations(p) {
  const ok = new Set(signboardStations(p).map((s) => s.id));
  const byId = new Map(p.stations.map((s) => [s.id, s]));
  const seen = new Set();
  const out = [];
  for (const l of [...p.lines].sort((a, b) => a.order - b.order)) {
    for (const s of l.stops) {
      if (!ok.has(s.stationId) || seen.has(s.stationId)) continue;
      seen.add(s.stationId);
      out.push(byId.get(s.stationId));
    }
  }
  return out;
}
