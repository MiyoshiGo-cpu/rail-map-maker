// 地形を作る画面（§6.7）：シード・形・大きさ・陸地の割合・山の険しさ・海岸線の複雑さ・川の多さ・都市の数・総人口。
// 値を変えると小さいプレビューを作り直し、「作る」で本生成する（Worker で計算し、進み具合を出す）。
import { h } from './dom.js';
import { t } from '../i18n/i18n.js';
import { openSheet } from './dialog.js';
import { field, selectInput, numberInput, textInput } from './form.js';
import { requestTerrain } from './terrain-client.js';
import { defaultTerrainParams, TERRAIN_SHAPES, TERRAIN_SIZES } from '../core/terrain/generate.js';
import { terrainRGBA } from '../render/terrain-raster.js';

/** 新しいシード（地形の計算そのものは Math.random を使わない。ここではシードの文字列を選ぶだけ） */
function newSeed() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (a[0].toString(36) + a[1].toString(36)).slice(0, 8);
}

/**
 * @param {{
 *   title: string,
 *   regionId: string,
 *   romaji?: any,
 *   stations?: Array<{ id: string, schematic: { x: number, y: number } | null }>,
 *   initial?: { seed: string, params: import('../core/schema.js').TerrainParams },
 * }} opt
 * @returns {Promise<{ world: any, stationGeo: Record<string, { x: number, y: number }>, ms: number } | null>}
 */
