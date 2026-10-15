import { fatSoluble, iron, nutrientParams } from '../../model/parameters';
import type { AbsorptionRule, Scenario } from './paramTypes';

/** Everything eaten within one meal window, summed (after cooking/storage losses). */
export interface MealComposition {
  intake: Record<string, number>;
  hemeIron: number;
  mfpGrams: number;
  phytateGrams: number;
  tea: boolean;
  coffee: boolean;
}

export interface AbsorptionOptions {
  /** false: use the typical fraction for every nutrient (no per-meal rules). */
  modelled: boolean;
  /** Typical absorbed fraction per nutrient (requirement-consistent). */
  typicalFraction: (nutrient: string) => number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Interpolate a [dose, fraction] table on log(dose); flat outside the table. */
export function interpolateLog(points: ReadonlyArray<readonly [number, number]>, dose: number): number {
  if (points.length === 0) return 1;
  const first = points[0]!;
  if (dose <= first[0]) return first[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (dose <= x1) {
      const l0 = Math.log(Math.max(x0, 1e-9));
      const l1 = Math.log(x1);
      const t = (Math.log(dose) - l0) / (l1 - l0);
      return y0 + (y1 - y0) * clamp(t, 0, 1);
    }
  }
  return points[points.length - 1]![1];
}

/** Absorbed amount of one nutrient from a meal dose, for the rule types other than iron. */
export function absorbByRule(rule: AbsorptionRule, dose: number, scenario: Scenario, typical: number): number {
  if (dose <= 0) return 0;
  switch (rule.type) {
    case 'fixed':
      return dose * typical;
    case 'saturable': {
      const active = Math.min(dose * rule.activeFraction.value[scenario], rule.activeCapPerMeal.value[scenario]);
      return active + dose * rule.passiveFraction.value[scenario];
    }
    case 'doseTable':
      return dose * clamp(interpolateLog(rule.points.value, dose) * rule.scale.value[scenario], 0, 1);
    case 'doseLog': {
      const f = clamp(rule.a - rule.b * Math.log(dose), rule.min, rule.max);
      return dose * clamp(f * rule.scale.value[scenario], 0, 1);
    }
    case 'iron':
      return dose * typical;
  }
}

/** Factor (0–1) for fat-soluble vitamins depending on the meal's fat. */
export function fatFactor(fatG: number, scenario: Scenario): number {
  const threshold = fatSoluble.thresholdFatG.value[scenario];
  const min = fatSoluble.minFactor.value[scenario];
  if (fatG >= threshold) return 1;
  return min + (1 - min) * (Math.max(fatG, 0) / threshold);
}

/** Absorbed iron (mg) from a meal: heme and non-heme with enhancers and inhibitors. */
export function absorbIron(meal: MealComposition, scenario: Scenario): number {
  const total = meal.intake.FE ?? 0;
  if (total <= 0) return 0;
  const heme = Math.min(meal.hemeIron, total);
  const nonheme = total - heme;

  const ca = meal.intake.CA ?? 0;
  const { fromMg, fullMg, factor } = iron.calcium.value;
  const caRamp = clamp((ca - fromMg) / (fullMg - fromMg), 0, 1);
  const calciumFactor = 1 - (1 - factor[scenario]) * caRamp;

  const enhancers = (meal.intake.VITC ?? 0) + meal.mfpGrams;
  const n = iron.nonheme.value;
  const nonhemePct = Math.min(n.base + n.coefficient * Math.log((enhancers + 100) / 100), n.max);
  let nonhemeFraction = (nonhemePct / 100) * iron.nonhemeScale.value[scenario];
  if (meal.tea) nonhemeFraction *= iron.tea.value[scenario];
  if (meal.coffee) nonhemeFraction *= iron.coffee.value[scenario];
  const phy = iron.phytate.value;
  const phyRamp = clamp(meal.phytateGrams / phy.fullGrams, 0, 1);
  nonhemeFraction *= 1 - (1 - phy.factor[scenario]) * phyRamp;

  return (heme * iron.hemeAbsorption.value[scenario] + nonheme * nonhemeFraction) * calciumFactor;
}

/** Absorbed amounts for every nutrient in the meal. */
export function absorbMeal(meal: MealComposition, scenario: Scenario, opts: AbsorptionOptions): Record<string, number> {
  const out: Record<string, number> = {};
  const fat = meal.intake.FAT ?? 0;
  for (const [id, dose] of Object.entries(meal.intake)) {
    const typical = opts.typicalFraction(id);
    if (!opts.modelled) {
      out[id] = dose * typical;
      continue;
    }
    const params = nutrientParams[id];
    if (!params) {
      out[id] = dose * typical;
      continue;
    }
    let absorbed = params.rule.type === 'iron' ? absorbIron(meal, scenario) : absorbByRule(params.rule, dose, scenario, typical);
    if (params.fatSoluble) absorbed *= fatFactor(fat, scenario);
    out[id] = absorbed;
  }
  return out;
}
