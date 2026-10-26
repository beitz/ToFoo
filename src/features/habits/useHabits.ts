import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { answersByHabit, type HabitData } from '../../logic/habits';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import type { Habit } from '../../storage/types';
import { useSkipped } from '../catchup/useCatchUp';

export interface Habits {
  /** All habits in the user's order, archived ones too. */
  all: Habit[];
  /** The ones in use (not archived). */
  active: Habit[];
  data: HabitData;
}

/** Habits with their answers, the activity log and "No activity" days, live; undefined while loading. */
export function useHabits(): Habits | undefined {
  const d = useData();
  const all = useLiveQuery(() => repo.db.habits.orderBy('order').toArray(), []);
  const days = useLiveQuery(() => repo.db.habitDays.toArray(), []);
  const skipped = useSkipped();
  return useMemo(() => {
    if (!all || !days || !skipped) return undefined;
    const noActivity = new Set(Object.entries(skipped).flatMap(([day, kinds]) => (kinds.includes('activity') ? [day] : [])));
    return { all, active: all.filter((h) => !h.archived), data: { today: d.today, answers: answersByHabit(days), activities: d.activities, noActivity } };
  }, [all, days, skipped, d.today, d.activities]);
}

/** The habits and their data for the calendar layers, only while Habits is on. */
export function useHabitLayers(): { list: Habit[]; data: HabitData } | null | undefined {
  const on = isOn(useData().settings.features, 'habits');
  const h = useHabits();
  if (!on) return null;
  return h && { list: h.active, data: h.data };
}
