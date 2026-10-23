import { describe, expect, it } from 'vitest';
import { periodBreakdown } from './period';
import { resolveRequirements } from './requirements';
import { simulate, type SimulationInput } from './simulate';
import { DEFAULT_MODEL_SETTINGS, type ModelEntry } from './types';

const req = resolveRequirements({ sex: 'male', birthYear: 1996, weightKg: 80, activity: 'medium' }, 2026);
const DAYS = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];

function vitC(id: string, day: string, mg: number, extra: Partial<ModelEntry> = {}): ModelEntry {
  return { id, label: id, time: Date.parse(`${day}T12:00:00Z`), dayKey: day, confidence: 'A', isSupplement: true, parts: [], direct: { VITC: mg }, ...extra };
}

function run(imputeUnlogged: boolean, entries: ModelEntry[], from = DAYS[0]!, to = DAYS[4]!, dayStatus: SimulationInput['dayStatus'] = {}) {
  const input: SimulationInput = {
    days: DAYS,
    // 03 fasted; 04 nothing logged; 05 is today with nothing yet (pending).
    dayStatus: { '2026-10-03': 'fasted', ...dayStatus },
    entries,
    requirements: req,
    settings: { ...DEFAULT_MODEL_SETTINGS, imputeUnlogged },
    startingLevel: 'average',
    weightKg: 80,
    sex: 'male',
  };
  return periodBreakdown({ days: DAYS, sim: simulate(input), requirements: req, imputeUnlogged, from, to });
}

const entries = [vitC('a', '2026-10-01', 100), vitC('b', '2026-10-02', 100)];

describe('periodBreakdown', () => {
  it('averages logged intake over logged, fasted and (by default) unlogged days', () => {
    const p = run(false, entries);
    expect(p.statusCounts).toEqual({ logged: 2, partial: 0, fasted: 1, unknown: 1, filled: 0, excluded: 0, pending: 1 });
    expect(p.countedDays).toBe(4);
    expect(p.counted).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(p.nutrients.get('VITC')!.averageIntake).toBeCloseTo(50);
  });

  it('leaves unlogged days out when they are filled in by the model', () => {
    const p = run(true, entries);
    expect(p.countedDays).toBe(3);
    expect(p.counted).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(p.nutrients.get('VITC')!.averageIntake).toBeCloseTo(200 / 3);
  });

  it('leaves out a day marked filled in or left out, whatever the setting', () => {
    for (const st of ['filled', 'excluded'] as const) {
      const p = run(false, entries, DAYS[0], DAYS[4], { '2026-10-04': st });
      expect(p.statusCounts[st]).toBe(1);
      expect(p.countedDays).toBe(3);
      expect(p.nutrients.get('VITC')!.averageIntake).toBeCloseTo(200 / 3);
    }
  });

  it('covers only the chosen range and compares absorbed amounts with the absorbed need', () => {
    const p = run(false, entries, '2026-10-02', '2026-10-03');
    expect(p.days).toBe(2);
    const c = p.nutrients.get('VITC')!;
    expect(c.averageIntake).toBeCloseTo(50);
    expect(c.kind).toBe('rolling');
    expect(c.value.central).toBeCloseTo(c.averageAbsorbed / req.byNutrient.get('VITC')!.physiological);
    expect(c.history).toEqual([]);
  });

  it('shows no value when no day in the range counts', () => {
    const p = run(true, entries, '2026-10-04', '2026-10-05');
    expect(p.countedDays).toBe(0);
    expect(p.nutrients.get('VITC')!.status).toBe('unknown');
  });

  it('counts days on which a food had no data for a nutrient', () => {
    const part = { label: 'x', grams: 100, per100: { VITC: null }, preparation: 'asListed' as const, storage: 'fresh' as const };
    const p = run(false, [...entries, vitC('c', '2026-10-02', 0, { isSupplement: false, direct: undefined, parts: [part] })]);
    expect(p.nutrients.get('VITC')!.missingDataDays).toBe(1);
  });
});
