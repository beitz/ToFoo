/**
 * Quick facts in "What it does" on the nutrient page (owner's ask, 2026-10-26: more to learn per
 * nutrient, shown with visual elements rather than text). Whether the body can make a nutrient itself;
 * how much of it is taken up and how much survives cooking come from model/parameters.ts.
 *
 * Read 2026-10-26 from the Linus Pauling Institute's Micronutrient Information Center and the sources the
 * nutrient summaries already cite (src/i18n/nutrientInfo.en.ts).
 */
import type { Cited } from '../src/model/paramTypes';

/**
 * - `no`: the body cannot make it, all of it comes from food;
 * - `partly`: it makes some of the parts, not all (protein: the non-essential amino acids);
 * - `yes`: it makes all it needs, from other food (saturated fat);
 * - `little`: it makes a little from another nutrient, not enough to rely on;
 * - `sun`: it makes it in the skin from sunlight;
 * - `gut`: gut bacteria make some, how much the body gets is unclear.
 */
export type BodyMakes = 'no' | 'partly' | 'yes' | 'little' | 'sun' | 'gut';

export interface BodyMakesFact extends Cited {
  value: BodyMakes;
}

const lpi = (path: string, name: string) => ({
  source: `Linus Pauling Institute, Micronutrient Information Center: ${name}`,
  url: `https://lpi.oregonstate.edu/mic/${path}`,
});
const EFA = lpi('other-nutrients/essential-fatty-acids', 'Essential fatty acids');
const EFSA_DRV = { source: 'EFSA Dietary Reference Values for nutrients, summary report (2017)', url: 'https://doi.org/10.2903/sp.efsa.2017.e15121' };
// Vitamins are by definition what the body cannot make enough of; minerals are elements, nothing makes them.
const NOT_MADE = { value: 'no' as const, ...EFSA_DRV, confidence: 'high' as const };

/** Per info key (see `infoId`). Energy, fibre and the info-only nutrients have none. */
export const bodyMakes: Record<string, BodyMakesFact> = {
  PROT625: { value: 'partly', ...EFSA_DRV, confidence: 'high', note: 'The body makes the non-essential amino acids; the nine essential ones must come from food.' },
  EAA: { value: 'no', ...EFSA_DRV, confidence: 'high' },
  FASAT: { value: 'yes', ...EFA, confidence: 'high', note: 'LPI: "humans … can synthesize saturated fatty acids and some monounsaturated fatty acids from carbon groups in carbohydrates and proteins".' },
  'F18:2CN6': { value: 'no', ...EFA, confidence: 'high', note: 'LPI: linoleic and α-linolenic acid "cannot be synthesized by humans".' },
  'F18:3CN3': { value: 'no', ...EFA, confidence: 'high' },
  EPADHA: { value: 'little', ...EFA, confidence: 'high', note: 'LPI: EPA and DHA "can be synthesized from ALA, but due to low conversion efficiency, it is recommended to consume foods rich in EPA and DHA".' },
  VITAA: { value: 'no', ...lpi('vitamins/vitamin-A', 'Vitamin A'), confidence: 'high', note: 'Retinol, or made from the beta-carotene in food (counted in as retinol activity equivalents).' },
  VITD: { value: 'sun', ...lpi('vitamins/vitamin-D', 'Vitamin D'), confidence: 'high', note: 'LPI: "Vitamin D can be synthesized in the skin upon exposure to sunlight".' },
  VITE: NOT_MADE,
  VITK: { value: 'gut', ...lpi('vitamins/vitamin-K', 'Vitamin K'), confidence: 'medium', note: 'LPI: "bacteria that normally inhabit the large intestine synthesize menaquinones (vitamin K2), although it is unclear whether significant amounts are absorbed and utilized".' },
  THIA: NOT_MADE,
  RIBF: NOT_MADE,
  NIAEQ: { value: 'little', ...lpi('vitamins/niacin', 'Niacin'), confidence: 'high', note: 'LPI: "The essential amino acid tryptophan can also be converted into NAD". Niacin equivalents in BLS already count this in.' },
  PANTAC: NOT_MADE,
  VITB6: NOT_MADE,
  BIOT: { value: 'no', ...lpi('vitamins/biotin', 'Biotin'), confidence: 'high', note: 'LPI: "Biotin cannot be synthesized by mammalian cells and must be obtained from exogenous sources".' },
  FOL: NOT_MADE,
  VITB12: { value: 'no', ...lpi('vitamins/vitamin-B12', 'Vitamin B12'), confidence: 'high', note: 'LPI: "Only certain bacteria and archaea can synthesize vitamin B12".' },
  VITC: { value: 'no', ...lpi('vitamins/vitamin-C', 'Vitamin C'), confidence: 'high', note: 'Humans, unlike most animals, cannot make vitamin C.' },
  NA: NOT_MADE,
  CLD: NOT_MADE,
  K: NOT_MADE,
  CA: NOT_MADE,
  MG: NOT_MADE,
  P: NOT_MADE,
  FE: NOT_MADE,
  ZN: NOT_MADE,
  ID: NOT_MADE,
  SE: NOT_MADE,
  CU: NOT_MADE,
  MN: NOT_MADE,
  FD: NOT_MADE,
  CR: NOT_MADE,
  MO: NOT_MADE,
};
