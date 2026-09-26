import type { Track } from "./music";

export type Line = {
  t: number;
  text: string;
  /** Start of each space-separated word, seconds — present once aligned to the word. */
  w?: number[];
  /** When singing on this line stops; the last word's end. */
  e?: number;
};

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

/**
 * For a line timed to the word: which word is being sung (-1 before the first)
 * and how far through it, 0 to 1. A word fills over the time to the next word,
 * but no slower than a held syllable would, so a pause after a word does not
 * read as the word being stretched across it.
 */
export function wordAt(line: Line, time: number): { k: number; p: number } {
  const w = line.w;
  if (!w?.length || time < w[0]) return { k: -1, p: 0 };
  let k = 0;
  while (k + 1 < w.length && w[k + 1] <= time) k++;
  const next = w[k + 1] ?? line.e ?? w[k] + 1;
  const len = line.text.split(" ")[k]?.length ?? 1;
  const span = Math.min(next - w[k], Math.max(0.3, len * 0.16));
  return {
    k,
    p: Math.min(Math.max((time - w[k]) / Math.max(span, 0.001), 0), 1),
  };
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

/** LRCLIB's best timed text for a track, plus the plain text of its exact match.
    Shared with scripts/align-lyrics.mjs, so the words the aligner times are the
    words the browser would have shown. */
export async function findLrc(
  track: Pick<Track, "title" | "artist" | "album" | "duration">,
): Promise<{ synced: string | null; plain: string | null }> {
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
  return {
    synced: hit?.syncedLyrics ?? null,
    plain: exact?.plainLyrics ?? null,
  };
}

async function fetchLyrics(track: Track): Promise<Lyrics | null> {
  // Timed to the word offline by scripts/align-lyrics.mjs: the most exact
  // source there is, a static file beside the song, and no LRCLIB round trip.
  if (track.words) {
    const res = await fetch(track.words).catch(() => null);
    const data = res?.ok
      ? ((await res.json()) as { lines?: Line[] | null })
      : null;
    if (data?.lines?.length) return { lines: data.lines };
  }

  const { synced, plain } = await findLrc(track);
  if (synced) return { lines: parseLrc(synced) };

  if (track.lyrics) {
    const res = await fetch(track.lyrics);
    if (res.ok) return { plain: await res.text() };
  }
  return plain ? { plain } : null;
}
