import { test, assert } from './harness.js';
import { getRegion, defaultDwellSec } from '../js/core/regions/index.js';
import ja from '../js/i18n/ja.js';

const LINE_KINDS = ['shinkansen', 'conventional', 'subway', 'tram', 'monorail', 'agt', 'cable', 'maglev', 'freight'];

test('地域パック jp：路線の種類すべてに既定値がある（§3.2）', () => {
  const jp = getRegion('jp');
  for (const k of LINE_KINDS) {
    const d = jp.lineKindDefaults[k];
    assert.ok(d, k);
    assert.ok(typeof d.maxSpeed === 'number' && d.maxSpeed > 0, k);
    assert.ok(typeof d.spacingKm === 'number' && d.spacingKm > 0, k);
  }
  assert.equal(jp.lineKindDefaults.conventional.gauge, 1067);
  assert.equal(jp.lineKindDefaults.shinkansen.electrification, 'ac25k60');
  assert.equal(jp.lineKindDefaults.monorail.gauge, null);
});

test('地域パック jp：区分・プリセットの表示名がカタログにある', () => {
  const jp = getRegion('jp');
  for (const c of jp.operatorCategories) assert.ok(ja[jp.operatorCategoryKeyPrefix + c], c);
  for (const p of jp.serviceTypePresets) assert.ok(ja[p.labelKey], p.id);
  assert.ok(ja[jp.adminLabelKeys.admin1]);
  assert.ok(ja[jp.nameKey]);
});

test('停車時間の既定：rank 1 は30秒、2〜7 は40秒、8以上は60秒', () => {
  const jp = getRegion('jp');
  assert.equal(defaultDwellSec(jp, 1), 30);
  assert.equal(defaultDwellSec(jp, 2), 40);
  assert.equal(defaultDwellSec(jp, 7), 40);
  assert.equal(defaultDwellSec(jp, 8), 60);
  assert.equal(defaultDwellSec(jp, 10), 60);
});

test('知らない地域は jp を返す', () => {
  assert.equal(getRegion('zz').id, 'jp');
});
