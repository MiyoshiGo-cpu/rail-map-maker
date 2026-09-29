// 地形データの保存形式（§6.7）：標高（m）を Int16 に丸め、リトルエンディアンのバイト列を base64 にする。
// ハッシュ（FNV-1a 32bit）は、同じシードとパラメータで同じ地形になるかのテストに使う。

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

/**
 * 標高（m）を Int16 に丸める（範囲の外は切る）
 * @param {Float32Array | number[]} data
 * @returns {Int16Array}
 */
export function quantizeElevation(data) {
  const out = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const v = Math.round(data[i]);
    out[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
  }
  return out;
}

/** Int16 の並びをリトルエンディアンのバイト列にする */
function toBytes(int16) {
  const bytes = new Uint8Array(int16.length * 2);
  for (let i = 0; i < int16.length; i++) {
    const v = int16[i] & 0xffff;
    bytes[i * 2] = v & 0xff;
    bytes[i * 2 + 1] = v >>> 8;
  }
  return bytes;
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes) {
  const parts = [];
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    s += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)]
      + (i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=')
      + (i + 2 < bytes.length ? B64[c & 63] : '=');
    // 長い文字列を少しずつつなぐ（大きな地形でも遅くならないように）
    if (s.length >= 8192) {
      parts.push(s);
      s = '';
    }
  }
  parts.push(s);
  return parts.join('');
}

/**
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function base64ToBytes(b64) {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_INDEX[clean.charCodeAt(i)];
    const b = B64_INDEX[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? B64_INDEX[clean.charCodeAt(i + 2)] : 0;
    const d = i + 3 < clean.length ? B64_INDEX[clean.charCodeAt(i + 3)] : 0;
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/**
 * 標高を保存用の文字列にする
 * @param {Int16Array} int16
 */
export function encodeElevation(int16) {
  return bytesToBase64(toBytes(int16));
}

/**
 * 保存用の文字列から標高を戻す（長さが合わなければ例外）
 * @param {string} b64
 * @param {number} width
 * @param {number} height
 * @returns {Int16Array}
 */
export function decodeElevation(b64, width, height) {
  const bytes = base64ToBytes(b64);
  if (bytes.length !== width * height * 2) throw new Error(`elevation size mismatch: ${bytes.length} != ${width * height * 2}`);
  const out = new Int16Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const v = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
    out[i] = v > 32767 ? v - 65536 : v;
  }
  return out;
}

/**
 * Int16 の並びのハッシュ（FNV-1a 32bit、16進数8桁）
 * @param {Int16Array} int16
 */
export function hashElevation(int16) {
  let h = 0x811c9dc5;
  const bytes = toBytes(int16);
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
