import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { formatTime } from '../../lib/dates';
import { morningGuess, NIGHT_MIN_MS } from '../../logic/sleep';
import { repo } from '../../storage/repo';
import { spanText } from './format';
import { saveSleepWithUndo, SleepSheet } from './SleepSheet';
import { toggleSleep } from './actions';
import { useSleep } from './useSleep';

/** The morning question is asked from 4:00 until 14:00. */
const MORNING = { from: 4, to: 14 };

/**
 * The morning question on Home (docs/SPEC.md, "Sleep"): "Slept 23:40 – 07:10?", from the sleep
 * buttons or the usual times, one tap to confirm. While a sleep is going (and has lasted at least a
 * night's worth), it offers "I'm up" instead, at any time of day.
 */
export function SleepQuestion() {
  const d = useData();
  const toast = useToast();
  const records = useSleep();
  const askedKey = `sleepAsked:${d.today}`;
  const asked = useLiveQuery(async () => !!(await repo.getMeta<boolean>(askedKey)), [askedKey]);
  const [sheet, setSheet] = useState<{ start: number; end: number; id?: string }>();
  if (!records || asked === undefined) return null;
  const now = Date.now();
  const hour = new Date(now).getHours();
  const guess = morningGuess(records, now);
  if (!guess) return null;
  const open = guess.open;
  if (open ? now - open.start < NIGHT_MIN_MS : asked || hour < MORNING.from || hour >= MORNING.to) return null;

  const close = () => setSheet(undefined);
  return (
    <div className="card prompt sleep-question">
      <p>{open ? t('sleep.askOpen', { time: formatTime(open.start) }) : t('sleep.ask', { span: spanText(guess) })}</p>
      <div className="prompt-actions">
        {open ? (
          <button className="btn btn-small" onClick={() => void toggleSleep(toast)}>
            {t('sleep.imUp')}
          </button>
        ) : (
          <button className="btn btn-small" onClick={() => void saveSleepWithUndo(guess, toast)}>
            {t('sleep.yes')}
          </button>
        )}
        <button className="btn btn-small" onClick={() => setSheet({ start: guess.start, end: guess.end, id: open?.id })}>
          {t('sleep.change')}
        </button>
        {!open && (
          <button className="btn btn-small btn-ghost" onClick={() => void repo.setMeta(askedKey, true)}>
            {t('sleep.notNow')}
          </button>
        )}
      </div>
      {sheet && <SleepSheet record={open} initial={sheet} onClose={close} />}
    </div>
  );
}
