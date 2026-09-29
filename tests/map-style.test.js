// スタイル（§5.8）：プリセットの適用・モノクロの区別・広域の目盛り・夜間の色・案内図の色づかい
import { test, assert } from './harness.js';
import { newStore, throughNetwork } from './helpers.js';
import { stylePresets, applyStylePreset, matchesPreset } from '../js/core/map-style.js';
import { defaultStyle } from '../js/core/defaults.js';
import { buildSchematicScene } from '../js/render/scene-schematic.js';
import { buildStopChartScene } from '../js/render/scene-stopchart.js';
import { buildStopChart, chartTargets } from '../js/core/stopchart.js';
import { findRoutes } from '../js/core/network.js';
import { toGray, mix } from '../js/core/color.js';

const measure = (font, text) => [...text].length * Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
const isGray = (hex) => hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);

/** 2本の路線（共通の駅なし）と、一般駅・ターミナル */
function twoLines() {
  const store = newStore();
  const d = (a) => store.dispatch(a);
  const a = [[0, 0], [4, 0], [8, 0]].map(([x, y], i) => d({ type: 'station/add', x, y, fields: { name: 'A' + i, rank: i === 0 ? 'terminal' : 'normal' } }));
  const b = [[0, 6], [4, 6], [8, 6]].map(([x, y], i) => d({ type: 'station/add', x, y, fields: { name: 'B' + i } }));
  d({ type: 'line/add', fields: { color: '#E8541E' }, stationIds: a });
  d({ type: 'line/add', fields: { color: '#0079C2' }, stationIds: b });
  return { store, d, a, b };
}

test('スタイル：プリセットは4つ（都市鉄道・広域・モノクロ印刷・夜間）。既定の見た目は都市鉄道と同じ', () => {
  assert.deepEqual(stylePresets('jp').map((x) => x.id), ['urban', 'wide', 'mono', 'night']);
  const s = defaultStyle();
  assert.equal(s.preset, 'urban');
  assert.ok(matchesPreset(s, 'jp'));
  const night = applyStylePreset(s, 'night', 'jp');
  assert.equal(night.preset, 'night');
  assert.equal(night.background, '#1B2530');
  assert.ok(!matchesPreset({ ...night, lineWidth: 9 }, 'jp'));
  // プリセットに無い項目（表示の切り替えなど）はそのまま
  assert.equal(applyStylePreset({ ...s, showAbolished: true }, 'mono', 'jp').showAbolished, true);
});

test('スタイル：プリセットを選ぶと詳細設定をまとめて書き換え、取り消せる', () => {
  const { store } = twoLines();
  store.dispatch({ type: 'project/stylePreset', presetId: 'wide' });
  assert.equal(store.getState().style.stationSymbol, 'tick');
  assert.equal(store.getState().style.lineWidth, 4);
  store.undo();
  assert.equal(store.getState().style.stationSymbol, 'circle');
});

test('スタイル：モノクロでは路線を灰色の濃淡と破線で区別する', () => {
  const { store } = twoLines();
  store.dispatch({ type: 'project/stylePreset', presetId: 'mono' });
  const scene = buildSchematicScene(store.getState(), { measure });
  const paths = [...scene.sectionItems.values()];
  const byLine = new Map();
  for (const it of paths) byLine.set(it.target.lineId, it);
  const [x, y] = [...byLine.values()];
  assert.ok(isGray(x.color) && isGray(y.color));
  assert.ok(x.color !== y.color || JSON.stringify(x.dash) !== JSON.stringify(y.dash));
  assert.equal(toGray('#FFFFFF'), '#FFFFFF');
  assert.equal(toGray('#000000'), '#000000');
  assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080');
});

test('スタイル：広域では、1つの路線だけが通る一般駅を目盛りにする（ターミナルは丸のまま）', () => {
  const { store, a } = twoLines();
  store.dispatch({ type: 'project/stylePreset', presetId: 'wide' });
  const scene = buildSchematicScene(store.getState(), { measure });
  assert.equal(scene.stationItems.get(a[1]).kind, 'path');
  assert.equal(scene.stationItems.get(a[1]).color, '#E8541E');
  assert.equal(scene.stationItems.get(a[0]).kind, 'circle');
});

test('スタイル：夜間は駅の地と文字の色を変える', () => {
  const { store, a } = twoLines();
  store.dispatch({ type: 'project/stylePreset', presetId: 'night' });
  const p = store.getState();
  const scene = buildSchematicScene(p, { measure });
  const st = scene.stationItems.get(a[0]);
  assert.equal(st.fill, p.style.paper);
  const label = scene.items.find((it) => it.kind === 'label' && it.target.id === a[0]);
  assert.equal(label.halo, p.style.paper);
  assert.ok(label.runs.some((r) => r.kind === 'text' && r.color === p.style.ink));
});

test('スタイル：案内図にも色づかいを当てる（モノクロなら種別の札も灰色）', () => {
  const { store, d, S, opA, type } = throughNetwork();
  d({ type: 'service/add', route: findRoutes(store.getState(), S.a0, S.c3)[0].segments, typeId: type(opA, '急行') });
  d({ type: 'project/stylePreset', presetId: 'mono' });
  const p = store.getState();
  const chain = chartTargets(p).find((x) => x.kind === 'chain');
  const scene = buildStopChartScene(p, buildStopChart(p, chain.id), { measure, layout: 'horizontal', mapT: (k) => k });
  const badges = scene.items.filter((it) => it.kind === 'rrect');
  assert.ok(badges.length > 0);
  assert.ok(badges.every((it) => isGray(it.fill)), badges.map((it) => it.fill).join());
});
