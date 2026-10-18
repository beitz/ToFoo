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
