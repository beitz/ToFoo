import { iron, uncertainty } from '../../model/parameters';
import { MODEL_NUTRIENT_IDS, UL_BASIS_IDS } from './nutrients';
import { retentionTable } from './retention';
import type { Scenario } from './paramTypes';
import type { FoodPart, ModelEntry } from './types';

/** All nutrient ids whose intake is tracked (model nutrients + upper-limit bases). */
export const TRACKED_IDS: readonly string[] = [...MODEL_NUTRIENT_IDS, ...UL_BASIS_IDS];
const ONES = new Float64Array(TRACKED_IDS.length).fill(1);
const FE_INDEX = TRACKED_IDS.indexOf('FE');
const MAX_U = uncertainty.maxRelative.value;

/** A food's values as arrays aligned with TRACKED_IDS (string-keyed lookups are slow in the hot loop). */
interface FoodVector {
  values: Float64Array;
  missing: Uint8Array;
  /** Relative data uncertainty by BLS provenance. */
  dataU: Float64Array;
}
const vectorCache = new WeakMap<object, FoodVector>();

function vectorFor(part: FoodPart): FoodVector {
  let v = vectorCache.get(part.per100);
  if (!v) {
    const n = TRACKED_IDS.length;
    v = { values: new Float64Array(n), missing: new Uint8Array(n), dataU: new Float64Array(n) };
    for (let k = 0; k < n; k++) {
      const id = TRACKED_IDS[k]!;
      const raw = part.per100[id];
      if (raw === null || raw === undefined) v.missing[k] = 1;
      else v.values[k] = raw === 't' ? 0 : raw;
      const prov = part.provenance?.[id];
      v.dataU[k] = prov ? (uncertainty.dataByProvenance.value[prov] ?? 0) : 0;
    }
    vectorCache.set(part.per100, v);
  }
  return v;
}

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

const mfp = new Set(iron.mfpGroups.value);
const phytateGroups = new Set(iron.phytate.value.groups);
const teaRe = new RegExp(iron.teaPattern.value, 'i');
const teaExcludeRe = new RegExp(iron.teaExcludePattern.value, 'i');
const coffeeRe = new RegExp(iron.coffeePattern.value, 'i');
const coffeeExcludeRe = new RegExp(iron.coffeeExcludePattern.value, 'i');

const drinkGroups = new Set(iron.drinkGroups.value);

/** Tea, herbal tea or cocoa drink (iron inhibitors). Without a group, the name alone decides. */
export function isTea(nameEn: string | undefined, group?: string): boolean {
  return !!nameEn && (group === undefined || drinkGroups.has(group)) && teaRe.test(nameEn) && !teaExcludeRe.test(nameEn);
}
export function isCoffee(nameEn: string | undefined, group?: string): boolean {
  return !!nameEn && (group === undefined || drinkGroups.has(group)) && coffeeRe.test(nameEn) && !coffeeExcludeRe.test(nameEn);
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

  const acc = new Float64Array(TRACKED_IDS.length);
  const missingFlags = new Uint8Array(TRACKED_IDS.length);
  for (const part of entry.parts) {
    if (!(part.grams > 0)) continue;
    const vec = vectorFor(part);
    const keep = opts.retention ? retentionTable(TRACKED_IDS, part.preparation, part.storage, scenario) : ONES;
    const gramsFactor = part.grams / 100;
    const amountU = uncertainty.amountByConfidence.value[entry.confidence];
    const sign = scenario === 'low' ? -1 : scenario === 'high' ? 1 : 0;
    for (let k = 0; k < vec.values.length; k++) {
      if (vec.missing[k]) {
        missingFlags[k] = 1;
        continue;
      }
      const raw = vec.values[k]!;
      if (raw === 0) continue; // includes trace
      const u = sign === 0 ? 0 : Math.min(amountU + vec.dataU[k]!, MAX_U);
      const amount = raw * gramsFactor * (1 + sign * u) * keep[k]!;
      acc[k] = acc[k]! + amount;
      if (k === FE_INDEX && part.group && mfp.has(part.group)) hemeIron += amount * iron.hemeShareOfMfpIron.value[scenario];
    }
    const amountFactor = scenarioFactor(uncertainty.amountByConfidence.value[entry.confidence], scenario);
    if (part.group && mfp.has(part.group)) mfpGrams += part.grams * amountFactor;
    if (part.group && phytateGroups.has(part.group)) phytateGrams += part.grams * amountFactor;
    if (isTea(part.nameEn, part.group)) tea = true;
    if (isCoffee(part.nameEn, part.group)) coffee = true;
  }

  for (let k = 0; k < acc.length; k++) {
    if (acc[k] !== 0) intake[TRACKED_IDS[k]!] = acc[k]!;
    if (missingFlags[k]) missing.add(TRACKED_IDS[k]!);
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
