"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
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
  TbKeyboard,
  TbSearch,
  TbTrash,
  TbUpload,
  TbX,
} from "react-icons/tb";
import Player from "@/components/Player";
import { SHORTCUT_GROUPS } from "@/lib/shortcuts";
import {
  Track,
  Playlists,
  search,
  importFiles,
  isPreview,
  getLibrary,
  removeTrack,
  getPlaylists,
  getRecent,
  getSession,
  pushRecent,
  savePlaylists,
  fmtTime,
  shuffled,
  artistsOf,
} from "@/lib/music";

type Tab = "search" | "library" | "playlists";

const TABS = [
  { id: "search", label: "Search", Icon: TbSearch },
  { id: "library", label: "Library", Icon: TbLibrary },
  { id: "playlists", label: "Playlists", Icon: TbPlaylist },
] as const satisfies readonly {
  id: Tab;
  label: string;
  Icon: typeof TbSearch;
}[];

type SortKey = "artist" | "title" | "album" | "longest" | "shortest";

const SORTS: Record<SortKey, (a: Track, b: Track) => number> = {
  artist: (a, b) =>
    a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
  title: (a, b) => a.title.localeCompare(b.title),
  album: (a, b) =>
    (a.album || "~").localeCompare(b.album || "~") ||
    a.title.localeCompare(b.title),
  longest: (a, b) => (b.duration ?? 0) - (a.duration ?? 0),
  shortest: (a, b) => (a.duration ?? 0) - (b.duration ?? 0),
};

