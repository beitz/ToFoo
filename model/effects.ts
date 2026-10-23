/**
 * How serious the effects of a low or high level are, for "How serious is it" in "What your levels
 * mean" on the nutrient page (owner's ask, 2026-10-23: "is it a 1 % higher risk over 40 years, or will
 * I die next week?").
 *
 * Three parts:
 * - `effectSeverity`: the worst outcome the nutrient's source describes at a clear, lasting shortage or
 *   excess, on a three-step scale. The app's own reading of the source, not a number from it.
 * - `effectFindings`: how big and how likely, from systematic reviews and meta-analyses, where one
 *   exists. Each number is a low/central/high range (the central value and its 95 % confidence
 *   interval); the sentence around them is `effect.<key>.<dir>Size<n>` in src/i18n/effects.en.ts.
 * - `referenceMargin`: how far the recommended intake sits above the average need, so "a bit low"
 *   can be read for what it is.
 * Keys are `<info key>.<low|high>` as in src/i18n/effects.en.ts.
 */
import type { Cited, Range, Valued } from '../src/model/paramTypes';

export type EffectSeverity = 'mild' | 'moderate' | 'serious';

/** The scale itself (step texts: `levels.severity.<step>` in src/i18n/en.ts). */
export const severityScale: Cited = {
  source: 'Modelling choice: the app groups the effects the nutrient’s source describes (NIH ODS fact sheets, DGE, EFSA) into three steps',
  confidence: 'assumption',
  note: 'How bad the outcome is, not how likely it is: the findings below say how likely, where a good review exists. Rare deficiencies (e.g. pellagra) still count as serious because of what they do when they happen.',
};

const s = (v: EffectSeverity) => v;

/** Worst outcome at a clear, lasting shortage (low) or excess (high). Every key with a one-line effect text has one (tested). */
export const effectSeverity: Record<string, EffectSeverity> = {
  'ENERCC.low': s('moderate'),
  'PROT625.low': s('moderate'),
  'EAA.low': s('moderate'),
  'F18:2CN6.low': s('mild'),
  'F18:3CN3.low': s('mild'),
  'EPADHA.low': s('serious'),
  'FIBT.low': s('serious'),
  'VITAA.low': s('serious'),
  'VITD.low': s('moderate'),
  'VITE.low': s('moderate'),
  'VITK.low': s('moderate'),
  'THIA.low': s('serious'),
  'RIBF.low': s('mild'),
  'NIAEQ.low': s('serious'),
  'PANTAC.low': s('mild'),
  'VITB6.low': s('moderate'),
  'BIOT.low': s('mild'),
  'FOL.low': s('moderate'),
  'VITB12.low': s('serious'),
  'VITC.low': s('moderate'),
  'NA.low': s('mild'),
  'CLD.low': s('mild'),
  'K.low': s('serious'),
  'CA.low': s('moderate'),
  'MG.low': s('moderate'),
  'P.low': s('mild'),
  'FE.low': s('moderate'),
  'ZN.low': s('moderate'),
  'ID.low': s('moderate'),
  'CU.low': s('moderate'),
  'FD.low': s('mild'),

  'FASAT.high': s('serious'),
  'VITAA.high': s('serious'),
  'VITD.high': s('serious'),
  'VITE.high': s('moderate'),
  'VITB6.high': s('moderate'),
  'FOL.high': s('moderate'),
  'NA.high': s('serious'),
  'CA.high': s('moderate'),
  'MG.high': s('mild'),
  'FE.high': s('moderate'),
  'ZN.high': s('moderate'),
  'ID.high': s('moderate'),
  'CU.high': s('moderate'),
  'FD.high': s('mild'),
  'MO.high': s('mild'),
};

/** How a number in a finding is shown: as a share (17 %) or as it is (56, 4.4). */
export type FindingUnit = 'share' | 'plain';

export interface EffectFinding extends Cited {
  numbers: Record<string, { value: Range; unit: FindingUnit }>;
}

