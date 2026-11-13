import { sunTimes } from '../model/sun';
import { parseDay, utcOffsetHours } from '../lib/dates';

export interface Span {
  start: number;
  end: number;
}

/** A local clock time on a day, built from the date's fields so a clock change that night stays right. */
function at(day: string, hours: number): number {
  const d = parseDay(day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, Math.round(hours * 60)).getTime();
}

/**
 * When the sun is up on a local day, as epoch-ms spans (one, or none in a polar night). A day where
 * the sun rises but does not set (or the other way round) runs to the end (or from the start) of the day.
 */
export function daylight(day: string, latitude: number, longitude?: number): Span[] {
  const d = parseDay(day);
  const s = sunTimes(d.getFullYear(), d.getMonth() + 1, d.getDate(), utcOffsetHours(day), latitude, longitude);
  if (s.allDay === 'down') return [];
  if (s.allDay === 'up') return [{ start: at(day, 0), end: at(day, 24) }];
  const rise = s.rise ?? 0;
  const set = s.set ?? 24;
  // Sun up at midnight, down in between, up again (far north): two spans.
  if (set < rise) return [{ start: at(day, 0), end: at(day, set) }, { start: at(day, rise), end: at(day, 24) }];
  return [{ start: at(day, rise), end: at(day, set) }];
}
