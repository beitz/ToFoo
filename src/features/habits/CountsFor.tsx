import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { activityCounts } from '../../logic/habits';
import { isOn } from '../../settings/features';
import type { ActivityRecord, Habit } from '../../storage/types';
import { habitStyle } from './HabitParts';
import { useHabits } from './useHabits';

/** The activity habits an activity adds to (none while Habits is off); read once per list, not per row. */
export function useCountsFor(): (a: Pick<ActivityRecord, 'kind' | 'name'>) => Habit[] {
  const on = isOn(useData().settings.features, 'habits');
  const habits = useHabits();
  const minutes = on && habits ? habits.active.filter((h) => h.kind === 'minutes') : [];
  return (a) => minutes.filter((h) => activityCounts(h, a));
}

/**
 * "Counts for Commute · Walks" under an activity, each habit opening its page. An activity is what was
 * done, a habit what is aimed for; this line is the one link between them (owner's ask 2026-10-26: the
 * two blended together).
 */
export function CountsFor({ habits }: { habits: Habit[] }) {
  if (!habits.length) return null;
  return (
    <span className="counts-for">
      <span className="muted small">{t('habits.countsFor')}</span>
      {habits.map((h) => (
        <a key={h.id} className="counts-for-habit" style={habitStyle(h)} href={href('habits', h.id)}>
          {h.name}
        </a>
      ))}
    </span>
  );
}
