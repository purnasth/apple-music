import { createStore, set, get, del, values, type UseStore } from 'idb-keyval';

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork?: string;
  /** Bigger cover for the fullscreen view; only fetched when it opens. */
  artworkLarge?: string;
  appleUrl?: string;
  preview?: string;
  local?: boolean;
  duration?: number;
  /** Immediate parent folder when imported via the folder picker (new, OG, temp…). */
  folder?: string;
};

/* ---------- Deezer search (public API, no key) ----------
   The iTunes Search API only indexes the iTunes *Store* purchase catalog, so
   streaming-only releases are simply absent — e.g. The 1975's "Being Funny in a
   Foreign Language" returns nothing there. Deezer indexes the streaming catalog
   and still hands back a 30s preview and cover art. */

type DzTrack = {
  id: number;
  title: string;
  duration?: number;
  preview?: string;
  artist: { name: string };
  album?: { title?: string; cover_xl?: string; cover_big?: string };
};

let jsonpSeq = 0;

/** Deezer sends no CORS headers but does support JSONP, which keeps this app a static export. */
function jsonp<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams(params);
  // Node/SSR (tests) has no DOM to inject a script into — but also no CORS to dodge.
  if (typeof document === 'undefined') {
    return fetch(`https://api.deezer.com/${path}?${qs}`, { signal }).then((r) => r.json() as Promise<T>);
  }
  return new Promise<T>((resolve, reject) => {
    const cb = `__dz${jsonpSeq++}`;
    const script = document.createElement('script');
    const w = window as unknown as Record<string, unknown>;
    const done = () => {
      delete w[cb];
      script.remove();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      done();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort);
    w[cb] = (data: T) => {
      done();
      resolve(data);
    };
    script.onerror = () => {
      done();
      reject(new Error('Deezer search failed'));
    };
    qs.set('output', 'jsonp');
    qs.set('callback', cb);
    script.src = `https://api.deezer.com/${path}?${qs}`;
    document.head.append(script);
  });
}

const toTrack = (r: DzTrack): Track => ({
  id: `deezer:${r.id}`,
  title: r.title,
  artist: r.artist.name,
  album: r.album?.title ?? '',
  artwork: r.album?.cover_big ?? r.album?.cover_xl,
  artworkLarge: r.album?.cover_xl ?? r.album?.cover_big,
  // Deezer has no Apple ids, so deep-link into Apple Music's own search instead.
  appleUrl: `https://music.apple.com/search?term=${encodeURIComponent(`${r.artist.name} ${r.title}`)}`,
  preview: r.preview,
  duration: r.duration,
});

export async function search(term: string, signal?: AbortSignal): Promise<Track[]> {
  if (!term.trim()) return [];
  const data = await jsonp<{ data?: DzTrack[]; error?: { message?: string } }>(
    'search',
    { q: term, limit: '100' },
    signal
  );
  if (data.error) throw new Error(data.error.message ?? 'Deezer search failed');
  return (data.data ?? []).filter((r) => r.preview).map(toTrack);
}

/* ---------- Local library: audio blobs in IndexedDB ---------- */

// Lazy so importing this module doesn't require IndexedDB (tests, SSR).
let _blobs: UseStore | undefined;
let _meta: UseStore | undefined;
const blobs = () => (_blobs ??= createStore('music-lib', 'blobs'));
const meta = () => (_meta ??= createStore('music-lib', 'meta'));

type MetaRecord = Omit<Track, 'artwork'> & { cover?: Blob };

/** webkitRelativePath is "<picked>/<sub>/<file>" for a folder pick and "" for a plain one. */
export const folderOf = (path: string) => path.split('/').at(-2) || undefined;

