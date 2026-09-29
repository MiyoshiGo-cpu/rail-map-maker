// 決定的な擬似乱数（sfc32）。同じシード文字列なら同じ列になる。Math.random は使わない（§6.7）

/**
 * 文字列から 128bit の初期値を作る（cyrb128）
 * @param {string} str
 * @returns {[number, number, number, number]}
 */
function cyrb128(str) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/**
 * @param {string} seed
 */
export function createRng(seed) {
  let [a, b, c, d] = cyrb128(String(seed));
  function next() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  }
  // 最初の数回を捨てて偏りを減らす
  for (let i = 0; i < 12; i++) next();
  return {
    /** 0 以上 1 未満 */
    next,
    /** min 以上 max 以下の整数 */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** @template T @param {T[]} arr @returns {T} */
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
  };
}
