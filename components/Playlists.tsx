"use client";

import { useEffect, useRef, useState } from "react";
import {
  TbArrowLeft,
  TbArrowsShuffle,
  TbBookmarkPlus,
  TbCheck,
  TbDownload,
  TbMusic,
  TbPencil,
  TbPlayerPlayFilled,
  TbPlayerTrackNextFilled,
  TbPlaylist,
  TbPlaylistAdd,
  TbPlus,
  TbShare3,
  TbTrash,
  TbUpload,
  TbX,
} from "react-icons/tb";
import { gooeyToast } from "goey-toast";
import {
  Track,
  Playlists,
  encodePlaylist,
  fmtTotal,
  shareable,
} from "@/lib/music";

/** What the playlists tab is looking at: a saved playlist, or one from a link. */
export type Detail = { name: string; tracks: Track[]; shared?: boolean };

const songs = (n: number) => `${n} song${n === 1 ? "" : "s"}`;

/** Four covers when there are four, otherwise the first one — the way a folder of
    albums reads at a glance without needing a title to identify it. */
function Mosaic({
  tracks,
  className = "",
}: {
  tracks: Track[];
  className?: string;
}) {
  const art = tracks.map((t) => t.artwork).filter(Boolean) as string[];
  const base = `overflow-hidden bg-fill shadow-sm shadow-black/40 ${className}`;

  // Explicit rows: auto rows would size to the covers' natural height and spill
  // out of the square instead of taking a quarter each.
  if (art.length >= 4)
    return (
      <span className={`grid grid-cols-2 grid-rows-2 ${base}`}>
        {art.slice(0, 4).map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ))}
      </span>
    );

  if (art.length)
    return (
      <span className={`block ${base}`}>
        <img
          src={art[0]}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </span>
    );

  return (
    <span className={`grid place-items-center text-label-3 ${base}`}>
      <TbPlaylist className="h-1/3 w-1/3" />
    </span>
  );
}

/* ---------- Add to… ---------- */

/**
 * The old affordance was a transparent <select> laid over a + glyph: no artwork,
 * no sense of what a playlist already holds, and "New playlist…" fell through to
 * window.prompt. This is a real sheet — a modal <dialog>, so Escape, the backdrop
 * and the focus trap come from the platform rather than three more effects.
 */
export function AddToSheet({
  track,
  playlists,
  onToggle,
  onCreate,
  onQueue,
  onClose,
}: {
  track: Track;
  playlists: Playlists;
  onToggle: (name: string) => void;
  onCreate: (name: string) => void;
  onQueue: (mode: "next" | "end") => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const names = Object.keys(playlists);

  // showModal() (not the open attribute) is what puts it in the top layer and
  // turns on ::backdrop, light dismiss and the focus trap.
  useEffect(() => ref.current?.showModal(), []);

  const close = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && close()}
      aria-label={`Add ${track.title} to…`}
      // A sheet from the bottom edge on a phone, a centred panel on a desktop.
      className="glass-thick fixed inset-x-0 bottom-0 top-auto max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-sheet border border-separator p-0 text-label shadow-2xl shadow-black/60 backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-[26rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-sheet"
    >
      <div className="glass-thick sticky top-0 z-10 flex items-center gap-3 border-b border-separator px-4 py-3">
        {track.artwork ? (
          <img
            src={track.artwork}
            alt=""
            className="h-10 w-10 shrink-0 rounded-[7px] object-cover"
          />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[7px] bg-fill text-label-3">
            <TbMusic size={18} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {track.title}
          </span>
          <span className="block truncate text-[11px] text-label-2">
            {track.artist}
          </span>
        </span>
        <button
          onClick={close}
          aria-label="Close"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-label-2 transition hover:bg-fill hover:text-label"
        >
          <TbX size={15} />
        </button>
      </div>

      <Section label="Play">
        <SheetRow
          icon={<TbPlayerTrackNextFilled size={15} />}
          title="Play next"
          onClick={() => {
            onQueue("next");
            close();
          }}
        />
        <SheetRow
          icon={<TbPlaylist size={15} />}
          title="Add to the end of the queue"
          onClick={() => {
            onQueue("end");
            close();
          }}
        />
      </Section>

      {!!names.length && (
        <Section label="Playlists">
          {names.map((n) => {
            const list = playlists[n];
            return (
              <SheetRow
                key={n}
                // Closing on the tap is what makes the toast visible at all: a
                // modal dialog sits in the top layer, above any toast. The check
                // shows what a playlist already holds before you decide.
                onClick={() => {
                  onToggle(n);
                  close();
                }}
                icon={<Mosaic tracks={list} className="h-9 w-9 rounded-[6px]" />}
                title={n}
                subtitle={songs(list.length)}
                checked={list.some((t) => t.id === track.id)}
              />
            );
          })}
        </Section>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          onCreate(n);
          setName("");
          close();
        }}
        className="flex gap-2 border-t border-separator p-3"
      >
        <span className="relative min-w-0 flex-1">
          <TbPlaylistAdd
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-3"
            size={16}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New playlist…"
            aria-label="New playlist name"
            className="h-10 w-full rounded-control bg-fill pl-9 pr-3 text-sm outline-none transition placeholder:text-label-3 focus:bg-fill-2"
          />
        </span>
        <button
          disabled={!name.trim()}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-control bg-accent px-4 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.97] disabled:opacity-40"
        >
          <TbPlus size={15} />
          Create
        </button>
      </form>
    </dialog>
  );
}

