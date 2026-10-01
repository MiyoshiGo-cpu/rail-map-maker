import { test, assert } from './harness.js';
import { buildGeoScene, geoZoomLevel, geoLabelLevel, geoBaseVectors } from '../js/render/scene-geo.js';
import { computeGeoSections } from '../js/core/geo-lines.js';
import { GEO_UNIT } from '../js/core/viewport.js';
import { newStore } from './helpers.js';

// 文字幅は「文字数 × 文字の大きさ」とみなす仮の測り方
const measure = (font, text) => {
  const size = Number(/(\d+(?:\.\d+)?(?:e-?\d+)?)px/.exec(font)[1]);
  return [...text].length * size;
};

/** 地理座標（km）に駅を置いて1本の路線にし、都市を2つ持つ架空の世界を付ける */
function geoProject(points, names) {
  const store = newStore();
  const ids = points.map((_, i) => store.dispatch({ type: 'station/add', x: i * 2, y: 0, fields: { name: names[i], reading: '' } }));
  const world = {
    mode: 'fictional', seed: 's', gen: {}, terrain: { width: 4, height: 4, elevation: '', edits: [] },
    cities: [
      { id: 'city_1', name: '大川', names: {}, pos: { x: 40, y: 40 }, population: 900000, kind: 'metropolis' },
      { id: 'city_2', name: '小村', names: {}, pos: { x: 60, y: 10 }, population: 3000, kind: 'village' },
    ],
    regions: [],
  };
  store.dispatch({ type: 'world/set', world, stationGeo: Object.fromEntries(ids.map((id, i) => [id, { x: points[i][0], y: points[i][1] }])) });
  const lineId = store.dispatch({ type: 'line/add', stationIds: ids });
  return { store, ids, lineId };
}

function scene(p, zoom) {
  return buildGeoScene(p, { measure, zoom, sections: computeGeoSections(p) });
}

test('地理ビュー：倍率の段階と駅名を隠す段階', () => {
  assert.equal(geoZoomLevel(1), 1);
  assert.equal(geoZoomLevel(1.1), 1);
  assert.close(geoZoomLevel(1.3), Math.SQRT2, 1e-12);
  assert.equal(geoZoomLevel(0.26), 0.25);
  assert.equal(geoLabelLevel(32), 0);
  assert.equal(geoLabelLevel(8), 1);
  assert.equal(geoLabelLevel(1), 2);
});

test('地理ビュー：線路・駅・駅名・都市が出て、線の太さと文字は画面で一定', () => {
  const { store, ids, lineId } = geoProject([[10, 10], [14, 11], [18, 10]], ['西', '中央', '東']);
  const p = store.getState();
  for (const zoom of [1, 2]) {
    const s = scene(p, zoom);
    const sec = s.sectionItems.get(`${lineId}:0`);
    assert.ok(sec, '区間');
    // 画面の太さ（世界の太さ × 倍率）は、倍率によらず同じ
    assert.close(sec.width * zoom, p.style.lineWidth * 0.6, 1e-9);
    assert.ok(s.stationItems.has(ids[1]));
    const st = s.stationItems.get(ids[0]);
    assert.close(st.x, 10 * GEO_UNIT, 1e-9);
    const labels = s.items.filter((it) => it.kind === 'label');
    assert.ok(labels.length >= 1);
    assert.close(labels[0].haloWidth * zoom, 3, 1e-9);
  }
  // 都市：縮小すると村は出さない。大都市は出す
  const far = scene(p, 1 / 16);
  const texts = far.items.filter((it) => it.kind === 'text').map((it) => it.text);
  assert.ok(texts.includes('大川'));
  assert.ok(!texts.includes('小村'));
  const near = scene(p, 1);
  assert.ok(near.items.filter((it) => it.kind === 'text').some((it) => it.text === '小村'));
});

test('地理ビュー：重なる駅名は出さず、当たり判定で駅と区間を選べる', () => {
  // 0.1km おきの8駅は、駅名がすべては入らない
  const names = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'やゆよわを'];
  const { store, ids, lineId } = geoProject(names.map((_, i) => [10 + i * 0.1, 10]), names);
  const p = store.getState();
  const s = scene(p, 1);
  const labels = s.items.filter((it) => it.kind === 'label');
  assert.ok(labels.length >= 2 && labels.length < 8, String(labels.length));
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i].bbox;
      const b = labels[j].bbox;
      assert.ok(a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY, '重ならない');
    }
  }
  const st = s.stationItems.get(ids[0]);
  assert.deepEqual(s.index.hitTest(st.x, st.y, 4), { type: 'station', id: ids[0] });
  const mid = s.sectionItems.get(`${lineId}:1`);
  const hit = s.index.hitTest(mid.pts[Math.floor(mid.pts.length / 4) * 2], mid.pts[Math.floor(mid.pts.length / 4) * 2 + 1], 0.5, (t) => t.type === 'section');
  assert.equal(hit && hit.type, 'section');
});

test('地理ビュー：川は縮小すると小さいものを省き、県境は破線', () => {
  const { store } = geoProject([[10, 10], [14, 11]], ['西', '東']);
  const base = {
    width: 100, height: 100, cellKm: 1, threshold: 10,
    rivers: [{ pts: [1, 1, 2, 2], cls: 0, flow: 12 }, { pts: [5, 5, 9, 9], cls: 4, flow: 400 }],
    borders: [[0, 50, 100, 50]],
  };
  const vectors = geoBaseVectors(/** @type {any} */ (base));
  assert.deepEqual(vectors.extent, { minX: 0, minY: 0, maxX: 100 * GEO_UNIT, maxY: 100 * GEO_UNIT });
  const p = store.getState();
  const rivers = (zoom) => buildGeoScene(p, { measure, zoom, sections: computeGeoSections(p), vectors }).items.filter((it) => it.color === '#4A8CD0');
  assert.equal(rivers(1).length, 2);
  assert.equal(rivers(1 / 64).length, 1);
  const border = buildGeoScene(p, { measure, zoom: 1, sections: computeGeoSections(p), vectors }).items.find((it) => it.dash && it.dash.length === 4);
  assert.ok(border, '県境');
});
