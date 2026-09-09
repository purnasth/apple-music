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

Note that the in-browser import controls — the Import button, the folder picker,
the dropzone and the drag-anywhere target — are not on the deployed site. They
write into whichever browser is looking at the page, which is useful here and
meaningless to a visitor. `NEXT_PUBLIC_ENV` decides: `local` shows them,
anything else hides them, and `npm run deploy` sets `production` itself so a
stray `.env.local` cannot ship them. Being set at build time it folds to a
literal, so the code is dropped from the bundle rather than hidden inside it.

A fresh clone needs `cp .env.example .env.local` to get the import controls in
`npm run dev`. Adding songs goes through `public/songs/` above.

## Why deploys are manual

Cloudflare Builds deploys on every push to `main`, but it builds from the git
clone, and the audio is not in git (840 MB, deliberately not committed). Since a
deploy replaces the whole asset manifest, a CI deploy would leave the library
empty.

**Turn off the automatic build** in the Cloudflare dashboard — Workers & Pages →
apple-music → Settings → Builds — so a merge cannot wipe the songs. Publish with
`npm run deploy` instead.

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
| manifest | `public/songs.json`, generated, gitignored |
| in git | `scripts/build-songs.mjs`, ~4 KB |

`build-songs.mjs` uses `sips` for the cover resize, so publishing works on macOS only.
