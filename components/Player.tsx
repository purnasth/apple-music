"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  TbArrowsMaximize,
  TbArrowsShuffle,
  TbChevronLeft,
  TbMusic,
  TbPlayerPauseFilled,
  TbPlayerPlayFilled,
  TbPlayerSkipBackFilled,
  TbPlayerSkipForwardFilled,
  TbPlaylist,
  TbRepeat,
  TbVolume,
  TbVolumeOff,
  TbX,
} from "react-icons/tb";
import { toast } from "@/lib/toast";
import {
  Track,
  audioSrc,
  fmtTime,
  getSession,
  isPreview,
  saveSession,
  saveSessionTime,
  shuffled,
} from "@/lib/music";
import Image from "next/image";

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
};

export default function Player({
  queue,
  index,
  setIndex,
  playing,
  setPlaying,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
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
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<number[] | null>(null);

  const track = queue[index];

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
  }, [index, order, queue]);

  /** Walk the play order, which is the shuffled one when shuffle is on. */
  const step = (delta: 1 | -1) => {
    if (!queue.length) return;
    const path = order ?? queue.map((_, i) => i);
    const at = Math.max(path.indexOf(index), 0) + delta;
    if (at >= path.length)
      return repeat ? setIndex(path[0]) : setPlaying(false);
    setIndex(path[at < 0 ? path.length - 1 : at]);
  };

  const next = () => step(1);

  const prev = () => {
    const a = audioRef.current;
    // Restart the track first, the way every player does, before stepping back.
    if (a && a.currentTime > 3) return void (a.currentTime = 0);
    step(-1);
  };

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

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

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
  // wherever a track is loaded, not only in the full view.
  //
  // The full view is deliberately not the Fullscreen API: it fills the page, it
  // does not take over the browser chrome, so Escape is handled here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Never steal a keystroke aimed at a field, or one the browser owns.
      if (el?.isContentEditable) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "")) return;
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
          return setFull(false);
        case "Space":
        case "KeyK":
          e.preventDefault();
          return setPlaying(!playing);
        // I is the plain full view; F drives towards the immersive one, dropping
        // the queue on the way and leaving altogether once there is nothing left
        // to drop.
        case "KeyI":
          e.preventDefault();
          return full ? setFull(false) : openFull(true);
        case "KeyF":
          e.preventDefault();
          if (!full) return openFull(false);
          if (showQueue) return setShowQueue(false);
          return setFull(false);
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
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, showQueue, playing, shuffle, repeat, track, index, queue]);

  // The page behind must not scroll while the overlay covers it.
  useEffect(() => {
    if (!full) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => void (document.body.style.overflow = prevOverflow);
  }, [full]);

  if (!track) return null;

  const seekMax = dur || track.duration || 0;
  const seek = (t: number) => {
    setTime(t);
    if (audioRef.current) audioRef.current.currentTime = t;
  };

  return (
    <>
      {/* Stays mounted across the view switch — remounting it would restart the track. */}
      <audio
        ref={audioRef}
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

      {full && (
        <FullView
          track={track}
          queue={queue}
          index={index}
          setIndex={setIndex}
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
          error={error}
          onClose={() => setFull(false)}
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
        <div className="glass relative mx-auto max-w-[70rem] overflow-hidden rounded-sheet shadow-2xl shadow-black/50 ring-1 ring-white/10">
          {/* Glass has no colour of its own — it takes it from what is behind.
              Nothing is behind a bar at the screen edge, so the artwork stands in
              and the capsule reads in the album's colour (HIG — Liquid Glass). */}
          {track.artwork && (
            <img
              src={track.artwork}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full scale-150 object-cover opacity-35 blur-2xl saturate-150"
            />
          )}
          {/* The rim light that gives the material its thickness. */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />

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
                <input
                  type="range"
                  min={0}
                  max={seekMax}
                  value={time}
                  step={0.1}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="range flex-1"
                  style={filled(time, seekMax, buffered)}
                  aria-label="Seek"
                />
                <span className="text-[8px] sm:text-xxs tabular-nums text-label-3">
                  {fmtTime(seekMax)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <span className="hidden sm:block">
                <Btn
                  onClick={toggleShuffle}
                  active={shuffle}
                  label="Shuffle"
                >
                  <TbArrowsShuffle />
                </Btn>
              </span>
              <Btn onClick={prev} label="Previous">
                <TbPlayerSkipBackFilled />
              </Btn>
              <button
                onClick={() => setPlaying(!playing)}
                aria-label={playing ? "Pause" : "Play"}
                title={playing ? "Pause" : "Play"}
                className="grid h-10 w-10 place-items-center rounded-full bg-label text-canvas transition hover:scale-105 active:scale-95"
              >
                {playing ? (
                  <TbPlayerPauseFilled size={18} />
                ) : (
                  <TbPlayerPlayFilled size={18} className="ml-0.5" />
                )}
              </button>
              <Btn onClick={next} label="Next">
                <TbPlayerSkipForwardFilled />
              </Btn>
              <span className="hidden sm:block">
                <Btn
                  onClick={toggleRepeat}
                  active={repeat}
                  label="Repeat"
                >
                  <TbRepeat />
                </Btn>
              </span>
              <span className="ml-2 hidden items-center gap-2 sm:flex">
                <button
                  onClick={() => setMuted(!muted)}
                  aria-label={muted ? "Unmute" : "Mute"}
                  title={muted ? "Unmute (M)" : "Mute (M)"}
                  aria-pressed={muted}
                  className="shrink-0 text-label-2 transition hover:text-label"
                >
                  {muted ? <TbVolumeOff size={16} /> : <TbVolume size={16} />}
                </button>
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
                  className="range w-20"
                  style={filled(muted ? 0 : volume, 1)}
                  aria-label="Volume"
                />
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Btn({
  onClick,
  children,
  active,
  label,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`grid h-8 w-8 place-items-center rounded-full text-sm transition hover:bg-fill active:scale-95 ${
        active ? "text-accent" : "text-label-2 hover:text-label"
      }`}
    >
      {children}
    </button>
  );
}

/** Fills the page (not the browser) — the cover blurred behind itself, queue on the left. */
function FullView({
  track,
  queue,
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
  error,
  onClose,
}: {
  track: Track;
  queue: Track[];
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
  error: string | null;
  onClose: () => void;
}) {
  const art = track.artworkLarge ?? track.artwork;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-canvas text-white">
      {/* The cover doubles as its own backdrop — the ambient wash with no colour API. */}
      {art && (
        <img
          src={art}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-3xl saturate-150"
        />
      )}
      {/* The Clear variant floats over media; artwork can be bright, so it gets a
          dimming layer to keep the controls legible (HIG — Liquid Glass > Clear). */}
      <div className="pointer-events-none absolute inset-0 bg-black/55" />

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
          <ol className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
            {queue.map((t, i) => {
              const current = i === index;
              return (
                <li key={`${t.id}-${i}`}>
                  <button
                    onClick={() => setIndex(i)}
                    aria-current={current}
                    title={`${t.title} — ${t.artist}`}
                    className={`flex w-full items-center gap-2 pl-3 pr-4 py-2 text-left transition hover:bg-white/10 ${
                      current ? "bg-white/15" : i < index ? "opacity-50" : ""
                    }`}
                  >
                    <span className="grid w-4 shrink-0 place-items-center text-[10px] tabular-nums text-white/60">
                      {current ? (
                        playing ? (
                          <TbPlayerPlayFilled className="text-accent" />
                        ) : (
                          <TbPlayerPauseFilled className="text-accent" />
                        )
                      ) : (
                        i + 1
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
          aria-label={showQueue ? "Hide queue" : "Show queue"}
          aria-expanded={showQueue}
          title={showQueue ? "Hide queue" : "Show queue"}
          className={`absolute left-0 top-5 z-30 grid h-8 w-8 place-items-center rounded-full bg-white/15 backdrop-blur-xl transition-transform duration-300 ease-out hover:bg-white/25 ${
            showQueue
              ? "translate-x-[calc(min(20rem,85vw)-50%)]"
              : "translate-x-5"
          }`}
        >
          {showQueue ? <TbChevronLeft size={16} /> : <TbPlaylist size={16} />}
        </button>

        <div
          className={`flex min-w-0 flex-1 flex-col items-center overflow-y-auto px-4 py-16 transition-transform duration-300 ease-out sm:px-6 ${
            showQueue ? "lg:translate-x-40" : "translate-x-0"
          }`}
        >
          <div className="my-auto flex w-full max-w-lg flex-col items-center">
            {art ? (
              <img
                src={art}
                alt={`${track.album || track.title} cover`}
                className="aspect-square w-[min(46vh,78vw)] rounded-sheet object-cover shadow-2xl shadow-black/70 ring-1 ring-white/10"
              />
            ) : (
              <div className="grid aspect-square w-[min(46vh,78vw)] place-items-center rounded-sheet bg-white/10 text-white/40 ring-1 ring-white/10">
                <TbMusic size={96} />
              </div>
            )}

            <div className="mt-6 w-full text-center">
              <h2 className="truncate text-2xl font-semibold tracking-tight">
                {track.title}
              </h2>
              <p className="mt-1 truncate text-sm text-white/70">
                {track.artist}
                {isPreview(track) ? " · 30s preview" : ""}
              </p>
              {track.album && (
                <p className="mt-0.5 truncate text-xs text-white/50">
                  {track.album}
                </p>
              )}
              {loading && (
                <p className="mt-2 text-xs text-white/60">Loading…</p>
              )}
              {error && <p className="mt-2 text-sm text-accent">{error}</p>}
            </div>

            <div className="mt-5 flex w-full items-center gap-3">
              <span className="w-10 text-right text-xs tabular-nums text-white/60">
                {fmtTime(time)}
              </span>
              <input
                type="range"
                min={0}
                max={dur}
                value={time}
                step={0.1}
                onChange={(e) => onSeek(Number(e.target.value))}
                className="range range-light flex-1"
                style={filled(time, dur, buffered)}
                aria-label="Seek"
              />
              <span className="w-10 text-xs tabular-nums text-white/60">
                {fmtTime(dur)}
              </span>
            </div>

            <div className="mt-5 flex items-center gap-5">
              <Btn
                onClick={toggleShuffle}
                active={shuffle}
                label="Shuffle"
              >
                <TbArrowsShuffle size={18} />
              </Btn>
              <Btn onClick={prev} label="Previous">
                <TbPlayerSkipBackFilled size={18} />
              </Btn>
              <button
                onClick={() => setPlaying(!playing)}
                aria-label={playing ? "Pause" : "Play"}
                title={playing ? "Pause" : "Play"}
                className="grid h-14 w-14 place-items-center rounded-full bg-white text-black shadow-lg shadow-black/30 transition hover:scale-105 active:scale-95"
              >
                {playing ? (
                  <TbPlayerPauseFilled size={22} />
                ) : (
                  <TbPlayerPlayFilled size={22} className="ml-1" />
                )}
              </button>
              <Btn onClick={next} label="Next">
                <TbPlayerSkipForwardFilled size={18} />
              </Btn>
              <Btn
                onClick={toggleRepeat}
                active={repeat}
                label="Repeat"
              >
                <TbRepeat size={18} />
              </Btn>
            </div>

            <span className="mt-6 hidden items-center gap-2 sm:flex">
              <button
                onClick={() => setMuted(!muted)}
                aria-label={muted ? "Unmute" : "Mute"}
                title={muted ? "Unmute (M)" : "Mute (M)"}
                aria-pressed={muted}
                className="shrink-0 text-white/60 transition hover:text-white"
              >
                {muted ? <TbVolumeOff size={16} /> : <TbVolume size={16} />}
              </button>
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
                className="range range-light w-40"
                style={filled(muted ? 0 : volume, 1)}
                aria-label="Volume"
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
