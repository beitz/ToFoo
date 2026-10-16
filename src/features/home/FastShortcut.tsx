import { useEffect, useRef } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { repo } from '../../storage/repo';

/** Target of the "Start fast" home-screen shortcut (#/fast): starts a fast today, with undo, then shows Home. */
export function FastShortcut() {
  const d = useData();
  const toast = useToast();
  // Runs once even when React mounts effects twice in development.
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void (async () => {
      if (d.activeFast) toast(t('shortcut.alreadyFasting'));
      else {
        const f = await repo.startFast(d.today);
        toast(t('shortcut.fastStarted'), () => repo.deleteFast(f.id));
      }
      // Replace the #/fast history entry so Back does not start another fast.
      window.location.replace('#/');
    })();
  }, [d.activeFast, d.today, toast]);
  return null;
}
