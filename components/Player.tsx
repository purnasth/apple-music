'use client';

import { useEffect, useRef, useState } from 'react';
import { Track, audioSrc, fmtTime, isPreview } from '@/lib/music';

type Props = {
  queue: Track[];
  index: number;
  setIndex: (i: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
};

export default function Player({ queue, index, setIndex, playing, setPlaying }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrl = useRef<string | null>(null);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [volume, setVolume] = useState(1);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  const track = queue[index];

  const next = () => {
    if (!queue.length) return;
    if (shuffle && queue.length > 1) {
      let n = index;
      while (n === index) n = Math.floor(Math.random() * queue.length);
      setIndex(n);
      return;
    }
    if (index + 1 < queue.length) setIndex(index + 1);
    else if (repeat) setIndex(0);
    else setPlaying(false);
  };

  const prev = () => {
    const a = audioRef.current;
    if (a && a.currentTime > 3) return void (a.currentTime = 0);
    setIndex(index > 0 ? index - 1 : Math.max(queue.length - 1, 0));
  };

  // Load the source whenever the track changes. Local tracks come out of IndexedDB
  // as an object URL, so the previous one gets revoked to avoid leaking blobs.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTime(0);
    if (!track) return;

    audioSrc(track).then((src) => {
      if (cancelled || !audioRef.current) return;
      if (!src) return setError('No playable audio for this track.');
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = src.startsWith('blob:') ? src : null;
      audioRef.current.src = src;
      if (playing) audioRef.current.play().catch(() => setPlaying(false));
    });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // OS-level media keys / lockscreen controls — free via the native API.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.artwork ? [{ src: track.artwork, sizes: '600x600' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => setPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => setPlaying(false));
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('nexttrack', next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, index, queue, shuffle, repeat]);

  useEffect(() => () => void (objectUrl.current && URL.revokeObjectURL(objectUrl.current)), []);

  const openFull = async () => {
    setFull(true);
    // Failing here is fine: without the native call the overlay just fills the window.
    try {
      await document.documentElement.requestFullscreen();
    } catch {}
  };

  const closeFull = async () => {
    setFull(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {}
    }
  };

  // Esc leaves native fullscreen without telling React, so follow the document instead.
  useEffect(() => {
    const sync = () => !document.fullscreenElement && setFull(false);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  // Space is the one key people reach for once the controls are the only thing on screen.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      setPlaying(!playing);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, playing, setPlaying]);

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
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={next}
        onError={() => setError('Playback failed.')}
      />

      {full && (
        <FullView
          track={track}
          time={time}
          dur={seekMax}
          onSeek={seek}
          playing={playing}
          setPlaying={setPlaying}
          next={next}
          prev={prev}
          shuffle={shuffle}
          setShuffle={setShuffle}
          repeat={repeat}
          setRepeat={setRepeat}
          volume={volume}
          setVolume={setVolume}
          error={error}
          onClose={closeFull}
        />
      )}

      <div
        className={`fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-neutral-950/95 backdrop-blur ${
          full ? 'hidden' : ''
        }`}
      >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <button
          onClick={openFull}
          aria-label="Play fullscreen"
          title="Play fullscreen"
          className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-md"
        >
          {track.artwork ? (
            <img src={track.artwork} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-white/10 text-xl">♪</div>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/50 text-white opacity-0 transition group-hover:opacity-100">
            ⤢
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{track.title}</div>
          <div className="truncate text-xs text-neutral-400">
            {track.artist}
            {isPreview(track) ? ' · 30s preview' : ''}
          </div>
          {error && <div className="truncate text-xs text-red-400">{error}</div>}

          <div className="mt-1.5 flex items-center gap-2">
            <span className="w-9 text-right text-[10px] tabular-nums text-neutral-500">{fmtTime(time)}</span>
            <input
              type="range"
              min={0}
              max={seekMax}
              value={time}
              step={0.1}
              onChange={(e) => seek(Number(e.target.value))}
              className="h-1 flex-1 accent-red-500"
              aria-label="Seek"
            />
            <span className="w-9 text-[10px] tabular-nums text-neutral-500">{fmtTime(seekMax)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Btn onClick={() => setShuffle(!shuffle)} active={shuffle} label="Shuffle">⇄</Btn>
          <Btn onClick={prev} label="Previous">⏮</Btn>
          <button
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? 'Pause' : 'Play'}
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-black transition hover:scale-105"
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <Btn onClick={next} label="Next">⏭</Btn>
          <Btn onClick={() => setRepeat(!repeat)} active={repeat} label="Repeat">↻</Btn>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="ml-2 hidden h-1 w-20 accent-red-500 sm:block"
            aria-label="Volume"
          />
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
      aria-pressed={active}
      className={`grid h-8 w-8 place-items-center rounded-full text-sm transition hover:bg-white/10 ${
        active ? 'text-red-500' : 'text-neutral-300'
      }`}
    >
      {children}
    </button>
  );
}

/** Apple-style now playing: the cover fills the screen, blurred behind itself. */
function FullView({
  track,
  time,
  dur,
  onSeek,
  playing,
  setPlaying,
  next,
  prev,
  shuffle,
  setShuffle,
  repeat,
  setRepeat,
  volume,
  setVolume,
  error,
  onClose,
}: {
  track: Track;
  time: number;
  dur: number;
  onSeek: (t: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  next: () => void;
  prev: () => void;
  shuffle: boolean;
  setShuffle: (s: boolean) => void;
  repeat: boolean;
  setRepeat: (r: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
  error: string | null;
  onClose: () => void;
}) {
  const art = track.artworkLarge ?? track.artwork;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-neutral-950 text-neutral-100">
      {/* The cover doubles as its own backdrop — the ambient wash without needing a colour API. */}
      {art && (
        <img
          src={art}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-3xl saturate-150"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-neutral-950/60" />

      <button
        onClick={onClose}
        aria-label="Exit fullscreen"
        className="absolute right-5 top-5 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg backdrop-blur transition hover:bg-white/20"
      >
        ✕
      </button>

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center px-6">
        {art ? (
          <img
            src={art}
            alt={`${track.album || track.title} cover`}
            className="aspect-square w-[min(52vh,80vw)] rounded-2xl object-cover shadow-2xl shadow-black/60"
          />
        ) : (
          <div className="grid aspect-square w-[min(52vh,80vw)] place-items-center rounded-2xl bg-white/10 text-7xl">♪</div>
        )}

        <div className="mt-7 w-full text-center">
          <h2 className="truncate text-2xl font-semibold">{track.title}</h2>
          <p className="mt-1 truncate text-sm text-neutral-300">
            {track.artist}
            {isPreview(track) ? ' · 30s preview' : ''}
          </p>
          {track.album && <p className="mt-0.5 truncate text-xs text-neutral-400">{track.album}</p>}
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>

        <div className="mt-6 flex w-full items-center gap-3">
          <span className="w-10 text-right text-xs tabular-nums text-neutral-400">{fmtTime(time)}</span>
          <input
            type="range"
            min={0}
            max={dur}
            value={time}
            step={0.1}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="h-1 flex-1 accent-white"
            aria-label="Seek"
          />
          <span className="w-10 text-xs tabular-nums text-neutral-400">{fmtTime(dur)}</span>
        </div>

        <div className="mt-6 flex items-center gap-5">
          <Btn onClick={() => setShuffle(!shuffle)} active={shuffle} label="Shuffle">⇄</Btn>
          <Btn onClick={prev} label="Previous">⏮</Btn>
          <button
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? 'Pause' : 'Play'}
            className="grid h-16 w-16 place-items-center rounded-full bg-white text-xl text-black transition hover:scale-105"
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <Btn onClick={next} label="Next">⏭</Btn>
          <Btn onClick={() => setRepeat(!repeat)} active={repeat} label="Repeat">↻</Btn>
        </div>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="mt-7 h-1 w-40 accent-white"
          aria-label="Volume"
        />
        <p className="mt-5 text-[11px] text-neutral-500">Space to play or pause · Esc to exit</p>
      </div>
    </div>
  );
}
