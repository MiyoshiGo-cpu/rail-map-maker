// エディタ全体の組み立て（ストア・自動保存・ヘッダー・キャンバス・パネル）。
// ツールはステップ7以降で足す。
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { t } from '../i18n/i18n.js';
import { toast } from './toast.js';
import { openMenu } from './menu.js';
import { createProjectStore } from '../core/actions/index.js';
import { migrate } from '../core/migrate.js';
import { normalizeProject } from '../core/defaults.js';
import { getProject, putProject } from '../storage/idb.js';
import { createAutosave } from '../storage/autosave.js';
import { createCanvasView } from './canvas-view.js';
import { stationBounds, GRID } from '../core/viewport.js';

/**
 * @param {{ projectId: string, onExit: () => void }} opt
 * @returns {{ el: HTMLElement, ready: Promise<void>, dispose: () => Promise<void> }}
 */
export function createEditor(opt) {
  const el = h('div', { class: 'editor no-tools' }, h('p', { class: 'panel-empty' }, t('app.loading')));
  /** @type {ReturnType<typeof createProjectStore> | null} */
  let store = null;
  /** @type {ReturnType<typeof createAutosave> | null} */
  let autosave = null;
  const cleanups = [];

  const ready = (async () => {
    let raw;
    try {
      raw = await getProject(opt.projectId);
    } catch (e) {
      console.error(e);
      toast(t('storage.unavailable'), { kind: 'error' });
      opt.onExit();
      return;
    }
    if (!raw) {
      toast(t('editor.notFound'), { kind: 'error' });
      opt.onExit();
      return;
    }
    const project = normalizeProject(migrate(raw));
    store = createProjectStore(project);
    build();
  })();

  function build() {
    const saveStatus = h('span', { class: 'save-status', dataset: { state: 'saved' } }, t('save.saved'));
    autosave = createAutosave(store, {
      save: (p) => putProject(p),
      onStatus: (s, detail) => {
        saveStatus.dataset.state = s;
        saveStatus.textContent = t('save.' + s);
        saveStatus.title = detail ? (detail.reason === 'invalid' ? t('save.invalidDetail', { detail: detail.message }) : t('save.failed')) : '';
        if (s === 'error' && detail) {
          toast(detail.reason === 'invalid' ? t('save.invalidDetail', { detail: detail.message }) : t('save.failed'), { kind: 'error' });
        }
      },
    });

    const undoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('editor.undo'), title: t('editor.undo'), on: { click: () => store.undo() } }, icon('undo'));
    const redoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('editor.redo'), title: t('editor.redo'), on: { click: () => store.redo() } }, icon('redo'));
    const nameEl = h('span', { class: 'name' });
    const projectBtn = h('button', {
      class: 'ed-project-btn',
      type: 'button',
      'aria-label': t('editor.projectMenu'),
      on: {
        click: () => openMenu(projectBtn, [
          { label: t('editor.backToList'), onSelect: () => exit() },
        ], { label: t('editor.projectMenu') }),
      },
    }, nameEl, icon('chevronDown'));

    const header = h('header', { class: 'ed-header on-sign' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('editor.backToList'), title: t('editor.backToList'), on: { click: () => exit() } }, icon('back')),
      projectBtn,
      h('nav', { class: 'view-tabs is-single', role: 'tablist', 'aria-label': t('views.label') },
        h('button', { class: 'badge-btn', type: 'button', role: 'tab', 'aria-selected': 'true' }, h('span', { class: 'badge-label' }, t('views.schematic'))),
      ),
      h('div', { class: 'ed-header-actions' }, undoBtn, redoBtn, saveStatus),
    );

    const panelBody = h('div', { class: 'ed-panel-body' });
    const panel = h('aside', { class: 'ed-panel', dataset: { stage: 'peek' }, 'aria-label': t('panel.label') },
      h('button', { class: 'sheet-handle', type: 'button', 'aria-label': t('panel.resize'), on: { click: () => cycleSheet() } }),
      h('div', { class: 'panel-accent' }),
      panelBody,
    );

    function cycleSheet() {
      const order = ['peek', 'half', 'full'];
      const cur = panel.dataset.stage || 'peek';
      panel.dataset.stage = order[(order.indexOf(cur) + 1) % order.length];
    }

    // キャンバス
    const canvasView = createCanvasView({
      getStyle: () => store.getState().style,
      initialView: store.getState().view.schematic,
      onViewChange: (v) => {
        const cur = store.getCommittedState().view.schematic;
        if (cur.cx === v.cx && cur.cy === v.cy && cur.zoom === v.zoom) return;
        store.dispatch({ type: 'project/view', view: 'schematic', state: v, silent: true });
      },
      getBounds: () => {
        const b = stationBounds(store.getState().stations);
        // 駅名の分だけ余白をとる
        return b && { minX: b.minX - GRID * 2, minY: b.minY - GRID * 2, maxX: b.maxX + GRID * 2, maxY: b.maxY + GRID * 2 };
      },
    });
    cleanups.push(() => canvasView.dispose());

    // 開発用：?debug=1 のときだけ、コンソールから状態を見られるようにする
    if (new URLSearchParams(location.search).has('debug')) {
      /** @type {any} */ (window).rmmDebug = { store, canvasView };
      cleanups.push(() => { delete (/** @type {any} */ (window)).rmmDebug; });
    }

    replaceChildren(el,
      header,
      h('div', { class: 'ed-banner' }),
      h('main', { class: 'ed-stage' }, canvasView.el),
      panel,
    );

    // プロジェクトのパネル（名前と作者）
    const nameInput = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'text', autocomplete: 'off' }));
    const authorInput = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'text', autocomplete: 'off' }));
    nameInput.addEventListener('change', () => {
      const v = nameInput.value.trim();
      if (!v) { nameInput.value = store.getState().name; toast(t('error.nameRequired'), { kind: 'error' }); return; }
      store.dispatch({ type: 'project/update', fields: { name: v } });
    });
    authorInput.addEventListener('change', () => {
      store.dispatch({ type: 'project/update', fields: { author: authorInput.value.trim() } });
    });
    replaceChildren(panelBody,
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, t('panel.project.title'))),
      h('div', { class: 'panel-section' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('newProject.name')), nameInput),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('newProject.author')), authorInput),
      ),
    );

    function render() {
      const p = store.getState();
      nameEl.textContent = p.name || t('common.untitled');
      document.title = `${p.name} - ${t('app.title')}`;
      if (document.activeElement !== nameInput) nameInput.value = p.name;
      if (document.activeElement !== authorInput) authorInput.value = p.author || '';
      undoBtn.disabled = !store.canUndo();
      redoBtn.disabled = !store.canRedo();
      canvasView.requestRender();
    }
    cleanups.push(store.subscribe(render));
    render();

    // 画面を離れる・隠れるときはすぐ保存する（iPhone ではこのあと止められることがある）
    const onHide = () => { if (document.visibilityState === 'hidden') autosave.flush(); };
    const onPageHide = () => autosave.flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    cleanups.push(() => document.removeEventListener('visibilitychange', onHide));
    cleanups.push(() => window.removeEventListener('pagehide', onPageHide));
  }

  function exit() {
    opt.onExit();
  }

  return {
    el,
    ready,
    async dispose() {
      await ready;
      for (const fn of cleanups) fn();
      if (autosave) {
        await autosave.flush();
        autosave.dispose();
      }
      document.title = t('app.title');
    },
  };
}
