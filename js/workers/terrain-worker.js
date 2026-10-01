// 地形の生成を画面の裏で行う Worker（§6.7。生成中も画面が固まらないように）。
// メッセージ：{ id, kind: 'preview'|'world', seed, params, regionId, resolution? } か { id, kind: 'analyze', world }
// 返事：{ id, kind: 'progress', ratio } を何度か → { id, kind: 'preview', width, height, data } か { id, kind: 'world', world, ms }
//   analyze には、地理ビューで使うもの（jobs.js の GeoBase）を返す
import { runTerrainJob } from '../core/terrain/jobs.js';

self.onmessage = (e) => {
  const job = e.data;
  try {
    const result = runTerrainJob(job, (ratio) => self.postMessage({ id: job.id, kind: 'progress', ratio }));
    const transfer = result.kind === 'preview' ? [result.data.buffer]
      : result.kind === 'analyze' ? [result.elevation.buffer, result.water.buffer, result.regionMap.buffer, result.rgba.buffer, result.seaRgba.buffer] : [];
    self.postMessage({ id: job.id, ...result }, transfer);
  } catch (err) {
    self.postMessage({ id: job.id, kind: 'error', message: String(err && err.message || err) });
  }
};
