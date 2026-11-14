// 地形ブラシ（§6.7）：盛る・削る・平らに・なめらかに・陸・海・川、編集の当て直し、都市のアクション
import { test, assert } from './harness.js';
import { applyStroke, applyEdits, strokeMask, pathCells, normalizeStroke, RAISE_M, RIVER_DEPTH } from '../js/core/terrain/brush.js';
import { analyzeHydrology, LAND, SEA } from '../js/core/terrain/hydrology.js';
import { generateWorld, loadWorld, newCityAt, cityKindOf } from '../js/core/terrain/world.js';
import { encodeElevation } from '../js/core/terrain/codec.js';
import { defaultTerrainParams } from '../js/core/terrain/generate.js';
import { getRegion } from '../js/core/regions/index.js';
import { newStore, strip } from './helpers.js';

const jp = getRegion('jp');
const W = 40;
const H = 40;
const CELL = 0.5;

/** 一面が同じ高さの地形 */
const flat = (v) => new Int16Array(W * H).fill(v);
const at = (e, x, y) => e[y * W + x];
/** マス (x, y) の中心（km） */
const km = (x, y) => [(x + 0.5) * CELL, (y + 0.5) * CELL];

test('ブラシ：盛る・削るは中心ほど強く、範囲の外は変えない', () => {
  const e = flat(100);
  applyStroke(e, W, H, CELL, { tool: 'raise', r: 3, s: 1, pts: km(20, 20) });
  assert.equal(at(e, 20, 20), 100 + RAISE_M);
  assert.ok(at(e, 22, 20) > 100 && at(e, 22, 20) < 100 + RAISE_M, '中ほど');
  assert.equal(at(e, 27, 20), 100, '半径（6マス）の外');
  const d = flat(100);
  applyStroke(d, W, H, CELL, { tool: 'lower', r: 3, s: 0.5, pts: km(20, 20) });
  assert.equal(at(d, 20, 20), 100 - RAISE_M / 2);
});

test('ブラシ：なぞった線に沿って塗る（重なった所を重ねて強くしない）', () => {
  const e = flat(0);
  applyStroke(e, W, H, CELL, { tool: 'raise', r: 1, s: 1, pts: [...km(5, 10), ...km(30, 10)] });
  for (let x = 5; x <= 30; x++) assert.equal(at(e, x, 10), RAISE_M, `x=${x}`);
  assert.equal(at(e, 18, 14), 0, '線から2km 離れた所');
  const m = strokeMask({ tool: 'raise', r: 1, s: 1, pts: km(5, 10) }, W, H, CELL);
  assert.ok(m && m.bw <= 6 && m.bh <= 6);
});

test('ブラシ：平らには、なぞり始めの高さに近づける。なめらかには凸凹を減らす', () => {
  const e = new Int16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) e[y * W + x] = x * 10;
  applyStroke(e, W, H, CELL, { tool: 'flatten', r: 2, s: 1, pts: [...km(20, 20), ...km(23, 20)] });
  assert.equal(at(e, 21, 20), 200);
  assert.equal(at(e, 23, 20), 200);
  // 市松模様をなめらかにする
  const c = new Int16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c[y * W + x] = (x + y) % 2 ? 100 : 0;
  const spread = (a) => Math.max(...[19, 20, 21].map((x) => at(a, x, 20))) - Math.min(...[19, 20, 21].map((x) => at(a, x, 20)));
  const before = spread(c);
  applyStroke(c, W, H, CELL, { tool: 'smooth', r: 3, s: 1, pts: km(20, 20) });
  assert.ok(spread(c) < before / 3, `${spread(c)} / ${before}`);
});

test('ブラシ：陸にするは範囲の中を 2m 以上に、海にするは -2m 以下にする', () => {
  const e = flat(-50);
  applyStroke(e, W, H, CELL, { tool: 'land', r: 3, s: 1, pts: km(20, 20) });
  for (let x = 15; x <= 25; x++) assert.ok(at(e, x, 20) >= 2, `x=${x} ${at(e, x, 20)}`);
  assert.equal(at(e, 27, 20), -50);
  const s = flat(300);
  applyStroke(s, W, H, CELL, { tool: 'sea', r: 3, s: 1, pts: km(20, 20) });
  for (let x = 15; x <= 25; x++) assert.ok(at(s, x, 20) <= -2, `x=${x}`);
  // もともと深い所は浅くしない
  const deep = flat(-500);
  applyStroke(deep, W, H, CELL, { tool: 'sea', r: 3, s: 1, pts: km(20, 20) });
  assert.equal(at(deep, 20, 20), -500);
});

