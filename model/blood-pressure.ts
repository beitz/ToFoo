/**
 * Blood pressure measured at home (docs/SPEC.md, "Blood pressure"): the lines readings are held
 * against, how to measure so an average means something, and what moves it.
 *
 * Rule as in parameters.ts: every number has a source and a confidence. Checked 2026-11-13: the ESH
 * home measurement paper in full text (PMC), the ESC 2024 thresholds by method as reproduced in the
 * Rev Esp Cardiol 2025 commentary on the guideline, the NHS page on low blood pressure.
 */
import type { Valued } from '../src/model/paramTypes';

const ESC_2024 = 'McEvoy JW et al. (2024): 2024 ESC Guidelines for the management of elevated blood pressure and hypertension. Eur Heart J 45(38):3912–4018';
const ESC_2024_URL = 'https://doi.org/10.1093/eurheartj/ehae178';
const ESH_HOME = 'Parati G, Stergiou GS et al. (2021): Home blood pressure monitoring: methodology, clinical relevance and practical application. A 2021 position paper of the ESH Working Group on Blood Pressure Monitoring. J Hypertens 39(9):1742–1767';
const ESH_HOME_URL = 'https://doi.org/10.1097/HJH.0000000000002922';
const ESH_2023 = 'Mancia G et al. (2023): 2023 ESH Guidelines for the management of arterial hypertension. J Hypertens 41(12):1874–2071';
const ESH_2023_URL = 'https://doi.org/10.1097/HJH.0000000000003480';

/** Systolic and diastolic in mmHg. */
export interface BpPair {
  systolic: number;
  diastolic: number;
}

/**
 * The ESC 2024 categories for the average of home readings: below `raisedFrom` (both) non-elevated,
 * from it (either) elevated, from `highFrom` (either) hypertension. The office lines are 120/70 and
 * 140/90; home readings run lower, so the guideline gives its own home lines.
 */
export const homeCategories: Valued<{ raisedFrom: BpPair; highFrom: BpPair }> = {
  value: { raisedFrom: { systolic: 120, diastolic: 70 }, highFrom: { systolic: 135, diastolic: 85 } },
  source: `${ESC_2024}, thresholds by measurement method (home)`,
  url: ESC_2024_URL,
  confidence: 'high',
  note: 'Home: non-elevated < 120/70, elevated 120/70 to < 135/85, hypertension ≥ 135/85 mmHg; either number is enough to move up. The guideline asks for the category to be set from an average of readings, not one reading, and prefers home or ambulatory readings to office ones for it. The 135/85 home line is also the ESH one (Parati 2021, Box 16; ESH 2023).',
};

/**
 * Very high: the grade 3 line of ESH 2023 (≥ 180 and/or ≥ 110), which the ESC also uses for severe
 * blood pressure elevation. Shown as "measure again; if it stays, call a doctor", never as a diagnosis.
 */
export const veryHigh: Valued<BpPair> = {
  value: { systolic: 180, diastolic: 110 },
  source: `${ESH_2023}, grade 3 hypertension; ${ESC_2024}, severe BP elevation and hypertensive emergencies`,
  url: ESH_2023_URL,
  confidence: 'medium',
  note: 'An office line used here for single home readings, as a prompt to measure again after rest and to get medical advice if it stays this high; with chest pain, shortness of breath, weakness, trouble speaking or seeing, it is an emergency (ESC 2024: hypertensive emergency means very high pressure with acute organ damage). Home readings run lower than office ones, so this errs on the safe side.',
};

/** Low: below 90/60 (either). Usually harmless; it matters with dizziness or fainting. */
export const low: Valued<BpPair> = {
  value: { systolic: 90, diastolic: 60 },
  source: 'NHS (2023): Low blood pressure (hypotension)',
  url: 'https://www.nhs.uk/conditions/low-blood-pressure-hypotension/',
  confidence: 'medium',
  note: '"Low blood pressure is a reading below 90/60mmHg." Without symptoms it usually needs no treatment; dizziness, light-headedness or fainting, especially on standing up, are worth a doctor’s look. No European guideline sets a home line for low.',
};

