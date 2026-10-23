import { addDays } from '../lib/dates';
import type { ActivityRecord } from '../storage/types';

/**
 * Numbers for the tracker pages (owner's ask, 2026-10-23: every tracker gets a page you can always
 * reach). Pure. A day without entries is unknown, never zero: averages count logged days only.
 */

/** The last `n` days ending today, oldest first. */
export function windowDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

/** Sum of `value` per day over `days`; days without entries are absent. */
export function perDay<T extends { day: string }>(records: readonly T[], days: readonly string[], value: (r: T) => number): Map<string, number> {
  const inWindow = new Set(days);
  const out = new Map<string, number>();
  for (const r of records) if (inWindow.has(r.day)) out.set(r.day, (out.get(r.day) ?? 0) + value(r));
  return out;
}

export interface ActivitySummary {
  /** Days in the window with at least one activity. */
  loggedDays: number;
  totalMinutes: number;
  outsideMinutes: number;
  /** Average over the logged days; undefined without any. */
  averageMinutes?: number;
  /** Most frequent activities (same kind and name), most often first. */
  top: Array<{ kind: ActivityRecord['kind']; name?: string; count: number; minutes: number }>;
}

export function activitySummary(records: readonly ActivityRecord[], days: readonly string[]): ActivitySummary {
  const inWindow = new Set(days);
  const rs = records.filter((r) => inWindow.has(r.day));
  const minutes = perDay(rs, days, (r) => r.minutes);
  const totalMinutes = rs.reduce((a, r) => a + r.minutes, 0);
  const groups = new Map<string, ActivitySummary['top'][number]>();
  for (const r of rs) {
    const key = `${r.kind}|${(r.name ?? '').trim().toLowerCase()}`;
    const g = groups.get(key) ?? { kind: r.kind, name: r.name?.trim() || undefined, count: 0, minutes: 0 };
    g.count++;
    g.minutes += r.minutes;
    groups.set(key, g);
  }
  return {
    loggedDays: minutes.size,
    totalMinutes,
    outsideMinutes: rs.filter((r) => r.outside).reduce((a, r) => a + r.minutes, 0),
    averageMinutes: minutes.size ? Math.round(totalMinutes / minutes.size) : undefined,
    top: [...groups.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes).slice(0, 5),
  };
}

export interface WaterSummary {
  loggedDays: number;
  /** Average over the logged days, ml; undefined without any. */
  averageMl?: number;
  /** Logged days that reached `target`. */
  daysAtTarget: number;
}

/** From each logged day's water (plain water plus water in food and drinks, ml). */
export function waterSummary(totals: ReadonlyMap<string, number>, target: number): WaterSummary {
  const values = [...totals.values()];
  return {
    loggedDays: values.length,
    averageMl: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : undefined,
    daysAtTarget: values.filter((v) => v >= target).length,
  };
}

export interface PastFast {
  id: string;
  startDay: string;
  /** Hours from the meal before it (or the start of its first day) to the first food after it, or now while it runs. */
  hours: number;
  running: boolean;
  /** Counted from a logged meal; otherwise from midnight of the first day, so the hours are a lower bound. */
  fromMeal: boolean;
}

/** Fasts started in the app with their length, newest first; `since`/`end` come from fastClock and fastEnd. */
export function pastFasts(fasts: ReadonlyArray<{ id: string; startDay: string; since: number; end?: number; fromMeal: boolean }>, now: number): PastFast[] {
  return [...fasts]
    .sort((a, b) => b.since - a.since)
    .map((f) => ({ id: f.id, startDay: f.startDay, hours: Math.max(0, ((f.end ?? now) - f.since) / 3_600_000), running: f.end === undefined, fromMeal: f.fromMeal }));
}
