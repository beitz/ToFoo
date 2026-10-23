import { useSyncExternalStore } from 'react';

/**
 * App updates (owner's ask 2026-10-23: "I'm not sure when an update is live and I keep refreshing").
 * The service worker still takes a new version by itself (autoUpdate), but the page no longer reloads
 * under the user's fingers: Home shows "New version ready" and a tap reloads. A refresh or the next
 * launch loads it too. The app also asks for a new version when it comes back to the foreground and
 * every hour, since an installed app can stay open for days. Requests go to the app's own address only.
 */
export type UpdateStatus = 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'unavailable';

export interface UpdateState {
  status: UpdateStatus;
  /** The new version's number, once known (read from its version.json). */
  next?: string;
}

/** The part of `registerSW` from `virtual:pwa-register` used here (passed in by main.tsx, so tests can fake it). */
export type RegisterSW = (options: {
  immediate?: boolean;
  onNeedReload?: () => void;
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
}) => unknown;

const HOUR = 60 * 60 * 1000;
/** No more than one check a minute from coming back to the foreground. */
const MIN_GAP = 60 * 1000;

let state: UpdateState = { status: 'idle' };
let registration: ServiceWorkerRegistration | undefined;
let lastCheck = 0;
const listeners = new Set<() => void>();

function set(next: UpdateState) {
  state = next;
  for (const l of listeners) l();
}

export function getUpdateState(): UpdateState {
  return state;
}

export function useAppUpdate(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getUpdateState,
    getUpdateState,
  );
}

/** A new service worker is installing (not the very first one, which isn't an update). */
function watchInstall(worker: ServiceWorker | null) {
  if (!worker || !navigator.serviceWorker?.controller || state.status === 'ready') return;
  set({ status: 'downloading' });
  worker.addEventListener('statechange', () => {
    if (worker.state === 'redundant' && state.status === 'downloading') set({ status: 'idle' });
  });
}

async function readNextVersion(): Promise<string | undefined> {
  try {
    // The new service worker answers this from its own files, so it's the new version's number.
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' });
    const json = (await res.json()) as { version?: unknown };
    return typeof json.version === 'string' ? json.version : undefined;
  } catch {
    return undefined;
  }
}

async function onReady() {
  set({ status: 'ready' });
  const next = await readNextVersion();
  if (next && next !== __APP_VERSION__) set({ status: 'ready', next });
}

/** Registers the service worker; once, from main.tsx. */
export function startUpdates(registerSW: RegisterSW) {
  registerSW({
    immediate: true,
    // Called once a new version has taken over; without it the page would reload by itself.
    onNeedReload: () => void onReady(),
    onRegisteredSW: (_url, r) => {
      if (!r) return;
      registration = r;
      watchInstall(r.installing);
      r.addEventListener('updatefound', () => watchInstall(r.installing));
      setInterval(() => void checkForUpdate(), HOUR);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - lastCheck > MIN_GAP) void checkForUpdate();
      });
    },
  });
}

/** Asks the server for a newer version ("Check for updates" in About, and in the background). */
export async function checkForUpdate(): Promise<UpdateStatus> {
  if (!registration) {
    set({ status: 'unavailable' });
    return state.status;
  }
  if (state.status === 'ready' || state.status === 'downloading' || state.status === 'checking') return state.status;
  lastCheck = Date.now();
  set({ status: 'checking' });
  try {
    await registration.update();
  } catch {
    // Offline or the server didn't answer: nothing to say beyond "no newer version found".
  }
  // `update()` ends once the new file is fetched; a new version then installs in the background.
  if (getUpdateState().status === 'checking') {
    if (registration.installing && navigator.serviceWorker?.controller) watchInstall(registration.installing);
    else set({ status: 'current' });
  }
  return state.status;
}

/** Loads the new version (it is already in place; the page only has to reload). */
export function applyUpdate() {
  window.location.reload();
}

/** For tests. */
export function resetUpdates() {
  state = { status: 'idle' };
  registration = undefined;
  lastCheck = 0;
  listeners.clear();
}
