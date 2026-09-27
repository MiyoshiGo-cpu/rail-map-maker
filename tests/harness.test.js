import { test, assert } from './harness.js';

test('assert.deepEqual：同じ構造なら成功する', () => {
  assert.deepEqual({ a: [1, 2, { b: 'x' }], c: null }, { c: null, a: [1, 2, { b: 'x' }] });
});

test('assert.deepEqual：違いがあれば失敗する', () => {
  assert.throws(() => assert.deepEqual({ a: [1, 2] }, { a: [1, 3] }), /\$\.a\[1\]/);
});

test('assert.close：誤差の範囲', () => {
  assert.close(751.2, 751.5, 1);
  assert.throws(() => assert.close(749, 751.5, 1));
});

test('非同期のテストも動く', async () => {
  const v = await new Promise((r) => setTimeout(() => r(42), 1));
  assert.equal(v, 42);
});