export async function importFiles(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<Track[]> {
  const { parseBlob } = await import('music-metadata');
  const added: Track[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const id = `local:${crypto.randomUUID()}`;
    const folder = folderOf(file.webkitRelativePath);
    let title = file.name.replace(/\.[^.]+$/, '');
    let artist = 'Unknown artist';
    let album = '';
    let duration: number | undefined;
    let cover: Blob | undefined;

    try {
      const { common, format } = await parseBlob(file, { duration: true });
      if (common.title) title = common.title;
      if (common.artist) artist = common.artist;
      if (common.album) album = common.album;
      duration = format.duration;
      const pic = common.picture?.[0];
      // uint8array-backed; copy into a fresh Blob so it survives structured clone
      if (pic) cover = new Blob([new Uint8Array(pic.data)], { type: pic.format });
    } catch {
      // Unreadable tags are not fatal — filename metadata still plays fine.
    }

    const record: MetaRecord = { id, title, artist, album, duration, cover, folder, local: true };
    await set(id, file, blobs());
    await set(id, record, meta());
    added.push(localTrack(record));
    onProgress?.(i + 1, files.length);
  }
  return added;
}

const localTrack = (r: MetaRecord): Track => ({
  ...r,
  artwork: r.cover ? URL.createObjectURL(r.cover) : undefined,
});

/** 30s clips come from the catalogue; bundled and imported files are whole tracks. */
export const isPreview = (t: Track) => !t.local && !t.id.startsWith('file:');

/** The library shipped with the site (public/songs.json), audio hosted on R2. */
async function bundled(): Promise<Track[]> {
  try {
    const res = await fetch('/songs.json');
    return res.ok ? ((await res.json()) as Track[]) : [];
  } catch {
    return []; // No manifest is a normal state, not an error.
  }
}

export async function getLibrary(): Promise<Track[]> {
  const records = (await values(meta())) as MetaRecord[];
  const all = [...(await bundled()), ...records.map(localTrack)];
  return all.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
}

export async function removeTrack(id: string) {
  await del(id, blobs());
  await del(id, meta());
}

/** Deezer signs preview URLs with a ~15 minute expiry, so a saved playlist goes mute. */
const expired = (url?: string) => {
  const exp = url?.match(/exp=(\d+)/)?.[1];
  return !exp || Number(exp) * 1000 < Date.now() + 5_000;
};

/** Resolve a playable URL. Local tracks stream from IndexedDB via an object URL. */
export async function audioSrc(track: Track, signal?: AbortSignal): Promise<string | undefined> {
  if (track.local) {
    const file = await get<File>(track.id, blobs());
    return file ? URL.createObjectURL(file) : undefined;
  }

  // Bundled tracks stream straight off their URL: the service worker
  // (public/sw.js) caches /songs/* and answers Range requests itself, which
  // Cloudflare's static assets won't — so playback starts on the first chunks,
  // seeks work, and replays come from the local cache, even offline.
  if (track.id.startsWith('file:')) return track.preview;

  if (!expired(track.preview)) return track.preview;
  const id = track.id.startsWith('deezer:') ? track.id.slice(7) : undefined;
  if (!id) return track.preview;
  const fresh = await jsonp<DzTrack>(`track/${id}`, {}, signal);
  return fresh.preview ?? track.preview;
}

/* ---------- Session: resume where the listener left off ---------- */

const SS_KEY = 'session';
const SS_TIME_KEY = 'session-time';

export type Session = {
  queue: Track[];
  index: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: boolean;
  /** Position in the track at `index`, tagged with its id so a stale time never applies. */
  time?: { id: string; t: number };
};

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const s = JSON.parse(localStorage.getItem(SS_KEY) ?? 'null') as Session | null;
    if (!s?.queue?.length) return null;
    s.time = JSON.parse(localStorage.getItem(SS_TIME_KEY) ?? 'null') ?? undefined;
    return s;
  } catch {
    return null;
  }
}

/** The queue and settings — written when they change. Position goes through saveSessionTime. */
export function saveSession(s: Omit<Session, 'time'>) {
  // Object URLs for local artwork are per-session, so drop them before persisting.
  const queue = s.queue.map((t) => (t.local ? { ...t, artwork: undefined } : t));
  localStorage.setItem(SS_KEY, JSON.stringify({ ...s, queue }));
}

/** Written every few seconds of playback — its own key so the queue isn't rewritten per tick. */
export function saveSessionTime(id: string, t: number) {
  localStorage.setItem(SS_TIME_KEY, JSON.stringify({ id, t }));
}

/* ---------- Recently played: a small localStorage ring ---------- */

const RECENT_KEY = 'recent';

export function getRecent(): Track[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Track[];
  } catch {
    return [];
  }
}

/** Move the track to the head, keep the last 20, and hand back the new list. */
export function pushRecent(t: Track): Track[] {
  // Object URLs for local artwork are per-session, so drop them before persisting.
  const head = t.local ? { ...t, artwork: undefined } : t;
  const list = [head, ...getRecent().filter((x) => x.id !== t.id)].slice(0, 20);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  return list;
}

/* ---------- Playlists: localStorage, no server ---------- */

const PL_KEY = 'playlists';

export type Playlists = Record<string, Track[]>;

export function getPlaylists(): Playlists {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(PL_KEY) ?? '{}') as Playlists;
  } catch {
    return {};
  }
}

export function savePlaylists(p: Playlists) {
  // Object URLs for local artwork are per-session, so drop them before persisting.
  const clean: Playlists = {};
  for (const [name, tracks] of Object.entries(p)) {
    clean[name] = tracks.map((t) => (t.local ? { ...t, artwork: undefined } : t));
  }
  localStorage.setItem(PL_KEY, JSON.stringify(clean));
}

/* ---------- Sharing: the playlist travels inside the link ----------
   There is no server to store a playlist on, so the link carries it: gzip the
   list, base64url it, hang it off the fragment. The fragment never reaches the
   host, and a bundled track collapses to its id because the recipient's copy of
   songs.json already has the rest. */

/** A bundled track is just its id; anything else carries metadata. Preview URLs
    are dropped — Deezer's expire in minutes and audioSrc refetches from the id. */
