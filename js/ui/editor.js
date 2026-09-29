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
import { stationBounds, visibleWorldRect, screenToWorld, GRID } from '../core/viewport.js';
import { alignHorizontal, alignVertical, alignDiagonal, distributeEvenly, hasCollision } from '../core/align.js';
import { buildSchematicScene } from '../render/scene-schematic.js';
import { labelLevel } from '../render/labels.js';
import { LABEL_POSITIONS } from '../core/schema.js';
import { drawItems, createMeasure } from '../render/backend-canvas.js';
import { createEditorState, NO_SELECTION } from './editor-state.js';
import { drawOverlay, drawUnderlay } from './overlay.js';
import { createPanelHost } from './panel-host.js';
import { createSelectTool, moveStationsSafely } from './tools/select-tool.js';
import { createDeleteTool } from './tools/delete-tool.js';
import { createDataView } from './data-view.js';
import { attachShortcuts } from './keyboard.js';
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
 * @property {(p: { x: number, y: number }) => { x: number, y: number }} toWorld 画面の点を世界座標に
 * @property {(ids: string[], dx: number, dy: number) => boolean} moveStations
 * @property {(ids: string[]) => void} deleteStations
 * @property {(lineId: string) => void} deleteLine
 * @property {(stationId: string) => import('./menu.js').MenuItem[]} stationMenuItems
 * @property {(p: { pointerType: string }) => number} hitRadius 当たり判定の半径（世界座標）
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
      marquee: null,
      pending: null,
      dataOpen: false,
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
      // 削除ツールは PC だけ（スマホは長押しメニューとパネルのボタンで削除する）
      { id: 'delete', icon: 'delete', label: t('tool.delete'), title: t('tool.delete.title'), pcOnly: true },
    ];
    const toolButtons = new Map();
    // データ表を開く・閉じる（ツールではないので押した状態は別に持つ）
    const dataBtn = h('button', {
      class: 'badge-btn data-toggle',
      type: 'button',
      title: t('tool.data.title'),
      'aria-pressed': 'false',
      on: { click: () => es.set({ dataOpen: !es.get().dataOpen }) },
    }, icon('data'), h('span', { class: 'badge-label' }, t('tool.data')));
    const toolsNav = h('nav', { class: 'ed-tools', 'aria-label': t('tool.label') },
      toolDefs.map((d) => {
        const b = h('button', {
          class: ['badge-btn', d.pcOnly ? 'pc-only' : ''],
          type: 'button',
          title: d.title,
          'aria-pressed': 'false',
          on: { click: () => setTool(d.id) },
        }, icon(d.icon), h('span', { class: 'badge-label' }, d.label));
        toolButtons.set(d.id, b);
        return b;
      }),
      dataBtn,
    );

    // ---------- キャンバスと表示リスト ----------
    const measure = createMeasure();
    let cache = { key: null, scene: null };
    function getScene() {
      const p = store.getState();
      // ズームで駅名を隠す段階が変わったときだけ、ラベルを置き直す
      const level = labelLevel(canvasView ? canvasView.getView().zoom : 1);
      const key = [p.stations, p.lines, p.interchanges, p.operators, p.style, p.locale, p.settings, level];
      if (!cache.scene || cache.key.some((v, i) => v !== key[i])) {
        cache = { key, scene: buildSchematicScene(p, { measure, level }) };
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
      hitRadius: (p) => (HIT_RADIUS[p.pointerType] ?? 8) / canvasView.getView().zoom,
      hitTest(p, w, filter) {
        return getScene().index.hitTest(w.x, w.y, toolCtx.hitRadius(p), filter);
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
        else if (target.type === 'interchange') es.set({ selection: { type: 'interchange', id: target.id } });
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
        lastMenuPoint = { x: r.left + p.x, y: r.top + p.y };
        openMenu(lastMenuPoint, items);
      },
      confirm: (o) => confirmDialog(o),
      toast: (m) => toast(m),
      toWorld: (p) => screenToWorld(canvasView.getView(), canvasView.getSize(), p.x, p.y),
      moveStations: (ids, dx, dy) => moveStationsSafely(store, ids, dx, dy, toast),
      deleteStations(ids) {
        if (!ids.length) return;
        store.dispatch({ type: 'station/delete', ids });
        es.set({ selection: NO_SELECTION });
        toast(ids.length === 1 ? t('station.deleted') : t('station.deletedMany', { count: ids.length }));
      },
      deleteLine(lineId) {
        const line = store.getState().lines.find((l) => l.id === lineId);
        if (!line) return;
        store.dispatch({ type: 'line/delete', lineId });
        es.set({ selection: NO_SELECTION, drawing: null });
        toast(t('line.deleted', { name: line.displayName || line.name }));
      },
      stationMenuItems(stationId) {
        return [
          { label: t('station.branch'), onSelect: () => { setTool('line'); tools.line.branchFrom(stationId); } },
          { label: t('label.position'), onSelect: () => labelPosMenu(stationId) },
          { label: t('interchange.addFromStation'), onSelect: () => es.set({ pending: { kind: 'interchange', stationId } }) },
          { separator: true },
          { label: t('station.delete'), danger: true, onSelect: () => toolCtx.deleteStations([stationId]) },
        ];
      },
    };
    const tools = {
      select: createSelectTool(toolCtx),
      station: createPlaceStationTool(toolCtx),
      line: createDrawLineTool(toolCtx),
      delete: createDeleteTool(toolCtx),
    };
    const currentTool = () => tools[es.get().tool] || tools.select;
    /** 乗換グループにする駅を選んでもらっているとき、タップした駅をグループに入れる */
    function pickPending(p, w) {
      const pend = es.get().pending;
      const hit = toolCtx.hitTest(p, w, (tg) => tg.type === 'station' || tg.type === 'label');
      if (!hit) {
        toast(t('interchange.pickMiss'));
        return;
      }
      const ic = pend.interchangeId && store.getState().interchanges.find((x) => x.id === pend.interchangeId);
      const ids = ic ? [...ic.stationIds, hit.id] : [pend.stationId, hit.id];
      if (new Set(ids).size < 2 || (ic && ic.stationIds.includes(hit.id))) {
        toast(t('interchange.pickOther'));
        return;
      }
      const id = store.dispatch({ type: 'interchange/add', stationIds: ids });
      es.set({ pending: null, selection: id ? { type: 'interchange', id } : NO_SELECTION });
      if (id) toast(t('interchange.added'));
    }

    canvasView.setInput({
      onTap: (p, w) => (es.get().pending ? pickPending(p, w) : currentTool().onTap?.(p, w)),
      onDoubleTap: (p, w) => currentTool().onDoubleTap?.(p, w) || false,
      onLongPress: (p, w) => currentTool().onLongPress?.(p, w),
      onDragStart: (p, w) => currentTool().onDragStart?.(p, w) || null,
      onHover: (p, w) => currentTool().onHover?.(p, w),
    });
    canvasView.canvas.addEventListener('pointerleave', () => toolCtx.setHover(null));

    /** @param {'select'|'station'|'line'|'delete'} id */
    function setTool(id) {
      if (es.get().tool === id) return;
      es.set({ tool: id, drawing: null, hover: null, rangeMode: false, marquee: null });
    }

    // スマホの「範囲」ボタン（選択ツールのときだけ出す）
    const rangeBtn = h('button', {
      class: 'icon-btn mobile-only',
      type: 'button',
      'aria-label': t('range.toggle'),
      title: t('range.toggle'),
      'aria-pressed': 'false',
      on: { click: () => es.set({ rangeMode: !es.get().rangeMode }) },
    }, icon('range'));
    canvasView.addControl(rangeBtn);

    /** ラベルの位置を選ぶメニュー（長押しメニューから開く） */
    let lastMenuPoint = { x: 0, y: 0 };
    function labelPosMenu(stationId) {
      const st = store.getState().stations.find((s) => s.id === stationId);
      if (!st) return;
      const set = (fields) => store.dispatch({ type: 'station/label', stationId, fields });
      openMenu(lastMenuPoint, [
        ...LABEL_POSITIONS.map((pos) => ({
          label: (st.label.schematic.pos === pos ? '\u2713 ' : '') + t('labelPos.' + pos),
          onSelect: () => set({ pos }),
        })),
        { separator: true },
        { label: t('label.resetOffset'), disabled: !st.label.schematic.dx && !st.label.schematic.dy, onSelect: () => set({ dx: undefined, dy: undefined }) },
      ], { label: t('label.position') });
    }

    /** 選んだ駅を整列する */
    function align(mode) {
      const sel = es.get().selection;
      if (sel.type !== 'stations' || sel.ids.length < 2) return;
      const stations = store.getState().stations;
      const pts = sel.ids.map((id) => stations.find((s) => s.id === id)).filter((s) => s && s.schematic)
        .map((s) => ({ id: s.id, x: s.schematic.x, y: s.schematic.y }));
      const fn = { horizontal: alignHorizontal, vertical: alignVertical, diagonal: alignDiagonal, even: distributeEvenly }[mode];
      const positions = fn(pts);
      if (hasCollision(positions, stations)) {
        toast(t('align.blocked'));
        return;
      }
      store.dispatch({ type: 'station/place', positions });
    }

    /** 選んでいるものを削除する（Delete キー） */
    function deleteSelection() {
      const sel = es.get().selection;
      if (sel.type === 'interchange') {
        store.dispatch({ type: 'interchange/delete', interchangeId: sel.id });
        es.set({ selection: NO_SELECTION });
        toast(t('interchange.deleted'));
      } else if (sel.type === 'stations') toolCtx.deleteStations(sel.ids);
      else if (sel.type === 'section') {
        store.dispatch({ type: 'line/cutSection', lineId: sel.lineId, sectionIndex: sel.index });
        es.set({ selection: NO_SELECTION });
        toast(t('section.deleted'));
      } else if (sel.type === 'line') toolCtx.deleteLine(sel.lineId);
    }

    // ---------- パネル ----------
    const panels = createPanelHost({
      store,
      es,
      toast: (m) => toast(m),
      finishDrawing: () => tools.line.finish(),
      deleteSection: (lineId, index) => {
        store.dispatch({ type: 'line/cutSection', lineId, sectionIndex: index });
        es.set({ selection: NO_SELECTION });
        toast(t('section.deleted'));
      },
      onDelete: (ids) => toolCtx.deleteStations(ids),
      onDeleteLine: (lineId) => toolCtx.deleteLine(lineId),
      align,
      deleteSelection,
      makeInterchange: (ids) => {
        const id = store.dispatch({ type: 'interchange/add', stationIds: ids });
        if (id) {
          es.set({ selection: { type: 'interchange', id } });
          toast(t('interchange.added'));
        }
      },
    });

    // ---------- データ表 ----------
    const dataView = createDataView({
      store,
      es,
      close: () => es.set({ dataOpen: false }),
      activate(sel, opt = {}) {
        es.set({ selection: sel });
        if (opt.reveal) canvasView.reveal(opt.reveal.x * GRID, opt.reveal.y * GRID);
        // スマホでは表を閉じて、詳細のシートを見せる
        if (window.matchMedia('(max-width: 899.98px)').matches) es.set({ dataOpen: false });
      },
    });
    cleanups.push(() => dataView.dispose());

    replaceChildren(el,
      header,
      h('div', { class: 'ed-banner' }),
      toolsNav,
      h('main', { class: 'ed-stage' }, canvasView.el),
      panels.el,
      dataView.el,
    );

    // ---------- キーボード（§4.5） ----------
    cleanups.push(attachShortcuts({
      setTool,
      undo: () => store.undo(),
      redo: () => store.redo(),
      deleteSelection,
      selectAll() {
        const ids = store.getState().stations.map((st) => st.id);
        es.set({ selection: ids.length ? { type: 'stations', ids } : NO_SELECTION });
      },
      duplicate() {
        const sel = es.get().selection;
        if (sel.type === 'stations' && sel.ids.length) {
          const ids = store.dispatch({ type: 'station/duplicate', ids: sel.ids, dx: 1, dy: 1 });
          es.set({ selection: { type: 'stations', ids } });
        } else if (sel.type === 'line' || sel.type === 'section') {
          const lineId = store.dispatch({ type: 'line/duplicate', lineId: sel.lineId });
          es.set({ selection: { type: 'line', lineId } });
        }
      },
      escape() {
        const s = es.get();
        if (s.pending) es.set({ pending: null });
        else if (s.rangeMode || s.marquee) es.set({ rangeMode: false, marquee: null });
        else if (s.selection.type !== 'none') es.set({ selection: NO_SELECTION });
      },
      fit: () => canvasView.fitAll(),
      zoom: (f) => canvasView.zoomBy(f),
      toolKey: (e) => !!currentTool().onKey?.(e),
      view: () => {},
    }));

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
      if (sel.type === 'interchange' && !p.interchanges.some((x) => x.id === sel.id)) {
        es.set({ selection: NO_SELECTION });
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
      rangeBtn.hidden = s.tool !== 'select';
      dataBtn.setAttribute('aria-pressed', String(!!s.dataOpen));
      dataView.el.hidden = !s.dataOpen;
      if (s.dataOpen) dataView.update();
      rangeBtn.setAttribute('aria-pressed', String(!!s.rangeMode));
      accent = accentColor();
      el.style.setProperty('--accent', accent);
      el.style.setProperty('--accent-text', readableTextColor(accent));
      canvasView.setCursor(currentTool().cursor || 'default');
      if (s.pending) canvasView.setHint(t('interchange.pickHint'));
      else canvasView.setHint(p.stations.length ? null : t(s.tool === 'station' ? 'hint.placeStation' : 'hint.empty'));
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
