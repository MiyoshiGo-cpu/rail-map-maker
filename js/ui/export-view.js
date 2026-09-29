// 「書き出す」のシート（§5.9）：今表示しているビューを、選んだ形式で書き出す。
// PNG は倍率（1〜4倍）と背景の透過を選ぶ。約1,600万画素を超えるときは案内を出し、倍率を下げて書き出せるようにする。
// iPhone では共有シートを開く（写真に保存するときは「画像を保存」）。JSON（バックアップ）もここから書き出せる。
import { h } from './dom.js';
import { t, formatNumber } from '../i18n/i18n.js';
import { openSheet } from './dialog.js';
import { field, selectInput, checkInput } from './form.js';
import { toast } from './toast.js';
import { exportTarget, renderPng } from './exporter.js';
import { exportSize, fittingScale, EXPORT_SCALES, DEFAULT_EXPORT_SCALE } from '../core/export-size.js';
import { exportFilename, saveBlobFile } from '../storage/file-io.js';

/** 選んだ形式・倍率・透過は、開いているあいだ覚えておく */
const prefs = { format: 'png', scale: DEFAULT_EXPORT_SCALE, transparent: false };

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
    options: ['png', 'json'].map((v) => ({ value: v, label: t('export.format.' + v) })),
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
  const reduceBtn = btn('', () => run(fittingScale(target.bounds)));
  const warn = h('div', { class: 'panel-warn', role: 'alert' }, h('p', {}, t('export.tooLarge')), h('div', { class: 'panel-actions' }, reduceBtn));
  const runBtn = btn(t('export.run'), () => run(prefs.scale), 'btn btn-primary');
  const shareBtn = btn(t('export.share'), () => pending && deliver(pending.name, pending.blob), 'btn btn-primary');
  const ready = h('div', { class: 'panel-warn export-ready', hidden: true }, h('p', {}, t('export.ready')), h('div', { class: 'panel-actions' }, shareBtn));

  const pngBox = h('div', {},
    field(t('export.scale'), scale),
    transparent,
    view === 'schematic' ? h('div', {}, includeTitle, includeLegend) : null,
    sizeNote,
    warn,
    coarse ? h('p', { class: 'panel-note' }, t('export.shareHint')) : null,
  );
  const jsonBox = h('div', {}, h('p', { class: 'panel-note' }, t('export.jsonNote')));

  const sheet = openSheet({
    title: t('export.title'),
    body: [
      h('div', { class: 'panel-section' },
        h('p', { class: 'panel-note' }, t('export.targetNote', { view: t('views.' + view) })),
        field(t('export.format'), format),
        pngBox,
        jsonBox,
        ready,
        h('div', { class: 'panel-actions' }, runBtn),
      ),
    ],
  });

  function refresh() {
    const png = prefs.format === 'png';
    pngBox.hidden = !png;
    jsonBox.hidden = png;
    ready.hidden = !pending;
    if (!png) {
      runBtn.disabled = false;
      return;
    }
    const s = store.getState().style;
    includeTitle.setValue(s.title.show);
    includeLegend.setValue(s.legend.show);
    if (!target) {
      sizeNote.textContent = t('export.nothing');
      warn.hidden = true;
      runBtn.disabled = true;
      return;
    }
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
    runBtn.disabled = true;
    reduceBtn.disabled = true;
    runBtn.textContent = t('export.running');
    try {
      const blob = await renderPng(target, { scale: s, transparent: prefs.transparent });
      await deliver(exportFilename(store.getState().name, new Date(), '.png'), blob);
    } catch (e) {
      console.error(e);
      toast(t('editor.exportFailed'), { kind: 'error' });
    } finally {
      runBtn.textContent = t('export.run');
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
