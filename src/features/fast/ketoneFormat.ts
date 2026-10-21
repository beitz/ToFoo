import { ketosis } from '../../../model/parameters';
import { t, type MessageKey } from '../../i18n';
import type { KetoneReading, KetoneType } from '../../storage/types';

export const KETONE_UNIT: Record<KetoneType, string> = { blood: 'mmol/L', breath: 'ppm', urine: 'mmol/L' };
export const KETONE_TYPE_KEY: Record<KetoneType, MessageKey> = { blood: 'ketone.type.blood', breath: 'ketone.type.breath', urine: 'ketone.type.urine' };

/** "1.4 mmol/L", "> 3 mmol/L" above the meters' reliable range, "12 ppm"; urine as the strip reads. */
export function ketoneValueText(r: Pick<KetoneReading, 'type' | 'value'>): string {
  if (r.type === 'blood' && r.value > ketosis.meterMaxMmol.value) return t('ketone.aboveMeter', { v: ketosis.meterMaxMmol.value });
  const v = r.type === 'breath' ? String(Math.round(r.value)) : r.value.toFixed(1);
  return `${v} ${KETONE_UNIT[r.type]}`;
}

/** "3 h ago", "25 min ago", "just now". */
export function agoText(time: number, now: number): string {
  const min = Math.max(0, Math.round((now - time) / 60_000));
  if (min < 2) return t('ketone.justNow');
  if (min < 60) return t('ketone.minAgo', { n: min });
  const h = Math.round(min / 60);
  return h < 48 ? t('ketone.hAgo', { n: h }) : t('ketone.dAgo', { n: Math.round(h / 24) });
}

/** Problem with a reading, or undefined if it is fine. */
export function ketoneProblem(value: number | undefined, time: number, now: number): string | undefined {
  if (value === undefined || !(value >= 0)) return t('ketone.problem.empty');
  if (time > now + 60_000) return t('ketone.problem.future');
  return undefined;
}
