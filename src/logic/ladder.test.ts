import { describe, expect, it } from 'vitest';
import type { Requirement } from '../model/requirements';
import type { NutrientResult, StoreResult } from '../model/simulate';
import { ladder } from '../../model/ladder';
import { ladderRungs, youAt } from './ladder';

const range = (v: number) => ({ low: v, central: v, high: v });

const result = (id: string, over: Partial<NutrientResult> = {}): NutrientResult => ({
  id,
  kind: 'rolling',
  status: 'fine',
  value: range(1),
  averageAbsorbed: 1,
  averageIntake: 100,
  windowDays: 7,
  knownDays: 7,
  leftOutDays: 0,
  missingDataDays: 0,
  history: [],
  contributors: [],
  ...over,
});

const req = (id: string, over: Partial<Requirement> = {}): Requirement => ({
  nutrient: id,
  kind: 'recommended',
  recommended: 100,
  physiological: 50,
  physiologicalDerived: false,
  limitOnly: false,
  confidence: 'high',
  source: '',
  ...over,
});

const kinds = (key: string, shape: Partial<Parameters<typeof ladderRungs>[1]> = {}) =>
  ladderRungs(key, { info: false, limitOnly: false, hasUpper: false, ...shape }).map((r) => r.kind);

describe('ladder steps', () => {
  it('runs from far too much to almost none where both are described', () => {
    expect(kinds('VITC')).toEqual(['farOver', 'plenty', 'enough', 'bitLow', 'low', 'none']);
    expect(kinds('ZN', { hasUpper: true })).toEqual(['farOver', 'over', 'enough', 'bitLow', 'low', 'none']);
  });

  it('stops at "under the limit" for a limit-only nutrient, and has no ladder for information only', () => {
    expect(kinds('FASAT', { limitOnly: true })).toEqual(['over', 'enough']);
    expect(kinds('FAT', { info: true })).toEqual([]);
  });

  it('invents no bottom step: a low step with no deficiency described ends there; nothing described keeps the general one', () => {
    expect(kinds('FIBT')).toEqual(['plenty', 'enough', 'bitLow', 'low']);
    expect(kinds('CR')).toEqual(['plenty', 'enough', 'bitLow', 'low', 'none']);
    const cr = ladderRungs('CR', { info: false, limitOnly: false, hasUpper: false });
    expect(cr.find((r) => r.kind === 'none')?.step).toBeUndefined();
  });
});

describe('where you are on the ladder', () => {
  const rungs = (key: string, hasUpper = false) => ladderRungs(key, { info: false, limitOnly: false, hasUpper });

  it('follows the same status as Home', () => {
    expect(youAt('ZN', result('ZN'), req('ZN'), rungs('ZN'))?.kind).toBe('enough');
    expect(youAt('ZN', result('ZN', { status: 'gettingLow' }), req('ZN'), rungs('ZN'))?.kind).toBe('bitLow');
    expect(youAt('ZN', result('ZN', { status: 'low' }), req('ZN'), rungs('ZN'))?.kind).toBe('low');
  });

  it('puts a low intake under the source’s amount on "almost none"', () => {
    expect(youAt('VITC', result('VITC', { status: 'low', averageIntake: 8 }), req('VITC'), rungs('VITC'))?.kind).toBe('none');
    expect(youAt('VITC', result('VITC', { status: 'low', averageIntake: 40 }), req('VITC'), rungs('VITC'))?.kind).toBe('low');
  });

  it('uses the upper limit’s basis for far too much', () => {
    const r = req('ZN', { upperLimit: { value: 25, basis: 'ZN', scope: 'all' } });
    expect(youAt('ZN', result('ZN', { status: 'tooHigh', ulRatio: 1.2 }), r, rungs('ZN', true))?.kind).toBe('over');
    expect(youAt('ZN', result('ZN', { status: 'tooHigh', ulRatio: 2.4 }), r, rungs('ZN', true))?.kind).toBe('farOver');
  });

  it('reads stores by their fill and marks an unclear reading', () => {
    const store: StoreResult = { fill: range(0.1), status: 'low', statusSpan: { low: 'low', high: 'fine' }, capacity: 100, level: range(10), netPerDay: 0, slow: true, history: [] };
    expect(youAt('FE', result('FE', { store, averageIntake: 0 }), req('FE'), rungs('FE'))).toEqual({ kind: 'low', unsure: true });
  });

  it('says nothing without data', () => {
    expect(youAt('ZN', result('ZN', { knownDays: 0 }), req('ZN'), rungs('ZN'))).toBeUndefined();
    expect(youAt('ZN', result('ZN', { status: 'unknown' }), req('ZN'), rungs('ZN'))).toBeUndefined();
  });

  it('tags energy at every level, over the need as too much like Home', () => {
    expect(kinds('ENERCC')).toEqual(['over', 'enough', 'bitLow', 'low']);
    expect(youAt('ENERCC', result('ENERCC', { value: range(1.3) }), req('ENERCC'), rungs('ENERCC'))?.kind).toBe('over');
    expect(youAt('ENERCC', result('ENERCC', { value: range(0.95) }), req('ENERCC'), rungs('ENERCC'))?.kind).toBe('enough');
    expect(youAt('ENERCC', result('ENERCC', { status: 'low', value: range(0.5) }), req('ENERCC'), rungs('ENERCC'))?.kind).toBe('low');
  });

  it('tags every nutrient with a ladder when there is data', () => {
    for (const key of Object.keys(ladder)) {
      const rs = ladderRungs(key, { info: false, limitOnly: key === 'FASAT', hasUpper: true });
      for (const status of ['fine', 'gettingLow', 'low', 'tooHigh'] as const) {
        const r = result(key, { status, kind: key === 'FASAT' ? 'limit' : 'rolling', ulRatio: status === 'tooHigh' ? 1.5 : undefined });
        if (key === 'FASAT' && (status === 'gettingLow' || status === 'low')) continue; // a limit has no low
        expect(youAt(key, r, req(key, { upperLimit: { value: 100, basis: key, scope: 'all' } }), rs), `${key} ${status}`).toBeDefined();
      }
    }
  });
});
