import { useEffect } from 'react';

/**
 * Keep the screen on while `on` (the list is open in the shop), where the browser allows it. The
 * lock ends whenever the page is hidden, so it is asked for again when the page comes back.
 */
export function useWakeLock(on: boolean): void {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let done = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (l) => {
          if (done) void l.release();
          else lock = l;
        },
        // Refused (battery saver, no user gesture yet): the screen just turns off as usual.
        () => undefined,
      );
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => undefined);
    };
  }, [on]);
}
