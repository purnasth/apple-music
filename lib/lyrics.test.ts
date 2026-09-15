import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, lineAt } from './lyrics.ts';

test('parseLrc reads stamps, expands repeated ones, sorts, skips junk', () => {
  const lines = parseLrc('[ti:x]\n[00:15.55] second\n[00:11.20] first\n[01:00.00][00:30.5] chorus\n\nplain');
  assert.deepEqual(lines, [
    { t: 11.2, text: 'first' },
    { t: 15.55, text: 'second' },
    { t: 30.5, text: 'chorus' },
    { t: 60, text: 'chorus' },
  ]);
  assert.equal(lineAt(lines, 0), -1);
  assert.equal(lineAt(lines, 11.2), 0);
  assert.equal(lineAt(lines, 29), 1);
  assert.equal(lineAt(lines, 999), 3);
});
