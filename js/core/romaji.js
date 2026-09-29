// よみ（ひらがな。カタカナは変換）から修正ヘボン式の英字を作る（§6.1）
// ・拗音など2文字を先に照合する最長一致
// ・長音：「おう」「おお」「うう」（拗音を含む）と「ー」。既定は省略、設定でマクロン・そのまま
// ・撥音：既定は b・m・p の前で m。母音とヤ行の前は n'
// ・促音：次の子音を重ねる。ch の前は t
// ・区切り：「・」はハイフン、空白は空白。先頭は大文字。ハイフン後は既定で小文字、空白の後は大文字

/** @typedef {import('./schema.js').RomajiSettings} RomajiSettings */

/** 2文字の組（拗音・外来音） */
const DIGRAPHS = {
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo', 'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho', 'しぇ': 'she', 'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo', 'じぇ': 'je',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho', 'ちぇ': 'che', 'ぢゃ': 'ja', 'ぢゅ': 'ju', 'ぢょ': 'jo',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo', 'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo', 'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo', 'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo', 'ふゅ': 'fyu',
  'てぃ': 'ti', 'でぃ': 'di', 'とぅ': 'tu', 'どぅ': 'du', 'でゅ': 'dyu',
  'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo', 'いぇ': 'ye',
  'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo',
  'つぁ': 'tsa', 'つぃ': 'tsi', 'つぇ': 'tse', 'つぉ': 'tso',
  'くぁ': 'kwa', 'ぐぁ': 'gwa',
};

/** 1文字 */
const MONOGRAPHS = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'o', 'ゔ': 'vu',
  'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ゎ': 'wa',
};

const N = 'ん';
const SOKUON = 'っ';
const CHOON = 'ー';
const WORD_SEP = '・';
const MACRON = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };
const VOWELS = 'aiueo';

/** カタカナをひらがなにする（長音記号はそのまま） */
export function toHiragana(s) {
  return s.normalize('NFKC').replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * よみを音の単位に分ける
 * @param {string} s ひらがな
 * @returns {{ kind: 'syl'|'n'|'sokuon'|'choon'|'sep'|'space'|'raw', text: string, roma?: string }[]}
 */
export function tokenize(s) {
  const out = [];
  for (let i = 0; i < s.length;) {
    const two = s.slice(i, i + 2);
    const c = s[i];
    if (DIGRAPHS[two]) {
      out.push({ kind: 'syl', text: two, roma: DIGRAPHS[two] });
      i += 2;
    } else if (MONOGRAPHS[c]) {
      out.push({ kind: 'syl', text: c, roma: MONOGRAPHS[c] });
      i += 1;
    } else if (c === N) { out.push({ kind: 'n', text: c }); i++; }
    else if (c === SOKUON) { out.push({ kind: 'sokuon', text: c }); i++; }
    else if (c === CHOON) { out.push({ kind: 'choon', text: c }); i++; }
    else if (c === WORD_SEP || c === '-') { out.push({ kind: 'sep', text: c }); i++; }
    else if (/\s/.test(c)) { out.push({ kind: 'space', text: ' ' }); i++; }
    else if (/[A-Za-z0-9]/.test(c)) { out.push({ kind: 'raw', text: c, roma: c.toLowerCase() }); i++; }
    else i++; // 変換できない文字は飛ばす
  }
  return out;
}

/** @type {RomajiSettings} */
export const DEFAULT_ROMAJI = { longVowel: 'omit', nBeforeBmp: 'm', capitalizeAfterHyphen: false };

/**
 * よみから英字を作る。作れなければ空文字
 * @param {string} reading
 * @param {Partial<RomajiSettings>} [settings]
 */
export function romanize(reading, settings = {}) {
  const opt = { ...DEFAULT_ROMAJI, ...settings };
  const tokens = tokenize(toHiragana(reading || '').trim());
  /** 語ごとの文字列（区切りは別に持つ） */
  const parts = [];
  let word = '';
  let lastVowel = ''; // 直前の音の母音（語の中だけ）

  const endWord = (sep) => {
    parts.push(word);
    if (sep) parts.push(sep);
    word = '';
    lastVowel = '';
  };
  /**
   * 直前の母音を伸ばす
   * @param {string} v 直前の母音
   * @param {string} keep 「そのまま」のときに足す文字（う→u、お→o、ー→直前の母音）
   */
  const lengthen = (v, keep) => {
    if (opt.longVowel === 'omit') return;
    if (opt.longVowel === 'macron') {
      if (word.endsWith(v)) word = word.slice(0, -1) + MACRON[v];
      return;
    }
    word += keep;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    const next = tokens[i + 1];
    if (tk.kind === 'sep') { endWord('-'); continue; }
    if (tk.kind === 'space') { endWord(' '); continue; }
    if (tk.kind === 'syl') {
      // 長音：「おう」「おお」「うう」
      if ((tk.text === 'う' && (lastVowel === 'o' || lastVowel === 'u')) || (tk.text === 'お' && lastVowel === 'o')) {
        lengthen(lastVowel, tk.roma);
        lastVowel = '';
        continue;
      }
      word += tk.roma;
      lastVowel = tk.roma[tk.roma.length - 1];
      if (!VOWELS.includes(lastVowel)) lastVowel = '';
      continue;
    }
    if (tk.kind === 'choon') {
      if (lastVowel) lengthen(lastVowel, lastVowel);
      lastVowel = '';
      continue;
    }
    if (tk.kind === 'n') {
      const nr = next && next.kind === 'syl' ? next.roma : '';
      if (nr && 'bmp'.includes(nr[0]) && opt.nBeforeBmp === 'm') word += 'm';
      else if (nr && (VOWELS.includes(nr[0]) || nr[0] === 'y')) word += "n'";
      else word += 'n';
      lastVowel = '';
      continue;
    }
    if (tk.kind === 'sokuon') {
      const nr = next && next.kind === 'syl' ? next.roma : '';
      if (nr.startsWith('ch')) word += 't';
      else if (nr && !VOWELS.includes(nr[0]) && nr[0] !== 'n') word += nr[0];
      lastVowel = '';
      continue;
    }
    if (tk.kind === 'raw') {
      word += tk.roma;
      lastVowel = '';
    }
  }
  endWord('');

  // 大文字：先頭と空白の後は大文字。ハイフンの後は設定しだい
  const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : w);
  let out = '';
  let prevSep = null;
  for (const p of parts) {
    if (p === '-' || p === ' ') {
      out += p;
      prevSep = p;
      continue;
    }
    const first = out === '';
    out += first || prevSep === ' ' || (prevSep === '-' && opt.capitalizeAfterHyphen) ? cap(p) : p;
    prevSep = null;
  }
  return out.replace(/\s+/g, ' ').replace(/-+/g, '-').replace(/^[-\s]+|[-\s]+$/g, '');
}
