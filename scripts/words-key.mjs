import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

export const WORDS = 'public/songs-words';

/** Where a track's word timings live. Keyed on the preview URL, which carries the
    path and the file size (?v=), so replacing a song's audio re-times it. */
export const wordsFile = (preview) =>
  `${createHash('sha1').update(preview).digest('hex').slice(0, 16)}.json`;

/**
 * Point each manifest entry at its word timings, if `pnpm words` has written
 * them. Versioned by content, so a re-timed file is never served stale from the
 * service worker's cache. Files for songs that are gone — or whose audio
 * changed, since the key carries the size — are pruned; nothing current is
 * touched. Used by both scripts, so either order leaves songs.json right.
 */
export async function attachWords(tracks) {
  await mkdir(WORDS, { recursive: true });
  const wanted = new Set();
  let n = 0;
  for (const t of tracks) {
    const name = wordsFile(t.preview);
    wanted.add(name);
    delete t.words;
    const raw = await readFile(join(WORDS, name), 'utf8').catch(() => null);
    if (!raw || !JSON.parse(raw).lines) continue;
    t.words = `/songs-words/${name}?v=${createHash('sha1').update(raw).digest('hex').slice(0, 8)}`;
    n++;
  }
  for (const name of await readdir(WORDS)) {
    if (!wanted.has(name)) await rm(join(WORDS, name), { force: true });
  }
  return n;
}
