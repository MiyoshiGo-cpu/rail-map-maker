// テストの実行器。Node では node:test に登録し、ブラウザでは自前で実行する。
// テストファイルは `import { test, assert } from './harness.js'` だけを使う。

export const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

/** @type {null | ((name: string, fn: () => any) => any)} */
let nodeTest = null;
if (isNode) {
  const mod = await import('node:test');
  nodeTest = mod.test;
}

/** @type {{ file: string, name: string, fn: () => any }[]} */
const registry = [];
let currentFile = '';

/** ブラウザ実行時に、これから読み込むファイル名を記録する */
export function setCurrentFile(name) {
  currentFile = name;
}

/**
 * テストを登録する
 * @param {string} name
 * @param {() => any} fn
 */
export function test(name, fn) {
  if (nodeTest) nodeTest(name, fn);
  else registry.push({ file: currentFile, name, fn });
}

/**
 * 登録済みのテストを順に実行する（ブラウザ用）
 * @param {(r: { file: string, name: string, ok: boolean, error?: any, ms: number }) => void} onResult
 */
export async function runRegistered(onResult) {
  for (const t of registry) {
    const t0 = performance.now();
    try {
      await t.fn();
      onResult({ file: t.file, name: t.name, ok: true, ms: performance.now() - t0 });
    } catch (error) {
      onResult({ file: t.file, name: t.name, ok: false, error, ms: performance.now() - t0 });
    }
  }
}

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

function show(v) {
  try {
    return JSON.stringify(v, (k, x) => (x === undefined ? '<undefined>' : x));
  } catch {
    return String(v);
  }
}

/**
 * 構造の等しさ（プレーンオブジェクト・配列・プリミティブ・型付き配列）
 * @returns {string|null} 違いの場所。等しければ null
 */
function diff(a, b, path = '$') {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b) return `${path}: 型が違う（${typeof a} と ${typeof b}）`;
  if (a === null || b === null || typeof a !== 'object') return `${path}: ${show(a)} と ${show(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: 配列かどうかが違う`;
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (a.length !== b.length) return `${path}.length: ${a.length} と ${b.length}`;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return `${path}[${i}]: ${a[i]} と ${b[i]}`;
    return null;
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}.length: ${a.length} と ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = diff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const ka = Object.keys(a).filter((k) => a[k] !== undefined).sort();
  const kb = Object.keys(b).filter((k) => b[k] !== undefined).sort();
  if (ka.join() !== kb.join()) return `${path}: キーが違う（${ka.join(',')} と ${kb.join(',')}）`;
  for (const k of ka) {
    const d = diff(a[k], b[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

export const assert = {
  ok(value, message) {
    if (!value) throw new AssertionError(message || `真であるべき値：${show(value)}`);
  },
  equal(actual, expected, message) {
    if (!Object.is(actual, expected)) {
      throw new AssertionError(`${message ? message + '：' : ''}期待 ${show(expected)}、実際 ${show(actual)}`);
    }
  },
  notEqual(actual, expected, message) {
    if (Object.is(actual, expected)) {
      throw new AssertionError(`${message ? message + '：' : ''}${show(actual)} 以外であるべき`);
    }
  },
  deepEqual(actual, expected, message) {
    const d = diff(actual, expected);
    if (d) throw new AssertionError(`${message ? message + '：' : ''}${d}`);
  },
  close(actual, expected, eps, message) {
    if (!(Math.abs(actual - expected) <= eps)) {
      throw new AssertionError(`${message ? message + '：' : ''}期待 ${expected}±${eps}、実際 ${actual}`);
    }
  },
  throws(fn, match, message) {
    let threw = false;
    try {
      fn();
    } catch (e) {
      threw = true;
      if (match instanceof RegExp && !match.test(String(e && e.message))) {
        throw new AssertionError(`${message ? message + '：' : ''}例外の内容が違う：${e && e.message}`);
      }
      if (typeof match === 'function' && !(e instanceof match)) {
        throw new AssertionError(`${message ? message + '：' : ''}例外の種類が違う：${e && e.name}`);
      }
    }
    if (!threw) throw new AssertionError(message || '例外が起きるべき');
  },
};
