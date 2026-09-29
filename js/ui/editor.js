// エディタ全体の組み立て：ストア・自動保存・ヘッダー・ツール・キャンバス・パネル
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { t } from '../i18n/i18n.js';
import { toast } from './toast.js';
import { openMenu } from './menu.js';
import { confirmDialog } from './dialog.js';
import { createProjectStore } from '../core/actions/index.js';
import { migrate } from '../core/migrate.js';
import { normalizeProject } from '../core/defaults.js';
import { readableTextColor } from '../core/color.js';
import { getProject, putProject } from '../storage/idb.js';
import { createAutosave } from '../storage/autosave.js';
import { createCanvasView } from './canvas-view.js';
import { stationBounds, visibleWorldRect, GRID } from '../core/viewport.js';
import { buildSchematicScene } from '../render/scene-schematic.js';
import { drawItems, createMeasure } from '../render/backend-canvas.js';
import { createEditorState, NO_SELECTION } from './editor-state.js';
import { drawOverlay, drawUnderlay } from './overlay.js';
import { createPanelHost } from './panel-host.js';
import { createSelectTool } from './tools/select-tool.js';
import { createPlaceStationTool } from './tools/place-station-tool.js';
import { createDrawLineTool } from './tools/draw-line-tool.js';

const DEFAULT_ACCENT = '#0079C2';
/** 当たり判定の半径（画面の px。§4.4） */
const HIT_RADIUS = { touch: 22, mouse: 8, pen: 12 };

/**
 * ツールに渡す道具
 * @typedef {object} ToolContext
 * @property {any} store
 * @property {ReturnType<typeof createEditorState>} es
 * @property {(p: any, w: { x: number, y: number }, filter?: (t: any) => boolean) => any} hitTest
 * @property {(g: { x: number, y: number }) => string | null} stationAt
 * @property {(sel: import('./editor-state.js').Selection) => void} select
 * @property {(target: any) => void} selectTarget
 * @property {() => void} focusStationName
 * @property {(g: { x: number, y: number } | null) => void} setHover
 * @property {(p: { x: number, y: number }, items: import('./menu.js').MenuItem[]) => void} openMenuAt
 * @property {(opt: { title: string, message?: string, okLabel?: string, danger?: boolean }) => Promise<boolean>} confirm
 * @property {(msg: string) => void} toast
 * @property {() => import('../render/scene-schematic.js').SchematicScene} getScene
 */

/**
 * @param {{ projectId: string, onExit: () => void }} opt
 * @returns {{ el: HTMLElement, ready: Promise<void>, dispose: () => Promise<void> }}
 */
