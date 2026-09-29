// サンプル（§7 フェーズ1 の13）と性能確認用のデータ（15）
import { test, assert, isNode } from './harness.js';
import { parseProjectText } from '../js/storage/file-io.js';
import { runChecks } from '../js/core/validate.js';
import { generateDebugProject } from '../js/core/debug-data.js';
import { expandService, stopFlags, stopIds, throughJoints } from '../js/core/services.js';
import { chartTargets, buildStopChart } from '../js/core/stopchart.js';

async function readSample() {
  if (isNode) {
    const { readFileSync } = await import('node:fs');
    return readFileSync(new URL('../samples/sample-metro.railmap.json', import.meta.url), 'utf8');
  }
  return (await fetch('../samples/sample-metro.railmap.json')).text();
}

test('サンプル：環状線1本・私鉄2本・地下鉄2本・乗換グループ2つ・駅25前後で、エラーがない', async () => {
  const p = parseProjectText(await readSample());
  const lines = p.lines;
  assert.equal(lines.filter((l) => l.isLoop).length, 1);
  assert.equal(lines.filter((l) => l.kind === 'subway').length, 2);
  const cat = new Map(p.operators.map((o) => [o.id, o.category]));
  assert.equal(lines.filter((l) => ['major', 'semiMajor', 'minor'].includes(cat.get(l.operatorId))).length, 2);
  assert.equal(p.interchanges.length, 2);
  assert.ok(p.stations.length >= 22 && p.stations.length <= 30, `駅 ${p.stations.length}`);
  assert.deepEqual(runChecks(p).filter((c) => c.level === 'error'), []);
  // すべての駅に英字がある
  assert.deepEqual(p.stations.filter((s) => !s.names.en).map((s) => s.name), []);
});

test('サンプル：私鉄 → 地下鉄 → 私鉄 の直通急行（地下鉄内は各駅停車）があり、停車駅案内図に出る（フェーズ2の完了条件）', async () => {
  const p = parseProjectText(await readSample());
  const name = (id) => p.stations.find((s) => s.id === id).name;
  const typeName = (id) => p.serviceTypes.find((x) => x.id === id).name;
  const through = p.services.find((sv) => throughJoints(p, sv).length === 2);
  assert.ok(through, '直通急行がない');
  assert.deepEqual(through.segments.map((s) => typeName(s.typeId)), ['急行', '各駅停車', '急行']);
  const path = expandService(p, through);
  assert.ok(path.ok);
  const stops = stopIds(path, stopFlags(p, through, path)).map(name);
  // 2号線（西公園〜東湾）の駅にはすべて止まる
  for (const n of ['西公園', '川端', '大通', '本町', '東町', '東湾']) assert.ok(stops.includes(n), n);
  const chain = chartTargets(p).find((x) => x.kind === 'chain');
  const chart = buildStopChart(p, chain.id);
  const row = chart.rows.find((r) => r.serviceIds.includes(through.id));
  assert.deepEqual(row.typeIds.map(typeName), ['急行', '各駅停車', '急行']);
  // 種別・系統のチェックに問題がない（使われていない種別もない）
  assert.deepEqual(runChecks(p).filter((c) => c.level !== 'info' || c.code === 'unusedServiceType'), []);
});

test('性能確認用のデータ：駅200・路線20で、毎回同じもの', () => {
  const a = generateDebugProject({ now: '2026-01-01T00:00:00.000Z' });
  const b = generateDebugProject({ now: '2026-01-01T00:00:00.000Z' });
  assert.equal(a.stations.length, 200);
  assert.equal(a.lines.length, 20);
  assert.ok(a.lines.every((l) => l.stops.length >= 2));
  assert.deepEqual(a.stations.map((s) => s.schematic), b.stations.map((s) => s.schematic));
});
