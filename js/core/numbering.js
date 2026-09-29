// 駅ナンバリング（§6.2）
// ・auto：常に連番で振り直す（起点から。fromEnd なら終点側から）
// ・fixed：確定した番号（LineStop.number）を保持する。番号は「番号の部分」だけを持つ（例 '05'、'05-1'）
// ・環状線は起点の駅から一周分を振る
// ・記号（prefix）が空なら路線記号を使う

/** @typedef {import('./schema.js').Line} Line */
/** @typedef {import('./schema.js').NumberingRule} NumberingRule */

/**
 * 番号の部分を書式どおりにする（digits 1 ならゼロ埋めしない）
 * @param {NumberingRule} rule
 * @param {number} n
 */
export function formatNumber(rule, n) {
  if (n < 0) return '';
  return String(n).padStart(Math.max(1, rule.digits), '0');
}

/** @param {Line} line */
export function prefixOf(line) {
  return line.numbering.prefix || line.symbol || '';
}

/**
 * 自動の連番（番号の部分）
 * @param {Line} line
 * @returns {string[]}
 */
export function autoNumbers(line) {
  const r = line.numbering;
  const n = line.stops.length;
  return line.stops.map((_, i) => formatNumber(r, r.start + (r.fromEnd ? n - 1 - i : i) * r.step));
}

/**
 * 路線の駅ごとの番号の部分。付けない設定なら空文字
 * @param {Line} line
 * @returns {string[]}
 */
export function stopNumbers(line) {
  if (!line.numbering.enabled) return line.stops.map(() => '');
  if (line.numbering.mode === 'fixed') return line.stops.map((s) => s.number || '');
  return autoNumbers(line);
}

/**
 * 記号と番号をつないだ駅番号（例：AB01、A-01）。番号が空なら空文字
 * @param {Line} line
 * @param {string} number
 */
export function fullCode(line, number) {
  if (!number) return '';
  const p = prefixOf(line);
  return p ? p + line.numbering.separator + number : number;
}

/** 番号の部分の主番号（'05-1' → 5）。読めなければ NaN */
export function mainNumber(number) {
  return parseInt(String(number || '').split('-')[0], 10);
}

/**
 * 枝番：前の駅の番号に「-1」「-2」…を付ける（使われていない最小のもの）
 * @param {string} prev 前の駅の番号の部分
 * @param {Set<string>} used
 */
export function branchNumber(prev, used) {
  if (!prev) return '';
  for (let k = 1; k < 100; k++) {
    const c = `${prev}-${k}`;
    if (!used.has(c)) return c;
  }
  return '';
}

/**
 * 端に駅を足したときの番号（fixed のとき）。終点側は次の番号、起点側は前の番号
 * @param {Line} line 足す前の路線
 * @param {boolean} atStart
 */
export function numberForEnd(line, atStart) {
  const r = line.numbering;
  if (!line.stops.length) return formatNumber(r, r.start);
  const edge = atStart ? line.stops[0] : line.stops[line.stops.length - 1];
  const m = mainNumber(edge.number);
  if (Number.isNaN(m)) return '';
  // fromEnd なら並びと番号の増える向きが逆
  const dir = (atStart ? -1 : 1) * (r.fromEnd ? -1 : 1);
  return formatNumber(r, m + dir * r.step);
}

/**
 * 同じ路線の中で重なっている番号
 * @param {Line} line
 * @returns {string[]}
 */
export function duplicateNumbers(line) {
  const seen = new Set();
  const dup = new Set();
  for (const n of stopNumbers(line)) {
    if (!n) continue;
    if (seen.has(n)) dup.add(n);
    seen.add(n);
  }
  return [...dup];
}

/**
 * 駅が持つ駅番号の一覧（通る路線ごと。並び順の順）
 * @param {import('./schema.js').Project} p
 * @param {string} stationId
 * @returns {{ line: Line, prefix: string, number: string, code: string }[]}
 */
export function stationNumbers(p, stationId) {
  const out = [];
  for (const line of [...p.lines].sort((a, b) => a.order - b.order)) {
    if (!line.numbering.enabled) continue;
    const i = line.stops.findIndex((s) => s.stationId === stationId);
    if (i < 0) continue;
    const number = stopNumbers(line)[i];
    if (!number) continue;
    out.push({ line, prefix: prefixOf(line), number, code: fullCode(line, number) });
  }
  return out;
}
