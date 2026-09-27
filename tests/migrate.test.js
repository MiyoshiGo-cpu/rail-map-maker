import { test, assert } from './harness.js';
import { migrate, NewerVersionError, InvalidFileError } from '../js/core/migrate.js';
import { SCHEMA_VERSION } from '../js/core/schema.js';
import { createProject, normalizeProject } from '../js/core/defaults.js';

test('マイグレーション：現在の版はそのまま', () => {
  const p = createProject({ name: 'a' });
  assert.deepEqual(migrate(p), p);
});

test('マイグレーション：古い版から順に変換を当てる', () => {
  const migrations = {
    1: (p) => ({ ...p, added: 'v2' }),
    2: (p) => ({ ...p, added: p.added + '→v3', other: true }),
  };
  const out = migrate({ schemaVersion: 1, name: 'x' }, { migrations, target: 3 });
  assert.deepEqual(out, { schemaVersion: 3, name: 'x', added: 'v2→v3', other: true });
});

test('マイグレーション：アプリより新しい版は読み込まない', () => {
  assert.throws(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 }), NewerVersionError);
});

test('マイグレーション：版がない・オブジェクトでないものは読み込まない', () => {
  assert.throws(() => migrate({ name: 'x' }), InvalidFileError);
  assert.throws(() => migrate([]), InvalidFileError);
  assert.throws(() => migrate(null), InvalidFileError);
  assert.throws(() => migrate({ schemaVersion: 1 }, { migrations: {}, target: 2 }), /noMigration/);
});

test('補完：足りない項目を既定値で補い、何度かけても同じ', () => {
  const partial = {
    schemaVersion: 1,
    id: 'pj_x',
    name: 'x',
    createdAt: '2026-01-01T00:00:00.000Z',
    locale: { region: 'jp' },
    stations: [{ id: 'st_a', name: 'A', schematic: { x: 0, y: 0 } }],
    lines: [{ id: 'ln_a', operatorId: 'op_a', name: 'L', stops: [{ stationId: 'st_a' }], sections: [{}, {}] }],
    operators: [{ id: 'op_a', name: 'O', shortName: 'O', category: 'major', color: '#000000', textColor: '#FFFFFF', badgeShape: 'circle' }],
  };
  const n1 = normalizeProject(partial);
  assert.equal(n1.locale.mapLanguage, 'ja');
  assert.equal(n1.stations[0].label.schematic.pos, 'auto');
  assert.deepEqual(n1.lines[0].sections, []);
  assert.equal(n1.lines[0].numbering.digits, 2);
  assert.deepEqual(n1.interchanges, []);
  assert.deepEqual(normalizeProject(n1), n1);
});

test('補完：完全なプロジェクトは変わらない', () => {
  const p = createProject({ name: 'a', author: 'b' });
  assert.deepEqual(normalizeProject(p), p);
});
