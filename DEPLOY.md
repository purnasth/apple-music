# Deploying

The site deploys as static assets on Cloudflare Workers — free, with unlimited
asset requests and no storage cost. The songs ship as ordinary files
alongside the HTML.

## Publishing

```
pnpm run deploy
```

Always `pnpm run deploy`, never `pnpm deploy`: `deploy` is also one of pnpm's
own commands, and the built-in wins, failing with "A deploy is only possible
from inside a workspace". Same for `pnpm run publish` if that is ever added.

Run it from this machine — it is the only place the songs exist. In order it:

1. `pnpm songs` — indexes `public/songs/`, extracts covers and embedded lyrics,
   writes `public/songs.json`.
2. `pnpm words --if-available` — times the lyrics of any song not done yet to the
   word, and points `songs.json` at the results. Cached, so this is seconds when
   nothing is new. Without whisper.cpp installed it warns and moves on.
3. `next build` — a static export into `out/`, which copies everything under
   `public/`, word timings included.
4. `pnpm dlx wrangler deploy` — uploads `out/` as Workers static assets. Only
   changed files are sent; wrangler skips anything already on the edge by
   content hash.

## pnpm

This project uses pnpm, pinned in `package.json` (`packageManager`), with
`pnpm-lock.yaml` as the lockfile. There is no `package-lock.json` any more; do
not bring one back with `npm install`. If pnpm is missing: `corepack enable`, or
`brew install pnpm`.

`pnpm install` warns about nothing: `unrs-resolver` (a dependency of eslint)
ships an install script that only fetches a native binary when the prebuilt one
is missing, which it is not, so it is listed under `pnpm.ignoredBuiltDependencies`.
If eslint ever fails to load its resolver, move it to `onlyBuiltDependencies`.

The parked `r2-library` branch predates the switch and still edits
`package-lock.json`; if it is revived, redo its dependency change with `pnpm add`.

## Adding songs

1. Drop the files into `public/songs/<folder>/`. The folder name becomes a filter
   chip in the Library tab, so `all-time`, `current` and `new` already work; a new
   folder appears on its own.
2. `pnpm run deploy`

That is the whole job. The deploy times the new songs' lyrics to the word on the
way (about 15–30 s a song); songs already done are not redone. To time them
ahead of a deploy — and see the result in `pnpm dev` first — run `pnpm words`.

Tags are read from the files themselves, so nothing needs renaming. Only changed
files upload — wrangler skips assets already on the edge by content hash.

Note that the in-browser import controls — the Import button, the folder picker,
the dropzone and the drag-anywhere target — are not on the deployed site. They
write into whichever browser is looking at the page, which is useful here and
meaningless to a visitor. `NEXT_PUBLIC_ENV` decides: `local` shows them,
anything else hides them, and `pnpm run deploy` sets `production` itself so a
stray `.env.local` cannot ship them. Being set at build time it folds to a
literal, so the code is dropped from the bundle rather than hidden inside it.

A fresh clone needs `cp .env.example .env.local` to get the import controls in
`pnpm dev`. Adding songs goes through `public/songs/` above.

## Lyrics timed to the word

