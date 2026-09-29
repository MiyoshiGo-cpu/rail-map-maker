import { test, assert } from './harness.js';
import { buildSchematicScene } from '../js/render/scene-schematic.js';
import { unionBoxes } from '../js/render/scene-legend.js';
import { normalizeProject } from '../js/core/defaults.js';
import { findRoutes } from '../js/core/network.js';
import { newStore, storeWithLine, throughNetwork } from './helpers.js';

// 文字幅は「文字数 × 文字の大きさ」とみなす仮の測り方
const measure = (font, text) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
  return [...text].length * size;
};

/** 凡例とタイトルの設定を変える */
function setLegend(store, legend, title) {
  const s = store.getState().style;
  store.dispatch({ type: 'project/style', fields: { legend: { ...s.legend, ...legend }, title: { ...s.title, ...title } } });
}
/** 凡例とタイトルの文字（駅名は label なので入らない） */
const texts = (scene) => scene.items.filter((it) => it.kind === 'text').map((it) => it.text);
const overlaps = (a, b) => !(a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY);

test('凡例：既定では出さない', () => {
  const { store } = storeWithLine();
  const scene = buildSchematicScene(store.getState(), { measure });
  assert.equal(scene.legendBounds, null);
  assert.equal(texts(scene).length, 0);
});

test('凡例：読み込んだデータに設定が無ければ既定で補う（一部だけあっても）', () => {
  const { store } = storeWithLine();
  const p = JSON.parse(JSON.stringify(store.getState()));
  delete p.style.title;
  p.style.legend = { show: true };
  const n = normalizeProject(p);
  assert.deepEqual(n.style.legend, { show: true, corner: 'br', lines: true, types: true, symbols: true });
  assert.equal(n.style.title.show, false);
  assert.equal(n.style.title.showAuthor, true);
});

test('凡例：下の角なら地図の下、上の角なら地図の上に置き、地図に重ねない', () => {
  const { store, d, lineA } = throughNetwork();
  void d;
  void lineA;
  setLegend(store, { show: true, corner: 'br' }, { show: true, corner: 'tl' });
  const scene = buildSchematicScene(store.getState(), { measure });
  const map = scene.mapBox;
  const legend = scene.items.find((it) => it.kind === 'rrect' && !it.target && it.stroke && it.lineWidth === 1);
  assert.ok(legend, '凡例の枠');
  assert.ok(legend.bbox.minY >= map.maxY, '凡例は地図の下');
  assert.ok(Math.abs(legend.bbox.maxX - 0.5 - map.maxX) < 1e-6, '右の角にそろえる');
  const title = scene.items.find((it) => it.kind === 'text' && it.text === 'テスト');
  assert.ok(title, 'タイトルはプロジェクト名');
  assert.ok(title.bbox.maxY <= map.minY, 'タイトルは地図の上');
  assert.ok(Math.abs(title.bbox.minX - map.minX) < 1e-6, '左の角にそろえる');
  // 地図の要素（線・駅・駅名）とは重ならない
  const mapItems = scene.items.filter((it) => it.target);
  for (const it of scene.items.filter((x) => !x.target && x.kind === 'text')) {
    for (const m of mapItems) assert.ok(!overlaps(it.bbox, m.bbox), `${it.text} が地図と重なる`);
  }
  // 全体の範囲に凡例とタイトルが入る
  const all = unionBoxes(scene.items.filter((it) => !it.target && !scene.index.query(it.bbox).includes(it)));
  assert.ok(scene.legendBounds.minY <= all.minY && scene.legendBounds.maxY >= all.maxY);
});

test('凡例：事業者ごとの路線・使っている種別・出ている記号だけを載せる', () => {
  const { store, d, S, opA, type, lineC } = throughNetwork();
  setLegend(store, { show: true });
  let t = texts(buildSchematicScene(store.getState(), { measure }));
  for (const s of ['A電鉄', 'A線', 'B交通局', 'B線', 'C電鉄', 'C線', '記号', 'ターミナル駅', '駅', '乗換駅']) assert.ok(t.includes(s), s);
  assert.ok(!t.includes('種別'), '系統が無ければ種別の欄は出さない');
  assert.ok(!t.includes('建設中'));
  assert.ok(!t.includes('信号場'));

  d({ type: 'service/add', route: findRoutes(store.getState(), S.a0, S.c3)[0].segments, typeId: type(opA, '急行') });
  d({ type: 'line/update', lineId: lineC, fields: { status: 'construction' } });
  t = texts(buildSchematicScene(store.getState(), { measure }));
  assert.ok(t.includes('種別'));
  assert.ok(t.includes('急行'), '使っている種別');
  assert.ok(!t.includes('特急'), '使っていない種別は載せない');
  assert.ok(t.includes('建設中'));

  // 項目を外せる
  setLegend(store, { lines: false, types: false });
  t = texts(buildSchematicScene(store.getState(), { measure }));
  assert.ok(!t.includes('A線') && !t.includes('急行'));
  assert.ok(t.includes('乗換駅'));
});

