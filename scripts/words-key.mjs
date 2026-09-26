import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

export const WORDS = 'public/songs-words';

/** Keyed on the preview URL, which includes the file size, so new audio is re-timed. */
export const wordsFile = (preview) =>
  `${createHash('sha1').update(preview).digest('hex').slice(0, 16)}.json`;

/** Links manifest entries to their timings (content-versioned) and prunes orphans. */
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
