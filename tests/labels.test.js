import { test, assert } from './harness.js';
import { buildSchematicScene } from '../js/render/scene-schematic.js';
import { labelLevel, buildBlock } from '../js/render/labels.js';
import { newStore } from './helpers.js';

// 文字幅は「文字数 × 文字の大きさ」とみなす仮の測り方
const measure = (font, text) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
  return [...text].length * size;
};

function lineOf(points, names) {
  const store = newStore();
  const ids = points.map(([x, y], i) => store.dispatch({ type: 'station/add', x, y, fields: { name: names[i], reading: '' } }));
  const lineId = store.dispatch({ type: 'line/add', stationIds: ids });
  return { store, ids, lineId };
}

const overlaps = (a, b) => !(a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY);

test('ラベル：横向きの線の駅は、線に直交する上か下に置く', () => {
  const { store, ids } = lineOf([[0, 0], [4, 0], [8, 0]], ['西', '中央', '東']);
  const scene = buildSchematicScene(store.getState(), { measure });
  const pos = scene.labelInfo.get(ids[1]).pos;
  assert.ok(pos === 'N' || pos === 'S', pos);
});

test('ラベル：縦向きの線の駅は、左右に置く', () => {
  const { store, ids } = lineOf([[0, 0], [0, 4], [0, 8]], ['北', '中央', '南']);
  const scene = buildSchematicScene(store.getState(), { measure });
  const pos = scene.labelInfo.get(ids[1]).pos;
  assert.ok(pos === 'E' || pos === 'W', pos);
});

test('ラベル：近い駅どうしでも、場所があれば重ならない', () => {
  const { store, ids } = lineOf([[0, 0], [2, 0], [4, 0], [6, 0]], ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと']);
  const scene = buildSchematicScene(store.getState(), { measure });
  const boxes = ids.map((id) => scene.labelInfo.get(id).box);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]), `${i} と ${j} が重なる`);
  }
});

test('ラベル：手動で決めた方向と微調整を使う', () => {
  const { store, ids } = lineOf([[0, 0], [4, 0]], ['A', 'B']);
  store.dispatch({ type: 'station/label', stationId: ids[0], fields: { pos: 'E' } });
  let scene = buildSchematicScene(store.getState(), { measure });
  const e = scene.labelInfo.get(ids[0]);
  assert.equal(e.pos, 'E');
  store.dispatch({ type: 'station/label', stationId: ids[0], fields: { dx: 10, dy: -5 } });
  scene = buildSchematicScene(store.getState(), { measure });
  const moved = scene.labelInfo.get(ids[0]).box;
  assert.equal(moved.minX - e.box.minX, 10);
  assert.equal(moved.minY - e.box.minY, -5);
});

test('ラベル：出さない設定・信号場・ズームアウトで一般駅を隠す', () => {
  const { store, ids } = lineOf([[0, 0], [4, 0], [8, 0]], ['A', 'B', 'C']);
  store.dispatch({ type: 'station/label', stationId: ids[0], fields: { hidden: true } });
  store.dispatch({ type: 'station/update', stationId: ids[1], fields: { rank: 'signal' } });
  store.dispatch({ type: 'station/update', stationId: ids[2], fields: { rank: 'terminal' } });
  let scene = buildSchematicScene(store.getState(), { measure });
  assert.equal(scene.labelInfo.has(ids[0]), false);
  assert.equal(scene.labelInfo.has(ids[1]), false);
  assert.equal(scene.labelInfo.has(ids[2]), true);
  store.dispatch({ type: 'station/label', stationId: ids[0], fields: { hidden: false } });
  scene = buildSchematicScene(store.getState(), { measure, level: 2 });
  assert.equal(scene.labelInfo.has(ids[0]), false, '一般駅は隠す');
  assert.equal(scene.labelInfo.has(ids[2]), true, 'ターミナルは残す');
  assert.equal(labelLevel(1), 0);
  assert.equal(labelLevel(0.5), 1);
  assert.equal(labelLevel(0.2), 2);
});

test('ラベルの中身：主表記・英字・改行・付帯施設・縦書き', () => {
  const { store, ids } = lineOf([[0, 0], [4, 0]], ['港町', 'B']);
  store.dispatch({ type: 'station/update', stationId: ids[0], fields: { reading: 'みなとまち', facilities: ['port'] } });
  store.dispatch({ type: 'station/label', stationId: ids[0], fields: { text: '港\n町' } });
  const p = store.getState();
  const st = p.stations[0];
  const opt = { style: p.style, subLanguages: p.locale.subLanguages, measure, level: 0, align: 'left', vertical: false };
  const b = buildBlock(st, opt);
  const texts = b.runs.filter((r) => r.kind === 'text').map((r) => r.text);
  assert.deepEqual(texts, ['港', '町', 'Minatomachi']);
  assert.equal(b.runs.filter((r) => r.kind === 'icon').length, 1);
  // ズームアウトの段階1では一般駅の英字を隠す
  const b1 = buildBlock(st, { ...opt, level: 1 });
  assert.deepEqual(b1.runs.filter((r) => r.kind === 'text').map((r) => r.text), ['港', '町']);
  // 縦書きは1文字ずつ
  const v = buildBlock({ ...st, label: { ...st.label, schematic: { ...st.label.schematic, text: undefined } } }, { ...opt, vertical: true });
  assert.deepEqual(v.runs.filter((r) => r.kind === 'text' && !r.rot).map((r) => r.text), ['港', '町']);
});

test('ラベル：駅名が空でも、駅番号を付けていればバッジだけの札を出す', () => {
  const { store, ids, lineId } = lineOf([[0, 0], [4, 0], [8, 0]], ['', '', '']);
  store.dispatch({ type: 'line/update', lineId, fields: { symbol: 'AB' } });
  let scene = buildSchematicScene(store.getState(), { measure });
  assert.equal(scene.labelInfo.size, 0, '番号なし・駅名なしなら出さない');
  store.dispatch({ type: 'line/numbering', lineId, fields: { enabled: true } });
  scene = buildSchematicScene(store.getState(), { measure });
  assert.equal(scene.labelInfo.size, 3);
  const labels = scene.items.filter((i) => i.kind === 'label');
  assert.deepEqual(labels.map((l) => l.runs.filter((r) => r.kind === 'badge').map((r) => r.prefix + r.number)[0]).sort(), ['AB01', 'AB02', 'AB03']);
  assert.equal(labels[0].runs.filter((r) => r.kind === 'text').length, 0);
  void ids;
});
