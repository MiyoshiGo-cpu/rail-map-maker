import { test, assert } from './harness.js';
import { buildSignboard, signboardLines, signboardStations, neighborIndex } from '../js/core/signboard.js';
import { buildSignboardScene, SIGN_WIDTH } from '../js/render/scene-signboard.js';
import { normalizeProject } from '../js/core/defaults.js';
import { mapTranslator } from '../js/i18n/i18n.js';
import { newStore, throughNetwork } from './helpers.js';

const measure = (font, text) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
  return [...text].length * size;
};
const mapT = mapTranslator('ja');

/** 名前つきの駅を横に並べて1本の路線にする */
function line(names, opt = {}) {
  const store = newStore();
  const ids = names.map((n, i) => store.dispatch({ type: 'station/add', x: i * 2, y: opt.loop && i % 2 ? 2 : 0, fields: { name: n, reading: 'えき' } }));
  const lineId = store.dispatch({ type: 'line/add', stationIds: ids, fields: { symbol: 'A' } });
  if (opt.loop) store.dispatch({ type: 'line/setLoop', lineId, isLoop: true });
  return { store, ids, lineId };
}

test('駅名標：前後の駅は左が起点側、右が終点側', () => {
  const { store, ids } = line(['あ', 'い', 'う', 'え']);
  const sb = buildSignboard(store.getState(), ids[1]);
  assert.equal(sb.station.name, 'い');
  assert.equal(sb.prev.name, 'あ');
  assert.equal(sb.next.name, 'う');
});

test('駅名標：終端の駅は片側だけ', () => {
  const { store, ids } = line(['あ', 'い', 'う']);
  const p = store.getState();
  const first = buildSignboard(p, ids[0]);
  assert.equal(first.prev, null);
  assert.equal(first.next.name, 'い');
  const last = buildSignboard(p, ids[2]);
  assert.equal(last.prev.name, 'い');
  assert.equal(last.next, null);
});

test('駅名標：環状線は一周でつなぐ（起点の左は最後の駅、最後の右は起点）', () => {
  const { store, ids } = line(['あ', 'い', 'う', 'え'], { loop: true });
  const p = store.getState();
  assert.equal(p.lines[0].isLoop, true);
  const first = buildSignboard(p, ids[0]);
  assert.equal(first.prev.name, 'え');
  assert.equal(first.next.name, 'い');
  const last = buildSignboard(p, ids[3]);
  assert.equal(last.prev.name, 'う');
  assert.equal(last.next.name, 'あ');
});

test('駅名標：信号場・貨物駅・車両基地は前後の駅に出さずに飛ばす', () => {
  const { store, ids } = line(['あ', '信号', 'う', '基地']);
  store.dispatch({ type: 'station/update', stationId: ids[1], fields: { rank: 'signal' } });
  store.dispatch({ type: 'station/update', stationId: ids[3], fields: { rank: 'depot' } });
  const p = store.getState();
  const sb = buildSignboard(p, ids[2]);
  assert.equal(sb.prev.name, 'あ');
  assert.equal(sb.next, null, '先が車両基地だけなら終端と同じ');
  assert.deepEqual(signboardStations(p).map((s) => s.name), ['あ', 'う']);
  const byId = new Map(p.stations.map((s) => [s.id, s]));
  assert.equal(neighborIndex(p.lines[0], byId, 0, -1), -1);
  assert.equal(neighborIndex(p.lines[0], byId, 0, 1), 2);
});

test('駅名標：2つの路線が通る駅は路線を選べる（既定は並び順が最初の路線）。駅番号はその路線のもの', () => {
  const { store, S, lineA, lineB } = throughNetwork();
  const p = store.getState();
  assert.deepEqual(signboardLines(p, S.J1).map((l) => l.id), [lineA, lineB]);
  const a = buildSignboard(p, S.J1);
  assert.equal(a.line.id, lineA);
  assert.equal(a.prev.name, 'a1');
  assert.equal(a.next, null, 'J1 は A線の終点');
  const b = buildSignboard(p, S.J1, lineB);
  assert.equal(b.prev, null, 'J1 は B線の起点');
  assert.equal(b.next.name, 'b1');
  store.dispatch({ type: 'line/update', lineId: lineB, fields: { symbol: 'B', numbering: { ...p.lines.find((l) => l.id === lineB).numbering, enabled: true } } });
  const c = buildSignboard(store.getState(), S.J1, lineB);
  assert.equal(c.station.number.code, 'B01');
  assert.equal(c.next.number.code, 'B02');
});

