import { test, assert } from './harness.js';
import { pathData, parseFont, renderSvg, itemSvg, escapeXml } from '../js/render/backend-svg.js';
import { buildSchematicScene } from '../js/render/scene-schematic.js';
import { unionBoxes } from '../js/render/scene-legend.js';
import { throughNetwork } from './helpers.js';

const measure = (font, text) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
  return [...text].length * size;
};

test('SVG：まっすぐな線はそのまま、直角の角は円弧で丸める（右に曲がれば sweep 1）', () => {
  assert.equal(pathData([0, 0, 10, 0], 5), 'M0 0L10 0');
  assert.equal(pathData([0, 0, 10, 0, 10, 10], 5), 'M0 0L5 0A5 5 0 0 1 10 5L10 10');
  assert.equal(pathData([0, 0, 10, 0, 10, -10], 5), 'M0 0L5 0A5 5 0 0 0 10 -5L10 -10');
});

test('SVG：短い線分では、Canvas の arcTo と同じく半径を縮める。頂点ごとの半径も使う', () => {
  // 線分の長さ4、直角：接点は角から2まで
  assert.equal(pathData([0, 0, 4, 0, 4, 4], 10), 'M0 0L2 0A2 2 0 0 1 4 2L4 4');
  assert.equal(pathData([0, 0, 10, 0, 10, 10], 5, [0, 0, 0]), 'M0 0L10 0L10 10');
  // 45°の曲がり：接点までは r・tan(22.5°)
  const d = pathData([0, 0, 10, 0, 20, 10], 4);
  const t = 4 * Math.tan(Math.PI / 8);
  assert.ok(d.startsWith(`M0 0L${Math.round((10 - t) * 100) / 100} 0A4 4 0 0 1 `), d);
});

test('SVG：書体は属性にし、文字は置き換える', () => {
  assert.deepEqual(parseFont('700 24px "Hiragino Sans", sans-serif'), { 'font-weight': '700', 'font-size': 24, 'font-family': "'Hiragino Sans', sans-serif" });
  assert.equal(escapeXml(`<a & "b">`), '&lt;a &amp; &quot;b&quot;&gt;');
  const s = itemSvg({ kind: 'text', text: 'A&B', x: 1, y: 2, font: '500 12px sans-serif', color: '#000000', align: 'center', bbox: {} });
  assert.ok(s.includes('>A&amp;B</text>'), s);
  assert.ok(s.includes('text-anchor="middle"'));
  assert.ok(s.includes('dominant-baseline="central"'));
});

test('SVG：角丸の四角は、半径を辺の半分までに縮めて縦横で同じにする', () => {
  const s = itemSvg({ kind: 'rrect', x: 0, y: 0, w: 20, h: 8, r: 6, fill: '#FFFFFF', stroke: '#000000', lineWidth: 1, bbox: {} });
  assert.ok(s.includes('rx="4"') && s.includes('ry="4"'), s);
});

test('SVG：路線図の表示リストから文書を作る（余白・背景・透過・駅名の縁取り）', () => {
  const { store } = throughNetwork();
  const s = store.getState().style;
  store.dispatch({ type: 'project/style', fields: { legend: { ...s.legend, show: true }, title: { ...s.title, show: true } } });
  const scene = buildSchematicScene(store.getState(), { measure });
  const bounds = unionBoxes(scene.items);
  const svg = renderSvg(scene.items, { bounds, margin: 24, background: '#FFFFFF', title: 'テスト' });
  assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes(`viewBox="${bounds.minX - 24} `), '余白の分だけ広げる');
  assert.ok(svg.includes('<title>テスト</title>'));
  assert.ok(svg.includes('<rect x="'), '背景');
  assert.ok(!/NaN|undefined|null/.test(svg), '値の抜けがない');
  // 駅名は文字のまま。縁取り（stroke）が先、文字が後
  const i = svg.indexOf('>a1</text>');
  assert.ok(i > 0);
  const halo = svg.lastIndexOf('fill="none" stroke="#FFFFFF"', i);
  assert.ok(halo > 0 && halo < i);
  // 凡例とタイトルも文字のまま
  assert.ok(svg.includes('>A線</text>') && svg.includes('>テスト</text>'));
  const bg = `<rect x="${Math.round((bounds.minX - 24) * 100) / 100}" y="${Math.round((bounds.minY - 24) * 100) / 100}"`;
  assert.ok(svg.split('\n')[3].startsWith(bg), '背景は最初に描く');
  const clear = renderSvg(scene.items, { bounds, margin: 24, background: '#FFFFFF', transparent: true });
  assert.ok(!clear.includes(bg), '透過なら背景を描かない');
});
