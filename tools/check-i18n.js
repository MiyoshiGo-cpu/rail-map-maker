// 文言と地域の決まりごとの置き場所を検査する（SPEC §2.6）。
// 使い方：node tools/check-i18n.js     問題があれば一覧を出して終了コード1
//
// 1. js/ui/・js/render/ の文字列リテラル（テンプレートを含む）に日本語が入っていないか（コメントは対象外）
// 2. js/ の地域パック・カタログ以外に、日本固有の値（'JPY'・'jr'）が書かれていないか
// 3. import のパスと HTML の src/href が、実在するファイル名と大文字小文字まで一致するか・/ で始まっていないか
// 4. 開発中の見落とし防止：ui/・render/ で t('…') に渡したキーがカタログにあるか
//
// 行に「i18n-ignore」と書くと、その行の 1 と 2 の検査を飛ばす（表示用でない文字の表などに限って使う）。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JP_RE = /[　-〿぀-ヿ㐀-䶿一-鿿！-｠]/;
const REGION_RE = /(['"`])(JPY|jr)\1/;

/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');

/**
 * JS のソースから文字列リテラルを取り出す（コメントと正規表現リテラルは飛ばす）
 * @param {string} src
 * @returns {{ line: number, text: string }[]}
 */
export function scanLiterals(src) {
  /** @type {{ line: number, text: string }[]} */
  const out = [];
  let i = 0;
  let line = 1;
  let lastSig = ''; // 直前の意味のある文字（正規表現の判定用）
  let lastWord = '';
  const n = src.length;

  const regexAllowedAfter = (ch, word) =>
    ch === '' || '(,=:[!&|?{};+-*%<>~^'.includes(ch) ||
    ['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await'].includes(word);

  function readString(q) {
    const startLine = line;
    let s = '';
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') { s += src[i] + (src[i + 1] || ''); i += 2; continue; }
      if (src[i] === '\n') line++;
      s += src[i++];
    }
    i++;
    out.push({ line: startLine, text: s });
  }

  // テンプレートリテラル。${ } の中はコードとして再帰的に読む
  function readTemplate() {
    let startLine = line;
    let s = '';
    i++;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { s += src[i] + (src[i + 1] || ''); i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        out.push({ line: startLine, text: s });
        s = '';
        i += 2;
        readCode('}');
        i++;
        startLine = line;
        continue;
      }
      if (src[i] === '\n') line++;
      s += src[i++];
    }
    i++;
    out.push({ line: startLine, text: s });
  }

  function readRegex() {
    i++;
    let inClass = false;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') break;
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { i++; break; }
      i++;
    }
    while (i < n && /[a-z]/i.test(src[i])) i++;
  }

  /** @param {string} [until] */
  function readCode(until) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (until && c === until && depth === 0) return;
      if (c === '\n') { line++; i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
        i += 2;
        continue;
      }
      if (c === '"' || c === "'") { readString(c); lastSig = 'a'; lastWord = ''; continue; }
      if (c === '`') { readTemplate(); lastSig = 'a'; lastWord = ''; continue; }
      if (c === '/' && regexAllowedAfter(lastSig, lastWord)) { readRegex(); lastSig = 'a'; lastWord = ''; continue; }
      if (c === '{') depth++;
      if (c === '}') depth--;
      if (/\s/.test(c)) { i++; continue; }
      if (/[A-Za-z0-9_$]/.test(c)) {
        let w = '';
        while (i < n && /[A-Za-z0-9_$]/.test(src[i])) w += src[i++];
        lastWord = w;
        lastSig = 'a';
        continue;
      }
      lastSig = c;
      lastWord = '';
      i++;
    }
  }

  readCode();
  return out;
}

/**
 * 相対パスが大文字小文字まで一致して存在するか
 * @param {string} fromDir
 * @param {string} spec
 */