export default function Home() {
  const [tab, setTab] = useState<Tab>("search");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [library, setLibrary] = useState<Track[]>([]);
  const [importing, setImporting] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [artist, setArtist] = useState<string>("");
  const [artistOpen, setArtistOpen] = useState(false);
  const [artistQuery, setArtistQuery] = useState("");
  const artistBox = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("artist");

  const [playlists, setPlaylists] = useState<Playlists>({});
  const [active, setActive] = useState<string | null>(null);

  const [queue, setQueue] = useState<Track[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recent, setRecent] = useState<Track[]>([]);

  const [scrolled, setScrolled] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [dragging, setDragging] = useState(false);
  const searchBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getLibrary().then((lib) => {
      setLibrary(lib);
      setRecent(getRecent());
      // Bring back the last session's queue, paused where it left off.
      const s = getSession();
      if (s) {
        setQueue(s.queue);
        setQIndex(Math.min(s.index, s.queue.length - 1));
      }
    });
    setPlaylists(getPlaylists());
    // Streams, caches and range-serves the bundled songs — see public/sw.js.
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el?.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "");
      if (e.key === "Escape" && typing) return el?.blur();
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") {
        e.preventDefault();
        setShowKeys((v) => !v);
      } else if (e.key === "/") {
        e.preventDefault();
        setTab("search");
        searchBox.current?.focus();
      } else if (e.key === "Escape") {
        setShowKeys(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The scroll edge effect: no separator at rest, a hairline once content slides
  // under the bar (HIG — Layout > Visual hierarchy).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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
          if (e.name !== "AbortError")
            setSearchError("Search failed. Check your connection.");
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
    setRecent(pushRecent(tracks[i]));
  };

  /** Every index move (skip, auto-advance, queue click) lands here, so it can log history. */
  const jumpTo = (i: number) => {
    setQIndex(i);
    if (queue[i]) setRecent(pushRecent(queue[i]));
  };

  /** Insert into the live queue — right after the current track, or at the end. */
  const enqueue = (track: Track, mode: "next" | "end") => {
    if (!queue.length) return play([track], 0);
    const q = [...queue];
    q.splice(mode === "next" ? qIndex + 1 : q.length, 0, track);
    setQueue(q);
  };

  // A folder change can strand an artist selection that folder has no tracks for.
  useEffect(() => setArtist(""), [folder]);

  // Dismiss the artist popup on an outside click or Escape, the way a menu should behave.
  useEffect(() => {
    if (!artistOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!artistBox.current?.contains(e.target as Node)) setArtistOpen(false);
    };
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setArtistOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [artistOpen]);

  const updatePlaylists = (next: Playlists) => {
    setPlaylists(next);
    savePlaylists(next);
  };

  const addTo = (name: string, track: Track) => {
    if (playlists[name]?.some((t) => t.id === track.id)) return;
    updatePlaylists({
      ...playlists,
      [name]: [...(playlists[name] ?? []), track],
    });
  };

  const onFiles = useCallback(async (files: File[]) => {
    const audio = files.filter(
      (f) =>
        f.type.startsWith("audio/") ||
        /\.(mp3|m4a|flac|wav|ogg|opus|aac)$/i.test(f.name),
    );
    if (!audio.length) return;
    setImporting(`0 / ${audio.length}`);
    try {
      await importFiles(audio, (d, t) => setImporting(`${d} / ${t}`));
      setLibrary(await getLibrary());
    } finally {
      setImporting(null);
    }
  }, []);

  // The whole window is the drop target: dragging files in from any tab raises
  // an overlay, and the drop lands in the library. Enter/leave nest through
  // child elements, so a depth counter decides when the drag truly left.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (hasFiles(e) && ++depth === 1) setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (hasFiles(e) && --depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      onFiles(Array.from(e.dataTransfer!.files));
      setTab("library");
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [onFiles]);

  const folders = [
    ...new Set(
      library
        .map((t) => t.folder)
        .filter(Boolean as unknown as (f?: string) => f is string),
    ),
  ].sort();

  const inFolder = library.filter((t) => !folder || t.folder === folder);

  // Every credited person, not every credit string, folded case-insensitively so
  // "LANY" and "Lany" are one artist. The spelling shown is the one used most often.
  const artists = (() => {
    const byKey = new Map<string, Map<string, number>>();
    for (const t of inFolder) {
      for (const name of artistsOf(t.artist)) {
        const variants =
          byKey.get(name.toLowerCase()) ?? new Map<string, number>();
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
          (a, b) =>
            b[1] - a[1] || caps(b[0]) - caps(a[0]) || a[0].localeCompare(b[0]),
        );
        return {
          name: ranked[0][0],
          count: ranked.reduce((n, [, c]) => n + c, 0),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const aq = artistQuery.trim().toLowerCase();
  const artistMatches = aq
    ? artists.filter((a) => a.name.toLowerCase().includes(aq))
    : artists;

  const needle = filter.trim().toLowerCase();
  const artistNeedle = artist.trim().toLowerCase();
  const inLibrary = inFolder
    .filter(
      (t) =>
        !artistNeedle ||
        artistsOf(t.artist).some((a) => a.toLowerCase() === artistNeedle),
    )
    .filter(
      (t) =>
        !needle ||
        `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(needle),
    )
    .sort(SORTS[sort]);

  // Search covers the library too: your own full tracks rank above the
  // catalogue's 30s previews, the way Apple Music folds "Your Library" in.
  const q = query.trim().toLowerCase();
  const libMatches =
    tab === "search" && q
      ? library.filter((t) =>
          `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q),
        )
      : [];

  const shown =
    tab === "search"
      ? [...libMatches, ...results]
      : tab === "library"
        ? inLibrary
        : active
          ? (playlists[active] ?? [])
          : [];

  return (
    <div className="min-h-dvh bg-canvas pb-40 text-label sm:pb-28">
      <header
        className={`glass sticky top-0 z-30 border-b transition-colors ${
          scrolled ? "border-separator" : "border-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <h1 className="flex shrink-0 items-center gap-1.5 text-base font-semibold tracking-tight">
            <Logo className="text-accent" size={20} />
            <span className="hidden sm:inline">Music</span>
          </h1>

          <div className="relative min-w-0 flex-1">
            <TbSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-3"
              size={14}
            />
            <input
              ref={searchBox}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTab("search");
              }}
              placeholder="Songs, artists, albums…"
              className="h-9 w-full rounded-control bg-fill pl-9 pr-9 text-sm outline-none transition placeholder:text-label-3 focus:bg-fill-2"
            />
            {!!query && (
              <ClearButton label="Clear search" onClick={() => setQuery("")} />
            )}
          </div>

          {/* A segmented control on desktop; below sm the tab bar at the foot of the
              screen carries primary navigation instead (HIG — Layout). */}
          <nav className="hidden shrink-0 items-center gap-1 rounded-control bg-fill p-1 sm:flex">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={`rounded-[7px] px-2.5 py-1 text-xs font-medium transition ${
                  tab === id
                    ? "bg-elevated-2 text-label shadow-sm"
                    : "text-label-2 hover:text-label"
                }`}
              >
                {label}
                {id === "library" && library.length
                  ? ` (${library.length})`
                  : ""}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {/* The big dropzone is the empty library's call to action. Once songs
            exist it folds into a toolbar button, and dropping files anywhere
            on the page imports them (see the dragging overlay). */}
        {tab === "library" && !library.length && (
          <DropZone onFiles={onFiles} importing={importing} />
        )}

        {tab === "library" && !!recent.length && (
          <section className="mb-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-label-3">
              Recently played
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {recent.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => play(recent, i)}
                  title={`${t.title} — ${t.artist}`}
                  className="w-24 shrink-0 text-left transition hover:opacity-80"
                >
                  {t.artwork ? (
                    <img
                      src={t.artwork}
                      alt=""
                      loading="lazy"
                      className="h-24 w-24 rounded-[10px] object-cover shadow-sm shadow-black/40"
                    />
                  ) : (
                    <div className="grid h-24 w-24 place-items-center rounded-[10px] bg-fill text-label-3">
                      <TbMusic size={24} />
                    </div>
                  )}
                  <div className="mt-1.5 truncate text-xs font-medium">
                    {t.title}
                  </div>
                  <div className="truncate text-[11px] text-label-2">
                    {t.artist}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {tab === "library" && !!library.length && (
          <div className="mb-4 space-y-3">
            {folders.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {[null, ...folders].map((f) => (
                  <button
                    key={f ?? "__all"}
                    onClick={() => setFolder(f)}
                    className={`h-7 rounded-full px-3 text-xs font-medium transition ${
                      folder === f
                        ? "bg-label text-canvas"
                        : "bg-fill text-label-2 hover:bg-fill-2 hover:text-label"
                    }`}
                  >
                    {f ?? "All"} (
                    {f
                      ? library.filter((t) => t.folder === f).length
                      : library.length}
                    )
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:min-w-40 sm:flex-1">
                <TbSearch
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-3"
                  size={14}
                />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter title, artist, album…"
                  aria-label="Filter library"
                  className="h-9 w-full rounded-control bg-fill pl-9 pr-9 text-xs outline-none transition placeholder:text-label-3 focus:bg-fill-2"
                />
                {!!filter && (
                  <ClearButton
                    label="Clear filter"
                    onClick={() => setFilter("")}
                  />
                )}
              </div>

              {/* Hand-rolled rather than a <select> or <datalist>: 95 artists render as an
                  unbounded native list with no way to cap its height or search it. */}
              <div ref={artistBox} className="relative w-full sm:w-auto">
                <button
                  onClick={() => setArtistOpen(!artistOpen)}
                  title={artist || "Filter by artist"}
                  aria-expanded={artistOpen}
                  aria-haspopup="listbox"
                  className={`flex h-9 w-full items-center justify-between gap-2 rounded-control px-3 text-xs transition sm:w-44 ${
                    artist
                      ? "bg-label font-medium text-canvas"
                      : "bg-fill text-label-2 hover:bg-fill-2 hover:text-label"
                  }`}
                >
                  <span className="truncate">
                    {artist || `All artists (${artists.length})`}
                  </span>
                  <TbChevronDown
                    className={`shrink-0 opacity-60 transition ${artistOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {artistOpen && (
                  <div className="glass-thick absolute left-0 z-40 mt-1.5 w-full overflow-hidden rounded-card border border-separator shadow-2xl shadow-black/60 sm:w-64">
                    <div className="relative border-b border-separator">
                      <TbSearch
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-label-3"
                        size={14}
                      />
                      <input
                        autoFocus
                        value={artistQuery}
                        onChange={(e) => setArtistQuery(e.target.value)}
                        placeholder="Search artists…"
                        aria-label="Search artists"
                        className="h-10 w-full bg-transparent pl-9 pr-3 text-xs outline-none placeholder:text-label-3"
                      />
                    </div>
                    <ul
                      role="listbox"
                      className="max-h-[50vh] overflow-y-auto overscroll-contain py-1 sm:max-h-72"
                    >
                      <li>
                        <button
                          onClick={() => {
                            setArtist("");
                            setArtistOpen(false);
                            setArtistQuery("");
                          }}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-1.5 text-left text-xs transition hover:bg-fill ${
                            artist ? "text-label-2" : "font-semibold text-label"
                          }`}
                        >
                          All artists
                          <span className="text-[11px] tabular-nums text-label-3">
                            {artists.length}
                          </span>
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
                              setArtistQuery("");
                            }}
                            className={`flex w-full items-center justify-between gap-3 px-4 py-1.5 text-left text-xs transition hover:bg-fill ${
                              a.name === artist
                                ? "font-semibold text-label"
                                : "text-label-2"
                            }`}
                          >
                            <span className="truncate">{a.name}</span>
                            <span className="shrink-0 text-[11px] tabular-nums text-label-3">
                              {a.count}
                            </span>
                          </button>
                        </li>
                      ))}
                      {!artistMatches.length && (
                        <li className="px-4 py-4 text-center text-xs text-label-2">
                          No artist matches.
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort by"
                className="h-9 rounded-control bg-fill px-2.5 text-xs text-label-2 outline-none transition hover:bg-fill-2"
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
                title="Play these in order"
                className="flex h-9 items-center gap-1.5 rounded-control bg-accent px-4 text-xs font-semibold text-white transition hover:brightness-110 active:scale-[0.97] disabled:opacity-40"
              >
                <TbPlayerPlayFilled size={12} />
                Play
              </button>
              <button
                onClick={() => inLibrary.length && play(shuffled(inLibrary), 0)}
                disabled={!inLibrary.length}
                title="Play these in a random order"
                className="flex h-9 items-center gap-1.5 rounded-control bg-fill px-4 text-xs font-medium text-label transition hover:bg-fill-2 active:scale-[0.97] disabled:opacity-40"
              >
                <TbArrowsShuffle size={13} />
                Shuffle
              </button>
              <ImportButtons onFiles={onFiles} importing={importing} />
            </div>

            {(!!needle || !!artist) && (
              <p className="text-[11px] text-label-2">
                {inLibrary.length} of {library.length} tracks
                {artist && ` · ${artist}`}
                {(needle || artist) && (
                  <button
                    onClick={() => {
                      setFilter("");
                      setArtist("");
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

        {tab === "playlists" && (
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

        {tab === "search" &&
          searching &&
          (shown.length ? (
            <p className="py-8 text-center text-sm text-label-2">Searching…</p>
          ) : (
            <SkeletonRows />
          ))}
        {tab === "search" && searchError && (
          <p className="py-8 text-center text-sm text-accent">{searchError}</p>
        )}

        {!shown.length && !searching && (
          <div className="flex flex-col items-center gap-2.5 py-16 text-center">
            <TbMusic className="text-label-3" size={32} />
            <p className="max-w-xs text-sm text-label-2">
              {tab === "search"
                ? query
                  ? "No results."
                  : "Search the Apple Music catalogue to preview tracks."
                : tab === "library"
                  ? library.length
                    ? "No tracks match those filters."
                    : "Your library is empty. Add audio files above."
                  : active
                    ? "This playlist is empty. Add tracks from search or your library."
                    : "Create a playlist to get started."}
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
              onQueue={(mode) => enqueue(track, mode)}
              onNewPlaylist={() => {
                const name = window.prompt("Playlist name")?.trim();
                if (name) updatePlaylists({ ...playlists, [name]: [track] });
              }}
              onRemove={
                // Bundled tracks ship with the site; removeTrack can't evict one, it would just reappear.
                tab === "library" && !track.id.startsWith("file:")
                  ? async () => {
                      await removeTrack(track.id);
                      setLibrary(await getLibrary());
                    }
                  : tab === "playlists" && active
                    ? () =>
                        updatePlaylists({
                          ...playlists,
                          [active]: playlists[active].filter(
                            (t) => t.id !== track.id,
                          ),
                        })
                    : undefined
              }
            />
          ))}
        </ul>
      </main>

      <button
        onClick={() => setShowKeys(true)}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        className="fixed bottom-36 right-4 z-30 hidden h-9 w-9 place-items-center rounded-full bg-fill text-label-2 backdrop-blur transition hover:bg-fill-2 hover:text-label sm:bottom-24 sm:grid"
      >
        <TbKeyboard size={17} />
      </button>

      {showKeys && <ShortcutSheet onClose={() => setShowKeys(false)} />}

      {/* pointer-events-none: the drop itself must fall through to the window. */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-sheet border-2 border-dashed border-accent px-12 py-10 text-center">
            <TbUpload className="text-accent" size={36} />
            <p className="text-sm font-medium">
              Drop audio files to add them to your library
            </p>
          </div>
        </div>
      )}

      <Player
        queue={queue}
        index={qIndex}
        setIndex={jumpTo}
        playing={playing}
        setPlaying={setPlaying}
      />

      {/* Primary navigation lives at the foot of the screen on a phone, where a thumb
          reaches it, and the mini player stacks directly above it (HIG — Layout). */}
      <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-separator sm:hidden">
        <div className="flex">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`flex h-14 flex-1 flex-col items-center justify-center gap-1 transition ${
                tab === id ? "text-accent" : "text-label-2"
              }`}
            >
              <Icon size={19} />
              <span className="text-xxs font-medium tracking-tight">
                {label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-thick max-h-[85vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-sheet border border-separator px-5 pb-5 shadow-2xl shadow-black/60"
      >
        {/* Sticky so the close button survives a scroll on a short screen. */}
        <div className="glass-thick sticky top-0 -mx-5 flex items-center justify-between px-5 py-3.5">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="grid h-7 w-7 place-items-center rounded-full text-label-2 transition hover:bg-fill hover:text-label"
          >
            <TbX size={15} />
          </button>
        </div>

        {/* Two columns of tight groups rather than one long striped list: the
            heading carries the grouping, so the rows need no banding and no
            padding of their own.

            A real grid rather than CSS columns, because :last-child in a column
            box still means last in the DOM — only Sound would drop its margin,
            and View would keep a trailing gap that tips the columns out of
            balance again. Split explicitly, each column is its own element and
            last:mb-0 means what it says. */}
        <div className="mt-4 grid gap-8 sm:grid-cols-2 sm:gap-x-7 sm:gap-y-0">
          {[SHORTCUT_GROUPS.slice(0, 2), SHORTCUT_GROUPS.slice(2)].map(
            (column, i) => (
              <div key={i}>
                {column.map(({ title, items }) => (
                  <section key={title} className="mb-8 last:mb-0">
                    <h3 className="mb-1 border-b border-separator pb-1 text-xxs font-semibold uppercase tracking-widest text-label-3">
                      {title}
                    </h3>
                    <dl>
                      {items.map(({ keys, label }) => (
                        <div
                          key={label}
                          className="flex items-baseline gap-2 py-[3px] text-xs"
                        >
                          <dt className="shrink-0 text-label-2 text-xxs">
                            {label}
                          </dt>
                          {/* A dotted leader ties the label to its keys without a row
                        background doing the work. */}
                          <span
                            aria-hidden
                            className="min-w-3 flex-1 translate-y-[-3px] border-b border-dotted border-separator"
                          />
                          <dd className="flex shrink-0 items-center gap-1">
                            {keys.map((k) =>
                              k === "\u2013" ? (
                                <span key={k} className="text-label-3">
                                  &ndash;
                                </span>
                              ) : (
                                <kbd
                                  key={k}
                                  className="min-w-5 rounded-[5px] bg-fill-2 px-1.5 py-px text-center font-sans text-xxs leading-4 text-label"
                                >
                                  {k}
                                </kbd>
                              ),
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/** What a result row will look like, while the search is still out. */
function SkeletonRows() {
  return (
    <ul aria-hidden className="animate-pulse">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-1 py-2">
          <div className="h-11 w-11 shrink-0 rounded-[7px] bg-fill" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-fill" />
            <div className="h-2.5 w-1/2 rounded bg-fill opacity-70" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The trailing clear affordance a search field grows once it has a value. */
function ClearButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-fill-2 text-label-2 transition hover:text-label"
    >
      <TbX size={11} />
    </button>
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
  onQueue,
  onRemove,
}: {
  track: Track;
  active: boolean;
  playing: boolean;
  onPlay: () => void;
  playlistNames: string[];
  onAdd: (name: string) => void;
  onNewPlaylist: () => void;
  onQueue: (mode: "next" | "end") => void;
  onRemove?: () => void;
}) {
  return (
    <li className="group relative flex items-center gap-3 rounded-control px-1 py-1 transition hover:bg-fill">
      {/* The separator is inset past the artwork, the way a system list draws it. */}
      <span className="pointer-events-none absolute bottom-0 left-16 right-2 h-px bg-separator group-last:hidden" />

      <button
        onClick={onPlay}
        aria-label={playing ? "Pause" : "Play"}
        className="relative shrink-0"
      >
        {track.artwork ? (
          <img
            src={track.artwork}
            alt=""
            loading="lazy"
            className="h-11 w-11 rounded-[7px] object-cover shadow-sm shadow-black/40"
          />
        ) : (
          <div className="grid h-11 w-11 place-items-center rounded-[7px] bg-fill text-label-3">
            <TbMusic size={18} />
          </div>
        )}
        <span
          className={`absolute inset-0 grid place-items-center rounded-[7px] bg-black/55 text-white transition ${
            active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {playing ? (
            <TbPlayerPauseFilled size={15} />
          ) : (
            <TbPlayerPlayFilled size={15} />
          )}
        </span>
      </button>

      <button
        onClick={onPlay}
        title={`${track.title} — ${track.artist}`}
        className="min-w-0 flex-1 py-1 text-left space-y-0.5"
      >
        <div
          className={`truncate text-sm ${active ? "font-semibold text-accent" : "font-medium text-label"}`}
        >
          {track.title}
        </div>
        <div className="truncate text-[11px] text-label-2">
          {track.artist}
          {track.album ? ` — ${track.album}` : ""}
        </div>
      </button>

      <span className="hidden text-xs tabular-nums text-label-3 sm:block">
        {fmtTime(track.duration)}
      </span>

      {isPreview(track) && (
        <span className="hidden rounded-full bg-fill px-2 py-0.5 text-xxs font-medium text-label-2 md:block">
          Preview
        </span>
      )}

      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-label-3 transition hover:bg-fill-2 hover:text-label">
        <TbPlus size={16} />
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__next") onQueue("next");
            else if (v === "__end") onQueue("end");
            else if (v === "__new") onNewPlaylist();
            else if (v) onAdd(v);
            e.target.value = "";
          }}
          aria-label="Add to queue or playlist"
          title="Add to queue or playlist"
          className="absolute inset-0 appearance-none rounded bg-transparent text-transparent opacity-0"
        >
          <option value="">Add to…</option>
          <optgroup label="Queue">
            <option value="__next">Play next</option>
            <option value="__end">Add to queue</option>
          </optgroup>
          <optgroup label="Playlists">
            {playlistNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="__new">New playlist…</option>
          </optgroup>
        </select>
      </span>

      {track.appleUrl && (
        <a
          href={track.appleUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Apple Music (full track)"
          className="hidden h-9 w-9 shrink-0 place-items-center rounded-full text-label-3 transition hover:bg-fill-2 hover:text-accent sm:grid"
        >
          <TbExternalLink size={15} />
        </a>
      )}

      {onRemove && (
        <button
          onClick={onRemove}
          title="Remove"
          aria-label="Remove"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-label-3 transition hover:bg-fill-2 hover:text-accent"
        >
          <TbX size={15} />
        </button>
      )}
    </li>
  );
}

/** Import compacted into the toolbar — the dropzone card only greets an empty library. */
function ImportButtons({
  onFiles,
  importing,
}: {
  onFiles: (f: File[]) => void;
  importing: string | null;
}) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={files}
        type="file"
        accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus"
        multiple
        hidden
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={folder}
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <button
        onClick={() => files.current?.click()}
        disabled={!!importing}
        title="Import audio files — or drop them anywhere on the page"
        className="flex h-9 items-center gap-1.5 rounded-control bg-fill px-4 text-xs font-medium text-label transition hover:bg-fill-2 active:scale-[0.97] disabled:opacity-60"
      >
        <TbUpload size={13} />
        {importing ? `Importing ${importing}…` : "Import"}
      </button>
      <button
        onClick={() => folder.current?.click()}
        disabled={!!importing}
        aria-label="Import a whole folder"
        title="Import a whole folder"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-fill text-label-2 transition hover:bg-fill-2 hover:text-label active:scale-[0.97] disabled:opacity-60"
      >
        <TbFolderPlus size={15} />
      </button>
    </>
  );
}

function DropZone({
  onFiles,
  importing,
}: {
  onFiles: (f: File[]) => void;
  importing: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  return (
    <div
      // Dropping is handled window-wide by the page's dragging overlay; this
      // card is the empty library's click-to-choose affordance.
      onClick={() => input.current?.click()}
      className="mb-5 cursor-pointer rounded-card border border-dashed border-separator p-6 text-center text-xs text-label-2 transition hover:border-label-3 hover:bg-fill"
    >
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus"
        multiple
        hidden
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={folder}
        type="file"
        multiple
        hidden
        // webkitdirectory is missing from React's typings; it picks a folder and recurses
        // into every subfolder, which a plain `multiple` input cannot do.
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {importing ? (
        `Importing ${importing}…`
      ) : (
        <>
          <TbUpload className="mx-auto mb-2 text-label-3" size={22} />
          Drop audio files here, or click to choose — stored in your browser.
          <br />
          <button
            onClick={(e) => {
              e.stopPropagation();
              folder.current?.click();
            }}
            className="mt-2 inline-flex items-center gap-1.5 font-medium text-accent underline-offset-4 hover:underline"
          >
            <TbFolderPlus size={14} />
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
  const [name, setName] = useState("");
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
          setName("");
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New playlist name"
          className="h-9 min-w-0 flex-1 rounded-control bg-fill px-3 text-sm outline-none transition placeholder:text-label-3 focus:bg-fill-2"
        />
        <button className="flex h-9 shrink-0 items-center gap-1.5 rounded-control bg-accent px-4 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.97]">
          <TbPlus size={15} />
          Create
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {names.map((n) => (
          <span
            key={n}
            className={`flex h-8 items-center gap-1 rounded-full pl-3 pr-1 text-xs font-medium transition ${
              active === n
                ? "bg-accent text-white"
                : "bg-fill text-label-2 hover:bg-fill-2 hover:text-label"
            }`}
          >
            <button onClick={() => setActive(n)} className="py-2">
              {n} ({playlists[n].length})
            </button>
            <button
              onClick={() => onDelete(n)}
              aria-label={`Delete ${n}`}
              className="grid h-6 w-6 place-items-center rounded-full opacity-60 transition hover:bg-black/20 hover:opacity-100"
            >
              <TbTrash size={13} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
