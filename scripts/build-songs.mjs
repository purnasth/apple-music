// Indexes public/songs into public/songs.json so the deployed site knows what exists —
// a static export has no server to list a directory with. Drop audio into
// public/songs/<folder>/, run `npm run deploy`, and the folder becomes a filter chip.
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

const run = promisify(execFile);
const SONGS = 'public/songs';
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

const files = (await walk(SONGS)).sort();
const tracks = [];
const seen = new Set();

for (const file of files) {
  const parts = relative(SONGS, file).split('/');
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
      artwork = `/songs-art/${name}`;
      // Album art repeats across a record, so hash-name it and convert each one once.
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
    // Each path segment encoded separately: these names carry spaces, commas and parentheses.
    id: `file:${parts.join('/')}`,
    title,
    artist,
    album,
    artwork,
    preview: `/songs/${parts.map(encodeURIComponent).join('/')}`,
    duration,
    folder: parts.length > 1 ? parts.at(-2) : undefined,
  });
}

tracks.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
await writeFile('public/songs.json', JSON.stringify(tracks));

const artBytes = (await Promise.all([...seen].map((n) => stat(join(ART, n))))).reduce((s, f) => s + f.size, 0);
console.log(`${tracks.length} tracks, ${seen.size} covers (${(artBytes / 1e6).toFixed(1)} MB)`);
