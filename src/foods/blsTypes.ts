/**
 * Shape of the compact BLS JSON produced by `scripts/build-bls.ts`
 * (served as `public/data/bls-4.0.json`). See data/README.md.
 */

/** A raw value: a number per 100 g, `null` when BLS has no value, or "t" for trace / below detection. */
export type BlsRawValue = number | null | 't';

export interface BlsNutrientMeta {
  /** BLS component code, e.g. "VITB12". Used as the nutrient id across the app. */
  id: string;
  nameEn: string;
  nameDe: string;
  /** Unit per 100 g, as given by BLS (e.g. "µg", "mg", "g", "kcal"). */
  unit: string;
}

export interface BlsGroupMeta {
  en: string;
  de: string;
}

/** One food row: [code, German name, English name, values (aligned with `nutrients`), provenance codes]. */
export type BlsFoodRow = [code: string, nameDe: string, nameEn: string, values: BlsRawValue[], provenance: string];

export interface BlsFile {
  format: 'tofoo-bls';
  formatVersion: 1;
  source: 'BLS';
  version: string;
  attribution: string;
  licence: string;
  /** Single-letter provenance code → BLS "Datenherkunft" category. */
  provenanceCodes: Record<string, string>;
  groups: Record<string, BlsGroupMeta>;
  nutrients: BlsNutrientMeta[];
  foods: BlsFoodRow[];
}
