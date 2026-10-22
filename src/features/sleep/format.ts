import { t } from '../../i18n';
import { formatTime } from '../../lib/dates';
import { duration, hoursMinutes } from '../../logic/sleep';

/** "7 h 30 min". */
export function durationText(ms: number): string {
  const { h, m } = hoursMinutes(ms);
  return m ? t('sleep.duration', { h, m }) : t('sleep.durationHours', { h });
}

/** "23:40 – 07:10 · 7 h 30 min". */
export function spanText(s: { start: number; end: number }): string {
  return `${formatTime(s.start)} – ${formatTime(s.end)} · ${durationText(duration(s))}`;
}

/** Minutes as "7 h 30 min", or "40 min" under an hour. */
export function hmText(minutes: number): string {
  const { h, m } = hoursMinutes(Math.abs(minutes) * 60_000);
  return h ? durationText(Math.abs(minutes) * 60_000) : t('sleep.minutes', { m });
}

/** Minutes as "7 h 30" (or "8 h"), for narrow columns. */
export function hmShort(minutes: number): string {
  const { h, m } = hoursMinutes(Math.abs(minutes) * 60_000);
  return m ? t('sleep.hmShort', { h, m: String(m).padStart(2, '0') }) : t('sleep.durationHours', { h });
}

/** Minutes over or under as "+0:30" / "−1:06", the sign spelled out so it never rests on colour. */
export function signedHm(minutes: number): string {
  const a = Math.abs(Math.round(minutes));
  return `${minutes < 0 ? '−' : '+'}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

/** Minutes after midnight as "23:50". */
export function clockText(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
