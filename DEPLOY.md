# Deploying

The site deploys as static assets on Cloudflare Workers — free, with unlimited
asset requests and no storage cost. The 111 songs ship as ordinary files
alongside the HTML.

## Publishing

```
npm run deploy
```

That regenerates the manifest, builds, and uploads. Run it from this machine —
it is the only place the songs exist.

## Adding songs

1. Drop the files into `public/songs/<folder>/`. The folder name becomes a filter
   chip in the Library tab, so `all-time`, `current` and `new` already work; a new
   folder appears on its own.
2. `npm run deploy`

Tags are read from the files themselves, so nothing needs renaming. Only changed
files upload — wrangler skips assets already on the edge by content hash.

## Why deploys are manual

Cloudflare Builds deploys on every push to `main`, but it builds from the git
clone, and the audio is not in git (840 MB, deliberately not committed). Since a
deploy replaces the whole asset manifest, a CI deploy would leave the library
empty.

**Turn off the automatic build** in the Cloudflare dashboard — Workers & Pages →
apple-music → Settings → Builds — so a merge cannot wipe the songs. Publish with
`npm run deploy` instead.

If you would rather have merges deploy on their own, the alternative is to commit
the audio to git so CI has it: about 840 MB in history, permanently, and a slower
clone on every build. That is the trade — automatic merges, or a small repo.

## Where things live

| | |
|---|---|
| audio | `public/songs/<folder>/` — drop files here, gitignored |
| covers | `public/songs-art`, generated, gitignored |
| manifest | `public/songs.json`, generated, gitignored |
| in git | `scripts/build-songs.mjs`, ~4 KB |

`build-songs.mjs` uses `sips` for the cover resize, so publishing works on macOS only.
