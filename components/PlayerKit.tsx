"use client";

import { useEffect, useState } from "react";
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
  return (
    <>
      {art && (
        <div
          aria-hidden
          data-playing={playing || undefined}
          className="flow pointer-events-none absolute inset-0"
        >
          <img src={art} alt="" className="flow-base" />
          {[0, 1, 2, 3].map((i) => (
            <img key={i} src={art} alt="" />
          ))}
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-0 transition-colors duration-300 ease-glide"
        style={{ backgroundColor: `rgb(0 0 0 / ${dim})` }}
      />
    </>
  );
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
