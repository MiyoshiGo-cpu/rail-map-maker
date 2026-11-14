// エディタの画面単位の操作：書き出し（シートと JSON）、復元ポイント（10分ごと・大きな操作の前）、
// 駅の検索、チェックの項目への移動、設定・ヘルプ、その他のメニュー
import { t } from '../i18n/i18n.js';
import { toast } from './toast.js';
import { GRID } from '../core/viewport.js';
import { exportFilename, serializeProject, saveTextFile } from '../storage/file-io.js';
import { addRestorePoint } from '../storage/idb.js';
import { RESTORE_POINT_INTERVAL_MS } from '../storage/backup.js';
import { openStationSearch } from './search-view.js';
import { openSettings } from './settings-view.js';
import { openHelp } from './help-view.js';
import { openExportSheet } from './export-view.js';
import { exportTarget } from './exporter.js';
import { preparePrint, cleanupPrint } from './print.js';
import { openTerrainDialog } from './terrain-dialog.js';
import { confirmDialog, openDialog } from './dialog.js';
import { autoSchematic } from '../core/auto-schematic.js';
import { getRegion } from '../core/regions/index.js';

const MOBILE = '(max-width: 899.98px)';

/**
 * @param {{
 *   store: any,
 *   es: any,
 *   canvasView: ReturnType<typeof import('./canvas-view.js').createCanvasView>,
 *   getViewScene: (view: string) => any,
 *   revealGeo?: (g: { x: number, y: number }) => void,
 *   showSchematic?: () => void,
 *   onExit: () => void,
 * }} ctx
 */
