"use client";

import {
  CSSProperties,
  Fragment,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  TbArrowsMaximize,
  TbArrowsShuffle,
  TbChevronDown,
  TbChevronLeft,
  TbDots,
  TbDisc,
  TbExternalLink,
  TbLink,
  TbPictureInPicture,
  TbPlaylistAdd,
  TbShare3,
  TbUser,
  TbMicrophone2,
  TbMusic,
  TbPlayerPlayFilled,
  TbPlayerTrackPrevFilled,
  TbPlayerTrackNextFilled,
  TbPlaylist,
  TbRepeat,
  TbVolume,
  TbVolumeOff,
  TbX,
} from "react-icons/tb";
import { Logo } from "@/components/Logo";
import { toast } from "@/lib/toast";
import {
  Track,
  artistsOf,
  audioSrc,
  encodePlaylist,
  fmtTime,
  getSession,
  isPreview,
  saveSession,
  saveSessionTime,
  shuffled,
} from "@/lib/music";
import { getLyrics } from "@/lib/lyrics";
import { backdropDim, markTone } from "@/lib/tone";
import Horizon, { livelyDesk } from "./Horizon";
import LyricsPanel from "./Lyrics";
import { useMiniPlayer } from "./MiniPlayer";
import { Backdrop, Btn, useArtTone } from "./PlayerKit";
import { flushSync } from "react-dom";
import Image from "next/image";

// The queue waits on this: a scroll under the view-transition snapshot is never seen.
let trackFade: Promise<unknown> = Promise.resolve();

/** Feeds the styled range its filled (and buffered) proportion; see .range in globals.css. */
const filled = (value: number, max: number, buffered = 0) =>
  ({
    "--range-pct": `${max > 0 ? (value / max) * 100 : 0}%`,
    "--buffered-pct": `${max > 0 ? (buffered / max) * 100 : 0}%`,
  }) as CSSProperties;

