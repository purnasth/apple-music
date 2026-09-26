"use client";

import {
  CSSProperties,
  RefObject,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { TbCurrentLocation } from "react-icons/tb";
import type { Track } from "@/lib/music";
import { Line, Lyrics, getLyrics, lineAt, progress } from "@/lib/lyrics";

/** The eye reaches a line a beat before the voice does. */
const LEAD = 0.3;
/** How long a hand scroll suspends the follow before it picks the song back up. */
const HOLD_MS = 5000;

/**
 * The words, keeping time with the song.
 *
 * Timing runs on one requestAnimationFrame loop that reads the audio element
 * directly, not on React state: `timeupdate` fires about four times a second,
 * which is a quarter-second of lag on every line change and a re-render of the
 * whole list each tick. Here React renders only when the line changes, and the
 * sweep across the current line is a single CSS variable written onto that one
 * element — nothing else on the page restyles while a line fills.
 */
export default function LyricsPanel({
  track,
  audio,
}: {
  track: Track;
  audio: RefObject<HTMLAudioElement | null>;
}) {
  const [lyrics, setLyrics] = useState<Lyrics | null | undefined>();
  const [at, setAt] = useState(-1);
  /** Set while the listener scrolls for themselves; following waits for them. */
  const [held, setHeld] = useState(false);
  const view = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLButtonElement>(null);
  const release = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** The first placement is instant: the panel opens on the current line, it does not scroll there. */
  const placed = useRef(false);

  // Keyed on the track by the parent, so a new song arrives as a fresh panel.
  useEffect(() => {
    let gone = false;
    getLyrics(track)
      .then((l) => !gone && setLyrics(l))
      .catch(() => !gone && setLyrics(null));
    return () => void (gone = true);
  }, [track]);

  useEffect(() => () => clearTimeout(release.current), []);

  const lines: Line[] | undefined =
    lyrics && "lines" in lyrics && lyrics.lines.length
      ? lyrics.lines
      : undefined;
  const plain = lyrics && "plain" in lyrics ? lyrics.plain : undefined;

  // The clock. Idle frames cost one property read and a comparison: nothing is
  // written while paused, or while a line holds full through a silence.
  useEffect(() => {
    if (!lines) return;
    let raf = 0;
    let cur = -1;
    let lastT = NaN;
    let lastP = -1;
    let lit: HTMLElement | null = null;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = audio.current?.currentTime;
      const el = active.current;
      if (t == null || (t === lastT && el === lit)) return;
      lastT = t;
      const i = lineAt(lines, t + LEAD);
      if (i !== cur) setAt((cur = i));
      if (el !== lit) {
        lit?.style.removeProperty("--p");
        lit = el;
        lastP = -1;
      }
      const p = Math.round(progress(lines, cur, t) * 1000) / 1000;
      if (el && p !== lastP) el.style.setProperty("--p", String((lastP = p)));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [lines, audio]);

  // Follow the song. scrollTo on the panel, not scrollIntoView, which walks every
  // scrollable ancestor and would drag the whole view along with the line. 0.38
  // keeps the current line a little above centre, so what is coming has room.
  useEffect(() => {
    const el = active.current;
    const box = view.current;
    if (!el || !box || held) return;
    const instant =
      !placed.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    placed.current = true;
    box.scrollTo({
      top: el.offsetTop - box.clientHeight * 0.38,
      behavior: instant ? "auto" : "smooth",
    });
  }, [at, held]);

  // Reading ahead has to win over following. Wheel and touch only: the smooth
  // scroll above raises scroll events of its own, and listening for those would
  // have the panel mistake itself for the listener.
  const hold = () => {
    setHeld(true);
    clearTimeout(release.current);
    release.current = setTimeout(() => setHeld(false), HOLD_MS);
  };
  const resume = useCallback(() => {
    clearTimeout(release.current);
    setHeld(false);
  }, []);

  const empty = !lines && !plain;

  return (
    // Two elements, not one: the outer takes its height from the composition,
    // the inner fills it absolutely and scrolls. See .stage-lyrics in globals.css.
    <div className="stage-lyrics">
      <div
        ref={view}
        className="stage-lyrics-view"
        data-empty={empty || undefined}
        onWheel={hold}
        onTouchMove={hold}
      >
        {lyrics === undefined ? (
          // Three bars rather than a spinner: it shows the shape of what is coming.
          <div
            className="flex w-56 flex-col gap-3"
            aria-label="Looking for lyrics"
          >
            {[100, 72, 86].map((w, i) => (
              <span
                key={i}
                className="h-4 animate-pulse rounded-full bg-white/15 motion-reduce:animate-none"
                style={{ width: `${w}%`, animationDelay: `${i * 140}ms` }}
              />
            ))}
          </div>
        ) : empty ? (
          <p className="max-w-56 text-center text-sm text-white/45">
            No lyrics found for this song.
          </p>
        ) : lines ? (
          <div className="lyrics-body">
            <Lines
              lines={lines}
              at={at}
              audio={audio}
              active={active}
              onPick={resume}
            />
            <Credit />
          </div>
        ) : (
          <div className="lyrics-body">
            <p className="mb-6 text-xxs font-semibold uppercase tracking-widest text-white/40">
              Words only · not timed to the song
            </p>
            <p className="lyric-plain">{plain}</p>
            <Credit />
          </div>
        )}
      </div>

      {/* Scrolling away is reading, not leaving: a way back is one tap, and it
          comes back on its own after a few seconds either way. */}
      {lines && (
        <button
          onClick={resume}
          data-shown={held || undefined}
          tabIndex={held ? 0 : -1}
          aria-hidden={!held}
          className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 translate-y-2 items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-xs font-medium text-white opacity-0 shadow-lg shadow-black/30 backdrop-blur-xl transition-[opacity,translate] duration-200 ease-glide hover:bg-white/25 active:scale-[0.97] data-[shown]:pointer-events-auto data-[shown]:translate-y-0 data-[shown]:opacity-100"
        >
          <TbCurrentLocation size={14} />
          Back to current line
        </button>
      )}
    </div>
  );
}

/**
 * The line list. Memoised on the line index, so the frame loop above never
 * re-renders it: only a new line does. Depth falls off with distance from the
 * current line (--d), so the eye lands on now and the next line or two.
 */
const Lines = memo(function Lines({
  lines,
  at,
  audio,
  active,
  onPick,
}: {
  lines: Line[];
  at: number;
  audio: RefObject<HTMLAudioElement | null>;
  active: RefObject<HTMLButtonElement | null>;
  onPick: () => void;
}) {
  return (
    <ol>
      {lines.map((l, i) => {
        const state = i === at ? "now" : i > at ? "soon" : undefined;
        return (
          <li key={i}>
            <button
              ref={i === at ? active : undefined}
              // No data-state is the sung state; the CSS reads the absence.
              data-state={state}
              style={
                state === "soon"
                  ? ({ "--d": Math.min(i - at, 4) } as CSSProperties)
                  : undefined
              }
              onClick={() => {
                if (audio.current) audio.current.currentTime = l.t;
                onPick();
              }}
              className="lyric-line"
              title="Play from here"
            >
              {l.text ? (
                <span className="lyric-text">{l.text}</span>
              ) : (
                <Interlude />
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
});

/**
 * An instrumental stretch. The dots fill from the same --p the sweep uses, and
 * breathe while current, so a quiet passage reads as "still playing, still in
 * the right place" rather than as the panel having lost the song.
 */
const Interlude = () => (
  <span className="interlude" aria-label="Instrumental">
    {[0, 1, 2].map((i) => (
      <i key={i} style={{ "--i": i } as CSSProperties} />
    ))}
  </span>
);

/** Someone transcribed and timed these by hand for nothing. Say so. */
const Credit = () => (
  <p className="pt-10 text-xxs text-white/30">Lyrics from LRCLIB</p>
);
