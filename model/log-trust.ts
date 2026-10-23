/**
 * How far a food log can see each nutrient (accuracy review 2026-10-20, proposal 7; built 2026-10-23 on
 * the owner's pick): a trust mark per nutrient on its page, so a line at 85 % for potassium and one at 85 %
 * for iodine don't look equally certain. A grading by the app, not a number from a source: the reasons
 * and the studies behind them are cited per reason. It changes no status; the low/central/high runs do
 * that (see "unsure" in src/model/simulate.ts).
 */
import type { Cited } from '../src/model/paramTypes';

/**
 * good: the log sees it well (macros, the best-measured values in food tables).
 * rough: clear lows and highs are real, the band around the need is not (food-table and cooking spread).
 * blind: the main source or the main loss is something a food log can't see.
 */
export type LogTrust = 'good' | 'rough' | 'blind';

/** Why a nutrient has its mark; the sentence is `trust.reason.<key>` in src/i18n/en.ts. */
export type TrustReason = 'macro' | 'micro' | 'store' | 'iodine' | 'sun' | 'salt' | 'selenium' | 'fluoride';

export const trustReasons: Record<TrustReason, Cited> = {
  macro: {
    source: 'Duplicate-diet studies: energy and macronutrients calculated from food tables mostly within about 20 % of chemical analysis over a whole diet (Wageningen, Evaluation of calculated energy and macronutrient contents of diets)',
    url: 'https://research.wur.nl/en/publications/evaluation-of-calculated-energy-and-macronutrient-contents-of-die',
    confidence: 'medium',
  },
  micro: {
    source: 'Greenfield H, Southgate DAT (2003) Food composition data, FAO, ch. 1: natural variation in micronutrient content is large; IOM (2000) Dietary Reference Intakes: Applications in Dietary Assessment, ch. 4: only intakes well above or below the requirement can be judged with confidence',
    url: 'https://www.nationalacademies.org/read/9956/chapter/5',
    confidence: 'assumption',
    note: 'Spread of about ±30–50 % per nutrient after food table, cooking and absorption is the accuracy review’s own estimate.',
  },
  store: {
    source: 'Armah SM et al. (2013) J Nutr 143:1136: iron status, not the meal, explains most of the difference in iron absorption; Porter KM et al. (2021) Am J Clin Nutr: B12 deficiency in 38 % of older adults with atrophic gastritis',
    url: 'https://pubmed.ncbi.nlm.nih.gov/23700342/',
    confidence: 'medium',
    note: 'Intake is seen roughly; the store depends on losses (periods, blood donation) and absorption problems the log can’t see. A blood test helps (ferritin, holoTC).',
  },
  iodine: {
    source: 'BfR, Iodine: the iodine supply in Germany is declining; whether bakers and food makers use iodised salt can’t be seen from a food table',
    url: 'https://www.bfr.bund.de/en/a-z_index/iodine-4752.html',
    confidence: 'medium',
  },
  sun: {
    source: 'DGE reference values, vitamin D: usual food provides 2–4 µg a day; the skin’s own production in the sun is the main source',
    url: 'https://www.dge.de/wissenschaft/referenzwerte/vitamin-d/',
    confidence: 'high',
  },
  salt: {
    source: 'NIH Office of Dietary Supplements, Sodium fact sheet: most sodium comes from salt in bought and prepared foods, and salt added at the table is rarely recorded',
    url: 'https://ods.od.nih.gov/factsheets/Sodium-HealthProfessional/',
    confidence: 'medium',
  },
  selenium: {
    source: 'Not in BLS 4.0: estimated from the UK table CoFID 2021 via the most alike food (data/README.md); soil and feed make selenium in food vary between countries',
    url: 'https://ods.od.nih.gov/factsheets/Selenium-HealthProfessional/',
    confidence: 'assumption',
  },
  fluoride: {
    source: 'EFSA (2025) Scientific opinion on fluoride: drinking water, tea and fluoridated salt are the main sources besides toothpaste, and vary by place and brand',
    url: 'https://doi.org/10.2903/j.efsa.2025.9478',
    confidence: 'medium',
  },
};

const mark = (trust: LogTrust, reason: TrustReason) => ({ trust, reason });

/** Every tracked nutrient has a mark (tested). */
export const logTrust: Record<string, { trust: LogTrust; reason: TrustReason }> = {
  ENERCC: mark('good', 'macro'),
  PROT625: mark('good', 'macro'),
  HIS: mark('good', 'macro'),
  ILE: mark('good', 'macro'),
  LEU: mark('good', 'macro'),
  LYS: mark('good', 'macro'),
  SAA: mark('good', 'macro'),
  AAA: mark('good', 'macro'),
  THR: mark('good', 'macro'),
  TRP: mark('good', 'macro'),
  VAL: mark('good', 'macro'),
  FAT: mark('good', 'macro'),
  FASAT: mark('good', 'macro'),
  'F18:2CN6': mark('good', 'macro'),
  'F18:3CN3': mark('good', 'macro'),
  EPADHA: mark('good', 'macro'),
  CHO: mark('good', 'macro'),
  SUGAR: mark('good', 'macro'),
  FIBT: mark('good', 'macro'),
  VITAA: mark('rough', 'micro'),
  VITD: mark('blind', 'sun'),
  VITE: mark('rough', 'micro'),
  VITK: mark('rough', 'micro'),
  THIA: mark('rough', 'micro'),
  RIBF: mark('rough', 'micro'),
  NIAEQ: mark('rough', 'micro'),
  PANTAC: mark('rough', 'micro'),
  VITB6: mark('rough', 'micro'),
  BIOT: mark('rough', 'micro'),
  FOL: mark('rough', 'micro'),
  VITB12: mark('rough', 'store'),
  VITC: mark('rough', 'micro'),
  NA: mark('rough', 'salt'),
  CLD: mark('rough', 'salt'),
  K: mark('rough', 'micro'),
  CA: mark('rough', 'micro'),
  MG: mark('rough', 'micro'),
  P: mark('rough', 'micro'),
  FE: mark('rough', 'store'),
  ZN: mark('rough', 'micro'),
  ID: mark('blind', 'iodine'),
  SE: mark('rough', 'selenium'),
  CU: mark('rough', 'micro'),
  MN: mark('rough', 'micro'),
  FD: mark('blind', 'fluoride'),
  CR: mark('rough', 'micro'),
  MO: mark('rough', 'micro'),
};
