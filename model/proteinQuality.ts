/**
 * Protein quality on the protein page (owner's ask, 2026-11-20: "which nutrients belong to protein, and
 * further information", deeper the more you tap): how much of a protein the gut takes up, the quality
 * scores PDCAAS and DIAAS, and how much protein and leucine a meal needs for muscle building.
 *
 * The amino acid make-up of each food comes from BLS and the requirement pattern from
 * `aminoAcidPattern` in reference-values.ts; this file holds only what BLS cannot give. Every number
 * was read in the source's full text or abstract on 2026-11-20.
 */
import type { Valued } from '../src/model/paramTypes';

const WHO_2007 = 'WHO/FAO/UNU (2007): Protein and amino acid requirements in human nutrition. WHO Technical Report Series 935';
const WHO_URL = 'https://iris.who.int/handle/10665/43411';
const FAO_2013 = 'FAO (2013): Dietary protein quality evaluation in human nutrition. Report of an FAO Expert Consultation. FAO Food and Nutrition Paper 92';
const FAO_URL = 'https://www.fao.org/3/i3124e/i3124e.pdf';

/** A row of WHO's digestibility table, with the BLS food that stands for it on the page. */
export interface DigestibilityRow {
  /** Key of the row's name in the UI strings (`pq.dig.<key>`). */
  key: string;
  /** True (faecal) digestibility of the protein in humans, %. */
  pct: number;
  /** The BLS 4.0 food whose amino acids go with it in the score table (raw or dry, the same protein). */
  bls: string;
}

/**
 * True digestibility of protein in humans, from WHO 2007 Table 5 ("Values for the digestibility of
 * protein in humans", taken from the 1991 FAO/WHO consultation). Only rows with a matching BLS food;
 * the table also lists mixed national diets and cereals as breakfast flakes.
 */
export const proteinDigestibility: Valued<DigestibilityRow[]> = {
  value: [
    { key: 'egg', pct: 97, bls: 'E111100' },
    { key: 'wheatRefined', pct: 96, bls: 'C214100' },
    { key: 'milk', pct: 95, bls: 'M111200' },
    { key: 'soyIsolate', pct: 95, bls: 'H011000' },
    { key: 'peanutButter', pct: 95, bls: 'H110800' },
    { key: 'meatFish', pct: 94, bls: 'U281100' },
    { key: 'peas', pct: 88, bls: 'G760400' },
    { key: 'rice', pct: 88, bls: 'C352000' },
    { key: 'oatmeal', pct: 86, bls: 'C133000' },
    { key: 'wheatWhole', pct: 86, bls: 'C211000' },
    { key: 'soyFlour', pct: 86, bls: 'H764400' },
    { key: 'maize', pct: 85, bls: 'C341000' },
    { key: 'beans', pct: 78, bls: 'H739400' },
  ],
  source: `${WHO_2007}, Table 5`,
  url: WHO_URL,
  confidence: 'medium',
  note: 'True faecal nitrogen digestibility measured in humans (1991 consultation). WHO notes that ileal digestibility of single amino acids can be lower. The BLS foods are ToFoo\'s pick of the closest match (milk for "milk, cheese", beef round for "meat, fish", white rice for "rice, polished", haricot beans for "beans", wheat flour type 405 for "wheat, refined").',
};

/**
 * DIAAS, the score FAO recommended in 2013, needs the ileal digestibility of every amino acid, which
 * FAO itself found too scarce to use in practice; so ToFoo shows FAO's own worked examples instead of
 * computing it, scored against the pattern FAO gives for older children, adolescents and adults.
 */
export const diaasExamples: Valued<{ milkPowder: number; mix: number; mixGrams: { wheat: number; peas: number; milkPowder: number }; excellent: number; good: number }> = {
  value: { milkPowder: 143, mix: 82, mixGrams: { wheat: 400, peas: 100, milkPowder: 35 }, excellent: 100, good: 75 },
  source: `${FAO_2013}, Tables 1 and 2 and section 4.8`,
  url: FAO_URL,
  confidence: 'high',
  note: 'Whole milk powder 143 (sulphur amino acids lowest) and a mix of 400 g wheat, 100 g peas and 35 g milk powder 82 (lysine lowest), both for "older child, adolescent, adult". Cut-offs: "excellent/high (e.g. 100 or more), good/source (e.g. 75-99), and no claim"; FAO says "quality cannot be substituted for quantity".',
};

/** Per-meal protein and leucine for muscle building in people who exercise (ISSN position stand). */
export const perMealProtein: Valued<{ gPerKg: number; gMin: number; gMax: number; leucineMinG: number; leucineMaxG: number; hoursMin: number; hoursMax: number }> = {
  value: { gPerKg: 0.25, gMin: 20, gMax: 40, leucineMinG: 0.7, leucineMaxG: 3, hoursMin: 3, hoursMax: 4 },
  source: 'Jäger R et al. (2017): International Society of Sports Nutrition Position Stand: protein and exercise. J Int Soc Sports Nutr 14:20',
  url: 'https://doi.org/10.1186/s12970-017-0177-8',
  confidence: 'medium',
  note: 'Abstract: "0.25 g of a high-quality protein per kg of body weight, or an absolute dose of 20-40 g"; "700-3000 mg of leucine"; "evenly distributed, every 3-4 h". For exercising people building or keeping muscle, not a need for health.',
};

/**
 * Leucine per meal proposed as the point of peak muscle building, and how much leucine plant and animal
 * proteins carry (Mariotti & Gardner's review, citing a USDA set of 18 plant and 6 animal proteins).
 */
export const leucineFacts: Valued<{ thresholdG: number; plantPer100gProtein: number; animalPer100gProtein: number }> = {
  value: { thresholdG: 3, plantPer100gProtein: 8, animalPer100gProtein: 9.5 },
  source: 'Mariotti F, Gardner CD (2019): Dietary Protein and Amino Acids in Vegetarian Diets — A Review. Nutrients 11:2661',
  url: 'https://doi.org/10.3390/nu11112661',
  confidence: 'medium',
  note: '"a threshold (3 g) for peak anabolism has also been proposed for meal leucine"; plant proteins "an average of 8 g/100 g … versus an average of 9.5 g/100 g" for animal proteins. The same review: no evidence that plant proteins "need to be supplemented with other proteins in the same meal".',
};

/** How much substances in plant foods lower protein digestion (review of rat, pig and poultry studies). */
export const antinutrients: Valued<{ phytateUpToPct: number; tanninsUpToPct: number; trypsinInhibitorsUpToPct: number }> = {
  value: { phytateUpToPct: 10, tanninsUpToPct: 23, trypsinInhibitorsUpToPct: 50 },
  source: 'Gilani GS, Xiao CW, Cockell KA (2012): Impact of antinutritional factors in food proteins on the digestibility of protein and the bioavailability of amino acids and on protein quality. Br J Nutr 108 Suppl 2:S315–32',
  url: 'https://doi.org/10.1017/S0007114512002371',
  confidence: 'medium',
  note: 'Abstract: phytate at "normally encountered levels" up to 10 %; high tannin levels up to 23 %; high trypsin inhibitor levels (soya, kidney beans) up to 50 %, in rats and/or pigs. Upper ends at high levels in animals, not typical human meals.',
};
