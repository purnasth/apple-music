"use client";

import { useEffect, useRef } from "react";
import type { IconType } from "react-icons";
import { TbCloudRain, TbFlame, TbHeart, TbLeaf, TbMoodOff, TbSparkles, TbX } from "react-icons/tb";
import { MOODS, type Mood } from "@/lib/music";

export const MOOD_LOOK: Record<
  Mood,
  { icon: IconType; line: string; tile: string; stroke: [string, string] }
> = {
  Energetic: { icon: TbFlame, line: "Loud, fast, up on your feet", tile: "from-orange-500 to-red-600", stroke: ["#fdba74", "#dc2626"] },
  Happy: { icon: TbSparkles, line: "Bright and easy to smile to", tile: "from-amber-400 to-orange-500", stroke: ["#fef3c7", "#f59e0b"] },
  Chill: { icon: TbLeaf, line: "Slow down, breathe out", tile: "from-teal-500 to-sky-600", stroke: ["#99f6e4", "#0d9488"] },
  Romantic: { icon: TbHeart, line: "For someone on your mind", tile: "from-pink-500 to-rose-600", stroke: ["#fbcfe8", "#db2777"] },
  Sad: { icon: TbCloudRain, line: "When you need a good cry", tile: "from-indigo-500 to-slate-700", stroke: ["#c7d2fe", "#4f46e5"] },
};

