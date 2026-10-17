import { referenceValues, infoOnly } from '../../model/reference-values';
import { energyNeed, nutrientParams } from '../../model/parameters';
import type { ActivityLevel, AgeGroup, AmountSpec, ByAge, Confidence, Menstruation, PhytateIntake, ReferenceKind, Sex, UpperLimit } from './paramTypes';
import { AGE_GROUPS } from './paramTypes';

/** The profile inputs the model needs. All optional: defaults follow docs/SPEC.md. */
export interface ModelProfile {
  birthYear?: number;
  sex?: Sex;
  weightKg?: number;
  activity?: ActivityLevel;
  phytate?: PhytateIntake;
  /** Women only; not set: menstruating under 51, postmenopausal from 51. */
  menstruation?: Menstruation;
  /** The user's own energy target (kcal/day); replaces the estimate when set. */
  energyTargetKcal?: number;
}

/** Where the energy reference comes from: the user's own number, the personal estimate, or the DGE table. */
export type EnergyBasis = 'own' | 'estimate' | 'guide';

export interface EnergyTarget {
  /** kcal/day used for the energy gauge and for amounts given as a share of energy. */
  kcal: number;
  basis: EnergyBasis;
  /** Personal estimate (REE × PAL); only when age and weight are known. */
  estimate?: EnergyEstimate;
  /** The DGE guide value for the age group and activity level. */
  guideKcal: number;
}

export interface EnergyEstimate {
  kcal: number;
  reeKcal: number;
  pal: number;
}

export const PROFILE_DEFAULTS = {
  ageGroup: '25-50' as AgeGroup,
  weightKg: 70,
  activity: 'medium' as ActivityLevel,
  phytate: 'medium' as PhytateIntake,
};

export interface Requirement {
  nutrient: string;
  kind: ReferenceKind;
  /** Reference intake per day (what DGE recommends eating). For limit-only nutrients: the upper guide. */
  recommended: number;
  /** Absorbed amount per day the body needs (drains tanks). */
  physiological: number;
  /** True if `physiological` was derived as recommended × typical absorption. */
  physiologicalDerived: boolean;
  limitOnly: boolean;
  upperLimit?: Pick<UpperLimit, 'value' | 'basis' | 'scope' | 'safeLevel'>;
  confidence: Confidence;
  source: string;
}

export interface ResolvedRequirements {
  byNutrient: Map<string, Requirement>;
  infoOnly: Set<string>;
  ageGroup: AgeGroup;
  /** Inputs that fell back to defaults, so the UI can say which values would sharpen the picture. */
  defaultsUsed: Array<'age' | 'sex' | 'weight' | 'activity'>;
  /** Under 19: values for 19–24 are used, outside the app's scope. */
  underAge: boolean;
  energy: EnergyTarget;
}

export function ageGroupFor(age: number): AgeGroup {
  if (age < 25) return '19-24';
  if (age < 51) return '25-50';
  if (age < 65) return '51-64';
  return '65+';
}

function pick(arr: ByAge, group: AgeGroup): number {
  return arr[AGE_GROUPS.indexOf(group)] ?? arr[1];
}

/**
 * Resolve the amount for one sex, or for "not set": the safer value (higher need).
 * `energyKcal` is needed for energy-percent amounts.
 */
function amountFor(spec: AmountSpec, sex: Sex | undefined, group: AgeGroup, ctx: { weightKg: number; activity: ActivityLevel; phytate: PhytateIntake; menstruation: Menstruation; energyKcal: number }): number {
  const bySex = (f: (s: Sex) => number) => (sex ? f(sex) : Math.max(f('male'), f('female')));
  switch (spec.type) {
    case 'bySexAge':
      return bySex((s) => pick(spec[s], group));
    case 'perKg':
      return bySex((s) => pick(spec[s], group)) * ctx.weightKg;
    case 'energyPercent':
      return (ctx.energyKcal * spec.percent) / 100 / spec.kcalPerUnit;
    case 'energy':
      // Energy is not a "need to fill": for an unset sex use the lower value to avoid overstating it.
      return sex ? pick(spec[sex][ctx.activity], group) : Math.min(pick(spec.male[ctx.activity], group), pick(spec.female[ctx.activity], group));
    case 'byPhytate':
      return bySex((s) => spec[s][ctx.phytate]);
    case 'iron':
      return bySex((s) => (s === 'male' ? spec.male : spec.female[ctx.menstruation]));
  }
}