LRCLIB times each line by hand but has no word timings for this library, and the
services that do (Apple's own, Musixmatch behind Spotify) are not open. So the
words are timed here, from the audio, by `pnpm words` — which `pnpm run deploy`
runs for you.

For each song with timed lines it runs whisper.cpp over the file to hear where
each word falls, pairs what it heard with the real lyric (`lib/align.ts`), writes
`public/songs-words/<key>.json`, and points `songs.json` at it. LRCLIB's line
starts stay the anchor; the model only places words inside a line. Songs where
too little was heard keep line-level timing, and the log says which.

A song with only plain lyrics (the sheet in its file, else LRCLIB's plain text),
such as a live recording nobody has timed, is heard from the start instead: each
line starts where its first word was heard, unheard lines are spaced between their
neighbours, and the words are then placed as above. The log marks these "lines
timed from the audio".

Lyrics are kept in a script listeners here read. Of LRCLIB's matches, the first
not in Urdu script wins, and readable plain text beats Urdu-only timing. When only
Urdu exists, it is converted to Devanagari (`devanagari` in `lib/lyrics.ts`),
which now and then guesses a short vowel wrong. Timings made from Urdu text are
converted as the site reads them; `pnpm words --force <title>` redoes one from a
readable version if LRCLIB has one.

```
pnpm words               # every song not done yet
pnpm words kasoor        # only titles/artists containing "kasoor"
pnpm words --force       # redo everything (e.g. after changing lib/align.ts)
```

It takes 15–30 s a song on an M3, longer where the quick pass is weak and it
decodes again carefully. The first full run over ~250 songs took over an hour.

### What gets cached, and when to redo it

- A song is done once its file exists in `public/songs-words/` — timed, kept
  line-level, or "no lyrics". None of these are retried on their own. Files from
  before plain lyrics could be timed ("no synced lyrics") are retried once.
- Replacing a song's audio re-times it: the key includes the file size.
- A song timed from plain lyrics keeps that timing even if LRCLIB later gains
  timed lines; `pnpm words --force <title>` switches it to them.
- Deleting a song deletes its timings on the next `pnpm songs` or `pnpm words`.

### How it fits the deployment

- **Visitors run nothing.** The timings are small static JSON files (a few KB
  each, under 1 MB for the library) that ship in `out/` like the covers, and the
  browser only reads them. Any device, any browser, gets word-level lyrics.
- **Only this machine generates them**, because only this machine has the audio
  and whisper.cpp. That matches how covers and the manifest already work: all
  generated here, all gitignored, all uploaded by `pnpm run deploy`.
- **Nothing changes on Cloudflare.** They are ordinary static assets: about 250
  more files on top of ~850, far under the 20,000-file static-asset limit of the
  free Workers plan, and unchanged files are never re-uploaded.
- **Caching is safe.** The manifest links each file with `?v=<content hash>`,
  and the service worker caches `/songs-words/` cache-first, so a re-timed song
  gets a new URL rather than a stale copy.
- **If a deploy runs without whisper.cpp** (a new machine, a broken install), it
  warns and publishes anyway. Songs already timed keep their files as long as
  `public/songs-words/` is on disk; only new songs fall back to line-level.
- **Only the bundled library.** Search results (30 s Deezer previews) and files
  imported in the browser never reach this machine, so they highlight line by
  line.
- **CI cannot do this**, for the same reason it cannot deploy at all (below):
  the audio is not in git. The `r2-library` plan moves only the audio; the timings
  would stay static assets.

### One-time setup (about 500 MB)

```
brew install whisper-cpp
mkdir -p ~/.cache/whisper
curl -L -o ~/.cache/whisper/ggml-small-q5_1.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin
```

`WHISPER_MODEL=/path/to/model.bin` points it at a different model. The small
multilingual model is deliberate: most of the library is Hindi, Nepali and Urdu,
and the English-only models would not help.

## Why deploys are manual

Cloudflare Builds deploys on every push to `main`, but it builds from the git
clone, and the audio is not in git (840 MB, deliberately not committed). Since a
deploy replaces the whole asset manifest, a CI deploy would leave the library
empty.

**Turn off the automatic build** in the Cloudflare dashboard — Workers & Pages →
apple-music → Settings → Builds — so a merge cannot wipe the songs. Publish with
`pnpm run deploy` instead.

Until that switch is off, every push fails at the prebuild guard. That failure is
the guard working: a red build is recoverable, a silent wipe is not. Do not
"fix" it by removing `scripts/check-songs.mjs`.

If you would rather have merges deploy on their own, there are two routes and
neither is free of cost. Committing the audio to git gives CI the files — about
1.1 GB in history, permanently, and a slower clone on every build. Or move the
library out of the asset manifest so a deploy cannot reach it: that work is done
and parked on the `r2-library` branch, waiting only on R2 being enabled in the
dashboard, which needs a payment method even though 1.1 GB sits inside the 10 GB
free tier. Until then the switch above is the whole answer.

## Where things live

| | |
|---|---|
| audio | `public/songs/<folder>/` — drop files here, gitignored |
| covers | `public/songs-art`, generated, gitignored |
| lyrics | `public/songs-lyrics`, plain text pulled from the files, generated, gitignored |
| word timings | `public/songs-words`, from `pnpm words`, generated, gitignored |
| manifest | `public/songs.json`, generated, gitignored |
| in git | `scripts/build-songs.mjs`, `scripts/align-lyrics.mjs`, `lib/align.ts` |

`build-songs.mjs` uses `sips` for the cover resize and `align-lyrics.mjs` uses
`afconvert` to decode audio, so publishing works on macOS only.