const share = (low: number, central: number, high: number) => ({ value: { low, central, high }, unit: 'share' as const });
const plain = (v: number) => ({ value: { low: v, central: v, high: v }, unit: 'plain' as const });
const plainRange = (low: number, central: number, high: number) => ({ value: { low, central, high }, unit: 'plain' as const });

/** Risk ratio (central, 95 % CI) as the share fewer events: RR 0.83 (0.70–0.98) → 17 % (2–30 %). */
const fewer = (rr: number, ciLow: number, ciHigh: number) => share(1 - ciHigh, 1 - rr, 1 - ciLow);
/** Risk ratio as the share more events: RR 1.23 (1.06–1.43) → 23 % (6–43 %). */
const more = (rr: number, ciLow: number, ciHigh: number) => share(ciLow - 1, rr - 1, ciHigh - 1);

/** How big the effect is, from systematic reviews (abstracts checked on PubMed 2026-10-23). */
export const effectFindings: Record<string, EffectFinding[]> = {
  'FASAT.high': [
    {
      numbers: { fewer: fewer(0.83, 0.7, 0.98), people: plain(56), years: plain(4) },
      source: 'Hooper L et al. (2020): Reduction in saturated fat intake for cardiovascular disease. Cochrane Database Syst Rev 8:CD011737',
      url: 'https://pubmed.ncbi.nlm.nih.gov/32827219/',
      confidence: 'medium',
      note: '15 randomised trials of at least 24 months, 56,675 participants. Combined cardiovascular events RR 0.83 (95 % CI 0.70–0.98), GRADE moderate. NNTB 56 in primary prevention for ~4 years. All-cause mortality RR 0.96 (0.90–1.03). Greater reductions gave greater benefit.',
    },
  ],
  'NA.high': [
    {
      numbers: { more: more(1.23, 1.06, 1.43), fromYears: plain(3.5), toYears: plain(19) },
      source: 'Strazzullo P et al. (2009): Salt intake, stroke, and cardiovascular disease: meta-analysis of prospective studies. BMJ 339:b4567',
      url: 'https://pubmed.ncbi.nlm.nih.gov/19934192/',
      confidence: 'medium',
      note: '13 cohort studies, 177,025 participants, follow-up 3.5–19 years. Higher salt intake: stroke RR 1.23 (1.06–1.43), cardiovascular disease 1.14 (0.99–1.32). Observational; salt intake measured imprecisely, so the authors think the effect is underestimated.',
    },
    {
      numbers: { less: plain(4.4), mmHg: plainRange(3.18, 4.18, 5.18) },
      source: 'He FJ, Li J, MacGregor GA (2013): Effect of longer term modest salt reduction on blood pressure. BMJ 346:f1325',
      url: 'https://pubmed.ncbi.nlm.nih.gov/23558162/',
      confidence: 'high',
      note: '34 randomised trials of four weeks or more, 3,230 participants. A reduction of 4.4 g salt/day lowered systolic blood pressure by 4.18 mmHg (3.18–5.18); 5.39 mmHg in people with high blood pressure, 2.42 mmHg without.',
    },
  ],
  'FIBT.low': [
    {
      numbers: { lower: share(0.15, 0.225, 0.3), from: plain(25), to: plain(29) },
      source: 'Reynolds A et al. (2019): Carbohydrate quality and human health: a series of systematic reviews and meta-analyses. Lancet 393:434–445 (commissioned by WHO)',
      url: 'https://pubmed.ncbi.nlm.nih.gov/30638909/',
      confidence: 'medium',
      note: '185 prospective studies (~135 million person-years) and 58 trials. Highest vs lowest fibre intake: 15–30 % lower all-cause and cardiovascular mortality, coronary heart disease, stroke, type 2 diabetes and colorectal cancer; greatest risk reduction at 25–29 g/day. The 15–30 % is the range across outcomes, not a confidence interval. Mostly observational; certainty moderate.',
    },
  ],
  'K.low': [
    {
      numbers: { fewer: fewer(0.76, 0.66, 0.89), mmHg: plainRange(1.82, 3.49, 5.15) },
      source: 'Aburto NJ et al. (2013): Effect of increased potassium intake on cardiovascular risk factors and disease: systematic review and meta-analyses. BMJ 346:f1378',
      url: 'https://pubmed.ncbi.nlm.nih.gov/23558164/',
      confidence: 'medium',
      note: '22 trials (1,606 participants) and 11 cohort studies (127,038). Higher potassium: stroke RR 0.76 (0.66–0.89), moderate quality; systolic blood pressure −3.49 mmHg (1.82–5.15), seen in people with hypertension, not without.',
    },
  ],
  'EPADHA.low': [
    {
      numbers: { people: plain(334) },
      source: 'Abdelhamid AS et al. (2020): Omega-3 fatty acids for the primary and secondary prevention of cardiovascular disease. Cochrane Database Syst Rev 3:CD003177',
      url: 'https://pubmed.ncbi.nlm.nih.gov/32114706/',
      confidence: 'medium',
      note: '86 randomised trials, 162,796 participants, mostly capsules. All-cause mortality RR 0.97 (0.93–1.01), high certainty; coronary heart disease mortality RR 0.90 (0.81–1.00), NNTB 334, low certainty. Little evidence on eating fish.',
    },
  ],
  'CA.low': [
    {
      numbers: { none: plain(14), studies: plain(22) },
      source: 'Bolland MJ et al. (2015): Calcium intake and risk of fracture: systematic review. BMJ 351:h4580',
      url: 'https://pubmed.ncbi.nlm.nih.gov/26420387/',
      confidence: 'medium',
      note: 'For dietary calcium and total fracture, 14 of 22 cohort studies found no association; no trial evidence that more calcium from food prevents fractures. Does not cover severe, long-lasting shortage.',
    },
  ],
  'VITC.low': [
    {
      numbers: { months: plain(3), days: plain(15) },
      source: 'Fain O (2004): Vitamin C deficiency [Carences en vitamine C]. Rev Med Interne 25:872–880',
      url: 'https://pubmed.ncbi.nlm.nih.gov/15582167/',
      confidence: 'medium',
      note: 'Review (abstract in English): scurvy occurs after 3 months without vitamin C; treatment 1 g/day for 15 days. Other reviews give about one to three months, depending on stores.',
    },
  ],
};