type SharedTrack = string | Omit<Track, 'preview' | 'local' | 'folder'>;

const b64url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const unb64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const gz = async (data: BlobPart, t: CompressionFormat, Codec = CompressionStream) =>
  new Response(new Blob([data]).stream().pipeThrough(new Codec(t)));

/** Imported files live in the sender's IndexedDB, so they cannot travel; caller warns. */
export const shareable = (tracks: Track[]) => tracks.filter((t) => !t.local);

export async function encodePlaylist(name: string, tracks: Track[]): Promise<string> {
  const items: SharedTrack[] = shareable(tracks).map((t) =>
    t.id.startsWith('file:')
      ? t.id
      : {
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          artwork: t.artwork,
          artworkLarge: t.artworkLarge,
          appleUrl: t.appleUrl,
          duration: t.duration,
        }
  );
  const body = JSON.stringify([name, items]);
  return b64url(new Uint8Array(await (await gz(body, 'gzip')).arrayBuffer()));
}

/** A link is untrusted input: every field is re-typed, and every URL must be https
    so a crafted link cannot smuggle a javascript: href into the list. */
const httpsUrl = (v: unknown) => (typeof v === 'string' && v.startsWith('https://') ? v : undefined);

const fromShared = (x: unknown, byId: Map<string, Track>): Track | undefined => {
  if (typeof x === 'string') return byId.get(x);
  if (!x || typeof x !== 'object') return;
  const r = x as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : '');
  const id = str(r.id);
  if (!id || id.startsWith('local:')) return;
  return {
    id,
    title: str(r.title) || 'Unknown title',
    artist: str(r.artist) || 'Unknown artist',
    album: str(r.album),
    // Relative paths belong to this site's own manifest, which the id lookup covers.
    artwork: httpsUrl(r.artwork),
    artworkLarge: httpsUrl(r.artworkLarge),
    appleUrl: httpsUrl(r.appleUrl),
    duration: typeof r.duration === 'number' && isFinite(r.duration) ? r.duration : undefined,
  };
};

export async function decodePlaylist(
  code: string,
  library: Track[]
): Promise<{ name: string; tracks: Track[] } | null> {
  // A short cap keeps a hand-crafted archive from unpacking into gigabytes.
  if (!code || code.length > 200_000) return null;
  try {
    const text = await (await gz(unb64url(code), 'gzip', DecompressionStream)).text();
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return null;
    const [name, items] = parsed as [unknown, unknown];
    if (!Array.isArray(items)) return null;
    const byId = new Map(library.map((t) => [t.id, t]));
    return {
      name: (typeof name === 'string' && name.trim().slice(0, 80)) || 'Shared playlist',
      tracks: items
        .slice(0, 500)
        .map((x) => fromShared(x, byId))
        .filter((t): t is Track => !!t),
    };
  } catch {
    return null; // Truncated in a chat app, hand-edited, or simply not one of ours.
  }
}

/* ---------- Backup: every playlist in one file ---------- */

/** A list of share codes rather than a format of its own, so backup and link use
    one encoder and one validation path on the way back in. */
export async function encodeBackup(p: Playlists): Promise<string> {
  return JSON.stringify(
    {
      app: 'apple-music',
      saved: new Date().toISOString(),
      playlists: await Promise.all(
        Object.entries(p).map(([name, tracks]) => encodePlaylist(name, tracks))
      ),
    },
    null,
    2
  );
}

export async function decodeBackup(text: string, library: Track[]): Promise<Playlists | null> {
  try {
    const { playlists } = JSON.parse(text) as { playlists?: unknown };
    if (!Array.isArray(playlists)) return null;
    const out: Playlists = {};
    for (const code of playlists.slice(0, 200)) {
      const p = typeof code === 'string' ? await decodePlaylist(code, library) : null;
      if (p) out[p.name] = p.tracks;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Tags credit a collaboration as one string — "Pritam, Arijit Singh & Amitabh Bhattacharya"
 * is three people, and grouping by the raw string buries Arijit Singh across a dozen
 * near-duplicate entries. Split on comma and ampersand only: "Sachin-Jigar" and
 * "Dan + Shay" are single acts, so hyphen and plus must be left alone.
 */
export const artistsOf = (credit: string) =>
  credit
    .split(/\s*[,&]\s*/)
    .map((a) => a.trim())
    .filter(Boolean);

/**
 * Fisher-Yates. Repeatedly picking a random index — the obvious approach — can play the
 * same track twice before others play at all; a permutation plays each exactly once.
 */
export function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A whole playlist reads as "48 min", not as a 48:12 clock. */
export const fmtTotal = (tracks: Track[]) => {
  const m = Math.round(tracks.reduce((n, t) => n + (t.duration ?? 0), 0) / 60);
  if (!m) return '';
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`;
};

export const fmtTime = (s?: number) => {
  // 0 is a real time (a track starts there) — only absent/infinite is unknown.
  if (s == null || !isFinite(s)) return '--:--';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