test('ブラシ：なぞった道筋のマスは8方向でつながり、戻った輪は外す', () => {
  const cells = pathCells([...km(2, 2), ...km(8, 5)], W, H, CELL);
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1];
    const b = cells[i];
    assert.ok(Math.abs((a % W) - (b % W)) <= 1 && Math.abs(Math.floor(a / W) - Math.floor(b / W)) <= 1);
  }
  assert.equal(cells[0], 2 * W + 2);
  assert.equal(cells[cells.length - 1], 5 * W + 8);
  // 行って戻る：輪を外して、戻った所で終わる
  const back = pathCells([...km(2, 2), ...km(6, 2), ...km(4, 2)], W, H, CELL);
  assert.deepEqual(back, [2 * W + 2, 2 * W + 3, 2 * W + 4]);
});

test('ブラシ：川は高い方から掘り、描いた道筋に沿って海まで川になる', () => {
  // 西が海、東へ高くなる斜面。北東から南西へ斜めに川を描く（下流から上流へなぞっても向きは高い方から）
  const e = new Int16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) e[y * W + x] = x < 3 ? -20 : x * 8;
  const base = Int16Array.from(e);
  const ch = applyStroke(e, W, H, CELL, { tool: 'river', r: 1, s: 1, pts: [...km(4, 30), ...km(30, 6)] });
  assert.ok(ch && ch.length > 20);
  assert.equal(ch[0] % W, 30, '高い東の端から');
  // 下り続ける溝
  for (let i = 1; i < ch.length; i++) assert.ok(e[ch[i]] < e[ch[i - 1]], `${i}`);
  assert.ok(e[ch[0]] <= base[ch[0]] - RIVER_DEPTH);
  // 陸は陸のまま
  for (const c of ch) assert.ok(e[c] > 0);
  // 水系：道筋がすべて川（流量がしきい値以上）で、海に出る
  const hy = analyzeHydrology(e, W, H, { cellKm: CELL, riverAmount: 0, channels: [ch] });
  for (const c of ch) {
    assert.equal(hy.water[c], LAND);
    assert.ok(hy.acc[c] >= hy.threshold, `マス ${c}`);
  }
  // 描かなければ、この小さな地形に川はできない
  const none = analyzeHydrology(e, W, H, { cellKm: CELL, riverAmount: 0 });
  assert.ok(ch.every((c) => none.acc[c] < none.threshold));
  // 最後のマスから先は海へ流れる
  let c = ch[ch.length - 1];
  const DX = [1, 1, 0, -1, -1, -1, 0, 1];
  const DY = [0, 1, 1, 1, 0, -1, -1, -1];
  for (let k = 0; k < 100 && hy.dir[c] >= 0; k++) c = (Math.floor(c / W) + DY[hy.dir[c]]) * W + (c % W) + DX[hy.dir[c]];
  assert.equal(hy.water[c], SEA);
});

test('ブラシ：編集は元の標高を変えずに順に当て、同じ編集なら同じ結果になる', () => {
  const base = flat(50);
  const edits = [
    { tool: 'raise', r: 2, s: 1, pts: km(10, 10) },
    { tool: 'smooth', r: 2, s: 0.5, pts: km(11, 10) },
    { tool: 'sea', r: 1, s: 1, pts: km(30, 30) },
    { tool: 'city', r: 1, s: 1, pts: km(5, 5) }, // 地形は変えない
  ];
  const a = applyEdits(base, W, H, CELL, /** @type {any} */ (edits));
  const b = applyEdits(base, W, H, CELL, /** @type {any} */ (edits));
  assert.deepEqual(Array.from(a.elevation), Array.from(b.elevation));
  assert.equal(at(base, 10, 10), 50, '元は変えない');
  assert.ok(at(a.elevation, 10, 10) > 50);
  assert.ok(at(a.elevation, 30, 30) < 0);
  // 編集が無ければ元のまま
  assert.equal(applyEdits(base, W, H, CELL, []).elevation, base);
  // 記録する形：点は 0.01km、強さは 0〜1
  assert.deepEqual(normalizeStroke({ tool: 'raise', r: 2.345, s: 1.4, pts: [1.234, 5.678] }), { tool: 'raise', r: 2.35, s: 1, pts: [1.23, 5.68] });
});

const small = { ...defaultTerrainParams(), size: 256, cityCount: 8, totalPopulation: 800000 };

