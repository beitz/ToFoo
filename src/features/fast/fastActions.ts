import { t } from '../../i18n';
import { addDays } from '../../lib/dates';
import { repo } from '../../storage/repo';
import type { Fast } from '../../storage/types';

/** End the running fast with yesterday as its last full day (or its first day), with undo. */
export async function endFast(fast: Fast, today: string, toast: (message: string, undo?: () => void) => void): Promise<void> {
  await repo.endFast(fast.id, addDays(today, -1) < fast.startDay ? fast.startDay : addDays(today, -1));
  toast(t('home.fastEnded'), () => void repo.db.fasts.put(fast));
}
