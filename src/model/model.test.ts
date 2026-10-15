import { describe, expect, it } from 'vitest';
import { absorbByRule, absorbIron, absorbMeal, drinkTimingWeight, fatFactor, interpolateLog, ironStatusFactor, type MealComposition } from './absorption';
import { entryIntake } from './intake';
import { nutrientParams, startingLevels } from '../../model/parameters';
import { resolveRequirements } from './requirements';
import { retentionFactor } from './retention';
import { drinkKind, effectiveDayStatus, groupMeals, simulate, type SimulationInput } from './simulate';
import { clearSkyUvIndex, solarElevation, sunVitaminD } from './sun';
import { DEFAULT_MODEL_SETTINGS, type ModelEntry } from './types';

const B12 = nutrientParams.VITB12!.rule;
const VITC = nutrientParams.VITC!.rule;
const CA = nutrientParams.CA!.rule;

function days(start: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(start + 'T12:00:00Z');
  for (let i = 0; i < n; i++) {
    out.push(new Date(d.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

function manual(id: string, day: string, hour: number, amounts: Record<string, number>, opts: Partial<ModelEntry> = {}): ModelEntry {
  return {
    id,
    label: opts.label ?? id,
    time: Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`),
    dayKey: day,
    confidence: 'A',
    isSupplement: true, // amounts listed are complete
    parts: [],
    direct: amounts,
    ...opts,
  };
}

const male30 = resolveRequirements({ sex: 'male', birthYear: 1996, weightKg: 80, activity: 'medium' }, 2026);

function baseInput(dayList: string[], entries: ModelEntry[], extra: Partial<SimulationInput> = {}): SimulationInput {
  return {
    days: dayList,
    dayStatus: {},
    entries,
    requirements: male30,
    settings: DEFAULT_MODEL_SETTINGS,
    startingLevel: 'average',
    weightKg: 80,
    sex: 'male',
    ...extra,
  };
}

describe('requirements', () => {
  it('scales protein with body weight', () => {
    expect(male30.byNutrient.get('PROT625')!.recommended).toBeCloseTo(64);
  });

  it('uses the safer value when sex is not set', () => {
    const r = resolveRequirements({}, 2026);
    expect(r.byNutrient.get('VITC')!.recommended).toBe(110);
    expect(r.byNutrient.get('FE')!.recommended).toBe(16);
    expect(r.defaultsUsed).toEqual(expect.arrayContaining(['age', 'sex', 'weight', 'activity']));
  });

  it('derives the physiological requirement from the typical absorption', () => {
    const b12 = male30.byNutrient.get('VITB12')!;
    expect(b12.recommended).toBe(4);
    expect(b12.physiological).toBeCloseTo(2);
    expect(b12.physiologicalDerived).toBe(true);
  });

  it('picks the iron value by menstruation status (DGE 2024)', () => {
    const young = resolveRequirements({ sex: 'female', birthYear: 1995 }, 2026);
    expect(young.byNutrient.get('FE')!.recommended).toBe(16);
    const older = resolveRequirements({ sex: 'female', birthYear: 1970 }, 2026);
    expect(older.byNutrient.get('FE')!.recommended).toBe(14);
    expect(older.byNutrient.get('FE')!.physiological).toBeCloseTo(1.21);
    const pill = resolveRequirements({ sex: 'female', birthYear: 1995, menstruation: 'none' }, 2026);
    expect(pill.byNutrient.get('FE')!.recommended).toBe(11);
  });

  it('uses the explicit physiological requirement for iron', () => {
    const fe = male30.byNutrient.get('FE')!;
    expect(fe.physiological).toBeCloseTo(0.95);
    expect(fe.physiologicalDerived).toBe(false);
  });

  it('chooses zinc by phytate intake', () => {
    expect(male30.byNutrient.get('ZN')!.recommended).toBe(14);
    const low = resolveRequirements({ sex: 'female', phytate: 'low' }, 2026);
    expect(low.byNutrient.get('ZN')!.recommended).toBe(7);
  });
});

describe('absorption rules', () => {
  it('saturates B12 per meal (intrinsic factor cap + ~1 % passive)', () => {
    // IOM (1998), Adams 1971: ~50 % of 1 µg, 20 % of 5 µg (1.0 µg), just over 5 % of 25 µg (~1.3 µg).
    expect(absorbByRule(B12, 1, 'central', 0.5)).toBeCloseTo(0.51);
    expect(absorbByRule(B12, 5, 'central', 0.5)).toBeGreaterThan(1.0);
    expect(absorbByRule(B12, 5, 'central', 0.5)).toBeLessThan(1.6);
    expect(absorbByRule(B12, 25, 'central', 0.5) / 25).toBeLessThan(0.08);
    const supplement = absorbByRule(B12, 1000, 'central', 0.5);
    expect(supplement).toBeCloseTo(11.5);
    expect(supplement / 1000).toBeLessThan(0.02);
  });

  it('absorbs less B12 from one big meal than from the same amount spread over meals', () => {
    const one = absorbByRule(B12, 8, 'central', 0.5);
    const four = 4 * absorbByRule(B12, 2, 'central', 0.5);
    expect(one).toBeLessThan(four);
  });

  it('lowers the vitamin C fraction at high doses', () => {
    expect(interpolateLog([[0, 0.9], [200, 0.9], [500, 0.73]], 100)).toBeCloseTo(0.9);
    // Levine 1996: complete up to 200 mg, declining from 500 mg.
    expect(absorbByRule(VITC, 100, 'central', 1) / 100).toBeCloseTo(1);
    expect(absorbByRule(VITC, 1250, 'central', 1) / 1250).toBeCloseTo(0.49, 2);
  });

  it('lowers the calcium fraction with the load per meal', () => {
    const omad = absorbByRule(CA, 1000, 'central', 0.3);
    const split = 2 * absorbByRule(CA, 500, 'central', 0.3);
    expect(omad / 1000).toBeCloseTo(0.223, 2);
    expect(split).toBeGreaterThan(omad);
  });

  it('reduces fat-soluble vitamins in low-fat meals', () => {
    // Dawson-Hughes 2015: +32 % with fat → fat-free ≈ 0.76; Roodenburg 2000: 3 g fat is enough.
    expect(fatFactor(0, 'central')).toBeCloseTo(1 / 1.32, 2);
    expect(fatFactor(3, 'central')).toBe(1);
    expect(fatFactor(20, 'central')).toBe(1);
    expect(fatFactor(1.5, 'central')).toBeCloseTo(0.88);
  });

  it('models iron: heme better absorbed, vitamin C helps, tea hurts', () => {
    const meal = (o: Partial<MealComposition>): MealComposition => ({
      intake: { FE: 3, ...(o.intake ?? {}) },
      hemeIron: 0,
      mfpGrams: 0,
      phytateGrams: 0,
      tea: 0,
      coffee: 0,
      ...o,
    });
    const plain = absorbIron(meal({}), 'central');
    expect(plain).toBeCloseTo(0.09); // 3 % of 3 mg
    expect(absorbIron(meal({ hemeIron: 1.5, mfpGrams: 0 }), 'central')).toBeGreaterThan(plain);
    expect(absorbIron(meal({ intake: { FE: 3, VITC: 75 } }), 'central')).toBeCloseTo(3 * 0.08, 3);
    expect(absorbIron(meal({ tea: 1 }), 'central')).toBeLessThan(plain);
    expect(absorbIron(meal({ intake: { FE: 3, CA: 400 } }), 'central')).toBeCloseTo(plain * 0.5);
  });

  it('uses typical fractions when absorption modelling is off', () => {
    const out = absorbMeal({ intake: { VITB12: 100 }, hemeIron: 0, mfpGrams: 0, phytateGrams: 0, tea: 0, coffee: 0 }, 'central', {
      modelled: false,
      typicalFraction: () => 0.5,
    });
    expect(out.VITB12).toBe(50);
  });
});

describe('tea, coffee and iron status', () => {
  it('weights drinks by timing around the meal', () => {
    // Morck 1983: coffee 1 h before no effect, 1 h after full; Ahmad Fuzi 2017: tea 1 h after halves the effect.
    expect(drinkTimingWeight('tea', 0)).toBe(1);
    expect(drinkTimingWeight('tea', -30)).toBe(1);
    expect(drinkTimingWeight('coffee', -60)).toBe(0);
    expect(drinkTimingWeight('tea', 60)).toBeCloseTo(0.5);
    expect(drinkTimingWeight('coffee', 60)).toBe(1);
    expect(drinkTimingWeight('tea', 150)).toBe(0);
  });

  it('absorbs more non-heme iron when stores are low', () => {
    // Dainty 2014: 31 % at ferritin 15 µg/L vs 11 % at 60 µg/L; ~8 mg stores per µg/L.
    expect(ironStatusFactor(0, 'central')).toBeCloseTo(2.8);
    expect(ironStatusFactor(480, 'central')).toBeCloseTo(1);
    expect(ironStatusFactor(1000, 'central')).toBe(1);
    expect(ironStatusFactor(240, 'central')).toBeCloseTo(1.55);
  });

  it('treats tea logged on its own as a drink, not a meal', () => {
    const tea = manual('t', '2026-01-01', 12, {}, { modifiers: { tea: true } });
    expect(drinkKind(tea)).toEqual({ tea: true, coffee: false });
    expect(drinkKind(manual('m', '2026-01-01', 12, { FE: 5 }))).toBeNull();
  });

  it('applies tea to meals by timing', () => {
    const d = ['2026-01-01'];
    const meal = manual('meal', d[0]!, 12, { FE: 10 });
    const teaAt = (minutes: number) => manual('tea', d[0]!, 12, {}, { modifiers: { tea: true }, time: meal.time + minutes * 60_000 });
    const absorbed = (entries: ModelEntry[]) => simulate(baseInput(d, entries)).meals.find((m) => m.entryIds.includes('meal'))!.absorbed.FE!;
    const alone = absorbed([meal]);
    expect(absorbed([meal, teaAt(20)])).toBeLessThan(alone * 0.5);
    expect(absorbed([meal, teaAt(-90)])).toBeCloseTo(alone);
    expect(absorbed([meal, teaAt(180)])).toBeCloseTo(alone);
    const oneHourAfter = absorbed([meal, teaAt(60)]);
    expect(oneHourAfter).toBeLessThan(alone);
    expect(oneHourAfter).toBeGreaterThan(absorbed([meal, teaAt(20)]));
  });

  it('fills an empty iron store faster than reference absorption', () => {
    const d = days('2026-01-01', 7);
    const entries = d.map((day) => manual(`fe-${day}`, day, 12, { FE: 12 }));
    const res = simulate(baseInput(d, entries, { startingLevel: 'empty' }));
    const reference = res.meals.reduce((a, m) => a + (m.absorbed.FE ?? 0), 0) / d.length;
    expect(res.nutrients.get('FE')!.averageAbsorbed).toBeGreaterThan(reference * 2);
  });
});

describe('retention', () => {
  it('reduces vitamin C when boiled, not protein', () => {
    // USDA Release 6 medians: boiled vitamin C 80 %, thiamin 60 %; reheated vitamin C 95 %.
    expect(retentionFactor('VITC', 'boiled', 'fresh', 'central')).toBeCloseTo(0.8);
    expect(retentionFactor('THIA', 'boiled', 'fresh', 'central')).toBeCloseTo(0.6);
    expect(retentionFactor('PROT625', 'boiled', 'freezer', 'central')).toBe(1);
    expect(retentionFactor('VITC', 'asListed', 'fridge', 'central')).toBeCloseTo(0.95);
    expect(retentionFactor('VITC', 'asListed', 'freezer', 'central')).toBeCloseTo(0.9);
    expect(retentionFactor('VITC', 'raw', 'fresh', 'central')).toBe(1);
  });

  it('applies retention and amount uncertainty to food parts', () => {
    const entry: ModelEntry = {
      id: 'e',
      label: 'Broccoli',
      time: 0,
      dayKey: '2026-01-01',
      confidence: 'B',
      isSupplement: false,
      parts: [{ label: 'Broccoli', grams: 200, per100: { VITC: 100, FE: null }, preparation: 'boiled', storage: 'fresh' }],
    };
    const c = entryIntake(entry, 'central', { retention: true });
    expect(c.intake.VITC).toBeCloseTo(160);
    expect(c.missing).toContain('FE');
    const low = entryIntake(entry, 'low', { retention: true });
    expect(low.intake.VITC!).toBeLessThan(c.intake.VITC!);
    expect(entryIntake(entry, 'central', { retention: false }).intake.VITC).toBeCloseTo(200);
  });
});

describe('meals and days', () => {
  it('groups entries within the meal window', () => {
    const t = (h: number) => ({ time: h * 3_600_000 });
    expect(groupMeals([t(12), t(13.5), t(15), t(18)], 120).map((m) => m.length)).toEqual([2, 1, 1]);
  });

  it('derives day status', () => {
    const d = days('2026-01-01', 3);
    const s = effectiveDayStatus(d, { '2026-01-01': 'fasted' }, [manual('a', '2026-01-02', 12, { VITC: 1 })]);
    expect(s).toEqual({ '2026-01-01': 'fasted', '2026-01-02': 'logged', '2026-01-03': 'pending' });
  });
});

describe('simulation', () => {
  it('does not double-count absorption: eating exactly the recommendation gives 100 %', () => {
    const d = days('2026-03-01', 8);
    const entries = d.slice(0, 7).map((day, i) => manual(`m${i}`, day, 12, { MG: 350, FAT: 20 }, { isSupplement: false }));
    const res = simulate(baseInput(d, entries)).nutrients.get('MG')!;
    expect(res.kind).toBe('rolling');
    expect(res.value.central).toBeCloseTo(1, 5);
    expect(res.status).toBe('fine');
  });

  it('shows B12 saturation: OMAD of 8 µg/day fills the tank less than 4 × 2 µg', () => {
    const d = days('2026-01-01', 60);
    const omad = d.map((day, i) => manual(`o${i}`, day, 18, { VITB12: 8 }));
    const spread = d.flatMap((day, i) => [7, 11, 15, 19].map((h) => manual(`s${i}-${h}`, day, h, { VITB12: 2 })));
    const a = simulate(baseInput(d, omad, { startingLevel: 'empty' })).nutrients.get('VITB12')!;
    const b = simulate(baseInput(d, spread, { startingLevel: 'empty' })).nutrients.get('VITB12')!;
    expect(a.kind).toBe('tank');
    expect(a.level!.central).toBeLessThan(b.level!.central);
  });

  it('drains tanks while fasting and keeps them when days are not logged (central)', () => {
    const d = days('2026-01-01', 30);
    const fasted = Object.fromEntries(d.map((day) => [day, 'fasted' as const]));
    const fasting = simulate(baseInput(d, [], { dayStatus: fasted })).nutrients.get('FE')!;
    const unlogged = simulate(baseInput(d, [])).nutrients.get('FE')!;
    const start = startingLevels.averageFraction.value;
    expect(fasting.value.central).toBeLessThan(start);
    expect(unlogged.value.central).toBeCloseTo(start, 2); // neutral imputation
    expect(unlogged.value.low).toBeLessThan(unlogged.value.central); // but the range widens
  });

  it('caps tanks at capacity', () => {
    const d = days('2026-01-01', 10);
    const entries = d.map((day, i) => manual(`f${i}`, day, 12, { FOL: 100_000 }));
    const res = simulate(baseInput(d, entries, { startingLevel: 'average' })).nutrients.get('FOL')!;
    expect(res.value.central).toBeLessThanOrEqual(1);
    expect(res.value.central).toBeGreaterThan(0.9);
  });

  it('flags supplements above the magnesium upper limit, but not magnesium from food', () => {
    const d = days('2026-01-01', 8);
    const food = d.map((day, i) => manual(`f${i}`, day, 12, { MG: 600 }, { isSupplement: false, parts: [] }));
    const supps = d.map((day, i) => manual(`s${i}`, day, 12, { MG: 400 }, { isSupplement: true }));
    expect(simulate(baseInput(d, food)).nutrients.get('MG')!.status).not.toBe('tooHigh');
    expect(simulate(baseInput(d, supps)).nutrients.get('MG')!.status).toBe('tooHigh');
  });

  it('reports rolling nutrients as unknown without any logged day', () => {
    const d = days('2026-01-01', 5);
    expect(simulate(baseInput(d, [])).nutrients.get('VITC')!.status).toBe('unknown');
  });

  it('attributes contributors', () => {
    const d = days('2026-01-01', 2);
    const res = simulate(
      baseInput(d, [manual('a', d[0]!, 12, { VITC: 60 }, { label: 'Pepper' }), manual('b', d[0]!, 12.5, { VITC: 20 }, { label: 'Apple' })]),
    ).nutrients.get('VITC')!;
    expect(res.contributors[0]!.label).toBe('Pepper');
    expect(res.contributors[0]!.share).toBeCloseTo(0.75);
  });
});

describe('vitamin D from sun', () => {
  it('computes solar elevation at solar noon', () => {
    // Around 21 June at 51°N, 10°E, CEST: solar noon ≈ 13:22 → elevation ≈ 62.4°
    expect(solarElevation(2026, 6, 21, 13.37, 2, 51, 10)).toBeCloseTo(62.4, 0);
    // Around 21 December: ≈ 15.6°
    expect(solarElevation(2026, 12, 21, 12.3, 1, 51, 10)).toBeCloseTo(15.6, 0);
  });

  it('gives a plausible summer UV index and none at night', () => {
    expect(clearSkyUvIndex(62)).toBeGreaterThan(7);
    expect(clearSkyUvIndex(-5)).toBe(0);
  });

  it('makes vitamin D in summer but practically none in winter at 51°N', () => {
    const session = [{ startHour: 13, minutes: 20, skin: 'faceHandsArms' as const }];
    const summer = sunVitaminD({ year: 2026, month: 6, day: 21, utcOffsetHours: 2, latitude: 51, sessions: session });
    const winter = sunVitaminD({ year: 2026, month: 12, day: 21, utcOffsetHours: 1, latitude: 51, sessions: session });
    expect(summer.central).toBeGreaterThan(5);
    expect(summer.low).toBeLessThan(summer.central);
    expect(summer.high).toBeGreaterThan(summer.central);
    expect(winter.central).toBeLessThan(0.1);
  });

  it('caps synthesis at about one MED per day', () => {
    const long = sunVitaminD({ year: 2026, month: 6, day: 21, utcOffsetHours: 2, latitude: 51, sessions: [{ startHour: 10, minutes: 300, skin: 'mostOfBody' }] });
    expect(long.central).toBeLessThanOrEqual(0.8 * 400 + 1e-6);
  });
});
