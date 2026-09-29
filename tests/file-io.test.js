// JSON の往復（書き出して読み込むと同一）、ファイル名、読み込めないファイル、バックアップの案内
import { test, assert } from './harness.js';
import { exportFilename, serializeProject, parseProjectText } from '../js/storage/file-io.js';
import { needsBackupReminder } from '../js/storage/backup.js';
import { InvalidFileError, NewerVersionError } from '../js/core/migrate.js';
import { SCHEMA_VERSION } from '../js/core/schema.js';
import { storeWithLine } from './helpers.js';

/** いろいろな項目を使ったプロジェクト */
function richProject() {
  const { store, lineId, ids } = storeWithLine([[0, 0], [3, 0], [6, 2], [6, 6]]);
  store.dispatch({ type: 'line/update', lineId, fields: { symbol: 'AB', displayName: '湾岸ライン', kind: 'subway', note: 'メモ' } });
  store.dispatch({ type: 'line/numbering', lineId, fields: { enabled: true, separator: '-' } });
  store.dispatch({ type: 'line/fixNumbers', lineId });
  store.dispatch({ type: 'line/insertStop', lineId, sectionIndex: 1, newStation: { x: 4, y: 1 }, numbering: 'branch' });
  store.dispatch({ type: 'line/section', lineId, index: 0, fields: { maxSpeed: 60, schematicVia: [{ x: 1, y: -1 }], schematicBend: 'diagonalFirst' } });
  store.dispatch({ type: 'line/stop', lineId, index: 1, fields: { km: 1.25 } });
  store.dispatch({ type: 'station/update', stationId: ids[0], fields: { name: '本町', reading: 'ほんまち', rank: 'terminal', facilities: ['airport'], platforms: { type: 'island', faces: 2, tracks: 4 } } });
  store.dispatch({ type: 'station/label', stationId: ids[0], fields: { pos: 'N', dx: 3, dy: -2, orientation: 'vertical', text: '本\n町' } });
  store.dispatch({ type: 'interchange/add', stationIds: [ids[1], ids[3]] });
  store.dispatch({ type: 'project/romaji', fields: { longVowel: 'macron' } });
  store.dispatch({ type: 'project/view', view: 'schematic', state: { cx: 12.5, cy: -3, zoom: 1.7 }, silent: true });
  store.dispatch({ type: 'project/meta', fields: { lastBackupAt: '2026-01-02T03:04:05.000Z' }, silent: true });
  return store.getState();
}

test('JSON の往復：書き出して読み込むと同じ内容になる', () => {
  const p = richProject();
  const back = parseProjectText(serializeProject(p));
  assert.deepEqual(back, p);
  // もう一度往復しても同じ
  assert.deepEqual(parseProjectText(serializeProject(back)), p);
});

test('ファイル名：{プロジェクト名}_{yyyyMMdd-HHmm}.railmap.json。使えない文字は _', () => {
  const d = new Date(2026, 8, 7, 5, 3);
  assert.equal(exportFilename('湾岸路線図', d), '湾岸路線図_20260907-0503.railmap.json');
  assert.equal(exportFilename('a/b:c*?', d), 'a_b_c___20260907-0503.railmap.json');
  assert.equal(exportFilename('', d), 'railmap_20260907-0503.railmap.json');
});

test('読み込めないファイル：JSON でない・新しい版・壊れている', () => {
  assert.throws(() => parseProjectText('これはJSONではない'), InvalidFileError);
  assert.throws(() => parseProjectText(JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1 })), NewerVersionError);
  const p = richProject();
  const broken = { ...p, lines: [{ ...p.lines[0], operatorId: 'op_none' }] };
  assert.throws(() => parseProjectText(JSON.stringify(broken)), /broken/);
});

test('読み込み：足りない項目は補う（古い形のファイル）', () => {
  const minimal = { schemaVersion: 1, id: 'pj_old', name: '古い', createdAt: '2026-01-01T00:00:00.000Z', stations: [], lines: [], operators: [] };
  const p = parseProjectText(JSON.stringify(minimal));
  assert.equal(p.locale.region, 'jp');
  assert.equal(p.style.lineWidth > 0, true);
  assert.deepEqual(p.interchanges, []);
});

test('バックアップの案内：最後のバックアップ（なければ作った日）から7日以上', () => {
  const p = { createdAt: '2026-01-01T00:00:00.000Z', meta: {} };
  assert.equal(needsBackupReminder(p, new Date('2026-01-07T23:00:00.000Z')), false);
  assert.equal(needsBackupReminder(p, new Date('2026-01-08T00:00:00.000Z')), true);
  const q = { ...p, meta: { lastBackupAt: '2026-01-05T00:00:00.000Z' } };
  assert.equal(needsBackupReminder(q, new Date('2026-01-08T00:00:00.000Z')), false);
});
