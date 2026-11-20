import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { waterForDays } from '../../logic/spread';
import { repo } from '../../storage/repo';
import type { WaterRecord } from '../../storage/types';

/** Plain water entries as stored, oldest first (for lists to change them). */
export function useWaterRecords(): WaterRecord[] | undefined {
  return useLiveQuery(() => repo.db.water.orderBy('time').toArray(), []);
}

/**
 * Plain water per day as the views count it: containers logged empty spread over the days they were
 * drunk on, and days a tea or coffee container covers marked as logged (src/logic/spread.ts).
 */
export function useWaterDays(): WaterRecord[] | undefined {
  const d = useData();
  const raw = useWaterRecords();
  return useMemo(() => raw && waterForDays(raw, d.log), [raw, d.log]);
}

/** Plain water entries logged on one day (a container finished that day included), oldest first. */
export function useWater(day: string): WaterRecord[] | undefined {
  return useLiveQuery(() => repo.db.water.where('day').equals(day).sortBy('time'), [day]);
}
