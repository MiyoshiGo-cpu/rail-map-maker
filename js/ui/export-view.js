// 「書き出す」のシート（§5.9）：今表示しているビューを、選んだ形式で書き出す。
// PNG は倍率（1〜4倍）と背景の透過を選ぶ。約1,600万画素を超えるときは案内を出し、倍率を下げて書き出せるようにする。
// SVG は同じ表示リストから作る（文字は文字のまま）。印刷は SVG を用紙（A4・A3）に収める。
// iPhone では共有シートを開く（写真に保存するときは「画像を保存」）。JSON（バックアップ）もここから書き出せる。
import { h } from './dom.js';
import { t, formatNumber } from '../i18n/i18n.js';
import { openSheet } from './dialog.js';
import { field, selectInput, checkInput } from './form.js';
import { toast } from './toast.js';
import { exportTarget, renderPng, renderSvgBlob } from './exporter.js';
import { exportSize, fittingScale, EXPORT_SCALES, DEFAULT_EXPORT_SCALE } from '../core/export-size.js';
import { exportFilename, saveBlobFile } from '../storage/file-io.js';
import { printTarget } from './print.js';

/** 選んだ形式・倍率・透過は、開いているあいだ覚えておく */
const prefs = { format: 'png', scale: DEFAULT_EXPORT_SCALE, transparent: false, paper: 'a4', orientation: 'landscape' };

/**
 * @param {{
 *   store: any,
 *   es: any,
 *   getChartScene: () => any,
 *   onJson: () => void,
 * }} ctx
 */
