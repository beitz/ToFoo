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
