/**
 * Containers logged when empty (docs/SPEC.md, "Water", "Logged when empty"): pure helpers.
 *
 * The owner fills a 2 l teapot and drinks from it over two or three days, and logs it only when it is
 * empty (2026-11-20). Stored is only what he said: the container, when it was finished (`time`) and
 * when it was filled (`from`). Each day between gets the share of the volume that falls on it, as if
 * drunk evenly; that split is worked out whenever it is read, so changing either time moves it.
 */
import type { ModelEntry } from '../model/types';
import type { LogEntry, WaterRecord } from '../storage/types';
import { dayKey } from '../lib/dates';

/** Longest stretch one container can be spread over; a longer one is a typo (not a physiological number). */
export const MAX_SPREAD_DAYS = 14;

/**
 * One tap on an empty container takes its last finish as when it was filled, unless that was longer ago
 * than this: then the sheet asks (it may have stood unused in between). A teapot lasts two or three days.
 */
export const ASK_SINCE_AFTER_DAYS = 4;

const DAY_MS = 86_400_000;

/** One day's part of a stretch: its share (0–1) and the middle of the part that falls on it. */
export interface SpreadPart {
  day: string;
  share: number;
  time: number;
}

/**
 * The local days from `from` to `to` (epoch ms) with the share of the stretch on each, by time
 * (daylight saving changes included). A stretch of no length (or reversed) is all on the day of `to`.
 */
export function spreadDays(from: number, to: number): SpreadPart[] {
  if (!(to > from)) return [{ day: dayKey(new Date(to)), share: 1, time: to }];
  const out: SpreadPart[] = [];
  let start = from;
  while (start < to) {
    const d = new Date(start);
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const end = Math.min(midnight, to);
    out.push({ day: dayKey(d), share: (end - start) / (to - from), time: Math.round((start + end) / 2) });
    start = end;
  }
  return out;
}

/** A stretch the app accepts: filled before it was finished, at most MAX_SPREAD_DAYS before. */
export function spreadProblem(from: number, to: number): 'order' | 'long' | undefined {
  if (!(from < to)) return 'order';
  if (to - from > MAX_SPREAD_DAYS * DAY_MS) return 'long';
  return undefined;
}

/** Whole days and hours of a stretch, for "2 days 4 h". */
export function spreadLength(from: number, to: number): { days: number; hours: number } {
  const hours = Math.max(0, Math.round((to - from) / 3_600_000));
  return { days: Math.floor(hours / 24), hours: hours % 24 };
}

/** Plain water with containers finished spread over their days: one record per day (no `from`), others as they are. */
export function spreadWater(records: readonly WaterRecord[]): WaterRecord[] {
  const out: WaterRecord[] = [];
  for (const r of records) {
    if (r.from === undefined || !(r.time > r.from)) {
      out.push(r);
      continue;
    }
    const { from: _from, ...rest } = r;
    for (const p of spreadDays(r.from, r.time)) out.push({ ...rest, id: `${r.id}@${p.day}`, day: p.day, time: p.time, ml: r.ml * p.share });
  }
  return out;
}

/**
 * A resolved log entry split over the days its container was drunk on, each part with its share of
 * the amounts; marked `spread`, since it has no time of its own (it acts on no meal's iron and makes
 * no day "logged"). Ids get the day (`<id>@<day>`) so meals and contributions keep them apart.
 */
export function spreadEntry(m: ModelEntry, e: LogEntry): ModelEntry[] {
  if (e.kind !== 'food' || e.from === undefined || !(e.time > e.from)) return [m];
  return spreadDays(e.from, e.time).map((p) => ({
    ...m,
    id: `${m.id}@${p.day}`,
    time: p.time,
    dayKey: p.day,
    spread: true,
    parts: m.parts.map((part) => ({ ...part, grams: part.grams * p.share })),
  }));
}

/** The log entry id behind a model entry (a spread part's id carries its day). */
export function logIdOf(modelEntryId: string): string {
  const at = modelEntryId.indexOf('@');
  return at < 0 ? modelEntryId : modelEntryId.slice(0, at);
}

/**
 * When the container was last finished (or last logged) before `before`, from the water records and
 * the food log; undefined when never. One tap on an empty container takes this as when it was filled.
 */
export function lastFromContainer(containerId: string, water: readonly Pick<WaterRecord, 'containerId' | 'time'>[], log: readonly LogEntry[], before: number): number | undefined {
  let last: number | undefined;
  const see = (time: number) => {
    if (time < before && (last === undefined || time > last)) last = time;
  };
  for (const w of water) if (w.containerId === containerId) see(w.time);
  for (const e of log) if (e.kind === 'food' && e.containerId === containerId) see(e.time);
  return last;
}

/** The days a container drink from the food log (tea, coffee) covers: logged ones on their day, finished ones on each day of their stretch. */
export function containerDrinkDays(log: readonly LogEntry[]): Array<{ id: string; day: string; time: number }> {
  const out: Array<{ id: string; day: string; time: number }> = [];
  for (const e of log) {
    if (e.kind !== 'food' || !e.containerId) continue;
    if (e.from === undefined || !(e.time > e.from)) out.push({ id: e.id, day: e.day, time: e.time });
    else for (const p of spreadDays(e.from, e.time)) out.push({ id: `${e.id}@${p.day}`, day: p.day, time: p.time });
  }
  return out;
}

/**
 * Plain water as the tracker views count it: containers finished spread over their days, and a 0 ml
 * mark on each day a tea or coffee container covers, so such a day counts as logged for water
 * (the tea's own water comes from the food log, like any drink's).
 */
export function waterForDays(water: readonly WaterRecord[], log: readonly LogEntry[]): WaterRecord[] {
  const marks = containerDrinkDays(log).map((m): WaterRecord => ({ id: `mark:${m.id}`, schemaVersion: 0, time: m.time, day: m.day, ml: 0 }));
  return [...spreadWater(water), ...marks];
}

/** A container logged empty that was drunk on one day: the record (plain water) or log entry (tea, coffee), and that day's share. */
export type DaySpread =
  | { kind: 'water'; record: WaterRecord & { from: number }; share: number; ml: number }
  | { kind: 'food'; entry: Extract<LogEntry, { kind: 'food' }> & { from: number }; share: number; ml: number };

/** The containers logged empty whose stretch covers `day`, oldest finish first, with that day's ml. */
export function daySpreads(day: string, water: readonly WaterRecord[], log: readonly LogEntry[]): DaySpread[] {
  const out: Array<DaySpread & { time: number }> = [];
  for (const r of water) {
    if (r.from === undefined || !(r.time > r.from)) continue;
    const part = spreadDays(r.from, r.time).find((p) => p.day === day);
    if (part) out.push({ kind: 'water', record: { ...r, from: r.from }, share: part.share, ml: r.ml * part.share, time: r.time });
  }
  for (const e of log) {
    if (e.kind !== 'food' || e.from === undefined || !(e.time > e.from)) continue;
    const part = spreadDays(e.from, e.time).find((p) => p.day === day);
    if (part) out.push({ kind: 'food', entry: { ...e, from: e.from }, share: part.share, ml: e.grams * part.share, time: e.time });
  }
  return out.sort((a, b) => a.time - b.time).map(({ time: _t, ...s }) => s as DaySpread);
}
