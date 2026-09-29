// §6.1 の必須のテストケースと設定ごとの違い
import { test, assert } from './harness.js';
import { romanize, toHiragana } from '../js/core/romaji.js';

const CASES = [
  ['しんじゅく', 'Shinjuku'],
  ['しんばし', 'Shimbashi'],
  ['とうきょう', 'Tokyo'],
  ['おおさか', 'Osaka'],
  ['しん・おおさか', 'Shin-osaka'],
  ['じゆうがおか', 'Jiyugaoka'],
  ['ぎょうとく', 'Gyotoku'],
  ['いいだばし', 'Iidabashi'],
  ['めいじじんぐう・まえ', 'Meijijingu-mae'],
  ['まっちゃまち', 'Matchamachi'],
  ['かんい', "Kan'i"],
];

for (const [reading, expected] of CASES) {
  test(`英字（既定）：${reading} → ${expected}`, () => {
    assert.equal(romanize(reading), expected);
  });
}

test('英字：撥音を常に n にする設定', () => {
  assert.equal(romanize('しんばし', { nBeforeBmp: 'n' }), 'Shinbashi');
});

test('英字：長音をマクロンにする設定', () => {
  assert.equal(romanize('とうきょう', { longVowel: 'macron' }), 'Tōkyō');
  assert.equal(romanize('おおさか', { longVowel: 'macron' }), 'Ōsaka');
});

test('英字：長音をそのまま書く設定', () => {
  assert.equal(romanize('とうきょう', { longVowel: 'keep' }), 'Toukyou');
});

test('英字：ハイフンの後を大文字にする設定', () => {
  assert.equal(romanize('しん・おおさか', { capitalizeAfterHyphen: true }), 'Shin-Osaka');
});

test('英字：カタカナのよみと長音記号', () => {
  assert.equal(toHiragana('シンバシ'), 'しんばし');
  assert.equal(romanize('シンジュク'), 'Shinjuku');
  assert.equal(romanize('ビール'), 'Biru');
  assert.equal(romanize('ビール', { longVowel: 'keep' }), 'Biiru');
});

test('英字：空白の後の語は大文字で始める', () => {
  assert.equal(romanize('みなと みらい'), 'Minato Mirai');
});

test('英字：「えい」「いい」は長音にしない', () => {
  assert.equal(romanize('めいじ'), 'Meiji');
  assert.equal(romanize('にいがた'), 'Niigata');
});

test('英字：ん＋ヤ行は n\'', () => {
  assert.equal(romanize('かんよう'), "Kan'yo");
});

test('英字：空や変換できない文字だけなら空文字', () => {
  assert.equal(romanize(''), '');
  assert.equal(romanize('漢字'), '');
});

test('駅：よみを入れると英字が自動で入り、規則を変えるとまとめて作り直す（1手で戻せる）', async () => {
  const { newStore } = await import('./helpers.js');
  const store = newStore();
  const a = store.dispatch({ type: 'station/add', x: 0, y: 0, fields: { name: '東京', reading: 'とうきょう' } });
  const b = store.dispatch({ type: 'station/add', x: 1, y: 0 });
  store.dispatch({ type: 'station/update', stationId: b, fields: { name: '新橋', reading: 'しんばし' } });
  const en = (id) => store.getState().stations.find((s) => s.id === id).names.en;
  assert.equal(en(a), 'Tokyo');
  assert.equal(en(b), 'Shimbashi');
  store.dispatch({ type: 'project/romaji', fields: { longVowel: 'macron', nBeforeBmp: 'n' } });
  assert.equal(en(a), 'Tōkyō');
  assert.equal(en(b), 'Shinbashi');
  store.undo();
  assert.equal(en(a), 'Tokyo');
  assert.equal(en(b), 'Shimbashi');
});

test('駅：自動生成を切った駅の英字は変えない', async () => {
  const { newStore } = await import('./helpers.js');
  const store = newStore();
  const a = store.dispatch({ type: 'station/add', x: 0, y: 0, fields: { reading: 'しんばし' } });
  store.dispatch({ type: 'station/update', stationId: a, fields: { autoRomanize: false, names: { en: 'Shin-bashi' } } });
  store.dispatch({ type: 'station/update', stationId: a, fields: { reading: 'しんばし・えき' } });
  store.dispatch({ type: 'project/romaji', fields: { nBeforeBmp: 'n' } });
  assert.equal(store.getState().stations[0].names.en, 'Shin-bashi');
});