test('ブラシ：読み込むときと作り直すときに、編集を当てる', () => {
  const { world } = generateWorld('ブラシ', small, jp, { resolution: 64 });
  const cellKm = (small.size * small.cellKm) / world.terrain.width;
  const plain = loadWorld(world);
  // 陸のどこかを海にする
  let cell = -1;
  for (let i = 0; i < plain.elevation.length && cell < 0; i++) if (plain.hydrology.water[i] === LAND && plain.elevation[i] > 50) cell = i;
  const x = ((cell % plain.width) + 0.5) * cellKm;
  const y = (Math.floor(cell / plain.width) + 0.5) * cellKm;
  const edited = { ...world, terrain: { ...world.terrain, edits: [{ tool: 'sea', r: cellKm * 2, s: 1, pts: [x, y] }] } };
  const a = loadWorld(/** @type {any} */ (edited));
  assert.ok(a.elevation[cell] < 0);
  assert.notEqual(a.hydrology.water[cell], LAND);
  // 保存する標高は元のまま
  assert.equal(edited.terrain.elevation, world.terrain.elevation);
  // 作り直しで当て直す：元の標高は同じで、編集を持ち、都市は編集後の地形で決める
  const again = generateWorld('ブラシ', small, jp, { resolution: 64, edits: edited.terrain.edits });
  assert.equal(again.world.terrain.elevation, world.terrain.elevation);
  assert.deepEqual(again.world.terrain.edits, edited.terrain.edits);
  assert.ok(again.analysis.elevation[cell] < 0);
});

test('都市：置く・書き換える・消す（県庁所在地は消さない）。どれも1手で取り消せる', () => {
  const { world, analysis } = generateWorld('都市ブラシ', small, jp, { resolution: 64 });
  const store = newStore();
  store.dispatch({ type: 'world/set', world });
  const before = strip(store.getState());
  // 陸のマスに都市を置く
  let cell = 0;
  while (analysis.hydrology.water[cell] !== LAND) cell++;
  const cellKm = analysis.cellKm;
  const base = { ...analysis, water: analysis.hydrology.water, river: new Uint8Array(analysis.width * analysis.height) };
  const pos = { x: ((cell % analysis.width) + 0.5) * cellKm, y: (Math.floor(cell / analysis.width) + 0.5) * cellKm };
  const city = newCityAt(/** @type {any} */ (world), /** @type {any} */ (base), pos, jp);
  assert.ok(city.name && city.reading);
  assert.ok(!world.cities.some((c) => c.name === city.name), 'ほかの都市と同じ名前にしない');
  assert.equal(city.kind, jp.newCity.kind);
  const id = store.dispatch({ type: 'world/cityAdd', city });
  assert.equal(id, `city_${world.cities.length + 1}`);
  store.dispatch({ type: 'world/cityUpdate', id, fields: { name: '新都', population: 120000, kind: cityKindOf(120000, jp) } });
  let w = store.getState().world;
  const c = w.cities.find((x) => x.id === id);
  assert.equal(c.name, '新都');
  assert.equal(c.kind, 'city');
  // 県庁所在地は消さない
  const capital = w.regions[0].capitalCityId;
  assert.equal(store.dispatch({ type: 'world/cityDelete', id: capital }), false);
  assert.equal(store.dispatch({ type: 'world/cityDelete', id }), true);
  w = store.getState().world;
  assert.ok(!w.cities.some((x) => x.id === id));
  // ブラシのなぞりも1手
  store.dispatch({ type: 'world/brush', stroke: { tool: 'raise', r: 2, s: 0.5, pts: [10, 10, 12, 11] } });
  assert.equal(store.getState().world.terrain.edits.length, 1);
  for (let k = 0; k < 4; k++) store.undo();
  assert.deepEqual(strip(store.getState()), before);
});

test('都市の規模は人口と地域パックの区切りで決まる', () => {
  assert.equal(cityKindOf(2000000, jp), 'metropolis');
  assert.equal(cityKindOf(60000, jp), 'city');
  assert.equal(cityKindOf(20000, jp), 'town');
  assert.equal(cityKindOf(500, jp), 'village');
});

test('ブラシ：保存の形（標高の base64）は編集で変わらない', () => {
  const e = flat(10);
  const enc = encodeElevation(e);
  applyEdits(e, W, H, CELL, [{ tool: 'raise', r: 1, s: 1, pts: km(3, 3) }]);
  assert.equal(encodeElevation(e), enc);
});
