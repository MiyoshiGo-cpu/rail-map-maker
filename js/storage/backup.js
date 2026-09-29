// バックアップの案内と、復元ポイントを作る時機（§2.4）
// ・最後のバックアップ（JSON の書き出し）から7日以上たったら案内を出す
// ・復元ポイントは10分ごと（変更があれば）と、大きな操作の直前に作る

export const BACKUP_REMIND_DAYS = 7;
export const RESTORE_POINT_INTERVAL_MS = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const SNOOZE_KEY = 'rmm:backupSnooze:';

/**
 * バックアップの案内を出すか（まだ一度も書き出していなければ、作った日から数える）
 * @param {import('../core/schema.js').Project} p
 * @param {Date} [now]
 */
export function needsBackupReminder(p, now = new Date()) {
  const last = new Date(p.meta.lastBackupAt || p.createdAt).getTime();
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last >= BACKUP_REMIND_DAYS * DAY;
}

/** 「あとで」を押したら、その日は出さない */
export function isSnoozed(projectId, now = new Date()) {
  try {
    const v = localStorage.getItem(SNOOZE_KEY + projectId);
    return !!v && now.getTime() - Number(v) < DAY;
  } catch {
    return false;
  }
}

export function snooze(projectId, now = new Date()) {
  try {
    localStorage.setItem(SNOOZE_KEY + projectId, String(now.getTime()));
  } catch {
    // 保存できなければ、この画面のあいだだけ隠す
  }
}
