import { useLiveQuery } from 'dexie-react-hooks';
import { repo } from '../../storage/repo';
import type { ActivityRecord } from '../../storage/types';

/** Activities of one day, oldest first. */
export function useActivities(day: string): ActivityRecord[] | undefined {
  return useLiveQuery(() => repo.db.activities.where('day').equals(day).sortBy('time'), [day]);
}
