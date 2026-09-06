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

  if (!track) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-neutral-950/95 backdrop-blur">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={next}
        onError={() => setError('Playback failed.')}
      />

      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        {track.artwork ? (
          <img src={track.artwork} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-white/10 text-xl">♪</div>
        )}

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
              max={dur || track.duration || 0}
              value={time}
              step={0.1}
              onChange={(e) => {
                const t = Number(e.target.value);
                setTime(t);
                if (audioRef.current) audioRef.current.currentTime = t;
              }}
              className="h-1 flex-1 accent-red-500"
              aria-label="Seek"
            />
            <span className="w-9 text-[10px] tabular-nums text-neutral-500">{fmtTime(dur || track.duration)}</span>
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
