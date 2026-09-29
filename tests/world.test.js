import { test, assert } from './harness.js';
import { analyzeHydrology, LAND, SEA, LAKE } from '../js/core/terrain/hydrology.js';
import { generateWorld, loadWorld } from '../js/core/terrain/world.js';
import { defaultTerrainParams } from '../js/core/terrain/generate.js';
import { createPlaceNamer } from '../js/core/placenames.js';
import { createRng } from '../js/core/rng.js';
import { getRegion } from '../js/core/regions/index.js';

const jp = getRegion('jp');

test('水系：縁につながる 0 以下は海、水は低い方へ流れて海に出る', () => {
  // 西の列が海、東へ高くなる斜面
  const w = 20;
  const h = 10;
  const elev = new Int16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) elev[y * w + x] = x === 0 ? -10 : x * 10;
  const hy = analyzeHydrology(elev, w, h, { cellKm: 1, riverAmount: 1 });
  assert.equal(hy.water[0], SEA);
  assert.equal(hy.water[5 * w + 5], LAND);
  // どの陸のマスからたどっても海に着く
  const DX = [1, 1, 0, -1, -1, -1, 0, 1];
  const DY = [0, 1, 1, 1, 0, -1, -1, -1];
  for (let i = 0; i < w * h; i++) {
    if (hy.water[i] !== LAND) continue;
    let c = i;
    for (let k = 0; k < w * h && hy.dir[c] >= 0; k++) {
      const x = c % w;
      const y = (c - x) / w;
      c = (y + DY[hy.dir[c]]) * w + x + DX[hy.dir[c]];
    }
    const x = c % w;
    const y = (c - x) / w;
    assert.ok(hy.water[c] === SEA || x === 0 || y === 0 || x === w - 1 || y === h - 1);
  }
  // 流量は下流ほど多い
  assert.ok(hy.acc[5 * w + 1] > hy.acc[5 * w + 10]);
});

test('水系：広い窪地は埋めて湖にし、狭い窪地は湖にしない', () => {
  const w = 30;
  const h = 30;
  const elev = new Int16Array(w * h).fill(100);
  for (let x = 0; x < w; x++) elev[x] = -5; // 北の縁は海
  // 広い窪地（6×6、深さ20m）と、狭い窪地（1マス）
  for (let y = 10; y < 16; y++) for (let x = 5; x < 11; x++) elev[y * w + x] = 80;
  elev[20 * w + 20] = 90;
  const hy = analyzeHydrology(elev, w, h, { cellKm: 1, riverAmount: 0.5 });
  assert.equal(hy.water[12 * w + 7], LAKE);
  assert.equal(hy.water[20 * w + 20], LAND);
  assert.ok(hy.filled[12 * w + 7] >= 100, '湖は縁の高さまで埋める');
});

const small = { ...defaultTerrainParams(), size: 256, cityCount: 12, totalPopulation: 1000000 };

test('世界：同じシードなら同じ世界（標高・都市・県）になる', () => {
  const a = generateWorld('世界', small, jp, { resolution: 96 }).world;
  const b = generateWorld('世界', small, jp, { resolution: 96 }).world;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = generateWorld('世界2', small, jp, { resolution: 96 }).world;
  assert.notEqual(a.terrain.elevation, c.terrain.elevation);
});

test('世界：都市は陸の上に間隔を空けて置き、人口は大きい順・合計は総人口', () => {
  const { world, analysis } = generateWorld('都市', small, jp, { resolution: 128 });
  const { width, cellKm, hydrology } = analysis;
  assert.ok(world.cities.length > 3 && world.cities.length <= 12, String(world.cities.length));
  let sum = 0;
  world.cities.forEach((c, i) => {
    const cell = Math.floor(c.pos.y / cellKm) * width + Math.floor(c.pos.x / cellKm);
    assert.equal(hydrology.water[cell], LAND, c.name);
    if (i > 0) assert.ok(c.population <= world.cities[i - 1].population);
    sum += c.population;
    assert.ok(/^[ぁ-ゟ]+$/.test(c.reading), c.reading);
    assert.ok(c.names.en.length > 0);
  });
  assert.ok(Math.abs(sum - small.totalPopulation) < small.totalPopulation * 0.01);
  assert.equal(new Set(world.cities.map((c) => c.name)).size, world.cities.length, '同じ名前は作らない');
  // 間隔
  for (let i = 0; i < world.cities.length; i++) {
    for (let j = i + 1; j < world.cities.length; j++) {
      const a = world.cities[i].pos;
      const b = world.cities[j].pos;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 3, '近すぎる都市');
    }
  }
});

test('世界：県はすべての陸を分け、県庁所在地はその県で一番大きい都市', () => {
  const { world, analysis } = generateWorld('県', { ...small, cityCount: 20 }, jp, { resolution: 128 });
  const { width, cellKm, hydrology, regionMap } = analysis;
  assert.ok(world.regions.length >= 1);
  for (let i = 0; i < regionMap.length; i++) {
    if (hydrology.water[i] === LAND) assert.ok(regionMap[i] >= 0);
    else assert.equal(regionMap[i], -1);
  }
  for (const r of world.regions) {
    const members = world.cities.filter((c) => c.regionId === r.id);
    const capital = world.cities.find((c) => c.id === r.capitalCityId);
    assert.equal(capital.regionId, r.id);
    assert.equal(Math.max(...members.map((c) => c.population)), capital.population);
  }
  void width;
  void cellKm;
});

test('世界：保存した形から、水系と県の範囲を同じに作り直せる', () => {
  const { world, analysis } = generateWorld('読み込み', small, jp, { resolution: 96 });
  const back = loadWorld(JSON.parse(JSON.stringify(world)));
  assert.deepEqual([...back.elevation], [...analysis.elevation]);
  assert.deepEqual([...back.regionMap], [...analysis.regionMap]);
  assert.equal(back.hydrology.rivers.length, analysis.hydrology.rivers.length);
  assert.equal(back.cellKm, analysis.cellKm);
});

test('地名：重ならず、よみはひらがな。濁った音がある後ろの要素は連濁しない', () => {
  const namer = createPlaceNamer(createRng('names'), jp.placeNames);
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const n = namer.name(['coast', 'river', 'mountain', 'plain'][i % 4]);
    assert.ok(!seen.has(n.name), n.name);
    seen.add(n.name);
    assert.ok(/^[ぁ-ゟ]+$/.test(n.reading), n.reading);
    assert.ok([...n.name].length >= 2 && [...n.name].length <= 5, n.name);
  }
  // 「潟（がた）」はすでに濁っているので、そのまま
  const only = { ...jp.placeNames, heads: [{ k: '大', r: 'おお' }], tails: { coast: [{ k: '潟', r: 'がた' }], river: [], mountain: [], plain: [], any: [{ k: '潟', r: 'がた' }] }, prefixRate: 0, rendakuRate: 1 };
  assert.deepEqual(createPlaceNamer(createRng('x'), only).name('coast'), { name: '大潟', reading: 'おおがた' });
  // 連濁の確率が 1 なら「川（かわ）」は「がわ」になる
  const kawa = { ...only, tails: { ...only.tails, coast: [{ k: '川', r: 'かわ' }], any: [{ k: '川', r: 'かわ' }] } };
  assert.equal(createPlaceNamer(createRng('y'), kawa).name('coast').reading, 'おおがわ');
});