export function openExportSheet(ctx) {
  const { store, es } = ctx;
  const view = es.get().view === 'stopChart' ? 'stopChart' : 'schematic';
  let target = exportTarget(store.getState(), view, ctx.getChartScene());
  /** 共有シートを開けなかったときの、準備ができたファイル */
  let pending = null;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const btn = (label, onClick, cls = 'btn') => h('button', { class: cls, type: 'button', on: { click: onClick } }, label);

  const format = selectInput({
    options: ['png', 'svg', 'print', 'json'].map((v) => ({ value: v, label: t('export.format.' + v) })),
    value: prefs.format,
    onChange: (v) => {
      prefs.format = v;
      refresh();
    },
  });
  const scale = selectInput({
    options: EXPORT_SCALES.map((n) => ({ value: String(n), label: t('export.scaleValue', { n }) })),
    value: String(prefs.scale),
    onChange: (v) => {
      prefs.scale = Number(v);
      refresh();
    },
  });
  const transparent = checkInput({ label: t('export.transparent'), checked: prefs.transparent, onChange: (v) => { prefs.transparent = v; } });
  const paper = selectInput({
    options: ['a4', 'a3'].map((v) => ({ value: v, label: t('print.paper.' + v) })),
    value: prefs.paper,
    onChange: (v) => { prefs.paper = v; },
  });
  const orientation = selectInput({
    options: ['landscape', 'portrait'].map((v) => ({ value: v, label: t('print.orientation.' + v) })),
    value: prefs.orientation,
    onChange: (v) => { prefs.orientation = v; },
  });
  // 路線図のタイトルと凡例（設定の「凡例とタイトル」と同じ。地図にも出る）
  const setShow = (key, v) => {
    const s = store.getState().style;
    store.dispatch({ type: 'project/style', fields: { [key]: { ...s[key], show: v } } });
    target = exportTarget(store.getState(), view, ctx.getChartScene());
    refresh();
  };
  const includeTitle = checkInput({ label: t('export.includeTitle'), onChange: (v) => setShow('title', v) });
  const includeLegend = checkInput({ label: t('export.includeLegend'), onChange: (v) => setShow('legend', v) });
  const sizeNote = h('p', { class: 'panel-note' });
  const nothing = h('p', { class: 'panel-warn' }, t('export.nothing'));
  const reduceBtn = btn('', () => run(fittingScale(target.bounds)));
  const warn = h('div', { class: 'panel-warn', role: 'alert' }, h('p', {}, t('export.tooLarge')), h('div', { class: 'panel-actions' }, reduceBtn));
  const runBtn = btn(t('export.run'), () => run(prefs.scale), 'btn btn-primary');
  const shareBtn = btn(t('export.share'), () => pending && deliver(pending.name, pending.blob), 'btn btn-primary');
  const ready = h('div', { class: 'panel-warn export-ready', hidden: true }, h('p', {}, t('export.ready')), h('div', { class: 'panel-actions' }, shareBtn));

  // iPhone では共有シートで渡す（PNG は写真に、SVG はファイルに保存できる）
  const hint = (key) => (coarse ? h('p', { class: 'panel-note' }, t(key)) : null);
  const pngBox = h('div', {}, field(t('export.scale'), scale), sizeNote, warn, hint('export.shareHint'));
  const svgBox = h('div', {}, h('p', { class: 'panel-note' }, t('export.svgNote')), hint('export.shareHintFile'));
  const printBox = h('div', {},
    h('div', { class: 'field-row' }, field(t('print.paper'), paper), field(t('print.orientation'), orientation)),
    h('p', { class: 'panel-note' }, t('print.note')),
  );
  const imageBox = h('div', {},
    transparent,
    view === 'schematic' ? h('div', {}, includeTitle, includeLegend) : null,
    nothing,
    pngBox,
    svgBox,
    printBox,
  );
  const jsonBox = h('div', {}, h('p', { class: 'panel-note' }, t('export.jsonNote')));

  const sheet = openSheet({
    title: t('export.title'),
    body: [
      h('div', { class: 'panel-section' },
        h('p', { class: 'panel-note' }, t('export.targetNote', { view: t('views.' + view) })),
        field(t('export.format'), format),
        imageBox,
        jsonBox,
        ready,
        h('div', { class: 'panel-actions' }, runBtn),
      ),
    ],
  });

  function refresh() {
    const f = prefs.format;
    imageBox.hidden = f === 'json';
    jsonBox.hidden = f !== 'json';
    ready.hidden = !pending;
    runBtn.textContent = t(f === 'print' ? 'print.run' : 'export.run');
    if (f === 'json') {
      runBtn.disabled = false;
      return;
    }
    const s = store.getState().style;
    transparent.hidden = f === 'print';
    includeTitle.setValue(s.title.show);
    includeLegend.setValue(s.legend.show);
    nothing.hidden = !!target;
    pngBox.hidden = f !== 'png' || !target;
    svgBox.hidden = f !== 'svg' || !target;
    printBox.hidden = f !== 'print' || !target;
    runBtn.disabled = !target;
    if (!target || f !== 'png') return;
    const size = exportSize(target.bounds, prefs.scale);
    sizeNote.textContent = t('export.size', {
      w: formatNumber(size.width),
      h: formatNumber(size.height),
      pixels: formatNumber(size.pixels, { notation: 'compact', maximumFractionDigits: 0 }),
    });
    warn.hidden = size.fits;
    runBtn.disabled = !size.fits;
    if (!size.fits) reduceBtn.textContent = t('export.reduce', { n: formatNumber(fittingScale(target.bounds)) });
  }

  async function run(s) {
    if (prefs.format === 'json') {
      sheet.close();
      ctx.onJson();
      return;
    }
    if (!target) return;
    if (prefs.format === 'print') {
      sheet.close();
      printTarget(target, { paper: prefs.paper, orientation: prefs.orientation, title: store.getState().name });
      return;
    }
    runBtn.disabled = true;
    reduceBtn.disabled = true;
    runBtn.textContent = t('export.running');
    try {
      const p = store.getState();
      const svg = prefs.format === 'svg';
      const blob = svg
        ? renderSvgBlob(target, { transparent: prefs.transparent, title: p.name })
        : await renderPng(target, { scale: s, transparent: prefs.transparent });
      await deliver(exportFilename(p.name, new Date(), svg ? '.svg' : '.png'), blob);
    } catch (e) {
      console.error(e);
      toast(t('editor.exportFailed'), { kind: 'error' });
    } finally {
      reduceBtn.disabled = false;
      refresh();
    }
  }

  /** ファイルを渡す。準備に時間がかかって共有シートを開けなければ、もう一度押してもらう */
  async function deliver(name, blob) {
    const r = await saveBlobFile(name, blob);
    pending = r === 'needsTap' ? { name, blob } : null;
    refresh();
    if (r === 'needsTap' || r === 'cancelled') return;
    toast(t('editor.exported'));
    sheet.close();
  }

  refresh();
  return sheet;
}
