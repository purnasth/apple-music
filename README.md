# Music by Purna

**▶ Listen now: [music.purnashrestha.com.np](https://music.purnashrestha.com.np)**

A free, static music player for a hand-picked library of Nepali, Hindi and
English songs, with lyrics timed to the word. Search the wider catalogue for
previews, build playlists and share them as links. No account, no database and
no backend to run.

[Open the app](https://music.purnashrestha.com.np) ·
[Purna Shrestha](https://purnashrestha.com.np) ·
[Deploying](DEPLOY.md)

## What it does

- **Library.** Hundreds of full-length songs ship with the site, grouped into
  folders. Filter by folder or artist, sort it, and link to a filtered view.
- **Search.** Searches the streaming catalogue through Deezer's public API (no
  key) for 30-second previews. Every result links out to Apple Music for full
  playback. You can also search the library by a line of its lyrics: Nepali and
  Hindi lines typed in Latin letters still match, however they're spelled.
- **YouTube** (`/youtube`). Full songs in YouTube's own player, played as
  whoever is signed into YouTube in the browser. Picking a song starts a station
  from YouTube's Mix, and the queue keeps refilling the same way when it runs
  out. YouTube songs go into playlists, Recently Played and Most Played like any
  other. Search needs a free `NEXT_PUBLIC_YT_KEY` (see `.env.example`).
- **Player.**
  - Play/pause, prev/next, seek, volume, shuffle and repeat one.
  - Crossfade between songs, and gapless starts.
  - A queue that shows the real play order.
  - OS media keys and lock-screen controls through MediaSession.
- **Full player.** The cover becomes a drifting backdrop under a waveform
  horizon that moves with the music.
- **Lyrics** (button, or `Y`).
  - Time-synced lines come from [LRCLIB](https://lrclib.net). Bundled songs are
    timed to the word offline with whisper.cpp (`pnpm words`).
  - The current line fills as it's sung, and tapping a line seeks there.
  - Lyrics published only in Urdu script are shown in Devanagari.
- **Mini player.** A floating window that stays on top: Document
  Picture-in-Picture in Chromium, and a painted video in Safari.
- **Speakers and TVs.** AirPlay in Safari and Cast in Chrome, through the Remote
  Playback API.
- **Playlists.** Stored in `localStorage`. They mix catalogue and library songs,
  and can be shared as a link. Smart lists show Most Played and this month's top
  artists.
- **Offline.** It installs as an app (PWA). A service worker caches the app and
  every song you've played, and answers seeks locally.
- **Keyboard.** The full set of shortcuts is listed under the keyboard button,
  and they work inside the mini player too.

## Stack

Next.js (App Router, static export) · React · Tailwind CSS · TypeScript ·
Framer Motion · `idb-keyval` for IndexedDB · `music-metadata` for tag parsing.

`next.config.ts` sets `output: "export"`, so the build is plain static assets.
It's hosted on Cloudflare Workers static assets.

## Running locally

```bash
cp .env.example .env.local  # NEXT_PUBLIC_ENV=local turns on importing your own files
pnpm install
pnpm dev                    # http://localhost:3000
pnpm test                   # unit tests
pnpm build                  # static export into ./out
pnpm run deploy             # publish; see DEPLOY.md (not `pnpm deploy`, a pnpm built-in)
```

Importing audio by drag-and-drop is only switched on locally. Imported files are
stored in that browser's IndexedDB, so they belong on the machine that has the
files.

## SEO

`app/robots.ts` and `app/sitemap.ts` build `/robots.txt` and `/sitemap.xml`.
`app/layout.tsx` holds the title, description, canonical URL, Open Graph tags
and `WebApplication` structured data. The site is verified in Google Search
Console as the `purnashrestha.com.np` domain property.

## Layout

```
app/page.tsx                search, library and playlist UI
app/layout.tsx              metadata, structured data
app/robots.ts, sitemap.ts   /robots.txt and /sitemap.xml
components/Player.tsx       player bar, playback, crossfade, Cast/AirPlay, MediaSession
components/Lyrics.tsx       lyrics panel: frame clock, sweep, follow and hold
components/Horizon.tsx      waveform horizon in the full player
components/MiniPlayer.tsx   floating mini player
components/Playlists.tsx    playlists, smart lists, sharing
lib/music.ts                search, library, playlists, play counts
lib/lyrics.ts               LRC parsing, word lookup, LRCLIB lookup
lib/find.ts                 lyric search across scripts and spellings
lib/align.ts                word timing by forced alignment, build time only
lib/shortcuts.ts            the keyboard map
public/sw.js                service worker: offline app, song cache, Range requests
scripts/build-songs.mjs     indexes public/songs into songs.json
scripts/align-lyrics.mjs    runs whisper.cpp over the library for lib/align.ts
```