function existsExact(fromDir, spec) {
  const target = resolve(fromDir, spec.split(/[?#]/)[0]);
  const parts = relative(ROOT, target).split(sep);
  let cur = ROOT;
  for (const part of parts) {
    if (part === '..' || part === '') return false;
    let names;
    try { names = readdirSync(cur); } catch { return false; }
    if (!names.includes(part)) return false;
    cur = join(cur, part);
  }
  return true;
}

async function main() {
  /** @type {string[]} */
  const problems = [];
  const jsFiles = walk(join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
  const otherJs = [...walk(join(ROOT, 'tests')), ...walk(join(ROOT, 'tools'))].filter((f) => f.endsWith('.js'));

  const { default: ja } = await import(pathToFileURL(join(ROOT, 'js/i18n/ja.js')).href);
  const keys = new Set(Object.keys(ja));

  for (const file of jsFiles) {
    const r = rel(file);
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    const isUiOrRender = r.startsWith('js/ui/') || r.startsWith('js/render/');
    const isRegionOrI18n = r.startsWith('js/core/regions/') || r.startsWith('js/i18n/');

    if (isUiOrRender || !isRegionOrI18n) {
      for (const lit of scanLiterals(src)) {
        if (lines[lit.line - 1] && lines[lit.line - 1].includes('i18n-ignore')) continue;
        if (isUiOrRender && JP_RE.test(lit.text)) {
          problems.push(`${r}:${lit.line}  日本語の直書き：${JSON.stringify(lit.text.slice(0, 40))}`);
        }
        if (!isRegionOrI18n && REGION_RE.test(`'${lit.text}'`)) {
          problems.push(`${r}:${lit.line}  日本固有の値は地域パックへ：${JSON.stringify(lit.text)}`);
        }
      }
    }

    if (isUiOrRender) {
      const re = /\bt\(\s*'([\w.]+)'/g;
      let m;
      while ((m = re.exec(src))) {
        if (!keys.has(m[1])) {
          const lineNo = src.slice(0, m.index).split('\n').length;
          problems.push(`${r}:${lineNo}  カタログにないキー：${m[1]}`);
        }
      }
    }
  }

  // import のパス
  const importRe = /(?:\bimport\s*\(\s*|\bfrom\s*|\bimport\s+)(['"])([^'"]+)\1/g;
  for (const file of [...jsFiles, ...otherJs]) {
    const src = readFileSync(file, 'utf8');
    let m;
    while ((m = importRe.exec(src))) {
      const spec = m[2];
      const lineNo = src.slice(0, m.index).split('\n').length;
      if (spec.startsWith('/')) problems.push(`${rel(file)}:${lineNo}  / で始まるパス：${spec}`);
      else if (spec.startsWith('.') && !existsExact(dirname(file), spec)) {
        problems.push(`${rel(file)}:${lineNo}  ファイルがない（大文字小文字を含めて確認）：${spec}`);
      }
    }
  }

  // HTML と CSS の参照
  const htmlFiles = [join(ROOT, 'index.html'), join(ROOT, 'tests/index.html')];
  const cssFiles = walk(join(ROOT, 'css')).filter((f) => f.endsWith('.css'));
  for (const file of [...htmlFiles, ...cssFiles]) {
    const src = readFileSync(file, 'utf8');
    const re = file.endsWith('.css') ? /url\(\s*['"]?([^'")]+)['"]?\s*\)/g : /\b(?:src|href)="([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      if (/^(https?:|data:|mailto:|#)/.test(spec)) continue;
      const lineNo = src.slice(0, m.index).split('\n').length;
      if (spec.startsWith('/')) problems.push(`${rel(file)}:${lineNo}  / で始まるパス：${spec}`);
      else if (!existsExact(dirname(file), spec)) problems.push(`${rel(file)}:${lineNo}  ファイルがない：${spec}`);
    }
  }

  if (problems.length) {
    console.log(problems.join('\n'));
    console.log(`\n${problems.length}件の問題があります。`);
    process.exitCode = 1;
  } else {
    console.log('問題はありません（日本語の直書き 0件・地域の値 0件・パス 0件・未登録キー 0件）。');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
