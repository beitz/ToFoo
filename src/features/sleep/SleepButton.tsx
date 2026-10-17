import { useEffect, useState } from 'react';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { toggleSleep } from './actions';
import { useSleep } from './useSleep';

/** The bed button shows from 18:00 to 4:00, and whenever a sleep is going; the morning question covers the rest. */
const EVENING = { from: 18, to: 4 };

function isEvening(now = new Date()): boolean {
  const h = now.getHours();
  return h >= EVENING.from || h < EVENING.to;
}

/** "Going to sleep" / "I'm up" on Home: one tap, with undo. */
export function SleepButton() {
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
  const label = t(asleep ? 'sleep.imUp' : 'sleep.goingToSleep');
  return (
    <button className={`fab fab-small${asleep ? ' on' : ''}`} onClick={() => void toggleSleep(toast)} aria-pressed={asleep} aria-label={label} title={label}>
      <Icon name={asleep ? 'sun' : 'bed'} />
    </button>
  );
}
