// Indexes public/songs into public/songs.json so the deployed site knows what exists —
// a static export has no server to list a directory with. Drop audio into
// public/songs/<folder>/, run `pnpm run deploy`, and the folder becomes a filter chip.
//
// Covers are extracted rather than read from the .m4a in the browser: a deployed track is
// just a URL, so reaching its embedded art means downloading the file's moov box — 35.9 MB
// across this library, and a third of the files keep moov at the very end. Extracted and
// downscaled they are 1.4 MB, served as plain images.
import { readdir, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { parseFile } from 'music-metadata';
import { attachWords } from './words-key.mjs';

const run = promisify(execFile);
const SONGS = 'public/songs';
const ART = 'public/songs-art';
const LYRICS = 'public/songs-lyrics';
const AUDIO = /\.(mp3|m4a|flac|wav|ogg|opus|aac)$/i;

const walk = async (dir) => {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.name.startsWith('.')) continue; // .DS_Store and friends aren't assets
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (AUDIO.test(e.name)) out.push(p);
  }
  return out;
};

// Never wipe ART up front: an interrupted run would leave songs.json pointing at deleted covers.
await mkdir(ART, { recursive: true });
await mkdir(LYRICS, { recursive: true });

const files = (await walk(SONGS)).sort();
const tracks = [];
/** hash -> whether its two sizes are actually on disk. */
const covers = new Map();
const lyricsKeep = new Set();
const failed = [];

for (const file of files) {
  const parts = relative(SONGS, file).split('/');
  let title = parts.at(-1).replace(/\.[^.]+$/, '');
  let artist = 'Unknown artist';
  let album = '';
  let duration, artwork, artworkLarge, lyrics;

  let pic, words;
  try {
    const { common, format } = await parseFile(file, { duration: true });
    if (common.title) title = common.title;
    if (common.artist) artist = common.artist;
    if (common.album) album = common.album;
    duration = format.duration;
    pic = common.picture?.[0];
    // Kept as separate files so saved queues do not carry lyric text.
    const l = common.lyrics?.[0];
    words = (typeof l === 'string' ? l : l?.text)?.trim();
  } catch {
    // Unreadable tags aren't fatal — the filename still names the track.
  }

  if (pic) {
    const hash = createHash('sha1').update(pic.data).digest('hex').slice(0, 16);
    // Album art repeats across a record, so hash-name it and convert each one once.
    if (!covers.has(hash)) {
      const raw = join(ART, `.raw-${hash}`);
      try {
        await writeFile(raw, pic.data);
        // 200px covers the 40px list thumbnail and 64px player art even at 2x DPI;
        // the @lg copy is only fetched when the fullscreen view opens.
        // '-lg' not '@lg': Cloudflare 307-redirects '@' to %40, costing a round trip per open.
        for (const [px, q, suffix] of [[200, 75, ''], [600, 80, '-lg']]) {
          await run('sips', ['-Z', String(px), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(q),
            raw, '--out', join(ART, `${hash}${suffix}.jpg`)]);
        }
        covers.set(hash, true);
      } catch (e) {
        covers.set(hash, false);
        failed.push(`${title} — ${String(e.message ?? e).split('\n')[0]}`);
      } finally {
        await rm(raw, { force: true });
      }
    }
    if (covers.get(hash)) {
      artwork = `/songs-art/${hash}.jpg`;
      artworkLarge = `/songs-art/${hash}-lg.jpg`;
    }
  }

  if (words) {
    const name = `${createHash('sha1').update(words).digest('hex').slice(0, 16)}.txt`;
    await writeFile(join(LYRICS, name), words);
    lyricsKeep.add(name);
    lyrics = `/songs-lyrics/${name}`;
  }

  tracks.push({
    // Each path segment encoded separately: these names carry spaces, commas and parentheses.
    id: `file:${parts.join('/')}`,
    title,
    artist,
    album,
    artwork,
    artworkLarge,
    // ?v= makes the URL change when the file does, so the service worker's
    // cache (keyed by full URL) can never serve a stale copy of a replaced
    // song. Old versions linger in the cache until its activate cleanup.
    preview: `/songs/${parts.map(encodeURIComponent).join('/')}?v=${(await stat(file)).size}`,
    duration,
    lyrics,
    folder: parts.length > 1 ? parts.at(-2) : undefined,
  });
}

tracks.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));

const worded = await attachWords(tracks);
await writeFile('public/songs.json', JSON.stringify(tracks));

// Prune only now that every referenced cover is on disk.
const written = [...covers].filter(([, ok]) => ok).map(([h]) => h);
const names = written.flatMap((h) => [`${h}.jpg`, `${h}-lg.jpg`]);
const keep = new Set(names);
for (const name of await readdir(ART)) {
  if (!keep.has(name)) await rm(join(ART, name), { force: true });
}
for (const name of await readdir(LYRICS)) {
  if (!lyricsKeep.has(name)) await rm(join(LYRICS, name), { force: true });
}

const artBytes = (await Promise.all(names.map((n) => stat(join(ART, n))))).reduce((s, f) => s + f.size, 0);
console.log(`${tracks.length} tracks, ${written.length} covers at two sizes (${(artBytes / 1e6).toFixed(1)} MB), ${lyricsKeep.size} lyric sheets, ${worded} timed to the word`);
if (failed.length) {
  console.warn(`\n${failed.length} cover(s) could not be converted; those tracks ship without art:`);
  for (const f of failed) console.warn(`  ${f}`);
}
