import { t } from '../i18n';
import { fmtNumber } from '../lib/format';

/** Rough duration for "about …": days, then weeks, months, years. */
export function fmtDuration(days: number): string {
  if (days < 1.5) return t('duration.day');
  if (days < 14) return t('duration.days', { n: Math.round(days) });
  if (days < 60) return t('duration.weeks', { n: Math.round(days / 7) });
  if (days < 730) return t('duration.months', { n: Math.round(days / 30.44) });
  return t('duration.years', { n: fmtNumber(days / 365.25, 1) });
}
