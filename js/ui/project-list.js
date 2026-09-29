// プロジェクト一覧（起動画面）：新規作成・開く・複製・名前の変更・削除
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { t, formatDate, mapTranslator } from '../i18n/i18n.js';
import { openDialog, confirmDialog, promptDialog } from './dialog.js';
import { openMenu } from './menu.js';
import { toast } from './toast.js';
import { createProject } from '../core/defaults.js';
import { newId } from '../core/ids.js';
import { ID_PREFIX } from '../core/schema.js';
import { getRegion } from '../core/regions/index.js';
import { listProjectMeta, getProject, putProject, deleteProject } from '../storage/idb.js';
import { exportFilename, serializeProject, saveTextFile, parseProjectText, pickTextFile } from '../storage/file-io.js';
import { InvalidFileError, NewerVersionError } from '../core/migrate.js';
import { openRestorePoints } from './restore-view.js';

/**
 * @param {{ onOpen: (id: string) => void }} opt
 * @returns {{ el: HTMLElement, dispose: () => void }}
 */
export function createProjectList(opt) {
  const listEl = h('div', { class: 'plist-items' });
  // 上部の「新しいプロジェクト」。プロジェクトが無いあいだは、画面中央の案内のボタンだけにするので隠す
  const headerNewBtn = h('button', { class: 'btn btn-sign', type: 'button', hidden: true, on: { click: () => newProject() } },
    icon('plus'), h('span', {}, t('plist.new')));
  const importBtn = h('button', { class: 'btn btn-sign', type: 'button', on: { click: () => importFile() } },
    icon('import'), h('span', {}, t('plist.import')));
  const el = h('div', { class: 'plist' },
    h('header', { class: 'plist-header on-sign' },
      h('h1', { class: 'plist-title' }, t('app.title')),
      importBtn,
      headerNewBtn,
    ),
    h('main', { class: 'plist-body' },
      h('div', { class: 'plist-inner' }, listEl),
    ),
  );

  async function refresh() {
    let metas;
    try {
      metas = await listProjectMeta();
    } catch (e) {
      console.error(e);
      replaceChildren(listEl, h('p', { class: 'plist-empty' }, t('storage.unavailable')));
      return;
    }
    headerNewBtn.hidden = metas.length === 0;
    if (metas.length === 0) {
      replaceChildren(listEl,
        h('div', { class: 'plist-empty' },
          h('p', {}, t('plist.empty')),
          h('div', { class: 'panel-actions' },
            h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => newProject() } }, t('plist.new')),
          ),
        ),
      );
      return;
    }
    replaceChildren(listEl, h('ul', { class: 'plist-list' }, metas.map(item)));
  }

  /** @param {import('../storage/idb.js').ProjectMeta} m */
  function item(m) {
    const more = h('button', {
      class: 'icon-btn on-paper-btn',
      type: 'button',
      'aria-label': t('plist.actions', { name: m.name }),
      on: {
        click: (e) => {
          e.stopPropagation();
          openMenu(more, [
            { label: t('common.rename'), onSelect: () => rename(m) },
            { label: t('common.duplicate'), onSelect: () => duplicate(m) },
            { label: t('editor.export'), onSelect: () => exportProject(m) },
            { label: t('restore.title'), onSelect: () => openRestorePoints(m.id, refresh) },
            { separator: true },
            { label: t('common.delete'), danger: true, onSelect: () => remove(m) },
          ], { label: t('plist.actions', { name: m.name }) });
        },
      },
    }, icon('more'));
    return h('li', { class: 'plist-item' },
      h('button', { class: 'plist-open', type: 'button', on: { click: () => opt.onOpen(m.id) } },
        h('span', { class: 'plist-name' }, m.name || t('common.untitled')),
        h('span', { class: 'plist-sub' },
          [m.author, t('plist.counts', { stations: m.stationCount, lines: m.lineCount }), t('plist.updated', { date: formatDate(m.updatedAt) })]
            .filter(Boolean).map((s) => h('span', {}, s)),
        ),
      ),
      more,
    );
  }

  async function newProject() {
    const region = getRegion();
    const mt = mapTranslator(region.locale.mapLanguage);
    const name = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'text', value: mt('map.default.projectName'), autocomplete: 'off' }));
    const author = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'text', autocomplete: 'off' }));
    const err = h('p', { class: 'field-error', hidden: true });
    const body = [
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('newProject.name')), name, err),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('newProject.author')), author),
      h('fieldset', { class: 'field fieldset' },
        h('legend', { class: 'field-label' }, t('newProject.world')),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: 'world', value: 'none', checked: true }), t('newProject.world.none')),
      ),
    ];
    const v = await openDialog({
      title: t('newProject.title'),
      body,
      actions: [
        { label: t('common.cancel'), value: 'cancel' },
        { label: t('newProject.create'), value: 'ok', kind: 'primary' },
      ],
      onSubmit: () => {
        if (!name.value.trim()) {
          err.textContent = t('error.nameRequired');
          err.hidden = false;
          name.focus();
          return false;
        }
        return true;
      },
    });
    if (v !== 'ok') return;
    const p = createProject({ name: name.value.trim(), author: author.value.trim() || undefined, regionId: region.id });
    try {
      await putProject(p);
    } catch (e) {
      console.error(e);
      toast(t('save.failed'), { kind: 'error' });
      return;
    }
    opt.onOpen(p.id);
  }

  async function rename(m) {
    const name = await promptDialog({ title: t('plist.renameTitle'), label: t('newProject.name'), value: m.name, required: true });
    if (name === null || name === m.name) return;
    const p = await getProject(m.id);
    if (!p) return;
    await putProject({ ...p, name, updatedAt: new Date().toISOString() });
    toast(t('plist.renamed'));
    refresh();
  }

  async function duplicate(m) {
    const p = await getProject(m.id);
    if (!p) return;
    const now = new Date().toISOString();
    const mt = mapTranslator(p.locale.mapLanguage);
    const copy = {
      ...p,
      id: newId(ID_PREFIX.project),
      name: mt('map.copySuffix', { name: p.name }),
      createdAt: now,
      updatedAt: now,
      meta: {},
    };
    await putProject(copy);
    toast(t('plist.duplicated'));
    refresh();
  }

  async function exportProject(m) {
    const p = await getProject(m.id);
    if (!p) return;
    const result = await saveTextFile(exportFilename(p.name), serializeProject(p));
    if (result === 'cancelled') return;
    await putProject({ ...p, meta: { ...p.meta, lastBackupAt: new Date().toISOString() } });
    toast(t('editor.exported'));
    refresh();
  }

  /** ファイルから読み込む。いつも新しいプロジェクトとして追加し、既存のものは上書きしない */
  async function importFile() {
    const file = await pickTextFile();
    if (!file) return;
    let p;
    try {
      p = parseProjectText(file.text);
    } catch (e) {
      console.error(e);
      let msg = t('import.error.broken');
      if (e instanceof NewerVersionError) msg = t('import.error.newer');
      else if (e instanceof InvalidFileError) msg = t('import.error.' + e.code);
      toast(msg, { kind: 'error' });
      return;
    }
    if (await getProject(p.id)) p = { ...p, id: newId(ID_PREFIX.project) };
    await putProject(p);
    toast(t('plist.imported', { name: p.name }));
    refresh();
  }

  async function remove(m) {
    const ok = await confirmDialog({
      title: t('plist.deleteConfirm.title'),
      message: t('plist.deleteConfirm.message', { name: m.name }),
      okLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await deleteProject(m.id);
    toast(t('plist.deleted'));
    refresh();
  }

  refresh();
  return { el, dispose() {} };
}
