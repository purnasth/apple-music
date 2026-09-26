import type { Track } from "./music";

export type Line = { t: number; text: string };

/** "[mm:ss.xx] words" per line; a line may carry several stamps (a repeated chorus).
    Enhanced-LRC word stamps ("<mm:ss.xx>word") are stripped rather than shown raw. */
export function parseLrc(lrc: string): Line[] {
  const out: Line[] = [];
  for (const raw of lrc.split("\n")) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw
      .slice(stamps.at(-1)!.index! + stamps.at(-1)![0].length)
      .replace(/<\d+:\d+(?:\.\d+)?>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    for (const [, m, s] of stamps)
      out.push({ t: Number(m) * 60 + Number(s), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Index of the line being sung at `time`, or -1 before the first one. Binary
    search: it runs on every animation frame. */
export function lineAt(lines: Line[], time: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= time) {
      at = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return at;
}

/**
 * How far through line `i` the voice is, 0 to 1, for the sweep that fills the
 * current line. An instrumental gap fills across the whole gap. A sung line
 * fills at singing pace and then holds, because the gap before the next stamp
 * is often part silence and a sweep stretched over it would lag the voice.
 */
// ponytail: pace heuristic (~13 chars/s); exact only with per-word timings,
// which LRCLIB rarely has. Parse enhanced-LRC stamps here if that changes.
export function progress(lines: Line[], i: number, time: number): number {
  const line = lines[i];
  if (!line) return 0;
  const gap = (lines[i + 1]?.t ?? line.t + 5) - line.t;
  const span = line.text
    ? Math.min(gap, Math.max(1, line.text.length * 0.075))
    : gap;
  return Math.min(Math.max((time - line.t) / Math.max(span, 0.001), 0), 1);
}

export type Lyrics = { lines: Line[] } | { plain: string };

type LrcRecord = {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  duration?: number;
};

/* LRCLIB (lrclib.net): community lyrics, no key, CORS on. Synced beats plain,
   and lyrics inside the file beat LRCLIB's plain text — they came with the song. */
const cache = new Map<string, Promise<Lyrics | null>>();

/** One lookup per track, shared by every caller — so no abort signal: cancelling
    for one panel must not hand the next one a rejected promise. */
export function getLyrics(track: Track): Promise<Lyrics | null> {
  let p = cache.get(track.id);
  if (!p) {
    p = fetchLyrics(track);
    cache.set(track.id, p);
    p.catch(() => cache.delete(track.id)); // a network blip should not stick
  }
  return p;
}

async function lrclib(path: string, params: Record<string, string>) {
  const res = await fetch(
    `https://lrclib.net/api/${path}?${new URLSearchParams(params)}`,
  );
  return res.ok ? ((await res.json()) as LrcRecord | LrcRecord[]) : null;
}

async function fetchLyrics(track: Track): Promise<Lyrics | null> {
  const dur = track.duration ?? 0;
  const exact = (await lrclib("get", {
    artist_name: track.artist,
    track_name: track.title,
    album_name: track.album,
    duration: String(Math.round(dur)),
  })) as LrcRecord | null;
  let hit = exact?.syncedLyrics ? exact : null;

  // The exact match wants artist, album and duration all to agree; a collaboration
  // credit or a remaster length breaks it. Search on title and lead artist, and
  // take a synced result whose length is close enough to be the same recording.
  if (!hit) {
    const found = (await lrclib("search", {
      track_name: track.title,
      artist_name: track.artist.split(/\s*[,&]\s*/)[0],
    })) as LrcRecord[] | null;
    hit =
      found?.find(
        (r) =>
          r.syncedLyrics && (!dur || Math.abs((r.duration ?? 0) - dur) < 5),
      ) ?? null;
  }
  if (hit?.syncedLyrics) return { lines: parseLrc(hit.syncedLyrics) };

  if (track.lyrics) {
    const res = await fetch(track.lyrics);
    if (res.ok) return { plain: await res.text() };
  }
  return exact?.plainLyrics ? { plain: exact.plainLyrics } : null;
}
