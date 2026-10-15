import { iron, uncertainty } from '../../model/parameters';
import { MODEL_NUTRIENT_IDS, UL_BASIS_IDS } from './nutrients';
import { retentionFactor } from './retention';
import type { Scenario } from './paramTypes';
import type { ModelEntry } from './types';

/** All nutrient ids whose intake is tracked (model nutrients + upper-limit bases). */
export const TRACKED_IDS: readonly string[] = [...MODEL_NUTRIENT_IDS, ...UL_BASIS_IDS];

/** What one entry contributes, for one scenario. */
export interface EntryIntake {
  /** Intake after cooking/storage losses (not yet absorbed), per nutrient. */
  intake: Record<string, number>;
  /** Nutrients for which at least one food in the entry has no data. */
  missing: string[];
  /** Heme iron (mg), part of intake.FE. */
  hemeIron: number;
  /** Grams of meat, fish and poultry (iron enhancer). */
  mfpGrams: number;
  /** Grams of phytate-rich foods (iron inhibitor estimate). */
  phytateGrams: number;
  tea: boolean;
  coffee: boolean;
}

const teaRe = new RegExp(iron.teaPattern.value, 'i');
const teaExcludeRe = new RegExp(iron.teaExcludePattern.value, 'i');
const coffeeRe = new RegExp(iron.coffeePattern.value, 'i');

export function isTea(nameEn: string | undefined): boolean {
  return !!nameEn && teaRe.test(nameEn) && !teaExcludeRe.test(nameEn);
}
export function isCoffee(nameEn: string | undefined): boolean {
  return !!nameEn && coffeeRe.test(nameEn);
}

/** Relative uncertainty of one value: amount (entry confidence) + data (BLS provenance), capped. */
export function relativeUncertainty(entryConfidence: ModelEntry['confidence'], provenance: string | undefined): number {
  const u = uncertainty.amountByConfidence.value[entryConfidence] + (provenance ? (uncertainty.dataByProvenance.value[provenance] ?? 0) : 0);
  return Math.min(u, uncertainty.maxRelative.value);
}

function scenarioFactor(u: number, scenario: Scenario): number {
  return scenario === 'low' ? 1 - u : scenario === 'high' ? 1 + u : 1;
}

export function entryIntake(entry: ModelEntry, scenario: Scenario, opts: { retention: boolean }): EntryIntake {
  const intake: Record<string, number> = {};
  const missing = new Set<string>();
  let hemeIron = 0;
  let mfpGrams = 0;
  let phytateGrams = 0;
  let tea = entry.modifiers?.tea ?? false;
  let coffee = entry.modifiers?.coffee ?? false;
  const mfp = new Set(iron.mfpGroups.value);
  const phytateGroups = new Set(iron.phytate.value.groups);

  for (const part of entry.parts) {
    if (!(part.grams > 0)) continue;
    for (const id of TRACKED_IDS) {
      const raw = part.per100[id];
      if (raw === null || raw === undefined) {
        missing.add(id);
        continue;
      }
      if (raw === 't') continue; // trace: counts as zero
      const u = relativeUncertainty(entry.confidence, part.provenance?.[id]);
      const keep = opts.retention ? retentionFactor(id, part.preparation, part.storage, scenario) : 1;
      const amount = (raw * part.grams) / 100 * scenarioFactor(u, scenario) * keep;
      intake[id] = (intake[id] ?? 0) + amount;
      if (id === 'FE' && part.group && mfp.has(part.group)) hemeIron += amount * iron.hemeShareOfMfpIron.value[scenario];
    }
    const amountFactor = scenarioFactor(uncertainty.amountByConfidence.value[entry.confidence], scenario);
    if (part.group && mfp.has(part.group)) mfpGrams += part.grams * amountFactor;
    if (part.group && phytateGroups.has(part.group)) phytateGrams += part.grams * amountFactor;
    if (isTea(part.nameEn)) tea = true;
    if (isCoffee(part.nameEn)) coffee = true;
  }

  if (entry.direct) {
    const f = scenarioFactor(uncertainty.amountByConfidence.value[entry.confidence], scenario);
    for (const [id, v] of Object.entries(entry.direct)) {
      if (Number.isFinite(v)) intake[id] = (intake[id] ?? 0) + v * f;
    }
    // A manual food lists only what is known (e.g. from a label): the rest is unknown, not zero.
    // A supplement lists everything it contains: the rest is zero.
    if (!entry.isSupplement && entry.parts.length === 0) {
      for (const id of TRACKED_IDS) if (!(id in entry.direct)) missing.add(id);
    }
  }

  return { intake, missing: [...missing], hemeIron, mfpGrams, phytateGrams, tea, coffee };
}
