import { t } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { repeatMeal } from '../../logic/repeat';
import { repo } from '../../storage/repo';
import type { Batch, LogEntry } from '../../storage/types';

/** Log a past meal again with its last item at `time`; one toast with undo for the whole meal. */
export async function logMealAgain(meal: readonly LogEntry[], time: number, batches: ReadonlyMap<string, Batch>, toast: (m: string, undo?: () => void) => void): Promise<LogEntry[]> {
  const { entries, skipped } = repeatMeal(meal, time, (at) => dayKey(new Date(at)), batches);
  const added: LogEntry[] = [];
  for (const e of entries) added.push(await repo.addLog(e));
  const message = skipped.length ? t('repeat.loggedSkipped', { n: added.length, skipped: skipped.join(', ') }) : t('repeat.logged', { n: added.length });
  toast(message, added.length ? () => void Promise.all(added.map((e) => repo.deleteLog(e.id))) : undefined);
  return added;
}

/** "Oats, Milk, Banana" — short enough for one line on a phone. */
export function mealTitle(meal: readonly LogEntry[], max = 3): string {
  const names = meal.map((e) => e.label);
  return names.length > max ? `${names.slice(0, max).join(', ')} +${names.length - max}` : names.join(', ');
}
