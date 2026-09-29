import { test, assert } from './harness.js';
import { normalizeForSearch, stationMatchScore, matchesAny } from '../js/core/search.js';
import { kmToUnit, unitToKm, round1 } from '../js/core/units.js';

test('検索：カタカナとひらがな・大文字小文字・マクロン・区切りの違いを無視する', () => {
  assert.equal(normalizeForSearch('シン・オオサカ'), normalizeForSearch('しんおおさか'));
  assert.equal(normalizeForSearch('Tōkyō'), 'tokyo');
  assert.equal(normalizeForSearch('Shin-Osaka'), 'shinosaka');
  assert.equal(normalizeForSearch('ＡＢ０１'), 'ab01');
  // 濁点は消さない
  assert.notEqual(normalizeForSearch('がっこう'), normalizeForSearch('かっこう'));
});

test('検索：駅名・よみ・英字・駅番号で見つかり、完全一致ほど上位', () => {
  const st = { name: '新橋', reading: 'しんばし', names: { en: 'Shimbashi' }, code3: 'SMB' };
  assert.equal(stationMatchScore(st, normalizeForSearch('新橋')), 0);
  assert.equal(stationMatchScore(st, normalizeForSearch('シンバ')), 1);
  assert.equal(stationMatchScore(st, normalizeForSearch('mbash')), 2);
  assert.equal(stationMatchScore(st, normalizeForSearch('ab03'), ['AB03']), 0);
  assert.equal(stationMatchScore(st, normalizeForSearch('大阪')), -1);
  assert.equal(matchesAny(normalizeForSearch('ライン'), ['湾岸ライン', undefined]), true);
});

test('距離の単位：km とマイルの換算と0.1単位の丸め', () => {
  assert.close(kmToUnit(16.09344, 'mi'), 10, 1e-9);
  assert.close(unitToKm(10, 'mi'), 16.09344, 1e-9);
  assert.equal(kmToUnit(5, 'km'), 5);
  assert.equal(round1(3.14159), 3.1);
  assert.equal(round1(-0.04), 0);
});
