import { useLiveQuery } from 'dexie-react-hooks';
import { repo } from '../../storage/repo';
import type { WaterRecord } from '../../storage/types';

/** Plain water entries of one day, oldest first. */
export function useWater(day: string): WaterRecord[] | undefined {
  return useLiveQuery(() => repo.db.water.where('day').equals(day).sortBy('time'), [day]);
}
