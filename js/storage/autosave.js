// 自動保存：変更から1秒後に保存する（続けて変更したらまとめる。ただし最長5秒で保存）。
// 保存前に整合性チェックを行い、問題があれば保存しない。
import { checkIntegrity, describeProblems } from '../core/validate.js';

/** @typedef {'saved'|'dirty'|'saving'|'error'} SaveStatus */

/**
 * @param {{ getState(): any, getCommittedState(): any, subscribe(fn: Function): Function }} store
 * @param {{
 *   save: (project: any) => Promise<void>,
 *   onStatus?: (status: SaveStatus, detail?: { reason: 'invalid'|'failed', message: string }) => void,
 *   delay?: number,
 *   maxWait?: number,
 * }} opt
 */
export function createAutosave(store, opt) {
  const delay = opt.delay ?? 1000;
  const maxWait = opt.maxWait ?? 5000;
  let timer = null;
  let firstDirtyAt = 0;
  let dirty = false;
  /** @type {Promise<void> | null} */
  let saving = null;
  /** @type {SaveStatus} */
  let status = 'saved';

  function setStatus(s, detail) {
    status = s;
    if (opt.onStatus) opt.onStatus(s, detail);
  }

  function schedule() {
    clearTimeout(timer);
    const now = Date.now();
    if (!firstDirtyAt) firstDirtyAt = now;
    const wait = Math.max(0, Math.min(delay, firstDirtyAt + maxWait - now));
    timer = setTimeout(() => { flush(); }, wait);
  }

  const unsubscribe = store.subscribe((_state, info) => {
    if (info.kind === 'preview' || info.kind === 'replace') return;
    dirty = true;
    if (status !== 'error') setStatus('dirty');
    schedule();
  });

  /** すぐに保存する（画面を離れるときなど） */
  async function flush() {
    clearTimeout(timer);
    timer = null;
    if (saving) await saving;
    if (!dirty) return;
    const project = store.getCommittedState();
    const problems = checkIntegrity(project);
    if (problems.length) {
      firstDirtyAt = 0;
      console.error('[autosave] integrity problems', problems);
      setStatus('error', { reason: 'invalid', message: describeProblems(problems) });
      return;
    }
    dirty = false;
    firstDirtyAt = 0;
    setStatus('saving');
    saving = opt.save(project).then(
      () => {
        // 保存中に次の変更が来ていれば未保存のまま
        setStatus(dirty ? 'dirty' : 'saved');
      },
      (e) => {
        dirty = true;
        console.error('[autosave] save failed', e);
        setStatus('error', { reason: 'failed', message: String(e && e.message || e) });
      },
    );
    await saving;
    saving = null;
  }

  return {
    flush,
    getStatus: () => status,
    isDirty: () => dirty,
    dispose() {
      clearTimeout(timer);
      unsubscribe();
    },
  };
}
