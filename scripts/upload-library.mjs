// Pushes the library — audio, covers, manifest — into the R2 bucket the Worker reads
// from. This is what makes a deploy safe: the files live outside ./out, so replacing
// the asset manifest cannot touch them, and CI can deploy the app without holding
// 1.1 GB it has no way to get.
//
// wrangler has no `r2 object list`, so "what is already up there" is remembered locally
// in .r2-ledger.json rather than asked. Publishing happens from one machine (see
// DEPLOY.md); on any other, or after `--force`, everything uploads again. The ledger is
// a cache, never a source of truth — deleting it costs time, not correctness.
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, relative } from 'node:path';

const run = promisify(execFile);
const LEDGER = '.r2-ledger.json';
const ROOTS = ['public/songs', 'public/songs-art'];
const LOOSE = ['public/songs.json'];
// Uploading one object per wrangler invocation is slow; a few at a time is not.
const PARALLEL = 6;
const force = process.argv.includes('--force');

const walk = async (dir) => {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
};

const files = [...(await Promise.all(ROOTS.map(walk))).flat(), ...LOOSE].sort();
if (!files.length) {
  console.error('\n✗ Nothing to upload — public/songs is empty. Run `npm run songs` first.\n');
  process.exit(1);
}

const ledger = force ? {} : await readFile(LEDGER, 'utf8').then(JSON.parse).catch(() => ({}));

// Size plus mtime is enough to notice a changed file, and costs no hashing of 1.1 GB.
const stamp = async (f) => {
  const { size, mtimeMs } = await stat(f);
  return `${size}:${Math.round(mtimeMs)}`;
};

const pending = [];
for (const file of files) {
  const key = relative('public', file);
  const now = await stamp(file);
  if (ledger[key] !== now) pending.push({ file, key, now });
}

if (!pending.length) {
  console.log(`${files.length} objects already in R2, nothing to upload`);
  process.exit(0);
}

console.log(`${pending.length} of ${files.length} objects to upload`);

let done = 0;
let failed = 0;
const queue = [...pending];

const worker = async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    try {
      await run('npx', ['wrangler', 'r2', 'object', 'put', `apple-music-library/${job.key}`,
        '--file', job.file, '--remote'], { maxBuffer: 1 << 24 });
      ledger[job.key] = job.now;
      done++;
    } catch (e) {
      failed++;
      console.error(`  ✗ ${job.key}: ${String(e.stderr || e.message).trim().split('\n').pop()}`);
    }
    if ((done + failed) % 10 === 0 || !queue.length) {
      console.log(`  ${done + failed}/${pending.length} (${failed} failed)`);
      // Written as we go: a run interrupted halfway keeps what it managed.
      await writeFile(LEDGER, JSON.stringify(ledger, null, 2));
    }
  }
};

await Promise.all(Array.from({ length: PARALLEL }, worker));
await writeFile(LEDGER, JSON.stringify(ledger, null, 2));

if (failed) {
  console.error(`\n✗ ${failed} object(s) failed to upload — not deploying with a partial library.\n`);
  process.exit(1);
}
console.log(`${done} objects uploaded`);
