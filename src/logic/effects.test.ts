import { describe, expect, it } from 'vitest';
import { hasEffectText } from '../i18n/effects.en';
import type { Requirement } from '../model/requirements';
import type { NutrientResult, StoreResult } from '../model/simulate';
import { findingOf, summarise } from './effects';

const range = (v: number) => ({ low: v, central: v, high: v });

const result = (id: string, over: Partial<NutrientResult> = {}): NutrientResult => ({
  id,
  kind: 'rolling',
  status: 'fine',
  value: range(1),
  averageAbsorbed: 1,
  averageIntake: 1,
  windowDays: 7,
  knownDays: 7,
  leftOutDays: 0,
  missingDataDays: 0,
  history: [],
  contributors: [],
  ...over,
});

const store = (fill: number, netPerDay: number, status: StoreResult['status']): StoreResult => ({
  fill: range(fill),
  status,
  capacity: 100,
  level: range(fill * 100),
  netPerDay,
  slow: true,
  history: [],
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

describe('what a level means', () => {
  it('says nothing when the level is fine, there is no data, or it is information only', () => {
    expect(findingOf(result('ZN'), req('ZN'), hasEffectText)).toBeUndefined();
    expect(findingOf(result('ZN', { status: 'low', knownDays: 0 }), req('ZN'), hasEffectText)).toBeUndefined();
    expect(findingOf(result('FAT', { kind: 'info', status: 'info' }), undefined, hasEffectText)).toBeUndefined();
  });

  it('names saturated fat over its limit as too much with an effect', () => {
    const f = findingOf(result('FASAT', { kind: 'limit', status: 'tooHigh', value: range(1.5) }), req('FASAT', { limitOnly: true }), hasEffectText);
    expect(f).toMatchObject({ direction: 'high', basis: 'limit', effect: true, status: 'tooHigh' });
  });

  it('tells an upper limit from a safe level', () => {
    const ul = findingOf(result('ZN', { status: 'tooHigh', ulRatio: 1.2 }), req('ZN', { upperLimit: { value: 25, basis: 'ZN', scope: 'all' } }), hasEffectText);
    expect(ul).toMatchObject({ basis: 'upperLimit', effect: true });
    const safe = findingOf(result('MN', { status: 'tooHigh', ulRatio: 1.2 }), req('MN', { upperLimit: { value: 8000, basis: 'MN', scope: 'all', safeLevel: true } }), hasEffectText);
    // No harm known for manganese from food: out of range, but no effect worth a line.
    expect(safe).toMatchObject({ basis: 'safeLevel', effect: false });
  });

  it('follows the store, as Home does: a low store that is filling gets no warning', () => {
    const filling = findingOf(result('FE', { status: 'fine', store: store(0.1, 0.5, 'low') }), req('FE'), hasEffectText);
    expect(filling).toMatchObject({ basis: 'store', filling: true, effect: false });
    const draining = findingOf(result('FE', { status: 'fine', store: store(0.1, -0.5, 'low') }), req('FE'), hasEffectText);
    expect(draining).toMatchObject({ basis: 'store', filling: false, effect: true });
    // Intake below the need but the store full: the store decides.
    expect(findingOf(result('FE', { status: 'low', store: store(0.8, -0.1, 'fine') }), req('FE'), hasEffectText)).toBeUndefined();
  });

  it('does not warn of a shortage when only an own target is missed', () => {
    const own = req('PROT625', { recommended: 160, own: { referenceRecommended: 80, target: { amount: 2.2, per: 'kg' } } });
    // 75 % of 160 g = 120 g, well over the 80 g reference.
    const f = findingOf(result('PROT625', { status: 'low', value: range(0.75), ownTarget: true }), own, hasEffectText);
    expect(f).toMatchObject({ basis: 'ownTarget', effect: false });
    // 30 % of 160 g = 48 g, below the reference too: the shortage applies.
    const short = findingOf(result('PROT625', { status: 'low', value: range(0.3), ownTarget: true }), own, hasEffectText);
    expect(short).toMatchObject({ basis: 'need', effect: true });
  });

  it('treats an own maximum as a goal, not a health effect', () => {
    const f = findingOf(result('CHO', { kind: 'limit', status: 'tooHigh', value: range(1.3), ownTarget: true }), req('CHO', { limitOnly: true, own: { target: { amount: 50, per: 'day' } } }), hasEffectText);
    expect(f).toMatchObject({ basis: 'ownMax', effect: false });
  });

  it('sorts the summary: too much first, the furthest out first, the rest in short groups', () => {
    const reqs = new Map<string, Requirement>([
      ['FASAT', req('FASAT', { limitOnly: true })],
      ['NA', req('NA', { upperLimit: { value: 2400, basis: 'NA', scope: 'all' } })],
      ['ZN', req('ZN')],
      ['MG', req('MG')],
      ['CR', req('CR')],
      ['VITC', req('VITC')],
      ['K', req('K')],
      ['CU', req('CU')],
    ]);
    const s = summarise(
      [
        result('ZN', { status: 'low', value: range(0.5) }),
        result('FASAT', { kind: 'limit', status: 'tooHigh', value: range(1.3) }),
        result('NA', { status: 'tooHigh', ulRatio: 1.6 }),
        result('MG', { status: 'gettingLow', value: range(0.8) }),
        result('CR', { status: 'low', value: range(0.4) }),
        result('VITC'),
        result('K', { knownDays: 0 }),
        result('CU', { status: 'low', value: range(0.2) }),
        result('FAT', { kind: 'info', status: 'info' }),
      ],
      reqs,
      hasEffectText,
      new Set(['CU']),
    );
    expect(s.effects.map((f) => f.id)).toEqual(['NA', 'FASAT', 'ZN']);
    expect(s.aBitLow.map((f) => f.id)).toEqual(['MG']);
    expect(s.noEffect.map((f) => f.id)).toEqual(['CR']); // no known chromium deficiency
    expect(s.fine).toEqual(['VITC']);
    expect(s.noData).toEqual(['K']);
  });
});
