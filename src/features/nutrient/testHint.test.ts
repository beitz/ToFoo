import { describe, expect, it } from 'vitest';
import type { NutrientResult } from '../../model/simulate';
import { testHintText } from './testHint';

const store = (more: Partial<NutrientResult>) => ({ id: 'FE', kind: 'tank', lowForDays: 50, ...more }) as NutrientResult;

describe('blood-test hint', () => {
  it('shows for a slow store whose balance has been low for six weeks, until a blood test is entered', () => {
    expect(testHintText(store({ slow: true }), 'Iron')).toContain('7 weeks');
    expect(testHintText(store({ slow: true, lowForDays: 20 }), 'Iron')).toBeNull();
    expect(testHintText(store({ slow: true, measuredOn: '2026-10-01' }), 'Iron')).toBeNull();
    expect(testHintText(store({ id: 'VITD' }), 'Vitamin D')).toBeNull();
  });
});
