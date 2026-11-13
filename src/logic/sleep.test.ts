import { describe, expect, it } from 'vitest';
import type { SleepRecord } from '../storage/types';
import { followOnSleep, hoursMinutes, isNight, morningGuess, overlaps, sleepBlocks, sleepByDay, sleepDay, usualTimes } from './sleep';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
let n = 0;
const night = (startDay: number, sh: number, sm: number, endDay: number, eh: number, em: number): SleepRecord => ({
  id: `s${n++}`,
  schemaVersion: 1,
  start: at(startDay, sh, sm),
  end: at(endDay, eh, em),
  day: `2026-10-${String(endDay).padStart(2, '0')}`,
});

describe('sleep', () => {
  it('takes the usual times from nights, bed times around midnight averaging across it', () => {
    const nights = [night(10, 23, 30, 11, 7, 0), night(12, 0, 30, 12, 7, 30), night(12, 23, 50, 13, 6, 50)];
    expect(usualTimes(nights)).toEqual({ bed: 23 * 60 + 50, wake: 7 * 60 });
    expect(usualTimes([night(12, 14, 0, 12, 14, 30)])).toBeUndefined(); // a nap is not a night
  });

  it('asks in the morning about last night at the usual times, not past now', () => {
    const nights = [night(14, 23, 0, 15, 7, 0)];
    expect(morningGuess(nights, at(16, 9, 0))).toEqual({ start: at(15, 23, 0), end: at(16, 7, 0) });
    expect(morningGuess(nights, at(16, 6, 0))).toEqual({ start: at(15, 23, 0), end: at(16, 6, 0) });
  });

  it('asks nothing once last night is logged, and offers to end a sleep that is going', () => {
    expect(morningGuess([night(15, 23, 0, 16, 7, 0)], at(16, 9, 0))).toBeUndefined();
    const open: SleepRecord = { id: 'o', schemaVersion: 1, start: at(15, 23, 40), day: '2026-10-15' };
    expect(morningGuess([open], at(16, 7, 10))).toEqual({ start: at(15, 23, 40), end: at(16, 7, 10), open });
  });

  it('treats a sleep that is going as lasting until it could plausibly end', () => {
    expect(overlaps({ start: at(15, 23) }, { start: at(15, 22), end: at(16, 6) })).toBe(true);
    expect(overlaps({ start: at(15, 23), end: at(16, 7) }, { start: at(16, 14), end: at(16, 15) })).toBe(false);
  });

  it('proposes a sleep after one that ended a few hours ago: from half an hour after it until now', () => {
    const first = night(15, 23, 0, 16, 2, 0);
    expect(followOnSleep([first], at(16, 7, 0))).toEqual({ start: at(16, 2, 30), end: at(16, 7, 0) });
    // Up less than half an hour ago: from where it ended.
    expect(followOnSleep([first], at(16, 2, 20))).toEqual({ start: at(16, 2, 0), end: at(16, 2, 20) });
    // Nothing recent, or only a sleep that is going: the usual default applies.
    expect(followOnSleep([first], at(16, 10, 0))).toBeUndefined();
    expect(followOnSleep([{ id: 'o', schemaVersion: 1, start: at(16, 3), day: '2026-10-16' }], at(16, 7))).toBeUndefined();
  });

  it('joins sleeps with waking up in between into one night, and keeps naps apart', () => {
    const parts = [night(15, 23, 0, 16, 1, 30), night(16, 2, 30, 16, 7, 0), night(16, 14, 0, 16, 14, 40)];
    const blocks = sleepBlocks(parts);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ start: at(15, 23), end: at(16, 7), asleep: 7 * 3_600_000 });
    expect(blocks.map(isNight)).toEqual([true, false]);
    // Each part alone is short, together they are the usual night.
    expect(usualTimes(parts)).toEqual({ bed: 23 * 60, wake: 7 * 60 });
  });

  it('asks the morning question about the rest of the night after a part woken up from', () => {
    const usual = [night(13, 23, 0, 14, 7, 0)];
    // Up at 01:30 and logged it: asks about 02:00 until the usual 07:00, never over the logged part.
    expect(morningGuess([...usual, night(15, 23, 0, 16, 1, 30)], at(16, 9))).toEqual({ start: at(16, 2), end: at(16, 7) });
    // Up at 05:00: less than a night left before the usual wake time, so nothing to ask.
    expect(morningGuess([...usual, night(15, 23, 0, 16, 5, 0)], at(16, 9))).toBeUndefined();
    // Both parts logged: nothing to ask.
    expect(morningGuess([...usual, night(15, 23, 0, 16, 1, 30), night(16, 2, 0, 16, 7, 0)], at(16, 9))).toBeUndefined();
  });

  it('splits a duration into hours and minutes', () => {
    expect(hoursMinutes(7.5 * 3_600_000)).toEqual({ h: 7, m: 30 });
  });
});

// Owner's ask 2026-11-13: an evening sleep (21:00–22:15) counted to the day before; the next day now starts at 18:00.
describe('which day a sleep belongs to', () => {
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
  it('is the day it ended, or the next day when it ended from 18:00 on', () => {
    expect(sleepDay({ start: at(12, 23), end: at(13, 6) })).toBe('2026-11-13');
    expect(sleepDay({ start: at(12, 13), end: at(12, 14) })).toBe('2026-11-12');
    expect(sleepDay({ start: at(12, 16), end: at(12, 17, 59) })).toBe('2026-11-12');
    expect(sleepDay({ start: at(12, 21), end: at(12, 22, 15) })).toBe('2026-11-13');
    // Still asleep: by when it started.
    expect(sleepDay({ start: at(12, 21) })).toBe('2026-11-13');
    expect(sleepDay({ start: at(13, 2) })).toBe('2026-11-13');
  });

  it('puts an evening nap with the next night, not the day before', () => {
    const rec = (id: string, start: number, end: number): SleepRecord => ({ id, schemaVersion: 1, start, end, day: sleepDay({ start, end }) });
    const byDay = sleepByDay([rec('a', at(12, 21), at(12, 22, 15)), rec('b', at(13, 3, 30), at(13, 8))]);
    expect(byDay.get('2026-11-12')).toBeUndefined();
    const fri = byDay.get('2026-11-13')!;
    expect(fri.night?.parts.map((p) => p.id)).toEqual(['b']);
    expect(fri.naps.flatMap((b) => b.parts.map((p) => p.id))).toEqual(['a']);
  });
});
