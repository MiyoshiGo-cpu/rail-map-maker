import { test, assert } from './harness.js';
import { exportSize, fittingScale, MAX_EXPORT_PIXELS, EXPORT_MARGIN } from '../js/core/export-size.js';
import { exportFilename } from '../js/storage/file-io.js';

const box = (w, h) => ({ minX: -10, minY: 5, maxX: -10 + w, maxY: 5 + h });

test('書き出しの大きさ：余白を足して倍率を掛ける', () => {
  const s = exportSize(box(400, 300), 2);
  assert.equal(s.width, (400 + EXPORT_MARGIN * 2) * 2);
  assert.equal(s.height, (300 + EXPORT_MARGIN * 2) * 2);
  assert.equal(s.pixels, s.width * s.height);
  assert.equal(s.fits, true);
});

test('書き出しの大きさ：約1,600万画素を超えたら収まらない', () => {
  // 2000×1500 の絵は、2倍で約1,280万画素、3倍で約2,870万画素
  const b = box(2000 - EXPORT_MARGIN * 2, 1500 - EXPORT_MARGIN * 2);
  assert.equal(exportSize(b, 2).fits, true);
  assert.equal(exportSize(b, 3).fits, false);
  assert.ok(exportSize(b, 3).pixels > MAX_EXPORT_PIXELS);
});

test('倍率を下げる：選べる倍率のうち収まる最大のもの。1倍でも大きければ 0.1 刻み', () => {
  const b = box(2000 - EXPORT_MARGIN * 2, 1500 - EXPORT_MARGIN * 2);
  assert.equal(fittingScale(b), 2);
  assert.equal(fittingScale(box(100, 100)), 4);
  const huge = box(6000, 5000);
  const s = fittingScale(huge);
  assert.ok(s < 1 && s > 0, String(s));
  assert.equal(Math.round(s * 10), s * 10, '0.1 刻み');
  assert.equal(exportSize(huge, s).fits, true);
  assert.equal(exportSize(huge, Math.round((s + 0.1) * 10) / 10).fits, false, 'それより0.1大きいと収まらない');
});

test('倍率を下げる：細長い絵は1辺の上限でも収める', () => {
  const long = box(20000, 100);
  const s = fittingScale(long);
  const size = exportSize(long, s);
  assert.equal(size.fits, true);
  assert.ok(size.width <= 16384);
});

test('書き出すファイル名：拡張子を変えられる', () => {
  const now = new Date(2026, 8, 29, 9, 5);
  assert.equal(exportFilename('湾岸/都市圏', now, '.png'), '湾岸_都市圏_20260929-0905.png');
  assert.equal(exportFilename('湾岸', now), '湾岸_20260929-0905.railmap.json');
});