export function openTerrainDialog(opt) {
  const params = { ...defaultTerrainParams(), ...(opt.initial ? opt.initial.params : {}) };
  let seed = opt.initial ? opt.initial.seed : newSeed();
  let busy = false;
  let done = false;

  return new Promise((resolve) => {
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };

    // ---------- 入力 ----------
    const seedInput = textInput({ value: seed, onChange: (v) => { seed = v.trim() || newSeed(); seedInput.value = seed; schedulePreview(); } });
    const reseed = h('button', { class: 'btn btn-small', type: 'button', on: { click: () => { seed = newSeed(); seedInput.value = seed; schedulePreview(); } } }, t('terrain.reseed'));
    const shape = selectInput({
      options: TERRAIN_SHAPES.map((v) => ({ value: v, label: t('terrain.shape.' + v) })),
      value: params.shape,
      onChange: (v) => {
        // 内陸はほぼ全面が陸なので、陸地の割合も合わせる（ほかの形に戻したら元の既定に）
        if (v === 'inland' && params.landRatio < 0.6) setRatio(0.85);
        else if (v !== 'inland' && params.shape === 'inland' && params.landRatio > 0.6) setRatio(0.35);
        params.shape = /** @type {any} */ (v);
        schedulePreview();
      },
    });
    const size = selectInput({
      options: TERRAIN_SIZES.map((v) => ({ value: String(v), label: t('terrain.size.' + v, { km: v * params.cellKm }) })),
      value: String(params.size),
      onChange: (v) => {
        params.size = /** @type {any} */ (Number(v));
        largeNote.hidden = params.size < 1024;
        schedulePreview();
      },
    });
    const largeNote = h('p', { class: 'panel-note', hidden: params.size < 1024 }, t('terrain.largeNote'));
    /** 0〜100% のつまみ */
    const slider = (key, min, max) => {
      const out = h('span', { class: 'terrain-value num' });
      const input = /** @type {HTMLInputElement} */ (h('input', { class: 'terrain-range', type: 'range', min, max, step: 1 }));
      const show = () => { out.textContent = t('terrain.percent', { n: input.value }); };
      input.value = String(Math.round(params[key] * 100));
      show();
      input.addEventListener('input', () => {
        params[key] = Number(input.value) / 100;
        show();
        schedulePreview();
      });
      const el = h('div', { class: 'field terrain-slider' },
        h('label', { class: 'field-label' }, t('terrain.' + key), ' ', out),
        input,
      );
      return { el, input, show };
    };
    const ratio = slider('landRatio', 10, 90);
    const setRatio = (v) => {
      params.landRatio = v;
      ratio.input.value = String(Math.round(v * 100));
      ratio.show();
    };
    const rug = slider('ruggedness', 0, 100);
    const coast = slider('coastComplexity', 0, 100);
    const river = slider('riverAmount', 0, 100);
    const cities = numberInput({ value: params.cityCount, min: 0, max: 80, step: 1, onChange: (v) => { params.cityCount = Math.max(0, Math.min(80, Math.round(v ?? 0))); } });
    const population = numberInput({ value: Math.round(params.totalPopulation / 10000), min: 1, max: 5000, step: 10, onChange: (v) => { params.totalPopulation = Math.max(1, Math.min(5000, v ?? 1)) * 10000; } });

    // ---------- プレビュー ----------
    const canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { class: 'terrain-preview', width: 256, height: 256, role: 'img', 'aria-label': t('terrain.preview') }));
    let previewSeq = 0;
    let previewTimer = 0;
    function schedulePreview() {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(drawPreview, 120);
    }
    async function drawPreview() {
      const my = ++previewSeq;
      canvas.classList.add('is-loading');
      try {
        const r = await requestTerrain({ kind: 'preview', seed, params: { ...params } });
        if (my !== previewSeq || done) return;
        const rgba = terrainRGBA(r.data, r.width, r.height, { cellKm: (params.size * params.cellKm) / r.width });
        const tmp = document.createElement('canvas');
        tmp.width = r.width;
        tmp.height = r.height;
        tmp.getContext('2d').putImageData(new ImageData(rgba, r.width, r.height), 0, 0);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
      } catch (e) {
        console.error(e);
      } finally {
        if (my === previewSeq) canvas.classList.remove('is-loading');
      }
    }

    // ---------- 作る ----------
    const progress = /** @type {HTMLProgressElement} */ (h('progress', { class: 'terrain-progress', max: 100, value: 0, hidden: true }));
    const status = h('p', { class: 'panel-note', role: 'status', hidden: true });
    const cancelBtn = h('button', { class: 'btn', type: 'button', on: { click: () => sheet.close() } }, t('common.cancel'));
    const createBtn = h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => create() } }, t('terrain.create'));
    const inputs = [seedInput, reseed, shape, size, ratio.input, rug.input, coast.input, river.input, cities, population];

    async function create() {
      if (busy) return;
      busy = true;
      for (const el of inputs) el.disabled = true;
      createBtn.disabled = true;
      progress.hidden = false;
      status.hidden = false;
      const show = (r) => {
        const n = Math.round(r * 100);
        progress.value = n;
        status.textContent = t('terrain.creating', { n });
      };
      show(0);
      try {
        const r = await requestTerrain({ kind: 'world', seed, params: { ...params }, regionId: opt.regionId, romaji: opt.romaji, stations: opt.stations }, show);
        if (done) return;
        finish({ world: r.world, stationGeo: r.stationGeo || {}, ms: r.ms });
        sheet.close();
      } catch (e) {
        console.error(e);
        status.textContent = t('terrain.failed');
        busy = false;
        for (const el of inputs) el.disabled = false;
        createBtn.disabled = false;
        progress.hidden = true;
      }
    }

    const sheet = openSheet({
      title: opt.title,
      onClose: () => finish(null),
      body: [
        h('div', { class: 'panel-section terrain-dialog' },
          h('div', { class: 'terrain-preview-wrap' }, canvas),
          h('p', { class: 'panel-note' }, t('terrain.previewHint')),
          h('div', { class: 'field-row field-row-end' }, field(t('terrain.seed'), seedInput), reseed),
          h('div', { class: 'field-row' }, field(t('terrain.shape'), shape), field(t('terrain.size'), size)),
          largeNote,
          ratio.el,
          rug.el,
          coast.el,
          river.el,
          h('div', { class: 'field-row' }, field(t('terrain.cityCount'), cities), field(t('terrain.population'), population)),
          opt.stations && opt.stations.length ? h('p', { class: 'panel-note' }, t('terrain.addHint')) : null,
          progress,
          status,
          h('div', { class: 'panel-actions' }, cancelBtn, createBtn),
        ),
      ],
    });
    drawPreview();
  });
}
