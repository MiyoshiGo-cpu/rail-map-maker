// 設定の「スタイル」の欄（§5.8）：プリセットと詳細設定（線の太さ・駅記号の大きさ・角の半径・書体・文字サイズ・一般駅の記号・色づかい・色）
import { h } from './dom.js';
import { t } from '../i18n/i18n.js';
import { FONT_FAMILIES, COLOR_MODES, STATION_SYMBOLS, STATION_STROKES } from '../core/schema.js';
import { stylePresets, matchesPreset } from '../core/map-style.js';
import { field, selectInput, numberInput, colorInput, group, enumOptions } from './form.js';

/**
 * @param {{ store: any, onChange?: () => void }} ctx 変えたあとに onChange を呼ぶ（ほかの欄を合わせ直す）
 * @returns {{ el: HTMLElement, refresh: () => void }}
 */
export function createStyleSettings(ctx) {
  const { store } = ctx;
  const style = () => store.getState().style;
  const region = () => store.getState().locale.region;
  const set = (fields) => {
    store.dispatch({ type: 'project/style', fields });
    refresh();
  };

  const preset = selectInput({
    options: stylePresets(region()).map((x) => ({ value: x.id, label: t(x.labelKey) })),
    onChange: (v) => {
      store.dispatch({ type: 'project/stylePreset', presetId: v });
      refresh();
      if (ctx.onChange) ctx.onChange();
    },
  });
  const presetNote = h('p', { class: 'panel-note' });
  /** 数の欄（範囲の外は丸める） */
  const num = (key, min, max, step) => {
    const el = numberInput({ step, min, max, onChange: (v) => { if (v !== null) set({ [key]: Math.min(max, Math.max(min, v)) }); } });
    return { key, el };
  };
  const nums = [
    num('lineWidth', 1, 16, 0.5),
    num('stationRadius', 2, 12, 0.5),
    num('cornerRadius', 0, 24, 1),
    num('fontSize', 8, 28, 1),
  ];
  const sel = (key, values, prefix) => ({ key, el: selectInput({ options: enumOptions(values, (v) => t(prefix + v)), onChange: (v) => set({ [key]: v }) }) });
  const sels = [
    sel('fontFamily', FONT_FAMILIES, 'fontFamily.'),
    sel('stationSymbol', STATION_SYMBOLS, 'stationSymbol.'),
    sel('colorMode', COLOR_MODES, 'colorMode.'),
    sel('stationStroke', STATION_STROKES, 'stationStroke.'),
  ];
  const colors = ['background', 'ink', 'paper'].map((key) => ({ key, el: colorInput({ label: t('style.' + key), onChange: (v) => set({ [key]: v }) }) }));
  const byKey = (list, key) => list.find((x) => x.key === key).el;

  const el = group(t('style.title'), [
    field(t('style.preset'), preset),
    presetNote,
    h('div', { class: 'field-row' },
      field(t('style.lineWidth'), byKey(nums, 'lineWidth')),
      field(t('style.stationRadius'), byKey(nums, 'stationRadius')),
    ),
    h('div', { class: 'field-row' },
      field(t('style.cornerRadius'), byKey(nums, 'cornerRadius')),
      field(t('style.fontSize'), byKey(nums, 'fontSize')),
    ),
    field(t('style.fontFamily'), byKey(sels, 'fontFamily')),
    h('div', { class: 'field-row' },
      field(t('style.stationSymbol'), byKey(sels, 'stationSymbol')),
      field(t('style.colorMode'), byKey(sels, 'colorMode')),
    ),
    field(t('style.background'), byKey(colors, 'background')),
    group(t('panel.details'), [
      field(t('style.ink'), byKey(colors, 'ink')),
      field(t('style.paper'), byKey(colors, 'paper')),
      field(t('style.stationStroke'), byKey(sels, 'stationStroke')),
    ], { collapsible: true }),
  ]);

  function refresh() {
    const s = style();
    preset.setValue(s.preset);
    presetNote.textContent = matchesPreset(s, region()) ? '' : t('style.presetChanged');
    presetNote.hidden = matchesPreset(s, region());
    for (const x of nums) x.el.setValue(s[x.key]);
    for (const x of sels) x.el.setValue(s[x.key]);
    for (const x of colors) x.el.setValue(s[x.key]);
  }
  refresh();
  return { el, refresh };
}