/** Five mood tiles in a modal sheet: picks a mood to play, or the right mood for a song. */
export function MoodSheet({
  title,
  current,
  counts,
  onPick,
  onOff,
  onClose,
}: {
  title: string;
  current?: Mood;
  counts?: Partial<Record<Mood, number>>;
  onPick: (m: Mood) => void;
  /** Ends the playing mix; the button only shows when this is given. */
  onOff?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  const close = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && close()}
      aria-label={title}
      className="glass-thick fixed inset-x-0 bottom-0 top-auto max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-sheet border border-separator p-0 text-label shadow-2xl shadow-black/60 backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-[30rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-sheet"
    >
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <button
          onClick={close}
          aria-label="Close"
          className="grid h-7 w-7 place-items-center rounded-full text-label-2 transition hover:bg-fill hover:text-label"
        >
          <TbX size={15} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5 p-4">
        {MOODS.map((m, i) => {
          const { icon: Icon, line, tile } = MOOD_LOOK[m];
          const n = counts?.[m];
          return (
            <button
              key={m}
              disabled={n === 0}
              onClick={() => {
                onPick(m);
                close();
              }}
              aria-pressed={current ? current === m : undefined}
              className={`relative flex min-h-24 flex-col justify-between overflow-hidden rounded-card bg-gradient-to-br p-3.5 text-left text-white shadow-lg shadow-black/30 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40 ${tile} ${
                i === MOODS.length - 1 ? "col-span-2" : ""
              } ${current === m ? "ring-2 ring-white" : ""}`}
            >
              <Icon size={22} className="opacity-90" />
              <span>
                <span className="block text-[15px] font-semibold">{m}</span>
                <span className="block text-xxs text-white/80">
                  {line}
                  {n !== undefined && ` · ${n} song${n === 1 ? "" : "s"}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {onOff && (
        <div className="px-4 pb-4">
          <button
            onClick={() => {
              onOff();
              close();
            }}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-control bg-fill text-xs font-medium text-label transition hover:bg-fill-2 active:scale-[0.99]"
          >
            <TbMoodOff size={15} />
            Turn off mood
          </button>
        </div>
      )}
    </dialog>
  );
}

/** Diameter, overlap and gap in px of the stacked mood icons, by size. */
const STACK = { sm: { d: 16, overlap: 4, gap: 1.5 }, lg: { d: 28, overlap: 6, gap: 2 } };

/**
 * Overlapping mood icons. Each is cut where the next one sits, so the gap between
 * them is truly empty and shows whatever lies behind, gradients included.
 */
function MoodStack({ size }: { size: "sm" | "lg" }) {
  const { d, overlap, gap } = STACK[size];
  const r = d / 2;
  const cut = `radial-gradient(circle ${r + gap}px at ${d - overlap + r}px 50%, transparent 98%, #000 100%)`;
  return (
    <span className="flex">
      {MOODS.map((m, i) => {
        const { icon: Icon, tile } = MOOD_LOOK[m];
        const last = i === MOODS.length - 1;
        return (
          <span
            key={m}
            className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br text-white ${tile}`}
            style={{
              width: d,
              height: d,
              marginLeft: i ? -overlap : 0,
              ...(!last && { maskImage: cut, WebkitMaskImage: cut }),
            }}
          >
            <Icon size={size === "lg" ? 13 : 9} />
          </span>
        );
      })}
    </span>
  );
}

/** The card that opens the mood picker, or names the mix that is playing. */
export function MoodCard({ mix, onOpen }: { mix?: Mood | null; onOpen: () => void }) {
  const Mix = mix && MOOD_LOOK[mix].icon;
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-card bg-fill p-3 text-left transition hover:bg-fill-2 active:scale-[0.99]"
    >
      {mix && Mix ? (
        <span
          className={`grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br text-white ${MOOD_LOOK[mix].tile}`}
        >
          <Mix size={14} />
        </span>
      ) : (
        <MoodStack size="lg" />
      )}
      <span className="min-w-0">
        <span className="block text-sm font-semibold">
          {mix ? `Your ${mix.toLowerCase()} mix is playing` : "How are you feeling?"}
        </span>
        <span className="block text-xxs text-label-2">
          {mix ? "Switch to another mood, or turn it off" : "Pick a mood and get a mix to match it"}
        </span>
      </span>
    </button>
  );
}

/** A pill that opens the mood picker; while a mood's mix plays it wears that mood. */
export function MoodPill({
  mix,
  onClick,
  label,
}: {
  mix?: Mood | null;
  onClick: () => void;
  label?: string;
}) {
  const Icon = mix && MOOD_LOOK[mix].icon;
  return (
    <button
      onClick={onClick}
      title={label ?? (mix ? `${mix} mix: switch mood` : "Play a mix for your mood")}
      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition active:scale-[0.97] ${
        mix && Icon
          ? `bg-gradient-to-br text-white hover:brightness-110 ${MOOD_LOOK[mix].tile}`
          : "bg-fill text-label-2 hover:bg-fill-2 hover:text-label"
      }`}
    >
      {mix && Icon ? <Icon size={13} /> : <MoodStack size="sm" />}
      {mix ? `${mix} mix` : "Mood"}
    </button>
  );
}

/** The player bar's mark of a playing mood mix: the mood's icon, drawn in its colours. */
export function MixDot({
  mood,
  label,
  playing,
  full,
  onClick,
}: {
  mood: Mood;
  label: string;
  playing: boolean;
  /** Sized and frosted like the full player's round buttons. */
  full?: boolean;
  onClick: () => void;
}) {
  const { icon: Icon, stroke } = MOOD_LOOK[mood];
  const id = `mood-stroke-${mood}`;
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid place-items-center rounded-full transition active:scale-95 ${
        full ? "h-9 w-9 bg-white/15 backdrop-blur-xl hover:bg-white/25" : "h-8 w-8 hover:bg-fill"
      }`}
    >
      {/* userSpaceOnUse over the icons' 24-unit box: a bounding-box gradient
          vanishes on straight strokes, whose box has no height. */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="4" y1="2" x2="20" y2="22">
          <stop offset="0" stopColor={stroke[0]} />
          <stop offset="1" stopColor={stroke[1]} />
        </linearGradient>
      </svg>
      <Icon
        size={18}
        className={playing ? "mood-glow" : undefined}
        style={{ stroke: `url(#${id})`, "--glow": stroke[1] } as React.CSSProperties}
      />
    </button>
  );
}
