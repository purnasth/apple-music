// Times bundled lyrics to the word; see DEPLOY.md.
//   pnpm words [title filter] [--force] [--if-available]
import { readFile, writeFile, mkdir, rm, access, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { align, heardWords, languageOf } from '../lib/align.ts';
import { findLrc, parseLrc } from '../lib/lyrics.ts';
import { WORDS, attachWords, wordsFile } from './words-key.mjs';

const run = promisify(execFile);
// Atomic: an interrupted run must not leave a half-written file behind.
const save = async (file, data) => {
  await writeFile(`${file}.tmp`, JSON.stringify(data));
  await rename(`${file}.tmp`, file);
};
const OUT = WORDS;
const MODEL = process.env.WHISPER_MODEL ?? join(homedir(), '.cache/whisper/ggml-small-q5_1.bin');
const MIN_MATCH = 0.35;
const GOOD_ENOUGH = 0.55;

const args = process.argv.slice(2);
const force = args.includes('--force');
const filter = args.find((a) => !a.startsWith('--'))?.toLowerCase();

try {
  await run('whisper-cli', ['--help']);
  await access(MODEL);
} catch {
  const optional = args.includes('--if-available');
  console[optional ? 'warn' : 'error'](
    `\n${optional ? '⚠ Skipping word timing' : '✗ Cannot time words'}: needs whisper-cli on PATH ` +
      `and a model at ${MODEL}.\n  New songs will highlight line by line. Setup: DEPLOY.md.\n`,
  );
  process.exit(optional ? 0 : 1);
}

await mkdir(OUT, { recursive: true });
const tracks = JSON.parse(await readFile('public/songs.json', 'utf8')).filter(
  (t) => !filter || `${t.title} ${t.artist}`.toLowerCase().includes(filter),
);

const tmp = join(tmpdir(), `align-${process.pid}`);
await mkdir(tmp, { recursive: true });
const tally = { timed: 0, weak: 0, noLyrics: 0, cached: 0, failed: 0 };

for (const [n, t] of tracks.entries()) {
  const out = join(OUT, wordsFile(t.preview));
  const label = `[${n + 1}/${tracks.length}] ${t.artist} — ${t.title}`;
  if (!force && (await access(out).then(() => true, () => false))) {
    tally.cached++;
    continue;
  }
  try {
    const { synced } = await findLrc(t);
    if (!synced) {
      // Cached too, so the next run does not ask again.
      await save(out, { lines: null, why: 'no synced lyrics' });
      tally.noLyrics++;
      console.log(`${label}: no synced lyrics`);
      continue;
    }
    const lines = parseLrc(synced);
    const lang = languageOf(lines);
    // Skip the intro; timestamps stay absolute.
    const from = Math.max(0, Math.floor(((lines.find((l) => l.text)?.t ?? 0) - 1) * 1000));
    const src = `public/songs/${decodeURIComponent(t.preview.replace(/^\/songs\//, '').replace(/\?.*$/, ''))}`;
    const wav = join(tmp, 'a.wav');
    await run('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', src, wav]);
    // -nfa: DTW is disabled under flash attention. -mc 0: with context, DTW aborts (exit 134) on some songs.
    const hear = async (extra, language = lang) => {
      await run('whisper-cli', ['-m', MODEL, '-f', wav, '-l', language, '-ot', String(from), '-ojf',
        '-of', join(tmp, 'a'), '--dtw', 'small', '-nfa', '-np', '-mc', '0', ...extra],
        { maxBuffer: 64 << 20 });
      return align(lines, heardWords(JSON.parse(await readFile(join(tmp, 'a.json'), 'utf8'))));
    };
    // -nf (no temperature fallback) is ~5x faster; only weak results get the full decode.
    let r = await hear(['-nf']);
    let used = lang;
    if (r.matched < GOOD_ENOUGH) {
      const full = await hear([]);
      if (full.matched > r.matched) r = full;
    }
    // Latin script may be English or romanised Hindi/Nepali: try the other.
    if (r.matched < GOOD_ENOUGH && (lang === 'en' || lang === 'hi') && !/[\u0900-\u097F]/.test(synced)) {
      const other = lang === 'en' ? 'hi' : 'en';
      const alt = await hear(['-nf'], other);
      if (alt.matched > r.matched) {
        r = alt;
        used = other;
      }
    }
    const good = r.matched >= MIN_MATCH;
    await save(out, good
      ? { lines: r.lines, matched: +r.matched.toFixed(2) }
      : { lines: null, why: 'too little heard', matched: +r.matched.toFixed(2) });
    if (good) tally.timed++;
    else tally.weak++;
    console.log(`${label}: ${Math.round(r.matched * 100)}% heard (${used})${good ? '' : ' — kept line-level'}`);
  } catch (e) {
    tally.failed++;
    console.warn(`${label}: failed — ${String(e.message ?? e).split('\n')[0]}`);
  }
}

await rm(tmp, { recursive: true, force: true });
console.log(`\n${tally.timed} timed to the word, ${tally.weak} kept line-level, ` +
  `${tally.noLyrics} without synced lyrics, ${tally.cached} already done, ${tally.failed} failed.`);

const all = JSON.parse(await readFile('public/songs.json', 'utf8'));
const worded = await attachWords(all);
await writeFile('public/songs.json', JSON.stringify(all));
console.log(`songs.json: ${worded} of ${all.length} tracks timed to the word.`);
