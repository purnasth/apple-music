"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  TbMusic,
  TbPlayerPlayFilled,
  TbPlayerTrackNextFilled,
  TbPlayerTrackPrevFilled,
} from "react-icons/tb";
import { Logo } from "@/components/Logo";
import Horizon from "@/components/Horizon";
import { Backdrop, Btn, useArtTone } from "@/components/PlayerKit";
import { Track, fmtTime } from "@/lib/music";
import { backdropDim, markTone } from "@/lib/tone";
import { toast } from "@/lib/toast";
import {
  MiniFrame,
  VideoMini,
  createVideoMini,
  videoMiniSupported,
} from "@/lib/videoMini";

type PipApi = {
  window: Window | null;
  requestWindow(o: { width: number; height: number }): Promise<Window>;
};
/** Document Picture-in-Picture (Chromium, Firefox 151+); untyped in lib.dom. */
const pipApi = () =>
  typeof window === "undefined"
    ? undefined
    : (window as unknown as { documentPictureInPicture?: PipApi })
        .documentPictureInPicture;

// Chrome counts its ~56px title bar in the requested height: this opens 320×134.
const REQUEST = { width: 320, height: 190 };
/** Window sizes the interactive mini player snaps back into; the max is its default. */
const BOUNDS = { minW: 240, maxW: 320, minH: 64, maxH: 134 };
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

type Props = {
  track?: Track;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  time: number;
  dur: number;
  onSeek: (t: number) => void;
  next: () => void;
  prev: () => void;
  audio: RefObject<HTMLAudioElement | null>;
  analyser: RefObject<{ an: AnalyserNode } | null>;
};

/**
 * The floating mini player: the interactive widget in a Document PiP window
 * where the browser has one, otherwise the painted copy in lib/videoMini.
 * Render `portal`; `window` is the interactive one, for listeners that must
 * reach into it.
 */
export function useMiniPlayer(p: Props) {
  const [win, setWin] = useState<Window | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const video = useRef<VideoMini | null>(null);
  const frame = useRef<MiniFrame | null>(null);
  const hasTrack = !!p.track;
  const supported =
    typeof window !== "undefined" && (!!pipApi() || videoMiniSupported());
  const isOpen = !!win || videoOpen;

  const makeVideo = () =>
    createVideoMini(
      () => frame.current,
      p.setPlaying,
      () => setVideoOpen(false),
    );

  const openWindow = async (api: PipApi) => {
    const w = await api.requestWindow(REQUEST);
    for (const n of document.head.querySelectorAll(
      "style, link[rel=stylesheet]",
    )) {
      const c = n.cloneNode(true) as Element;
      // The PiP document is about:blank, so relative hrefs would not resolve.
      if (n instanceof HTMLLinkElement) c.setAttribute("href", n.href);
      w.document.head.append(c);
    }
    w.document.documentElement.className = document.documentElement.className;
    // A page cannot bound a PiP window, and resizing needs a user gesture in
    // it, so an out-of-range size snaps back on the next press inside.
    w.addEventListener(
      "pointerdown",
      () => {
        const width = clamp(w.innerWidth, BOUNDS.minW, BOUNDS.maxW);
        const height = clamp(w.innerHeight, BOUNDS.minH, BOUNDS.maxH);
        if (width !== w.innerWidth || height !== w.innerHeight)
          try {
            w.resizeBy(width - w.innerWidth, height - w.innerHeight);
          } catch {}
      },
      true,
    );
    w.addEventListener("pagehide", () => setWin(null));
    setWin(w);
  };

  // Everything up to the window request runs synchronously: Safari only floats
  // a video straight from the click.
  const openVideo = () => {
    if (!videoMiniSupported()) return Promise.resolve();
    video.current ??= makeVideo();
    return video.current.open().then(() => setVideoOpen(true));
  };

  const open = () => {
    const api = pipApi();
    const req = !api
      ? openVideo()
      : api.window
        ? Promise.resolve()
        : openWindow(api);
    req.catch((e) =>
      toast.error("Couldn't open the mini player", {
        id: "mini",
        description: e instanceof Error ? e.message : undefined,
      }),
    );
  };

  const close = () => {
    win?.close();
    if (videoOpen) video.current?.close();
  };

  const toggle = () => (isOpen ? close() : open());

  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
    if (p.track)
      frame.current = {
        id: p.track.id,
        title: p.track.title,
        artist: p.track.artist,
        art: p.track.artworkLarge ?? p.track.artwork,
        time: p.time,
        dur: p.dur,
        playing: p.playing,
      };
  });

  useEffect(() => () => win?.close(), [win]);

  useEffect(() => {
    if (videoOpen) video.current?.sync(p.playing);
  }, [p.playing, videoOpen]);

  // Built as soon as there is a song, so a click can float it straight away.
  useEffect(() => {
    if (hasTrack && !pipApi() && videoMiniSupported())
      video.current ??= makeVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTrack]);
  useEffect(() => () => video.current?.destroy(), []);

  // Lets Chrome open the mini player itself when the tab is left mid-song.
  useEffect(() => {
    if (!pipApi() || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler(
        "enterpictureinpicture" as MediaSessionAction,
        () => openRef.current(),
      );
    } catch {}
  }, []);

  const portal =
    win && p.track
      ? createPortal(
          <MiniPlayerView
            track={p.track}
            playing={p.playing}
            setPlaying={p.setPlaying}
            next={p.next}
            prev={p.prev}
            time={p.time}
            dur={p.dur}
            onSeek={p.onSeek}
            audio={p.audio}
            analyser={p.analyser}
          />,
          win.document.body,
        )
      : null;

  return { supported, isOpen, window: win, open, close, toggle, portal };
}

