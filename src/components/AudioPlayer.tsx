'use client';

import { useEffect, useRef, useState } from 'react';

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/**
 * Own controls instead of the browser's: elapsed and remaining time both come from our own
 * state, and fall back to the duration measured at assembly when the browser reports none.
 */
export function AudioPlayer({ src, knownDuration }: { src: string; knownDuration?: number | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(knownDuration ?? 0);
  const [seeking, setSeeking] = useState<number | null>(null);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime);
    const onDur = () => Number.isFinite(a.duration) && a.duration > 0 && setDuration(a.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onDur);
    a.addEventListener('durationchange', onDur);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onPause);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onDur);
      a.removeEventListener('durationchange', onDur);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onPause);
    };
  }, [src]);

  const toggle = () => {
    const a = ref.current!;
    if (a.paused) void a.play();
    else a.pause();
  };
  const skip = (d: number) => {
    const a = ref.current!;
    a.currentTime = Math.min(Math.max(0, a.currentTime + d), duration || a.currentTime + d);
    setTime(a.currentTime);
  };

  const shown = seeking ?? time;
  const pct = duration ? (shown / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
      <audio ref={ref} src={src} preload="metadata" />
      <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink hover:opacity-90">
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12" rx="1" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 3 1.5Z" /></svg>
        )}
      </button>
      <button onClick={() => skip(-15)} className="shrink-0 text-xs text-muted hover:text-ink" aria-label="Back 15 seconds">−15s</button>
      <span className="w-12 shrink-0 text-right text-sm tabular-nums">{fmt(shown)}</span>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={shown}
        aria-label="Position"
        className="h-1.5 w-full cursor-pointer accent-[var(--accent)]"
        style={{ background: `linear-gradient(to right, var(--accent) ${pct}%, var(--line) ${pct}%)` }}
        onChange={(e) => setSeeking(Number(e.target.value))}
        onPointerUp={() => {
          if (seeking != null && ref.current) ref.current.currentTime = seeking;
          setSeeking(null);
        }}
        onKeyUp={() => {
          if (seeking != null && ref.current) ref.current.currentTime = seeking;
          setSeeking(null);
        }}
      />
      <span className="w-14 shrink-0 text-sm tabular-nums text-muted">−{fmt(duration - shown)}</span>
      <button onClick={() => skip(15)} className="shrink-0 text-xs text-muted hover:text-ink" aria-label="Forward 15 seconds">+15s</button>
    </div>
  );
}
