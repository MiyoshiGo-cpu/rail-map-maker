import { test, assert } from './harness.js';
import { createAutosave } from '../js/storage/autosave.js';
import { newStore } from './helpers.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('自動保存：続けて変更してもまとめて1回保存する', async () => {
  const store = newStore();
  const saved = [];
  const statuses = [];
  const as = createAutosave(store, { save: async (p) => { saved.push(p); }, onStatus: (s) => statuses.push(s), delay: 20 });
  store.dispatch({ type: 'station/add', x: 0, y: 0 });
  store.dispatch({ type: 'station/add', x: 1, y: 0 });
  store.dispatch({ type: 'station/add', x: 2, y: 0 });
  await wait(60);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].stations.length, 3);
  assert.equal(statuses[statuses.length - 1], 'saved');
  as.dispose();
});

test('自動保存：プレビュー中の変更は保存しない', async () => {
  const store = newStore();
  const id = store.dispatch({ type: 'station/add', x: 0, y: 0 });
  const saved = [];
  const as = createAutosave(store, { save: async (p) => { saved.push(p); }, delay: 10 });
  store.preview({ type: 'station/move', ids: [id], dx: 5, dy: 0 });
  await wait(40);
  assert.equal(saved.length, 0);
  as.dispose();
});

test('自動保存：整合性に問題があれば保存しない', async () => {
  const reducers = { break: (tx) => tx.set(['lines'], null) };
  const { createStore } = await import('../js/core/store.js');
  const { createProject } = await import('../js/core/defaults.js');
  const store = createStore(createProject({ name: 'a' }), { reducers });
  const saved = [];
  let last = null;
  const as = createAutosave(store, { save: async (p) => { saved.push(p); }, onStatus: (s, d) => { last = { s, d }; }, delay: 5 });
  store.dispatch({ type: 'break' });
  await as.flush();
  assert.equal(saved.length, 0);
  assert.equal(last.s, 'error');
  assert.equal(last.d.reason, 'invalid');
  as.dispose();
});

test('自動保存：flush ですぐ保存する', async () => {
  const store = newStore();
  const saved = [];
  const as = createAutosave(store, { save: async (p) => { saved.push(p); }, delay: 10000 });
  store.dispatch({ type: 'station/add', x: 0, y: 0 });
  await as.flush();
  assert.equal(saved.length, 1);
  assert.equal(as.isDirty(), false);
  as.dispose();
});
