/**
 * Local diagnostics log for problems that only show on a real device (e.g. a black screen
 * after navigation without any error). Kept in localStorage on this device only, never sent
 * anywhere; the user copies it from Settings → About → Diagnostics.
 */

const KEY = 'tofoo.diagnostics';
const MAX_ENTRIES = 300;

export interface DiagEntry {
  t: number;
  e: string;
  [k: string]: unknown;
}

function read(): DiagEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DiagEntry[]) : [];
  } catch {
    return [];
  }
}

export function diag(e: string, data: Record<string, unknown> = {}): void {
  try {
    const entries = read();
    entries.push({ t: Date.now(), e, ...data });
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Storage full or blocked: diagnostics are best-effort.
  }
}

export function diagEntries(): DiagEntry[] {
  return read();
}

export function clearDiag(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Sizes and positions that would explain an empty-looking screen. */
export function layoutSnapshot(): Record<string, unknown> {
  const doc = document.documentElement;
  const vv = window.visualViewport;
  const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
  const main = document.querySelector('main');
  return {
    scrollY: Math.round(window.scrollY),
    scrollX: Math.round(window.scrollX),
    inner: `${window.innerWidth}x${window.innerHeight}`,
    docSize: `${doc.scrollWidth}x${doc.scrollHeight}`,
    vv: vv ? `${Math.round(vv.width)}x${Math.round(vv.height)}@${vv.scale.toFixed(2)} off ${Math.round(vv.offsetLeft)},${Math.round(vv.offsetTop)}` : null,
    nav: nav ? `${Math.round(nav.top)},${Math.round(nav.height)}` : 'missing',
    mainText: main ? main.innerText.length : -1,
    visible: document.visibilityState,
  };
}

/** Called once at startup: global listeners for errors, navigation and slow tasks. */
export function installDiagnostics(): void {
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  try {
    localStorage.removeItem('tofoo.diagnostics.flags'); // experiments for the 2026-10 black screen, now removed
  } catch {
    // ignore
  }
  diag('start', {
    ua: navigator.userAgent,
    screen: `${screen.width}x${screen.height}@${window.devicePixelRatio}`,
    standalone,
    hash: location.hash,
    sw: !!navigator.serviceWorker?.controller,
  });
  window.addEventListener('error', (ev) => diag('error', { msg: String(ev.message), src: `${ev.filename}:${ev.lineno}` }));
  window.addEventListener('unhandledrejection', (ev) => diag('rejection', { msg: String(ev.reason) }));
  window.addEventListener('hashchange', () => {
    const at = performance.now();
    diag('hashchange', { hash: location.hash, ...layoutSnapshot() });
    // Does the browser still produce frames after the change? A hung page would not.
    let framed = false;
    requestAnimationFrame(() => {
      framed = true;
      diag('frame', { afterMs: Math.round(performance.now() - at) });
    });
    window.setTimeout(() => {
      if (!framed) diag('no-frame-1s', {});
      diag('after-1s', layoutSnapshot());
    }, 1000);
  });
  document.addEventListener('visibilitychange', () => diag('visibility', { state: document.visibilityState }));
  window.addEventListener('pageshow', (ev) => diag('pageshow', { persisted: ev.persisted }));
  window.addEventListener('pagehide', (ev) => diag('pagehide', { persisted: ev.persisted }));
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.duration > 150) diag('longtask', { ms: Math.round(entry.duration) });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // Long-task timing not supported.
  }
}

