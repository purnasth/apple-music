// Indexes the song library into public/songs.json so the deployed site knows what exists —
// a static export has no server to list a directory with. Both the audio and the covers are
// served from R2 (or local paths before that exists); the repo carries only the manifest.
//
// The covers are extracted rather than read from the .m4a files at runtime: the browser holds
// only a URL, so reaching the embedded art means downloading each file's moov box — 35.9 MB
// across the library, and 38 of 111 files keep moov at the very end, needing a HEAD plus a
// tail range request each. Extracted and downscaled, the same art is 1.4 MB in one pass.
//
// Run locally when the songs change, then commit public/songs.json + public/songs-art:
//   npm run songs
//   SONGS_BASE_URL=https://<bucket>.r2.dev SONGS_ART_BASE=https://<bucket>.r2.dev/art npm run songs
import { readdir, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import { parseFile } from 'music-metadata';

const run = promisify(execFile);
const SRC = process.env.SONGS_DIR ?? join(homedir(), 'Downloads', 'songs highquality');
const BASE = (process.env.SONGS_BASE_URL ?? '/songs').replace(/\/$/, '');
const ART_BASE = (process.env.SONGS_ART_BASE ?? '/songs-art').replace(/\/$/, '');
const ART = 'public/songs-art';
const AUDIO = /\.(mp3|m4a|flac|wav|ogg|opus|aac)$/i;

const walk = async (dir) => {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (AUDIO.test(e.name)) out.push(p);
  }
  return out;
};

await rm(ART, { recursive: true, force: true });
await mkdir(ART, { recursive: true });

const files = (await walk(SRC)).sort();
const tracks = [];
const seen = new Set();

for (const file of files) {
  const rel = relative(SRC, file);
  const parts = rel.split('/');
  // Each segment encoded separately: these names carry spaces, commas and parentheses.
  const url = `${BASE}/${parts.map(encodeURIComponent).join('/')}`;
  let title = parts.at(-1).replace(/\.[^.]+$/, '');
  let artist = 'Unknown artist';
  let album = '';
  let duration, artwork;

  try {
    const { common, format } = await parseFile(file, { duration: true });
    if (common.title) title = common.title;
    if (common.artist) artist = common.artist;
    if (common.album) album = common.album;
    duration = format.duration;
    const pic = common.picture?.[0];
    if (pic) {
      const name = `${createHash('sha1').update(pic.data).digest('hex').slice(0, 16)}.jpg`;
      artwork = `${ART_BASE}/${name}`;
      // Covers repeat across an album, so hash-name them and convert each one only once.
      if (!seen.has(name)) {
        seen.add(name);
        const raw = join(ART, `.raw-${name}`);
        await writeFile(raw, pic.data);
        // 200px covers the 40px list thumbnail and 64px player art even at 2x DPI.
        await run('sips', ['-Z', '200', '-s', 'format', 'jpeg', '-s', 'formatOptions', '75', raw, '--out', join(ART, name)]);
        await rm(raw);
      }
    }
  } catch {
    // Unreadable tags aren't fatal — the filename still names the track.
  }

  tracks.push({
    id: `file:${rel}`,
    title,
    artist,
    album,
    artwork,
    preview: url,
    duration,
    folder: parts.length > 1 ? parts.at(-2) : undefined,
  });
}

tracks.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
await writeFile('public/songs.json', JSON.stringify(tracks));

const artBytes = (await Promise.all([...seen].map((n) => stat(join(ART, n))))).reduce((s, f) => s + f.size, 0);
console.log(
  `${tracks.length} tracks from ${SRC}\n` +
    `audio base: ${BASE}\n` +
    `art base:   ${ART_BASE}\n` +
    `${seen.size} covers, ${(artBytes / 1e6).toFixed(1)} MB (staged in ${ART}, not committed)`
);
