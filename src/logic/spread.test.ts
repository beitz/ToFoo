import { describe, expect, it } from 'vitest';
import type { ModelEntry } from '../model/types';
import type { LogEntry, WaterRecord } from '../storage/types';
import { containerDrinkDays, daySpreads, lastFromContainer, logIdOf, spreadDays, spreadEntry, spreadLength, spreadProblem, spreadWater, waterForDays } from './spread';

const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();
const water = (id: string, time: number, ml: number, extra: Partial<WaterRecord> = {}): WaterRecord => ({ id, schemaVersion: 1, time, day: `2026-11-${String(new Date(time).getDate()).padStart(2, '0')}`, ml, ...extra });
const tea = (id: string, time: number, grams: number, extra: Partial<Extract<LogEntry, { kind: 'food' }>> = {}): LogEntry => ({
  id,
  schemaVersion: 1,
  kind: 'food',
  ref: { source: 'BLS', version: '4.0', code: 'N630000' },
  grams,
  preparation: 'asListed',
  time,
  day: `2026-11-${String(new Date(time).getDate()).padStart(2, '0')}`,
  confidence: 'B',
  label: 'Black tea',
  ...extra,
});

describe('a container logged when empty', () => {
  it('splits a stretch over the local days it covers, by time', () => {
    // Mon 20:00 → Wed 20:00: 4 h on Monday, all of Tuesday, 20 h on Wednesday.
    const parts = spreadDays(at(16, 20), at(18, 20));
    expect(parts.map((p) => p.day)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    expect(parts.map((p) => p.share)).toEqual([4 / 48, 24 / 48, 20 / 48]);
    expect(parts[0]!.time).toBe(at(16, 22));
    expect(parts.reduce((a, p) => a + p.share, 0)).toBeCloseTo(1, 12);
    // Within one day, or nothing to spread: all on the day it was emptied.
    expect(spreadDays(at(16, 8), at(16, 20))).toEqual([{ day: '2026-11-16', share: 1, time: at(16, 14) }]);
    expect(spreadDays(at(16, 20), at(16, 20))).toEqual([{ day: '2026-11-16', share: 1, time: at(16, 20) }]);
  });

  it('accepts a fill time before it was emptied, at most two weeks before', () => {
    expect(spreadProblem(at(16, 20), at(18, 20))).toBeUndefined();
    expect(spreadProblem(at(18, 20), at(18, 20))).toBe('order');
    expect(spreadProblem(at(1, 8), at(18, 20))).toBe('long');
    expect(spreadLength(at(16, 20), at(18, 23, 50))).toEqual({ days: 2, hours: 4 });
  });

  it('spreads plain water over its days and leaves other water as it is', () => {
    const plain = water('a', at(17, 9), 250);
    const bottle = water('b', at(18, 20), 2000, { containerId: 'pot', from: at(16, 20) });
    const out = spreadWater([plain, bottle]);
    expect(out[0]).toBe(plain);
    expect(out.slice(1).map((r) => [r.id, r.day, r.ml])).toEqual([
      ['b@2026-11-16', '2026-11-16', 2000 * (4 / 48)],
      ['b@2026-11-17', '2026-11-17', 1000],
      ['b@2026-11-18', '2026-11-18', 2000 * (20 / 48)],
    ]);
    expect(out.every((r) => r.from === undefined)).toBe(true);
    // Spreading what is already spread changes nothing.
    expect(spreadWater(out)).toEqual(out);
  });

  it('splits a tea entry into one spread part per day, each with its share of the grams', () => {
    const e = tea('t', at(18, 20), 2000, { containerId: 'pot', from: at(16, 20) });
    const m: ModelEntry = { id: 't', label: 'Black tea', time: e.time, dayKey: e.day, confidence: 'B', isSupplement: false, parts: [{ label: 'Black tea', grams: 2000, per100: { WATER: 99 }, preparation: 'asListed', storage: 'fresh' }] };
    const parts = spreadEntry(m, e);
    expect(parts.map((p) => [p.id, p.dayKey, p.parts[0]!.grams, p.spread])).toEqual([
      ['t@2026-11-16', '2026-11-16', 2000 * (4 / 48), true],
      ['t@2026-11-17', '2026-11-17', 1000, true],
      ['t@2026-11-18', '2026-11-18', 2000 * (20 / 48), true],
    ]);
    expect(logIdOf(parts[1]!.id)).toBe('t');
    // A cup logged as drunk stays one entry.
    expect(spreadEntry(m, tea('t', at(18, 20), 2000))).toEqual([m]);
  });

  it('finds when a container was last emptied or logged, before a time', () => {
    const w = [water('a', at(16, 20), 2000, { containerId: 'pot' }), water('b', at(17, 9), 250)];
    const log = [tea('t', at(17, 21), 2000, { containerId: 'pot', from: at(16, 20) }), tea('u', at(18, 7), 300)];
    expect(lastFromContainer('pot', w, log, at(18, 20))).toBe(at(17, 21));
    expect(lastFromContainer('pot', w, log, at(17, 21))).toBe(at(16, 20));
    expect(lastFromContainer('bottle', w, log, at(18, 20))).toBeUndefined();
  });

  it('marks the days a tea container covers as logged for water, with no plain water', () => {
    const log = [tea('t', at(18, 20), 2000, { containerId: 'pot', from: at(16, 20) }), tea('c', at(18, 7), 300, { containerId: 'cup' }), tea('u', at(18, 8), 300)];
    expect(containerDrinkDays(log).map((d) => d.day)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-18']);
    const out = waterForDays([water('a', at(17, 9), 250)], log);
    expect(out.filter((r) => r.day === '2026-11-16').map((r) => r.ml)).toEqual([0]);
    expect(out.filter((r) => r.day === '2026-11-17').reduce((a, r) => a + r.ml, 0)).toBe(250);
  });

  it('lists the containers drunk on a day, with that day\'s amount', () => {
    const w = [water('b', at(18, 20), 2000, { containerId: 'bottle', from: at(16, 20) })];
    const log = [tea('t', at(17, 20), 1200, { containerId: 'pot', from: at(16, 8) })];
    const on17 = daySpreads('2026-11-17', w, log);
    expect(on17.map((s) => [s.kind, s.ml])).toEqual([
      ['food', 1200 * (20 / 36)],
      ['water', 1000],
    ]);
    expect(daySpreads('2026-11-19', w, log)).toEqual([]);
  });
});
