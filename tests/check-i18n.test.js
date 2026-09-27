// tools/check-i18n.js の字句解析（Node だけ）
import { test, assert, isNode } from './harness.js';

if (isNode) {
  const { scanLiterals } = await import('../tools/check-i18n.js');
  const texts = (src) => scanLiterals(src).map((l) => l.text).filter((s) => s !== '');

  test('check-i18n：コメントの中は対象外', () => {
    assert.deepEqual(texts("// '駅'\n/* \"路線\" */\nconst a = 'x';"), ['x']);
  });

  test('check-i18n：テンプレートリテラルの ${} の中も読む', () => {
    assert.deepEqual(texts('const s = `前${ f("中") }後`;'), ['前', '中', '後']);
  });

  test('check-i18n：正規表現リテラルと割り算を区別する', () => {
    assert.deepEqual(texts("const r = /['\"]/g; const d = a / b / 'c';"), ['c']);
  });

  test('check-i18n：行番号', () => {
    const lits = scanLiterals("\n\nconst a = 'x';");
    assert.equal(lits[0].line, 3);
  });
}