type Props = {
  queue: Track[];
  index: number;
  setIndex: (i: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  onAddTo: (t: Track) => void;
  onGoTo: (kind: "artist" | "album", name: string) => void;
};

export default function Player({
  queue,
  index,
  setIndex,
  playing,
  setPlaying,
  onAddTo,
  onGoTo,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const graph = useRef<{ ctx: AudioContext; an: AnalyserNode } | null>(null);
  const objectUrl = useRef<string | null>(null);
  // The saved session seeds settings; the queue itself is restored by the page.
  const [init] = useState(getSession);
  const resume = useRef(init?.time ?? null);
  const lastSaved = useRef(0);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(init?.volume ?? 1);
  const [muted, setMuted] = useState(init?.muted ?? false);
  const [repeat, setRepeat] = useState(init?.repeat ?? false);
  const [shuffle, setShuffle] = useState(init?.shuffle ?? false);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [noLyrics, setNoLyrics] = useState<string | null>(null);
  const [lyricsChecked, setLyricsChecked] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<number[] | null>(null);

  const track = queue[index];
  const path = useMemo(
    () => (order?.length === queue.length ? order : queue.map((_, i) => i)),
    [order, queue],
  );
  const here = path.indexOf(index);
  const hasAudio = !!track;
  const artLum = useArtTone(track?.artwork).lum;
  const lyricsless = !!track && noLyrics === track.id;
  const lyricsChecking = !!track && lyricsChecked !== track.id;
  const lyricsOn = showLyrics && !lyricsless;

  /**
   * The inline message stays — it marks *this* track as broken for as long as it
   * is loaded. The toast is what catches the eye, and a fixed id means skipping
   * through a stale shared playlist replaces one toast instead of stacking ten.
   */
  const fail = (message: string) => {
    setError(message);
    toast.error(message, {
      id: "playback",
      description: track ? `${track.title} — ${track.artist}` : undefined,
    });
  };

  /** Shuffle and repeat answer to S and R as well as to the buttons, and a
      keystroke changes a state you may not be looking at. */
  const toggleShuffle = () => {
    setShuffle(!shuffle);
    toast(shuffle ? "Shuffle off" : "Shuffle on", { id: "shuffle" });
  };

  const toggleRepeat = () => {
    setRepeat(!repeat);
    toast(repeat ? "Repeat off" : "Repeat on", {
      id: "repeat",
      description: repeat ? undefined : "The queue starts over at the end.",
    });
  };

  const transition = (change: () => void) => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm || !document.startViewTransition) return change();
    // `ready` rejects when the transition is skipped (hidden tab, rapid toggle).
    document.startViewTransition(() => flushSync(change)).ready.catch(() => {});
  };
  /** A track change cross-fades the whole view, cover into cover, rather than cutting. */
  const go = (
    i: number,
    dir: "next" | "prev" = i > index ? "next" : "prev",
  ) => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (i === index || calm || document.hidden || !document.startViewTransition)
      return setIndex(i);
    const root = document.documentElement;
    root.dataset.vt = dir;
    const t = document.startViewTransition(() => flushSync(() => setIndex(i)));
    t.ready.catch(() => {});
    trackFade = t.finished.finally(() => delete root.dataset.vt);
  };
  useEffect(() => {
    if (!playing || !track) return;
    const was = document.title;
    document.title = `▶ ${track.title} – ${track.artist}`;
    return () => void (document.title = was);
  }, [playing, track]);

  const toggleLyrics = () => {
    if (!lyricsless) transition(() => setShowLyrics(!showLyrics));
  };

  useEffect(() => {
    if (!track) return;
    let gone = false;
    getLyrics(track)
      .then((l) => {
        if (gone || l) return;
        const mark = () => setNoLyrics(track.id);
        if (document.querySelector(".stage[data-lyrics]")) transition(mark);
        else mark();
      })
      .catch(() => {})
      .finally(() => !gone && setLyricsChecked(track.id));
    return () => void (gone = true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  /** The queue comes back with the view, but only where there is room for it. */
  const openFull = (withQueue: boolean) => {
    setShowQueue(withQueue && window.innerWidth >= 1024);
    setFull(true);
  };

  // A fixed shuffled order, not a fresh random pick each time: picking randomly on every
  // skip can repeat a track while others never play, and makes Previous meaningless.
  // Rebuilt when shuffle is switched on or the queue changes, current track first.
  useEffect(() => {
    if (!shuffle) return setOrder(null);
    const rest = queue.map((_, i) => i).filter((i) => i !== index);
    setOrder([index, ...shuffled(rest)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffle, queue]);

  // Warm whatever plays next — the service worker caches /songs/*, so skipping
  // ahead (or the track just ending) starts instantly instead of re-downloading.
  useEffect(() => {
    const path = order ?? queue.map((_, i) => i);
    const nxt = queue[path[path.indexOf(index) + 1]];
    if (nxt?.preview?.startsWith("/songs/")) fetch(nxt.preview).catch(() => {});
    if (showLyrics && nxt) getLyrics(nxt).catch(() => {});
    // Both neighbours' covers, so a skip fades into artwork, not an empty square.
    if (full)
      for (const t of [nxt, queue[path[path.indexOf(index) - 1]]]) {
        const art = t?.artworkLarge ?? t?.artwork;
        if (art) document.createElement("img").src = art;
      }
  }, [index, order, queue, showLyrics, full]);

  /** Walk the play order, which is the shuffled one when shuffle is on. */
  const step = (delta: 1 | -1) => {
    if (!queue.length) return;
    const at = Math.max(here, 0) + delta;
    if (at >= path.length)
      return repeat ? go(path[0], "next") : setPlaying(false);
    go(path[at < 0 ? path.length - 1 : at], delta > 0 ? "next" : "prev");
  };

  const next = () => step(1);

  const prev = () => {
    const a = audioRef.current;
    // Restart the track first, the way every player does, before stepping back.
    if (a && a.currentTime > 3) return void (a.currentTime = 0);
    step(-1);
  };

  const seekMax = dur || track?.duration || 0;
  const seek = (t: number) => {
    setTime(t);
    if (audioRef.current) audioRef.current.currentTime = t;
  };

  const mini = useMiniPlayer({
    track,
    playing,
    setPlaying,
    time,
    dur: seekMax,
    onSeek: seek,
    next,
    prev,
    audio: audioRef,
    analyser: graph,
  });

  // Load the source whenever the track changes. Local tracks come out of IndexedDB
  // as an object URL, so the previous one gets revoked to avoid leaking blobs.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTime(0);
    setBuffered(0);
    if (!track) return;

    setLoading(true);
    audioSrc(track)
      .then((src) => {
        if (cancelled || !audioRef.current) return;
        if (!src) return fail("No playable audio for this track.");
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = src.startsWith("blob:") ? src : null;
        audioRef.current.src = src;
        // Restored session: pick up at the saved position, but only in the very
        // track it was saved for. Any other load starts the clock over.
        const r = resume.current;
        resume.current = null;
        if (r && r.id === track.id) {
          audioRef.current.currentTime = r.t;
          setTime(r.t);
        } else {
          saveSessionTime(track.id, 0);
        }
        if (playing) audioRef.current.play().catch(() => setPlaying(false));
      })
      .catch(
        (e) =>
          !cancelled &&
          fail(e instanceof Error ? e.message : "Could not load audio."),
      )
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !a.src) return;
    if (playing) a.play().catch(() => setPlaying(false));
    else a.pause();
    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Desktop only: once the element feeds Web Audio, iOS suspends it with the
  // screen lock, which would stop background playback.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !(full || mini.window) || !playing) return;
    if (!graph.current && livelyDesk()) {
      try {
        const ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        // Onset detection needs the raw jump between frames.
        an.smoothingTimeConstant = 0;
        ctx.createMediaElementSource(a).connect(an);
        an.connect(ctx.destination);
        graph.current = { ctx, an };
      } catch {}
    }
    graph.current?.ctx.resume().catch(() => {});
  }, [full, mini.window, playing]);

  // The <audio> only mounts once there is a track, after the restored settings
  // first run, so they are applied again when it appears.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, hasAudio]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted, hasAudio]);

  // Persist the session as it changes, so the next visit resumes it (Spotify-style).
  // Playback position goes through saveSessionTime instead — see onTimeUpdate.
  useEffect(() => {
    if (track) saveSession({ queue, index, volume, muted, shuffle, repeat });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, index, volume, muted, shuffle, repeat]);

  // The exact position on the way out — tab close, reload, navigation.
  useEffect(() => {
    const save = () => {
      const a = audioRef.current;
      if (a && track) saveSessionTime(track.id, a.currentTime);
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [track]);

  // OS-level media keys / lockscreen controls — free via the native API.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      // The lockscreen renders big — feed it the 600px cover, not the thumb.
      artwork: (() => {
        const art = track.artworkLarge ?? track.artwork;
        return art ? [{ src: art, sizes: "600x600" }] : [];
      })(),
    });
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
    navigator.mediaSession.setActionHandler("previoustrack", prev);
    navigator.mediaSession.setActionHandler("nexttrack", next);
    // Lockscreen scrubbing; setPositionState in onTimeUpdate feeds it the position.
    const jump = (t: number) => {
      const a = audioRef.current;
      if (!a) return;
      a.currentTime = Math.min(Math.max(t, 0), a.duration || Infinity);
      setTime(a.currentTime);
    };
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) jump(d.seekTime);
    });
    navigator.mediaSession.setActionHandler("seekbackward", (d) =>
      jump((audioRef.current?.currentTime ?? 0) - (d.seekOffset ?? 10)),
    );
    navigator.mediaSession.setActionHandler("seekforward", (d) =>
      jump((audioRef.current?.currentTime ?? 0) + (d.seekOffset ?? 10)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, index, queue, shuffle, repeat]);

  useEffect(
    () => () =>
      void (objectUrl.current && URL.revokeObjectURL(objectUrl.current)),
    [],
  );

  // The bindings YouTube, Spotify and Apple Music agree on, and YouTube's where
  // they differ — see lib/shortcuts.ts for the list this implements. They work
  // wherever a track is loaded, not only in the full view, and in the mini player.
  //
  // The full view is deliberately not the Fullscreen API: it fills the page, it
  // does not take over the browser chrome, so Escape is handled here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Never steal a keystroke aimed at a field, or one the browser owns.
      if (el?.isContentEditable) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "")) return;
      // A modal sheet over the player owns its own keys (Escape closes it, not the view).
      if (el?.closest("dialog[open]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const a = audioRef.current;
      const span = a?.duration || track?.duration || 0;
      const to = (t: number) => {
        if (!a || !span) return;
        a.currentTime = Math.min(Math.max(t, 0), span);
        setTime(a.currentTime);
      };
      const nudgeVolume = (d: number) => {
        setMuted(false);
        setVolume((v) => Math.min(Math.max(v + d, 0), 1));
      };

      // Digits jump to that tenth of the track, the way every video player does.
      const digit = /^Digit(\d)$/.exec(e.code);
      if (digit && !e.shiftKey) {
        e.preventDefault();
        return to((Number(digit[1]) / 10) * span);
      }

      switch (e.code) {
        case "Escape":
          if (el?.ownerDocument === mini.window?.document) return mini.close();
          if (full && lyricsOn) return setShowLyrics(false);
          return setFull(false);
        case "KeyY":
          e.preventDefault();
          if (lyricsless)
            return void toast("No lyrics for this song", { id: "lyrics" });
          if (!full) {
            openFull(false);
            return setShowLyrics(true);
          }
          return setShowLyrics(!lyricsOn);
        case "Space":
        case "KeyK":
          e.preventDefault();
          return setPlaying(!playing);
        case "KeyI":
          e.preventDefault();
          if (!mini.supported)
            return void toast("This browser can't open the mini player", {
              id: "mini",
            });
          return mini.toggle();
        case "KeyF":
          e.preventDefault();
          return full ? setFull(false) : openFull(false);
        case "KeyQ":
          e.preventDefault();
          if (full) return setShowQueue(!showQueue);
          setShowQueue(true);
          return setFull(true);
        case "KeyN":
          if (!e.shiftKey) return;
          e.preventDefault();
          return next();
        case "KeyP":
          if (!e.shiftKey) return;
          e.preventDefault();
          return prev();
        case "KeyJ":
          e.preventDefault();
          return to((a?.currentTime ?? 0) - 10);
        case "KeyL":
          e.preventDefault();
          return to((a?.currentTime ?? 0) + 10);
        case "ArrowLeft":
          e.preventDefault();
          return to((a?.currentTime ?? 0) - 5);
        case "ArrowRight":
          e.preventDefault();
          return to((a?.currentTime ?? 0) + 5);
        case "ArrowUp":
          e.preventDefault();
          return nudgeVolume(0.05);
        case "ArrowDown":
          e.preventDefault();
          return nudgeVolume(-0.05);
        case "KeyM":
          e.preventDefault();
          return setMuted((m) => !m);
        case "KeyS":
          e.preventDefault();
          return toggleShuffle();
        case "KeyR":
          e.preventDefault();
          return toggleRepeat();
        case "Home":
          e.preventDefault();
          return to(0);
        case "End":
          e.preventDefault();
          return to(span);
      }
    };
    window.addEventListener("keydown", onKey);
    // The mini player is its own window, so it needs its own listener.
    const pip = mini.window;
    pip?.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      pip?.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mini.window,
    mini.isOpen,
    full,
    showQueue,
    showLyrics,
    lyricsOn,
    lyricsless,
    playing,
    shuffle,
    repeat,
    track,
    index,
    queue,
  ]);

  // The page behind must not scroll while the overlay covers it.
  useEffect(() => {
    if (!full) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => void (document.body.style.overflow = prevOverflow);
  }, [full]);

  if (!track) return null;

  return (
    <>
      {/* Stays mounted across the view switch — remounting it would restart the track. */}
      <audio
        ref={audioRef}
        // Without CORS mode Web Audio outputs silence; every source here allows
        // it (same-origin /songs, blob: imports, Deezer's CDN sends ACAO *).
        crossOrigin="anonymous"
        preload="auto"
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setTime(a.currentTime);
          // Checkpoint the position every few seconds; pagehide catches the rest.
          if (Math.abs(a.currentTime - lastSaved.current) > 5) {
            lastSaved.current = a.currentTime;
            saveSessionTime(track.id, a.currentTime);
          }
          if ("mediaSession" in navigator && isFinite(a.duration))
            navigator.mediaSession.setPositionState({
              duration: a.duration,
              position: Math.min(a.currentTime, a.duration),
              playbackRate: a.playbackRate,
            });
        }}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBuffered(b.end(b.length - 1));
        }}
        onEnded={next}
        onError={() => fail("Playback failed.")}
      />

      {mini.portal}

      {full && (
        <FullView
          track={track}
          queue={queue}
          path={path}
          index={index}
          setIndex={(i) => go(i)}
          loading={loading}
          time={time}
          dur={seekMax}
          buffered={buffered}
          onSeek={seek}
          playing={playing}
          setPlaying={setPlaying}
          next={next}
          prev={prev}
          shuffle={shuffle}
          toggleShuffle={toggleShuffle}
          repeat={repeat}
          toggleRepeat={toggleRepeat}
          volume={volume}
          setVolume={setVolume}
          muted={muted}
          setMuted={setMuted}
          showQueue={showQueue}
          setShowQueue={setShowQueue}
          showLyrics={lyricsOn}
          lyricsless={lyricsless}
          lyricsChecking={lyricsChecking}
          toggleLyrics={toggleLyrics}
          audio={audioRef}
          analyser={graph}
          error={error}
          onAddTo={() => onAddTo(track)}
          queuePos={here + 1}
          queueLen={queue.length}
          onGoTo={(kind, name) => {
            setFull(false);
            onGoTo(kind, name);
          }}
          onClose={() => setFull(false)}
          onMini={mini.supported ? mini.toggle : undefined}
          mini={mini.isOpen}
        />
      )}

      <div
        className={`fixed inset-x-0 bottom-14 z-40 px-4 pb-3 sm:bottom-0 sm:pb-4 ${
          full ? "hidden" : ""
        }`}
      >
        {/* A floating capsule rather than an edge-to-edge slab: the functional
            layer sits above the content, it is not welded to the screen.
            70rem = the main column's max-w-6xl minus its px-4, so the capsule's
            edges line up with the content above it. */}
        {/* Clipped per layer, not on the capsule, so the volume popover can rise above it. */}
        <div className="glass relative mx-auto max-w-[70rem] rounded-sheet shadow-2xl shadow-black/50 ring-1 ring-white/10">
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-sheet">
            {/* Glass has no colour of its own — it takes it from what is behind.
                Nothing is behind a bar at the screen edge, so the artwork stands in
                and the capsule reads in the album's colour (HIG — Liquid Glass). */}
            {track.artwork && (
              <img
                src={track.artwork}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-150 object-cover opacity-35 blur-2xl saturate-150"
              />
            )}
            {/* The rim light that gives the material its thickness. */}
            <span className="absolute inset-x-0 top-0 h-px bg-white/20" />
          </div>

          <div className="relative flex items-center gap-3 p-2 sm:gap-4 sm:p-3">
            <button
              onClick={() => openFull(true)}
              aria-label="Play fullscreen"
              title="Play fullscreen"
              className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-[10px] shadow-lg shadow-black/40 ring-1 ring-white/10 sm:h-14 sm:w-14"
            >
              {track.artwork ? (
                <img
                  src={track.artwork}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-fill text-label-3">
                  <TbMusic size={22} />
                </div>
              )}
              <span className="absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 transition group-hover:opacity-100">
                <TbArrowsMaximize size={20} />
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <button
                onClick={() => openFull(true)}
                title={`${track.title} — ${track.artist}`}
                aria-label="Open the full player"
                className="block w-full min-w-0 text-left"
              >
                <span className="block truncate text-xs font-medium sm:text-sm">
                  {track.title}
                </span>
                <span className="block truncate text-xxs text-label-2 sm:text-xs">
                  {track.artist}
                  {isPreview(track) ? " · 30s preview" : ""}
                </span>
              </button>
              {error && (
                <div className="truncate text-xs text-accent">{error}</div>
              )}

              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[8px] sm:text-xxs tabular-nums text-label-3">
                  {fmtTime(time)}
                </span>
                <Seek
                  time={time}
                  dur={seekMax}
                  buffered={buffered}
                  onSeek={seek}
                  className="flex-1"
                />
                <span className="text-[8px] sm:text-xxs tabular-nums text-label-3">
                  {fmtTime(seekMax)}
                </span>
              </div>
            </div>

            <div className="flex items-center">
              <div className="flex items-center gap-1">
                <span className="hidden sm:block">
                  <Btn onClick={toggleShuffle} active={shuffle} label="Shuffle">
                    <TbArrowsShuffle />
                  </Btn>
                </span>
                <Btn onClick={prev} label="Previous">
                  <TbPlayerTrackPrevFilled />
                </Btn>
                <button
                  onClick={() => setPlaying(!playing)}
                  aria-label={playing ? "Pause" : "Play"}
                  title={playing ? "Pause" : "Play"}
                  className="group grid h-10 w-10 place-items-center rounded-full bg-label text-canvas transition hover:scale-105 active:scale-95"
                >
                  {playing ? (
                    <span className="morph-out">
                      <Logo
                        size={20}
                        live
                        art={track.artwork}
                        tone={markTone(artLum)}
                        className="live-mark"
                      />
                    </span>
                  ) : (
                    <TbPlayerPlayFilled size={18} />
                  )}
                </button>
                <Btn onClick={next} label="Next">
                  <TbPlayerTrackNextFilled />
                </Btn>
                <span className="hidden sm:block">
                  <Btn onClick={toggleRepeat} active={repeat} label="Repeat">
                    <TbRepeat />
                  </Btn>
                </span>
              </div>
              <span
                aria-hidden
                className="mx-2 hidden h-5 w-px bg-separator sm:block"
              />
              <div className="hidden items-center gap-1 sm:flex">
                <Volume
                  volume={volume}
                  setVolume={setVolume}
                  muted={muted}
                  setMuted={setMuted}
                  iconSize={14}
                  overContent
                />
                {mini.supported && (
                  <Btn
                    onClick={mini.toggle}
                    active={mini.isOpen}
                    label="Mini player (I)"
                  >
                    <TbPictureInPicture />
                  </Btn>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** Timeline that shows the time under the pointer while hovering. */
function Seek({
  time,
  dur,
  buffered,
  onSeek,
  light,
  className = "",
}: {
  time: number;
  dur: number;
  buffered: number;
  onSeek: (t: number) => void;
  light?: boolean;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className={`relative flex ${className}`}>
      {hover !== null && dur > 0 && (
        <span
          className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-md bg-black/80 px-1.5 py-0.5 text-xxs tabular-nums text-white"
          style={{ left: `${hover * 100}%` }}
        >
          {fmtTime(hover * dur)}
        </span>
      )}
      <input
        type="range"
        min={0}
        max={dur}
        value={time}
        step={0.1}
        onChange={(e) => onSeek(Number(e.target.value))}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1));
        }}
        onPointerLeave={() => setHover(null)}
        className={`range w-full ${light ? "range-light" : ""}`}
        style={filled(time, dur, buffered)}
        aria-label="Seek"
      />
    </div>
  );
}

