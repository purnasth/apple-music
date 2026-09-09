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
  TbShare3,
  TbUpload,
  TbX,
} from "react-icons/tb";
import { toast } from "@/lib/toast";
import Player from "@/components/Player";
import {
  AddToSheet,
  PlaylistsView,
  type Detail,
} from "@/components/Playlists";
import { SHORTCUT_GROUPS } from "@/lib/shortcuts";
import {
  Track,
  Playlists,
  search,
  importFiles,
  isPreview,
  decodePlaylist,
  encodeBackup,
  decodeBackup,
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

/**
 * Importing writes into *this browser's* IndexedDB, which is a thing worth
 * doing on the machine that owns the music files and nothing but a confusing
 * offer on the deployed site. `next dev` sets development; `next build` — and
 * so every deploy — sets production, so there is no config to keep in sync.
 */
const DEV = process.env.NODE_ENV === "development";

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
  const [tab, setTab] = useState<Tab>("library");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [library, setLibrary] = useState<Track[]>([]);
  // The library tab is the landing tab now, and songs.json takes a moment —
  // without this the empty-library dropzone flashes on every load.
  const [loaded, setLoaded] = useState(false);
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
  // A playlist that arrived in a link — held aside until it is explicitly saved.
  const [shared, setShared] = useState<Detail | null>(null);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [addTo, setAddTo] = useState<Track | null>(null);

  const [queue, setQueue] = useState<Track[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recent, setRecent] = useState<Track[]>([]);

  const [scrolled, setScrolled] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [dragging, setDragging] = useState(false);
  const searchBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getLibrary().then(async (lib) => {
      setLibrary(lib);
      setLoaded(true);
      setRecent(getRecent());
      // Bring back the last session's queue, paused where it left off.
      const s = getSession();
      if (s) {
        setQueue(s.queue);
        setQIndex(Math.min(s.index, s.queue.length - 1));
      }
      // A shared link: #p=<gzipped playlist>. The library has to be in hand
      // first, since bundled tracks travel as bare ids.
      const code = location.hash.startsWith("#p=") ? location.hash.slice(3) : "";
      if (!code) return;
      const p = await decodePlaylist(code, lib);
      if (p && p.tracks.length) {
        setShared({ ...p, shared: true });
        setSharedOpen(true);
        setTab("playlists");
        toast.info(`“${p.name}” was shared with you`, {
          // A stable id: StrictMode runs this effect twice in dev, and one
          // greeting is the right number of greetings either way.
          id: "shared-link",
          description: `${p.tracks.length} songs. Play it now, or save it to keep it.`,
        });
      } else {
        // A link truncated by a chat app used to land on an ordinary empty tab.
        toast.error("That shared link could not be read", {
          id: "shared-link",
          description: "It may have been cut short on its way here.",
        });
      }
    });
    setPlaylists(getPlaylists());
    // Playlists and imported audio are only as durable as the browser's storage
    // bucket, which Chrome may evict under disk pressure. This asks for the
    // persistent bucket, which is exempt — granted silently on a site the user
    // actually uses, so there is nothing to handle if it is refused.
    navigator.storage
      ?.persisted?.()
      .then((ok) => ok || navigator.storage.persist())
      .catch(() => {});
    // Streams, caches and range-serves the bundled songs — see public/sw.js.
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    // sw.js claims its clients on activate, so this fires exactly once: on the
    // visit that installs it. Later visits arrive already controlled and stay quiet.
    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      () =>
        toast.success("Ready to play offline", {
          description: "Songs you play are kept on this device.",
        }),
      { once: true },
    );
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  // Half this app works without a connection and half does not, which is worth
  // saying before a search comes back empty and looks broken. One id, so a flaky
  // connection replaces the message rather than stacking it.
  useEffect(() => {
    const offline = () =>
      toast.warning("You are offline", {
        id: "connection",
        description: "Your library still plays. Search needs a connection.",
      });
    const online = () =>
      toast.success("Back online", { id: "connection" });
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

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

  /**
   * The bulk Play and Shuffle buttons, which replace the whole queue. A single
   * row click does not come through here — starting one song is self-evident,
   * and it happens far too often to narrate.
   */
  const playAll = (tracks: Track[], shuffle: boolean, what: string) => {
    if (!tracks.length) return;
    play(shuffle ? shuffled(tracks) : tracks, 0);
    toast.success(shuffle ? `Shuffling ${what}` : `Playing ${what}`, {
      id: "queue",
      description: `${tracks.length} song${tracks.length === 1 ? "" : "s"} queued.`,
    });
  };

  /** Every index move (skip, auto-advance, queue click) lands here, so it can log history. */
  const jumpTo = (i: number) => {
    setQIndex(i);
    if (queue[i]) setRecent(pushRecent(queue[i]));
  };

  /** Insert into the live queue — right after the current track, or at the end. */
  const enqueue = (track: Track, mode: "next" | "end") => {
    // An empty queue just starts playing, which is its own feedback.
    if (!queue.length) return play([track], 0);
    const q = [...queue];
    q.splice(mode === "next" ? qIndex + 1 : q.length, 0, track);
    setQueue(q);
    // The sheet closes on these, so without this the queue changed invisibly.
    toast.success(
      mode === "next" ? "Playing next" : "Added to the queue",
      { description: `${track.title} — ${track.artist}` },
    );
  };

  /* ---------- The library view lives in the URL ----------
     Filters are a selection, and a selection you cannot link to is a selection
     you cannot show anyone. Query string rather than the fragment, which the
     shared-playlist links already own. */

  // Read once, before anything can write. Prerendered HTML has no params in it,
  // so this has to be an effect rather than a useState initialiser — reading
  // location during the first render would not match what the server built.
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const cap = (k: string) => p.get(k)?.slice(0, 80) || "";
    const [a, f, q] = [cap("artist"), cap("folder"), cap("q")];
    if (!a && !f && !q) return;
    /* eslint-disable react-hooks/set-state-in-effect -- the URL is an external
       source that can only be read after hydration. A lazy state initialiser
       would read it during the first render and not match the prerendered
       HTML, which is what a static export ships. */
    setArtist(a);
    setFolder(f || null);
    setFilter(q);
    setTab("library");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Skips its first run so the params just read are not immediately erased by
  // the defaults they replaced.
  const urlWritten = useRef(false);
  useEffect(() => {
    if (!urlWritten.current) return void (urlWritten.current = true);
    const p = new URLSearchParams();
    if (folder) p.set("folder", folder);
    if (artist) p.set("artist", artist);
    if (filter.trim()) p.set("q", filter.trim());
    const qs = p.toString();
    // replaceState, not push: a filter typed letter by letter must not become
    // twelve entries in the back button. Safari throttles these by count, and a
    // held-down backspace is the one way to reach the limit — the URL falling
    // behind is not worth taking the page down over.
    try {
      history.replaceState(
        null,
        "",
        `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`,
      );
    } catch {}
  }, [folder, artist, filter]);

  // A folder change can strand an artist that folder has no tracks for — but
  // only then. Clearing unconditionally also wiped an artist restored from a link.
  useEffect(() => {
    if (!library.length) return;
    // A folder named in a link that this library has never heard of would
    // otherwise show an empty list with no chip lit to explain it.
    if (folder && !library.some((t) => t.folder === folder)) return setFolder(null);
    if (!artist) return;
    const here = library.filter((t) => !folder || t.folder === folder);
    const has = here.some((t) =>
      artistsOf(t.artist).some((a) => a.toLowerCase() === artist.toLowerCase()),
    );
    if (!has) setArtist("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, library]);

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

  /**
   * Edits read the playlists as they are at the moment they run, not as they
   * were when the handler was created — an Undo tapped several seconds later
   * must not resurrect whatever else was deleted in between. Persisting inside
   * the updater is the trade: it runs twice under StrictMode, writing the same
   * bytes both times.
   */
  const editPlaylists = (fn: (p: Playlists) => Playlists) =>
    setPlaylists((cur) => {
      const next = fn(cur);
      savePlaylists(next);
      return next;
    });

  const updatePlaylists = (next: Playlists) => editPlaylists(() => next);

  /** Tapping a playlist in the sheet adds or takes back out, then says which. */
  const togglePlaylist = (name: string, track: Track) => {
    const before = playlists[name] ?? [];
    const had = before.some((t) => t.id === track.id);
    updatePlaylists({
      ...playlists,
      [name]: had ? before.filter((t) => t.id !== track.id) : [...before, track],
    });
    toast.success(had ? `Removed from “${name}”` : `Added to “${name}”`, {
      description: `${track.title} — ${track.artist}`,
      action: undoable(name, before),
    });
  };

  /** Undo restores just this playlist, leaving anything edited since alone. */
  const undoable = (name: string, tracks: Track[]) => ({
    label: "Undo",
    onClick: () => editPlaylists((p) => ({ ...p, [name]: tracks })),
  });

  /** Names are the key, so a new one has to be free before it can be taken. */
  const freeName = (want: string) => {
    let name = want;
    for (let i = 2; playlists[name]; i++) name = `${want} (${i})`;
    return name;
  };

  const createPlaylist = (want: string, seed: Track[] = []) => {
    const name = freeName(want);
    updatePlaylists({ ...playlists, [name]: seed });
    toast.success(`Created “${name}”`, {
      description:
        // Landing on "Drives (2)" unannounced reads as the app losing input.
        name !== want
          ? `You already had a playlist called “${want}”.`
          : seed.length
            ? `${seed[0].title} is in it.`
            : "Add songs from search or your library.",
    });
  };

  const renamePlaylist = (from: string, to: string) => {
    // Silently doing nothing was the old behaviour, and it read as a bug.
    if (playlists[to])
      return toast.error(`There is already a playlist called “${to}”`, {
        description: "Pick another name.",
      });
    // Rebuilt in place rather than deleted and re-added, so it keeps its position.
    const next: Playlists = {};
    for (const [k, v] of Object.entries(playlists)) next[k === from ? to : k] = v;
    updatePlaylists(next);
    if (active === from) setActive(to);
    toast.success(`Renamed to “${to}”`);
  };

  const deletePlaylist = (name: string) => {
    const removed = playlists[name] ?? [];
    const { [name]: _, ...rest } = playlists;
    updatePlaylists(rest);
    if (active === name) setActive(null);
    // Undo rather than a confirm dialog: nothing is lost, and it costs no click
    // on the many deletions that were meant.
    toast.success(`Deleted “${name}”`, {
      description: `${removed.length} song${removed.length === 1 ? "" : "s"}.`,
      action: undoable(name, removed),
    });
  };

  const saveShared = () => {
    if (!shared) return;
    const name = freeName(shared.name);
    updatePlaylists({ ...playlists, [name]: shared.tracks });
    setShared(null);
    setSharedOpen(false);
    setActive(name);
    // The link has been spent; leave a clean URL behind.
    history.replaceState(null, "", location.pathname + location.search);
    toast.success(`Saved “${name}” to your playlists`, {
      description: "It lives in this browser now — the link is no longer needed.",
    });
  };

  /**
   * Shares the library view itself, not a copy of the songs in it. The URL
   * already carries the filter, so the link stays short and stays live: add
   * another Foeseal track tomorrow and the same link shows it.
   */
  const shareView = async () => {
    const url = location.href;
    const what = artist || folder || "your library";
    try {
      if (navigator.share) return await navigator.share({ title: what, url });
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", {
        description: `Opens on ${what} — ${inLibrary.length} song${inLibrary.length === 1 ? "" : "s"}.`,
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      toast.error("Could not copy the link", {
        description: "Clipboard access was refused.",
      });
    }
  };

  /** A file the listener keeps — the one copy that outlives this browser profile. */
  const backup = async () => {
    const name = `music-playlists-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([await encodeBackup(playlists)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    const n = Object.keys(playlists).length;
    toast.success(`Backed up ${n} playlist${n === 1 ? "" : "s"}`, {
      description: `${name} — keep it somewhere that syncs.`,
    });
  };

  /** Same-named playlists are replaced, anything else here is left alone. */
  const restore = async (file: File) => {
    const restored = await decodeBackup(await file.text(), library);
    if (!restored)
      return toast.error("That is not a playlists backup", {
        description: `${file.name} could not be read.`,
      });
    const before = playlists;
    updatePlaylists({ ...playlists, ...restored });
    const n = Object.keys(restored).length;
    toast.success(`Restored ${n} playlist${n === 1 ? "" : "s"}`, {
      description: "Playlists of the same name were replaced.",
      action: { label: "Undo", onClick: () => updatePlaylists(before) },
    });
  };

  const openDetail = (d: Detail | null) => {
    setSharedOpen(!!d?.shared);
    setActive(d && !d.shared ? d.name : null);
  };

  // Derived, not stored, so the open playlist tracks its own edits.
  const detail: Detail | null =
    sharedOpen && shared
      ? shared
      : active && playlists[active]
        ? { name: active, tracks: playlists[active] }
        : null;

  const onFiles = useCallback(async (files: File[]) => {
    const audio = files.filter(
      (f) =>
        f.type.startsWith("audio/") ||
        /\.(mp3|m4a|flac|wav|ogg|opus|aac)$/i.test(f.name),
    );
    // Dropping a folder of photos used to do nothing at all, silently.
    if (!audio.length)
      return toast.error("No audio in that drop", {
        description: "mp3, m4a, flac, wav, ogg, opus and aac are read.",
      });
    setImporting(`0 / ${audio.length}`);
    try {
      const added = await importFiles(audio, (d, t) =>
        setImporting(`${d} / ${t}`),
      );
      setLibrary(await getLibrary());
      const ignored = files.length - audio.length;
      toast.success(
        `Added ${added.length} song${added.length === 1 ? "" : "s"}`,
        {
          description: ignored
            ? `Stored in this browser. ${ignored} non-audio file${ignored === 1 ? " was" : "s were"} ignored.`
            : "Stored in this browser, playable offline.",
        },
      );
    } catch (e) {
      // An unreadable file used to reject into nothing and lose the whole batch.
      toast.error("Import failed", {
        description: e instanceof Error ? e.message : "Some files could not be read.",
      });
    } finally {
      setImporting(null);
    }
  }, []);

  // The whole window is the drop target: dragging files in from any tab raises
  // an overlay, and the drop lands in the library. Enter/leave nest through
  // child elements, so a depth counter decides when the drag truly left.
  useEffect(() => {
    if (!DEV) return;
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
        : (detail?.tracks ?? []);

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
        {DEV && tab === "library" && loaded && !library.length && (
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
                onClick={() => playAll(inLibrary, false, artist || folder || "your library")}
                disabled={!inLibrary.length}
                title="Play these in order"
                className="flex h-9 items-center gap-1.5 rounded-control bg-accent px-4 text-xs font-semibold text-white transition hover:brightness-110 active:scale-[0.97] disabled:opacity-40"
              >
                <TbPlayerPlayFilled size={12} />
                Play
              </button>
              <button
                onClick={() => playAll(inLibrary, true, artist || folder || "your library")}
                disabled={!inLibrary.length}
                title="Play these in a random order"
                className="flex h-9 items-center gap-1.5 rounded-control bg-fill px-4 text-xs font-medium text-label transition hover:bg-fill-2 active:scale-[0.97] disabled:opacity-40"
              >
                <TbArrowsShuffle size={13} />
                Shuffle
              </button>
              {/* Only once something is actually selected — a link to the
                  unfiltered library is just the site. */}
              {(!!artist || !!folder || !!needle) && (
                <button
                  onClick={shareView}
                  disabled={!inLibrary.length}
                  title="Copy a link that opens on this selection"
                  className="flex h-9 items-center gap-1.5 rounded-control bg-fill px-4 text-xs font-medium text-label transition hover:bg-fill-2 active:scale-[0.97] disabled:opacity-40"
                >
                  <TbShare3 size={13} />
                  Share
                </button>
              )}
              {DEV && <ImportButtons onFiles={onFiles} importing={importing} />}
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
          <PlaylistsView
            playlists={playlists}
            shared={shared}
            detail={detail}
            open={openDetail}
            onCreate={(name) => createPlaylist(name)}
            onRename={renamePlaylist}
            onDelete={deletePlaylist}
            onSaveShared={saveShared}
            onBackup={backup}
            onRestore={restore}
            onPlay={playAll}
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

        {/* The playlists grid carries its own empty state, so this one is only for
            an open playlist that has nothing in it yet. */}
        {!shown.length && !searching && (tab !== "playlists" || detail) && (
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
                    : DEV
                      ? "Your library is empty. Add audio files above."
                      : "The library is still loading."
                  : "This playlist is empty. Add tracks from search or your library."}
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
              onAddTo={() => setAddTo(track)}
              onRemove={
                // Bundled tracks ship with the site; removeTrack can't evict one, it would just reappear.
                tab === "library" && !track.id.startsWith("file:")
                  ? async () => {
                      await removeTrack(track.id);
                      setLibrary(await getLibrary());
                      // No Undo here: removeTrack drops the audio blob itself.
                      toast.success("Removed from your library", {
                        description: `${track.title} — ${track.artist}`,
                      });
                    }
                  : // A shared playlist is someone else's; it is saved before it is edited.
                    tab === "playlists" && active && playlists[active]
                    ? () => {
                        const before = playlists[active];
                        updatePlaylists({
                          ...playlists,
                          [active]: before.filter((t) => t.id !== track.id),
                        });
                        toast.success(`Removed from “${active}”`, {
                          description: `${track.title} — ${track.artist}`,
                          action: undoable(active, before),
                        });
                      }
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

      {addTo && (
        <AddToSheet
          track={addTo}
          playlists={playlists}
          onToggle={(name) => togglePlaylist(name, addTo)}
          onCreate={(name) => createPlaylist(name, [addTo])}
          onQueue={(mode) => enqueue(addTo, mode)}
          onClose={() => setAddTo(null)}
        />
      )}

      {/* pointer-events-none: the drop itself must fall through to the window. */}
      {DEV && dragging && (
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
  onAddTo,
  onRemove,
}: {
  track: Track;
  active: boolean;
  playing: boolean;
  onPlay: () => void;
  onAddTo: () => void;
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

      <button
        onClick={onAddTo}
        aria-label={`Add ${track.title} to a playlist or the queue`}
        title="Add to playlist or queue"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-label-3 transition hover:bg-fill-2 hover:text-label"
      >
        <TbPlus size={16} />
      </button>

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
