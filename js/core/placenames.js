// 地名の生成（§6.8）：「前の要素＋後ろの要素」。要素と連濁の表は地域パック（regions/jp-placenames.js）。
// 地形で後ろの要素の出やすさを変え、連濁と接頭語は確率で入れる。同じ地図の中で同じ名前は作らない。

/** @typedef {import('./schema.js').PlaceNameStyle} PlaceNameStyle */
/** @typedef {'coast'|'river'|'mountain'|'plain'} PlaceTerrain */

/**
 * @param {{ next: () => number }} rng
 * @param {PlaceNameStyle} style
 * @param {Iterable<string>} [taken] すでにある名前（重ねない）
 */
export function createPlaceNamer(rng, style, taken = []) {
  const used = new Set(taken);
  const pick = (arr) => arr[Math.floor(rng.next() * arr.length)];

  /** 連濁：後ろの要素に濁った音がなければ、最初の音を濁らせる */
  function joinReading(head, tail) {
    const first = tail[0];
    const hasVoiced = [...tail].some((ch) => style.voiced.includes(ch));
    if (!hasVoiced && style.rendaku[first] && rng.next() < style.rendakuRate) return head + style.rendaku[first] + tail.slice(1);
    return head + tail;
  }

  return {
    /**
     * 新しい地名
     * @param {PlaceTerrain} terrain
     * @returns {{ name: string, reading: string }}
     */
    name(terrain) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const head = pick(style.heads);
        const list = rng.next() < 0.7 && style.tails[terrain] ? style.tails[terrain] : style.tails.any;
        const tail = pick(list);
        if (head.k === tail.k) continue;
        let name = head.k + tail.k;
        let reading = joinReading(head.r, tail.r);
        if (rng.next() < style.prefixRate) {
          const pre = pick(style.prefixes);
          name = pre.k + name;
          reading = pre.r + reading;
        }
        if (used.has(name)) continue;
        used.add(name);
        return { name, reading };
      }
      // 組み合わせが尽きたとき（ふつうは起きない）は3つつなぐ
      for (;;) {
        const a = pick(style.heads);
        const b = pick(style.heads);
        const c = pick(style.tails.any);
        const name = a.k + b.k + c.k;
        if (used.has(name)) continue;
        used.add(name);
        return { name, reading: a.r + b.r + c.r };
      }
    },
    /** @param {string} name */
    has: (name) => used.has(name),
    /** @param {string} name */
    add: (name) => used.add(name),
  };
}