/** Mute button that opens a vertical volume slider on hover or focus. */
function Volume({
  volume,
  setVolume,
  muted,
  setMuted,
  iconSize = 20,
  overContent,
}: {
  volume: number;
  setVolume: (v: number) => void;
  muted: boolean;
  setMuted: (m: boolean) => void;
  iconSize?: number;
  /** Rises clear of the bottom bar, in the opaque popover material. */
  overContent?: boolean;
}) {
  const level = muted ? 0 : volume;
  return (
    <div
      className="group relative"
      onWheel={(e) => {
        setMuted(false);
        setVolume(Math.min(Math.max(level - Math.sign(e.deltaY) * 0.05, 0), 1));
      }}
    >
      <Btn
        onClick={() => setMuted(!muted)}
        active={muted}
        label={muted ? "Unmute (M)" : "Mute (M)"}
      >
        {muted || volume === 0 ? (
          <TbVolumeOff size={iconSize} />
        ) : (
          <TbVolume size={iconSize} />
        )}
      </Btn>
      <div
        className={`invisible absolute bottom-full left-1/2 -translate-x-1/2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${overContent ? "pb-9" : "pb-2"}`}
      >
        <div
          className={`relative h-32 w-9 rounded-full ring-1 ring-white/10 ${overContent ? "glass-thick shadow-2xl shadow-black/50" : "bg-black/60 backdrop-blur-xl"}`}
        >
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setMuted(false);
              setVolume(Number(e.target.value));
            }}
            className="range range-light absolute left-1/2 top-1/2 w-24 -translate-x-1/2 -translate-y-1/2 -rotate-90"
            style={filled(muted ? 0 : volume, 1)}
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
}

