import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const run = promisify(execFile);
const DIR = 'node_modules/.cache/essentia';
const BASE = 'https://essentia.upf.edu/models';
const EMBEDDER = 'https://raw.githubusercontent.com/MTG/essentia.js/819c00e8f034dc709e3d330ed8ac9ed37dfdb767';

/**
 * Essentia's mood heads on MusiCNN embeddings (CC BY-NC-ND 4.0, essentia.upf.edu/models),
 * by the index of their "yes" class.
 */
export const HEADS = { happy: 0, sad: 1, relaxed: 1, aggressive: 0, party: 1, danceable: 0 };
const remote = (head) => (head === 'danceable' ? 'danceability' : `mood_${head}`);

const find = async (dir) => {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const hit = await find(p);
      if (hit) return hit;
    } else if (e.name === 'model.json') return p;
  }
};

const fetchTo = (url, file) => run('curl', ['-sfL', '--create-dirs', '-o', file, url]);

/** model.json of the MusiCNN embedder, or of one head; downloaded once into node_modules/.cache. */
export async function modelFile(head) {
  const dir = join(DIR, head ?? 'musicnn');
  const have = await access(dir).then(() => find(dir), () => undefined);
  if (have) return have;
  await mkdir(DIR, { recursive: true });
  // The embedder's zip on essentia.upf.edu is corrupt; MTG's own essentia.js demo ships it.
  const url = head
    ? `${BASE}/classification-heads/${remote(head)}/${remote(head)}-msd-musicnn-1-tfjs`
    : `${EMBEDDER}/examples/demos/autotagging-rt/data/msd-musicnn-1`;
  // Weights first: model.json is what marks the download done.
  await fetchTo(`${url}/group1-shard1of1.bin`, join(dir, 'group1-shard1of1.bin'));
  await fetchTo(`${url}/model.json`, join(dir, 'model.json'));
  return find(dir);
}
