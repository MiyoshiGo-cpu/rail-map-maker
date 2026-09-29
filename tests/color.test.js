// 色（§6.6 の似た色の警告に使う CIEDE2000、16進数の扱い）
import { test, assert } from './harness.js';
import { ciede2000, hexToLab, colorDistance, normalizeHex, mix, toGray } from '../js/core/color.js';
import { runChecks } from '../js/core/validate.js';
import { newStore } from './helpers.js';

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('色：CIEDE2000 は Sharma ほか（2005）の検算表の値と一致する', () => {
  // [L1, a1, b1, L2, a2, b2, ΔE00]
  const table = [
    [50.0000, 2.6772, -79.7751, 50.0000, 0.0000, -82.7485, 2.0425],
    [50.0000, 3.1571, -77.2803, 50.0000, 0.0000, -82.7485, 2.8615],
    [50.0000, 0.0000, 0.0000, 50.0000, -1.0000, 2.0000, 2.3669],
    [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0009, 7.1792],
    [50.0000, 2.5000, 0.0000, 73.0000, 25.0000, -18.0000, 27.1492],
    [50.0000, 2.5000, 0.0000, 56.0000, -27.0000, -3.0000, 31.9030],
    [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
    [22.7233, 20.0904, -46.6940, 23.0331, 14.9730, -42.5619, 2.0373],
    [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  ];
  for (const [L1, a1, b1, L2, a2, b2, expected] of table) {
    near(ciede2000([L1, a1, b1], [L2, a2, b2]), expected, 1e-4);
    near(ciede2000([L2, a2, b2], [L1, a1, b1]), expected, 1e-4);
  }
});

test('色：16進数から L*a*b* に変換する（白・黒・同じ色）', () => {
  const [L, a, b] = hexToLab('#FFFFFF');
  near(L, 100, 1e-3);
  near(a, 0, 1e-2);
  near(b, 0, 1e-2);
  near(hexToLab('#000000')[0], 0, 1e-6);
  assert.equal(colorDistance('#0079C2', '#0079C2'), 0);
  // 似た青と、はっきり違う色
  assert.ok(colorDistance('#0079C2', '#0A7FC5') < 10);
  assert.ok(colorDistance('#0079C2', '#E8541E') > 30);
});

test('色：16進数の正規化・混ぜる・灰色にする', () => {
  assert.equal(normalizeHex('abc'), '#AABBCC');
  assert.equal(normalizeHex('#12ab9F'), '#12AB9F');
  assert.equal(normalizeHex('zz'), null);
  assert.equal(mix('#FF0000', '#0000FF', 0), '#FF0000');
  assert.equal(toGray('#808080'), '#808080');
});

test('チェック：同じ駅を通る路線どうしのラインカラーが似すぎていたら警告（路線の組ごとに1回）', () => {
  const store = newStore();
  const d = (a) => store.dispatch(a);
  const s = [[0, 0], [4, 0], [8, 0], [4, 4]].map(([x, y]) => d({ type: 'station/add', x, y, fields: { name: 'え', reading: 'え' } }));
  d({ type: 'line/add', fields: { color: '#0079C2' }, stationIds: [s[0], s[1], s[2]] });
  const b = d({ type: 'line/add', fields: { color: '#0A7FC5' }, stationIds: [s[1], s[2], s[3]] });
  const codes = () => runChecks(store.getState()).filter((c) => c.code === 'similarLineColors');
  assert.equal(codes().length, 1);
  assert.equal(codes()[0].level, 'warning');
  assert.deepEqual(codes()[0].target, { type: 'line', id: b });
  d({ type: 'line/update', lineId: b, fields: { color: '#E8541E' } });
  assert.equal(codes().length, 0);
});
