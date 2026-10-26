import { describe, expect, it } from 'vitest';
import { weightCheck } from '../../model/parameters';
import { addDays, dayRange } from '../lib/dates';
import { estimateEnergyNeed } from '../model/requirements';
import type { DailyTotals } from '../model/simulate';
import type { ActivityRecord } from '../storage/types';
import { logCheck, sortedWeighIns, weightSlope, weightTrend, type LogCheckInput } from './weight';

const today = '2026-10-29';
const day = (n: number) => addDays(today, -n);
const totals = (kcal: number): DailyTotals => ({ absorbed: { low: {}, central: {}, high: {} }, intake: { ENERCC: kcal }, supplementIntake: {}, missing: new Set() });

/** 40 model days, each logged with `kcal`, and weekly weigh-ins from `kg` changing by `perWeek`. */
type Mutable = Omit<LogCheckInput, 'daily' | 'dayStatus'> & { daily: DailyTotals[]; dayStatus: Record<string, LogCheckInput['dayStatus'][string]> };

function input(kcal: number, kg = 80, perWeek = 0, extra: Partial<LogCheckInput> = {}): Mutable {
  const days = dayRange(day(39), today);
  return {
    history: [28, 21, 14, 7, 0].map((n) => ({ day: day(n), kg: kg + (perWeek * (28 - n)) / 7 })),
    days,
    daily: days.map(() => totals(kcal)),
    dayStatus: Object.fromEntries(days.map((d) => [d, 'logged' as const])),
    today,
    sex: 'male',
    ageYears: 40,
    activity: 'medium',
    ...extra,
  } as Mutable;
}

const burn = () => {
  const n = estimateEnergyNeed('male', 40, 80, 'medium');
  return n.reeKcal * n.pal;
};

describe('weightTrend', () => {
  it('starts at the first weigh-in and moves a share of the way toward each next one, more after a gap', () => {
    const t = weightTrend([
      { day: '2026-10-01', kg: 80 },
      { day: '2026-10-02', kg: 81 },
      { day: '2026-10-09', kg: 81 },
    ]);
    const a = weightCheck.trendSmoothing.value;
    expect(t[0]!.trend).toBe(80);
    expect(t[1]!.trend).toBeCloseTo(80 + a);
    // Seven days without weighing move it as seven days at 81 would.
    expect(t[2]!.trend).toBeCloseTo(81 - (1 - a) ** 8);
  });

  it('keeps one weigh-in per day and drops empty ones', () => {
    expect(sortedWeighIns([{ day: '2026-10-02', kg: 80 }, { day: '2026-10-01', kg: 0 }, { day: '2026-10-02', kg: 79 }])).toEqual([{ day: '2026-10-02', kg: 79 }]);
  });
});

describe('weightSlope', () => {
  it('fits a line and says how sure it is', () => {
    expect(weightSlope([{ day: '2026-10-01', kg: 80 }])).toBeUndefined();
    expect(weightSlope([{ day: '2026-10-01', kg: 80 }, { day: '2026-10-08', kg: 80.7 }])!.perDay).toBeCloseTo(0.1);
    const exact = weightSlope([0, 7, 14].map((n) => ({ day: addDays('2026-10-01', n), kg: 80 + n * 0.1 })))!;
    expect(exact.perDay).toBeCloseTo(0.1);
    expect(exact.se).toBeCloseTo(0);
    const noisy = weightSlope([80, 81, 79.5, 80.5].map((kg, i) => ({ day: addDays('2026-10-01', i * 7), kg })))!;
    expect(noisy.se).toBeGreaterThan(0.02);
  });
});

