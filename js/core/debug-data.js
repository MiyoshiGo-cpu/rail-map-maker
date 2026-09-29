// 性能確認用のデータ（駅200・路線20）を作る。シード付きの乱数で、毎回同じものになる
import { createProject } from './defaults.js';
import { createProjectStore } from './actions/index.js';
import { createRng } from './rng.js';
import { LINE_PALETTE } from './color.js';

/** 八方向の歩き方 */
const STEPS = [[3, 0], [2, 2], [0, 3], [-2, 2], [-3, 0], [-2, -2], [0, -3], [2, -2]];

/**
 * @param {{ stations?: number, lines?: number, seed?: string, now?: string, name?: string }} [opt]
 * @returns {import('./schema.js').Project}
 */
export function generateDebugProject(opt = {}) {
  const want = opt.stations ?? 200;
  const lineCount = opt.lines ?? 20;
  const rng = createRng(opt.seed ?? 'debug');
  const p = createProject({ id: 'pj_debug', name: opt.name ?? 'debug', now: opt.now });
  const store = createProjectStore(p, { maxHistory: 1, now: () => p.createdAt });
  /** 格子点 → 駅 ID */
  const at = new Map();
  let n = 0;
  const stationAt = (x, y) => {
    const k = x + ',' + y;
    if (!at.has(k)) {
      n++;
      at.set(k, store.dispatch({ type: 'station/add', x, y, fields: { name: `駅${n}`, reading: `えき${n}` } }));
    }
    return at.get(k);
  };

  let made = 0;
  for (let attempt = 0; made < lineCount && attempt < lineCount * 5; attempt++) {
    // この路線で新しく作る駅の数（残りを残りの路線で分ける）
    const quota = Math.max(1, Math.ceil((want - n) / (lineCount - made)));
    let x = made === 0 ? 0 : rng.int(-30, 30) * 3;
    let y = made === 0 ? 0 : rng.int(-20, 20) * 3;
    let dir = rng.int(0, 7);
    const ids = [];
    let created = 0;
    for (let k = 0; k < quota + 6; k++) {
      const exists = at.has(x + ',' + y);
      if (!exists && (created >= quota || n >= want)) break;
      const id = stationAt(x, y);
      if (ids.includes(id)) break;
      if (!exists) created++;
      ids.push(id);
      // ときどき45°曲がる
      if (rng.next() < 0.3) dir = (dir + (rng.next() < 0.5 ? 1 : 7)) % 8;
      x += STEPS[dir][0];
      y += STEPS[dir][1];
    }
    if (ids.length < 2) continue;
    const lineId = store.dispatch({
      type: 'line/add',
      fields: { name: `路線${made + 1}`, color: LINE_PALETTE[made % LINE_PALETTE.length], symbol: String.fromCharCode(65 + (made % 26)) },
      stationIds: ids,
    });
    if (made % 3 === 0) store.dispatch({ type: 'line/numbering', lineId, fields: { enabled: true } });
    made++;
  }
  // 路線に入らなかった駅（途中で止まった路線の駅）は消さずに残す
  return store.getState();
}
