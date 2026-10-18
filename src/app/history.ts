import { useEffect, useRef } from 'react';

/**
 * While a full-screen view inside a page is open (the recipe editor's assistant), the phone's back
 * gesture closes it instead of leaving the page and losing what was entered. The view gets its own
 * history entry with the same address, so the hash router sees no change; closing it from the app
 * goes back over that entry with `closeView()`.
 */
export function useBackCloses(open: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ view: true }, '');
    const onPop = () => close.current();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open]);
}

/** Close a view opened with useBackCloses (its history entry goes, and its onClose runs). */
export function closeView(): void {
  window.history.back();
}
