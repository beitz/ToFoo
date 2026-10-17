import { useLiveQuery } from 'dexie-react-hooks';
import { repo } from '../../storage/repo';
import type { SleepRecord } from '../../storage/types';

/**
 * Sleeps, oldest first: of one day (the day they ended), or all. Kept out of the app data context
 * so pressing a sleep button does not recompute the nutrient model.
 */
export function useSleep(day?: string): SleepRecord[] | undefined {
  return useLiveQuery(() => (day ? repo.db.sleep.where('day').equals(day).sortBy('start') : repo.db.sleep.orderBy('start').toArray()), [day]);
}
