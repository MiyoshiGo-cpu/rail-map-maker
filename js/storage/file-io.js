// JSON ファイルの書き出しと読み込み（§2.4）
// ファイル名：{プロジェクト名}_{yyyyMMdd-HHmm}.railmap.json。iPhone では共有シート、使えなければダウンロード。
import { migrate, InvalidFileError } from '../core/migrate.js';
import { normalizeProject } from '../core/defaults.js';
import { checkIntegrity, describeProblems } from '../core/validate.js';

export const FILE_EXT = '.railmap.json';

const pad = (n) => String(n).padStart(2, '0');

/**
 * 書き出すファイルの名前（ファイル名に使えない文字は _ にする）
 * @param {string} name
 * @param {Date} [now]
 */
export function exportFilename(name, now = new Date()) {
  const safe = (name || 'railmap').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'railmap';
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${safe}_${stamp}${FILE_EXT}`;
}

/**
 * @param {import('../core/schema.js').Project} p
 */
export function serializeProject(p) {
  return JSON.stringify(p, null, 2);
}

/**
 * ファイルの中身をプロジェクトにする（古い版なら変換し、足りない項目を補い、壊れていれば例外）
 * @param {string} text
 * @returns {import('../core/schema.js').Project}
 */
export function parseProjectText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new InvalidFileError('notJson');
  }
  const p = normalizeProject(migrate(data));
  const problems = checkIntegrity(p);
  if (problems.length) throw new InvalidFileError('broken', describeProblems(problems));
  return p;
}

/**
 * 共有シート（スマホ）かダウンロード（PC）で渡す
 * @param {string} filename
 * @param {string} text
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
 */
export async function saveTextFile(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const coarse = globalThis.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare && typeof File !== 'undefined') {
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
        // 共有できなければダウンロードにする
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/**
 * ファイルを選んでもらい、中身の文字列を返す（選ばなければ null）
 * @returns {Promise<{ name: string, text: string } | null>}
 */
export function pickTextFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // iPhone では拡張子の指定が効かないことがあるため、JSON 全般を受け付ける
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) {
        resolve(null);
        return;
      }
      resolve({ name: f.name, text: await f.text() });
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
