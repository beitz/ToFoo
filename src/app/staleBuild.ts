/**
 * An app left open across an update (owner's find, 2026-10-27: three assistant messages failed with
 * "Failed to fetch dynamically imported module …/index-sRDF7iEp.js"). Parts of the app load on first
 * use (the assistant's SDK, backups, the barcode reader); once a new version is deployed and its
 * service worker has taken over, the old page asks for files that no longer exist. Nothing is wrong
 * with the connection: the page only has to reload. The assistant says so and reloads with one tap,
 * keeping the message typed; anywhere else Home offers the new version.
 */
import { markReloadNeeded } from './update';

const STALE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk \S+ failed/i;

/** A file of this version could not be loaded because a newer version replaced it. */
export function isStaleBuildError(e: unknown): boolean {
  const text = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return STALE.test(text);
}

const DRAFT_KEY = 'tofoo.reloadDraft';

/** Reloads into the new version; `draft` (the message being typed) comes back in the assistant's box. */
export function reloadForUpdate(draft?: string): void {
  try {
    if (draft?.trim()) sessionStorage.setItem(DRAFT_KEY, draft);
  } catch {
    // Private mode or storage blocked: reload anyway, the text is lost.
  }
  window.location.reload();
}

/** The message kept over a reload, once. */
export function takeReloadDraft(): string | null {
  try {
    const text = sessionStorage.getItem(DRAFT_KEY);
    sessionStorage.removeItem(DRAFT_KEY);
    return text;
  } catch {
    return null;
  }
}

/** From main.tsx: a failed load anywhere turns Home's version line into "tap to load". */
export function watchStaleBuild(): void {
  // Vite reports a failed preload before the import itself fails.
  window.addEventListener('vite:preloadError', () => markReloadNeeded());
  window.addEventListener('unhandledrejection', (e) => {
    if (isStaleBuildError(e.reason)) markReloadNeeded();
  });
}
