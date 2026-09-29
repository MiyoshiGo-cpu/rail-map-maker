// サンプル（§7 フェーズ1 の13）と性能確認用のデータ（15）
import { test, assert, isNode } from './harness.js';
import { parseProjectText } from '../js/storage/file-io.js';
import { runChecks } from '../js/core/validate.js';
import { generateDebugProject } from '../js/core/debug-data.js';

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

test('性能確認用のデータ：駅200・路線20で、毎回同じもの', () => {
  const a = generateDebugProject({ now: '2026-01-01T00:00:00.000Z' });
  const b = generateDebugProject({ now: '2026-01-01T00:00:00.000Z' });
  assert.equal(a.stations.length, 200);
  assert.equal(a.lines.length, 20);
  assert.ok(a.lines.every((l) => l.stops.length >= 2));
  assert.deepEqual(a.stations.map((s) => s.schematic), b.stations.map((s) => s.schematic));
});
