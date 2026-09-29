// 復元ポイントの一覧（プロジェクト一覧から開く）。選んだ時点に戻す前に、いまの状態も復元ポイントにする
import { h } from './dom.js';
import { t, formatDate } from '../i18n/i18n.js';
import { openSheet, confirmDialog } from './dialog.js';
import { toast } from './toast.js';
import { listRestorePoints, addRestorePoint, getProject, putProject } from '../storage/idb.js';

/**
 * @param {string} projectId
 * @param {() => void} onRestored
 */
export async function openRestorePoints(projectId, onRestored) {
  const list = await listRestorePoints(projectId);
  const body = list.length
    ? h('ul', { class: 'restore-list' }, list.map((rp) => h('li', {},
      h('span', { class: 'restore-text' },
        h('span', { class: 'restore-date' }, formatDate(rp.createdAt)),
        h('span', { class: 'restore-sub' }, t('restore.reason.' + rp.reason), t('common.dot'), t('plist.counts', { stations: rp.data.stations.length, lines: rp.data.lines.length })),
      ),
      h('button', { class: 'btn btn-small', type: 'button', on: { click: () => restore(rp) } }, t('restore.apply')),
    )))
    : h('p', { class: 'panel-note' }, t('restore.none'));
  const sheet = openSheet({ title: t('restore.title'), body: [h('p', { class: 'panel-note' }, t('restore.hint')), body] });

  async function restore(rp) {
    const ok = await confirmDialog({ title: t('restore.confirmTitle'), message: t('restore.confirmMessage', { date: formatDate(rp.createdAt) }), okLabel: t('restore.apply') });
    if (!ok) return;
    const cur = await getProject(projectId);
    // 戻す直前の状態を、別の復元ポイントとして先に保存する
    if (cur) await addRestorePoint(cur, 'beforeRestore');
    await putProject({ ...rp.data, id: projectId, updatedAt: new Date().toISOString() });
    sheet.close();
    toast(t('restore.done'));
    onRestored();
  }
}
