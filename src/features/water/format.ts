import { fmtNumber } from '../../lib/format';

/** "250 ml" below a litre, "1.4 l" from a litre. */
export function waterText(ml: number): string {
  return ml < 1000 ? `${fmtNumber(ml)} ml` : `${fmtNumber(ml / 1000, 1)} l`;
}
