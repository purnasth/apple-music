"use client";

import {
  CSSProperties,
  RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Track, audioSrc } from "@/lib/music";
import { createListener, envelope, heightsOf } from "@/lib/listen";
import { FLOW_SPEED, loopPath, waveHeights, waveStops } from "@/lib/wave";

/** Loudness values per second in a decoded envelope. */
const ENV_RATE = 40;

/** A mouse-driven screen without Reduce Motion: where the horizon listens. */
export const livelyDesk = () =>
  window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The waveform in the full view and the mini player. On a desktop it is the
 * song's decoded loudness around the playhead (right edge = now); elsewhere a
 * seeded pattern, flowing.
 */
export default function Horizon({
  track,
  playing,
  hue,
  analyser,
  audio,
  compact,
}: {
  track: Track;
  playing: boolean;
  hue: number | null;
  analyser: RefObject<{ an: AnalyserNode } | null>;
  audio: RefObject<HTMLAudioElement | null>;
  compact?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const grad = useId();

  const seed = track.id;
  const [desk] = useState(livelyDesk);
  const env = useRef<Float32Array | null>(null);
  useEffect(() => {
    if (!desk) return;
    let gone = false;
    let url: string | undefined;
    (async () => {
      url = await audioSrc(track);
      if (!url || gone) return;
      const data = await (await fetch(url)).arrayBuffer();
      // 8 kHz keeps a whole song to a few MB; plenty for loudness.
      const buf = await new OfflineAudioContext(1, 1, 8000).decodeAudioData(
        data,
      );
      if (!gone) env.current = heightsOf(envelope(buf, ENV_RATE));
    })()
      .catch(() => {})
      .finally(() => url?.startsWith("blob:") && URL.revokeObjectURL(url));
    return () => void (gone = true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, desk]);
  const stops = waveStops(hue);
  const [w, setW] = useState(0);
  const [boxH, setBoxH] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new (el.ownerDocument.defaultView ?? window).ResizeObserver(
      () => {
        setW(el.clientWidth);
        setBoxH(el.clientHeight);
      },
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Quieter on a phone, where the same band would crowd the controls.
  const small = w > 0 && w < 640;
  const k = compact || small ? 1 : 0.85;
  // Compact fills whatever height its box is given.
  // Glow room above and below the line; compact trades some for amplitude.
  const pad = compact ? 5 : 10;
  const H = compact ? Math.max(boxH - 2 * pad, 14) : small ? 40 : 64 * k;
  const step = compact ? 4 : small ? 5 : 6 * k;
  // An even loop count, so each copy of the pattern starts on an upstroke.
  const n = Math.floor(w / step / 2) * 2;
  const period = n * step;
  // Three copies: the view slides one period, and the width can run a loop past it.
  const d = useMemo(() => {
    if (!n) return "";
    const hs = waveHeights(seed, n);
    return loopPath([...hs, ...hs, ...hs], step, H);
  }, [seed, n, H, step]);

  useEffect(() => {
    const el = box.current;
    const a = audio.current;
    if (!el || !a || !desk || !n) return;
    // In the mini player: the hidden tab's own frames stop, that window's do not.
    const win = el.ownerDocument.defaultView ?? window;
    const paths = el.querySelectorAll("path");
    const cols = Math.ceil(w / step) + 2;
    const speed = 70;
    const slice = step / speed;
    const rest = waveHeights(`${seed}:rest`, 64).map(
      (h) => 0.1 + 0.5 * ((h - 0.3) / 0.7) ** 1.6,
    );
    const hear = createListener();
    const heights = new Array<number>(cols);
    let freq: Uint8Array<ArrayBuffer> | null = null;
    let clock = a.currentTime;
    let morph = 0;
    let hadEnv = !!env.current;
    let drawn = "";
    let last = performance.now();
    let frame = 0;
    el.dataset.reactive = "";
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      // currentTime advances in coarse steps; a local clock keeps the scroll smooth.
      if (!a.paused) clock += dt * a.playbackRate;
      const jumped = Math.abs(clock - a.currentTime) > 0.15;
      if (jumped || (env.current && !hadEnv)) morph = 0.5;
      hadEnv = !!env.current;
      if (a.paused || jumped) clock = a.currentTime;

      const lv = env.current;
      const pos = clock / slice;
      const endJ = Math.floor(pos);
      const j0 = endJ - cols + 1;
      for (let i = 0; i < cols; i++) {
        const j = j0 + i;
        const from = Math.floor(j * slice * ENV_RATE);
        const to = Math.ceil((j + 1) * slice * ENV_RATE);
        let v = -1;
        if (lv && from >= 0)
          for (let e = from; e < to && e < lv.length; e++)
            v = Math.max(v, lv[e]);
        const target = v >= 0 ? v : rest[((j % 64) + 64) % 64];
        heights[i] =
          morph > 0 && heights[i] !== undefined
            ? heights[i] + (target - heights[i]) * (1 - Math.exp(-dt / 0.1))
            : target;
      }
      morph = Math.max(morph - dt, 0);
      const path = loopPath(
        heights,
        step,
        H,
        (pos - endJ) * step,
        ((j0 % 2) + 2) % 2 === 1,
      );
      if (path !== drawn) {
        for (const p of paths) p.setAttribute("d", path);
        drawn = path;
      }

      const an = analyser.current?.an;
      if (an && !a.paused) {
        freq ??= new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(freq);
        const h = hear(freq, dt);
        el.style.setProperty("--pulse", h.pulse.toFixed(3));
        el.style.setProperty("--bright", h.bright.toFixed(3));
      }
      frame = win.requestAnimationFrame(tick);
    };
    frame = win.requestAnimationFrame(tick);
    return () => win.cancelAnimationFrame(frame);
  }, [desk, analyser, audio, seed, n, w, H, step]);

  return (
    <div
      ref={box}
      aria-hidden
      data-playing={playing || undefined}
      className="horizon pointer-events-none absolute inset-0"
      style={
        {
          "--period": `-${period}px`,
          "--flow-time": `${period / FLOW_SPEED}s`,
          "--glow": stops[1],
          "--k": k,
          "--pad": `${pad}px`,
        } as CSSProperties
      }
    >
      <div className="horizon-band" style={{ height: H + 2 * pad * k }}>
        <div className="horizon-line">
          <svg width={period * 3} height={H}>
            <defs>
              <linearGradient
                id={grad}
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1={H}
                x2="0"
                y2="0"
              >
                {stops.map((c, i) => (
                  <stop key={i} offset={i / 2} stopColor={c} />
                ))}
              </linearGradient>
            </defs>
            <path d={d} style={{ stroke: `url(#${CSS.escape(grad)})` }} />
          </svg>
        </div>
        <div className="horizon-line horizon-shine">
          <svg width={period * 3} height={H}>
            <path d={d} />
          </svg>
        </div>
      </div>
    </div>
  );
}
