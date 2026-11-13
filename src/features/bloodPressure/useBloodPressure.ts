import { useMemo } from 'react';
import { useData } from '../../app/data';
import type { BloodPressureReading } from '../../storage/types';

/** Readings of one day, oldest first. */
export function useDayBloodPressure(day: string): BloodPressureReading[] {
  const { bloodPressure } = useData();
  return useMemo(() => bloodPressure.filter((r) => r.day === day), [bloodPressure, day]);
}
