'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Player from '@/components/Player';
import {
  Track,
  Playlists,
  search,
  importFiles,
  isPreview,
  getLibrary,
  removeTrack,
  getPlaylists,
  savePlaylists,
  fmtTime,
  shuffled,
  artistsOf,
} from '@/lib/music';

type Tab = 'search' | 'library' | 'playlists';

type SortKey = 'artist' | 'title' | 'album' | 'longest' | 'shortest';

const SORTS: Record<SortKey, (a: Track, b: Track) => number> = {
  artist: (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
  title: (a, b) => a.title.localeCompare(b.title),
  album: (a, b) => (a.album || '~').localeCompare(b.album || '~') || a.title.localeCompare(b.title),
  longest: (a, b) => (b.duration ?? 0) - (a.duration ?? 0),
  shortest: (a, b) => (a.duration ?? 0) - (b.duration ?? 0),
};

export default function Home() {
  const [tab, setTab] = useState<Tab>('search');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [library, setLibrary] = useState<Track[]>([]);
  const [importing, setImporting] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [artist, setArtist] = useState<string>('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('artist');

  const [playlists, setPlaylists] = useState<Playlists>({});
  const [active, setActive] = useState<string | null>(null);

  const [queue, setQueue] = useState<Track[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    getLibrary().then(setLibrary);
    setPlaylists(getPlaylists());
  }, []);

  // Debounced search; the in-flight request is aborted when the query moves on.
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearchError(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      search(query, ctrl.signal)
        .then(setResults)
        .catch((e) => {
          if (e.name !== 'AbortError') setSearchError('Search failed. Check your connection.');
        })
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const play = (tracks: Track[], i: number) => {
    setQueue(tracks);
    setQIndex(i);
    setPlaying(true);
  };

  // A folder change can strand an artist selection that folder has no tracks for.
  useEffect(() => setArtist(''), [folder]);

  const updatePlaylists = (next: Playlists) => {
    setPlaylists(next);
    savePlaylists(next);
  };

  const addTo = (name: string, track: Track) => {
    if (playlists[name]?.some((t) => t.id === track.id)) return;
    updatePlaylists({ ...playlists, [name]: [...(playlists[name] ?? []), track] });
  };

  const onFiles = useCallback(async (files: File[]) => {
    const audio = files.filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|flac|wav|ogg|opus|aac)$/i.test(f.name));
    if (!audio.length) return;
    setImporting(`0 / ${audio.length}`);
    try {
      await importFiles(audio, (d, t) => setImporting(`${d} / ${t}`));
      setLibrary(await getLibrary());
    } finally {
      setImporting(null);
    }
  }, []);

  const folders = [...new Set(library.map((t) => t.folder).filter(Boolean as unknown as (f?: string) => f is string))].sort();

  const inFolder = library.filter((t) => !folder || t.folder === folder);

  // Every credited person, not every credit string, folded case-insensitively so
  // "LANY" and "Lany" are one artist. The spelling shown is the one used most often.
  const artists = (() => {
    const byKey = new Map<string, Map<string, number>>();
    for (const t of inFolder) {
      for (const name of artistsOf(t.artist)) {
        const variants = byKey.get(name.toLowerCase()) ?? new Map<string, number>();
        variants.set(name, (variants.get(name) ?? 0) + 1);
        byKey.set(name.toLowerCase(), variants);
      }
    }
    return [...byKey.values()]
      .map((variants) => {
        // Most common spelling wins; on a tie prefer the one with more capitals, so a
        // stylised name (LANY, MGMT) beats a lowercased stray rather than losing a coin flip.
        const caps = (v: string) => (v.match(/[A-Z]/g) ?? []).length;
        const ranked = [...variants.entries()].sort(
          (a, b) => b[1] - a[1] || caps(b[0]) - caps(a[0]) || a[0].localeCompare(b[0])
        );
        return { name: ranked[0][0], count: ranked.reduce((n, [, c]) => n + c, 0) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const needle = filter.trim().toLowerCase();
  const artistNeedle = artist.trim().toLowerCase();
  const inLibrary = inFolder
    // Substring, so a half-typed name still narrows rather than matching nothing.
    .filter((t) => !artistNeedle || artistsOf(t.artist).some((a) => a.toLowerCase().includes(artistNeedle)))
    .filter((t) => !needle || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(needle))
    .sort(SORTS[sort]);

  const shown = tab === 'search' ? results : tab === 'library' ? inLibrary : active ? playlists[active] ?? [] : [];

  return (
    <div className="min-h-screen bg-neutral-950 pb-28 text-neutral-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">
              <span className="text-red-500">♫</span> Music
            </h1>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTab('search');
              }}
              placeholder="Search songs, artists, albums…"
              className="flex-1 rounded-full bg-white/10 px-4 py-2 text-sm outline-none placeholder:text-neutral-500 focus:bg-white/15"
            />
          </div>
          <nav className="flex gap-1 text-sm">
            {(['search', 'library', 'playlists'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1 capitalize transition ${
                  tab === t ? 'bg-white text-black' : 'text-neutral-400 hover:bg-white/10'
                }`}
              >
                {t}
                {t === 'library' && library.length ? ` (${library.length})` : ''}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === 'library' && (
          <DropZone onFiles={onFiles} importing={importing} />
        )}

        {tab === 'library' && !!library.length && (
          <div className="mb-4 space-y-3">
            {folders.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {[null, ...folders].map((f) => (
                  <button
                    key={f ?? '__all'}
                    onClick={() => setFolder(f)}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      folder === f ? 'bg-white text-neutral-900' : 'bg-white/10 text-neutral-400 hover:bg-white/20'
                    }`}
                  >
                    {f ?? 'All'} ({f ? library.filter((t) => t.folder === f).length : library.length})
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter title, artist, album…"
                aria-label="Filter library"
                className="min-w-40 flex-1 rounded-full bg-white/10 px-4 py-1.5 text-xs outline-none placeholder:text-neutral-500 focus:bg-white/15"
              />

              {/* A datalist gives type-to-search over 85 artists for free; a <select> that
                  long can only be scrolled. Typing a partial name still filters. */}
              <input
                list="artist-options"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder={`All artists (${artists.length})`}
                aria-label="Artist"
                className="w-44 rounded-full bg-white/10 px-4 py-1.5 text-xs outline-none placeholder:text-neutral-500 focus:bg-white/15"
              />
              <datalist id="artist-options">
                {artists.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.count} {a.count === 1 ? 'track' : 'tracks'}
                  </option>
                ))}
              </datalist>

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort by"
                className="rounded-full bg-white/10 px-3 py-1.5 text-xs outline-none focus:bg-white/15"
              >
                <option value="artist">Artist</option>
                <option value="title">Title</option>
                <option value="album">Album</option>
                <option value="longest">Longest first</option>
                <option value="shortest">Shortest first</option>
              </select>

              <button
                onClick={() => inLibrary.length && play(inLibrary, 0)}
                disabled={!inLibrary.length}
                className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-40"
              >
                ▶ Play
              </button>
              <button
                onClick={() => inLibrary.length && play(shuffled(inLibrary), 0)}
                disabled={!inLibrary.length}
                title="Play these in a random order"
                className="rounded-full bg-white/10 px-4 py-1.5 text-xs transition hover:bg-white/20 disabled:opacity-40"
              >
                ⇄ Shuffle
              </button>
            </div>

            {(!!needle || !!artist) && (
              <p className="text-[11px] text-neutral-500">
                {inLibrary.length} of {library.length} tracks
                {artist && ` · ${artist}`}
                {(needle || artist) && (
                  <button
                    onClick={() => {
                      setFilter('');
                      setArtist('');
                    }}
                    className="ml-2 underline underline-offset-2 hover:text-neutral-300"
                  >
                    clear
                  </button>
                )}
              </p>
            )}
          </div>
        )}

        {tab === 'playlists' && (
          <PlaylistBar
            playlists={playlists}
            active={active}
            setActive={setActive}
            onCreate={(name) => updatePlaylists({ ...playlists, [name]: [] })}
            onDelete={(name) => {
              const { [name]: _, ...rest } = playlists;
              updatePlaylists(rest);
              if (active === name) setActive(null);
            }}
          />
        )}

        {tab === 'search' && searching && <p className="py-8 text-center text-sm text-neutral-500">Searching…</p>}
        {tab === 'search' && searchError && <p className="py-8 text-center text-sm text-red-400">{searchError}</p>}

        {!shown.length && !searching && (
          <p className="py-16 text-center text-sm text-neutral-500">
            {tab === 'search'
              ? query
                ? 'No results.'
                : 'Search the Apple Music catalogue to preview tracks.'
              : tab === 'library'
                ? 'Your library is empty. Add audio files above.'
                : active
                  ? 'This playlist is empty. Add tracks from search or your library.'
                  : 'Create a playlist to get started.'}
          </p>
        )}

        <ul className="divide-y divide-white/5">
          {shown.map((track, i) => (
            <Row
              key={track.id}
              track={track}
              active={queue[qIndex]?.id === track.id}
              playing={playing && queue[qIndex]?.id === track.id}
              onPlay={() => {
                if (queue[qIndex]?.id === track.id) setPlaying(!playing);
                else play(shown, i);
              }}
              playlistNames={Object.keys(playlists)}
              onAdd={(name) => addTo(name, track)}
              onNewPlaylist={() => {
                const name = window.prompt('Playlist name')?.trim();
                if (name) updatePlaylists({ ...playlists, [name]: [track] });
              }}
              onRemove={
                // Bundled tracks ship with the site; removeTrack can't evict one, it would just reappear.
                tab === 'library' && !track.id.startsWith('file:')
                  ? async () => {
                      await removeTrack(track.id);
                      setLibrary(await getLibrary());
                    }
                  : tab === 'playlists' && active
                    ? () =>
                        updatePlaylists({
                          ...playlists,
                          [active]: playlists[active].filter((t) => t.id !== track.id),
                        })
                    : undefined
              }
            />
          ))}
        </ul>
      </main>

      <Player queue={queue} index={qIndex} setIndex={setQIndex} playing={playing} setPlaying={setPlaying} />
    </div>
  );
}

