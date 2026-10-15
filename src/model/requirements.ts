import { referenceValues, infoOnly } from '../../model/reference-values';
import { nutrientParams } from '../../model/parameters';
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
  ctx.energyKcal = energyRef ? amountFor(energyRef.amount, profile.sex, ageGroup, ctx) : 2000;

  const byNutrient = new Map<string, Requirement>();
  for (const ref of referenceValues) {
    const recommended = amountFor(ref.amount, profile.sex, ageGroup, ctx);
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
      confidence: ref.confidence,
      source: ref.source,
    });
  }
  return { byNutrient, infoOnly: new Set(infoOnly.map((i) => i.nutrient)), ageGroup, defaultsUsed, underAge };
}
