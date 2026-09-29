// 停車駅案内図のビュー（§5.5）：対象（路線か直通の並び）と並べ方（横・縦）を選び、キャンバスに描く。
// 行を押すと、その行の系統を選ぶ。スマホの幅では、既定で駅を縦に並べる。
import { h } from './dom.js';
import { t, mapTranslator } from '../i18n/i18n.js';
import { selectInput } from './form.js';
import { createCanvasView } from './canvas-view.js';
import { chartTargets, buildStopChart } from '../core/stopchart.js';
import { buildStopChartScene } from '../render/scene-stopchart.js';
import { drawItems, createMeasure } from '../render/backend-canvas.js';
import { visibleWorldRect } from '../core/viewport.js';

const MOBILE = '(max-width: 899.98px)';

/**
 * @param {{ store: any, es: any, onSelectService: (id: string) => void }} ctx
 */
export function createStopChartView(ctx) {
  const { store, es } = ctx;
  const mq = window.matchMedia(MOBILE);
  const measure = createMeasure();

  const target = selectInput({ options: [], onChange: (v) => es.set({ chartTarget: v }) });
  target.setAttribute('aria-label', t('chart.target'));
  const layoutBtn = h('button', {
    class: 'btn btn-small',
    type: 'button',
    on: { click: () => es.set({ chartLayout: currentLayout() === 'vertical' ? 'horizontal' : 'vertical' }) },
  });
  const bar = h('div', { class: 'chart-bar on-paper' }, target, layoutBtn);

  let scene = null;
  let sceneKey = null;
  const canvasView = createCanvasView({
    label: t('views.stopChart'),
    getStyle: () => ({ background: store.getState().style.background, showGrid: false }),
    initialView: { cx: 0, cy: 0, zoom: 1 },
    onViewChange: () => {},
    getBounds: () => (scene && scene.items.length ? scene.bounds : null),
  });
  canvasView.addLayer((c, view, size) => {
    if (scene) drawItems(c, scene.items, visibleWorldRect(view, size));
  });
  canvasView.setInput({
    onTap: (p, w) => {
      const hit = scene && scene.rowBoxes.find((r) => w.x >= r.bbox.minX && w.x <= r.bbox.maxX && w.y >= r.bbox.minY && w.y <= r.bbox.maxY);
      if (hit) ctx.onSelectService(hit.serviceId);
    },
  });
  const el = h('div', { class: 'chart-view' }, bar, h('div', { class: 'chart-canvas' }, canvasView.el));

  function currentLayout() {
    const l = es.get().chartLayout;
    if (l === 'horizontal' || l === 'vertical') return l;
    return mq.matches ? 'vertical' : 'horizontal';
  }

  /** 対象の名前（路線名、直通の並びは「A線 → B線」） */
  function targetLabel(p, x) {
    const name = (id) => { const l = p.lines.find((y) => y.id === id); return l ? l.displayName || l.name : ''; };
    return x.kind === 'line' ? name(x.lineIds[0]) : t('chart.chainLabel', { lines: x.lineIds.map(name).join(t('service.arrow')) });
  }

  const onMq = () => { sceneKey = null; update(store.getState()); };
  mq.addEventListener('change', onMq);

  /** @param {import('../core/schema.js').Project} p */
  function update(p) {
    const targets = chartTargets(p);
    target.setOptions(targets.map((x) => ({ value: x.id, label: targetLabel(p, x) })));
    let id = es.get().chartTarget;
    if (!targets.some((x) => x.id === id)) id = targets[0] ? targets[0].id : '';
    target.setValue(id);
    target.disabled = !targets.length;
    const layout = currentLayout();
    layoutBtn.textContent = t(layout === 'vertical' ? 'chart.toHorizontal' : 'chart.toVertical');
    layoutBtn.disabled = !targets.length;

    const key = [p.stations, p.lines, p.services, p.serviceTypes, p.operators, p.style, p.locale, p.settings, id, layout];
    if (!sceneKey || sceneKey.some((v, i) => v !== key[i])) {
      const moved = !sceneKey || sceneKey[8] !== id || sceneKey[9] !== layout;
      sceneKey = key;
      const chart = id ? buildStopChart(p, id) : null;
      scene = chart ? buildStopChartScene(p, chart, { measure, layout, mapT: mapTranslator(p.locale.mapLanguage) }) : null;
      if (!targets.length) canvasView.setHint(t('chart.noLines'));
      else if (chart && !chart.rows.length) canvasView.setHint(t('chart.noServices'));
      else canvasView.setHint(null);
      // 対象や並べ方を変えたら全体を表示し直す
      if (moved && scene) canvasView.fitAll();
    }
    canvasView.requestRender();
  }

  return {
    el,
    update,
    /** 最初に開くときの対象（選んでいる路線・系統に合わせる） */
    targetFor(p, sel) {
      const targets = chartTargets(p);
      if (sel.type === 'line' || sel.type === 'section') return targets.find((x) => x.id === 'line:' + sel.lineId)?.id || '';
      if (sel.type === 'service') {
        const sv = p.services.find((x) => x.id === sel.id);
        const lines = sv ? [...new Set(sv.segments.map((s) => s.lineId))] : [];
        return (targets.find((x) => x.kind === 'chain' && lines.length > 1 && lines.every((l) => x.lineIds.includes(l)))
          || targets.find((x) => x.kind === 'line' && lines.includes(x.lineIds[0])))?.id || '';
      }
      return '';
    },
    /** 表示している表示リスト（書き出しに使う） */
    getScene: () => scene,
    fitAll: () => canvasView.fitAll(),
    zoomBy: (f) => canvasView.zoomBy(f),
    dispose() {
      mq.removeEventListener('change', onMq);
      canvasView.dispose();
    },
  };
}
