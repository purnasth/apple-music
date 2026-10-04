"use client";

import {
  TbBrandYoutubeFilled,
  TbExternalLink,
  TbHeadphones,
  TbMusic,
  TbPlayerPlayFilled,
  TbPlus,
  TbX,
} from "react-icons/tb";
import { Logo } from "@/components/Logo";
import { Track, fmtTime, isPreview } from "@/lib/music";
import { isYouTube } from "@/lib/youtube";

/** Tags a YouTube song or artist at the foot of its cover; `small` suits a 44px row cover. */
export function YouTubeMark({
  className = "bottom-0 right-0",
  small,
}: {
  className?: string;
  small?: boolean;
}) {
  return (
    <span
      title="YouTube"
      className={`pointer-events-none absolute grid place-items-center rounded-full bg-canvas text-[#ff0033] ring-1 ring-separator ${
        small ? "size-4" : "size-5"
      } ${className}`}
    >
      <TbBrandYoutubeFilled size={small ? 11 : 13} aria-label="YouTube" />
    </span>
  );
}

export function SkeletonRows() {
  return (
    <ul aria-hidden className="animate-pulse">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-1 py-2">
          <div className="h-11 w-11 shrink-0 rounded-[7px] bg-fill" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-fill" />
            <div className="h-2.5 w-1/2 rounded bg-fill opacity-70" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The trailing clear affordance a search field grows once it has a value. */
export function ClearButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-fill-2 text-label-2 transition hover:text-label"
    >
      <TbX size={11} />
    </button>
  );
}

/** A song in a list: cover, title, artist, length, and its actions. */
export function Row({
  track,
  active,
  playing,
  onPlay,
  onAddTo,
  onRemove,
  note,
  plays,
  mark,
}: {
  track: Track;
  active: boolean;
  playing: boolean;
  onPlay: () => void;
  onAddTo: () => void;
  onRemove?: () => void;
  /** A third line: the lyric a search matched. */
  note?: React.ReactNode;
  plays?: number;
  /** Tag YouTube songs: set on the main page, where they sit among the library's. */
  mark?: boolean;
}) {
  return (
    <li className="group relative flex items-center gap-3 rounded-control px-1 py-1 transition hover:bg-fill">
      {/* The separator is inset past the artwork, the way a system list draws it. */}
      <span className="pointer-events-none absolute bottom-0 left-16 right-2 h-px bg-separator group-last:hidden" />

      <button
        onClick={onPlay}
        aria-label={playing ? "Pause" : "Play"}
        className="relative shrink-0"
      >
        {track.artwork ? (
          <img
            src={track.artwork}
            alt=""
            loading="lazy"
            className="h-11 w-11 rounded-[7px] object-cover shadow-sm shadow-black/40"
          />
        ) : (
          <div className="grid h-11 w-11 place-items-center rounded-[7px] bg-fill text-label-3">
            <TbMusic size={18} />
          </div>
        )}
        <span
          className={`absolute inset-0 grid place-items-center rounded-[7px] bg-black/55 text-white transition ${
            active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {playing ? (
            <span className="morph-out">
              <Logo size={16} className="spin-mark" />
            </span>
          ) : (
            <TbPlayerPlayFilled size={15} />
          )}
        </span>
        {mark && isYouTube(track) && (
          <YouTubeMark small className="-bottom-1 -right-1" />
        )}
      </button>

      <button
        onClick={onPlay}
        title={`${track.title} — ${track.artist}`}
        className="min-w-0 flex-1 py-1 text-left space-y-0.5"
      >
        <div
          className={`truncate text-sm ${active ? "font-semibold text-accent" : "font-medium text-label"}`}
        >
          {track.title}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-label-2">
          <span className="truncate">
            {track.artist}
            {track.album ? ` — ${track.album}` : ""}
          </span>
          {plays !== undefined && (
            <span
              title={`${plays} play${plays === 1 ? "" : "s"}`}
              className="flex shrink-0 items-center gap-0.5 font-semibold leading-none tabular-nums text-accent"
            >
              <TbHeadphones size={11} aria-hidden />
              {plays}
              <span className="sr-only"> plays</span>
            </span>
          )}
        </div>
        {note && (
          <div className="truncate text-[11px] text-label-3">{note}</div>
        )}
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        {isPreview(track) && (
          <span className="mr-1 hidden rounded-full bg-fill px-2 py-0.5 text-xxs font-medium text-label-2 md:block">
            Preview
          </span>
        )}

        <span className="hidden w-7 text-right text-xxs tabular-nums text-label-3 sm:block">
          {fmtTime(track.duration)}
        </span>

        <div className="flex items-center">
          <button
            onClick={onAddTo}
            aria-label={`Add ${track.title} to a playlist or the queue`}
            title="Add to playlist or queue"
            className="grid size-9 place-items-center rounded-full text-label-3 transition hover:bg-fill-2 hover:text-label sm:size-6"
          >
            <TbPlus size={14} />
          </button>

          {track.appleUrl && (
            <a
              href={track.appleUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={
                isYouTube(track)
                  ? "Open on YouTube"
                  : "Open in Apple Music (full track)"
              }
              className="hidden size-6 place-items-center rounded-full text-label-3 transition hover:bg-fill-2 hover:text-accent sm:grid"
            >
              <TbExternalLink size={13} />
            </a>
          )}

          {onRemove && (
            <button
              onClick={onRemove}
              title="Remove"
              aria-label="Remove"
              className="grid size-9 place-items-center rounded-full text-label-3 transition hover:bg-fill-2 hover:text-accent sm:size-6"
            >
              <TbX size={13} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** A shelf of covers: the last songs heard, unless `title` says otherwise. */
export function RecentStrip({
  tracks,
  onPlay,
  title = "Recently played",
  mark,
}: {
  tracks: Track[];
  onPlay: (i: number) => void;
  title?: string;
  /** Tag YouTube songs, as Row's `mark` does. */
  mark?: boolean;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 truncate text-xs font-semibold uppercase tracking-widest text-label-3">
        {title}
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {tracks.map((t, i) => (
          <button
            key={t.id}
            onClick={() => onPlay(i)}
            title={`${t.title} — ${t.artist}`}
            className="w-24 shrink-0 text-left transition hover:opacity-80"
          >
            <span className="relative block">
              {t.artwork ? (
                <img
                  src={t.artwork}
                  alt=""
                  loading="lazy"
                  className="h-24 w-24 rounded-[10px] object-cover shadow-sm shadow-black/40"
                />
              ) : (
                <div className="grid h-24 w-24 place-items-center rounded-[10px] bg-fill text-label-3">
                  <TbMusic size={24} />
                </div>
              )}
              {mark && isYouTube(t) && <YouTubeMark className="-bottom-2 -right-2" />}
            </span>
            <div className="mt-1.5 truncate text-xs font-medium">
              {t.title}
            </div>
            <div className="truncate text-[11px] text-label-2">
              {t.artist}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
