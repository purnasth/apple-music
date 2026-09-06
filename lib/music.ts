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
  if (!expired(track.preview)) return track.preview;
  const id = track.id.startsWith('deezer:') ? track.id.slice(7) : undefined;
  if (!id) return track.preview;
  const fresh = await jsonp<DzTrack>(`track/${id}`, {}, signal);
  return fresh.preview ?? track.preview;
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

export const fmtTime = (s?: number) => {
  if (!s || !isFinite(s)) return '--:--';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
