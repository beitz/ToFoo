/**
 * What is known about sleep (docs/SPEC.md, "Sleep knowledge for the assistant"): the lines the app
 * holds the user's nights against, and the background facts the assistant gets with sleep on.
 *
 * Rule as in parameters.ts: every number has a source and a confidence. Checked 2026-10-28 on
 * PubMed (abstracts) and, for the NSF sleep quality lines, in the full paper (Ohayon 2017, the
 * "Results" text per indicator). The sleep need itself stays in parameters.ts (`sleepNeed`).
 */
import type { Cited, Valued } from '../src/model/paramTypes';

/** The adult age groups of the National Sleep Foundation panels (Hirshkowitz 2015, Ohayon 2017). */
export type SleepAgeGroup = 'young' | 'adult' | 'older';

/** First age of each group; younger than 26 counts as a young adult (the app is for adults). */
export const SLEEP_AGE_FROM: Record<SleepAgeGroup, number> = { young: 18, adult: 26, older: 65 };

export function sleepAgeGroup(age: number): SleepAgeGroup {
  return age >= SLEEP_AGE_FROM.older ? 'older' : age >= SLEEP_AGE_FROM.adult ? 'adult' : 'young';
}

type PerGroup<T> = Record<SleepAgeGroup, T>;

const NSF_QUALITY = 'Ohayon M et al. (2017): National Sleep Foundation’s sleep quality recommendations: first report. Sleep Health 3(1):6–19';
const NSF_QUALITY_URL = 'https://doi.org/10.1016/j.sleh.2016.11.006';
const NSF_DURATION = 'Hirshkowitz M et al. (2015): National Sleep Foundation’s sleep time duration recommendations: methodology and results summary. Sleep Health 1(1):40–43';
const NSF_DURATION_URL = 'https://doi.org/10.1016/j.sleh.2014.12.010';

/** Hours of sleep a night: recommended, and below or above which the panel does not recommend it. */
export const sleepDuration: Valued<{ recommended: PerGroup<[number, number]>; notBelow: PerGroup<number>; notAbove: PerGroup<number> }> = {
  value: {
    recommended: { young: [7, 9], adult: [7, 9], older: [7, 8] },
    notBelow: { young: 6, adult: 6, older: 5 },
    notAbove: { young: 11, adult: 10, older: 9 },
  },
  source: NSF_DURATION,
  url: NSF_DURATION_URL,
  confidence: 'high',
  note:
    'Expert panel (RAND/UCLA method). Between the recommended range and the "not recommended" lines the panel says "may be appropriate", acknowledging that people differ. The recommended ranges are in the abstract of the final report (Sleep Health 1(4):233–243); the not-recommended lines come from the published summaries of the panel’s table.',
};

/**
 * The NSF panel's sleep quality lines (Ohayon 2017), for healthy people. `good`: the panel agreed it
 * indicates good sleep quality; `poor`: agreed it does not; in between the panel was uncertain or
 * disagreed. `null`: no agreed line for that group.
 */
