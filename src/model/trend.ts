import { statusThresholds, trendDisplay } from '../../model/parameters';
import type { NutrientResult, StoreResult } from './simulate';

export type TrendDirection = 'up' | 'down' | 'steady';

export interface Trend {
  direction: TrendDirection;
  /** 1–3 arrows: how soon the value reaches the next status line at this rate (3 = soonest); 0 when steady. */
  speed: 0 | 1 | 2 | 3;
  /** Change of the shown value per day over the lookback (central). */
  perDay: number;
  /** Days until the next status line in the direction of travel, when there is one. */
  daysToNext?: number;
  /** Towards a better status (true) or a worse one (false); undefined when steady or moving within the best zone. */
  better?: boolean;
}

const RANK: Record<string, number> = { low: 0, gettingLow: 1, fine: 2, tooHigh: 0 };

interface Zones {
  lines: number[];
  zones: string[];
}

/**
 * Values where the status changes, ascending, with the status of each zone between them. An upper
 * limit on intake (ulRatio) becomes a line at value ÷ ulRatio: intake and the shown value move together,
 * so that is roughly where the limit is crossed.
 */
function statusZones(r: Pick<NutrientResult, 'kind' | 'ulRatio' | 'value'>): Zones | null {
  if (r.kind === 'info') return null;
  if (r.kind === 'limit') return { lines: [1], zones: ['fine', 'tooHigh'] };
  const t = statusThresholds.rolling.value;
  const ulLine = r.ulRatio && r.ulRatio > 0 ? r.value.central / r.ulRatio : undefined;
  if (ulLine !== undefined && ulLine > t.gettingLow) return { lines: [t.low, t.gettingLow, ulLine], zones: ['low', 'gettingLow', 'fine', 'tooHigh'] };
  return { lines: [t.low, t.gettingLow], zones: ['low', 'gettingLow', 'fine'] };
}

/** Direction and arrow count for a value `now` moving by `perDay` (non-zero), against status lines. */
function trendAt(scale: Zones, now: number, perDay: number): Trend {
  const up = perDay > 0;
  const direction = up ? 'up' : 'down';
  const zone = scale.lines.filter((l) => l <= now).length;
  const ahead = up ? scale.lines[zone] : scale.lines[zone - 1];
  const rank = RANK[scale.zones[zone]!]!;
  if (ahead === undefined) {
    // Past the last line: further into "fine" changes nothing; further into "low" or "too much" is worse.
    return { direction, speed: 1, perDay, better: rank === RANK.fine ? undefined : false };
  }
  const better = RANK[scale.zones[up ? zone + 1 : zone - 1]!]! > rank;
  const daysToNext = (ahead - now) / perDay;
  const { fast, medium } = trendDisplay.arrowDays.value;
  const speed = daysToNext <= fast ? 3 : daysToNext <= medium ? 2 : 1;
  return { direction, speed, perDay, daysToNext, better };
}

/**
 * Where the shown value is heading: its change over the last week, and how soon that reaches the next
 * status line. Null when there is too little history or the nutrient has no status.
 */
export function trendOf(r: Pick<NutrientResult, 'kind' | 'history' | 'ulRatio' | 'value'>): Trend | null {
  const scale = statusZones(r);
  const h = r.history;
  if (!scale || h.length === 0) return null;
  const last = h.length - 1;
  const base = Math.max(0, last - trendDisplay.lookbackDays.value);
  const span = last - base;
  if (span < trendDisplay.minDays.value) return null;
  const now = h[last]!.central;
  const perDay = (now - h[base]!.central) / span;
  if (Math.abs(perDay) * 7 < trendDisplay.steadyPerWeek.value) return { direction: 'steady', speed: 0, perDay };
  return trendAt(scale, now, perDay);
}

/**
 * Where a store is heading: filling (up) or draining (down) at the recent net rate, with arrows by how soon it
 * reaches the next status line of its own fill scale. Big stores fill slowly, so even a small net gain shows
 * as filling. Steady when the net is zero, or when it pushes against an empty or full store.
 */
export function storeTrendOf(st: Pick<StoreResult, 'fill' | 'capacity' | 'netPerDay'>): Trend | null {
  if (st.netPerDay === undefined || !st.capacity) return null;
  const perDay = st.netPerDay / st.capacity;
  const now = st.fill.central;
  if (perDay === 0 || (perDay > 0 && now >= 1)) return { direction: 'steady', speed: 0, perDay: 0 };
  // Empty and still short: nothing left to drain, but not a neutral "holding" either.
  if (perDay < 0 && now <= 0) return { direction: 'steady', speed: 0, perDay: 0, better: false };
  const t = statusThresholds.tank.value;
  return trendAt({ lines: [t.low, t.gettingLow], zones: ['low', 'gettingLow', 'fine'] }, now, perDay);
}