function Section({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-separator py-1.5 last-of-type:border-b-0">
      {label && (
        <h3 className="px-4 pb-1 pt-1.5 text-xxs font-semibold uppercase tracking-widest text-label-3">
          {label}
        </h3>
      )}
      {children}
    </section>
  );
}

function SheetRow({
  icon,
  title,
  subtitle,
  checked,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  checked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={checked}
      className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-fill"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center text-label-2">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{title}</span>
        {subtitle && (
          <span className="block truncate text-[11px] text-label-2">
            {subtitle}
          </span>
        )}
      </span>
      {checked !== undefined && (
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition ${
            checked ? "bg-accent text-white" : "border border-separator"
          }`}
        >
          {checked && <TbCheck size={13} />}
        </span>
      )}
    </button>
  );
}

/* ---------- The tab itself ---------- */

export function PlaylistsView({
  playlists,
  shared,
  detail,
  open,
  onCreate,
  onRename,
  onDelete,
  onSaveShared,
  onBackup,
  onRestore,
  onPlay,
}: {
  playlists: Playlists;
  shared: Detail | null;
  detail: Detail | null;
  open: (d: Detail | null) => void;
  onCreate: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
  onSaveShared: () => void;
  onBackup: () => void;
  onRestore: (file: File) => void;
  onPlay: (tracks: Track[], shuffle: boolean, what: string) => void;
}) {
  if (detail)
    return (
      <PlaylistDetail
        detail={detail}
        onBack={() => open(null)}
        onRename={onRename}
        onDelete={onDelete}
        onSaveShared={onSaveShared}
        onPlay={onPlay}
      />
    );

  const names = Object.keys(playlists);

  return (
    <div className="mb-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="shrink-0 text-xl font-semibold tracking-tight">
          Playlists
        </h2>
        <div className="flex min-w-0 items-center gap-2">
          <Backup
            onBackup={onBackup}
            onRestore={onRestore}
            disabled={!names.length}
          />
          <NewPlaylist onCreate={onCreate} />
        </div>
      </div>

      {!names.length && !shared && (
        <div className="flex flex-col items-center gap-2.5 py-16 text-center">
          <TbPlaylist className="text-label-3" size={32} />
          <p className="max-w-xs text-sm text-label-2">
            No playlists yet. Make one here, or add any song to a new playlist
            from its <span className="text-label">+</span> button.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
        {shared && (
          <Card
            name={shared.name}
            tracks={shared.tracks}
            badge="Shared with you"
            onOpen={() => open(shared)}
            onPlay={() => onPlay(shared.tracks, false, `“${shared.name}”`)}
          />
        )}
        {names.map((n) => (
          <Card
            key={n}
            name={n}
            tracks={playlists[n]}
            onOpen={() => open({ name: n, tracks: playlists[n] })}
            onPlay={() => onPlay(playlists[n], false, `“${n}”`)}
          />
        ))}
      </div>
    </div>
  );
}

function Card({
  name,
  tracks,
  badge,
  onOpen,
  onPlay,
}: {
  name: string;
  tracks: Track[];
  badge?: string;
  onOpen: () => void;
  onPlay: () => void;
}) {
  return (
    <div className="group">
      <div className="relative">
        <Mosaic tracks={tracks} className="aspect-square w-full rounded-card" />
        <button
          onClick={onOpen}
          aria-label={`Open ${name}`}
          className="absolute inset-0 rounded-card transition group-hover:bg-black/20"
        />
        {badge && (
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-xxs font-medium text-white backdrop-blur-sm">
            {badge}
          </span>
        )}
        {!!tracks.length && (
          <button
            onClick={onPlay}
            aria-label={`Play ${name}`}
            title={`Play ${name}`}
            className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-accent text-white opacity-0 shadow-lg shadow-black/40 transition hover:brightness-110 focus-visible:opacity-100 active:scale-95 group-hover:opacity-100"
          >
            <TbPlayerPlayFilled size={14} className="ml-0.5" />
          </button>
        )}
      </div>
      <button onClick={onOpen} className="mt-2 block w-full text-left">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block truncate text-[11px] text-label-2">
          {songs(tracks.length)}
          {fmtTotal(tracks) && ` · ${fmtTotal(tracks)}`}
        </span>
      </button>
    </div>
  );
}

/**
 * Playlists live in this browser's storage and nowhere else, so the one copy
 * that can outlive the profile is a file the listener holds. Restore replaces
 * same-named playlists and leaves the rest alone.
 */
function Backup({
  onBackup,
  onRestore,
  disabled,
}: {
  onBackup: () => void;
  onRestore: (file: File) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const btn =
    "grid h-9 w-9 shrink-0 place-items-center rounded-control bg-fill text-label-2 transition hover:bg-fill-2 hover:text-label active:scale-[0.97] disabled:opacity-40";

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onRestore(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={onBackup}
        disabled={disabled}
        aria-label="Back up playlists to a file"
        title="Back up playlists to a file"
        className={btn}
      >
        <TbDownload size={15} />
      </button>
      <button
        onClick={() => input.current?.click()}
        aria-label="Restore playlists from a backup file"
        title="Restore playlists from a backup file"
        className={btn}
      >
        <TbUpload size={15} />
      </button>
    </>
  );
}

/** Collapsed to a button until it is wanted — an always-open field is clutter. */
function NewPlaylist({ onCreate }: { onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-control bg-fill px-3.5 text-xs font-medium text-label transition hover:bg-fill-2 active:scale-[0.97]"
      >
        <TbPlus size={14} />
        New playlist
      </button>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim();
        if (n) onCreate(n);
        setName("");
        setOpen(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      className="flex min-w-0 gap-2"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Playlist name"
        aria-label="Playlist name"
        className="h-9 min-w-0 flex-1 rounded-control bg-fill px-3 text-sm outline-none transition placeholder:text-label-3 focus:bg-fill-2 sm:w-48 sm:flex-none"
      />
      <button
        disabled={!name.trim()}
        className="h-9 shrink-0 rounded-control bg-accent px-3.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
      >
        Create
      </button>
    </form>
  );
}

function PlaylistDetail({
  detail,
  onBack,
  onRename,
  onDelete,
  onSaveShared,
  onPlay,
}: {
  detail: Detail;
  onBack: () => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
  onSaveShared: () => void;
  onPlay: (tracks: Track[], shuffle: boolean, what: string) => void;
}) {
  const { name, tracks, shared } = detail;
  const [renaming, setRenaming] = useState<string | null>(null);
  const empty = !tracks.length;

  // The link is the playlist: there is no server, so the songs are gzipped into
  // the fragment. Web Share where the OS has a sheet, clipboard everywhere else.
  const share = async () => {
    const sendable = shareable(tracks);
    if (!sendable.length)
      return gooeyToast.warning("Nothing here can be shared", {
        description: "Imported files stay on the device that imported them.",
      });

    const url = `${location.origin}${location.pathname}#p=${await encodePlaylist(name, tracks)}`;
    const left = tracks.length - sendable.length;
    const skipped = left
      ? ` ${left} imported file${left === 1 ? "" : "s"} could not travel.`
      : "";
    try {
      // The OS share sheet is its own confirmation; a toast on top would nag.
      if (navigator.share) return await navigator.share({ title: name, url });
      await navigator.clipboard.writeText(url);
      gooeyToast.success("Link copied", {
        description: `Anyone who opens it gets all ${sendable.length} songs.${skipped}`,
      });
    } catch (e) {
      // A cancelled share sheet is not a failure worth reporting.
      if ((e as Error)?.name === "AbortError") return;
      gooeyToast.error("Could not copy the link", {
        description: "Clipboard access was refused.",
        action: { label: "Try again", onClick: share },
      });
    }
  };

  return (
    <div className="mb-5">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-xs font-medium text-label-2 transition hover:text-label"
      >
        <TbArrowLeft size={15} />
        Playlists
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Mosaic
          tracks={tracks}
          className="h-36 w-36 shrink-0 self-center rounded-card sm:h-40 sm:w-40 sm:self-auto"
        />

        <div className="min-w-0 flex-1">
          {renaming === null ? (
            <h2 className="truncate text-2xl font-semibold tracking-tight">
              {name}
            </h2>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = renaming.trim();
                if (n && n !== name) onRename(name, n);
                setRenaming(null);
              }}
            >
              <input
                autoFocus
                value={renaming}
                onChange={(e) => setRenaming(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                aria-label="Playlist name"
                className="w-full rounded-control bg-fill px-2 py-1 text-2xl font-semibold tracking-tight outline-none focus:bg-fill-2"
              />
            </form>
          )}

          <p className="mt-1 text-xs text-label-2">
            {shared && <span className="text-accent">Shared playlist · </span>}
            {songs(tracks.length)}
            {fmtTotal(tracks) && ` · ${fmtTotal(tracks)}`}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onPlay(tracks, false, `“${name}”`)}
              disabled={empty}
              className="flex h-9 items-center gap-1.5 rounded-control bg-accent px-4 text-xs font-semibold text-white transition hover:brightness-110 active:scale-[0.97] disabled:opacity-40"
            >
              <TbPlayerPlayFilled size={12} />
              Play
            </button>
            <button
              onClick={() => onPlay(tracks, true, `“${name}”`)}
              disabled={empty}
              className="flex h-9 items-center gap-1.5 rounded-control bg-fill px-4 text-xs font-medium text-label transition hover:bg-fill-2 active:scale-[0.97] disabled:opacity-40"
            >
              <TbArrowsShuffle size={13} />
              Shuffle
            </button>
            <button
              onClick={share}
              disabled={empty}
              title="Copy a link that carries the whole playlist"
              className="flex h-9 items-center gap-1.5 rounded-control bg-fill px-4 text-xs font-medium text-label transition hover:bg-fill-2 active:scale-[0.97] disabled:opacity-40"
            >
              <TbShare3 size={14} />
              Share
            </button>

            {shared ? (
              <button
                onClick={onSaveShared}
                className="flex h-9 items-center gap-1.5 rounded-control bg-fill px-4 text-xs font-medium text-label transition hover:bg-fill-2 active:scale-[0.97]"
              >
                <TbBookmarkPlus size={14} />
                Save to my playlists
              </button>
            ) : (
              <>
                <button
                  onClick={() => setRenaming(name)}
                  aria-label="Rename playlist"
                  title="Rename"
                  className="grid h-9 w-9 place-items-center rounded-control bg-fill text-label-2 transition hover:bg-fill-2 hover:text-label active:scale-[0.97]"
                >
                  <TbPencil size={15} />
                </button>
                <button
                  onClick={() => {
                    // No confirm: the toast that follows carries an Undo, which
                    // costs nothing on the deletions that were meant.
                    onDelete(name);
                    onBack();
                  }}
                  aria-label="Delete playlist"
                  title="Delete"
                  className="grid h-9 w-9 place-items-center rounded-control bg-fill text-label-2 transition hover:bg-fill-2 hover:text-accent active:scale-[0.97]"
                >
                  <TbTrash size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
