// 駅名の候補（§6.8）
import { test, assert } from './harness.js';
import { suggestStationNames, cityRadiusKm } from '../js/core/station-names.js';
import { getRegion } from '../js/core/regions/index.js';
import { newStore } from './helpers.js';

const jp = getRegion('jp');

/** 都市が2つある架空の地形と、駅を置いたストア */
function setup() {
  const store = newStore();
  const world = {
    mode: 'fictional', seed: 's', gen: { size: 256, cellKm: 0.5 }, terrain: { width: 4, height: 4, elevation: '', edits: [] },
    cities: [
      { id: 'city_1', name: '芦沢', reading: 'あしさわ', names: {}, pos: { x: 50, y: 50 }, population: 200000, kind: 'city' },
      { id: 'city_2', name: '高尾', reading: 'たかお', names: {}, pos: { x: 80, y: 50 }, population: 10000, kind: 'town' },
    ],
    regions: [],
  };
  store.dispatch({ type: 'world/set', world });
  const at = (x, y) => store.dispatch({ type: 'station/add', geo: { x, y } });
  return { store, at };
}
const names = (list) => list.map((c) => c.name);

test('駅名の候補：都市の中心なら都市名・中央・市役所前・施設前、地形に合った地名', () => {
  const { store, at } = setup();
  const id = at(50.2, 50.1);
  const list = suggestStationNames(store.getState(), id, jp, { terrainAt: () => 'coast' });
  const n = names(list);
  assert.equal(n[0], '芦沢');
  assert.equal(list[0].reading, 'あしさわ');
  assert.ok(n.includes('芦沢中央'));
  assert.ok(n.includes('市役所前'));
  assert.ok(n.some((x) => /^芦沢(公園|大学)前$/.test(x)));
  const center = list.find((c) => c.name === '芦沢中央');
  assert.equal(center.reading, 'あしさわ・ちゅうおう');
  // 地形に合った地名が2つ（都市名と重ならない）
  const places = list.filter((c) => c.kind === 'place');
  assert.equal(places.length, 2);
  assert.ok(places.every((c) => c.name !== '芦沢' && c.name !== '高尾' && c.reading));
  // 中心なので方角や「口」は付けない
  assert.ok(!n.some((x) => x.startsWith('東') || x.endsWith('口')));
});

test('駅名の候補：中心から離れていれば方角と「口」、新幹線なら「新」', () => {
  const { store, at } = setup();
  const r = cityRadiusKm(200000);
  // 芦沢の東、広さの 0.8 倍
  const id = at(50 + r * 0.8, 50.3);
  let n = names(suggestStationNames(store.getState(), id, jp));
  assert.ok(n.includes('東芦沢'), n.join(','));
  assert.ok(n.includes('芦沢口'));
  assert.ok(!n.includes('新芦沢'));
  // 北の外れ（広さの 1.5 倍）は都市名そのものは出さない
  const north = at(50.2, 50 - r * 1.5);
  n = names(suggestStationNames(store.getState(), north, jp));
  assert.ok(n.includes('北芦沢'));
  assert.ok(!n.includes('芦沢'));
  // 新幹線の駅
  const other = at(40, 40);
  store.dispatch({ type: 'line/add', stationIds: [id, other], fields: { kind: 'shinkansen' } });
  const p = store.getState();
  const line = p.lines[0];
  assert.equal(line.kind, 'shinkansen');
  n = names(suggestStationNames(p, id, jp));
  assert.ok(n.includes('新芦沢'));
  assert.equal(suggestStationNames(p, id, jp).find((c) => c.name === '新芦沢').reading, 'しん・あしさわ');
});

test('駅名の候補：ほかの駅と同じ名前は出さない。地形が無ければ出さない。同じ駅なら同じ候補', () => {
  const { store, at } = setup();
  const a = at(50.1, 50);
  store.dispatch({ type: 'station/update', stationId: a, fields: { name: '芦沢' } });
  const b = at(50.3, 49.8);
  const n = names(suggestStationNames(store.getState(), b, jp, { terrainAt: () => 'plain' }));
  assert.ok(!n.includes('芦沢'));
  assert.ok(n.includes('芦沢中央'));
  assert.deepEqual(names(suggestStationNames(store.getState(), b, jp, { terrainAt: () => 'plain' })), n);
  // 遠くの駅は都市名の候補が無い（地形の地名だけ）
  const far = at(5, 120);
  const list = suggestStationNames(store.getState(), far, jp, { terrainAt: () => 'mountain' });
  assert.ok(list.every((c) => c.kind === 'place'));
  // 地形が無いプロジェクトでは出さない
  const s2 = newStore();
  const id = s2.dispatch({ type: 'station/add', x: 0, y: 0 });
  assert.deepEqual(suggestStationNames(s2.getState(), id, jp), []);
});
