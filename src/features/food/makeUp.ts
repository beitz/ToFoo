import { t } from '../../i18n';
import { fmtGrams, fmtNumber } from '../../lib/format';
import type { RawValue } from '../../model/types';

const MACROS = [
  ['FAT', 'check.fat'],
  ['PROT625', 'check.protein'],
  ['CHO', 'check.carbs'],
] as const;

/** "42 kcal · fat – · protein 0.5 g · carbs 3 g": energy and macros per 100 g, to set a label beside its BLS food. */
export function makeUp(per100: Readonly<Record<string, RawValue>>): string {
  const g = (v: RawValue | undefined) => (typeof v === 'number' ? fmtGrams(v) : v === 't' ? '0 g' : '–');
  const kcal = per100.ENERCC;
  return [typeof kcal === 'number' ? `${fmtNumber(kcal)} kcal` : '– kcal', ...MACROS.map(([id, key]) => `${t(key)} ${g(per100[id])}`)].join(' · ');
}
