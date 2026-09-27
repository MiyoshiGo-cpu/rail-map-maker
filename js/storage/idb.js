// IndexedDB への保存（DB名 rail-map-maker。同じドメインの別アプリと混ざらないように）
// projects：プロジェクト本体、projectMeta：一覧用の要約、restorePoints：復元ポイント（ステップ15で使う）

export const DB_NAME = 'rail-map-maker';
const DB_VERSION = 1;

/** @typedef {import('../core/schema.js').Project} Project */
/**
 * @typedef {object} ProjectMeta
 * @property {string} id
 * @property {string} name
 * @property {string} [author]
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {number} stationCount
 * @property {number} lineCount
 * @property {string} [lastBackupAt]
 */

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/**
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @param {IDBTransaction} tx */
function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  });
}

/** @returns {Promise<IDBDatabase>} */
export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('projectMeta')) db.createObjectStore('projectMeta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('restorePoints')) {
        const rp = db.createObjectStore('restorePoints', { keyPath: 'id' });
        rp.createIndex('projectId', 'projectId');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // ほかのタブが DB を更新しようとしたら閉じて譲る
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('indexedDB open blocked'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

/**
 * 一覧用の要約を作る
 * @param {Project} p
 * @returns {ProjectMeta}
 */
export function metaOf(p) {
  /** @type {ProjectMeta} */
  const m = {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    stationCount: p.stations.length,
    lineCount: p.lines.length,
  };
  if (p.author) m.author = p.author;
  if (p.meta && p.meta.lastBackupAt) m.lastBackupAt = p.meta.lastBackupAt;
  return m;
}

/** 更新日時の新しい順 */
export async function listProjectMeta() {
  const db = await openDb();
  const tx = db.transaction('projectMeta', 'readonly');
  /** @type {ProjectMeta[]} */
  const all = await request(tx.objectStore('projectMeta').getAll());
  return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/**
 * @param {string} id
 * @returns {Promise<Project | undefined>}
 */
export async function getProject(id) {
  const db = await openDb();
  const tx = db.transaction('projects', 'readonly');
  return request(tx.objectStore('projects').get(id));
}

/**
 * 本体と要約を1つのトランザクションで保存する
 * @param {Project} project
 */
export async function putProject(project) {
  const db = await openDb();
  const tx = db.transaction(['projects', 'projectMeta'], 'readwrite');
  tx.objectStore('projects').put(project);
  tx.objectStore('projectMeta').put(metaOf(project));
  await done(tx);
}

/**
 * プロジェクトを消す（復元ポイントも一緒に消す）
 * @param {string} id
 */
export async function deleteProject(id) {
  const db = await openDb();
  const tx = db.transaction(['projects', 'projectMeta', 'restorePoints'], 'readwrite');
  tx.objectStore('projects').delete(id);
  tx.objectStore('projectMeta').delete(id);
  const rp = tx.objectStore('restorePoints');
  // await を挟むとトランザクションが閉じる環境があるため、コールバックの中で消す
  const req = rp.index('projectId').getAllKeys(id);
  req.onsuccess = () => {
    for (const k of req.result) rp.delete(k);
  };
  await done(tx);
}

/** 保存領域を消されにくくするよう求める（非対応なら何もしない） */
export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
      return await navigator.storage.persist();
    }
  } catch {
    // 失敗しても使い続けられる
  }
  return false;
}
