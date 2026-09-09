import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  search,
  fmtTime,
  fmtTotal,
  folderOf,
  shuffled,
  artistsOf,
  encodePlaylist,
  decodePlaylist,
  encodeBackup,
  decodeBackup,
  type Track,
} from './music.ts';

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

test('fmtTotal reads a playlist as minutes and hours', () => {
  const of = (...secs: number[]) => secs.map((duration) => ({ duration }) as Track);
  assert.equal(fmtTotal(of(200, 220)), '7 min');
  assert.equal(fmtTotal(of(...Array(20).fill(200))), '1 hr 7 min');
  assert.equal(fmtTotal([]), '');
  assert.equal(fmtTotal(of(0)), '');
});

const bundled: Track = {
  id: 'file:new/O Yaara-Abdul Hannan Kaavish.m4a',
  title: 'O Yaara',
  artist: 'Abdul Hannan & Kaavish',
  album: 'O Yaara - Single',
  artwork: '/songs-art/4a3e160aa94fa1bb.jpg',
  preview: '/songs/new/O%20Yaara.m4a?v=9508757',
  duration: 276,
};

test('a playlist survives the round trip through a link', async () => {
  const streamed: Track = {
    id: 'deezer:123',
    title: 'Robbers',
    artist: 'The 1975',
    album: 'The 1975',
    artwork: 'https://cdn.deezer.com/cover.jpg',
    appleUrl: 'https://music.apple.com/search?term=x',
    // Deezer signs previews with an expiry, so they are deliberately not carried.
    preview: 'https://cdn-preview.deezer.com/x.mp3?exp=1',
    duration: 250,
  };
  const code = await encodePlaylist('Late night', [bundled, streamed]);
  assert.ok(!/[+/=]/.test(code), 'must be URL-safe');

  const back = await decodePlaylist(code, [bundled]);
  assert.equal(back?.name, 'Late night');
  // The bundled track comes back whole from the local manifest, previewattached.
  assert.deepEqual(back?.tracks[0], bundled);
  assert.equal(back?.tracks[1].id, 'deezer:123');
  assert.equal(back?.tracks[1].title, 'Robbers');
  assert.equal(back?.tracks[1].preview, undefined);
});

test('local imports cannot travel, and unknown bundled ids are dropped', async () => {
  const local: Track = { id: 'local:1', title: 'Demo', artist: 'Me', album: '', local: true };
  const code = await encodePlaylist('Mine', [local, bundled]);
  // Nothing of the local file is in the payload, and the recipient without that
  // bundled track simply gets an empty list rather than a dead row.
  assert.deepEqual((await decodePlaylist(code, []))?.tracks, []);
  assert.equal((await decodePlaylist(code, [bundled]))?.tracks.length, 1);
});

test('a backup carries every playlist and comes back whole', async () => {
  const file = await encodeBackup({ Drives: [bundled], Empty: [] });
  const back = await decodeBackup(file, [bundled]);
  assert.deepEqual(back, { Drives: [bundled], Empty: [] });
  // Anything that is not one of ours is refused rather than half-applied.
  assert.equal(await decodeBackup('nonsense', []), null);
  assert.equal(await decodeBackup('{"playlists":"nope"}', []), null);
});

test('a hostile link cannot smuggle in a javascript: href', async () => {
  const code = await encodePlaylist('Bad', [
    {
      id: 'deezer:1',
      title: 'x',
      artist: 'y',
      album: '',
      appleUrl: 'javascript:alert(1)',
      artwork: 'javascript:alert(2)',
    },
  ]);
  const t = (await decodePlaylist(code, []))!.tracks[0];
  assert.equal(t.appleUrl, undefined);
  assert.equal(t.artwork, undefined);
});

test('decodePlaylist refuses junk instead of throwing', async () => {
  assert.equal(await decodePlaylist('', []), null);
  assert.equal(await decodePlaylist('not-a-playlist', []), null);
  assert.equal(await decodePlaylist('x'.repeat(200_001), []), null);
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
