import { useEffect, useState } from 'react';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { DialItem } from '../home/DialItem';
import { toggleSleep } from './actions';
import { useSleep } from './useSleep';

/** The bed action shows from 18:00 to 4:00, and whenever a sleep is going; the morning question covers the rest. */
const EVENING = { from: 18, to: 4 };

function isEvening(now = new Date()): boolean {
  const h = now.getHours();
  return h >= EVENING.from || h < EVENING.to;
}

/** "Going to sleep" / "I'm up" in the Home button's menu: one tap, with undo. */
export function SleepButton({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const records = useSleep();
  const [evening, setEvening] = useState(isEvening);
  useEffect(() => {
    const id = window.setInterval(() => setEvening(isEvening()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (!records) return null;
  const asleep = records.some((r) => r.end === undefined);
  if (!asleep && !evening) return null;
  return (
    <DialItem
      icon={asleep ? 'sun' : 'bed'}
      label={t(asleep ? 'sleep.imUp' : 'sleep.goingToSleep')}
      on={asleep}
      onClick={() => {
        onDone();
        void toggleSleep(toast);
      }}
    />
  );
}
