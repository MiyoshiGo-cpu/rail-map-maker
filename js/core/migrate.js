// schemaVersion を見て、古い版のデータを順に新しい版へ変換する（§3）
import { SCHEMA_VERSION } from './schema.js';

/** 読み込めないファイル。code は画面の文言のキーに使う */
export class InvalidFileError extends Error {
  /** @param {'notObject'|'noVersion'|'noMigration'|'broken'} code @param {string} [detail] */
  constructor(code, detail) {
    super(`invalid file: ${code}${detail ? ' (' + detail + ')' : ''}`);
    this.name = 'InvalidFileError';
    this.code = code;
    this.detail = detail;
  }
}

/** アプリより新しい版で作られたファイル */
export class NewerVersionError extends Error {
  /** @param {number} version */
  constructor(version) {
    super(`file schemaVersion ${version} is newer than ${SCHEMA_VERSION}`);
    this.name = 'NewerVersionError';
    this.version = version;
  }
}

/**
 * 版 n から n+1 への変換関数。版を上げるときにここへ足す。
 * 例：2: (p) => ({ ...p, newField: 0 })   // v2 → v3
 * @type {Record<number, (p: any) => any>}
 */
export const MIGRATIONS = {};

/**
 * @param {any} data JSON.parse したもの
 * @param {{ migrations?: Record<number, (p: any) => any>, target?: number }} [opt]
 * @returns {any} target 版のデータ
 */
export function migrate(data, opt = {}) {
  const migrations = opt.migrations || MIGRATIONS;
  const target = opt.target || SCHEMA_VERSION;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new InvalidFileError('notObject');
  let v = data.schemaVersion;
  if (!Number.isInteger(v) || v < 1) throw new InvalidFileError('noVersion');
  if (v > target) throw new NewerVersionError(v);
  let p = data;
  while (v < target) {
    const fn = migrations[v];
    if (!fn) throw new InvalidFileError('noMigration', String(v));
    p = { ...fn(p), schemaVersion: v + 1 };
    v++;
  }
  return p;
}