test('凡例：凡例とタイトルは当たり判定に入れない', () => {
  const { store } = throughNetwork();
  setLegend(store, { show: true, corner: 'bl' }, { show: true, corner: 'tr' });
  const scene = buildSchematicScene(store.getState(), { measure });
  for (const it of scene.items.filter((x) => !x.target)) {
    const cx = (it.bbox.minX + it.bbox.maxX) / 2;
    const cy = (it.bbox.minY + it.bbox.maxY) / 2;
    assert.equal(scene.index.hitTest(cx, cy, 2), null);
  }
});

test('タイトル：作者と日付を添える。作者を外せる', () => {
  const store = newStore();
  store.dispatch({ type: 'station/add', x: 0, y: 0, fields: { name: '東', reading: '' } });
  store.dispatch({ type: 'project/update', fields: { author: '山田' } });
  setLegend(store, {}, { show: true, text: 'みなと鉄道路線図', date: '2026年4月現在' });
  let t = texts(buildSchematicScene(store.getState(), { measure }));
  assert.ok(t.includes('みなと鉄道路線図'));
  assert.ok(t.includes('2026年4月現在　作成：山田'));
  setLegend(store, {}, { showAuthor: false });
  t = texts(buildSchematicScene(store.getState(), { measure }));
  assert.ok(t.includes('2026年4月現在'));
  assert.ok(!t.some((x) => x.includes('山田')));
});

test('凡例：同じ角ならタイトルの下に凡例を積み、左右の角が重なるなら右をずらす', () => {
  const { store } = throughNetwork();
  setLegend(store, { show: true, corner: 'tl' }, { show: true, corner: 'tl' });
  let scene = buildSchematicScene(store.getState(), { measure });
  const title = scene.items.find((it) => it.kind === 'text' && it.text === 'テスト');
  const box = scene.items.find((it) => it.kind === 'rrect' && !it.target && it.lineWidth === 1);
  assert.ok(title.bbox.maxY <= box.bbox.minY, 'タイトルが上');
  assert.ok(box.bbox.maxY <= scene.mapBox.minY, '凡例も地図の上');

  // 地図が狭くても、左上と右上の塊は重ならない
  const s2 = newStore();
  const a = s2.dispatch({ type: 'station/add', x: 0, y: 0, fields: { name: 'あ', reading: '' } });
  const b = s2.dispatch({ type: 'station/add', x: 1, y: 0, fields: { name: 'い', reading: '' } });
  s2.dispatch({ type: 'line/add', stationIds: [a, b] });
  setLegend(s2, { show: true, corner: 'tr' }, { show: true, corner: 'tl', text: 'とても長いタイトルの路線図' });
  scene = buildSchematicScene(s2.getState(), { measure });
  const t2 = scene.items.find((it) => it.kind === 'text' && it.text === 'とても長いタイトルの路線図');
  const box2 = scene.items.find((it) => it.kind === 'rrect' && !it.target && it.lineWidth === 1);
  assert.ok(!overlaps(t2.bbox, box2.bbox));
});

test('凡例：路線が多ければ、地図の幅に収まる範囲で段に分けて低くする', () => {
  const store = newStore();
  // 横に長い地図に、短い路線を12本
  for (let i = 0; i < 12; i++) {
    const a = store.dispatch({ type: 'station/add', x: i * 4, y: 0, fields: { name: `駅${i}a`, reading: '' } });
    const b = store.dispatch({ type: 'station/add', x: i * 4 + 2, y: 0, fields: { name: `駅${i}b`, reading: '' } });
    const op = store.dispatch({ type: 'operator/add', fields: { name: `会社${i}` } });
    store.dispatch({ type: 'line/add', fields: { operatorId: op, name: `線${i}` }, stationIds: [a, b] });
  }
  setLegend(store, { show: true, symbols: false });
  const scene = buildSchematicScene(store.getState(), { measure });
  const box = scene.items.find((it) => it.kind === 'rrect' && !it.target && it.lineWidth === 1);
  const map = scene.mapBox;
  assert.ok(box.w <= map.maxX - map.minX + 1e-6, '地図の幅に収まる');
  // 1段なら 12欄 × (見出し＋1行) の高さになる
  const u = store.getState().style.fontSize;
  assert.ok(box.h < 12 * (u * 1.5 + u * 1.6) / 2, `段に分かれて低い（${box.h}）`);
});
