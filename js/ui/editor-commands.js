// エディタの画面単位の操作：JSON の書き出し、復元ポイント（10分ごと・大きな操作の前）、
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

const MOBILE = '(max-width: 899.98px)';

/**
 * @param {{
 *   store: any,
 *   es: any,
 *   canvasView: ReturnType<typeof import('./canvas-view.js').createCanvasView>,
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

  /** JSON で書き出す（Ctrl+S・書き出すボタン・バックアップの案内） */
  async function exportJson() {
    const p = store.getCommittedState();
    try {
      const result = await saveTextFile(exportFilename(p.name), serializeProject(p));
      if (result === 'cancelled') return;
      store.dispatch({ type: 'project/meta', fields: { lastBackupAt: new Date().toISOString() }, silent: true });
      toast(t('editor.exported'));
    } catch (e) {
      console.error(e);
      toast(t('editor.exportFailed'), { kind: 'error' });
    }
  }

  /** 世界座標の格子点を画面に出す */
  const reveal = (pos) => {
    if (pos) canvasView.reveal(pos.x * GRID, pos.y * GRID);
  };

  /** チェックの項目や検索の結果から、そのものを選んで画面に出す */
  function goTo(target) {
    const p = store.getState();
    if (target.type === 'station') {
      es.set({ selection: { type: 'stations', ids: [target.id] } });
      reveal(p.stations.find((s) => s.id === target.id)?.schematic);
    } else if (target.type === 'line') {
      es.set({ selection: { type: 'line', lineId: target.id } });
      const line = p.lines.find((l) => l.id === target.id);
      const first = line && line.stops[0] && p.stations.find((s) => s.id === line.stops[0].stationId);
      reveal(first && first.schematic);
    } else if (target.type === 'operator') {
      es.set({ selection: { type: 'operator', id: target.id } });
    } else if (target.type === 'interchange') {
      es.set({ selection: { type: 'interchange', id: target.id } });
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

  /** プロジェクト名のメニューと「その他」のメニュー */
  function menuItems() {
    return [
      { label: t('editor.export'), onSelect: exportJson },
      { label: t('search.title'), onSelect: search },
      { label: t('check.title'), onSelect: () => es.set({ drawer: 'check' }) },
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
    goTo,
    search,
    settings,
    menuItems,
    dispose() {
      clearInterval(timer);
      unsubscribe();
    },
  };
}
