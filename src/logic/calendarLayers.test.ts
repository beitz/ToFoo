import { describe, expect, it } from 'vitest';
import { dayLayers, layerCounts, type LayersInput } from './calendarLayers';

const key = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
const at = (day: number, h: number) => new Date(2026, 9, day, h).getTime();

const base: LayersInput = {
  days: [key(18), key(19), key(20), key(21), key(22)],
  today: key(22),
  dayStatus: { [key(18)]: 'logged', [key(19)]: 'unknown', [key(20)]: 'fasted', [key(21)]: 'unknown', [key(22)]: 'pending' },
  sleep: [
    { day: key(19), start: at(18, 23), end: at(19, 7) },
    { day: key(21), start: at(21, 1), end: at(21, 3) },
    { day: key(21), start: at(21, 4), end: at(21, 8) },
    { day: key(22), start: at(21, 23) },
  ],
  activities: [
    { day: key(20), minutes: 25 },
    { day: key(20), minutes: 30 },
  ],
  water: [],
  journal: [{ day: key(19) }, { day: key(19) }],
  skipped: { [key(21)]: ['food'] },
};

describe('calendar layers', () => {
  it('marks meals from the day status: unknown is missing unless skipped, today is not judged', () => {
    const l = dayLayers(base);
    expect(base.days.map((d) => l.get(d)!.marks.meals)).toEqual(['logged', 'missing', 'logged', 'skipped', 'none']);
  });

  it('marks a tracker missing only on past days from its first use', () => {
    const l = dayLayers(base);
    expect(base.days.map((d) => l.get(d)!.marks.sleep)).toEqual(['none', 'logged', 'missing', 'logged', 'none']);
    expect(base.days.map((d) => l.get(d)!.marks.activity)).toEqual(['none', 'none', 'logged', 'missing', 'none']);
    expect(base.days.map((d) => l.get(d)!.marks.water)).toEqual(['none', 'none', 'none', 'none', 'none']);
  });

  it('adds up sleep, activity and journal per day; a sleep still going does not count', () => {
    const l = dayLayers(base);
    expect(l.get(key(21))!.sleepMinutes).toBe(6 * 60);
    expect(l.get(key(22))!.sleepMinutes).toBe(0);
    expect(l.get(key(20))!.activityMinutes).toBe(55);
    expect(l.get(key(19))!.journal).toBe(2);
    expect(l.get(key(19))!.marks.journal).toBe('logged');
    expect(l.get(key(20))!.marks.journal).toBe('none');
  });

  it('counts logged and missing days per layer', () => {
    expect(layerCounts(dayLayers(base), 'meals')).toEqual({ logged: 2, missing: 1 });
    expect(layerCounts(dayLayers(base), 'activity')).toEqual({ logged: 1, missing: 1 });
  });
});
