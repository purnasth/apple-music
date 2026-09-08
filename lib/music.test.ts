import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, fmtTime, folderOf, shuffled, artistsOf } from './music.ts';

test('fmtTime formats and survives junk', () => {
  assert.equal(fmtTime(0), '0:00');
  assert.equal(fmtTime(65), '1:05');
  assert.equal(fmtTime(605), '10:05');
  assert.equal(fmtTime(undefined), '--:--');
  assert.equal(fmtTime(Infinity), '--:--');
});

test('artistsOf splits collaborations but not hyphenated or plus-joined acts', () => {
  assert.deepEqual(artistsOf('Pritam, Arijit Singh & Amitabh Bhattacharya'), [
    'Pritam',
    'Arijit Singh',
    'Amitabh Bhattacharya',
  ]);
  assert.deepEqual(artistsOf('Abdul Hannan & Kaavish'), ['Abdul Hannan', 'Kaavish']);
  assert.deepEqual(artistsOf('Arijit Singh'), ['Arijit Singh']);
  // Single acts whose names contain a separator-looking character.
  assert.deepEqual(artistsOf('Sachin-Jigar'), ['Sachin-Jigar']);
  assert.deepEqual(artistsOf('Dan + Shay & Justin Bieber'), ['Dan + Shay', 'Justin Bieber']);
  assert.deepEqual(artistsOf(''), []);
});

test('shuffled is a permutation, never a resample', () => {
  const src = Array.from({ length: 200 }, (_, i) => i);
  for (let run = 0; run < 20; run++) {
    const out = shuffled(src);
    assert.equal(out.length, src.length);
    // Every element exactly once — the property naive random picking violates.
    assert.deepEqual([...out].sort((a, b) => a - b), src);
  }
  assert.deepEqual(shuffled([]), []);
  assert.deepEqual(shuffled([7]), [7]);
  // The input is left alone.
  const orig = [1, 2, 3];
  shuffled(orig);
  assert.deepEqual(orig, [1, 2, 3]);
});

test('folderOf picks the immediate parent of a folder-picked file', () => {
  assert.equal(folderOf('songs highquality/new/Baaton.m4a'), 'new');
  assert.equal(folderOf('songs highquality/OG/Darkhaast.m4a'), 'OG');
  assert.equal(folderOf('flat/a.m4a'), 'flat');
  // A plain (non-folder) file pick leaves webkitRelativePath empty.
  assert.equal(folderOf(''), undefined);
  assert.equal(folderOf('a.m4a'), undefined);
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
