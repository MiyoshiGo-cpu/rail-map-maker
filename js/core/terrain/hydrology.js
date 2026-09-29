// 水系（§6.7 の手順4）：窪地を埋め（priority-flood）、8方向の流下方向と流量の累積を計算し、
// 一定以上の流量を川に、埋めた窪地のうち広いものを湖にする。
// 標高は保存と同じ Int16 の値で計算する（読み込んだときに同じ結果を作り直せるように）。

/** 8方向（右から時計回り） */
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
const DIST = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

/** 水の種類 */
export const LAND = 0;
export const SEA = 1;
export const LAKE = 2;

/**
 * 最小ヒープ（添字と優先度を型付き配列で持つ）
 * @param {number} capacity
 */
function createHeap(capacity) {
  const idx = new Int32Array(capacity);
  const pri = new Float64Array(capacity);
  let size = 0;
  return {
    get size() { return size; },
    push(i, p) {
      let k = size++;
      while (k > 0) {
        const parent = (k - 1) >> 1;
        if (pri[parent] <= p) break;
        idx[k] = idx[parent];
        pri[k] = pri[parent];
        k = parent;
      }
      idx[k] = i;
      pri[k] = p;
    },
    /** 最小の添字を取り出す（優先度は top で先に読む） */
    pop() {
      const top = idx[0];
      const li = idx[--size];
      const lp = pri[size];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= size) break;
        if (c + 1 < size && pri[c + 1] < pri[c]) c++;
        if (pri[c] >= lp) break;
        idx[k] = idx[c];
        pri[k] = pri[c];
        k = c;
      }
      idx[k] = li;
      pri[k] = lp;
      return top;
    },
    topPriority: () => pri[0],
  };
}

/**
 * 水系を計算する
 * @param {Int16Array | Float32Array} elev 標高（m）。0 以下は水
 * @param {number} width
 * @param {number} height
 * @param {{ cellKm: number, riverAmount: number }} opt
 */
export function analyzeHydrology(elev, width, height, opt) {
  const n = width * height;
  const water = new Uint8Array(n);

  // 海：縁につながる 0 以下のマス（縁から塗りつぶす）
  const stack = [];
  for (let x = 0; x < width; x++) {
    stack.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    stack.push(y * width, y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    if (water[i] === SEA || elev[i] > 0) continue;
    water[i] = SEA;
    const x = i % width;
    const y = (i - x) / width;
    for (let d = 0; d < 8; d += 2) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) stack.push(ny * width + nx);
    }
  }

  // 窪地を埋める（海と縁から、低い順に広げる。少しずつ高くして、どのマスも流れ出せるようにする）
  const EPS = 0.001;
  const filled = new Float64Array(n);
  const done = new Uint8Array(n);
  const order = new Int32Array(n);
  let count = 0;
  const heap = createHeap(n);
  for (let i = 0; i < n; i++) {
    const x = i % width;
    const y = (i - x) / width;
    if (water[i] === SEA || x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      filled[i] = water[i] === SEA ? Math.min(0, elev[i]) : elev[i];
      done[i] = 1;
      heap.push(i, filled[i]);
    }
  }
  while (heap.size) {
    const z = heap.topPriority();
    const i = heap.pop();
    order[count++] = i;
    const x = i % width;
    const y = (i - x) / width;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (done[j]) continue;
      done[j] = 1;
      filled[j] = elev[j] > z + EPS ? elev[j] : z + EPS;
      heap.push(j, filled[j]);
    }
  }

  // 流下方向：埋めた面で最も急に下がる向き（海と縁のマスは -1＝流れ出る先）
  const dir = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (water[i] === SEA) continue;
    const x = i % width;
    const y = (i - x) / width;
    let best = -1;
    let bestDrop = 0;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const drop = (filled[i] - filled[ny * width + nx]) / DIST[d];
      if (drop > bestDrop) {
        bestDrop = drop;
        best = d;
      }
    }
    dir[i] = best;
  }

  // 流量の累積（面積 km²）：高い方から順に下流へ足す
  const cellArea = opt.cellKm * opt.cellKm;
  const acc = new Float32Array(n).fill(cellArea);
  for (let k = count - 1; k >= 0; k--) {
    const i = order[k];
    const d = dir[i];
    if (d < 0) continue;
    const x = i % width;
    const j = (i - x) / width * width + DY[d] * width + x + DX[d];
    acc[j] += acc[i];
  }

  // 湖：埋めた深さが 2m を超えるマスのまとまりのうち、6km² 以上のもの（と、縁につながらない 0 以下のマス）
  const minLake = Math.max(4, Math.round(6 / cellArea));
  const seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (seen[i] || water[i] === SEA || filled[i] - elev[i] <= 2) continue;
    const comp = [];
    const st = [i];
    seen[i] = 1;
    while (st.length) {
      const c = st.pop();
      comp.push(c);
      const x = c % width;
      const y = (c - x) / width;
      for (let d = 0; d < 8; d += 2) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (seen[j] || water[j] === SEA || filled[j] - elev[j] <= 2) continue;
        seen[j] = 1;
        st.push(j);
      }
    }
    const isLake = comp.length >= minLake || comp.some((c) => elev[c] <= 0);
    if (isLake) for (const c of comp) water[c] = LAKE;
  }

  // 川：流量がしきい値を超える陸のマス（しきい値は川の多さで 250〜25km²）
  const amount = Math.min(1, Math.max(0, opt.riverAmount));
  const threshold = 250 - 225 * amount;
  const rivers = traceRivers(width, height, water, dir, acc, threshold);
  return { width, height, water, filled, dir, acc, rivers, threshold };
}

/**
 * 川の線をたどる：上流に川が無い川のマスから下流へ、海・湖か、たどり済みの川に合流するまで
 * @returns {Array<{ pts: number[], flow: number[] }>} pts はマスの中心の座標（x, y の並び）、flow は各点の流量（km²）
 */
function traceRivers(width, height, water, dir, acc, threshold) {
  const n = width * height;
  const isRiver = (i) => water[i] === LAND && acc[i] >= threshold;
  // 上流に川のマスがあるか
  const hasUp = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!isRiver(i) || dir[i] < 0) continue;
    const x = i % width;
    const j = (i - x) + DY[dir[i]] * width + x + DX[dir[i]];
    hasUp[j] = 1;
  }
  const visited = new Uint8Array(n);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!isRiver(i) || hasUp[i]) continue;
    const pts = [];
    const flow = [];
    let c = i;
    for (;;) {
      const x = c % width;
      const y = (c - x) / width;
      pts.push(x + 0.5, y + 0.5);
      flow.push(acc[c]);
      if (visited[c] || water[c] !== LAND || dir[c] < 0) break;
      visited[c] = 1;
      c = (y + DY[dir[c]]) * width + x + DX[dir[c]];
    }
    if (pts.length >= 4) out.push({ pts, flow });
  }
  return out;
}
