// 設定（§4.3。フェーズ1は「表示」「英字の規則」「バックアップ」だけ。UIの言語・地図の言語はフェーズ8）
import { h } from './dom.js';
import { t, formatDate } from '../i18n/i18n.js';
import { getRegion } from '../core/regions/index.js';
import { field, selectInput, checkInput, group } from './form.js';
import { openSheet } from './dialog.js';

/**
 * @param {{ store: any, onExport: () => void }} ctx
 */
export function openSettings(ctx) {
  const { store } = ctx;
  const p = store.getState();
  const setStyle = (fields) => store.dispatch({ type: 'project/style', fields });
  const setRomaji = (fields) => ctx.onRomaji ? ctx.onRomaji(fields) : store.dispatch({ type: 'project/romaji', fields });

  // 表示
  const toggles = [
    ['showSubNames', 'settings.showSubNames'],
    ['showNumbering', 'settings.showNumbering'],
    ['showAbolished', 'settings.showAbolished'],
    ['showGrid', 'settings.showGrid'],
  ].map(([key, label]) => {
    const c = checkInput({ label: t(label), onChange: (v) => setStyle({ [key]: v }) });
    c.setValue(p.style[key]);
    return c;
  });

  // 英字の規則（変えると、自動生成中の駅の英字をまとめて作り直す）
  const r = p.settings.romaji;
  const longVowel = selectInput({
    options: ['omit', 'macron', 'keep'].map((v) => ({ value: v, label: t('romaji.longVowel.' + v) })),
    value: r.longVowel,
    onChange: (v) => setRomaji({ longVowel: v }),
  });
  const nBeforeBmp = selectInput({
    options: ['m', 'n'].map((v) => ({ value: v, label: t('romaji.nBeforeBmp.' + v) })),
    value: r.nBeforeBmp,
    onChange: (v) => setRomaji({ nBeforeBmp: v }),
  });
  const capHyphen = checkInput({ label: t('romaji.capitalizeAfterHyphen'), checked: r.capitalizeAfterHyphen, onChange: (v) => setRomaji({ capitalizeAfterHyphen: v }) });
  const romaji = getRegion(p.locale.region).autoRomanize
    ? group(t('romaji.title'), [
      h('p', { class: 'panel-note' }, t('romaji.hint')),
      field(t('romaji.longVowel'), longVowel),
      field(t('romaji.nBeforeBmp'), nBeforeBmp),
      capHyphen,
    ])
    : null;

  // バックアップ
  const last = p.meta.lastBackupAt;
  const backup = group(t('settings.backup'), [
    h('p', { class: 'panel-note' }, last ? t('settings.lastBackup', { date: formatDate(last) }) : t('settings.noBackup')),
    h('p', { class: 'panel-note' }, t('help.iphoneStorage')),
    h('div', { class: 'panel-actions' }, h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => ctx.onExport() } }, t('backup.export'))),
  ]);

  openSheet({
    title: t('settings.title'),
    body: [group(t('settings.display'), toggles), romaji, backup],
  });
}
