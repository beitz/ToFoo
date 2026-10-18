import { useEffect, useRef } from 'react';

/**
 * The phone's back gesture closes the topmost sheet or full-screen view (the recipe editor's
 * assistant, the photo viewer) instead of leaving the page and losing what was entered.
 *
 * Each open layer owns one history entry with the same address, so the hash router sees no change.
 * Layers register here; `sync` keeps the entries in step with them, after the render that opened or
 * closed a layer, so a sheet replaced by another in one render (barcode scan → product) keeps one
 * entry instead of a push racing an asynchronous `history.go`.
 */
type Layer = { close: () => void };

const layers: Layer[] = [];
/** History entries added for open layers, on top of the page's own entry. */
let pushed = 0;
/** A `history.go` of ours is under way; its popstate is not the user going back. */
let traversing = false;
let scheduled = false;
let listening = false;

function depthOf(state: unknown): number {
  const d = (state as { tofooLayer?: unknown } | null)?.tofooLayer;
  return typeof d === 'number' ? d : 0;
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(sync, 0);
}

function sync(): void {
  scheduled = false;
  if (traversing) return; // runs again when the traversal lands
  // A link or the app changed the page while a layer was open: our entries stay behind as plain
  // entries of the previous page, and must not be gone back over.
  if (pushed > 0 && depthOf(window.history.state) !== pushed) pushed = 0;
  while (pushed < layers.length) {
    pushed++;
    window.history.pushState({ tofooLayer: pushed }, '');
  }
  if (pushed > layers.length) {
    const n = pushed - layers.length;
    pushed = layers.length;
    traversing = true;
    window.history.go(-n);
  }
}

function onPop(): void {
  if (traversing) {
    traversing = false;
    schedule();
    return;
  }
  const depth = depthOf(window.history.state);
  if (depth >= pushed) return; // between pages, or forward
  // The user went back over our entries: close that many layers, topmost first.
  const n = pushed - depth;
  pushed = depth;
  for (const layer of layers.slice(-n).reverse()) layer.close();
  schedule(); // a layer that stays open gets its entry back
}

/** While `open`, the back gesture runs `onClose` (once per press, topmost layer first). */
export function useBackCloses(open: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener('popstate', onPop);
      listening = true;
    }
    const layer: Layer = { close: () => close.current() };
    layers.push(layer);
    schedule();
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      schedule();
    };
  }, [open]);
}

/** True while the current history entry belongs to an open layer; leaving the page should replace it. */
export function onLayerEntry(): boolean {
  return depthOf(window.history.state) > 0;
}
