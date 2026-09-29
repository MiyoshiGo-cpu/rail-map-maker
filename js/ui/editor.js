// エディタ全体の組み立て：ストア・自動保存・ヘッダー・ツール・キャンバス・パネル・データ表・チェック
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
import { createEditorState, NO_SELECTION, accentFor, repairFor } from './editor-state.js';
import { drawOverlay, drawUnderlay } from './overlay.js';
import { createPanelHost } from './panel-host.js';
import { createSelectTool, moveStationsSafely } from './tools/select-tool.js';
import { createDeleteTool } from './tools/delete-tool.js';
import { createDataView } from './data-view.js';
import { createCheckView } from './check-view.js';
import { createEditorHeader, createBackupBanner } from './editor-header.js';
import { createEditorCommands } from './editor-commands.js';
import { needsBackupReminder, isSnoozed, snooze } from '../storage/backup.js';
import { attachShortcuts } from './keyboard.js';
import { createPlaceStationTool } from './tools/place-station-tool.js';
import { createDrawLineTool } from './tools/draw-line-tool.js';
import { pickPending, pendingHint } from './pending-pick.js';
import { drawServiceHighlight } from './service-overlay.js';
import { createStopChartView } from './stopchart-view.js';
import { viewTabs, createViewSwitcher } from './editor-views.js';

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
      routeDraft: null,
      drawer: null,
      view: 'schematic',
      chartTarget: '',
      chartLayout: 'auto',
    });

    // ---------- ヘッダーと保存 ----------
    /** @type {ReturnType<typeof createEditorCommands>} */
    let commands = null;
    const header = createEditorHeader({
      onExit: () => opt.onExit(),
      onUndo: () => store.undo(),
      onRedo: () => store.redo(),
      onExport: () => commands.exportJson(),
      menuItems: () => commands.menuItems(),
      views: viewTabs(),
      onView: (v) => changeView(v),
    });
    autosave = createAutosave(store, {
      save: (p) => putProject(p),
      onStatus: (s, detail) => {
        const msg = detail ? (detail.reason === 'invalid' ? t('save.invalidDetail', { detail: detail.message }) : t('save.failed')) : '';
        header.setSaveStatus(s, msg);
        if (s === 'error' && msg) toast(msg, { kind: 'error' });
      },
    });
    // バックアップの案内（最後のバックアップから7日以上）
    let bannerHidden = isSnoozed(store.getState().id);
    const banner = createBackupBanner({
      onExport: () => commands.exportJson(),
      onSnooze: () => {
        snooze(store.getState().id);
        bannerHidden = true;
        render();
      },
    });

    // ---------- ツールのボタン ----------
    const toolDefs = [
      { id: 'select', icon: 'select', label: t('tool.select'), title: t('tool.select.title') },
      { id: 'station', icon: 'station', label: t('tool.station'), title: t('tool.station.title') },
      { id: 'line', icon: 'line', label: t('tool.line'), title: t('tool.line.title') },
      // 削除ツールは PC だけ（スマホは長押しメニューとパネルのボタンで削除する）
      { id: 'delete', icon: 'delete', label: t('tool.delete'), title: t('tool.delete.title'), pcOnly: true },
    ];
    const toolButtons = new Map();
    // データ表とチェックを開く・閉じる（ツールではないので押した状態は別に持つ）
    const toggleDrawer = (name) => es.set({ drawer: es.get().drawer === name ? null : name });
    const dataBtn = h('button', {
      class: 'badge-btn data-toggle',
      type: 'button',
      title: t('tool.data.title'),
      'aria-pressed': 'false',
      on: { click: () => toggleDrawer('data') },
    }, icon('data'), h('span', { class: 'badge-label' }, t('tool.data')));
    const checkCount = h('span', { class: 'badge-count', hidden: true });
    const checkBtn = h('button', {
      class: 'badge-btn check-toggle',
      type: 'button',
      title: t('tool.check.title'),
      'aria-pressed': 'false',
      on: { click: () => toggleDrawer('check') },
    }, icon('check'), h('span', { class: 'badge-label' }, t('check.title')), checkCount);
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
      checkBtn,
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
    let accent = accentFor(store.getState(), es.get());
    canvasView.addLayer((ctx, view, size) => {
      const scene = getScene();
      const o = { project: store.getState(), scene, es: es.get(), zoom: view.zoom, accent };
      const visible = visibleWorldRect(view, size);
      drawUnderlay(ctx, o);
      drawItems(ctx, scene.items, visible);
      // 系統を選んでいるときは、経路と停車駅を強調する
      if (o.es.selection.type === 'service') drawServiceHighlight(ctx, { ...o, serviceId: o.es.selection.id, visible });
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
        // まとめて消す前に復元ポイントを作る（§2.4）
        if (ids.length >= 2) commands.checkpoint('bulkDelete');
        const removed = store.dispatch({ type: 'station/delete', ids });
        es.set({ selection: NO_SELECTION });
        toast(ids.length === 1 ? t('station.deleted') : t('station.deletedMany', { count: ids.length }));
        if (removed) toast(t('service.removedWith', { count: removed }));
      },
      deleteLine(lineId) {
        const line = store.getState().lines.find((l) => l.id === lineId);
        if (!line) return;
        commands.checkpoint('deleteLine');
        const removed = store.dispatch({ type: 'line/delete', lineId });
        es.set({ selection: NO_SELECTION, drawing: null });
        toast(t('line.deleted', { name: line.displayName || line.name }));
        if (removed) toast(t('service.removedWith', { count: removed }));
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
    canvasView.setInput({
      onTap: (p, w) => (es.get().pending ? pickPending({ store, es, hitTest: toolCtx.hitTest, toast }, p, w) : currentTool().onTap?.(p, w)),
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
      close: () => es.set({ drawer: null }),
      activate(sel, opt = {}) {
        es.set({ selection: sel });
        if (opt.reveal) canvasView.reveal(opt.reveal.x * GRID, opt.reveal.y * GRID);
        // スマホでは表を閉じて、詳細のシートを見せる
        if (window.matchMedia('(max-width: 899.98px)').matches) es.set({ drawer: null });
      },
    });
    cleanups.push(() => dataView.dispose());

    // ---------- 書き出し・復元ポイント・検索・チェック ----------
    commands = createEditorCommands({ store, es, canvasView, onExit: () => opt.onExit() });
    cleanups.push(() => commands.dispose());
    const checkView = createCheckView({ store, close: () => es.set({ drawer: null }), go: (target) => commands.goTo(target) });

    // ---------- 停車駅案内図のビュー ----------
    const chartView = createStopChartView({ store, es, onSelectService: (id) => es.set({ selection: { type: 'service', id } }) });
    cleanups.push(() => chartView.dispose());
    const views = createViewSwitcher({ store, es, chartView });
    /** ビューを切り替える。スマホでは、切り替えた先が見えるようにシートを下げる */
    function changeView(v) {
      if (!v || es.get().view === v) return;
      views.setView(v);
      if (window.matchMedia('(max-width: 899.98px)').matches) panels.el.dataset.stage = 'peek';
    }

    replaceChildren(el,
      header.el,
      h('div', { class: 'ed-banner' }, banner.el),
      toolsNav,
      h('main', { class: 'ed-stage' }, canvasView.el, chartView.el),
      panels.el,
      dataView.el,
      checkView.el,
    );

    // ---------- キーボード（§4.5） ----------
    cleanups.push(attachShortcuts({
      // 案内図では描くツールに切り替えない
      setTool: (id) => { if (es.get().view !== 'stopChart') setTool(id); },
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
        else if (s.routeDraft) es.set({ routeDraft: null });
        else if (s.rangeMode || s.marquee) es.set({ rangeMode: false, marquee: null });
        else if (s.selection.type !== 'none') es.set({ selection: NO_SELECTION });
      },
      fit: () => (es.get().view === 'stopChart' ? chartView.fitAll() : canvasView.fitAll()),
      zoom: (f) => (es.get().view === 'stopChart' ? chartView.zoomBy(f) : canvasView.zoomBy(f)),
      toolKey: (e) => es.get().view !== 'stopChart' && !!currentTool().onKey?.(e),
      view: (n) => changeView(views.viewForKey(n)),
      search: () => commands.search(),
      exportJson: () => commands.exportJson(),
    }));

    // ---------- 画面の更新 ----------
    function render() {
      const p = store.getState();
      const s = es.get();
      // 消えたものを指している状態を直す（直したら、その変更でもう一度描き直される）
      const fix = repairFor(p, s);
      if (fix) {
        es.set(fix);
        return;
      }
      header.update(p.name, store.canUndo(), store.canRedo(), s.view);
      // ビュー：案内図では描くツールを隠し、案内図を描き直す
      const onChart = s.view === 'stopChart';
      canvasView.el.hidden = onChart;
      chartView.el.hidden = !onChart;
      for (const b of toolButtons.values()) b.classList.toggle('is-hidden', onChart);
      if (onChart) chartView.update(p);
      document.title = `${p.name} - ${t('app.title')}`;
      banner.update(!bannerHidden && needsBackupReminder(p), p.meta.lastBackupAt);
      for (const [id, b] of toolButtons) b.setAttribute('aria-pressed', String(s.tool === id));
      rangeBtn.hidden = s.tool !== 'select';
      dataBtn.setAttribute('aria-pressed', String(s.drawer === 'data'));
      checkBtn.setAttribute('aria-pressed', String(s.drawer === 'check'));
      dataView.el.hidden = s.drawer !== 'data';
      checkView.el.hidden = s.drawer !== 'check';
      if (s.drawer === 'data') dataView.update();
      if (s.drawer === 'check') checkView.update();
      const n = checkView.count();
      checkCount.hidden = n === 0;
      checkCount.textContent = n > 99 ? '99+' : String(n);
      rangeBtn.setAttribute('aria-pressed', String(!!s.rangeMode));
      accent = accentFor(p, s);
      el.style.setProperty('--accent', accent);
      el.style.setProperty('--accent-text', readableTextColor(accent));
      canvasView.setCursor(currentTool().cursor || 'default');
      if (s.pending) canvasView.setHint(pendingHint(s.pending));
      else canvasView.setHint(p.stations.length ? null : t(s.tool === 'station' ? 'hint.placeStation' : 'hint.empty'));
      panels.update(p);
      canvasView.requestRender();
    }
    cleanups.push(store.subscribe(render));
    cleanups.push(es.subscribe(render));
    render();

    // 開発用：?debug=1 のときだけ、コンソールから状態を見られるようにする
    if (new URLSearchParams(location.search).has('debug')) {
      /** @type {any} */ (window).rmmDebug = { store, es, canvasView, getScene, commands };
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