describe('logCheck', () => {
  it('says the log fits when a steady weight matches the logged energy', () => {
    const c = logCheck(input(burn()));
    expect(c.state).toBe('fits');
    if (c.state !== 'fits') return;
    expect(c.loggedDays).toBe(28);
    expect(c.changeKg).toBeCloseTo(0);
    expect(c.eatenKcal.central).toBeCloseTo(burn());
    // The range is the resting-energy spread times the PAL.
    expect(c.eatenKcal.high - c.eatenKcal.central).toBeCloseTo(weightCheck.reeSpreadKcal.value * 1.6);
  });

  it('flags a log far below what a steady weight needs, with the share missing', () => {
    const c = logCheck(input(burn() * 0.75));
    expect(c.state).toBe('low');
    if (c.state === 'low') expect(c.missingShare).toBeCloseTo(0.25);
  });

  it('counts the energy of a weight change: losing weight on a small log fits', () => {
    // Losing 0.5 kg a week is about 630 kcal a day less than the burn.
    const c = logCheck(input(burn() - 630, 80, -0.5));
    expect(c.state).toBe('fits');
    if (c.state === 'fits') expect(c.changeKg).toBeCloseTo(-2, 0);
    // The same log with a steady weight is too low.
    expect(logCheck(input(burn() - 630)).state).toBe('low');
  });

  it('says when the log is above what the weight says', () => {
    expect(logCheck(input(burn() + 800)).state).toBe('high');
  });

  it('waits for enough weigh-ins, logged days and the age', () => {
    expect(logCheck(input(2500, 80, 0, { history: [{ day: day(3), kg: 80 }, { day: day(0), kg: 80 }] })).state).toBe('needWeighIns');
    const fewDays = input(2500);
    for (const d of fewDays.days.slice(-20)) fewDays.dayStatus[d] = 'unknown';
    expect(logCheck(fewDays)).toMatchObject({ state: 'needLog', loggedDays: 9 });
    expect(logCheck(input(2500, 80, 0, { ageYears: undefined })).state).toBe('needAge');
  });

  it('counts fasted days as logged and leaves out unlogged and partly logged days', () => {
    const i = input(burn());
    i.dayStatus[day(2)] = 'fasted';
    i.daily[i.days.indexOf(day(2))] = totals(0);
    i.dayStatus[day(3)] = 'partial';
    i.dayStatus[day(4)] = 'unknown';
    const c = logCheck(i);
    expect(c.loggedDays).toBe(26);
    if (c.state === 'fits' || c.state === 'low') expect(c.loggedKcal).toBeCloseTo((burn() * 25) / 26);
  });

  it('adds logged activities to the burn when they count', () => {
    // A hard hour of running every day of the window.
    const runs: ActivityRecord[] = dayRange(day(28), day(1)).map((d, i) => ({ id: `r${i}`, schemaVersion: 1, kind: 'run', time: 0, day: d, minutes: 60, intensity: 'hard', outside: true }));
    const without = logCheck(input(burn() + 700));
    expect(without.state).toBe('high');
    const c = logCheck(input(burn() + 700, 80, 0, { activities: runs }));
    expect(c.state).toBe('fits');
    if (c.state !== 'fits') return;
    expect(c.activityKcal).toBeGreaterThan(600);
    expect(c.burnKcal).toBeCloseTo(c.baseKcal + c.activityKcal);
  });

  it('reads a log outside the range the other way: what was burned if it is complete, and the correction for it', () => {
    const c = logCheck(input(burn() * 1.25));
    expect(c.state).toBe('high');
    if (c.state !== 'high') return;
    expect(c.measured?.kcal.central).toBeCloseTo(burn() * 1.25);
    expect(c.measured?.factor).toBeCloseTo(1.25);
    // Never narrower than the method's error for one person.
    expect(c.measured!.kcal.high - c.measured!.kcal.low).toBeGreaterThanOrEqual(2 * weightCheck.methodErrorKcal.value);
    // A fitting log offers nothing to correct.
    const fits = logCheck(input(burn()));
    expect(fits.state === 'fits' && fits.measured).toBeFalsy();
  });

  it('finds the correction that gives the measured burn with activities on top', () => {
    const walks: ActivityRecord[] = dayRange(day(28), day(1)).map((d, i) => ({ id: `w${i}`, schemaVersion: 1, kind: 'walk', time: 0, day: d, minutes: 60, intensity: 'hard', outside: true }));
    const c = logCheck(input(burn() * 1.3, 80, 0, { activities: walks }));
    if (c.state === 'fits' || !('measured' in c) || !c.measured) throw new Error(`expected a measured burn, got ${c.state}`);
    const after = logCheck(input(burn() * 1.3, 80, 0, { activities: walks, energyFactor: c.measured.factor }));
    if (!('burnKcal' in after)) throw new Error(after.state);
    expect(after.burnKcal).toBeCloseTo(c.measured.kcal.central, 0);
  });

  it('uses the accepted correction, after which the same log fits', () => {
    const c = logCheck(input(burn() * 1.25, 80, 0, { energyFactor: 1.25 }));
    expect(c.state).toBe('fits');
    if (c.state === 'fits') expect(c.baseKcal).toBeCloseTo(burn() * 1.25);
  });
});
