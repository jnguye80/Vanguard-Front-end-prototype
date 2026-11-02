// Per-viewer display preferences (text size, motion). Stored in localStorage when available; the app
// works the same without it (private windows, blocked storage).

import { useSyncExternalStore } from 'react';

export type TextSize = '100' | '125' | '150';
export interface Prefs { textSize: TextSize; reduceMotion: boolean }

const KEY = 'momentum.a11y.prefs';
const DEFAULTS: Prefs = { textSize: '100', reduceMotion: false };

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      textSize: p.textSize === '125' || p.textSize === '150' ? p.textSize : '100',
      reduceMotion: p.reduceMotion === true,
    };
  } catch {
    return DEFAULTS;
  }
}

let prefs: Prefs = read();
const listeners = new Set<() => void>();

export function applyPrefs(p: Prefs = prefs) {
  const root = document.documentElement;
  root.dataset.textSize = p.textSize;
  if (p.reduceMotion) root.dataset.motion = 'reduce';
  else delete root.dataset.motion;
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage unavailable: keep in memory */ }
  applyPrefs(prefs);
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => prefs);
}
