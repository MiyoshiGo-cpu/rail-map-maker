import { test, assert } from './harness.js';
import { t, translate, interpolate, mapTranslator, formatDistance, formatNumber, registerCatalog } from '../js/i18n/i18n.js';
import ja from '../js/i18n/ja.js';

test('t()：カタログの文言を返す', () => {
  assert.equal(t('lineKind.subway'), '地下鉄');
});

test('t()：{name} の差し込み', () => {
  assert.equal(t('platform.summary', { faces: 2, tracks: 4 }), '2面4線');
  assert.equal(interpolate('{a}と{b}', { a: 'X' }), 'Xと{b}');
});

test('t()：カタログにないキーはキーをそのまま返す', () => {
  assert.equal(t('no.such.key'), 'no.such.key');
});

test('translate()：ほかの言語に無いキーは日本語で表示する', () => {
  registerCatalog('xx', { 'lineKind.subway': 'Metro-xx' });
  assert.equal(translate('xx', 'lineKind.subway'), 'Metro-xx');
  assert.equal(translate('xx', 'lineKind.tram'), '路面電車');
  assert.equal(translate('xx-YY', 'lineKind.subway'), 'Metro-xx');
});

test('mapTranslator()：地図の言語で定型文を取り出す', () => {
  const mt = mapTranslator('ja');
  assert.equal(mt('map.default.lineName', { n: 3 }), '路線3');
});

test('formatDistance()：km とマイル、0.1単位', () => {
  assert.equal(formatDistance(12.345, 'km', 'ja'), '12.3 km');
  assert.equal(formatDistance(1.609344 * 10, 'mi', 'ja'), '10.0 mi');
});

test('formatNumber()：Intl で桁区切り', () => {
  assert.equal(formatNumber(1234567, undefined, 'ja'), '1,234,567');
});

test('カタログの値はすべて文字列', () => {
  for (const [k, v] of Object.entries(ja)) assert.equal(typeof v, 'string', k);
});
