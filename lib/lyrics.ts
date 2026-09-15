import type { Track } from './music';

export type Line = { t: number; text: string };

/** "[mm:ss.xx] words" per line; a line may carry several stamps (a repeated chorus). */
export function parseLrc(lrc: string): Line[] {
  const out: Line[] = [];
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.slice(stamps.at(-1)!.index! + stamps.at(-1)![0].length).trim();
    for (const [, m, s] of stamps) out.push({ t: Number(m) * 60 + Number(s), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Index of the line being sung at `time`, or -1 before the first one. */
export function lineAt(lines: Line[], time: number): number {
  let i = -1;
  while (i + 1 < lines.length && lines[i + 1].t <= time) i++;
  return i;
}

export type Lyrics = { lines: Line[] } | { plain: string };

type LrcRecord = { syncedLyrics?: string | null; plainLyrics?: string | null; duration?: number };

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
  const res = await fetch(`https://lrclib.net/api/${path}?${new URLSearchParams(params)}`);
  return res.ok ? ((await res.json()) as LrcRecord | LrcRecord[]) : null;
}

async function fetchLyrics(track: Track): Promise<Lyrics | null> {
  const dur = track.duration ?? 0;
  const exact = (await lrclib('get', {
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
    const found = (await lrclib('search', {
      track_name: track.title,
      artist_name: track.artist.split(/\s*[,&]\s*/)[0],
    })) as LrcRecord[] | null;
    hit = found?.find((r) => r.syncedLyrics && (!dur || Math.abs((r.duration ?? 0) - dur) < 5)) ?? null;
  }
  if (hit?.syncedLyrics) return { lines: parseLrc(hit.syncedLyrics) };

  if (track.lyrics) {
    const res = await fetch(track.lyrics);
    if (res.ok) return { plain: await res.text() };
  }
  return exact?.plainLyrics ? { plain: exact.plainLyrics } : null;
}
