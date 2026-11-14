// 地形ブラシのパネル（§6.7）：ブラシの種類（8つ）・大きさ（半径 km）・強さ、使い方の説明、地形の作り直し
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { BRUSH_TOOLS } from '../../core/terrain/brush.js';

/** 大きさ（半径 km）の目盛り。地図の広さの 1/6 までを出す */
const SIZES = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80];
/** 大きさ・強さを使わないブラシ */
const FIXED = new Set(['river', 'city']);

/**
 * @param {{ store: any, es: any, regenerateTerrain?: () => void }} ctx
 */
export function createBrushPanel(ctx) {
  const { es } = ctx;
  const setBrush = (patch) => es.set({ brush: { ...es.get().brush, ...patch } });
  /** @type {number[]} */
  let sizes = SIZES;

  const toolBtns = BRUSH_TOOLS.map((tool) => h('button', {
    class: 'brush-tool',
    type: 'button',
    dataset: { tool },
    'aria-pressed': 'false',
    on: { click: () => setBrush({ tool }) },
  }, h('span', { class: 'brush-swatch' }), t('brush.tool.' + tool)));

  const slider = (label, onInput) => {
    const out = h('span', { class: 'terrain-value num' });
    const input = /** @type {HTMLInputElement} */ (h('input', { class: 'terrain-range', type: 'range', min: 0, max: 1, step: 1 }));
    input.addEventListener('input', () => onInput(Number(input.value)));
    const el = h('div', { class: 'field terrain-slider' }, h('label', { class: 'field-label' }, label, ' ', out), input);
    return { el, input, out };
  };
  const size = slider(t('brush.size'), (i) => setBrush({ size: sizes[i] }));
  const strength = slider(t('brush.strength'), (v) => setBrush({ strength: v / 10 }));
  strength.input.min = '1';
  strength.input.max = '10';
  const note = h('p', { class: 'panel-note' });
  const edits = h('p', { class: 'panel-note' });
  const regen = h('button', { class: 'btn btn-small', type: 'button', on: { click: () => ctx.regenerateTerrain && ctx.regenerateTerrain() } }, t('terrain.regenerate'));

  const el = h('div', {},
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, t('brush.title'))),
    h('div', { class: 'panel-section' },
      h('div', { class: 'brush-tools', role: 'group', 'aria-label': t('brush.kind') }, toolBtns),
      size.el,
      strength.el,
      note,
      h('p', { class: 'panel-note' }, t('brush.howTo')),
    ),
    h('div', { class: 'panel-section' },
      edits,
      ctx.regenerateTerrain ? h('div', { class: 'panel-actions' }, regen) : null,
    ),
  );

  return {
    el,
    /**
     * @param {import('../../core/schema.js').Project} p
     * @param {import('../editor-state.js').EditorState} s
     */
    update(p, s) {
      const b = s.brush;
      for (const btn of toolBtns) btn.setAttribute('aria-pressed', String(btn.dataset.tool === b.tool));
      // 大きさの目盛りは地図の広さに合わせる
      const mapKm = p.world.mode === 'fictional' ? p.world.gen.size * p.world.gen.cellKm : 256;
      sizes = SIZES.filter((v) => v <= Math.max(2, mapKm / 6));
      size.input.max = String(sizes.length - 1);
      let i = sizes.findIndex((v) => v >= b.size);
      if (i < 0) i = sizes.length - 1;
      size.input.value = String(i);
      size.out.textContent = t('brush.sizeValue', { km: b.size });
      strength.input.value = String(Math.round(b.strength * 10));
      strength.out.textContent = t('terrain.percent', { n: Math.round(b.strength * 100) });
      size.el.hidden = FIXED.has(b.tool);
      strength.el.hidden = FIXED.has(b.tool);
      note.textContent = t('brush.note.' + b.tool);
      const n = p.world.mode === 'fictional' ? (p.world.terrain.edits || []).length : 0;
      edits.textContent = t('brush.editCount', { count: n });
    },
  };
}
