# Music

A static, serverless music search-and-player web app. Search the Apple Music
catalogue, preview tracks, import your own audio files, and build playlists —
with no database, no accounts, and no backend to run.

## What it does

- **Search** the Apple Music catalogue via the public iTunes Search API.
  Debounced, cancels stale requests, and pulls 600px artwork. No API key.
- **Play** through a persistent player bar: play/pause, prev/next, seek,
  volume, shuffle, repeat, plus OS media keys and lockscreen controls via the
  native MediaSession API.
- **Import** your own audio files by drag-and-drop. Tags (title, artist, album,
  duration, embedded cover art) are parsed in the browser; the audio is stored
  as blobs in IndexedDB, so it plays full-length, persists across reloads, and
  works offline.
- **Playlists** stored in `localStorage`, freely mixing catalogue tracks and
  your own files.

## A note on catalogue playback

The iTunes Search API returns **30-second previews**, so catalogue tracks play
as previews only. Every result links out to Apple Music (`↗`) for full
playback. For full-length audio inside this app, either import files you own
into the Library tab, or wire up
[MusicKit JS](https://developer.apple.com/documentation/musickitjs) to stream
full tracks for listeners with an Apple Music subscription.

## Stack

Next.js (App Router, static export) · React · Tailwind CSS · TypeScript ·
`idb-keyval` for IndexedDB · `music-metadata` for tag parsing.

There is no server component to any of this — `next.config.ts` sets
`output: "export"`, so the build is plain static assets.

## Running locally

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # smoke tests against the live search API
npm run build    # static export into ./out
```

## Deploying

The build output is a static directory, so it hosts anywhere. For Cloudflare
Pages:

- **Build command:** `npm run build`
- **Output directory:** `out`

Or directly: `npx wrangler pages deploy out`

## Layout

```
app/page.tsx          search, library and playlist UI
components/Player.tsx player bar, playback and MediaSession wiring
lib/music.ts          search, IndexedDB library, playlist persistence
lib/music.test.ts     smoke tests
```