test('駅名標：多言語は英字と地図の言語のほかの表記', () => {
  const { store, ids } = line(['あ', 'い']);
  store.dispatch({ type: 'station/update', stationId: ids[0], fields: { names: { en: 'A', ja: 'あ', ko: '아', 'zh-Hans': '阿' }, subName: '大学前' } });
  const sb = buildSignboard(store.getState(), ids[0]);
  assert.equal(sb.station.en, 'A');
  assert.equal(sb.station.subName, '大学前');
  assert.deepEqual(sb.station.others, ['아', '阿']);
});

test('駅名標：3つのテンプレートで表示リストを作る（値の抜けがなく、前後の駅を押せる）', () => {
  const { store, ids } = line(['あ', 'い', 'う']);
  for (const template of ['band', 'number', 'kana']) {
    const s = store.getState().style.signboard;
    store.dispatch({ type: 'project/style', fields: { signboard: { ...s, template } } });
    const p = store.getState();
    const scene = buildSignboardScene(p, buildSignboard(p, ids[1]), { measure, mapT });
    assert.ok(scene.items.length > 5, template);
    for (const it of scene.items) {
      for (const v of Object.values(it.bbox)) assert.ok(Number.isFinite(v), `${template} ${it.kind}`);
    }
    assert.equal(scene.bounds.maxX, SIGN_WIDTH + 1);
    assert.deepEqual(scene.hits.map((x) => x.stationId), [ids[0], ids[2]], template);
    // 文字は駅名標の幅に収まる
    for (const it of scene.items.filter((x) => x.kind === 'text')) {
      assert.ok(it.bbox.minX >= 0 && it.bbox.maxX <= SIGN_WIDTH, `${template}：${it.text}`);
    }
  }
});

test('駅名標：表示項目を外すと出さない。長い駅名は幅に収める', () => {
  const { store, ids } = line(['とても長い名前の駅がここにありますとても長い', 'い']);
  store.dispatch({ type: 'station/update', stationId: ids[0], fields: { names: { en: 'Nagai' } } });
  const texts = () => {
    const p = store.getState();
    const scene = buildSignboardScene(p, buildSignboard(p, ids[0]), { measure, mapT });
    return scene.items.filter((x) => x.kind === 'text');
  };
  let t = texts();
  assert.ok(t.some((x) => x.text === 'Nagai'));
  assert.ok(t.some((x) => x.text === 'い'));
  const name = t.find((x) => x.text.startsWith('とても'));
  assert.ok(name.bbox.maxX - name.bbox.minX <= SIGN_WIDTH - 72 + 1e-6);
  const s = store.getState().style.signboard;
  store.dispatch({ type: 'project/style', fields: { signboard: { ...s, items: { ...s.items, en: false, neighbors: false } } } });
  t = texts();
  assert.ok(!t.some((x) => x.text === 'Nagai'));
  assert.ok(!t.some((x) => x.text === 'い'));
});

test('駅名標：読み込んだデータに設定が無ければ既定で補う', () => {
  const { store } = line(['あ', 'い']);
  const p = JSON.parse(JSON.stringify(store.getState()));
  p.style.signboard = { template: 'kana', items: { en: false } };
  const n = normalizeProject(p);
  assert.equal(n.style.signboard.template, 'kana');
  assert.equal(n.style.signboard.items.en, false);
  assert.equal(n.style.signboard.items.neighbors, true);
  delete p.style.signboard;
  assert.equal(normalizeProject(p).style.signboard.template, 'band');
});
