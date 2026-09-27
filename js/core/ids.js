// ID の生成：種類の接頭辞＋ランダムな英数字（例：st_k3f9a2）

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LENGTH = 6;

function randomChars(n) {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

/**
 * @param {string} prefix
 * @param {{ has(id: string): boolean }} [taken] 使用済みの ID（重なったら作り直す）
 */
export function newId(prefix, taken) {
  for (let i = 0; i < 100; i++) {
    const id = `${prefix}_${randomChars(LENGTH)}`;
    if (!taken || !taken.has(id)) return id;
  }
  throw new Error('newId: could not generate a unique id');
}

/**
 * プロジェクト内のすべての ID を集める
 * @param {import('./schema.js').Project} p
 */
export function collectIds(p) {
  const ids = new Set();
  for (const key of ['operators', 'lines', 'stations', 'interchanges', 'serviceTypes', 'services', 'rollingStock', 'fareTables']) {
    for (const item of p[key] || []) ids.add(item.id);
  }
  if (p.world && p.world.mode === 'fictional') {
    for (const c of p.world.cities || []) ids.add(c.id);
    for (const r of p.world.regions || []) ids.add(r.id);
  }
  return ids;
}