export const sleepQuality = {
  /** Awakenings longer than 5 minutes a night. */
  awakenings: {
    value: { minMinutes: 5, goodMax: { young: 1, adult: 1, older: 2 } as PerGroup<number>, poorMin: 4 },
    source: NSF_QUALITY,
    url: NSF_QUALITY_URL,
    confidence: 'high',
    note: '"Across all age groups, 1 or fewer awakening … per night indicate good sleep quality. Among older adults, 2 awakenings per night also qualify … 4 or more awakenings … were voted as not an appropriate indicator for good sleep quality." Expert consensus from 277 studies.',
  } satisfies Valued<{ minMinutes: number; goodMax: PerGroup<number>; poorMin: number }>,
  /** Minutes awake after first falling asleep (wake after sleep onset), all wake-ups together. */
  awakeMinutes: {
    value: { goodMax: 20, poorMin: { young: 41, adult: 41, older: null } as PerGroup<number | null> },
    source: NSF_QUALITY,
    url: NSF_QUALITY_URL,
    confidence: 'high',
    note: '≤ 20 minutes indicates good sleep quality from preschoolers to older adults; ≥ 51 minutes does not, up to adults; for young adults and adults ≥ 41 minutes also does not. For older adults the panel agreed on no "poor" line.',
  } satisfies Valued<{ goodMax: number; poorMin: PerGroup<number | null> }>,
  /** Sleep efficiency: time asleep as a share of time in bed, in %. */
  efficiency: {
    value: { goodMin: 85, poorMax: { young: 64, adult: 74, older: 74 } as PerGroup<number> },
    source: NSF_QUALITY,
    url: NSF_QUALITY_URL,
    confidence: 'high',
    note:
      '≥ 85 % indicates good sleep quality at all ages; ≤ 74 % does not, except young adults, where the line is ≤ 64 %. The panel defines efficiency over time in bed; the app only knows first falling asleep to last waking up, so its asleep share reads higher than a measured efficiency.',
  } satisfies Valued<{ goodMin: number; poorMax: PerGroup<number> }>,
  /** Sleep latency, minutes to fall asleep: the app does not record it, so only the assistant's background knows it. */
  latency: {
    value: { goodMax: 30, poorMin: { young: 46, adult: 46, older: 61 } as PerGroup<number> },
    source: NSF_QUALITY,
    url: NSF_QUALITY_URL,
    confidence: 'high',
    note: '≤ 30 minutes indicates good sleep quality at all ages; 46–60 minutes does not, except in older adults; more than 60 minutes does not at any age.',
  } satisfies Valued<{ goodMax: number; poorMin: PerGroup<number> }>,
};

/** Naps: how long and how many. */
export const napLines = {
  /** Minutes of napping a day from which cohorts saw more heart disease and deaths. */
  longMinutes: {
    value: 60,
    source:
      'Yamada T et al. (2015): Daytime napping and the risk of cardiovascular disease and all-cause mortality: a prospective study and dose-response meta-analysis. Sleep 38(12):1945–1953',
    url: 'https://doi.org/10.5665/sleep.5246',
    confidence: 'medium',
    note: '11 prospective cohorts, 151,588 people: naps ≥ 60 min/day went with a higher risk of cardiovascular disease (RR 1.82, 95 % CI 1.22–2.71) and death from any cause (RR 1.27, 1.11–1.45) than no naps; under 60 min/day showed no link. Observational: long naps may be a sign of illness rather than its cause.',
  } satisfies Valued<number>,
  /** One nap longer than this does not indicate good sleep quality (adults). */
  tooLongMinutes: {
    value: 100,
    source: NSF_QUALITY,
    url: NSF_QUALITY_URL,
    confidence: 'medium',
    note: '"Among young adults, adults, and older adults, a nap duration > 100 minutes … does not indicate good sleep quality." The panel found naps hard to judge (planned and unplanned naps are rarely told apart).',
  } satisfies Valued<number>,
  /** Naps in 24 hours from which it does not indicate good sleep quality. */
  manyPerDay: {
    value: 4,
    source: NSF_QUALITY,
    url: NSF_QUALITY_URL,
    confidence: 'medium',
    note: '"Across all age groups from preschoolers through older adults, taking 4 or more naps … per 24 hours" does not indicate good sleep quality.',
  } satisfies Valued<number>,
};

/** Hours before falling asleep after which coffee no longer shortened sleep. */
export const caffeineGapHours: Valued<number> = {
  value: 8.8,
  source: 'Gardiner C et al. (2023): The effect of caffeine on subsequent sleep: a systematic review and meta-analysis. Sleep Medicine Reviews 69:101764',
  url: 'https://doi.org/10.1016/j.smrv.2023.101764',
  confidence: 'medium',
  note: '24 studies: caffeine cut total sleep by 45 min and sleep efficiency by 7 %, and added 9 min to falling asleep and 12 min awake in the night. "Coffee (107 mg per 250 mL) should be consumed at least 8.8 h prior to bedtime"; a pre-workout dose (217.5 mg) 13.2 h. The app finds caffeine by food words the assistant picks, not by amount.',
};

/**
 * How often a line must be crossed before the app calls it worth mentioning: on at least this many
 * nights a week on average, over at least a week of logged nights.
 */