function Row({
  track,
  active,
  playing,
  onPlay,
  playlistNames,
  onAdd,
  onNewPlaylist,
  onRemove,
}: {
  track: Track;
  active: boolean;
  playing: boolean;
  onPlay: () => void;
  playlistNames: string[];
  onAdd: (name: string) => void;
  onNewPlaylist: () => void;
  onRemove?: () => void;
}) {
  return (
    <li className={`group flex items-center gap-3 py-2 pr-1 ${active ? 'text-red-500' : ''}`}>
      <button onClick={onPlay} aria-label={playing ? 'Pause' : 'Play'} className="relative shrink-0">
        {track.artwork ? (
          <img src={track.artwork} alt="" className="h-11 w-11 rounded object-cover" />
        ) : (
          <div className="grid h-11 w-11 place-items-center rounded bg-white/10 text-neutral-400">♪</div>
        )}
        <span className="absolute inset-0 grid place-items-center rounded bg-black/50 text-white opacity-0 transition group-hover:opacity-100">
          {playing ? '❚❚' : '▶'}
        </span>
      </button>

      <button onClick={onPlay} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-medium">{track.title}</div>
        <div className="truncate text-xs text-neutral-400">
          {track.artist}
          {track.album ? ` — ${track.album}` : ''}
        </div>
      </button>

      <span className="hidden text-xs tabular-nums text-neutral-500 sm:block">{fmtTime(track.duration)}</span>

      {isPreview(track) && (
        <span className="hidden rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-neutral-400 md:block">
          preview
        </span>
      )}

      <select
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__new') onNewPlaylist();
          else if (v) onAdd(v);
          e.target.value = '';
        }}
        aria-label="Add to playlist"
        className="w-8 cursor-pointer appearance-none rounded bg-transparent text-center text-neutral-500 hover:text-white focus:outline-none"
      >
        <option value="">＋</option>
        {playlistNames.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value="__new">New playlist…</option>
      </select>

      {track.appleUrl && (
        <a
          href={track.appleUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Apple Music (full track)"
          className="hidden w-8 text-center text-neutral-500 hover:text-red-500 sm:block"
        >
          ↗
        </a>
      )}

      {onRemove && (
        <button onClick={onRemove} title="Remove" className="w-8 text-neutral-600 hover:text-red-500">
          ✕
        </button>
      )}
    </li>
  );
}

