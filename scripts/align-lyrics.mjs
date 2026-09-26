// Times the bundled library's lyrics to the word, writes public/songs-words/,
// and points public/songs.json at the results. Part of `pnpm run deploy`, after
// `pnpm songs`; finished songs are cached, so a deploy only pays for new ones.
//
//   pnpm words                    every track not yet done
//   pnpm words story              only titles/artists containing "story"
//   pnpm words --force            redo tracks already done
//   pnpm words --if-available     skip quietly-but-visibly without whisper (deploy)
//
// Needs whisper.cpp (`brew install whisper-cpp`) and a model; see DEPLOY.md.
// Each track: afconvert decodes the audio to 16 kHz WAV (built into macOS),
// whisper.cpp transcribes it with DTW token timestamps, and lib/align.ts pairs
// what it heard with the LRCLIB lyric and places every word. The audio never
// leaves this machine; only LRCLIB is asked for the lyric text.
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { align, heardWords, languageOf } from '../lib/align.ts';
import { findLrc, parseLrc } from '../lib/lyrics.ts';
import { WORDS, attachWords, wordsFile } from './words-key.mjs';

const run = promisify(execFile);
const OUT = WORDS;
const MODEL = process.env.WHISPER_MODEL ?? join(homedir(), '.cache/whisper/ggml-small-q5_1.bin');
/** Below this share of words heard, the timings are mostly guesses: keep line-level. */
const MIN_MATCH = 0.35;
/** A quick pass that pairs at least this many words is kept as it is. */
const GOOD_ENOUGH = 0.55;

const args = process.argv.slice(2);
const force = args.includes('--force');
const filter = args.find((a) => !a.startsWith('--'))?.toLowerCase();

try {
  await run('whisper-cli', ['--help']);
  await access(MODEL);
} catch {
  // In a deploy, a machine without the setup still publishes: new songs just
  // keep line-level timing. Said loudly, so it is a choice and not an accident.
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
      // Written anyway, so the next run does not ask again.
      await writeFile(out, JSON.stringify({ lines: null, why: 'no synced lyrics' }));
      tally.noLyrics++;
      console.log(`${label}: no synced lyrics`);
      continue;
    }
    const lines = parseLrc(synced);
    const lang = languageOf(lines);
    // Start a second before the first sung line: an instrumental intro only
    // gives the model room to hallucinate. Timestamps stay absolute.
    const from = Math.max(0, Math.floor(((lines.find((l) => l.text)?.t ?? 0) - 1) * 1000));
    const src = `public/songs/${decodeURIComponent(t.preview.replace(/^\/songs\//, '').replace(/\?.*$/, ''))}`;
    const wav = join(tmp, 'a.wav');
    await run('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', src, wav]);
    // -nfa: DTW timestamps are off when flash attention is on.
    // -mc 0: decode each window without the text before it as context. With
    // context, whisper.cpp aborted outright (exit 134) on three songs here,
    // every time; without it they all ran, and match rates were identical on
    // every song compared.
    const hear = async (extra, language = lang) => {
      await run('whisper-cli', ['-m', MODEL, '-f', wav, '-l', language, '-ot', String(from), '-ojf',
        '-of', join(tmp, 'a'), '--dtw', 'small', '-nfa', '-np', '-mc', '0', ...extra],
        { maxBuffer: 64 << 20 });
      return align(lines, heardWords(JSON.parse(await readFile(join(tmp, 'a.json'), 'utf8'))));
    };
    // Quick pass first: -nf turns off the model's retry-at-higher-temperature,
    // which songs trigger constantly (a repeated chorus looks like a decoding
    // loop) and which costs five times the time. Only a weak quick pass pays for
    // the full decode, and the better of the two is kept.
    let r = await hear(['-nf']);
    let used = lang;
    if (r.matched < GOOD_ENOUGH) {
      const full = await hear([]);
      if (full.matched > r.matched) r = full;
    }
    // Latin script is ambiguous between English and romanised Hindi/Nepali, and
    // bilingual songs exist, so a weak result gets one try in the other.
    if (r.matched < GOOD_ENOUGH && (lang === 'en' || lang === 'hi') && !/[\u0900-\u097F]/.test(synced)) {
      const other = lang === 'en' ? 'hi' : 'en';
      const alt = await hear(['-nf'], other);
      if (alt.matched > r.matched) {
        r = alt;
        used = other;
      }
    }
    const good = r.matched >= MIN_MATCH;
    await writeFile(out, JSON.stringify(good
      ? { lines: r.lines, matched: +r.matched.toFixed(2) }
      : { lines: null, why: 'too little heard', matched: +r.matched.toFixed(2) }));
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

// Point the manifest at everything now on disk, so the build that follows (or
// the dev server) picks the new timings up without another `pnpm songs`.
const all = JSON.parse(await readFile('public/songs.json', 'utf8'));
const worded = await attachWords(all);
await writeFile('public/songs.json', JSON.stringify(all));
console.log(`songs.json: ${worded} of ${all.length} tracks timed to the word.`);
