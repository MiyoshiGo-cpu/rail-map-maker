// tests/all.js に、すべての *.test.js が並んでいるかを検査する（Node だけ）
import { test, assert, isNode } from './harness.js';
import { files } from './all.js';

if (isNode) {
  test('tests/all.js にすべてのテストファイルが載っている', async () => {
    const { readdirSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const actual = readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort();
    assert.deepEqual([...files].sort(), actual);
  });
}