/**
 * DGE: the recommended intake is the average requirement (which covers half of a group) plus 20–30 %
 * (two standard deviations), so it covers nearly all healthy people.
 */
export const referenceMargin: Valued<Range> = {
  value: { low: 0.2, central: 0.25, high: 0.3 },
  source: 'DGE (2018): FAQ Referenzwerte allgemein, question 7 (empfohlene Zufuhr)',
  url: 'https://www.dge.de/fileadmin/dok/gesunde-ernaehrung/faq/DGE-FAQ-Referenzwerte_allgemein-2018.pdf',
  confidence: 'high',
  note: 'Checked in the PDF on 2026-10-23: "Für die Ableitung der empfohlenen Zufuhr wird zu diesem Bedarf ein Zuschlag von 20–30 % (entspricht 2 Standardabweichungen …) addiert … ausreicht, um den Bedarf nahezu aller gesunden Individuen … zu decken." Applies to recommended intakes; estimates (Schätzwerte) have no such derivation.',
};

/** EFSA's definitions of an upper limit and a safe level of intake, for the line under "too much". */
export const upperLimitMeaning: Cited = {
  source: 'EFSA (2025): Overview on Tolerable Upper Intake Levels, version 11, introduction',
  url: 'https://www.efsa.europa.eu/sites/default/files/2024-05/ul-summary-report.pdf',
  confidence: 'high',
  note: 'Checked 2026-10-23: UL = "the maximum level of total chronic daily intake … not expected to pose a risk of adverse health effects"; safe level: "intakes above the safe levels of intake do not necessarily mean that there is a risk of adverse effects".',
};
