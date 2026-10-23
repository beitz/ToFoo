import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { DialItem } from '../home/DialItem';
import { toggleSleep } from './actions';
import { useSleep } from './useSleep';

/**
 * "Going to sleep" / "I'm up" in the round button's menu: one tap, with undo. Shown at any hour while
 * Sleep is on (owner's report, 2026-10-23: hidden by day it looked broken, and he goes back to sleep
 * after 4:00 and naps); the morning question on Home still covers a night nobody pressed for.
 */
export function SleepButton({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const records = useSleep();
  const asleep = !!records?.some((r) => r.end === undefined);
  return (
    <DialItem
      icon={asleep ? 'sun' : 'bed'}
      label={t(asleep ? 'sleep.imUp' : 'sleep.goingToSleep')}
      on={asleep}
      tour="fan.sleep"
      onClick={() => {
        onDone();
        void toggleSleep(toast);
      }}
    />
  );
}
