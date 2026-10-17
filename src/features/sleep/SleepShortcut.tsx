import { useEffect, useRef } from 'react';
import { useToast } from '../../app/toast';
import { toggleSleep } from './actions';

/** The "Sleep or wake up" home-screen shortcut (#/sleep): one tap either way, then Home. */
export function SleepShortcut() {
  const toast = useToast();
  // Runs once even when React mounts effects twice in development.
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void (async () => {
      await toggleSleep(toast);
      // Replace the #/sleep history entry so Back does not toggle again.
      window.location.replace('#/');
    })();
  }, [toast]);
  return null;
}