export const oftenNights: Valued<{ perWeek: number; minNights: number }> = {
  value: { perWeek: 3, minNights: 7 },
  source: 'Lichstein KL et al. (2003): Quantitative criteria for insomnia. Behaviour Research and Therapy 41(4):427–445; Riemann D et al. (2023): The European Insomnia Guideline. J Sleep Res 32(6):e14035',
  url: 'https://doi.org/10.1016/s0005-7967(02)00023-2',
  confidence: 'assumption',
  note:
    '"≥ 3 nights a week" is the frequency in the quantitative insomnia criteria (Lichstein 2003: ≥ 31 min to fall asleep or awake in the night, ≥ 3 nights a week, ≥ 6 months) and in the diagnostic criteria the European guideline uses. Borrowing it as the bar for "worth mentioning" for every line is the app’s choice, not a diagnosis (docs/OPEN_QUESTIONS.md). A week of nights is the least that bar can be read over.',
};

/** One fact of the assistant's sleep background, with where it comes from. */
export interface SleepFact extends Cited {
  topic: string;
  /** What the assistant is told, in English (it answers in the user's language). */
  text: string;
}

const d = sleepDuration.value;
const q = sleepQuality;

/**
 * The assistant's background on sleep: what research says, so it can tell what is normal and what
 * is worth acting on. Sent with the system prompt while Sleep is on; the app's own lines above are
 * quoted from the same values, so prompt and sleep_check never disagree.
 */
