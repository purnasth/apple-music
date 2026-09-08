// The service worker file runs in SW scope, so evaluate it with stubs and pull
// out its pure helpers — the range math is what breaks seeking if it's wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const { parseRange, truncate } = new Function(
  'self',
  `${src}; return { parseRange, truncate };`
)({ addEventListener() {}, skipWaiting() {} });

test('parseRange', () => {
  assert.deepEqual(parseRange('bytes=0-', 100), [0, 99]);
  assert.deepEqual(parseRange('bytes=0-1', 100), [0, 1]);
  assert.deepEqual(parseRange('bytes=50-200', 100), [50, 99]); // clamped to size
  assert.equal(parseRange('bytes=100-', 100), null); // past the end
  assert.equal(parseRange(null, 100), null);
  assert.equal(parseRange('nonsense', 100), null);
});

test('truncate cuts a stream at n bytes across chunk boundaries', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      ctrl.enqueue(new Uint8Array([1, 2, 3]));
      ctrl.enqueue(new Uint8Array([4, 5, 6]));
      ctrl.close();
    },
  });
  const out: number[] = [];
  const reader = truncate(stream, 4).getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) out.push(...r.value);
  assert.deepEqual(out, [1, 2, 3, 4]);
});