/**
 * How to measure (ESH home protocol): seated after 5 minutes' rest, two readings a minute apart,
 * morning and evening, for 7 days (at least 3), and the average of all of them is what counts.
 */
export const homeProtocol: Valued<{ days: number; minDays: number; perSitting: number; restMinutes: number; gapMinutes: number }> = {
  value: { days: 7, minDays: 3, perSitting: 2, restMinutes: 5, gapMinutes: 1 },
  source: `${ESH_HOME}, Box 15`,
  url: ESH_HOME_URL,
  confidence: 'high',
  note: '"Seven-day monitoring (not fewer than 3 days)", duplicate readings morning and evening, "after a 5 min sitting rest and 1 min between measurements", before any blood pressure tablets; the average of all readings. Leaving out the first day is debated: it matters for a 3-day schedule and hardly with 7 days, so the app keeps it. A validated upper-arm cuff (validatebp.org, or the Deutsche Hochdruckliga seal) on the bare arm at heart height, back and arm supported, feet flat, no talking.',
};

/** What moves blood pressure, from the guideline's lifestyle section: a line each, for the page and the assistant. */
export const whatMovesIt: Valued<Array<{ what: 'salt' | 'potassium' | 'alcohol' | 'activity' | 'weight'; line: string }>> = {
  value: [
    { what: 'salt', line: 'Less salt lowers it. ESC advises about 2 g of sodium a day, about 5 g of salt.' },
    { what: 'potassium', line: 'More potassium, from vegetables, fruit, pulses and nuts, lowers it (not with kidney disease, where potassium needs a doctor’s advice).' },
    { what: 'alcohol', line: 'Alcohol raises it. Less is better; none is best.' },
    { what: 'activity', line: 'Regular moderate exercise lowers it: at least 150 minutes a week of aerobic activity, plus some strength training.' },
    { what: 'weight', line: 'Losing weight lowers it when you carry extra weight.' },
  ],
  source: `${ESC_2024}, section 8 (lifestyle)`,
  url: ESC_2024_URL,
  confidence: 'high',
  note: 'The guideline recommends these for everyone with elevated blood pressure or hypertension (class I), alongside a healthy diet such as the Mediterranean or DASH pattern. Effects are averages from trials; one person’s readings vary.',
};

/** Background for the assistant while Blood pressure is on: the lines and how to measure, with sources. */
export const BP_FACTS = [
  `Home blood pressure lines (${homeCategories.source}): average of home readings below ${homeCategories.value.raisedFrom.systolic}/${homeCategories.value.raisedFrom.diastolic} mmHg non-elevated, ${homeCategories.value.raisedFrom.systolic}/${homeCategories.value.raisedFrom.diastolic} to below ${homeCategories.value.highFrom.systolic}/${homeCategories.value.highFrom.diastolic} elevated, ${homeCategories.value.highFrom.systolic}/${homeCategories.value.highFrom.diastolic} or more hypertension; either number moves it up; the category comes from an average, never one reading.`,
  `How to measure (${homeProtocol.source}): seated after ${homeProtocol.value.restMinutes} minutes' rest, ${homeProtocol.value.perSitting} readings ${homeProtocol.value.gapMinutes} minute apart, morning and evening, for ${homeProtocol.value.days} days (at least ${homeProtocol.value.minDays}); the average of all readings counts.`,
  `Very high (${veryHigh.source}): ${veryHigh.value.systolic}/${veryHigh.value.diastolic} or more: measure again after rest; if it stays this high, get medical advice the same day; with chest pain, breathlessness, weakness, trouble speaking or seeing, call emergency services (112).`,
  `Low (${low.source}): below ${low.value.systolic}/${low.value.diastolic}; usually harmless without symptoms.`,
  `What moves it (${whatMovesIt.source}): ${whatMovesIt.value.map((w) => w.line).join(' ')}`,
];
