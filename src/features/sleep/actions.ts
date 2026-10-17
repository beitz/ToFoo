import type { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { formatTime } from '../../lib/dates';
import { duration } from '../../logic/sleep';
import { repo } from '../../storage/repo';
import { durationText } from './format';

/** "Going to sleep" or "I'm up", whichever fits: one tap, with undo. */
export async function toggleSleep(toast: ReturnType<typeof useToast>, now = Date.now()): Promise<void> {
  const before = await repo.endSleep(now);
  if (before) {
    toast(t('sleep.up', { duration: durationText(duration({ start: before.start, end: now })) }), () => repo.restoreSleep(before));
    return;
  }
  const started = await repo.startSleep(now);
  if (started) toast(t('sleep.goodNight', { time: formatTime(now) }), () => void repo.deleteSleep(started.id));
}
