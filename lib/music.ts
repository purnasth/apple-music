import { createStore, set, get, del, values, type UseStore } from 'idb-keyval';

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork?: string;
  appleUrl?: string;
  preview?: string;
  local?: boolean;
  duration?: number;
};

/* ---------- iTunes search (public API, CORS-open, no key) ---------- */

type ITunesResult = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
};

const hiRes = (url?: string) => url?.replace('100x100bb', '600x600bb');

export async function search(term: string, signal?: AbortSignal): Promise<Track[]> {
  if (!term.trim()) return [];
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=50`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`iTunes search failed (${res.status})`);
  // Apple serves this as text/javascript, so res.json() is unreliable across browsers.
  const data = JSON.parse(await res.text()) as { results: ITunesResult[] };
  return data.results
    .filter((r) => r.previewUrl)
    .map((r) => ({
      id: `itunes:${r.trackId}`,
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName ?? '',
      artwork: hiRes(r.artworkUrl100),
      appleUrl: r.trackViewUrl,
      preview: r.previewUrl,
      duration: r.trackTimeMillis ? r.trackTimeMillis / 1000 : undefined,
    }));
}

/* ---------- Local library: audio blobs in IndexedDB ---------- */

// Lazy so importing this module doesn't require IndexedDB (tests, SSR).
let _blobs: UseStore | undefined;
let _meta: UseStore | undefined;
const blobs = () => (_blobs ??= createStore('music-lib', 'blobs'));
const meta = () => (_meta ??= createStore('music-lib', 'meta'));

type MetaRecord = Omit<Track, 'artwork'> & { cover?: Blob };

export async function importFiles(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<Track[]> {
  const { parseBlob } = await import('music-metadata');
  const added: Track[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const id = `local:${crypto.randomUUID()}`;
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

    const record: MetaRecord = { id, title, artist, album, duration, cover, local: true };
    await set(id, file, blobs());
    await set(id, record, meta());
    added.push(toTrack(record));
    onProgress?.(i + 1, files.length);
  }
  return added;
}

const toTrack = (r: MetaRecord): Track => ({
  ...r,
  artwork: r.cover ? URL.createObjectURL(r.cover) : undefined,
});

export async function getLibrary(): Promise<Track[]> {
  const records = (await values(meta())) as MetaRecord[];
  return records.map(toTrack).sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
}

export async function removeTrack(id: string) {
  await del(id, blobs());
  await del(id, meta());
}

/** Resolve a playable URL. Local tracks stream from IndexedDB via an object URL. */
export async function audioSrc(track: Track): Promise<string | undefined> {
  if (!track.local) return track.preview;
  const file = await get<File>(track.id, blobs());
  return file ? URL.createObjectURL(file) : undefined;
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
