// エディタの上部（戻る・プロジェクト名とメニュー・ビュー切替・取り消し/やり直し・保存状態・書き出す・その他）と、
// バックアップの案内の帯（§2.4：最後のバックアップから7日以上たったら出す）
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, formatDate } from '../i18n/i18n.js';
import { openMenu } from './menu.js';

/**
 * @param {{
 *   onExit: () => void,
 *   onUndo: () => void,
 *   onRedo: () => void,
 *   onExport: () => void,
 *   menuItems: () => import('./menu.js').MenuItem[],
 *   views: { id: string, label: string }[],
 *   onView: (id: string) => void,
 * }} opt
 */
export function createEditorHeader(opt) {
  const undoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('editor.undo'), title: t('editor.undo'), on: { click: opt.onUndo } }, icon('undo'));
  const redoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('editor.redo'), title: t('editor.redo'), on: { click: opt.onRedo } }, icon('redo'));
  const saveStatus = h('span', { class: 'save-status', dataset: { state: 'saved' } }, t('save.saved'));
  const nameEl = h('span', { class: 'name' });
  const projectBtn = h('button', {
    class: 'ed-project-btn',
    type: 'button',
    'aria-label': t('editor.projectMenu'),
    on: { click: () => openMenu(projectBtn, opt.menuItems(), { label: t('editor.projectMenu') }) },
  }, nameEl, icon('chevronDown'));
  const moreBtn = h('button', {
    class: 'icon-btn',
    type: 'button',
    'aria-label': t('common.more'),
    title: t('common.more'),
    on: { click: () => openMenu(moreBtn, opt.menuItems(), { label: t('common.more') }) },
  }, icon('more'));
  const exportBtn = h('button', { class: 'btn btn-sign btn-small pc-only', type: 'button', on: { click: opt.onExport } }, icon('export'), t('editor.export'));

  // ビュー切替（できたビューだけ出す）
  const viewButtons = opt.views.map((v) => h('button', {
    class: 'badge-btn',
    type: 'button',
    role: 'tab',
    dataset: { view: v.id },
    'aria-selected': 'false',
    on: { click: () => opt.onView(v.id) },
  }, h('span', { class: 'badge-label' }, v.label)));

  const el = h('header', { class: 'ed-header on-sign' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('editor.backToList'), title: t('editor.backToList'), on: { click: opt.onExit } }, icon('back')),
    projectBtn,
    h('nav', { class: ['view-tabs', opt.views.length < 2 ? 'is-single' : ''], role: 'tablist', 'aria-label': t('views.label') }, viewButtons),
    h('div', { class: 'ed-header-actions' }, undoBtn, redoBtn, saveStatus, exportBtn, moreBtn),
  );

  return {
    el,
    /**
     * @param {'saved'|'dirty'|'saving'|'error'} s
     * @param {string} [message]
     */
    setSaveStatus(s, message = '') {
      saveStatus.dataset.state = s;
      saveStatus.textContent = t('save.' + s);
      saveStatus.title = message;
    },
    /** @param {string} name @param {boolean} canUndo @param {boolean} canRedo @param {string} view */
    update(name, canUndo, canRedo, view) {
      for (const b of viewButtons) b.setAttribute('aria-selected', String(b.dataset.view === view));
      nameEl.textContent = name || t('common.untitled');
      undoBtn.disabled = !canUndo;
      redoBtn.disabled = !canRedo;
    },
  };
}

/**
 * バックアップの案内の帯
 * @param {{ onExport: () => void, onSnooze: () => void }} opt
 */
export function createBackupBanner(opt) {
  const text = h('span', { class: 'banner-text' });
  const el = h('div', { class: 'banner', role: 'status', hidden: true },
    text,
    h('button', { class: 'btn btn-small', type: 'button', on: { click: opt.onExport } }, t('backup.export')),
    h('button', { class: 'btn btn-small btn-ghost', type: 'button', on: { click: opt.onSnooze } }, t('backup.later')),
  );
  return {
    el,
    /** @param {boolean} show @param {string | undefined} lastBackupAt */
    update(show, lastBackupAt) {
      el.hidden = !show;
      if (show) text.textContent = lastBackupAt ? t('backup.remind', { date: formatDate(lastBackupAt, undefined, { dateStyle: 'medium' }) }) : t('backup.remindNever');
    },
  };
}