/** The interactive widget, rendered into the Document PiP window. */
function MiniPlayerView({
  track,
  playing,
  setPlaying,
  next,
  prev,
  time,
  dur,
  onSeek,
  audio,
  analyser,
}: {
  track: Track;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  next: () => void;
  prev: () => void;
  time: number;
  dur: number;
  onSeek: (t: number) => void;
  audio: RefObject<HTMLAudioElement | null>;
  analyser: RefObject<{ an: AnalyserNode } | null>;
}) {
  const art = track.artworkLarge ?? track.artwork;
  const { lum, hue } = useArtTone(art);
  const [hover, setHover] = useState<number | null>(null);
  const pct = dur > 0 ? (time / dur) * 100 : 0;
  const lo = Math.min(pct, hover ?? pct);
  const hi = Math.max(pct, hover ?? pct);

  return (
    <div className="relative h-screen overflow-hidden bg-canvas text-white">
      <Backdrop art={art} playing={playing} dim={backdropDim(lum)} />
      <div className="absolute inset-0 flex flex-col justify-center gap-2 p-3 [@media(max-height:71px)]:py-2">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[10px] [@media(max-height:71px)]:hidden [@media(max-width:269px)]:hidden shadow-lg shadow-black/40 ring-1 ring-white/10">
            {track.artwork ? (
              <img
                src={track.artwork}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-white/10 text-white/50">
                <TbMusic size={22} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{track.title}</div>
            <div className="truncate text-xs text-white/70">{track.artist}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Btn onClick={prev} label="Previous">
              <TbPlayerTrackPrevFilled />
            </Btn>
            <button
              onClick={() => setPlaying(!playing)}
              aria-label={playing ? "Pause" : "Play"}
              title={playing ? "Pause" : "Play"}
              className="group grid h-10 w-10 place-items-center rounded-full bg-white text-black shadow-lg shadow-black/30 transition hover:scale-105 active:scale-95"
            >
              {playing ? (
                <span className="morph-out">
                  <Logo
                    size={20}
                    live
                    art={track.artwork}
                    tone={markTone(lum)}
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
          </div>
        </div>
        <div className="flex max-h-16 min-h-10 flex-1 items-center gap-2 [@media(max-height:119px)]:hidden">
          <span className="text-xxs tabular-nums text-white/70 [@media(max-width:299px)]:hidden">
            {fmtTime(time)}
          </span>
          <div className="relative h-full flex-1">
            <div
              className="absolute inset-0"
              style={{
                maskImage: `linear-gradient(to right, #000 ${lo}%, rgb(0 0 0 / 0.75) ${lo}% ${hi}%, rgb(0 0 0 / 0.5) ${hi}%)`,
              }}
            >
              <Horizon
                key={track.id}
                track={track}
                playing={playing}
                hue={hue}
                analyser={analyser}
                audio={audio}
                compact
              />
            </div>
            {hover !== null && dur > 0 && (
              <span
                className="pointer-events-none absolute bottom-full -translate-x-1/2 rounded-md bg-black/80 px-1.5 py-0.5 text-xxs tabular-nums text-white"
                style={{ left: `${hover}%` }}
              >
                {fmtTime((hover / 100) * dur)}
              </span>
            )}
            <input
              type="range"
              min={0}
              max={dur || 0}
              step="any"
              value={Math.min(time, dur || 0)}
              onChange={(e) => onSeek(Number(e.target.value))}
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setHover(
                  Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) *
                    100,
                );
              }}
              onPointerLeave={() => setHover(null)}
              aria-label="Seek"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <span className="text-xxs tabular-nums text-white/70 [@media(max-width:299px)]:hidden">
            {fmtTime(dur)}
          </span>
        </div>
      </div>
    </div>
  );
}
