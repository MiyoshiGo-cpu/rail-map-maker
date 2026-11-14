import { test, assert } from './harness.js';
import { symbolSectionItems, symbolWidth, symbolStatus, SYMBOL_INK } from '../js/render/geo-symbols.js';
import { buildGeoScene } from '../js/render/scene-geo.js';
import { computeGeoSections } from '../js/core/geo-lines.js';
import { newStore } from './helpers.js';

const pts = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 10 }];
const base = { pts, kind: 'conventional', tracks: 2, structure: 'ground', status: 'open', striped: false, unit: 1, showAbolished: false };

test('地図記号：JR（縞）は黒い線と白い破線、それ以外は細い黒線と短い横線', () => {
  const jr = symbolSectionItems({ ...base, striped: true });
  assert.equal(jr.length, 2);
  assert.equal(jr[0].color, SYMBOL_INK);
  assert.equal(jr[1].color, '#FFFFFF');
  assert.ok(jr[1].dash && jr[1].dash.length === 2);
  const pv = symbolSectionItems(base);
  assert.equal(pv.length, 2);
  assert.ok(!pv[0].dash, '中心の線は実線');
  assert.ok(pv[1].width > pv[0].width && pv[1].dash[0] < pv[1].dash[1], '太い線を短い破線にして横線にする');
  // 単線は複線より細い
  assert.ok(symbolWidth('conventional', 1) < symbolWidth('conventional', 2));
  assert.ok(symbolSectionItems({ ...base, striped: true, tracks: 1 })[0].width < jr[0].width);
});

test('地図記号：地下は破線、トンネルは破線と坑口、橋梁は両側に細線', () => {
  const ug = symbolSectionItems({ ...base, structure: 'underground', striped: true });
  assert.equal(ug.length, 1);
  assert.ok(ug[0].dash);
  const tn = symbolSectionItems({ ...base, structure: 'tunnel', portalStart: true, portalEnd: true });
  assert.equal(tn.length, 3, '破線と坑口2つ');
  assert.equal(tn[1].pts.length, 8, '坑口は「⊐」の4点');
  assert.equal(symbolSectionItems({ ...base, structure: 'tunnel', portalStart: false, portalEnd: true }).length, 2);
  const br = symbolSectionItems({ ...base, structure: 'bridge' });
  assert.equal(br.length, 4, '線（2本）と両側の細線');
  // 両側の細線は線から離れている（y=0 の区間の途中で上下に分かれる）
  const ys = [br[2].pts[3], br[3].pts[3]];
  assert.ok(ys[0] * ys[1] < 0, String(ys));
  // 端は線から離れる向きに開く
  const startY = br[2].pts[1];
  assert.ok(Math.abs(startY) > Math.abs(br[2].pts[3]), '始点の端は外へ開く');
});

test('地図記号：状態の描き分け（廃止は既定で出さない）', () => {
  assert.equal(symbolSectionItems({ ...base, status: 'abolished' }).length, 0);
  assert.equal(symbolSectionItems({ ...base, status: 'abolished', showAbolished: true }).length, 1);
  const planned = symbolSectionItems({ ...base, status: 'planned' });
  assert.equal(planned[0].alpha, 0.5);
  assert.ok(planned[0].dash);
  assert.equal(symbolStatus('suspended', false).gray, true);
});

test('地図記号：地理ビューで、JR の区分の事業者は縞、駅は黒い縁', () => {
  const store = newStore();
  const ids = [0, 1, 2].map((i) => store.dispatch({ type: 'station/add', x: i * 2, y: 0, fields: { name: '駅' + i, reading: '' } }));
  store.dispatch({ type: 'world/set', world: { mode: 'fictional', seed: 's', gen: { size: 256, cellKm: 0.5 }, terrain: { width: 4, height: 4, elevation: '', edits: [] }, cities: [], regions: [] }, stationGeo: { [ids[0]]: { x: 10, y: 10 }, [ids[1]]: { x: 14, y: 10 }, [ids[2]]: { x: 18, y: 11 } } });
  const lineId = store.dispatch({ type: 'line/add', stationIds: ids });
  let p = store.getState();
  const opId = p.lines[0].operatorId;
  store.dispatch({ type: 'operator/update', operatorId: opId, fields: { category: 'jr' } });
  store.dispatch({ type: 'project/style', fields: { geoStyle: 'symbol' } });
  p = store.getState();
  assert.equal(p.style.geoStyle, 'symbol');
  const measure = (font, text) => [...text].length * 12;
  const scene = buildGeoScene(p, { measure, zoom: 1, sections: computeGeoSections(p) });
  const main = scene.sectionItems.get(`${lineId}:0`);
  assert.equal(main.color, SYMBOL_INK);
  assert.ok(scene.items.some((it) => it.color === '#FFFFFF' && it.dash), '白い破線（縞）');
  assert.equal(scene.stationItems.get(ids[0]).stroke, SYMBOL_INK);
  assert.deepEqual(scene.index.hitTest(main.pts[2], main.pts[3], 2, (t) => t.type === 'section'), { type: 'section', lineId, index: 0 });
});
