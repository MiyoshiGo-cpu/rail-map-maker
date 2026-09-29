import { test, assert } from './harness.js';
import { generateElevation, defaultTerrainParams, elevationStats, TERRAIN_SHAPES } from '../js/core/terrain/generate.js';
import { quantizeElevation, encodeElevation, decodeElevation, hashElevation, bytesToBase64, base64ToBytes } from '../js/core/terrain/codec.js';
import { createNoise2D, fbm, ridged } from '../js/core/terrain/noise.js';
import { createRng } from '../js/core/rng.js';

const hashOf = (seed, params, resolution = 64) => hashElevation(quantizeElevation(generateElevation(seed, params, { resolution }).data));

test('地形：同じシードとパラメータなら同じ地形になる（ハッシュが同じ）', () => {
  const p = defaultTerrainParams();
  assert.equal(hashOf('島の鉄道', p), hashOf('島の鉄道', p));
  assert.notEqual(hashOf('島の鉄道', p), hashOf('島の鉄道2', p), 'シードが違えば違う地形');
  assert.notEqual(hashOf('島の鉄道', p), hashOf('島の鉄道', { ...p, ruggedness: 0.9 }), 'パラメータが違えば違う地形');
});

test('地形：決まったシードの結果が変わっていない（どのブラウザでも同じ値になる計算だけを使う）', () => {
  const expected = { archipelago: '3be7a0ca', island: '7b52e1a3', coast: '10feee8b', inland: 'e2224e78' };
  for (const shape of TERRAIN_SHAPES) {
    assert.equal(hashOf('golden', { ...defaultTerrainParams(), shape }), expected[shape], shape);
  }
});

test('地形：陸地の割合はパラメータどおり（海面を分位点で決める）', () => {
  for (const shape of TERRAIN_SHAPES) {
    for (const landRatio of [0.2, 0.35, 0.6]) {
      const el = generateElevation('ratio', { ...defaultTerrainParams(), shape, landRatio }, { resolution: 64 });
      const st = elevationStats(el);
      assert.ok(Math.abs(st.landRatio - landRatio) < 0.01, `${shape} ${landRatio}: ${st.landRatio}`);
      assert.ok(st.max > 1 && st.min < 0);
    }
  }
});

test('地形：プレビュー（少ないマス）と本生成で形がほぼ同じ', () => {
  const p = { ...defaultTerrainParams(), size: 256 };
  const small = generateElevation('preview', p, { resolution: 32 });
  const big = generateElevation('preview', p, { resolution: 128 });
  assert.equal(small.cellKm * 32, big.cellKm * 128, '同じ範囲');
  let agree = 0;
  for (let j = 0; j < 32; j++) {
    for (let i = 0; i < 32; i++) {
      const a = small.data[j * 32 + i] > 0;
      const b = big.data[(j * 4 + 2) * 128 + (i * 4 + 2)] > 0;
      if (a === b) agree++;
    }
  }
  assert.ok(agree / 1024 > 0.85, `陸と海が一致する割合 ${agree / 1024}`);
});

test('地形：標高は Int16 の base64 で保存し、元に戻せる', () => {
  assert.equal(bytesToBase64(new Uint8Array([1, 2, 3, 4])), 'AQIDBA==');
  assert.deepEqual([...base64ToBytes('AQIDBA==')], [1, 2, 3, 4]);
  const q = quantizeElevation([0, 1.4, -1.6, 40000, -40000, 1234.5, -2]);
  assert.deepEqual([...q], [0, 1, -2, 32767, -32768, 1235, -2]);
  const back = decodeElevation(encodeElevation(q), 7, 1);
  assert.deepEqual([...back], [...q]);
  assert.throws(() => decodeElevation(encodeElevation(q), 8, 1));
});

test('ノイズ：シードで決まり、値の範囲はおよそ -1〜1（尾根型は 0〜1）', () => {
  const a = createNoise2D(createRng('n'));
  const b = createNoise2D(createRng('n'));
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 2000; i++) {
    const x = i * 0.137;
    const y = i * 0.071;
    assert.equal(a(x, y), b(x, y));
    const f = fbm(a, x, y, 6);
    min = Math.min(min, f);
    max = Math.max(max, f);
    const r = ridged(a, x, y, 5);
    assert.ok(r >= 0 && r <= 1);
  }
  assert.ok(min > -1.1 && max < 1.1 && max - min > 0.8, `${min} ${max}`);
});
