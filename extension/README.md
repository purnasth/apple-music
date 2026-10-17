# YouTube history extension

YouTube no longer records songs played in the site's embedded player, even when
you're signed in. Without this extension, nothing you hear on `/youtube` reaches
your watch history or recommendations.

With it, once a song has played for 30 seconds the extension sends YouTube the
same reports its own player sends. The song shows up in your watch history and
feeds your recommendations, as if you'd watched it on youtube.com. Nothing opens
on screen.

It also works the other way: **For you** on `/youtube` opens on YouTube Music's
own Quick picks for your account, instead of the site's guess from your plays
here. Without the extension, For you falls back to that guess.

## Setup

You need desktop Chrome (or another Chromium browser: Edge, Brave, Arc), signed
in to YouTube in the same profile you use for the site.

1. Get this folder onto the computer: clone the repo, or download it from GitHub
   and unzip it. Chrome loads it from disk, so keep it where it is afterwards.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (switch, top right).
4. Click **Load unpacked** and choose this `extension/` folder.
5. **Music by Purna: YouTube history** appears in the list. Check that it's
   switched on.
6. Reload any open tab of the site, so it connects to the extension. The pill
   next to the YouTube page's tabs turns green: **YouTube history on**.

## Check that it works

1. On [music.purnashrestha.com.np/youtube](https://music.purnashrestha.com.np/youtube),
   play a song you haven't watched today for at least 30 seconds (or half of a
   song shorter than a minute).
2. Open [youtube.com/feed/history](https://www.youtube.com/feed/history). The
   song is at the top, under **Today**.
3. Open **For you** on `/youtube`. The card above Quick picks says **From your
   YouTube**, and the songs match Quick picks on
   [music.youtube.com](https://music.youtube.com).

## After changing anything in this folder

Chrome doesn't notice edits by itself:

1. In `chrome://extensions`, click the reload icon (↻) on the extension's card.
   If the permissions changed, Chrome asks you to approve them.
2. Reload the site's tab. A tab left open stays linked to the old copy and
   can't send anything.

## Troubleshooting

Open the extension's console: `chrome://extensions` → the extension → **service
worker**. Each failure is logged there as `YouTube history: …`. A red
**Errors** button on the card shows the same thing; clear it after a fix so old
errors don't look new.

| What you see | Why | Fix |
| --- | --- | --- |
| Pill still says **YouTube history off** | The extension is off, or the tab was open before it was loaded or reloaded | Switch it on in `chrome://extensions`, then reload the tab |
| Nothing in history, no errors | The site tab was open before the extension was loaded or reloaded | Reload the site's tab |
| `no tracking URL` | Signed out of YouTube in this profile, or YouTube changed its watch page | Sign in to youtube.com; if you're already signed in, see *If it stops working* |
| `blocked by CORS policy` on `s.youtube.com` | The extension can only reach `www.youtube.com` | `host_permissions` in `manifest.json` must be `https://*.youtube.com/*`; reload the extension |
| For you says **For you** or **Popular now**, not **From your YouTube** | No YouTube Music home feed: signed out of it, or its page changed. The console says `YouTube picks: …` | Sign in at music.youtube.com and reload. Picks are cached for 30 minutes, so a change there shows up here within that time |
| Song stays at 0:00 on the site | The site's tab is hidden: Chrome won't start a video there | Bring the tab to the front |
| Watch history paused | YouTube records nothing while it's paused, from anywhere | Turn it back on in YouTube's history settings |

## Limits

- **Only where it's installed.** Phones, other browsers and other Chrome
  profiles don't record history.
- **Progress bar shows full.** YouTube draws the red bar as fully watched,
  wherever you stopped. Recommendations aren't affected.
- **It relies on YouTube's private reporting**, the same way yt-dlp's
  `--mark-watched` does. If YouTube changes it, songs quietly stop appearing.

## If it stops working

Compare `background.js` with yt-dlp's `_mark_watched` in
`yt_dlp/extractor/youtube`, which tracks the same reporting. For Quick picks,
compare with ytmusicapi's `get_home`, which reads the same home feed. If YouTube starts
counting embedded plays again, delete this folder and the `watched` lines in
`components/YouTube.tsx`; otherwise every song counts twice.

## Files

```
manifest.json   permissions: *.youtube.com, and the site + localhost:3000
site.js         content script on the site: tells the page it's installed, relays { id, t, len }
background.js   service worker: sends the watch reports, reads Quick picks
icons/          the site's logo with rounded corners, made from public/icon-512.png
```
