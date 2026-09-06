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

test('search maps Deezer results into playable tracks', async () => {
  const tracks = await search('daft punk');
  assert.ok(tracks.length > 0, 'expected results');
  for (const t of tracks) {
    assert.ok(t.preview?.startsWith('https://'), `missing preview for ${t.title}`);
    assert.ok(t.id.startsWith('deezer:'));
    assert.ok(t.title && t.artist);
    assert.match(t.appleUrl ?? '', /^https:\/\/music\.apple\.com\/search/);
  }
});

// The whole reason for leaving iTunes: it has no record of this track.
test('search finds streaming-only releases iTunes is missing', async () => {
  const tracks = await search("The 1975 - I'm In Love With You");
  const hit = tracks.find((t) => t.artist === 'The 1975' && /I.m In Love With You/i.test(t.title));
  assert.ok(hit, 'expected The 1975 - I\'m In Love With You');
  assert.ok(hit.artwork?.startsWith('https://'), 'expected cover art');
});

test('search returns nothing for a blank term without calling the API', async () => {
  assert.deepEqual(await search('   '), []);
});