/**
 * Energy need from age, sex, weight and activity: resting energy expenditure (Müller et al. 2004,
 * the equation behind the DGE guide values) × PAL. An unset sex takes the lower value, like the table.
 */
export function estimateEnergyNeed(sex: Sex | undefined, ageYears: number, weightKg: number, activity: ActivityLevel): EnergyEstimate {
  const c = energyNeed.ree.value;
  const reeFor = (s: Sex) => (c.weightKg * weightKg + (s === 'male' ? c.male : 0) + c.ageYears * ageYears + c.intercept) * energyNeed.kcalPerMJ;
  const reeKcal = sex ? reeFor(sex) : Math.min(reeFor('male'), reeFor('female'));
  const pal = energyNeed.pal.value[activity];
  const step = energyNeed.roundToKcal;
  return { kcal: Math.round((reeKcal * pal) / step) * step, reeKcal: Math.round(reeKcal / step) * step, pal };
}

export function resolveRequirements(profile: ModelProfile, currentYear: number): ResolvedRequirements {
  const defaultsUsed: ResolvedRequirements['defaultsUsed'] = [];
  let ageGroup = PROFILE_DEFAULTS.ageGroup;
  let underAge = false;
  if (profile.birthYear) {
    const age = currentYear - profile.birthYear;
    underAge = age < 19;
    ageGroup = ageGroupFor(age);
  } else defaultsUsed.push('age');
  if (!profile.sex) defaultsUsed.push('sex');
  const weightKg = profile.weightKg && profile.weightKg > 0 ? profile.weightKg : PROFILE_DEFAULTS.weightKg;
  if (!profile.weightKg) defaultsUsed.push('weight');
  const activity = profile.activity ?? PROFILE_DEFAULTS.activity;
  if (!profile.activity) defaultsUsed.push('activity');
  const phytate = profile.phytate ?? PROFILE_DEFAULTS.phytate;
  const menstruation: Menstruation = profile.menstruation ?? (ageGroup === '51-64' || ageGroup === '65+' ? 'postmenopausal' : 'menstruating');

  const energyRef = referenceValues.find((r) => r.nutrient === 'ENERCC');
  const ctx = { weightKg, activity, phytate, menstruation, energyKcal: 0 };
  const guideKcal = energyRef ? amountFor(energyRef.amount, profile.sex, ageGroup, ctx) : 2000;
  // The estimate needs the person's own age and weight; with defaults the DGE table is the better guess.
  const estimate = profile.birthYear && profile.weightKg ? estimateEnergyNeed(profile.sex, currentYear - profile.birthYear, weightKg, activity) : undefined;
  const own = profile.energyTargetKcal && profile.energyTargetKcal > 0 ? profile.energyTargetKcal : undefined;
  const energy: EnergyTarget = own
    ? { kcal: own, basis: 'own', estimate, guideKcal }
    : estimate
      ? { kcal: estimate.kcal, basis: 'estimate', estimate, guideKcal }
      : { kcal: guideKcal, basis: 'guide', guideKcal };
  ctx.energyKcal = energy.kcal;

  const byNutrient = new Map<string, Requirement>();
  for (const ref of referenceValues) {
    const recommended = ref.nutrient === 'ENERCC' ? energy.kcal : amountFor(ref.amount, profile.sex, ageGroup, ctx);
    let physiological: number;
    let derived = false;
    if (ref.physiological) {
      physiological = amountFor(ref.physiological, profile.sex, ageGroup, ctx);
    } else {
      const f = nutrientParams[ref.nutrient]?.typicalAbsorption.value ?? 1;
      physiological = recommended * f;
      derived = f !== 1;
    }
    byNutrient.set(ref.nutrient, {
      nutrient: ref.nutrient,
      kind: ref.kind,
      recommended,
      physiological,
      physiologicalDerived: derived,
      limitOnly: ref.limitOnly ?? false,
      upperLimit: ref.upperLimit
        ? { value: ref.upperLimit.value, basis: ref.upperLimit.basis, scope: ref.upperLimit.scope, safeLevel: ref.upperLimit.safeLevel }
        : undefined,
      confidence: ref.nutrient === 'ENERCC' && energy.basis === 'estimate' ? energyNeed.ree.confidence : ref.confidence,
      source: ref.nutrient === 'ENERCC' && energy.basis === 'estimate' ? energyNeed.ree.source : ref.source,
    });
  }
  return { byNutrient, infoOnly: new Set(infoOnly.map((i) => i.nutrient)), ageGroup, defaultsUsed, underAge, energy };
}
