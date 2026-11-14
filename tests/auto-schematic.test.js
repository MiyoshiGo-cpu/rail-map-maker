// 地理の配置から路線図を自動で作る（§7 フェーズ4 の完了条件「地理ビューで引いた路線から路線図を自動で作り、手直しできる」）
import { test, assert, isNode } from './harness.js';
import { layoutSchematic, autoSchematic, nearestOctant, MIN_STEPS } from '../js/core/auto-schematic.js';
import { parseProjectText } from '../js/storage/file-io.js';
import { sectionCount } from '../js/core/defaults.js';
import { newStore, strip } from './helpers.js';

const isOcti = (a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
};
const steps = (a, b) => Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));

/** 駅の並び（地理 km）から、1本の路線の入力を作る */
function lineInput(name, pts) {
  const nodes = pts.map(([x, y], i) => ({ id: `${name}${i}`, geo: { x, y } }));
  const edges = nodes.slice(1).map((nd, i) => ({ a: nodes[i].id, b: nd.id }));
  return { nodes, edges };
}

/** 重なりがないこと */
function assertNoOverlap(positions) {
  const seen = new Map();
  for (const [id, q] of positions) {
    const k = q.x + ',' + q.y;
    assert.ok(!seen.has(k), `${id} と ${seen.get(k)} が同じ格子点 ${k}`);
    seen.set(k, id);
  }
}

test('自動配置：向きの番号（東から時計回り、y は下向き）', () => {
  assert.equal(nearestOctant(1, 0), 0);
  assert.equal(nearestOctant(1, 0.9), 1);
  assert.equal(nearestOctant(0.1, 1), 2);
  assert.equal(nearestOctant(-1, 0.2), 4);
  assert.equal(nearestOctant(0.3, -1), 6);
  assert.equal(nearestOctant(1, -1.1), 7);
});

test('自動配置：少し曲がった東西の路線は、水平な1本の線になる（駅間は2マス以上、順番どおり）', () => {
  const input = lineInput('a', [[0, 0], [1.1, 0.2], [2.0, -0.15], [3.2, 0.1], [4.1, 0.3]]);
  const { positions, stats } = layoutSchematic(input);
  const pts = input.nodes.map((nd) => positions.get(nd.id));
  for (let i = 1; i < pts.length; i++) {
    assert.equal(pts[i].y, pts[0].y, '水平');
    assert.ok(pts[i].x - pts[i - 1].x >= MIN_STEPS, `駅間 ${pts[i].x - pts[i - 1].x}`);
  }
  assert.equal(stats.octilinear, stats.sections);
  // 左上が (0, 0)
  assert.equal(Math.min(...pts.map((q) => q.x)), 0);
  assert.equal(Math.min(...pts.map((q) => q.y)), 0);
});

test('自動配置：中央で交わる2路線は、中央の駅から4つの別々の向きに伸びる', () => {
  const ew = lineInput('e', [[-3, 0.2], [-1.4, -0.1], [0, 0], [1.6, 0.2], [3.1, -0.2]]);
  const ns = lineInput('n', [[0.3, -3], [-0.2, -1.5], [0, 0], [0.2, 1.4], [-0.1, 3]]);
  // 中央の駅は同じ駅にする
  ns.nodes[2] = ew.nodes[2];
  ns.edges[1].b = 'e2';
  ns.edges[2].a = 'e2';
  const input = { nodes: [...ew.nodes, ...ns.nodes.filter((nd) => nd.id !== 'e2')], edges: [...ew.edges, ...ns.edges] };
  const { positions, stats } = layoutSchematic(input);
  assertNoOverlap(positions);
  assert.equal(stats.octilinear, stats.sections);
  const c = positions.get('e2');
  const dirs = ['e1', 'e3', 'n1', 'n3'].map((id) => nearestOctant(positions.get(id).x - c.x, positions.get(id).y - c.y));
  assert.equal(new Set(dirs).size, 4, `向き ${dirs}`);
  // 東西の線は東西、南北の線は南北のまま
  assert.ok(positions.get('e0').x < c.x && positions.get('e4').x > c.x);
  assert.ok(positions.get('n0').y < c.y && positions.get('n4').y > c.y);
});

test('自動配置：1つの駅から近い向きに出る6本の枝は、別々の向きに分かれる', () => {
  const nodes = [{ id: 'hub', geo: { x: 0, y: 0 } }];
  const edges = [];
  // 東寄りに3本、西寄りに3本（地理ではどれも東か西が一番近い）
  [[3, 0.3], [3, -0.4], [3, 1.2], [-3, 0.2], [-3, -0.9], [-3, 1.1]].forEach(([x, y], i) => {
    nodes.push({ id: 'b' + i, geo: { x, y } });
    edges.push({ a: 'hub', b: 'b' + i });
  });
  const { positions } = layoutSchematic({ nodes, edges });
  assertNoOverlap(positions);
  const c = positions.get('hub');
  const dirs = nodes.slice(1).map((nd) => {
    const q = positions.get(nd.id);
    assert.ok(isOcti(c, q), `${nd.id} が八方向でない`);
    return nearestOctant(q.x - c.x, q.y - c.y);
  });
  assert.equal(new Set(dirs).size, 6, `向き ${dirs}`);
});

test('自動配置：駅の無い線上に、ほかの路線の駅を置かない／同じ入力なら同じ結果', () => {
  // 東西の線のすぐ近くを、別の路線の駅が通る
  const a = lineInput('a', [[0, 0], [4, 0], [8, 0]]);
  const b = lineInput('b', [[2, -3], [2.1, 0.1], [2.3, 3]]);
  const input = { nodes: [...a.nodes, ...b.nodes], edges: [...a.edges, ...b.edges] };
  const r1 = layoutSchematic(input);
  const r2 = layoutSchematic(input);
  assert.deepEqual([...r1.positions], [...r2.positions]);
  assertNoOverlap(r1.positions);
  assert.equal(r1.stats.through, 0);
});

