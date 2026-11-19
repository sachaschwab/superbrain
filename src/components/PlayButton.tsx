'use client';

import { useEffect, useRef, useState } from 'react';

let current: HTMLAudioElement | null = null;

/** Small play button for one clip; only one clip plays at a time across the page. */
export function PlayButton({ src, label = 'Play', autoPlayKey, size = 'sm' }: { src: string; label?: string; autoPlayKey?: string | number; size?: 'sm' | 'lg' }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const audio = useRef<HTMLAudioElement | null>(null);

  const play = async () => {
    current?.pause();
    if (!audio.current || audio.current.dataset.src !== src) {
      audio.current = new Audio(src);
      audio.current.dataset.src = src;
      audio.current.onended = () => setState('idle');
      audio.current.onpause = () => setState('idle');
    }
    current = audio.current;
    audio.current.currentTime = 0;
    setState('loading');
    try {
      await audio.current.play();
      setState('playing');
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    if (autoPlayKey !== undefined) void play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayKey]);

  const dims = size === 'lg' ? 'h-14 w-14' : 'h-7 w-7';
  const icon = size === 'lg' ? 22 : 12;
  return (
    <button
      type="button"
      onClick={() => (state === 'playing' ? audio.current?.pause() : play())}
      title={state === 'error' ? 'Audio not available' : label}
      aria-label={label}
      className={`inline-grid ${dims} shrink-0 place-items-center rounded-full border transition-colors ${
        state === 'playing' ? 'border-accent bg-accent text-accent-ink' : state === 'error' ? 'border-bad/50 text-bad' : 'border-line text-accent hover:border-accent'
      }`}
    >
      {state === 'loading' ? (
        <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
      ) : state === 'playing' ? (
        <svg width={icon} height={icon} viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1" /></svg>
      ) : (
        <svg width={icon} height={icon} viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.6v8.8a.7.7 0 0 0 1 .6l7-4.4a.7.7 0 0 0 0-1.2L4 1a.7.7 0 0 0-1 .6Z" /></svg>
      )}
    </button>
  );
}
