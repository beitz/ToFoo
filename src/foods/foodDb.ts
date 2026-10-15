import { DERIVED } from '../model/nutrients';
import type { RawValue } from '../model/types';
import type { BlsFile, BlsGroupMeta, BlsNutrientMeta } from './blsTypes';

export interface Food {
  code: string;
  nameDe: string;
  nameEn: string;
  group: string;
  /** Values per 100 g by nutrient id, incl. derived ids. Missing = null. */
  per100: Record<string, RawValue>;
  provenance: Record<string, string>;
}

export interface FoodDb {
  source: 'BLS';
  version: string;
  foods: Food[];
  byCode: Map<string, Food>;
  groups: Record<string, BlsGroupMeta>;
  nutrients: BlsNutrientMeta[];
  provenanceCodes: Record<string, string>;
}

function sumDerived(per100: Record<string, RawValue>, parts: readonly string[]): RawValue {
  let total = 0;
  let any = false;
  for (const p of parts) {
    const v = per100[p];
    if (v === null || v === undefined) return null;
    if (v === 't') continue;
    total += v;
    any = true;
  }
  return any ? total : 't';
}

export function buildFoodDb(file: BlsFile): FoodDb {
  const ids = file.nutrients.map((n) => n.id);
  const foods: Food[] = file.foods.map(([code, nameDe, nameEn, values, prov]) => {
    const per100: Record<string, RawValue> = {};
    const provenance: Record<string, string> = {};
    ids.forEach((id, i) => {
      per100[id] = values[i] ?? null;
      provenance[id] = prov[i] ?? '-';
    });
    for (const [id, parts] of Object.entries(DERIVED)) {
      per100[id] = sumDerived(per100, parts);
      // Derived values are as uncertain as their least certain part: use the first part's provenance.
      provenance[id] = provenance[parts[0]!] ?? '-';
    }
    return { code, nameDe, nameEn, group: code.charAt(0), per100, provenance };
  });
  return {
    source: 'BLS',
    version: file.version,
    foods,
    byCode: new Map(foods.map((f) => [f.code, f])),
    groups: file.groups,
    nutrients: file.nutrients,
    provenanceCodes: file.provenanceCodes,
  };
}

export async function loadFoodDb(baseUrl: string): Promise<FoodDb> {
  const res = await fetch(`${baseUrl}data/bls-4.0.json`);
  if (!res.ok) throw new Error(`Could not load food data (${res.status})`);
  return buildFoodDb((await res.json()) as BlsFile);
}

/** Salt BLS codes by the kitchen default. There is no fluoridated, non-iodised salt in BLS. */
export const SALT_CODES = { plain: 'R111000', iodised: 'R114000', iodisedFluoride: 'R113000' } as const;
export const ALL_SALT_CODES = new Set<string>(Object.values(SALT_CODES));

export function saltCode(pref: { iodised: boolean; fluoridated: boolean }): string {
  if (pref.iodised && pref.fluoridated) return SALT_CODES.iodisedFluoride;
  if (pref.iodised) return SALT_CODES.iodised;
  return SALT_CODES.plain;
}

/** Composite dishes and processed groups that are not "single foods" for suggestions. */
export const NON_SINGLE_FOOD_GROUPS = new Set(['X', 'Y', 'R', 'P', 'S', 'D']);

/**
 * Search weight by food group: basic foods before sweets, composite dishes and drinks with
 * alcohol, so "milk" finds milk before milk chocolate. Tuned by feel.
 */
export function groupSearchBoost(group: string): number {
  if ('SDXYP'.includes(group)) return 0.85;
  return 1.25;
}
