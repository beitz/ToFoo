import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { buildInsightData, SHARE_KINDS, type InsightData, type ShareKind } from '../../logic/insights';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { useJournal } from '../journal/useJournal';
import { useHabits } from '../habits/useHabits';

/**
 * Everything the pattern tools could read, built on the phone. Only built while `enabled` (the
 * chat's "Include my data" is open or in use), since it walks every logged day.
 */
export function useInsightData(enabled: boolean): InsightData | undefined {
  const d = useData();
  const f = d.settings.features;
  const journal = useJournal();
  const sleep = useLiveQuery(() => repo.db.sleep.toArray(), []);
  const activities = useLiveQuery(() => repo.db.activities.toArray(), []);
  const water = useLiveQuery(() => repo.db.water.toArray(), []);
  const habits = useHabits();
  return useMemo(() => {
    if (!enabled || !journal || !sleep || !activities || !water || !habits) return undefined;
    // Trackers the user turned off stay out of the analysis.
    return buildInsightData({
      days: d.modelDays,
      daily: d.model.daily,
      dayStatus: d.model.dayStatus,
      entries: d.modelEntries,
      journal: isOn(f, 'journal') ? journal : [],
      sleep: isOn(f, 'sleep') ? sleep : [],
      activities: isOn(f, 'activity') ? activities : [],
      water: isOn(f, 'water') ? water : [],
      mealWindowMinutes: d.settings.mealWindowMinutes,
      today: d.today,
      ...(isOn(f, 'habits') ? { habits: { list: habits.all, data: habits.data } } : {}),
    });
  }, [enabled, d.modelDays, d.model, d.modelEntries, d.settings.mealWindowMinutes, d.today, f, journal, sleep, activities, water, habits]);
}

/** The kinds of data there are to send: the food log, and each tracker that is on. */
export function availableKinds(f: Parameters<typeof isOn>[0]): ShareKind[] {
  return SHARE_KINDS.filter((k) => k === 'food' || isOn(f, k));
}
