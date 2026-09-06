'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TbArrowsShuffle,
  TbChevronDown,
  TbExternalLink,
  TbFolderPlus,
  TbLibrary,
  TbMusic,
  TbPlayerPauseFilled,
  TbPlayerPlayFilled,
  TbPlaylist,
  TbPlus,
  TbSearch,
  TbTrash,
  TbUpload,
  TbX,
} from 'react-icons/tb';
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

const TABS = [
  { id: 'search', label: 'Search', Icon: TbSearch },
  { id: 'library', label: 'Library', Icon: TbLibrary },
  { id: 'playlists', label: 'Playlists', Icon: TbPlaylist },
] as const satisfies readonly { id: Tab; label: string; Icon: typeof TbSearch }[];

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
  const [artistOpen, setArtistOpen] = useState(false);
  const [artistQuery, setArtistQuery] = useState('');
  const artistBox = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('artist');

  const [playlists, setPlaylists] = useState<Playlists>({});
  const [active, setActive] = useState<string | null>(null);

  const [queue, setQueue] = useState<Track[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    getLibrary().then(setLibrary);
    setPlaylists(getPlaylists());
  }, []);

  // The scroll edge effect: no separator at rest, a hairline once content slides
  // under the bar (HIG — Layout > Visual hierarchy).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
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

  // Dismiss the artist popup on an outside click or Escape, the way a menu should behave.
  useEffect(() => {
    if (!artistOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!artistBox.current?.contains(e.target as Node)) setArtistOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setArtistOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [artistOpen]);

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

  const aq = artistQuery.trim().toLowerCase();
  const artistMatches = aq ? artists.filter((a) => a.name.toLowerCase().includes(aq)) : artists;

  const needle = filter.trim().toLowerCase();
  const artistNeedle = artist.trim().toLowerCase();
  const inLibrary = inFolder
    .filter((t) => !artistNeedle || artistsOf(t.artist).some((a) => a.toLowerCase() === artistNeedle))
    .filter((t) => !needle || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(needle))
    .sort(SORTS[sort]);

  const shown = tab === 'search' ? results : tab === 'library' ? inLibrary : active ? playlists[active] ?? [] : [];

  return (
    <div className="min-h-dvh bg-base pb-44 text-label sm:pb-28">
      <header
        className={`glass sticky top-0 z-30 border-b transition-colors ${
          scrolled ? 'border-separator' : 'border-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <h1 className="flex shrink-0 items-center gap-2 text-[17px] font-semibold tracking-tight">
            <TbMusic className="text-accent" size={22} />
            <span className="hidden sm:inline">Music</span>
          </h1>

          <div className="relative min-w-0 flex-1">
            <TbSearch
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-label-3"
              size={16}
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTab('search');
              }}
              placeholder="Songs, artists, albums…"
              className="h-11 w-full rounded-control bg-fill pl-10 pr-4 text-[15px] outline-none transition placeholder:text-label-3 focus:bg-fill-2"
            />
          </div>

          {/* A segmented control on desktop; below sm the tab bar at the foot of the
              screen carries primary navigation instead (HIG — Layout). */}
          <nav className="hidden shrink-0 items-center gap-1 rounded-control bg-fill p-1 sm:flex">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition ${
                  tab === id ? 'bg-elevated-2 text-label shadow-sm' : 'text-label-2 hover:text-label'
                }`}
              >
                {label}
                {id === 'library' && library.length ? ` (${library.length})` : ''}
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
                    className={`h-9 rounded-full px-4 text-[13px] font-medium transition ${
                      folder === f ? 'bg-label text-base' : 'bg-fill text-label-2 hover:bg-fill-2 hover:text-label'
                    }`}
                  >
                    {f ?? 'All'} ({f ? library.filter((t) => t.folder === f).length : library.length})
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:min-w-40 sm:flex-1">
                <TbSearch
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-label-3"
                  size={16}
                />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter title, artist, album…"
                  aria-label="Filter library"
                  className="h-11 w-full rounded-control bg-fill pl-10 pr-4 text-[15px] outline-none transition placeholder:text-label-3 focus:bg-fill-2"
                />
              </div>

              {/* Hand-rolled rather than a <select> or <datalist>: 95 artists render as an
                  unbounded native list with no way to cap its height or search it. */}
              <div ref={artistBox} className="relative w-full sm:w-auto">
                <button
                  onClick={() => setArtistOpen(!artistOpen)}
                  aria-expanded={artistOpen}
                  aria-haspopup="listbox"
                  className={`flex h-11 w-full items-center justify-between gap-2 rounded-control px-4 text-[15px] transition sm:w-48 sm:text-[13px] ${
                    artist ? 'bg-label font-medium text-base' : 'bg-fill text-label-2 hover:bg-fill-2 hover:text-label'
                  }`}
                >
                  <span className="truncate">{artist || `All artists (${artists.length})`}</span>
                  <TbChevronDown className={`shrink-0 opacity-60 transition ${artistOpen ? 'rotate-180' : ''}`} />
                </button>

                {artistOpen && (
                  <div className="glass-thick absolute left-0 z-40 mt-2 w-full overflow-hidden rounded-card border border-separator shadow-2xl shadow-black/60 sm:w-72">
                    <div className="relative border-b border-separator">
                      <TbSearch
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-label-3"
                        size={16}
                      />
                      <input
                        autoFocus
                        value={artistQuery}
                        onChange={(e) => setArtistQuery(e.target.value)}
                        placeholder="Search artists…"
                        aria-label="Search artists"
                        className="h-12 w-full bg-transparent pl-10 pr-4 text-[15px] outline-none placeholder:text-label-3"
                      />
                    </div>
                    <ul role="listbox" className="max-h-[50vh] overflow-y-auto py-1 sm:max-h-72">
                      <li>
                        <button
                          onClick={() => {
                            setArtist('');
                            setArtistOpen(false);
                            setArtistQuery('');
                          }}
                          className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left text-[15px] transition hover:bg-fill ${
                            artist ? 'text-label-2' : 'font-semibold text-label'
                          }`}
                        >
                          All artists
                          <span className="text-[13px] tabular-nums text-label-3">{artists.length}</span>
                        </button>
                      </li>
                      {artistMatches.map((a) => (
                        <li key={a.name}>
                          <button
                            role="option"
                            aria-selected={a.name === artist}
                            onClick={() => {
                              setArtist(a.name);
                              setArtistOpen(false);
                              setArtistQuery('');
                            }}
                            className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left text-[15px] transition hover:bg-fill ${
                              a.name === artist ? 'font-semibold text-label' : 'text-label-2'
                            }`}
                          >
                            <span className="truncate">{a.name}</span>
                            <span className="shrink-0 text-[13px] tabular-nums text-label-3">{a.count}</span>
                          </button>
                        </li>
                      ))}
                      {!artistMatches.length && (
                        <li className="px-4 py-6 text-center text-[13px] text-label-2">No artist matches.</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort by"
                className="h-11 rounded-control bg-fill px-3 text-[15px] text-label-2 outline-none transition hover:bg-fill-2 sm:text-[13px]"
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
                className="flex h-11 items-center gap-2 rounded-control bg-accent px-5 text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.97] disabled:opacity-40 sm:text-[13px]"
              >
                <TbPlayerPlayFilled size={13} />
                Play
              </button>
              <button
                onClick={() => inLibrary.length && play(shuffled(inLibrary), 0)}
                disabled={!inLibrary.length}
                title="Play these in a random order"
                className="flex h-11 items-center gap-2 rounded-control bg-fill px-5 text-[15px] font-medium text-label transition hover:bg-fill-2 active:scale-[0.97] disabled:opacity-40 sm:text-[13px]"
              >
                <TbArrowsShuffle size={15} />
                Shuffle
              </button>
            </div>

            {(!!needle || !!artist) && (
              <p className="text-[13px] text-label-2">
                {inLibrary.length} of {library.length} tracks
                {artist && ` · ${artist}`}
                {(needle || artist) && (
                  <button
                    onClick={() => {
                      setFilter('');
                      setArtist('');
                    }}
                    className="ml-2 font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Clear
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

        {tab === 'search' && searching && (
          <p className="py-10 text-center text-[15px] text-label-2">Searching…</p>
        )}
        {tab === 'search' && searchError && (
          <p className="py-10 text-center text-[15px] text-accent">{searchError}</p>
        )}

        {!shown.length && !searching && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <TbMusic className="text-label-3" size={40} />
            <p className="max-w-xs text-[15px] text-label-2">
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
          </div>
        )}

        <ul>
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

      {/* Primary navigation lives at the foot of the screen on a phone, where a thumb
          reaches it, and the mini player stacks directly above it (HIG — Layout). */}
      <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-separator sm:hidden">
        <div className="flex">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2 transition ${
                tab === id ? 'text-accent' : 'text-label-2'
              }`}
            >
              <Icon size={22} />
              <span className="text-[11px] font-medium tracking-tight">{label}</span>
            </button>
          ))}
        </div>
      </nav>
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
    <li className="group relative flex items-center gap-3 rounded-control px-2 py-1.5 transition hover:bg-fill">
      {/* The separator is inset past the artwork, the way a system list draws it. */}
      <span className="pointer-events-none absolute bottom-0 left-[68px] right-2 h-px bg-separator group-last:hidden" />

      <button onClick={onPlay} aria-label={playing ? 'Pause' : 'Play'} className="relative shrink-0">
        {track.artwork ? (
          <img
            src={track.artwork}
            alt=""
            className="h-12 w-12 rounded-[8px] object-cover shadow-sm shadow-black/40"
          />
        ) : (
          <div className="grid h-12 w-12 place-items-center rounded-[8px] bg-fill text-label-3">
            <TbMusic size={20} />
          </div>
        )}
        <span className="absolute inset-0 grid place-items-center rounded-[8px] bg-black/55 text-white opacity-0 transition group-hover:opacity-100">
          {playing ? <TbPlayerPauseFilled size={16} /> : <TbPlayerPlayFilled size={16} />}
        </span>
      </button>

      <button onClick={onPlay} className="min-w-0 flex-1 py-1 text-left">
        <div className={`truncate text-[15px] ${active ? 'font-semibold text-accent' : 'text-label'}`}>
          {track.title}
        </div>
        <div className="truncate text-[13px] text-label-2">
          {track.artist}
          {track.album ? ` — ${track.album}` : ''}
        </div>
      </button>

      <span className="hidden text-[13px] tabular-nums text-label-3 sm:block">{fmtTime(track.duration)}</span>

      {isPreview(track) && (
        <span className="hidden rounded-full bg-fill px-2 py-0.5 text-[11px] font-medium text-label-2 md:block">
          Preview
        </span>
      )}

      <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-label-3 transition hover:bg-fill-2 hover:text-label">
        <TbPlus size={18} />
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__new') onNewPlaylist();
            else if (v) onAdd(v);
            e.target.value = '';
          }}
          aria-label="Add to playlist"
          className="absolute inset-0 cursor-pointer appearance-none rounded bg-transparent text-transparent opacity-0"
        >
          <option value="">Add to playlist…</option>
          {playlistNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value="__new">New playlist…</option>
        </select>
      </span>

      {track.appleUrl && (
        <a
          href={track.appleUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Apple Music (full track)"
          className="hidden h-11 w-11 shrink-0 place-items-center rounded-full text-label-3 transition hover:bg-fill-2 hover:text-accent sm:grid"
        >
          <TbExternalLink size={16} />
        </a>
      )}

      {onRemove && (
        <button
          onClick={onRemove}
          title="Remove"
          aria-label="Remove"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-label-3 transition hover:bg-fill-2 hover:text-accent"
        >
          <TbX size={16} />
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
      className={`mb-6 cursor-pointer rounded-card border border-dashed p-8 text-center text-[15px] transition ${
        over ? 'border-accent bg-accent/10 text-label' : 'border-separator text-label-2 hover:border-label-3 hover:bg-fill'
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
          <TbUpload className="mx-auto mb-3 text-label-3" size={26} />
          Drop audio files here, or click to choose — stored in your browser.
          <br />
          <button
            onClick={(e) => {
              e.stopPropagation();
              folder.current?.click();
            }}
            className="mt-3 inline-flex items-center gap-1.5 font-medium text-accent underline-offset-4 hover:underline"
          >
            <TbFolderPlus size={16} />
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
          className="h-11 min-w-0 flex-1 rounded-control bg-fill px-4 text-[15px] outline-none transition placeholder:text-label-3 focus:bg-fill-2"
        />
        <button className="flex h-11 shrink-0 items-center gap-1.5 rounded-control bg-accent px-5 text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.97]">
          <TbPlus size={16} />
          Create
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {names.map((n) => (
          <span
            key={n}
            className={`flex h-10 items-center gap-1 rounded-full pl-4 pr-1 text-[14px] font-medium transition ${
              active === n ? 'bg-accent text-white' : 'bg-fill text-label-2 hover:bg-fill-2 hover:text-label'
            }`}
          >
            <button onClick={() => setActive(n)} className="py-2">
              {n} ({playlists[n].length})
            </button>
            <button
              onClick={() => onDelete(n)}
              aria-label={`Delete ${n}`}
              className="grid h-8 w-8 place-items-center rounded-full opacity-60 transition hover:bg-black/20 hover:opacity-100"
            >
              <TbTrash size={15} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
