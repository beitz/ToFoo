import { useMemo } from 'react';
import { useData } from '../../app/data';
import { useNow } from '../../app/useNow';
import { t, type MessageKey } from '../../i18n';
import { fastClock, ketosisInput, personalTiming, type FastClock } from '../../logic/fasting';
import { currentWeight } from '../../logic/resolve';
import { estimateKetosis, type KetosisEstimate, type KetosisInput, type KetosisPhase } from '../../model/ketosis';
import { isOn } from '../../settings/features';
import type { Fast, KetoneReading } from '../../storage/types';

export const PHASE_KEY: Record<KetosisPhase, MessageKey> = {
  none: 'fast.phase.none',
  starting: 'fast.phase.starting',
  light: 'fast.phase.light',
  moderate: 'fast.phase.moderate',
  deep: 'fast.phase.deep',
};

export function fmtFastDuration(hours: number): string {
  const h = Math.floor(hours);
  return h < 48 ? t('fast.hours', { h }) : t('fast.daysHours', { d: Math.floor(h / 24), h: h % 24 });
}

/** "about 0.3–0.8 mmol/L": one decimal, never below the 0.1 that meters show. */
export function fmtBhbRange(low: number, high: number): string {
  const lo = Math.max(0.1, low).toFixed(1);
  const hi = Math.max(0.1, high).toFixed(1);
  return lo === hi ? t('fast.bhbOne', { v: lo }) : t('fast.bhbRange', { low: lo, high: hi });
}

export interface FastView {
  fast: Fast;
  clock: FastClock;
  now: number;
  input: KetosisInput;
  /** Null when the Ketosis estimate module is off. */
  estimate: KetosisEstimate | null;
  /** Measurements taken during this fast, oldest first. */
  readings: KetoneReading[];
}

/** The running fast with its clock and, with the module on, the ketosis estimate; undefined when not fasting. */
export function useFast(): FastView | undefined {
  const d = useData();
  const now = useNow();
  const entries = useMemo(() => new Map(d.modelEntries.map((e) => [e.id, e])), [d.modelEntries]);
  const fast = d.activeFast;
  if (!fast) return undefined;
  const weightKg = currentWeight(d.profile);
  const clock = fastClock(fast, d.log, d.customFoodsById, d.settings.mealWindowMinutes);
  const on = isOn(d.settings.features, 'ketosis');
  const personal = on
    ? personalTiming(d.ketones, { fasts: d.fasts, log: d.log, customFoods: d.customFoodsById, mealWindowMinutes: d.settings.mealWindowMinutes, entries, activities: d.activities, profile: d.profile, weightKg })
    : null;
  const input = { ...ketosisInput({ clock, now, entries, activities: d.activities, profile: d.profile, weightKg }), ...(personal ? { personal } : {}) };
  // The fast still runs, so nothing has been eaten since the clock started.
  const readings = d.ketones.filter((r) => r.time >= clock.since);
  return { fast, clock, now, input, estimate: on ? estimateKetosis(input) : null, readings };
}
