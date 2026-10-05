"use client";

import { useEffect, useRef, useState } from "react";
import { Tone, toneOf } from "@/lib/tone";

/** `unavailable` uses aria-disabled so the reason in the tooltip stays reachable. */
export function Btn({
  onClick,
  children,
  active,
  label,
  unavailable,
  busy,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  label: string;
  unavailable?: string | false;
  busy?: string | false;
}) {
  return (
    <button
      onClick={unavailable ? undefined : onClick}
      aria-label={unavailable ? `${label}: ${unavailable}` : label}
      title={unavailable || busy || label}
      aria-busy={busy ? true : undefined}
      aria-pressed={unavailable ? undefined : active}
      aria-disabled={unavailable ? true : undefined}
      className={`grid h-8 w-8 place-items-center rounded-full text-sm transition ${
        unavailable
          ? "cursor-not-allowed text-label-2 opacity-35"
          : `hover:bg-fill active:scale-95 ${active ? "text-accent" : "text-label-2 hover:text-label"} ${busy ? "animate-pulse" : ""}`
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The cover as its own backdrop, drifting while it plays, under a black layer of
 * `dim` opacity (see backdropDim) that keeps the controls legible.
 */
export function Backdrop({
  art,
  playing,
  dim,
}: {
  art?: string;
  playing: boolean;
  dim: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stills = useRef<Stills | null>(null);
  const time = useRef(0);
  const [loaded, setLoaded] = useState(0);

  // The last cover's stills stay up until the next one's are ready.
  useEffect(() => {
    if (!art) return;
    const img = document.createElement("img");
    img.onload = () => {
      stills.current = bake(img);
      setLoaded((n) => n + 1);
    };
    img.src = art;
    return () => void (img.onload = null);
  }, [art]);

  useEffect(() => {
    const cv = ref.current;
    const s = stills.current;
    if (!cv || !s) return;
    // The mini player's window keeps its own frames when this tab's stop.
    const win = cv.ownerDocument.defaultView ?? window;
    const move =
      playing && !win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = document.createElement("canvas");
    // Saturation stays in CSS: a canvas filter mixes colour differently. Without
    // canvas filters (older Safari) the blur goes there too, at full cost.
    cv.style.filter = `${"filter" in win.CanvasRenderingContext2D.prototype ? "" : `blur(${BLUR}px) `}saturate(1.8) brightness(1.05)`;
    let last = win.performance.now();
    let drawn = -Infinity;
    let raf = 0;
    const tick = (now: number) => {
      if (move) time.current += (now - last) / 1000;
      last = now;
      if (now - drawn >= 1000 / FPS) {
        drawn = now;
        draw(cv, scene, time.current, s);
      }
      if (move) raf = win.requestAnimationFrame(tick);
    };
    tick(last);
    return () => win.cancelAnimationFrame(raf);
  }, [playing, loaded]);

  return (
    <>
      {art && (
        <canvas
          ref={ref}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
      )}
      <div
        className="pointer-events-none absolute inset-0 transition-colors duration-300 ease-glide"
        style={{ backgroundColor: `rgb(0 0 0 / ${dim})` }}
      />
    </>
  );
}

type Stills = { base: HTMLCanvasElement; disc: HTMLCanvasElement };

/** The scene is drawn at this fraction of its size: the blur leaves nothing finer to lose. */
const K = 0.25;
/** The old CSS's blur(80px), taken before its 1.3× zoom. */
const BLUR = 104;
/** The drift is slow enough that 30 frames a second reads as smooth. */
const FPS = 30;

/**
 * Covers drifting over the base, in vmax: the box's offset from its corner, size,
 * pivot, resting turn, seconds per spin (negative spins back), and the
 * back-and-forth wander's period, head start and direction.
 */
const BLOBS = [
  { x: -20, y: -25, size: 75, o: [0.7, 0.7], turn: 0, spin: 32, wander: 19, lag: 0 },
  { x: -25, y: -25, right: true, bottom: true, size: 75, o: [0.3, 0.3], turn: 120, spin: -41, wander: 23, lag: 0, back: true },
  { x: -20, y: -15, right: true, size: 75, o: [0.2, 0.8], turn: 240, spin: 50, wander: 17, lag: 9 },
  { x: -15, y: -20, bottom: true, size: 60, o: [0.8, 0.2], turn: 60, spin: -36, wander: 27, lag: 14 },
];

/** The cover at its own shape, and cropped square into a disc, small enough to redraw cheaply. */
function bake(img: HTMLImageElement): Stills {
  const S = 256;
  const ar = img.naturalWidth / img.naturalHeight || 1;
  const base = document.createElement("canvas");
  base.width = ar >= 1 ? S : Math.round(S * ar);
  base.height = ar >= 1 ? Math.round(S / ar) : S;
  const b = base.getContext("2d")!;
  b.imageSmoothingQuality = "high";
  b.drawImage(img, 0, 0, base.width, base.height);
  const disc = document.createElement("canvas");
  disc.width = disc.height = S;
  const d = disc.getContext("2d")!;
  d.beginPath();
  d.arc(S / 2, S / 2, S / 2, 0, 2 * Math.PI);
  d.clip();
  const side = Math.min(base.width, base.height);
  d.drawImage(base, (base.width - side) / 2, (base.height - side) / 2, side, side, 0, 0, S, S);
  return { base, disc };
}

/**
 * One frame at `t` seconds, as the old CSS drew it (the cover filling the box,
 * four discs drifting, all zoomed 1.3× and blurred), at a quarter of the size.
 */
function draw(cv: HTMLCanvasElement, scene: HTMLCanvasElement, t: number, s: Stills) {
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  if (!W || !H) return;
  // Room past the edges, so the blur has picture to pull in rather than nothing.
  const M = 2 * BLUR;
  const w = Math.round(W * K);
  const h = Math.round(H * K);
  const sw = Math.round((W + 2 * M) * K);
  const sh = Math.round((H + 2 * M) * K);
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  // Checked on its own: a fresh scene starts at 300×150 while the canvas keeps its size.
  if (scene.width !== sw || scene.height !== sh) {
    scene.width = sw;
    scene.height = sh;
  }
  const v = Math.max(W, H) / 100;
  const g = scene.getContext("2d")!;
  g.setTransform(K, 0, 0, K, M * K, M * K);
  g.clearRect(-M, -M, W + 2 * M, H + 2 * M);
  g.translate(W / 2, H / 2);
  g.scale(1.3, 1.3);
  g.translate(-W / 2, -H / 2);
  const fit = Math.max(W / s.base.width, H / s.base.height);
  const bw = s.base.width * fit;
  const bh = s.base.height * fit;
  g.drawImage(s.base, (W - bw) / 2, (H - bh) / 2, bw, bh);
  for (const b of BLOBS) {
    const size = b.size * v;
    const x = b.right ? W - size - b.x * v : b.x * v;
    const y = b.bottom ? H - size - b.y * v : b.y * v;
    const e = t + b.lag;
    let p = (e % b.wander) / b.wander;
    if (Math.floor(e / b.wander) % 2 !== (b.back ? 1 : 0)) p = 1 - p;
    const ease = 0.5 - 0.5 * Math.cos(Math.PI * p);
    const grow = 0.9 + 0.3 * ease;
    g.save();
    g.translate(
      x + b.o[0] * size + (-8 + 17 * ease) * v,
      y + b.o[1] * size + (5 - 11 * ease) * v,
    );
    g.rotate((b.turn * Math.PI) / 180);
    g.scale(grow, grow);
    g.rotate(((t / b.spin) % 1) * 2 * Math.PI);
    g.drawImage(s.disc, -b.o[0] * size, -b.o[1] * size, size, size);
    g.restore();
  }
  const out = cv.getContext("2d")!;
  out.clearRect(0, 0, w, h);
  out.filter = `blur(${BLUR * K}px)`;
  out.drawImage(scene, -M * K, -M * K);
}

/** Reads an image once into a Tone; both values are null when it can't be read (no CORS, no art). */
export function useArtTone(src?: string) {
  const [tone, setTone] = useState<Tone>({ lum: null, hue: null });
  useEffect(() => {
    if (!src) return;
    const img = document.createElement("img");
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 8;
        const g = c.getContext("2d")!;
        g.drawImage(img, 0, 0, 8, 8);
        setTone(toneOf(g.getImageData(0, 0, 8, 8).data));
      } catch {
        setTone({ lum: null, hue: null });
      }
    };
    img.onerror = () => setTone({ lum: null, hue: null });
    img.src = src;
    return () => {
      img.onload = img.onerror = null;
    };
  }, [src]);
  return tone;
}
