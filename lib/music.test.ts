import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, fmtTime } from './music.ts';

test('fmtTime formats and survives junk', () => {
  assert.equal(fmtTime(0), '--:--');
  assert.equal(fmtTime(65), '1:05');
  assert.equal(fmtTime(605), '10:05');
  assert.equal(fmtTime(undefined), '--:--');
  assert.equal(fmtTime(Infinity), '--:--');
});

test('search maps iTunes results into playable tracks', async () => {
  const tracks = await search('daft punk');
  assert.ok(tracks.length > 0, 'expected results');
  for (const t of tracks) {
    assert.ok(t.preview?.startsWith('https://'), `missing preview for ${t.title}`);
    assert.ok(t.id.startsWith('itunes:'));
    assert.ok(t.title && t.artist);
    // artwork must be upgraded off the 100px thumbnail
    if (t.artwork) assert.match(t.artwork, /600x600bb/);
  }
});

test('search returns nothing for a blank term without calling the API', async () => {
  assert.deepEqual(await search('   '), []);
});
