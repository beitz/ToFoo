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

/**
 * How fast the body's level follows a change in intake, where a study measured it (owner's question,
 * 2026-10-27: how fast can I fill up on omega-3?). Shown as quick facts; the model's own window for
 * these nutrients is `slowWindow` in parameters.ts.
 */
export interface TurnoverFact extends Cited {
  value: {
    /** Where the measured level sits. */
    where: 'redCells';
    /** Days until half of a change in intake shows. */
    halfLifeDays: number;
    /** Days until the level stops moving. */
    steadyDays: number;
  };
}

export const turnover: Record<string, TurnoverFact> = {
  EPADHA: {
    value: { where: 'redCells', halfLifeDays: 28, steadyDays: 180 },
    source: 'Katan MB et al. (1997): Kinetics of the incorporation of dietary fatty acids into serum cholesteryl esters, erythrocyte membranes, and adipose tissue: an 18-month controlled study. J Lipid Res 38:2012–2022',
    url: 'https://pubmed.ncbi.nlm.nih.gov/9374124/',
    confidence: 'medium',
    note: 'Checked (abstract, 2026-10-27): EPA in red blood cells "showed a half-life of 28 days; a steady state was reached after 180 days". Measured for EPA; DHA is assumed to follow alike. Arterburn 2006 (PMID 16841856): "Limited storage of the n-3 fatty acids in adipose tissue", so no store size in grams is given.',
  },
};

/**
 * The omega-3 index (EPA + DHA as % of the fatty acids in red blood cells) after about five months of a
 * daily EPA + DHA amount, in BLS units (g per day), for adults who started at 4.3 % on average.
 */
export const omega3Index: Cited & { value: { start: number; months: number; doses: ReadonlyArray<readonly [number, number]> } } = {
  value: {
    start: 4.3,
    months: 5,
    doses: [
      [0, 4.35],
      [0.3, 6.19],
      [0.6, 6.82],
      [0.9, 7.53],
      [1.8, 9.49],
    ],
  },
  source: 'Flock MR et al. (2013): Determinants of erythrocyte omega-3 fatty acid content in response to fish oil supplementation: a dose-response randomized controlled trial. J Am Heart Assoc 2:e000513, Table 4',
  url: 'https://pubmed.ncbi.nlm.nih.gov/24252845/',
  confidence: 'high',
  note: 'Checked (full text, 2026-10-27): 115 healthy adults, fish oil capsules for about 5 months; baseline 4.3 % (2.3–6.8 %). The authors: "at least 1 g/day of EPA+DHA for 5 months" to reach 8 %. Fish is assumed to count like capsules gram for gram (Walker 2019, PMID 31396625, found the form matters by about 1 point).',
};

/** Omega-3 index levels: at or above `good` the most protection, at or below `poor` the least. */
export const omega3IndexLevels: Cited & { value: { good: number; poor: number } } = {
  value: { good: 8, poor: 4 },
  source: 'Harris WS, von Schacky C (2004): The Omega-3 Index: a new risk factor for death from coronary heart disease? Prev Med 39:212–220',
  url: 'https://pubmed.ncbi.nlm.nih.gov/15208005/',
  confidence: 'medium',
  note: 'Checked (abstract, 2026-10-27): "An Omega-3 Index of ≥ 8% was associated with the greatest cardioprotection, whereas an index of ≤ 4% was associated with the least."',
};
