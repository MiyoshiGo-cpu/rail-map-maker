// 検索・絞り込み：漢字・よみ・英字で探せるように表記をそろえる
// （全角半角・大文字小文字・カタカナとひらがな・マクロンの有無・区切り記号の違いを無視する）

/**
 * @param {string} s
 */
export function normalizeForSearch(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .normalize('NFC')
    .replace(/[\s\u30FB\u00B7\-'.,]/g, '');
}

/**
 * 駅が検索語に当てはまるか。当てはまれば順位の点（小さいほど良い）、当てはまらなければ -1
 * @param {import('./schema.js').Station} st
 * @param {string} q normalizeForSearch 済みの検索語
 * @param {string[]} [codes] 駅番号（例：AB01）
 */
export function stationMatchScore(st, q, codes = []) {
  if (!q) return 0;
  const fields = [st.name, st.reading, ...Object.values(st.names || {}), st.subName, st.code3, ...codes];
  let best = -1;
  for (const f of fields) {
    const n = normalizeForSearch(f);
    if (!n) continue;
    let score = -1;
    if (n === q) score = 0;
    else if (n.startsWith(q)) score = 1;
    else if (n.includes(q)) score = 2;
    if (score >= 0 && (best < 0 || score < best)) best = score;
  }
  return best;
}

/**
 * 文字列のどれかに検索語が含まれるか
 * @param {string} q normalizeForSearch 済みの検索語
 * @param {(string|undefined)[]} texts
 */
export function matchesAny(q, texts) {
  if (!q) return true;
  return texts.some((t) => normalizeForSearch(t).includes(q));
}
