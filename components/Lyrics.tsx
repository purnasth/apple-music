"use client";

import {
  CSSProperties,
  Fragment,
  RefObject,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { TbArrowNarrowDown, TbArrowNarrowUp } from "react-icons/tb";
import type { Track } from "@/lib/music";
import {
  Line,
  Lyrics,
  getLyrics,
  lineAt,
  progress,
  wordAt,
} from "@/lib/lyrics";

/** Lines light up slightly before they are sung. */
const LEAD = 0.3;
const HOLD_MS = 5000;

export default function LyricsPanel({
  track,
  audio,
}: {
  track: Track;
  audio: RefObject<HTMLAudioElement | null>;
}) {
  const [lyrics, setLyrics] = useState<Lyrics | null | undefined>();
  const [at, setAt] = useState(-1);
  const [held, setHeld] = useState(false);
  const [lost, setLost] = useState(false);
  const [edge, setEdge] = useState<"up" | "down">("down");
  const view = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLButtonElement>(null);
  const release = useRef<ReturnType<typeof setTimeout>>(undefined);
  const placed = useRef(false);

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

  // rAF instead of timeupdate (~4 Hz); writes go straight to the DOM, not React.
  useEffect(() => {
    if (!lines) return;
    let raf = 0;
    let cur = -1;
    let lastT = NaN;
    let lastP = -1;
    let lastK = -2;
    let lit: HTMLElement | null = null;
    let words: HTMLElement[] = [];
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
        words = el ? [...el.querySelectorAll<HTMLElement>(".w")] : [];
        lastP = -1;
        lastK = -2;
      }
      if (!el) return;
      const line = lines[cur];
      if (line?.w && words.length === line.w.length) {
        const { k, p } = wordAt(line, t);
        if (k !== lastK) {
          words.forEach(
            (w, j) => (w.dataset.w = j < k ? "sung" : j === k ? "now" : ""),
          );
          lastK = k;
          lastP = -1;
        }
        const q = Math.round(p * 1000) / 1000;
        if (k >= 0 && q !== lastP)
          words[k].style.setProperty("--p", String((lastP = q)));
        return;
      }
      const p = Math.round(progress(lines, cur, t) * 1000) / 1000;
      if (p !== lastP) el.style.setProperty("--p", String((lastP = p)));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [lines, audio]);

  // scrollTo, not scrollIntoView, which would also scroll every ancestor.
  useEffect(() => {
    const el = active.current;
    const box = view.current;
    if (!el || !box) return;
    if (held) {
      const r = requestAnimationFrame(measure);
      return () => cancelAnimationFrame(r);
    }
    const instant =
      !placed.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    placed.current = true;
    box.scrollTo({
      top: el.offsetTop - box.clientHeight * 0.38,
      behavior: instant ? "auto" : "smooth",
    });
  }, [at, held]);

  // Wheel and touch only: our own smooth scroll fires scroll events too.
  const hold = () => {
    setHeld(true);
    clearTimeout(release.current);
    release.current = setTimeout(() => setHeld(false), HOLD_MS);
  };
  const resume = useCallback(() => {
    clearTimeout(release.current);
    setHeld(false);
  }, []);

  // The column's top 12% and bottom 18% are masked, so a line there counts as out of view.
  function measure() {
    const el = active.current;
    const box = view.current;
    if (!el || !box) return setLost(false);
    const top = el.offsetTop - box.scrollTop;
    const up = top + el.offsetHeight < box.clientHeight * 0.12;
    const down = top > box.clientHeight * 0.82;
    setLost(up || down);
    if (up || down) setEdge(up ? "up" : "down");
  }

  const away = held && lost;

  const empty = !lines && !plain;

  return (
    <div className="stage-lyrics">
      <div
        ref={view}
        className="stage-lyrics-view"
        data-empty={empty || undefined}
        onWheel={hold}
        onTouchMove={hold}
        onScroll={held ? measure : undefined}
      >
        {lyrics === undefined ? (
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
          </div>
        ) : (
          <div className="lyrics-body">
            <p className="mb-6 text-xxs font-semibold uppercase tracking-widest text-white/40">
              Words only · not timed to the song
            </p>
            <p className="lyric-plain">{plain}</p>
          </div>
        )}
      </div>

      {lines && (
        <button
          onClick={resume}
          data-shown={away || undefined}
          tabIndex={away ? 0 : -1}
          aria-hidden={!away}
          aria-label={`Back to the current line, ${edge === "up" ? "above" : "below"}`}
          className={`pointer-events-none absolute left-0 flex items-center gap-1.5 rounded-full bg-elevated-2/95 py-1.5 pl-2.5 pr-3.5 text-xs font-medium text-white opacity-0 shadow-lg shadow-black/40 ring-1 ring-white/10 transition-[opacity,translate] duration-200 ease-glide hover:bg-elevated-2 active:scale-[0.97] data-[shown]:pointer-events-auto data-[shown]:translate-y-0 data-[shown]:opacity-100 ${
            edge === "up" ? "top-2 -translate-y-2" : "bottom-2 translate-y-2"
          }`}
        >
          {edge === "up" ? (
            <TbArrowNarrowUp size={15} />
          ) : (
            <TbArrowNarrowDown size={15} />
          )}
          Current line
        </button>
      )}
    </div>
  );
}

/** Memoised on `at`, so the frame loop never re-renders the list. */
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
              {!l.text ? (
                <Interlude />
              ) : l.w ? (
                // Split exactly as the aligner did, so w[k] matches span k.
                l.text.split(" ").map((w, k) => (
                  <Fragment key={k}>
                    {k > 0 && " "}
                    <span className="w">{w}</span>
                  </Fragment>
                ))
              ) : (
                <span className="lyric-text">{l.text}</span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
});

const Interlude = () => (
  <span className="interlude" aria-label="Instrumental">
    {[0, 1, 2].map((i) => (
      <i key={i} style={{ "--i": i } as CSSProperties} />
    ))}
  </span>
);
