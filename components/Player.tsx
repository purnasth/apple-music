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
  const [loading, setLoading] = useState(false);

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

    setLoading(true);
    audioSrc(track)
      .then((src) => {
        if (cancelled || !audioRef.current) return;
        if (!src) return setError('No playable audio for this track.');
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = src.startsWith('blob:') ? src : null;
        audioRef.current.src = src;
        if (playing) audioRef.current.play().catch(() => setPlaying(false));
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load audio.'))
      .finally(() => !cancelled && setLoading(false));

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

  // Deliberately not the Fullscreen API: this fills the page, it does not take over
  // the browser chrome. Escape closes it here rather than the browser handling it.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (e.key === 'Escape') return setFull(false);
      if (e.code !== 'Space' || typing) return;
      e.preventDefault();
      setPlaying(!playing);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, playing, setPlaying]);

  // The page behind must not scroll while the overlay covers it.
  useEffect(() => {
    if (!full) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => void (document.body.style.overflow = prevOverflow);
  }, [full]);

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
        // Cloudflare's static assets ignore Range headers and answer with the whole file,
        // so a seek past what is buffered refetches from byte 0 and playback restarts.
        // preload="auto" buffers the track up front, keeping seeks inside the buffer.
        preload="auto"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={next}
        onError={() => setError('Playback failed.')}
      />

      {full && (
        <FullView
          track={track}
          queue={queue}
          index={index}
          setIndex={setIndex}
          loading={loading}
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
          onClose={() => setFull(false)}
        />
      )}

      <div
        className={`fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-neutral-950/95 backdrop-blur ${
          full ? 'hidden' : ''
        }`}
      >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <button
          onClick={() => setFull(true)}
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

/** Fills the page (not the browser) — the cover blurred behind itself, queue on the left. */
function FullView({
  track,
  queue,
  index,
  setIndex,
  loading,
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
  queue: Track[];
  index: number;
  setIndex: (i: number) => void;
  loading: boolean;
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
  const [showQueue, setShowQueue] = useState(true);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-neutral-950 text-neutral-100">
      {/* The cover doubles as its own backdrop — the ambient wash with no colour API. */}
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
        onClick={() => setShowQueue(!showQueue)}
        aria-label={showQueue ? 'Hide queue' : 'Show queue'}
        aria-expanded={showQueue}
        title={showQueue ? 'Hide queue' : 'Show queue'}
        className="absolute left-5 top-5 z-30 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-sm backdrop-blur transition hover:bg-white/20"
      >
        {showQueue ? '⟨' : '☰'}
      </button>

      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-5 top-5 z-20 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg backdrop-blur transition hover:bg-white/20"
      >
        ✕
      </button>

      <div className="relative z-10 flex h-full">
        {showQueue && (
        <aside className="absolute inset-y-0 left-0 z-20 flex w-72 shrink-0 flex-col border-r border-white/10 bg-black/60 backdrop-blur-xl lg:relative lg:z-10 lg:bg-black/30">
          <h3 className="px-5 pb-3 pt-20 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Playing next · {queue.length}
          </h3>
          <ol className="min-h-0 flex-1 overflow-y-auto pb-6">
            {queue.map((t, i) => {
              const current = i === index;
              return (
                <li key={`${t.id}-${i}`}>
                  <button
                    onClick={() => setIndex(i)}
                    aria-current={current}
                    className={`flex w-full items-center gap-3 px-5 py-2 text-left transition hover:bg-white/10 ${
                      current ? 'bg-white/15' : i < index ? 'opacity-40' : ''
                    }`}
                  >
                    <span className="w-4 shrink-0 text-center text-[10px] tabular-nums text-neutral-400">
                      {current ? (playing ? '▶' : '❚❚') : i + 1}
                    </span>
                    {t.artwork ? (
                      <img src={t.artwork} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-white/10 text-xs">♪</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-xs ${current ? 'font-semibold' : ''}`}>{t.title}</span>
                      <span className="block truncate text-[11px] text-neutral-400">{t.artist}</span>
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-neutral-500">{fmtTime(t.duration)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-6">
          <div className="flex w-full max-w-lg flex-col items-center">
            {art ? (
              <img
                src={art}
                alt={`${track.album || track.title} cover`}
                className="aspect-square w-[min(46vh,78vw)] rounded-2xl object-cover shadow-2xl shadow-black/60"
              />
            ) : (
              <div className="grid aspect-square w-[min(46vh,78vw)] place-items-center rounded-2xl bg-white/10 text-7xl">♪</div>
            )}

            <div className="mt-6 w-full text-center">
              <h2 className="truncate text-2xl font-semibold">{track.title}</h2>
              <p className="mt-1 truncate text-sm text-neutral-300">
                {track.artist}
                {isPreview(track) ? ' · 30s preview' : ''}
              </p>
              {track.album && <p className="mt-0.5 truncate text-xs text-neutral-400">{track.album}</p>}
              {loading && <p className="mt-2 text-xs text-neutral-400">Loading…</p>}
              {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            </div>

            <div className="mt-5 flex w-full items-center gap-3">
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

            <div className="mt-5 flex items-center gap-5">
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
              className="mt-6 h-1 w-40 accent-white"
              aria-label="Volume"
            />
            <p className="mt-4 text-[11px] text-neutral-500">Space to play or pause · Esc to close</p>
          </div>
        </div>
      </div>
    </div>
  );
}
