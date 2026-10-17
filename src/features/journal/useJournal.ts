import { useLiveQuery } from 'dexie-react-hooks';
import { repo } from '../../storage/repo';
import type { JournalEntry } from '../../storage/types';

/**
 * Journal entries, oldest first: of one day, or all. Kept out of the app data context so writing
 * an entry does not recompute the nutrient model.
 */
export function useJournal(day?: string): JournalEntry[] | undefined {
  return useLiveQuery(() => (day ? repo.db.journal.where('day').equals(day).sortBy('time') : repo.db.journal.orderBy('time').toArray()), [day]);
}
