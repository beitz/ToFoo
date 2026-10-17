/** Activities (docs/SPEC.md, "Activity"): pure helpers. */
import type { ActivityRecord } from '../storage/types';
import type { ExtraSun } from './resolve';

/**
 * Outside activities that count toward the vitamin D sun estimate, as time outside on their day,
 * so a walk is logged once for both.
 */
export function activitySun(activities: readonly ActivityRecord[]): ExtraSun[] {
  return activities
    .filter((a): a is ActivityRecord & { sunSkin: NonNullable<ActivityRecord['sunSkin']> } => a.outside && !!a.sunSkin && a.minutes > 0)
    .map((a) => {
      const d = new Date(a.time);
      return { day: a.day, startHour: d.getHours() + d.getMinutes() / 60, minutes: a.minutes, skin: a.sunSkin };
    });
}

/** Longest plausible single activity (a long hike); more is a typo. */
export const MAX_ACTIVITY_MINUTES = 16 * 60;
