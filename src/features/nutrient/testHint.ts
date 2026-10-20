import { slowStore } from '../../../model/parameters';
import { t, type MessageKey } from '../../i18n';
import type { NutrientResult } from '../../model/simulate';

const TESTS = new Set(['FE', 'VITB12', 'FOL']);

/** Text of the "low for weeks, check with a blood test" hint, or null when it doesn't apply. */
export function testHintText(r: NutrientResult, name: string): string | null {
  if (!r.slow || r.measuredOn || (r.lowForDays ?? 0) < slowStore.testHintDays.value) return null;
  const weeks = Math.floor(r.lowForDays! / 7);
  return TESTS.has(r.id)
    ? t('nutrient.testHint', { name, weeks, test: t(`test.${r.id}` as MessageKey) })
    : t('nutrient.testHintNoTest', { name, weeks });
}

