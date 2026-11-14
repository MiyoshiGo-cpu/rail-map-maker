import { test, assert } from './harness.js';
import { elevationAt, waterAt, surveySection, suggestStructures, structureCheckItems } from '../js/core/structure-suggest.js';
import { newStore } from './helpers.js';

/** 40×40 マス（1マス 0.5km、20km 四方）の平らな陸。make で標高と水を書き換える */
function grid(make) {
  const w = 40;
  const h = 40;
  const elevation = new Int16Array(w * h).fill(50);
  const water = new Uint8Array(w * h);
  const river = new Uint8Array(w * h);
  make && make({ w, h, elevation, water, river });
  return { width: w, height: h, cellKm: 0.5, elevation, water, river };
}

/** 地理座標（km）に駅を置き、駅を順につないだ路線を作る */
function geoLine(points, fields = {}) {
  const store = newStore();
  const ids = points.map((_, i) => store.dispatch({ type: 'station/add', x: i * 2, y: 0, fields: { name: '駅' + i, reading: '' } }));
  store.dispatch({ type: 'world/set', world: { mode: 'fictional', seed: 's', gen: { size: 40, cellKm: 0.5 }, terrain: { width: 40, height: 40, elevation: '', edits: [] }, cities: [], regions: [] }, stationGeo: Object.fromEntries(ids.map((id, i) => [id, { x: points[i][0], y: points[i][1] }])) });
  const lineId = store.dispatch({ type: 'line/add', stationIds: ids, fields });
  return { store, ids, lineId };
}

test('トンネル・橋梁：標高は双一次補間、水はいちばん近いマス', () => {
  const g = grid(({ w, elevation, water, river }) => {
    elevation[10 * w + 10] = 150;
    water[5 * w + 5] = 1;
    river[6 * w + 6] = 1;
  });
  assert.equal(elevationAt(g, 10.5 * 0.5, 10.5 * 0.5), 150, 'マスの中心はそのマスの値');
  assert.equal(elevationAt(g, 11 * 0.5, 10.5 * 0.5), 100, 'となりのマスとの中間');
  assert.equal(waterAt(g, 5.2 * 0.5, 5.7 * 0.5), 'sea');
  assert.equal(waterAt(g, 6.5 * 0.5, 6.5 * 0.5), 'river');
  assert.equal(waterAt(g, 1, 1), null);
});

test('トンネル・橋梁：山を貫く区間はトンネル、川や湖を渡る区間は橋梁', () => {
  // x = 7〜13km・y = 0〜12km（マス 14〜25・0〜23）に高さ 400m の山、y = 15km の横に川、x = 3〜5km・y = 18km あたりに湖
  const g = grid(({ w, elevation, water, river }) => {
    for (let y = 0; y < 24; y++) for (let x = 14; x < 26; x++) elevation[y * w + x] = 400;
    for (let x = 0; x < w; x++) river[30 * w + x] = 1;
    for (let y = 35; y < 38; y++) for (let x = 6; x < 10; x++) water[y * w + x] = 2;
  });
  const sv = surveySection([{ x: 2, y: 5 }, { x: 18, y: 5 }], g);
  assert.ok(sv.tunnelKm >= 3 && sv.maxDepthM > 300, JSON.stringify(sv));
  // 路線：山越え（駅0→駅1）、川越え（駅1→駅2）、湖越え（駅2→駅3）
  const { store, lineId } = geoLine([[2, 5], [18, 5], [18, 18], [1, 18.2]]);
  const p = store.getState();
  const list = suggestStructures(p, g);
  const by = Object.fromEntries(list.map((s) => [s.index, s]));
  assert.equal(by[0] && by[0].structure, 'tunnel');
  assert.equal(by[1] && by[1].structure, 'bridge');
  assert.equal(by[1].survey.water, 'river');
  assert.equal(by[2] && by[2].structure, 'bridge');
  assert.equal(by[2].survey.water, 'lake');
  // チェックの項目
  const items = structureCheckItems(p, list);
  assert.equal(items[0].code, 'suggestTunnel');
  assert.deepEqual(items[0].fix, { lineId, index: 0, structure: 'tunnel' });
  assert.deepEqual(items[1].params.water, { key: 'water.river' });
  // まとめて当てると1手で、取り消せる
  store.dispatch({ type: 'line/applyStructures', items: items.map((it) => it.fix) });
  const after = store.getState().lines[0].sections.map((s) => s.structure);
  assert.deepEqual(after, ['tunnel', 'bridge', 'bridge']);
  assert.equal(suggestStructures(store.getState(), g).length, 0, '当てたあとは提案しない（手で決めた区間）');
  store.undo();
  assert.deepEqual(store.getState().lines[0].sections.map((s) => s.structure), [undefined, undefined, undefined]);
});

test('トンネル・橋梁：平らな陸は提案しない。地下鉄の路線や手で決めた区間も提案しない', () => {
  const g = grid(({ w, h, elevation }) => {
    for (let y = 0; y < h; y++) for (let x = 16; x < 24; x++) elevation[y * w + x] = 400;
  });
  const flat = geoLine([[1, 1], [6, 1]]);
  assert.equal(suggestStructures(flat.store.getState(), g).length, 0);
  const subway = geoLine([[2, 5], [18, 5]], { kind: 'subway' });
  assert.equal(suggestStructures(subway.store.getState(), g).length, 0, '地下鉄はもともと地下');
  const manual = geoLine([[2, 5], [18, 5]]);
  manual.store.dispatch({ type: 'line/section', lineId: manual.lineId, index: 0, fields: { structure: 'elevated' } });
  assert.equal(suggestStructures(manual.store.getState(), g).length, 0);
});

test('トンネル・橋梁：川に沿って走る区間は橋梁にしない（横切る所だけ）', () => {
  // y = 5km の横に長い川
  const g = grid(({ w, river }) => {
    for (let x = 0; x < w; x++) river[10 * w + x] = 1;
  });
  const along = surveySection([{ x: 1, y: 5.25 }, { x: 15, y: 5.25 }], g);
  assert.equal(along.waterKm, 0, JSON.stringify(along));
  const across = surveySection([{ x: 5, y: 2 }, { x: 5, y: 9 }], g);
  assert.ok(across.waterKm > 0 && across.waterKm <= 0.8, JSON.stringify(across));
  assert.equal(across.water, 'river');
});
