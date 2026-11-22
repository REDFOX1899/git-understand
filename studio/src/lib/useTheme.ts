'use client';

import { useSyncExternalStore, useCallback } from 'react';

export type ThemePreference = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'gitunderstand-color-scheme';

/**
 * Detects whether the operating system or browser currently prefers dark scheme.
 */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'dark';
  }
}

/**
 * Reads stored theme preference from localStorage.
 * If missing or invalid, falls back to 'system'.
 */
function getStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'dark' || raw === 'light') {
      return raw;
    }
    return 'system';
  } catch {
    return 'system';
  }
}

/**
 * Reflects theme preference to `<meta name="color-scheme">` in the document head:
 * - 'system' -> 'light dark' (allows author CSS and OS preference to resolve naturally)
 * - 'dark'   -> 'dark'
 * - 'light'  -> 'light'
 */
export function applyMetaColorScheme(preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const content = preference === 'system' ? 'light dark' : preference;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    if (meta.content !== content) {
      meta.content = content;
    }
  } else {
    meta = document.createElement('meta');
    meta.name = 'color-scheme';
    meta.content = content;
    document.head.appendChild(meta);
  }
}

/**
 * Persists theme preference to localStorage and updates the `<meta>` element:
 * - 'system': removes the key so it follows OS changes.
 * - 'dark' | 'light': stores the explicit override.
 */
function persistPreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    if (preference === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Gracefully handle environments with restricted or disabled localStorage
  }
  applyMetaColorScheme(preference);
}

// Module-level reactive store for multi-component & cross-tab synchronization
let currentPreference: ThemePreference = 'system';
let currentSystemTheme: ResolvedTheme = 'dark';
let isInitialized = false;

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function initClientStore(): void {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  currentPreference = getStoredPreference();
  currentSystemTheme = getSystemTheme();

  // Ensure DOM <meta name="color-scheme"> is synchronized
  applyMetaColorScheme(currentPreference);

  // Sync cross-tab changes via storage event
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      const updatedPreference = getStoredPreference();
      if (updatedPreference !== currentPreference) {
        currentPreference = updatedPreference;
        applyMetaColorScheme(currentPreference);
        emitChange();
      }
    }
  });

  // Listen to OS prefers-color-scheme media query changes.
  // Modern Web Guidance: "Divergence must be checked only at storage time, never retroactively:
  // a stored value that the system preference later changes to match MUST be kept.
  // Many users' OS switches schemes automatically based on time of day; removing the stored value
  // whenever the two happen to coincide would make it impossible to pin a scheme at all."
  if (typeof window.matchMedia === 'function') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const updatedSystemTheme: ResolvedTheme = e.matches ? 'dark' : 'light';
      if (updatedSystemTheme !== currentSystemTheme) {
        currentSystemTheme = updatedSystemTheme;
        // Never delete or modify the stored preference override on OS changes!
        emitChange();
      }
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else if ('addListener' in mediaQuery) {
      // Deprecated MediaQueryList listener fallback
      (mediaQuery as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(handleMediaChange);
    }
  }
}

// Automatically initialize in browser execution context
if (typeof window !== 'undefined') {
  initClientStore();
}

function subscribe(callback: () => void): () => void {
  initClientStore();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getPreferenceSnapshot(): ThemePreference {
  return currentPreference;
}

function getSystemThemeSnapshot(): ResolvedTheme {
  return currentSystemTheme;
}

function getServerPreferenceSnapshot(): ThemePreference {
  return 'system';
}

function getServerSystemThemeSnapshot(): ResolvedTheme {
  return 'dark';
}

/**
 * Sets an explicit theme preference ('system' | 'dark' | 'light').
 */
function setPreferenceInternal(p: ThemePreference): void {
  initClientStore();
  if (currentPreference === p) return;
  currentPreference = p;
  persistPreference(p);
  emitChange();
}

/**
 * Fast two-state toggle adhering to Modern Web Guidance:
 * 1. Target scheme = opposite of currently rendered scheme (stored override if any, else system preference).
 * 2. If target differs from current system preference, store it literally.
 * 3. If target matches current system preference, user is undoing their adjustment: remove stored value ('system').
 * 4. Divergence is checked only at storage time, never retroactively.
 */
function toggleQuickInternal(): void {
  initClientStore();
  const renderedTheme: ResolvedTheme =
    currentPreference === 'system' ? currentSystemTheme : currentPreference;
  const target: ResolvedTheme = renderedTheme === 'dark' ? 'light' : 'dark';

  if (target === currentSystemTheme) {
    setPreferenceInternal('system');
  } else {
    setPreferenceInternal(target);
  }
}

/**
 * Modern Web Color-Scheme Theme Hook
 *
 * Provides reactive theme preference ('system' | 'dark' | 'light'), resolved theme ('dark' | 'light'),
 * preference setter, and quick toggle following Chrome Modern Web Guidance for dark-mode-toggle.
 */
export function useTheme(): {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  toggleQuick: () => void;
} {
  const preference = useSyncExternalStore(
    subscribe,
    getPreferenceSnapshot,
    getServerPreferenceSnapshot
  );

  const systemTheme = useSyncExternalStore(
    subscribe,
    getSystemThemeSnapshot,
    getServerSystemThemeSnapshot
  );

  const resolvedTheme: ResolvedTheme =
    preference === 'system' ? systemTheme : preference;

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceInternal(p);
  }, []);

  const toggleQuick = useCallback(() => {
    toggleQuickInternal();
  }, []);

  return {
    preference,
    resolvedTheme,
    setPreference,
    toggleQuick,
  };
}

export default useTheme;