export const SLEEP_FACTS: readonly SleepFact[] = [
  {
    topic: 'How long',
    text: `Adults should sleep 7 hours or more a night on a regular basis (AASM and SRS consensus); the NSF recommends ${d.recommended.adult[0]}–${d.recommended.adult[1]} h from 18 to 64 and ${d.recommended.older[0]}–${d.recommended.older[1]} h from 65. It does not recommend less than ${d.notBelow.adult} h or more than ${d.notAbove.adult} h for adults of 26 to 64 (young adults: more than ${d.notAbove.young} h; from 65: less than ${d.notBelow.older} h or more than ${d.notAbove.older} h); in between "may be appropriate", as people differ.`,
    source: 'Watson 2015 (AASM/SRS); Hirshkowitz 2015 (NSF)',
    url: NSF_DURATION_URL,
    confidence: 'high',
  },
  {
    topic: 'Waking in the night',
    text: `NSF sleep quality panel, for healthy people: ${q.awakenings.value.goodMax.adult} or fewer awakenings of more than ${q.awakenings.value.minMinutes} min a night is good (from 65 also ${q.awakenings.value.goodMax.older}); ${q.awakenings.value.poorMin} or more is not. Awake ${q.awakeMinutes.value.goodMax} min or less in all after first falling asleep is good; ${q.awakeMinutes.value.poorMin.adult} min or more is not, for adults up to 64 (no agreed line from 65). At least ${q.efficiency.value.goodMin} % of the time in bed asleep is good; ${q.efficiency.value.poorMax.adult} % or less is not (young adults: ${q.efficiency.value.poorMax.young} %). Falling asleep within ${q.latency.value.goodMax} min is good; more than ${q.latency.value.poorMin.adult - 1} min is not (from 65: more than ${q.latency.value.poorMin.older - 1}).`,
    source: 'Ohayon 2017 (NSF sleep quality recommendations)',
    url: NSF_QUALITY_URL,
    confidence: 'high',
  },
  {
    topic: 'Age',
    text: 'In healthy adults, time awake in the night rises and the share of the night asleep falls with age; after 60 only sleep efficiency keeps falling.',
    source: 'Ohayon 2004 (meta-analysis of 65 studies, 3,577 people)',
    url: 'https://doi.org/10.1093/sleep/27.7.1255',
    confidence: 'high',
  },
  {
    topic: 'Two-part nights',
    text: 'When healthy people spent 14 h in the dark each night (a winter-length night), their sleep split into two bouts of several hours with 1–3 h awake between. So one long wake-up in a long night is not in itself a disorder; insomnia is defined by its effects in the day too (see Insomnia). Small lab study.',
    source: 'Wehr 1992',
    url: 'https://doi.org/10.1111/j.1365-2869.1992.tb00019.x',
    confidence: 'low',
  },
  {
    topic: 'Insomnia',
    text: 'Insomnia means trouble falling or staying asleep on at least 3 nights a week for at least 3 months, with effects in the day (tiredness, mood, concentration), despite enough chance to sleep. A research definition adds 31 min or more to fall asleep or awake in the night. The first treatment recommended for adults is cognitive behavioural therapy for insomnia (CBT-I, also as digital programmes); sleeping pills only short term.',
    source: 'Riemann 2023 (European Insomnia Guideline); Lichstein 2003',
    url: 'https://doi.org/10.1111/jsr.14035',
    confidence: 'high',
  },
  {
    topic: 'Worth seeing a doctor',
    text: 'Loud snoring, breathing pauses someone has noticed, waking up gasping, and being sleepy by day (dozing off when reading or as a passenger) point to sleep apnoea; the STOP questions and the Epworth sleepiness scale are validated screens a doctor uses. Insomnia as defined above, or sleepiness that is risky (driving), is also worth raising. The app cannot detect any of this; ask about it at most once, briefly, and never diagnose.',
    source: 'Chung 2008 (STOP questionnaire); Johns 1991 (Epworth scale); Riemann 2023',
    url: 'https://doi.org/10.1097/ALN.0b013e31816d83e4',
    confidence: 'high',
  },
  {
    topic: 'Naps',
    text: `After a short night, a 10 min nap helped right away and for up to 2½ h; a 30 min nap first brought grogginess (24 young adults). Naps of ${napLines.longMinutes.value} min or more a day went with more heart disease (RR 1.82) and deaths (RR 1.27) in cohorts, shorter naps did not; this is a link, and long naps may be a sign of poor night sleep or illness. The NSF panel: a nap over ${napLines.tooLongMinutes.value} min, or ${napLines.manyPerDay.value} or more naps in 24 h, does not indicate good sleep.`,
    source: 'Brooks and Lack 2006; Yamada 2015 (meta-analysis of 11 cohorts); Ohayon 2017',
    url: 'https://doi.org/10.1093/sleep/29.6.831',
    confidence: 'medium',
  },
  {
    topic: 'Regularity',
    text: 'Sleeping and waking at steady times went with a 20–48 % lower risk of death and predicted it better than sleep length (60,977 people, sleep measured by wrist sensors; a link, not proof). It is measured as the Sleep Regularity Index (the chance of being in the same state, asleep or awake, 24 h apart). A gap between sleep times on work days and free days is called social jetlag.',
    source: 'Windred 2024; Phillips 2017; Wittmann 2006',
    url: 'https://doi.org/10.1093/sleep/zsad253',
    confidence: 'medium',
  },
  {
    topic: 'Caffeine',
    text: `Caffeine cut sleep by 45 min on average, and added 9 min to falling asleep and 12 min awake in the night; to avoid losing sleep, coffee at least ${caffeineGapHours.value} h before bed. 400 mg even 6 h before bed still disturbed sleep. Caffeine is in coffee, black and green tea, mate, cola, energy drinks and chocolate.`,
    source: 'Gardiner 2023 (meta-analysis of 24 studies); Drake 2013',
    url: 'https://doi.org/10.1016/j.smrv.2023.101764',
    confidence: 'medium',
  },
  {
    topic: 'Alcohol',
    text: 'At all doses alcohol helps falling asleep and deepens the first half of the night, then disturbs the second half (more waking, less REM sleep): a likely reason for waking in the early hours after drinking in the evening.',
    source: 'Ebrahim 2013 (review)',
    url: 'https://doi.org/10.1111/acer.12006',
    confidence: 'medium',
  },
  {
    topic: 'Exercise',
    text: 'Regular exercise has small benefits for sleep length and efficiency, small to medium for falling asleep, and moderate benefits for how well people say they sleep; a single bout has a moderate benefit on time awake in the night that follows.',
    source: 'Kredlow 2015 (meta-analysis of 66 studies)',
    url: 'https://doi.org/10.1007/s10865-015-9617-6',
    confidence: 'medium',
  },
];