export function createEditor(opt) {
  const el = h('div', { class: 'editor' }, h('p', { class: 'panel-empty' }, t('app.loading')));
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
    store = createProjectStore(normalizeProject(migrate(raw)));
    build();
  })();

  function build() {
    const es = createEditorState({
      tool: 'select',
      selection: NO_SELECTION,
      drawing: null,
      lineChoice: 'new',
      newLine: { operatorId: '', name: '', color: '', symbol: '', kind: '' },
      hover: null,
      rangeMode: false,
    });

    // ---------- 保存 ----------
    const saveStatus = h('span', { class: 'save-status', dataset: { state: 'saved' } }, t('save.saved'));
    autosave = createAutosave(store, {
      save: (p) => putProject(p),
      onStatus: (s, detail) => {
        saveStatus.dataset.state = s;
        saveStatus.textContent = t('save.' + s);
        const msg = detail ? (detail.reason === 'invalid' ? t('save.invalidDetail', { detail: detail.message }) : t('save.failed')) : '';
        saveStatus.title = msg;
        if (s === 'error' && msg) toast(msg, { kind: 'error' });
      },
    });

    // ---------- ヘッダー ----------
    const undoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('editor.undo'), title: t('editor.undo'), on: { click: () => store.undo() } }, icon('undo'));
    const redoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('editor.redo'), title: t('editor.redo'), on: { click: () => store.redo() } }, icon('redo'));
    const nameEl = h('span', { class: 'name' });
    const projectBtn = h('button', {
      class: 'ed-project-btn',
      type: 'button',
      'aria-label': t('editor.projectMenu'),
      on: {
        click: () => openMenu(projectBtn, [
          { label: t('editor.backToList'), onSelect: () => opt.onExit() },
        ], { label: t('editor.projectMenu') }),
      },
    }, nameEl, icon('chevronDown'));
    const header = h('header', { class: 'ed-header on-sign' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('editor.backToList'), title: t('editor.backToList'), on: { click: () => opt.onExit() } }, icon('back')),
      projectBtn,
      h('nav', { class: 'view-tabs is-single', role: 'tablist', 'aria-label': t('views.label') },
        h('button', { class: 'badge-btn', type: 'button', role: 'tab', 'aria-selected': 'true' }, h('span', { class: 'badge-label' }, t('views.schematic'))),
      ),
      h('div', { class: 'ed-header-actions' }, undoBtn, redoBtn, saveStatus),
    );

    // ---------- ツールのボタン ----------
    const toolDefs = [
      { id: 'select', icon: 'select', label: t('tool.select'), title: t('tool.select.title') },
      { id: 'station', icon: 'station', label: t('tool.station'), title: t('tool.station.title') },
      { id: 'line', icon: 'line', label: t('tool.line'), title: t('tool.line.title') },
    ];
    const toolButtons = new Map();
    const toolsNav = h('nav', { class: 'ed-tools', 'aria-label': t('tool.label') },
      toolDefs.map((d) => {
        const b = h('button', {
          class: 'badge-btn',
          type: 'button',
          title: d.title,
          'aria-pressed': 'false',
          on: { click: () => setTool(d.id) },
        }, icon(d.icon), h('span', { class: 'badge-label' }, d.label));
        toolButtons.set(d.id, b);
        return b;
      }),
    );

    // ---------- キャンバスと表示リスト ----------
    const measure = createMeasure();
    let cache = { key: null, scene: null };
    function getScene() {
      const p = store.getState();
      const key = [p.stations, p.lines, p.interchanges, p.operators, p.style, p.locale, p.settings];
      if (!cache.scene || cache.key.some((v, i) => v !== key[i])) {
        cache = { key, scene: buildSchematicScene(p, { measure }) };
      }
      return cache.scene;
    }

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
      // スマホではボトムシートに隠れる部分を除いて全体を表示する
      getInsets: () => {
        const stage = canvasView.el.getBoundingClientRect();
        const sheet = panels.el.getBoundingClientRect();
        const covered = getComputedStyle(panels.el).position === 'absolute' ? Math.max(0, stage.bottom - sheet.top) : 0;
        return { top: 0, right: 0, bottom: covered, left: 0 };
      },
    });
    cleanups.push(() => canvasView.dispose());
    let accent = DEFAULT_ACCENT;
    canvasView.addLayer((ctx, view, size) => {
      const scene = getScene();
      const o = { project: store.getState(), scene, es: es.get(), zoom: view.zoom, accent };
      drawUnderlay(ctx, o);
      drawItems(ctx, scene.items, visibleWorldRect(view, size));
      drawOverlay(ctx, o);
    });

    // ---------- ツール ----------
    /** @type {ToolContext} */
    const toolCtx = {
      store,
      es,
      getScene,
      hitTest(p, w, filter) {
        const r = (HIT_RADIUS[p.pointerType] ?? 8) / canvasView.getView().zoom;
        return getScene().index.hitTest(w.x, w.y, r, filter);
      },
      stationAt(g) {
        const st = store.getState().stations.find((s) => s.schematic && s.schematic.x === g.x && s.schematic.y === g.y);
        return st ? st.id : null;
      },
      select(sel) {
        es.set({ selection: sel });
      },
      selectTarget(target) {
        if (!target) es.set({ selection: NO_SELECTION });
        else if (target.type === 'station' || target.type === 'label') es.set({ selection: { type: 'stations', ids: [target.id] } });
        else if (target.type === 'section') es.set({ selection: { type: 'section', lineId: target.lineId, index: target.index } });
      },
      focusStationName() {
        panels.focusStationName();
      },
      setHover(g) {
        const cur = es.get().hover;
        if (cur === g || (cur && g && cur.x === g.x && cur.y === g.y)) return;
        es.set({ hover: g });
      },
      openMenuAt(p, items) {
        const r = canvasView.canvas.getBoundingClientRect();
        openMenu({ x: r.left + p.x, y: r.top + p.y }, items);
      },
      confirm: (o) => confirmDialog(o),
      toast: (m) => toast(m),
    };
    const tools = {
      select: createSelectTool(toolCtx),
      station: createPlaceStationTool(toolCtx),
      line: createDrawLineTool(toolCtx),
    };
    const currentTool = () => tools[es.get().tool] || tools.select;
    canvasView.setInput({
      onTap: (p, w) => currentTool().onTap?.(p, w),
      onDoubleTap: (p, w) => currentTool().onDoubleTap?.(p, w) || false,
      onLongPress: (p, w) => currentTool().onLongPress?.(p, w),
      onDragStart: (p, w) => currentTool().onDragStart?.(p, w) || null,
      onHover: (p, w) => currentTool().onHover?.(p, w),
    });
    canvasView.canvas.addEventListener('pointerleave', () => toolCtx.setHover(null));

    /** @param {'select'|'station'|'line'} id */
    function setTool(id) {
      if (es.get().tool === id) return;
      es.set({ tool: id, drawing: null, hover: null });
    }

    // ---------- パネル ----------
    const panels = createPanelHost({
      store,
      es,
      finishDrawing: () => tools.line.finish(),
      onDelete: (ids) => {
        store.dispatch({ type: 'station/delete', ids });
        es.set({ selection: NO_SELECTION });
      },
      onDeleteLine: (lineId) => {
        store.dispatch({ type: 'line/delete', lineId });
        es.set({ selection: NO_SELECTION, drawing: null });
      },
    });

    replaceChildren(el,
      header,
      h('div', { class: 'ed-banner' }),
      toolsNav,
      h('main', { class: 'ed-stage' }, canvasView.el),
      panels.el,
    );

    // ---------- キーボード（全ショートカットはステップ9） ----------
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      const tag = /** @type {HTMLElement} */ (e.target).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.querySelector('dialog[open]')) return;
      if (currentTool().onKey?.(e)) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape' && es.get().selection.type !== 'none') {
        es.set({ selection: NO_SELECTION });
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
    cleanups.push(() => document.removeEventListener('keydown', onKey));

    // ---------- 画面の更新 ----------
    function accentColor() {
      const p = store.getState();
      const s = es.get();
      const lineColor = (id) => p.lines.find((l) => l.id === id)?.color;
      if (s.drawing) return lineColor(s.drawing.lineId) || DEFAULT_ACCENT;
      if (s.selection.type === 'line' || s.selection.type === 'section') return lineColor(s.selection.lineId) || DEFAULT_ACCENT;
      if (s.selection.type === 'stations' && s.selection.ids.length) {
        const id = s.selection.ids[0];
        const line = [...p.lines].sort((a, b) => a.order - b.order).find((l) => l.stops.some((x) => x.stationId === id));
        if (line) return line.color;
      }
      return DEFAULT_ACCENT;
    }

    /** 消えたものを指している状態を直す。直したら true */
    function repairState(p, s) {
      const sel = s.selection;
      const hasLine = (id) => p.lines.some((l) => l.id === id);
      if ((sel.type === 'line' || sel.type === 'section') && !hasLine(sel.lineId)) {
        es.set({ selection: NO_SELECTION });
        return true;
      }
      if (sel.type === 'section') {
        const line = p.lines.find((l) => l.id === sel.lineId);
        if (sel.index >= line.sections.length) {
          es.set({ selection: { type: 'line', lineId: line.id } });
          return true;
        }
      }
      if (sel.type === 'stations') {
        const ids = sel.ids.filter((id) => p.stations.some((st) => st.id === id));
        if (ids.length !== sel.ids.length) {
          es.set({ selection: ids.length ? { type: 'stations', ids } : NO_SELECTION });
          return true;
        }
      }
      if (s.drawing && !hasLine(s.drawing.lineId)) {
        es.set({ drawing: null });
        return true;
      }
      if (s.lineChoice !== 'new' && !hasLine(s.lineChoice)) {
        es.set({ lineChoice: 'new' });
        return true;
      }
      return false;
    }

    function render() {
      const p = store.getState();
      const s = es.get();
      if (repairState(p, s)) return;
      nameEl.textContent = p.name || t('common.untitled');
      document.title = `${p.name} - ${t('app.title')}`;
      undoBtn.disabled = !store.canUndo();
      redoBtn.disabled = !store.canRedo();
      for (const [id, b] of toolButtons) b.setAttribute('aria-pressed', String(s.tool === id));
      accent = accentColor();
      el.style.setProperty('--accent', accent);
      el.style.setProperty('--accent-text', readableTextColor(accent));
      canvasView.setCursor(currentTool().cursor || 'default');
      canvasView.setHint(p.stations.length ? null : t(s.tool === 'station' ? 'hint.placeStation' : 'hint.empty'));
      panels.update(p);
      canvasView.requestRender();
    }
    cleanups.push(store.subscribe(render));
    cleanups.push(es.subscribe(render));
    render();

    // 開発用：?debug=1 のときだけ、コンソールから状態を見られるようにする
    if (new URLSearchParams(location.search).has('debug')) {
      /** @type {any} */ (window).rmmDebug = { store, es, canvasView, getScene };
      cleanups.push(() => { delete (/** @type {any} */ (window)).rmmDebug; });
    }

    // 画面を離れる・隠れるときはすぐ保存する（iPhone ではこのあと止められることがある）
    const onHide = () => { if (document.visibilityState === 'hidden') autosave.flush(); };
    const onPageHide = () => autosave.flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    cleanups.push(() => document.removeEventListener('visibilitychange', onHide));
    cleanups.push(() => window.removeEventListener('pagehide', onPageHide));
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
