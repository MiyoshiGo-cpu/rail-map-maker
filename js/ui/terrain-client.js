// 地形の Worker とのやりとり。Worker が使えないブラウザでは、画面側で少し待ってから計算する
import { runTerrainJob } from '../core/terrain/jobs.js';

let worker = null;
let failed = false;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker || failed) return worker;
  try {
    worker = new Worker(new URL('../workers/terrain-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      const p = pending.get(m.id);
      if (!p) return;
      if (m.kind === 'progress') {
        if (p.onProgress) p.onProgress(m.ratio);
        return;
      }
      pending.delete(m.id);
      if (m.kind === 'error') p.reject(new Error(m.message));
      else p.resolve(m);
    };
    worker.onerror = (e) => {
      // 読み込みに失敗したら、画面側で計算するように切り替える
      console.error('[terrain worker]', e.message || e);
      failed = true;
      worker = null;
      for (const [id, p] of pending) {
        pending.delete(id);
        runHere(p.job, p).then(p.resolve, p.reject);
      }
    };
  } catch (e) {
    console.error('[terrain worker]', e);
    failed = true;
    worker = null;
  }
  return worker;
}

/** 画面側で計算する（描画の順番が回るように、少し待ってから） */
function runHere(job, p) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(runTerrainJob(job, p.onProgress));
      } catch (e) {
        reject(e);
      }
    }, 30);
  });
}

/**
 * 地形の仕事を頼む
 * @param {{ kind: 'preview'|'world'|'analyze', seed?: string, params?: any, regionId?: string, resolution?: number, romaji?: any, world?: any }} job
 * @param {(ratio: number) => void} [onProgress]
 * @returns {Promise<any>}
 */
export function requestTerrain(job, onProgress) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const p = { job: { ...job, id }, onProgress, resolve, reject };
    const w = getWorker();
    if (!w) {
      runHere(p.job, p).then(resolve, reject);
      return;
    }
    pending.set(id, p);
    w.postMessage(p.job);
  });
}
