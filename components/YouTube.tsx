"use client";

import { useEffect, useRef, useState } from "react";
import {
  TbArrowsShuffle,
  TbBrandYoutube,
  TbExternalLink,
  TbPlayerPlayFilled,
  TbSearch,
} from "react-icons/tb";
import { Masthead, TabBar } from "@/components/AppNav";
import { PlayerBar } from "@/components/Player";
import { ClearButton, RecentStrip, Row, SkeletonRows } from "@/components/Row";
import { AddToSheet, MonthSection, Mosaic } from "@/components/Playlists";
import { toast } from "@/lib/toast";
import {
  Plays,
  Playlists,
  Track,
  getPlays,
  getPlaylists,
  getRecent,
  monthStats,
  mostPlayed,
  pushRecent,
  recordPlay,
  savePlaylists,
  shuffled,
} from "@/lib/music";
import {
  cover,
  getYtSession,
  hasKey,
  isYouTube,
  musicChart,
  saveYtSession,
  searchYouTube,
  videoId,
  videos,
} from "@/lib/youtube";

type YTPlayer = {
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  cuePlaylist(o: { list: string; listType: string }): void;
  getPlaylist(): string[] | null;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(t: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoLoadedFraction(): number;
  setVolume(v: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
};

type YTGlobal = {
  Player: new (
    el: HTMLElement,
    opts: {
      width: string;
      height: string;
      playerVars: Record<string, number>;
      events: {
        onReady(): void;
        onStateChange(e: { data: number }): void;
      };
    },
  ) => YTPlayer;
};

const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const CUED = 5;

/** Up next keeps at least this many songs ahead of the one playing. */
const AHEAD = 20;

/** "Good morning", "Good afternoon" or "Good evening", by the clock here. */
const greeting = (h = new Date().getHours()) =>
  h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

let api: Promise<YTGlobal> | undefined;

/** YouTube's IFrame Player API, loaded once. */
const loadApi = () =>
  (api ??= new Promise((resolve) => {
    const w = window as unknown as {
      YT?: YTGlobal;
      onYouTubeIframeAPIReady?: () => void;
    };
    w.onYouTubeIframeAPIReady = () => resolve(w.YT!);
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.append(s);
  }));

export default function YouTube() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"home" | "next" | "results">("next");

  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatOne, setRepeatOne] = useState(false);
  const [radioLoading, setRadioLoading] = useState(false);
  const [scoutReady, setScoutReady] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  // What For you opens on: your own favourites, or the chart before you have any.
  const [picks, setPicks] = useState<{ tracks: Track[]; mine: boolean } | null>(
    null,
  );
  const [similar, setSimilar] = useState<{ seed: Track; tracks: Track[] } | null>(
    null,
  );

  const [addTo, setAddTo] = useState<Track | null>(null);
  const [playlists, setPlaylists] = useState<Playlists>({});
  const [recent, setRecent] = useState<Track[]>([]);
  const [plays, setPlays] = useState<Plays>({});

  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const player = useRef<YTPlayer | null>(null);
  // A second, never-playing player reads Mixes, so the one playing is never interrupted.
  const scoutHost = useRef<HTMLDivElement>(null);
  const scout = useRef<Promise<YTPlayer> | null>(null);
  const cued = useRef<(() => void) | null>(null);
  const scoutBusy = useRef<Promise<unknown>>(Promise.resolve());
  const extending = useRef(false);
  const seeded = useRef(new Set<string>());
  const more = useRef<HTMLDivElement>(null);
  const unshuffled = useRef<Track[] | null>(null);
  const lastTime = useRef(0);
  // YouTube's callbacks outlive renders, so they read the latest state from here.
  const live = useRef({ queue, index, repeatOne, onEnded: () => {} });

  const track = queue[index];

  function play(i: number, q = queue) {
    const t = q[i];
    if (!t || !player.current) return;
    setIndex(i);
    lastTime.current = 0;
    player.current.loadVideoById(videoId(t));
    setRecent(pushRecent(t));
  }

  /** A list from Listening plays from the tapped song, and radio carries on after it. */
  function playList(tracks: Track[], i: number) {
    unshuffled.current = null;
    seeded.current.clear();
    setShuffle(false);
    setQueue(tracks);
    setView("next");
    play(i, tracks);
  }

  /** YouTube's own Mix for a song, read by cueing it in the scout: no API quota. */
  function mixOf(t: Track): Promise<string[]> {
    // One cue at a time: the scout has a single playlist and a single "cued".
    const run = scoutBusy.current.then(() => readMix(t));
    scoutBusy.current = run.catch(() => {});
    return run;
  }

  async function readMix(t: Track): Promise<string[]> {
    const p = await scout.current!;
    const ready = new Promise<void>((r) => {
      cued.current = r;
      setTimeout(r, 5000);
    });
    p.cuePlaylist({ list: `RD${videoId(t)}`, listType: "playlist" });
    await ready;
    cued.current = null;
    return p.getPlaylist() ?? [];
  }

  /**
   * Appends what YouTube would play after the queue's last song not yet used as a
   * seed, and hands back the longer queue. Each call costs 1 unit of quota.
   */
  async function extend(): Promise<Track[]> {
    const q = live.current.queue;
    const seed = q.findLast((t) => !seeded.current.has(t.id));
    if (extending.current || !seed || !scout.current) return q;
    extending.current = true;
    seeded.current.add(seed.id);
    setRadioLoading(true);
    try {
      const ids = await mixOf(seed);
      const have = new Set(live.current.queue.map((x) => x.id));
      const fresh = await videos(
        ids.filter((id) => !have.has(`yt:${id}`)).slice(0, 50),
      );
      const next = [...live.current.queue, ...fresh];
      live.current.queue = next;
      setQueue(next);
      return next;
    } catch (e) {
      toast.error("Couldn't load similar songs", {
        description: (e as Error).message,
      });
      return live.current.queue;
    } finally {
      extending.current = false;
      setRadioLoading(false);
    }
  }

  /** Your most played and recent YouTube songs, shuffled; the chart if there are none. */
  async function loadPicks() {
    const yt = Object.fromEntries(
      Object.entries(getPlays()).filter(([id]) => id.startsWith("yt:")),
    );
    const seen = new Set<string>();
    const mine = [
      ...mostPlayed(yt, 0, 12).map((x) => x.track),
      ...getRecent().filter(isYouTube),
    ].filter((t) => !seen.has(t.id) && seen.add(t.id));
    if (mine.length)
      return setPicks({ tracks: shuffled(mine.slice(0, 12)), mine: true });
    if (!hasKey) return;
    const chart = await musicChart().catch(() => []);
    setPicks({ tracks: chart.slice(0, 12), mine: false });
  }

  /** A search pick starts a station: the song now, its Mix right behind it. */
  function startRadio(t: Track) {
    unshuffled.current = null;
    seeded.current.clear();
    setShuffle(false);
    setView("next");
    setQueue([t]);
    play(0, [t]);
  }

  useEffect(() => {
    live.current.queue = queue;
    live.current.index = index;
    live.current.repeatOne = repeatOne;
    // The queue ran out: carry on with what YouTube would play next, as YouTube does.
    live.current.onEnded = async () => {
      if (repeatOne) {
        player.current?.seekTo(0, true);
        return player.current?.playVideo();
      }
      if (index + 1 < queue.length) return play(index + 1);
      const q = await extend();
      if (q.length > index + 1) play(index + 1, q);
    };
    if (queue.length) saveYtSession({ queue, index });
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration.
    setPlaylists(getPlaylists());
    setRecent(getRecent());
    setPlays(getPlays());
    loadPicks();
    const s = getYtSession();
    if (!s) setView("home");
    let gone = false;
    loadApi().then((YT) => {
      if (gone) return;
      scout.current = new Promise((resolve) => {
        const p: YTPlayer = new YT.Player(
          scoutHost.current!.appendChild(document.createElement("div")),
          {
            width: "1",
            height: "1",
            playerVars: {},
            events: {
              onReady: () => {
                resolve(p);
                setScoutReady(true);
              },
              onStateChange: ({ data }) => data === CUED && cued.current?.(),
            },
          },
        );
      });
      // The API swaps its element for an iframe, so it gets one React doesn't own.
      const el = host.current!.appendChild(document.createElement("div"));
      player.current = new YT.Player(el, {
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            if (!s) return;
            setQueue(s.queue);
            setIndex(s.index);
            const t = s.queue[s.index];
            if (s.play) {
              setRecent(pushRecent(t));
              player.current!.loadVideoById(videoId(t));
            } else player.current!.cueVideoById(videoId(t));
          },
          onStateChange: ({ data }) => {
            if (data === PLAYING) setPlaying(true);
            if (data === PAUSED || data === ENDED) setPlaying(false);
            if (data === ENDED) live.current.onEnded();
          },
        },
      });
    });
    return () => {
      gone = true;
      player.current?.destroy();
      player.current = null;
      scout.current?.then((p) => p.destroy());
      scout.current = null;
    };
  }, []);

  // Up next never runs dry: it keeps a run of songs ahead, and grows for as
  // long as you scroll to its end.
  useEffect(() => {
    const short = queue.length - index - 1 < AHEAD;
    if (scoutReady && !radioLoading && queue.length && (short || atEnd))
      extend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoutReady, queue, index, radioLoading, atEnd]);

  const hasQueue = queue.length > 0;
  useEffect(() => {
    const el = more.current;
    if (!el || view !== "next") return setAtEnd(false);
    const io = new IntersectionObserver(([e]) => setAtEnd(e.isIntersecting), {
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [view, hasQueue]);

  // "More like" your top song, read once from its Mix.
  const seedPick = picks?.mine ? picks.tracks[0] : undefined;
  useEffect(() => {
    if (!scoutReady || !seedPick || !hasKey) return;
    let gone = false;
    mixOf(seedPick)
      .then((ids) =>
        videos(ids.filter((id) => id !== videoId(seedPick)).slice(0, 15)),
      )
      .then((tracks) => !gone && setSimilar({ seed: seedPick, tracks }))
      .catch(() => {});
    return () => void (gone = true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoutReady, seedPick]);

  // Songs saved before tracks carried their aspect learn it when they play: 1 unit.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!track || track.aspect || !hasKey || asked.current.has(track.id)) return;
    asked.current.add(track.id);
    videos([videoId(track)])
      .then(([v]) => {
        if (!v?.aspect) return;
        setQueue((q) =>
          q.map((t) => (t.id === v.id ? { ...t, aspect: v.aspect } : t)),
        );
      })
      .catch(() => {});
  }, [track]);

  // The iframe has no time events, so the clock is polled.
  useEffect(() => {
    if (!playing || !track) return;
    const id = setInterval(() => {
      const p = player.current;
      if (!p) return;
      const t = p.getCurrentTime();
      const d = p.getDuration();
      setTime(t);
      setDur(d);
      setBuffered(p.getVideoLoadedFraction() * d);
      // A play is 30 seconds heard (half of a shorter song), as in the main player.
      const mark = Math.min(30, (d || 60) / 2);
      const was = lastTime.current;
      lastTime.current = t;
      if (was < mark && t >= mark && t - was < 2) setPlays(recordPlay(track));
    }, 500);
    return () => clearInterval(id);
  }, [playing, track]);

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    p.setVolume(volume * 100);
    if (muted) p.mute();
    else p.unMute();
  }, [volume, muted]);

  useEffect(() => {
    if (!playing || !track) return;
    const was = document.title;
    document.title = `▶ ${track.title} – ${track.artist}`;
    return () => void (document.title = was);
  }, [playing, track]);

  const toggle = () =>
    playing ? player.current?.pauseVideo() : player.current?.playVideo();
  const next = () => live.current.onEnded();
  const prev = () => {
    if (time > 3 || index === 0) return seek(0);
    play(index - 1);
  };
  const seek = (t: number) => {
    setTime(t);
    player.current?.seekTo(t, true);
  };

  /** Shuffles what's still to come, as YouTube does; off puts it back in order. */
  const toggleShuffle = () => {
    if (!shuffle) {
      unshuffled.current = queue;
      setQueue([
        ...queue.slice(0, index + 1),
        ...shuffled(queue.slice(index + 1)),
      ]);
    } else if (unshuffled.current) {
      const orig = unshuffled.current;
      const ids = new Set(orig.map((t) => t.id));
      const q = [...orig, ...queue.filter((t) => !ids.has(t.id))];
      setQueue(q);
      setIndex(q.findIndex((t) => t.id === track?.id));
      unshuffled.current = null;
    }
    setShuffle(!shuffle);
    toast(shuffle ? "Shuffle off" : "Shuffle on", { id: "shuffle" });
  };

  const toggleRepeat = () => {
    setRepeatOne(!repeatOne);
    toast(repeatOne ? "Repeat one off" : "Repeat one", {
      id: "repeat",
      description: repeatOne
        ? "Similar songs play on after the queue."
        : "This song plays on a loop.",
    });
  };

  // The main player's keys, the ones that make sense for a video.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "")) return;
      if (el?.closest("dialog[open]") || e.metaKey || e.ctrlKey || e.altKey)
        return;
      if (!track) return;
      const keys: Record<string, () => void> = {
        Space: toggle,
        KeyK: toggle,
        KeyJ: () => seek(Math.max(time - 10, 0)),
        KeyL: () => seek(Math.min(time + 10, dur)),
        KeyM: () => setMuted(!muted),
        KeyS: toggleShuffle,
        KeyR: toggleRepeat,
      };
      if (e.shiftKey) Object.assign(keys, { KeyN: next, KeyP: prev });
      const run = keys[e.code];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    search(query);
  }

  async function search(query: string) {
    if (!query.trim() || !hasKey) return;
    setSearching(true);
    setError("");
    setView("results");
    try {
      setResults(await searchYouTube(query));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  const enqueue = (t: Track, mode: "next" | "end") => {
    if (!queue.length) return void startRadio(t);
    const q = queue.filter((x) => x.id !== t.id);
    const at = q.findIndex((x) => x.id === track?.id);
    q.splice(mode === "next" ? at + 1 : q.length, 0, t);
    setQueue(q);
    setIndex(at);
    toast.success(mode === "next" ? "Playing next" : "Added to the queue", {
      description: `${t.title} — ${t.artist}`,
    });
  };

  const editPlaylists = (p: Playlists) => {
    setPlaylists(p);
    savePlaylists(p);
  };

  const list =
    view === "results" ? results : view === "next" ? queue.slice(index) : [];
  const empty =
    view !== "home" &&
    !list.length &&
    !(view === "results" && (searching || error));

  // The same listening the main page shows, kept to what played here.
  const ytPlays = Object.fromEntries(
    Object.entries(plays).filter(([id]) => id.startsWith("yt:")),
  );
  const month = monthStats(ytPlays);
  const top = mostPlayed(ytPlays);
  const topTracks = top.map((x) => x.track);
  const ytRecent = recent.filter(isYouTube);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas pb-40 text-label sm:pb-28">
      <Masthead current="youtube">
        <form onSubmit={onSearch}>
          <TbSearch
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-3"
            size={14}
          />
          {/* Searches on Enter, not per keystroke: each one spends 1% of the daily quota. */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
            placeholder="Search YouTube, then press Enter"
            className="h-9 w-full rounded-control bg-fill pl-9 pr-9 text-sm outline-none transition placeholder:text-label-3 focus:bg-fill-2"
          />
          {!!query && (
            <ClearButton label="Clear search" onClick={() => setQuery("")} />
          )}
        </form>
      </Masthead>

      <main
        className={`mx-auto grid w-full max-w-6xl flex-1 content-start gap-x-8 gap-y-5 px-4 py-5 ${
          view === "home"
            ? "lg:grid-cols-[minmax(0,1fr)_auto]"
            : "lg:grid-cols-[minmax(0,1fr)_400px]"
        }`}
      >
        <div className="col-span-full flex flex-wrap gap-2">
          {(
            [
              ["home", "For you"],
              ["next", "Up next"],
              ["results", "Results"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-pressed={view === id}
              className={`h-7 rounded-full px-3 text-xs font-medium transition ${
                view === id
                  ? "bg-label text-canvas"
                  : "bg-fill text-label-2 hover:bg-fill-2 hover:text-label"
              }`}
            >
              {label}
              {id === "next" && queue.length > index + 1
                ? ` (${queue.length - index - 1})`
                : id === "results" && results.length
                  ? ` (${results.length})`
                  : ""}
            </button>
          ))}
        </div>

        <section
          ref={stage}
          className={`scroll-mt-20 ${track ? "" : "hidden"} ${
            view === "home"
              ? "pointer-events-none lg:col-start-2 lg:row-start-2 lg:w-100"
              : "lg:sticky lg:top-20 lg:self-start"
          }`}
        >
          <div className="aspect-video overflow-hidden rounded-card bg-elevated shadow-2xl shadow-black/50 ring-1 ring-white/10">
            {/* YouTube pads a video that isn't 16:9 with black; zooming by the
                mismatch fills the tile, the way object-fit: cover would. */}
            <div
              ref={host}
              className="size-full transition-transform duration-300"
              style={{
                transform: `scale(${view === "home" ? cover(track?.aspect) : 1})`,
              }}
            />
          </div>
        </section>

        {/* For you lays its blocks straight into the page grid, so its first
            one can share a row with the video. */}
        <section
          className={
            view === "home"
              ? "contents"
              : `flex min-w-0 flex-col ${track ? "" : "lg:col-span-2"}`
          }
        >
          {view === "results" && searching && <SkeletonRows />}
          {view === "results" && error && (
            <p className="py-8 text-center text-sm text-accent">{error}</p>
          )}

          {empty && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-16 text-center">
              <TbBrandYoutube className="text-label-3" size={32} />
              <p className="max-w-xs text-sm text-label-2">
                {view === "results" && !hasKey
                  ? "Add a YouTube Data API key to .env.local as NEXT_PUBLIC_YT_KEY to search."
                  : view === "results"
                    ? "Search YouTube for full songs. Picking one starts a station of similar songs."
                    : "Nothing queued yet. Search for a song to start a station."}
              </p>
            </div>
          )}

          {view === "home" &&
            (picks?.tracks.length ? (
              <>
                <section
                  className={`@container relative min-w-0 overflow-hidden rounded-sheet bg-elevated shadow-2xl shadow-black/40 ring-1 ring-white/10 ${
                    track ? "lg:col-start-1 lg:row-start-2" : "col-span-full"
                  }`}
                >
                  {picks.tracks[0].artwork && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={picks.tracks[0].artwork}
                      alt=""
                      aria-hidden
                      className="pointer-events-none absolute inset-0 size-full scale-150 object-cover opacity-30 blur-3xl saturate-150"
                    />
                  )}
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />
                  <div className="relative flex h-full items-center gap-3.5 p-3 @lg:gap-5 @lg:p-[26px]">
                    {/* 173px + 26px padding twice = 225px, the height of the 400px-wide video beside it. */}
                    <Mosaic
                      tracks={picks.tracks}
                      className="size-20 shrink-0 rounded-control ring-1 ring-white/10 @lg:size-[173px] @lg:rounded-card"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-widest text-label-2 @lg:text-xxs">
                        {picks.mine ? "For you" : "Popular now"}
                      </p>
                      <h2 className="mt-1 hidden text-3xl font-semibold tracking-tight @lg:block">
                        {greeting()}
                      </h2>
                      <p className="mt-0.5 line-clamp-2 max-w-md text-xxs text-label-2 @lg:mt-1.5 @lg:text-[15px]">
                        {picks.mine
                          ? "The songs you keep coming back to, with more like them after."
                          : "What's popular on YouTube right now. Your own picks show up here as you listen."}
                      </p>
                      <div className="mt-2.5 flex gap-2 @lg:mt-4">
                        <button
                          onClick={() => playList(picks.tracks, 0)}
                          className="flex h-9 items-center gap-1.5 rounded-control bg-accent px-4 text-xs font-semibold text-white transition hover:brightness-110 active:scale-[0.97]"
                        >
                          <TbPlayerPlayFilled size={12} />
                          Play
                        </button>
                        <button
                          onClick={() => playList(shuffled(picks.tracks), 0)}
                          className="flex h-9 items-center gap-1.5 rounded-control bg-fill px-4 text-xs font-medium text-label transition hover:bg-fill-2 active:scale-[0.97]"
                        >
                          <TbArrowsShuffle size={13} />
                          Shuffle
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="@container col-span-full min-w-0">
                <section className="mb-8">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-label-3">
                    Quick picks
                  </h2>
                  <ul className="grid grid-cols-1 gap-x-6 @2xl:grid-cols-2 @5xl:grid-cols-3">
                    {picks.tracks.map((t) => (
                      <Row
                        key={t.id}
                        track={t}
                        active={t.id === track?.id}
                        playing={t.id === track?.id && playing}
                        onPlay={() =>
                          t.id === track?.id ? toggle() : startRadio(t)
                        }
                        onAddTo={() => setAddTo(t)}
                      />
                    ))}
                  </ul>
                </section>

                {!!similar?.tracks.length && (
                  <RecentStrip
                    title={`More like ${similar.seed.title}`}
                    tracks={similar.tracks}
                    onPlay={(i) => startRadio(similar.tracks[i])}
                  />
                )}

                {!!ytRecent.length && (
                  <RecentStrip
                    tracks={ytRecent}
                    onPlay={(i) => playList(ytRecent, i)}
                  />
                )}

                {month && (
                  <div className="mt-8">
                    <MonthSection
                      month={month}
                      onArtist={(name) => {
                        setQuery(name);
                        search(name);
                      }}
                    />
                  </div>
                )}

                {!!top.length && (
                  <section>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-label-3">
                      Most played
                    </h2>
                    <ul>
                      {top.map(({ track: t, n }, i) => (
                        <Row
                          key={t.id}
                          track={t}
                          active={t.id === track?.id}
                          playing={t.id === track?.id && playing}
                          onPlay={() =>
                            t.id === track?.id ? toggle() : playList(topTracks, i)
                          }
                          onAddTo={() => setAddTo(t)}
                          plays={n}
                        />
                      ))}
                    </ul>
                  </section>
                )}
                </div>
              </>
            ) : (
              <div className="col-span-full flex flex-1 flex-col items-center justify-center gap-2.5 py-16 text-center">
                <TbBrandYoutube className="text-label-3" size={32} />
                <p className="max-w-xs text-sm text-label-2">
                  {hasKey
                    ? "Search for a song to start. Your favourites gather here as you listen."
                    : "Add a YouTube Data API key to .env.local as NEXT_PUBLIC_YT_KEY to search."}
                </p>
              </div>
            ))}

          {view !== "home" && !(view === "results" && searching) && (
            <ul>
              {list.map((t, i) => {
                const at = view === "results" ? -1 : index + i;
                const now = t.id === track?.id;
                return (
                  <Row
                    key={t.id}
                    track={t}
                    active={now}
                    playing={now && playing}
                    onPlay={() =>
                      now ? toggle() : at >= 0 ? play(at) : startRadio(t)
                    }
                    onAddTo={() => setAddTo(t)}
                  />
                );
              })}
            </ul>
          )}
          {view === "next" && !!queue.length && (
            <div
              ref={more}
              className="py-4 text-center text-xs text-label-2"
            >
              {radioLoading ? "Finding similar songs…" : ""}
            </div>
          )}
        </section>
      </main>

      {track && (
        <PlayerBar
          track={track}
          playing={playing}
          onToggle={toggle}
          onOpen={() => stage.current?.scrollIntoView({ behavior: "smooth" })}
          time={time}
          dur={dur || track.duration || 0}
          buffered={buffered}
          onSeek={seek}
          prev={prev}
          next={next}
          shuffle={shuffle}
          toggleShuffle={toggleShuffle}
          repeat={repeatOne ? "one" : "all"}
          toggleRepeat={toggleRepeat}
          volume={volume}
          setVolume={setVolume}
          muted={muted}
          setMuted={setMuted}
        >
          <a
            href={track.appleUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open on YouTube"
            title="Open on YouTube"
            className="grid h-8 w-8 place-items-center rounded-full text-sm text-label-2 transition hover:bg-fill hover:text-label"
          >
            <TbExternalLink />
          </a>
        </PlayerBar>
      )}

      <div
        ref={scoutHost}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 size-px overflow-hidden opacity-0"
      />

      <TabBar current="youtube" />

      {addTo && (
        <AddToSheet
          track={addTo}
          playlists={playlists}
          onToggle={(name) => {
            const had = playlists[name]?.some((t) => t.id === addTo.id);
            editPlaylists({
              ...playlists,
              [name]: had
                ? playlists[name].filter((t) => t.id !== addTo.id)
                : [...(playlists[name] ?? []), addTo],
            });
            toast.success(
              had ? `Removed from “${name}”` : `Added to “${name}”`,
              { description: `${addTo.title} — ${addTo.artist}` },
            );
          }}
          onCreate={(want) => {
            let name = want;
            for (let i = 2; playlists[name]; i++) name = `${want} (${i})`;
            editPlaylists({ ...playlists, [name]: [addTo] });
            toast.success(`Created “${name}”`, {
              description: `${addTo.title} is in it.`,
            });
          }}
          onQueue={(mode) => enqueue(addTo, mode)}
          onClose={() => setAddTo(null)}
        />
      )}
    </div>
  );
}
