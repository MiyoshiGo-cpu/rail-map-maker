// イミュータブルな状態へのパッチ適用と、逆パッチの記録。
// パッチ操作は3種類：
//   { op: 'set', path, value }            value が undefined ならキーを消す
//   { op: 'insert', path, index, value }  path は配列を指す
//   { op: 'remove', path, index }
// 状態は書き換えず、変わった経路だけを複製する（構造の共有）。

/** @typedef {(string|number)[]} Path */
/** @typedef {{ op: 'set', path: Path, value: any } | { op: 'insert', path: Path, index: number, value: any } | { op: 'remove', path: Path, index: number }} PatchOp */

/**
 * @param {any} obj
 * @param {Path} path
 */
export function getIn(obj, path) {
  let o = obj;
  for (const k of path) {
    if (o === null || o === undefined) return undefined;
    o = o[k];
  }
  return o;
}

/**
 * 経路の先を fn で置き換えた新しいオブジェクトを返す
 * @param {any} obj
 * @param {Path} path
 * @param {number} i
 * @param {(v: any) => any} fn
 */
function updateIn(obj, path, i, fn) {
  if (i === path.length) return fn(obj);
  const k = path[i];
  if (obj === null || typeof obj !== 'object') {
    throw new Error(`patch: path not found at ${path.slice(0, i + 1).join('.')}`);
  }
  const next = updateIn(obj[k], path, i + 1, fn);
  if (Array.isArray(obj)) {
    if (typeof k !== 'number' || k < 0 || k >= obj.length) throw new Error(`patch: bad index ${path.slice(0, i + 1).join('.')}`);
    if (next === undefined) throw new Error('patch: cannot set undefined in array');
    const copy = obj.slice();
    copy[k] = next;
    return copy;
  }
  const copy = { ...obj };
  if (next === undefined) delete copy[k];
  else copy[k] = next;
  return copy;
}

/**
 * 1つの操作を当て、新しい状態と逆操作を返す
 * @param {any} state
 * @param {PatchOp} op
 * @returns {[any, PatchOp]}
 */
export function applyOp(state, op) {
  if (op.op === 'set') {
    const old = getIn(state, op.path);
    const next = updateIn(state, op.path, 0, () => op.value);
    return [next, { op: 'set', path: op.path, value: old }];
  }
  if (op.op === 'insert') {
    let inv = null;
    const next = updateIn(state, op.path, 0, (a) => {
      if (!Array.isArray(a)) throw new Error(`patch: not an array at ${op.path.join('.')}`);
      if (op.index < 0 || op.index > a.length) throw new Error('patch: insert index out of range');
      const copy = a.slice();
      copy.splice(op.index, 0, op.value);
      return copy;
    });
    inv = { op: 'remove', path: op.path, index: op.index };
    return [next, inv];
  }
  if (op.op === 'remove') {
    let removed;
    const next = updateIn(state, op.path, 0, (a) => {
      if (!Array.isArray(a)) throw new Error(`patch: not an array at ${op.path.join('.')}`);
      if (op.index < 0 || op.index >= a.length) throw new Error('patch: remove index out of range');
      const copy = a.slice();
      removed = copy.splice(op.index, 1)[0];
      return copy;
    });
    return [next, { op: 'insert', path: op.path, index: op.index, value: removed }];
  }
  throw new Error(`patch: unknown op ${/** @type {any} */ (op).op}`);
}

/**
 * 操作の列を順に当てる
 * @param {any} state
 * @param {PatchOp[]} ops
 */
export function applyOps(state, ops) {
  let s = state;
  for (const op of ops) s = applyOp(s, op)[0];
  return s;
}

/**
 * 変更を記録しながら状態を作り変えるトランザクション。
 * アクションはこの上で set / insert / remove を呼ぶ。
 * @param {any} state
 */
export function createTx(state) {
  let cur = state;
  /** @type {PatchOp[]} */
  const ops = [];
  /** @type {PatchOp[]} */
  const inverse = [];

  /** @param {PatchOp} op */
  function run(op) {
    const [next, inv] = applyOp(cur, op);
    cur = next;
    ops.push(op);
    inverse.push(inv);
  }

  return {
    get state() { return cur; },
    ops,
    inverse,
    /** @param {Path} path */
    get(path) { return getIn(cur, path); },
    /** @param {Path} path @param {any} value */
    set(path, value) {
      if (Object.is(getIn(cur, path), value)) return;
      run({ op: 'set', path, value });
    },
    /** @param {Path} path @param {number} index @param {any} value */
    insert(path, index, value) { run({ op: 'insert', path, index, value }); },
    /** @param {Path} path @param {any} value */
    push(path, value) { run({ op: 'insert', path, index: getIn(cur, path).length, value }); },
    /** @param {Path} path @param {number} index */
    remove(path, index) { run({ op: 'remove', path, index }); },
    /**
     * オブジェクトの複数のキーを書き換える（undefined はキーを消す）
     * @param {Path} path @param {Record<string, any>} fields
     */
    merge(path, fields) {
      for (const [k, v] of Object.entries(fields)) this.set([...path, k], v);
    },
    /**
     * コレクション（'stations' など）の中の ID の位置
     * @param {string} collection @param {string} id
     */
    indexOf(collection, id) {
      return cur[collection].findIndex((x) => x.id === id);
    },
    /**
     * ID の要素を返す（無ければ例外）
     * @param {string} collection @param {string} id
     */
    find(collection, id) {
      const i = this.indexOf(collection, id);
      if (i < 0) throw new Error(`${collection}: ${id} not found`);
      return cur[collection][i];
    },
  };
}

/** @typedef {ReturnType<typeof createTx>} Tx */