/** サンプル（地形なし）の駅に、路線図をゆがめた地理座標を付ける（回転・波・決まったずれ） */
async function warpedSample() {
  let text;
  if (isNode) {
    const { readFileSync } = await import('node:fs');
    text = readFileSync(new URL('../samples/sample-metro.railmap.json', import.meta.url), 'utf8');
  } else {
    text = await (await fetch('../samples/sample-metro.railmap.json')).text();
  }
  const p = parseProjectText(text);
  const c = 0.955; // cos(17°) くらい
  const s = 0.292;
  p.stations = p.stations.map((st, i) => {
    const x = st.schematic.x * 0.8;
    const y = st.schematic.y * 0.8;
    const jx = (((i * 37) % 11) - 5) * 0.06;
    const jy = (((i * 53) % 13) - 6) * 0.05;
    return { ...st, geo: { x: 40 + x * c - y * s + jx + (y * y) * 0.02, y: 40 + x * s + y * c + jy } };
  });
  return p;
}

test('自動配置：サンプルの路線網は、重ならず、ほぼすべての駅間が八方向で、線がほかの駅の上を通らない', async () => {
  const p = await warpedSample();
  const { positions, stats } = autoSchematic(p);
  const map = new Map(Object.entries(positions));
  assert.equal(map.size, p.stations.length);
  assertNoOverlap(map);
  assert.equal(stats.through, 0);
  assert.ok(stats.octilinear >= stats.sections * 0.9, `八方向 ${stats.octilinear}/${stats.sections}`);
  // 路線のつながり：すべての路線の駅に位置があり、駅間は1マス以上
  for (const line of p.lines) {
    const n = sectionCount(line);
    for (let i = 0; i < n; i++) {
      const a = positions[line.stops[i].stationId];
      const b = positions[line.stops[(i + 1) % line.stops.length].stationId];
      assert.ok(a && b && steps(a, b) >= 1);
    }
  }
  // 乗換グループの駅は2マス以内
  for (const ic of p.interchanges) {
    for (const x of ic.stationIds) for (const y of ic.stationIds) assert.ok(steps(positions[x], positions[y]) <= 2, '乗換グループ');
  }
});

test('自動配置のアクション：駅を置き直し、経由点・曲がり方・札の位置を消す。1手で取り消せる', () => {
  const store = newStore();
  const ids = [[0, 0], [5, 3], [9, 1]].map(([x, y]) => store.dispatch({ type: 'station/add', x, y }));
  const lineId = store.dispatch({ type: 'line/add', stationIds: ids });
  // 地理（東西にほぼまっすぐ）
  [[10, 10], [12.1, 10.2], [14, 9.9]].forEach(([x, y], i) => store.dispatch({ type: 'station/update', stationId: ids[i], fields: { geo: { x, y } } }));
  store.dispatch({ type: 'line/section', lineId, index: 0, fields: { schematicVia: [{ x: 2, y: 3 }], schematicBend: 'diagonalFirst' } });
  store.dispatch({ type: 'station/label', stationId: ids[1], fields: { pos: 'E', dx: 4, dy: -2 } });
  store.dispatch({ type: 'station/label', stationId: ids[1], view: 'geo', fields: { pos: 'W', dx: 1 } });
  const before = strip(store.getState());

  const { positions } = autoSchematic(store.getState());
  store.dispatch({ type: 'station/autoLayout', positions });
  const p = store.getState();
  const pos = ids.map((id) => p.stations.find((s) => s.id === id).schematic);
  assert.ok(pos[0].y === pos[1].y && pos[1].y === pos[2].y, '水平に並ぶ');
  const sec = p.lines[0].sections[0];
  assert.equal(sec.schematicVia, undefined);
  assert.equal(sec.schematicBend, undefined);
  const label = p.stations.find((s) => s.id === ids[1]).label;
  assert.equal(label.schematic.pos, 'auto');
  assert.equal(label.schematic.dx, undefined);
  // 地理ビューの札と、地理の位置はそのまま
  assert.deepEqual(label.geo, before.stations.find((s) => s.id === ids[1]).label.geo);
  assert.deepEqual(p.stations.map((s) => s.geo), before.stations.map((s) => s.geo));

  // 置き直したあとも手直しできる（駅を動かせる）
  store.dispatch({ type: 'station/move', ids: [ids[2]], dx: 0, dy: 1 });
  store.undo();
  store.undo();
  assert.deepEqual(strip(store.getState()), before);
});

test('自動配置：地理の位置が無い駅も、路線図の位置から見積もって置く', () => {
  const store = newStore();
  const ids = [[0, 0], [3, 0], [6, 0]].map(([x, y]) => store.dispatch({ type: 'station/add', x, y }));
  store.dispatch({ type: 'line/add', stationIds: ids });
  store.dispatch({ type: 'station/update', stationId: ids[0], fields: { geo: { x: 0, y: 0 } } });
  store.dispatch({ type: 'station/update', stationId: ids[1], fields: { geo: { x: 3, y: 0 } } });
  const { positions } = autoSchematic(store.getState());
  assert.equal(Object.keys(positions).length, 3);
  assertNoOverlap(new Map(Object.entries(positions)));
  assert.ok(positions[ids[2]].x > positions[ids[1]].x);
});