function DropZone({ onFiles, importing }: { onFiles: (f: File[]) => void; importing: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      onClick={() => input.current?.click()}
      className={`mb-6 cursor-pointer rounded-xl border-2 border-dashed p-8 text-center text-sm transition ${
        over ? 'border-red-500 bg-red-500/10' : 'border-white/15 text-neutral-500 hover:border-white/30'
      }`}
    >
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus"
        multiple
        hidden
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <input
        ref={folder}
        type="file"
        multiple
        hidden
        // webkitdirectory is missing from React's typings; it picks a folder and recurses
        // into every subfolder, which a plain `multiple` input cannot do.
        {...({ webkitdirectory: '' } as Record<string, string>)}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      {importing ? (
        `Importing ${importing}…`
      ) : (
        <>
          Drop audio files here, or click to choose — stored in your browser.
          <br />
          <button
            onClick={(e) => {
              e.stopPropagation();
              folder.current?.click();
            }}
            className="mt-2 underline underline-offset-4 hover:text-neutral-300"
          >
            or import a whole folder
          </button>
        </>
      )}
    </div>
  );
}

function PlaylistBar({
  playlists,
  active,
  setActive,
  onCreate,
  onDelete,
}: {
  playlists: Playlists;
  active: string | null;
  setActive: (n: string | null) => void;
  onCreate: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const names = Object.keys(playlists);

  return (
    <div className="mb-6 space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (n && !playlists[n]) {
            onCreate(n);
            setActive(n);
          }
          setName('');
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New playlist name"
          className="flex-1 rounded-full bg-white/10 px-4 py-2 text-sm outline-none placeholder:text-neutral-500"
        />
        <button className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black">Create</button>
      </form>

      <div className="flex flex-wrap gap-2">
        {names.map((n) => (
          <span
            key={n}
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ${
              active === n ? 'bg-red-500 text-white' : 'bg-white/10 text-neutral-300'
            }`}
          >
            <button onClick={() => setActive(n)}>
              {n} ({playlists[n].length})
            </button>
            <button onClick={() => onDelete(n)} aria-label={`Delete ${n}`} className="opacity-60 hover:opacity-100">
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
