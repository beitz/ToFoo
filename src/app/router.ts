import { useEffect, useState } from 'react';
import { onLayerEntry } from './history';

/**
 * Minimal hash router: routes look like `#/recipes/abc`. Hash routing works on GitHub Pages
 * without server rewrites. Fragments that do not start with `#/` (e.g. a future `#import=…`)
 * are left alone.
 */
export function parseHash(hash: string): string[] {
  if (!hash.startsWith('#/')) return [];
  return hash
    .slice(2)
    .split('/')
    .filter(Boolean)
    .map((s) => decodeURIComponent(s));
}

/**
 * How many pages of the app lie behind the current one in this tab's history, stamped on each
 * history entry (`tofooPage`). Pages are linked from everywhere (a nutrient from a recipe, a food
 * from the diary), so their back button returns to where the user came from; a page opened
 * directly (a bookmark, the installed app's start) has nothing behind it and goes to its parent.
 */
let pageDepth = 0;
/** The depth for the entry `goBack` puts in place of the current one. */
let replacing: number | undefined;

function stampedDepth(): number | undefined {
  const d = (window.history.state as { tofooPage?: unknown } | null)?.tofooPage;
  return typeof d === 'number' ? d : undefined;
}

function stamp(depth: number): void {
  pageDepth = depth;
  window.history.replaceState({ ...(window.history.state as object | null), tofooPage: depth }, '');
}

if (typeof window !== 'undefined') {
  stamp(stampedDepth() ?? 0);
  // An entry without a stamp is a new page (a link or `navigate`); one with a stamp was gone back or forward to.
  window.addEventListener('hashchange', () => {
    const d = stampedDepth();
    if (d === undefined) stamp(replacing ?? pageDepth + 1);
    else pageDepth = d;
    replacing = undefined;
  });
}

/** Back to the page the user came from, or to `fallback` (route parts) when the page was opened directly. */
export function goBack(...fallback: string[]): void {
  if (pageDepth > 0) window.history.back();
  else replaceRoute(...fallback);
}

/** Show another page in place of this one (a saved form): back from it skips this page. */
export function replaceRoute(...parts: string[]): void {
  replacing = pageDepth;
  window.location.replace(href(...parts));
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function href(...parts: string[]): string {
  return '#/' + parts.map(encodeURIComponent).join('/');
}

export function navigate(...parts: string[]): void {
  // From a sheet's own history entry, replace it: back from the new page should not land on it.
  if (onLayerEntry()) window.location.replace(href(...parts));
  else window.location.hash = href(...parts);
}