export function createEditorCommands(ctx) {
  const { store, es, canvasView } = ctx;
  let changedSincePoint = false;

  /** 大きな操作の直前などに復元ポイントを作る（失敗しても操作は続ける） */
  function checkpoint(reason) {
    changedSincePoint = false;
    addRestorePoint(store.getCommittedState(), reason).catch((e) => console.error('[restore point]', e));
  }

  // 10分ごと：変更があれば復元ポイントを作る
  const unsubscribe = store.subscribe((_s, info) => {
    if (info.kind !== 'preview' && !info.silent) changedSincePoint = true;
  });
  const timer = setInterval(() => {
    if (changedSincePoint) checkpoint('auto');
  }, RESTORE_POINT_INTERVAL_MS);

  // ブラウザのメニューや Ctrl+P で印刷したときも、画面ではなく今のビューの絵を用紙に収めて印刷する
  const onBeforePrint = () => {
    if (document.querySelector('.print-root')) return;
    const p = store.getState();
    const view = es.get().view;
    const target = exportTarget(p, view, ctx.getViewScene(view));
    if (!target) return;
    preparePrint(target, { title: p.name });
    window.addEventListener('afterprint', cleanupPrint, { once: true });
  };
  window.addEventListener('beforeprint', onBeforePrint);

  /** JSON で書き出す（Ctrl+S・書き出すボタン・バックアップの案内） */
  async function exportJson() {
    const p = store.getCommittedState();
    try {
      const result = await saveTextFile(exportFilename(p.name), serializeProject(p));
      if (result === 'needsTap') toast(t('export.tapAgain'));
      if (result === 'cancelled' || result === 'needsTap') return;
      store.dispatch({ type: 'project/meta', fields: { lastBackupAt: new Date().toISOString() }, silent: true });
      toast(t('editor.exported'));
    } catch (e) {
      console.error(e);
      toast(t('editor.exportFailed'), { kind: 'error' });
    }
  }

  /** 「書き出す」のシート（今表示しているビューを PNG などで。JSON もここから） */
  function openExport() {
    openExportSheet({ store, es, getViewScene: ctx.getViewScene, onJson: exportJson });
  }

  /** 駅を画面に出す（地理ビューなら地理の位置、それ以外は路線図の格子点） */
  const reveal = (st) => {
    if (!st) return;
    if (es.get().view === 'geo') {
      if (st.geo && 'x' in st.geo && ctx.revealGeo) ctx.revealGeo(st.geo);
    } else if (st.schematic) canvasView.reveal(st.schematic.x * GRID, st.schematic.y * GRID);
  };

  /** チェックの項目や検索の結果から、そのものを選んで画面に出す */
  function goTo(target) {
    const p = store.getState();
    if (target.type === 'station') {
      es.set({ selection: { type: 'stations', ids: [target.id] } });
      reveal(p.stations.find((s) => s.id === target.id));
    } else if (target.type === 'line') {
      es.set({ selection: { type: 'line', lineId: target.id } });
      const line = p.lines.find((l) => l.id === target.id);
      const first = line && line.stops[0] && p.stations.find((s) => s.id === line.stops[0].stationId);
      reveal(first);
    } else if (target.type === 'section') {
      const line = p.lines.find((l) => l.id === target.id);
      if (line && target.index < line.sections.length) {
        es.set({ selection: { type: 'section', lineId: line.id, index: target.index } });
        reveal(p.stations.find((s) => s.id === line.stops[target.index].stationId));
      }
    } else if (target.type === 'operator') {
      es.set({ selection: { type: 'operator', id: target.id } });
    } else if (target.type === 'interchange') {
      es.set({ selection: { type: 'interchange', id: target.id } });
    } else if (target.type === 'service' || target.type === 'serviceType') {
      es.set({ selection: { type: target.type, id: target.id } });
    }
    // スマホでは一覧を閉じて、選んだものを見せる
    if (window.matchMedia(MOBILE).matches) es.set({ drawer: null });
  }

  function search() {
    openStationSearch(store.getState(), (id) => goTo({ type: 'station', id }));
  }

  function settings() {
    openSettings({
      store,
      onExport: exportJson,
      // 英字をまとめて作り直す前に復元ポイントを作る
      onRomaji: (fields) => {
        checkpoint('romaji');
        store.dispatch({ type: 'project/romaji', fields });
      },
    });
  }

  /** 路線図だけのプロジェクトに架空の地形を付ける（今ある駅は、路線図の配置から地理の位置を仮に決める） */
  async function addTerrain() {
    const p = store.getState();
    const res = await openTerrainDialog({
      title: t('terrain.addTitle'),
      regionId: p.locale.region,
      romaji: p.settings.romaji,
      stations: p.stations.map((s) => ({ id: s.id, schematic: s.schematic })),
    });
    if (!res) return;
    checkpoint('terrain');
    store.dispatch({ type: 'world/set', world: res.world, stationGeo: res.stationGeo });
    toast(t('terrain.done', { sec: (res.ms / 1000).toFixed(1) }));
  }

  /**
   * 架空の地形を作り直す（今のシードとパラメータから変えて）。ブラシの編集があれば、捨てるか新しい地形に当て直すかを選ぶ。
   * 都市と県は新しく作り、駅の地理の位置はそのまま。作り直す前に復元ポイントを作る（1手で取り消せる）
   */
  async function regenerateTerrain() {
    const p = store.getState();
    if (p.world.mode !== 'fictional') return;
    const w = p.world;
    const edits = w.terrain.edits || [];
    let keep = [];
    if (edits.length) {
      const v = await openDialog({
        title: t('terrain.regenerate'),
        message: t('terrain.editsQuestion', { count: edits.length }),
        actions: [
          { label: t('common.cancel'), value: 'cancel' },
          { label: t('terrain.editsDiscard'), value: 'discard' },
          { label: t('terrain.editsKeep'), value: 'keep', kind: 'primary' },
        ],
      });
      if (v !== 'discard' && v !== 'keep') return;
      if (v === 'keep') keep = edits;
    }
    const res = await openTerrainDialog({
      title: t('terrain.regenerate'),
      regionId: p.locale.region,
      romaji: p.settings.romaji,
      initial: { seed: w.seed, params: w.gen },
      edits: keep,
      note: t('terrain.regenerateNote', { admin1: t(getRegion(p.locale.region).adminLabelKeys.admin1) }),
    });
    if (!res) return;
    checkpoint('regenerate');
    store.dispatch({ type: 'world/set', world: res.world });
    toast(t('terrain.regenerated', { sec: (res.ms / 1000).toFixed(1) }));
  }

  /** 地理の配置から路線図を作り直す（確認してから。作る前に復元ポイントを作る。1手で取り消せる） */
  async function autoLayout() {
    const ok = await confirmDialog({ title: t('autoSchematic.title'), message: t('autoSchematic.confirm'), okLabel: t('autoSchematic.ok') });
    if (!ok) return;
    checkpoint('autoSchematic');
    const { positions } = autoSchematic(store.getState());
    store.dispatch({ type: 'station/autoLayout', positions });
    if (ctx.showSchematic) ctx.showSchematic();
    toast(t('autoSchematic.done', { count: Object.keys(positions).length }));
  }

  /** プロジェクト名のメニューと「その他」のメニュー */
  function menuItems() {
    const p = store.getState();
    const noWorld = p.world.mode === 'none';
    const canAuto = p.world.mode === 'fictional' && p.stations.length > 0;
    return [
      { label: t('editor.export'), onSelect: openExport },
      { label: t('search.title'), onSelect: search },
      { label: t('check.title'), onSelect: () => es.set({ drawer: 'check' }) },
      ...(noWorld ? [{ label: t('terrain.addTitle'), onSelect: addTerrain }] : []),
      ...(canAuto ? [{ label: t('autoSchematic.title'), onSelect: autoLayout }] : []),
      ...(p.world.mode === 'fictional' ? [{ label: t('terrain.regenerate'), onSelect: regenerateTerrain }] : []),
      { separator: true },
      { label: t('settings.title'), onSelect: settings },
      { label: t('help.title'), onSelect: openHelp },
      { separator: true },
      { label: t('editor.backToList'), onSelect: ctx.onExit },
    ];
  }

  return {
    checkpoint,
    exportJson,
    openExport,
    goTo,
    revealStation: reveal,
    search,
    settings,
    menuItems,
    addTerrain,
    autoLayout,
    regenerateTerrain,
    dispose() {
      window.removeEventListener('beforeprint', onBeforePrint);
      clearInterval(timer);
      unsubscribe();
    },
  };
}