/** One line; when it doesn't fit it loops leftwards, a copy trailing a gap behind, the way Apple Music and Spotify scroll a long title. */
function Marquee({ text }: { text: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement;
    const measure = () =>
      setWidth(first.offsetWidth > el.clientWidth ? first.offsetWidth : 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  const gap = 40;
  const dist = width + gap;
  return (
    <span
      ref={box}
      title={text}
      data-overflow={width > 0 || undefined}
      className="marquee"
      style={
        {
          "--gap": `${gap}px`,
          "--shift": `-${dist}px`,
          // 30px/s while moving, which is the last 80% of each cycle.
          "--marquee-time": `${dist / 30 / 0.8}s`,
        } as CSSProperties
      }
    >
      <span>{text}</span>
      {width > 0 && <span aria-hidden>{text}</span>}
    </span>
  );
}

/** The ⋯ menu beside the title: what you can do with this song, and the details the stage leaves out. */
function TrackMenu({
  track,
  dur,
  queuePos,
  queueLen,
  onAddTo,
  onGoTo,
}: {
  track: Track;
  dur: number;
  queuePos: number;
  queueLen: number;
  onAddTo: () => void;
  onGoTo: (kind: "artist" | "album", name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Opens toward whichever half of the screen has more room, capped to fit it.
  const [room, setRoom] = useState({ up: false, max: 0 });
  const [pickArtist, setPickArtist] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture, and stop it there, so Escape shuts the menu rather than the full view.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    let gone = false;
    getLyrics(track)
      .then((l) => {
        if (gone) return;
        setLyrics(
          !l
            ? "No lyrics"
            : "lines" in l
              ? track.words
                ? "Word-synced lyrics"
                : "Synced lyrics"
              : "Lyrics",
        );
      })
      .catch(() => {});
    return () => {
      gone = true;
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, track]);

  /** #s= is a song link: it opens this one song in the player, not a playlist. */
  const link = async () =>
    `${location.origin}${location.pathname}#s=${await encodePlaylist(track.title, [track])}`;
  const label = `${track.title} — ${track.artist}`;
  const refused = () =>
    toast.warning("This song can't be shared", {
      description: "Imported files stay on the device that imported them.",
    });

  const share = async () => {
    if (track.local) return refused();
    try {
      const url = await link();
      if (navigator.share) return await navigator.share({ title: label, url });
      await navigator.clipboard.writeText(url);
      toast.success("Song link copied", { description: label });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      toast.error("Could not share the song", { description: label });
    }
  };

  const copy = async () => {
    if (track.local) return refused();
    try {
      await navigator.clipboard.writeText(await link());
      toast.success("Song link copied", { description: label });
    } catch {
      toast.error("Could not copy the link", {
        description: "Clipboard access was refused.",
      });
    }
  };

  const chips = [
    fmtTime(dur),
    isPreview(track)
      ? "30s preview"
      : track.local
        ? "On this device"
        : "Full track",
    lyrics,
    queueLen > 1 && `${queuePos} of ${queueLen} in queue`,
    track.folder,
  ].filter((c): c is string => !!c);
  const artists = artistsOf(track.artist);

  const item = (
    icon: React.ReactNode,
    label: string,
    run: () => void,
    aside?: string,
  ) => (
    <button
      key={label + (aside ?? "")}
      role="menuitem"
      onClick={() => {
        setOpen(false);
        run();
      }}
      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-white/10"
    >
      <span className="shrink-0 text-white/70">{icon}</span>
      <span className="min-w-0">
        {label}
        {aside && (
          <span className="block break-words text-xs text-white/50">
            {aside}
          </span>
        )}
      </span>
    </button>
  );
  const rule = <div className="mx-2.5 my-1 h-px bg-white/10" />;

  return (
    <div ref={box} className="relative shrink-0">
      <button
        onClick={() => {
          const r = box.current!.getBoundingClientRect();
          const below = innerHeight - r.bottom;
          const up = r.top > below;
          setRoom({ up, max: (up ? r.top : below) - 16 });
          setPickArtist(false);
          setOpen(!open);
        }}
        aria-label="More"
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-full bg-white/15 backdrop-blur-xl transition hover:bg-white/25 active:scale-95"
      >
        <TbDots size={20} />
      </button>
      {open && (
        <div
          role="menu"
          style={{ maxHeight: room.max }}
          className={`absolute right-0 z-30 w-72 overflow-y-auto overscroll-contain rounded-2xl ${room.up ? "bottom-full mb-2" : "top-full mt-2"} bg-black/75 text-left shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl`}
        >
          <div className="flex flex-wrap gap-1.5 border-b border-white/10 px-4 py-3">
            {chips.map((c) => (
              <span
                key={c}
                className="max-w-full break-words rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white/80"
              >
                {c}
              </span>
            ))}
          </div>
          <div className="p-1.5">
            {item(<TbPlaylistAdd size={18} />, "Add to a Playlist…", onAddTo)}
            {rule}
            {item(<TbShare3 size={18} />, "Share Song…", share)}
            {item(<TbLink size={18} />, "Copy Song Link", copy)}
            {rule}
            {track.album &&
              item(
                <TbDisc size={18} />,
                "Go to Album",
                () => onGoTo("album", track.album),
                track.album,
              )}
            {artists.length === 1 ? (
              item(
                <TbUser size={18} />,
                "Go to Artist",
                () => onGoTo("artist", artists[0]),
                artists[0],
              )
            ) : (
              <>
                <button
                  role="menuitem"
                  aria-expanded={pickArtist}
                  onClick={() => setPickArtist(!pickArtist)}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-white/10"
                >
                  <span className="shrink-0 text-white/70">
                    <TbUser size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    Go to Artist
                    <span className="block text-xs text-white/50">
                      {artists.length} artists
                    </span>
                  </span>
                  <TbChevronDown
                    size={16}
                    className={`shrink-0 text-white/50 transition ${pickArtist ? "rotate-180" : ""}`}
                  />
                </button>
                {pickArtist &&
                  artists.map((name) => (
                    <button
                      key={name}
                      role="menuitem"
                      onClick={() => {
                        setOpen(false);
                        onGoTo("artist", name);
                      }}
                      className="block w-full break-words rounded-lg py-1.5 pl-[2.625rem] pr-2.5 text-left text-sm text-white/85 transition hover:bg-white/10"
                    >
                      {name}
                    </button>
                  ))}
              </>
            )}
            {track.appleUrl && (
              <>
                {rule}
                {item(
                  <TbExternalLink size={18} />,
                  "Listen on Apple Music",
                  () =>
                    window.open(
                      track.appleUrl,
                      "_blank",
                      "noopener,noreferrer",
                    ),
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Fills the page (not the browser) — the cover blurred behind itself, queue on the left. */
function FullView({
  track,
  queue,
  path,
  index,
  setIndex,
  loading,
  time,
  dur,
  buffered,
  onSeek,
  playing,
  setPlaying,
  next,
  prev,
  shuffle,
  toggleShuffle,
  repeat,
  toggleRepeat,
  volume,
  setVolume,
  muted,
  setMuted,
  showQueue,
  setShowQueue,
  showLyrics,
  lyricsless,
  lyricsChecking,
  toggleLyrics,
  audio,
  analyser,
  error,
  onAddTo,
  queuePos,
  queueLen,
  onGoTo,
  onClose,
  onMini,
  mini,
}: {
  track: Track;
  queue: Track[];
  path: number[];
  index: number;
  setIndex: (i: number) => void;
  loading: boolean;
  time: number;
  dur: number;
  buffered: number;
  onSeek: (t: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  next: () => void;
  prev: () => void;
  shuffle: boolean;
  toggleShuffle: () => void;
  repeat: boolean;
  toggleRepeat: () => void;
  volume: number;
  setVolume: (v: number) => void;
  muted: boolean;
  setMuted: (m: boolean) => void;
  showQueue: boolean;
  setShowQueue: (s: boolean) => void;
  showLyrics: boolean;
  lyricsless: boolean;
  lyricsChecking: boolean;
  toggleLyrics: () => void;
  audio: RefObject<HTMLAudioElement | null>;
  analyser: RefObject<{ an: AnalyserNode } | null>;
  error: string | null;
  onAddTo: () => void;
  queuePos: number;
  queueLen: number;
  onGoTo: (kind: "artist" | "album", name: string) => void;
  onClose: () => void;
  onMini?: () => void;
  mini: boolean;
}) {
  const art = track.artworkLarge ?? track.artwork;
  const { lum, hue } = useArtTone(art);
  const [remaining, setRemaining] = useState(false);
  const swipe = useRef<{
    x: number;
    y: number;
    top: boolean;
    cover: boolean;
  } | null>(null);
  const dim = Math.min(backdropDim(lum) + (showLyrics ? 0.2 : 0), 0.85);

  // Scrolls only the list; scrollIntoView would also nudge the fixed overlay.
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = list.current;
    let live = true;
    let raf = 0;
    // Any hand on the list takes over from the glide.
    const stop = () => {
      live = false;
      cancelAnimationFrame(raf);
    };
    const hands = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    hands.forEach((e) => ol?.addEventListener(e, stop, { passive: true }));
    trackFade.then(() => {
      const li = ol?.querySelector<HTMLElement>("[aria-current=true]");
      if (!live || !ol || !li) return;
      const at =
        li.getBoundingClientRect().top - ol.getBoundingClientRect().top;
      // Still above the 75% line: leave it be, so rapid skips don't churn the list.
      if (at >= 0 && at + li.offsetHeight / 2 <= ol.clientHeight * 0.75) return;
      const from = ol.scrollTop;
      const to = Math.max(
        0,
        Math.min(
          ol.scrollHeight - ol.clientHeight,
          from + at - ol.clientHeight * 0.25 + li.offsetHeight / 2,
        ),
      );
      const dist = to - from;
      if (Math.abs(dist) < 1) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches)
        return void (ol.scrollTop = to);
      const dur = Math.min(900, 450 + Math.abs(dist) / 3);
      let start = 0;
      const tick = (now: number) => {
        start ||= now;
        const p = Math.min((now - start) / dur, 1);
        const ease = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
        ol.scrollTop = from + dist * ease;
        if (p < 1 && live) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    return () => {
      stop();
      hands.forEach((e) => ol?.removeEventListener(e, stop));
    };
  }, [index, path, showQueue]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-canvas text-white">
      {/* The Clear variant floats over media; artwork can be bright, so it gets a
          dimming layer to keep the controls legible (HIG — Liquid Glass > Clear). */}
      <Backdrop art={art} playing={playing} dim={dim} />
      <Horizon
        key={track.id}
        track={track}
        playing={playing}
        hue={hue}
        analyser={analyser}
        audio={audio}
      />

      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-5 top-5 z-20 grid h-8 w-8 place-items-center rounded-full bg-white/15 backdrop-blur-xl transition hover:bg-white/25 active:scale-95"
      >
        <TbX size={16} />
      </button>
      <div className="relative z-10 flex h-full">
        <aside
          // Off-screen, it is out of the tab order and out of the accessibility tree.
          inert={!showQueue}
          className={`absolute inset-y-0 left-0 z-20 flex w-[min(20rem,85vw)] shrink-0 flex-col border-r border-white/10 bg-black/55 backdrop-blur-2xl transition-transform duration-300 ease-out lg:bg-black/30 ${
            showQueue ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <h3 className="px-5 py-6 text-xs font-semibold uppercase text-white/60 tracking-widest">
            Playing next · {queue.length} song{queue.length === 1 ? "" : "s"}
          </h3>
          <ol
            ref={list}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6"
          >
            {path.map((i, pos) => {
              const t = queue[i];
              const current = i === index;
              return (
                <li key={`${t.id}-${i}`}>
                  <button
                    onClick={() =>
                      current ? setPlaying(!playing) : setIndex(i)
                    }
                    aria-current={current}
                    title={`${t.title} — ${t.artist}`}
                    className={`group flex w-full items-center gap-2 pl-3 pr-4 py-2 text-left transition hover:bg-white/10 ${
                      current
                        ? "bg-white/15"
                        : pos < queuePos - 1
                          ? "opacity-50"
                          : ""
                    }`}
                  >
                    <span className="grid w-4 shrink-0 place-items-center text-[10px] tabular-nums text-white/60">
                      {current ? (
                        playing ? (
                          <span className="morph-out text-accent">
                            <Logo size={14} className="spin-mark" />
                          </span>
                        ) : (
                          <TbPlayerPlayFilled className="text-accent" />
                        )
                      ) : (
                        pos + 1
                      )}
                    </span>
                    {t.artwork ? (
                      <Image
                        width={36}
                        height={36}
                        src={t.artwork}
                        alt={`${t.album || t.title} cover`}
                        className="shrink-0 rounded-[6px] object-cover"
                      />
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[6px] bg-white/10 text-white/50">
                        <TbMusic size={16} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-xs ${current ? "font-semibold" : ""}`}
                      >
                        {t.title}
                      </span>
                      <span className="block truncate text-[11px] text-white/60">
                        {t.artist}
                      </span>
                    </span>
                    <span className="shrink-0 text-xxs tabular-nums text-white/50">
                      {fmtTime(t.duration)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* Rides the drawer's trailing edge when there is one to ride — half over
            the queue, half over the artwork — and tucks whole against the screen
            edge when the drawer is away. calc() offsets by the drawer's width less
            half the handle's own, which is what centres it on the seam. */}
        <button
          onClick={() => setShowQueue(!showQueue)}
          aria-label={showQueue ? "Hide queue (Q)" : "Show queue (Q)"}
          aria-expanded={showQueue}
          title={showQueue ? "Hide queue (Q)" : "Show queue (Q)"}
          className={`absolute left-0 top-5 z-30 grid h-8 w-8 place-items-center rounded-full bg-white/15 backdrop-blur-xl transition-transform duration-300 ease-out hover:bg-white/25 ${
            showQueue
              ? "translate-x-[calc(min(20rem,85vw)-50%)]"
              : "translate-x-5"
          }`}
        >
          {showQueue ? <TbChevronLeft size={16} /> : <TbPlaylist size={16} />}
        </button>

        <div
          onTouchStart={(e) => {
            const t = e.touches[0];
            const el = e.target as HTMLElement;
            // Not a scrub, a lyrics scroll or a menu. Down closes only from the
            // top of the page; sideways skips only on the cover.
            swipe.current = el.closest("input, .stage-lyrics, [role=menu]")
              ? null
              : {
                  x: t.clientX,
                  y: t.clientY,
                  top: e.currentTarget.scrollTop <= 0,
                  cover: !!el.closest(".stage-art"),
                };
          }}
          onTouchEnd={(e) => {
            const s = swipe.current;
            swipe.current = null;
            if (!s) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - s.x;
            const dy = t.clientY - s.y;
            if (s.top && dy > 100 && dy > Math.abs(dx) * 2) return onClose();
            if (
              s.cover &&
              Math.abs(dx) > 60 &&
              Math.abs(dx) > Math.abs(dy) * 1.5
            )
              return dx < 0 ? next() : prev();
          }}
          className={`flex min-w-0 flex-1 flex-col items-center px-4 transition-transform duration-300 ease-out sm:px-6 sm:pb-24 sm:pt-16 ${
            // Lyrics push the controls to the foot; this keeps them above the horizon.
            showLyrics
              ? "overflow-hidden pb-14 pt-16"
              : "overflow-y-auto pb-10 pt-10"
          } ${showQueue ? "lg:translate-x-40" : "translate-x-0"}`}
        >
          <div
            className="stage"
            data-lyrics={showLyrics || undefined}
            data-paused={!playing || undefined}
          >
            <div className="stage-id">
              {art ? (
                <img
                  src={art}
                  alt={`${track.album || track.title} cover`}
                  className="stage-art aspect-square shrink-0 object-cover shadow-2xl shadow-black/70 ring-1 ring-white/10"
                />
              ) : (
                <div className="stage-art grid aspect-square shrink-0 place-items-center bg-white/10 text-white/40 ring-1 ring-white/10">
                  <TbMusic className="h-2/5 w-2/5" />
                </div>
              )}

              <div className="stage-meta">
                <div className="min-w-0 flex-1">
                  <h2 className="stage-title">
                    <Marquee text={track.title} />
                  </h2>
                  <p className="mt-0.5 text-sm text-white/75">
                    <Marquee text={`${track.artist} - ${track.album}`} />
                  </p>
                  {loading && (
                    <p className="stage-aside mt-1 text-xs text-white/75">
                      Loading…
                    </p>
                  )}
                  {error && <p className="mt-1 text-sm text-accent">{error}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {onMini && (
                    <button
                      onClick={onMini}
                      aria-label="Mini player (I)"
                      aria-pressed={mini}
                      title="Mini player (I)"
                      className={`grid h-9 w-9 place-items-center rounded-full backdrop-blur-xl transition hover:bg-white/25 active:scale-95 ${
                        mini ? "bg-white/30" : "bg-white/15"
                      }`}
                    >
                      <TbPictureInPicture size={18} />
                    </button>
                  )}
                  <TrackMenu
                    track={track}
                    dur={dur}
                    queuePos={queuePos}
                    queueLen={queueLen}
                    onAddTo={onAddTo}
                    onGoTo={onGoTo}
                  />
                </div>
              </div>
            </div>

            {showLyrics && (
              <LyricsPanel key={track.id} track={track} audio={audio} />
            )}

            <div className="stage-ctl">
              <div className="mt-5 flex w-full items-center gap-3">
                <span className="text-right text-xs tabular-nums text-white/80">
                  {fmtTime(time)}
                </span>
                <Seek
                  time={time}
                  dur={dur}
                  buffered={buffered}
                  onSeek={onSeek}
                  light
                  className="flex-1"
                />
                <button
                  onClick={() => setRemaining(!remaining)}
                  title={remaining ? "Show duration" : "Show time remaining"}
                  className="text-xs tabular-nums text-white/80 transition hover:text-white"
                >
                  {remaining
                    ? `-${fmtTime(Math.max(dur - time, 0))}`
                    : fmtTime(dur)}
                </button>
              </div>

              <div className="mt-5 flex w-full items-center justify-between">
                <Btn
                  onClick={toggleLyrics}
                  active={showLyrics}
                  label="Lyrics"
                  unavailable={lyricsless && "No lyrics for this song"}
                  busy={lyricsChecking && "Looking for lyrics…"}
                >
                  <TbMicrophone2 size={20} />
                </Btn>
                <div className="flex items-center gap-2 sm:gap-5">
                  <Btn onClick={toggleShuffle} active={shuffle} label="Shuffle">
                    <TbArrowsShuffle size={20} />
                  </Btn>
                  <Btn onClick={prev} label="Previous">
                    <TbPlayerTrackPrevFilled size={20} />
                  </Btn>
                  <button
                    onClick={() => setPlaying(!playing)}
                    aria-label={playing ? "Pause" : "Play"}
                    title={playing ? "Pause" : "Play"}
                    className="group grid h-16 w-16 place-items-center rounded-full bg-white text-black shadow-lg shadow-black/30 transition hover:scale-105 active:scale-95"
                  >
                    {playing ? (
                      <span className="morph-out">
                        <Logo
                          size={32}
                          live
                          art={art}
                          tone={markTone(lum)}
                          className="live-mark"
                        />
                      </span>
                    ) : (
                      <TbPlayerPlayFilled size={26} />
                    )}
                  </button>
                  <Btn onClick={next} label="Next">
                    <TbPlayerTrackNextFilled size={20} />
                  </Btn>
                  <Btn onClick={toggleRepeat} active={repeat} label="Repeat">
                    <TbRepeat size={20} />
                  </Btn>
                </div>
                <Volume
                  volume={volume}
                  setVolume={setVolume}
                  muted={muted}
                  setMuted={setMuted}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
