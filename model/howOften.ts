/**
 * "How often" on the nutrient page (owner's ask, 2026-10-26: "how often do I need to eat fish to
 * compensate?"): a food rule from the DGE's food-based guidelines, only where that guideline names the
 * nutrient and says how often. Texts are in src/i18n/howOften.en.ts (`often.<id>`).
 *
 * Read 2026-10-26 from "Gut essen und trinken – die DGE-Empfehlungen" (adults 18–65 on a mixed diet).
 * Rules the page gives without a frequency (prefer plant oils, choose whole grain) and the meat maximum
 * (a limit, not a "how often") are left out.
 */
import type { Cited } from '../src/model/paramTypes';

export interface HowOften extends Cited {
  /**
   * BLS foods to put a number on the rule: how many days of the reference intake 100 g covers. Only for
   * weekly rules on nutrients the body evens out over weeks (the 'slow' window), so "covers 8 days" is
   * something a meal a week can really do; a daily rule needs no such number.
   */
  examples?: readonly string[];
}

const DGE_RULES = {
  source: 'DGE (2024): Gut essen und trinken – die DGE-Empfehlungen',
  url: 'https://www.dge.de/gesunde-ernaehrung/gut-essen-und-trinken/dge-empfehlungen/',
  confidence: 'high',
} as const;

const DAIRY = 'Rule 6, "Milch und Milchprodukte jeden Tag": "Milch und Milchprodukte liefern insbesondere Eiweiß, Calcium, Jod, Vitamin B2 und Vitamin B12".';
const NUTS =
  'Rule 3: "Nüsse täglich eine kleine Handvoll"; "Nüsse liefern zusätzlich lebensnotwendige Fettsäuren". Rule 5: "Pflanzliche Öle sind reich an lebensnotwendigen Fettsäuren und Vitamin E" (no frequency given).';

export const howOften: Readonly<Record<string, HowOften>> = {
  EPADHA: {
    ...DGE_RULES,
    note: 'Rule 7, "Fisch jede Woche": "ein- bis zweimal Fisch pro Woche"; "Fettreicher Fisch liefert wertvolle Omega-3-Fettsäuren". No portion size given, so the examples use 100 g.',
    // Herring, salmon, mackerel (raw): the fatty fish the DGE page and the effect text name.
    examples: ['T102100', 'T410100', 'T107100'],
  },
  ID: {
    ...DGE_RULES,
    note: `Rule 7: "ein- bis zweimal Fisch pro Woche"; "Seefisch ist eines der wenigen Lebensmittel, das von Natur aus Jod enthält". ${DAIRY}`,
  },
  CA: { ...DGE_RULES, note: DAIRY },
  RIBF: { ...DGE_RULES, note: DAIRY },
  VITB12: { ...DGE_RULES, note: DAIRY },
  PROT625: { ...DGE_RULES, note: `${DAIRY} Rule 3: "Hülsenfrüchte mindestens einmal pro Woche"; they "sind reich an Eiweiß".` },
  FIBT: {
    ...DGE_RULES,
    note: 'Rule 2: at least 5 portions of fruit and vegetables a day, they "liefern reichlich Vitamine, Mineralstoffe, Ballaststoffe"; rule 3: legumes at least once a week, rich in fibre; rule 4: "Insbesondere die Ballaststoffe im Vollkorn senken das Risiko für viele Krankheiten".',
  },
  'F18:2CN6': { ...DGE_RULES, note: NUTS },
  'F18:3CN3': { ...DGE_RULES, note: NUTS },
};
