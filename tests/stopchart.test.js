// 停車駅案内図（§5.5）の中身：対象・列・路線ごとの範囲・行（停車駅が同じ系統をまとめる）・直通先
import { test, assert } from './harness.js';
import { newStore, throughNetwork } from './helpers.js';
import { chartTargets, buildStopChart } from '../js/core/stopchart.js';
import { findRoutes } from '../js/core/network.js';

/** A線 → B線 → C線 の直通急行（B線内は各駅停車）と、各線の各駅停車・C線の急行 */
function chartNetwork() {
  const net = throughNetwork();
  const { store, d, S, type, opA, opB, opC } = net;
  const add = (a, b, typeId, fields) => d({ type: 'service/add', route: findRoutes(store.getState(), a, b)[0].segments, typeId, fields });
  const through = add(S.a0, S.c3, type(opA, '急行'), { name: '直通急行' });
  d({ type: 'service/segmentType', serviceId: through, index: 1, typeId: type(opB, '各駅停車') });
  add(S.a0, S.J1, type(opA, '各駅停車'));
  add(S.J1, S.J2, type(opB, '各駅停車'));
  add(S.J2, S.c3, type(opC, '各駅停車'));
  add(S.J2, S.c3, type(opC, '急行'));
  const names = (ids) => ids.map((id) => store.getState().stations.find((s) => s.id === id).name);
  const typeName = (id) => store.getState().serviceTypes.find((x) => x.id === id).name;
  return { ...net, through, names, typeName };
}

const stopsOf = (chart, row, names) => names(chart.columns.map((c) => c.stationId).filter((_, i) => row.cells[i] && row.cells[i].stop));

test('案内図の対象：路線1本ずつと、直通の系統が通る路線の並び', () => {
  const { store, lineA, lineB, lineC } = chartNetwork();
  const targets = chartTargets(store.getState());
  assert.deepEqual(targets.map((x) => x.kind), ['line', 'line', 'line', 'chain']);
  assert.deepEqual(targets[3].lineIds, [lineA, lineB, lineC]);
});

test('案内図：直通の並びは、路線をつないで駅を並べ、事業者ごとの範囲を持つ', () => {
  const { store, names, opA, opB, opC } = chartNetwork();
  const chain = chartTargets(store.getState()).find((x) => x.kind === 'chain');
  const chart = buildStopChart(store.getState(), chain.id);
  assert.deepEqual(names(chart.columns.map((c) => c.stationId)), ['a0', 'a1', 'J1', 'b1', 'b2', 'J2', 'c1', 'c2', 'c3']);
  assert.deepEqual(chart.bands.map((b) => [b.start, b.end, b.operatorId]), [[0, 2, opA], [2, 5, opB], [5, 8, opC]]);
});

test('案内図：行は遅い順。各社の「各駅停車」は1行にまとめ、直通急行は B線内で種別が変わる（完了条件）', () => {
  const { store, names, typeName, through } = chartNetwork();
  const chain = chartTargets(store.getState()).find((x) => x.kind === 'chain');
  const chart = buildStopChart(store.getState(), chain.id);
  assert.equal(chart.rows.length, 2);
  const [local, express] = chart.rows;
  assert.deepEqual(local.typeIds.map(typeName), ['各駅停車', '各駅停車', '各駅停車']);
  assert.deepEqual(stopsOf(chart, local, names), ['a0', 'a1', 'J1', 'b1', 'b2', 'J2', 'c1', 'c2', 'c3']);
  assert.deepEqual(express.typeIds.map(typeName), ['急行', '各駅停車', '急行']);
  // 駅間ごとの種別：a0-a1-J1 は急行、J1-…-J2 は各駅停車、J2-c1-c2-c3 は急行
  assert.deepEqual(express.hops.map(typeName), ['急行', '急行', '各駅停車', '各駅停車', '各駅停車', '急行', '急行', '急行']);
  assert.deepEqual(stopsOf(chart, express, names), ['a0', 'a1', 'J1', 'b1', 'b2', 'J2', 'c1', 'c3']);
  assert.equal(express.serviceIds[0], through);
  // C線の急行は、直通急行と停車駅が同じなので同じ行
  assert.equal(express.serviceIds.length, 2);
  assert.deepEqual([express.start, express.end], [0, 8]);
  assert.ok(express.sec > 0);
});

test('案内図：路線1本なら、ほかの路線へ続く行に「直通」の印（どちら側・どの路線）', () => {
  const { store, lineA, lineB, lineC, typeName } = chartNetwork();
  const chartB = buildStopChart(store.getState(), 'line:' + lineB);
  // B線内は、B線の各駅停車と直通急行（B線内は各停）が同じ停車駅なので1行
  assert.equal(chartB.rows.length, 1);
  const exits = chartB.rows[0].exits.map((e) => [e.col, e.side, e.lineId]).sort();
  assert.deepEqual(exits, [[0, 'before', lineA], [3, 'after', lineC]].sort());
  const chartA = buildStopChart(store.getState(), 'line:' + lineA);
  assert.deepEqual(chartA.rows.map((r) => r.typeIds.map(typeName).join()), ['各駅停車', '急行']);
  assert.deepEqual(chartA.rows[1].exits.map((e) => [e.col, e.side, e.lineId]), [[2, 'after', lineB]]);
  assert.deepEqual(chartA.rows[0].exits, []);
});

test('案内図：同じ種別でも停車駅が違えば別の行にして、系統名を添える印を付ける', () => {
  const { store, d, S, opC, type, lineC } = chartNetwork();
  const other = d({ type: 'service/add', route: findRoutes(store.getState(), S.J2, S.c3)[0].segments, typeId: type(opC, '急行') });
  d({ type: 'service/setStop', serviceId: other, stationId: S.c2, stop: true });
  const chart = buildStopChart(store.getState(), 'line:' + lineC);
  const named = chart.rows.filter((r) => r.named);
  assert.equal(named.length, 2);
});

test('案内図：環状線は起点に戻るところまで並べ、一周する系統は全体を1行で描く（直通の印は出さない）', () => {
  const store = newStore();
  const ids = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => store.dispatch({ type: 'station/add', x, y }));
  const lineId = store.dispatch({ type: 'line/add', stationIds: ids });
  store.dispatch({ type: 'line/setLoop', lineId, isLoop: true });
  store.dispatch({ type: 'serviceType/addPreset', operatorId: store.getState().operators[0].id, presetId: 'tram' });
  const typeId = store.getState().serviceTypes[0].id;
  const [loop] = findRoutes(store.getState(), ids[2], ids[2]);
  store.dispatch({ type: 'service/add', route: loop.segments, typeId });
  const chart = buildStopChart(store.getState(), 'line:' + lineId);
  assert.deepEqual(chart.columns.map((c) => c.stationId), [...ids, ids[0]]);
  assert.equal(chart.rows.length, 1);
  assert.ok(chart.rows[0].cells.every(Boolean));
  assert.deepEqual(chart.rows[0].exits, []);
  assert.equal(buildStopChart(store.getState(), 'line:none'), null);
});
