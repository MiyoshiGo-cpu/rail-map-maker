// 駅ナンバリング（§6.2）：auto・fixed・枝番・振り直し・環状
import { test, assert } from './harness.js';
import { stopNumbers, fullCode, duplicateNumbers, stationNumbers, formatNumber, branchNumber } from '../js/core/numbering.js';
import { storeWithLine } from './helpers.js';

function numbered(points, rule = {}) {
  const r = storeWithLine(points);
  r.store.dispatch({ type: 'line/update', lineId: r.lineId, fields: { symbol: 'AB' } });
  r.store.dispatch({ type: 'line/numbering', lineId: r.lineId, fields: { enabled: true, start: 1, step: 1, digits: 2, ...rule } });
  const line = () => r.store.getState().lines.find((l) => l.id === r.lineId);
  const codes = () => stopNumbers(line()).map((n) => fullCode(line(), n));
  return { ...r, line, codes };
}

test('採番：AB・1から・2桁で全駅に番号が付く', () => {
  const { codes } = numbered([[0, 0], [2, 0], [4, 0], [6, 0]]);
  assert.deepEqual(codes(), ['AB01', 'AB02', 'AB03', 'AB04']);
});

test('採番：区切り・桁数1（ゼロ埋めなし）・増分・終点側から', () => {
  assert.deepEqual(numbered([[0, 0], [2, 0], [4, 0]], { separator: '-' }).codes(), ['AB-01', 'AB-02', 'AB-03']);
  assert.deepEqual(numbered([[0, 0], [2, 0], [4, 0]], { digits: 1 }).codes(), ['AB1', 'AB2', 'AB3']);
  assert.deepEqual(numbered([[0, 0], [2, 0], [4, 0]], { start: 10, step: 2 }).codes(), ['AB10', 'AB12', 'AB14']);
  assert.deepEqual(numbered([[0, 0], [2, 0], [4, 0]], { fromEnd: true }).codes(), ['AB03', 'AB02', 'AB01']);
});

test('採番：記号を入れれば路線記号より優先する', () => {
  const { codes } = numbered([[0, 0], [2, 0]], { prefix: 'Z' });
  assert.deepEqual(codes(), ['Z01', 'Z02']);
});

test('採番：付けない設定なら空', () => {
  const r = storeWithLine();
  const line = r.store.getState().lines[0];
  assert.deepEqual(stopNumbers(line), ['', '', '', '']);
});

test('auto：途中に駅を足すと常に連番で振り直す', () => {
  const { store, lineId, codes } = numbered([[0, 0], [4, 0], [8, 0]]);
  store.dispatch({ type: 'line/insertStop', lineId, sectionIndex: 0, newStation: { x: 2, y: 0 } });
  assert.deepEqual(codes(), ['AB01', 'AB02', 'AB03', 'AB04']);
});

test('fixed：確定した番号は、途中に足しても変わらず、枝番を振れる', () => {
  const { store, lineId, codes } = numbered([[0, 0], [2, 0], [4, 0], [6, 0], [8, 0]]);
  store.dispatch({ type: 'line/fixNumbers', lineId });
  store.dispatch({ type: 'line/insertStop', lineId, sectionIndex: 1, newStation: { x: 3, y: 1 }, numbering: 'branch' });
  assert.deepEqual(codes(), ['AB01', 'AB02', 'AB02-1', 'AB03', 'AB04', 'AB05']);
  // 同じ場所にもう1つ足すと -2（同じ枝番は使わない）
  store.dispatch({ type: 'line/insertStop', lineId, sectionIndex: 1, newStation: { x: 3, y: 2 }, numbering: 'branch' });
  assert.deepEqual(codes(), ['AB01', 'AB02', 'AB02-2', 'AB02-1', 'AB03', 'AB04', 'AB05']);
});

test('fixed：以降を振り直す', () => {
  const { store, lineId, codes } = numbered([[0, 0], [2, 0], [4, 0]]);
  store.dispatch({ type: 'line/fixNumbers', lineId });
  store.dispatch({ type: 'line/insertStop', lineId, sectionIndex: 0, newStation: { x: 1, y: 1 }, numbering: 'renumber' });
  assert.deepEqual(codes(), ['AB01', 'AB02', 'AB03', 'AB04']);
});

test('fixed：端に足すと次（起点側は前）の番号。確定をやめると連番に戻る', () => {
  const { store, lineId, codes } = numbered([[0, 0], [2, 0], [4, 0]], { start: 5 });
  store.dispatch({ type: 'line/fixNumbers', lineId });
  store.dispatch({ type: 'line/appendStop', lineId, newStation: { x: 6, y: 0 } });
  store.dispatch({ type: 'line/appendStop', lineId, newStation: { x: -2, y: 0 }, atStart: true });
  assert.deepEqual(codes(), ['AB04', 'AB05', 'AB06', 'AB07', 'AB08']);
  store.dispatch({ type: 'line/unfixNumbers', lineId });
  assert.deepEqual(codes(), ['AB05', 'AB06', 'AB07', 'AB08', 'AB09']);
});

test('環状線：起点の駅から一周分を振る', () => {
  const { store, lineId, codes } = numbered([[0, 0], [4, 0], [4, 4], [0, 4]]);
  store.dispatch({ type: 'line/setLoop', lineId, isLoop: true });
  assert.deepEqual(codes(), ['AB01', 'AB02', 'AB03', 'AB04']);
  store.dispatch({ type: 'line/fixNumbers', lineId });
  assert.deepEqual(codes(), ['AB01', 'AB02', 'AB03', 'AB04']);
});

test('重複：同じ路線の中で同じ番号を見つける', () => {
  const { store, lineId, line } = numbered([[0, 0], [2, 0], [4, 0]]);
  store.dispatch({ type: 'line/fixNumbers', lineId });
  store.dispatch({ type: 'line/stop', lineId, index: 2, fields: { number: '01' } });
  assert.deepEqual(duplicateNumbers(line()), ['01']);
});

test('駅は通る路線の数だけ番号を持つ', () => {
  const { store, ids, lineId } = numbered([[0, 0], [2, 0], [4, 0]]);
  const l2 = store.dispatch({ type: 'line/add', fields: { symbol: 'C' }, stationIds: [ids[1], ids[2]] });
  store.dispatch({ type: 'line/numbering', lineId: l2, fields: { enabled: true, digits: 1, start: 7 } });
  const list = stationNumbers(store.getState(), ids[1]);
  assert.deepEqual(list.map((x) => x.code), ['AB02', 'C7']);
  void lineId;
});

test('書式と枝番の道具', () => {
  assert.equal(formatNumber({ digits: 3 }, 7), '007');
  assert.equal(branchNumber('05', new Set(['05-1'])), '05-2');
  assert.equal(branchNumber('', new Set()), '');
});
