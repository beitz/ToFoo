/**
 * Pure: numbers for the nutrient-group info pages, computed from BLS so the comparisons are real
 * data rather than textbook claims: the amino acid make-up of protein by kind of food, and the
 * fatty acid make-up of common fats.
 */
import type { Food } from './foodDb';

/** Kinds of protein food by BLS code prefix (data/README.md): grains, legumes, nuts and seeds, animal foods. */
export const PROTEIN_KINDS = [
  { id: 'grains', prefix: /^[BC]/ },
  { id: 'legumes', prefix: /^H7/ },
  { id: 'nuts', prefix: /^H[1-4]/ },
  { id: 'animal', prefix: /^(E1|M|T|U|V|W)/ },
] as const;
export type ProteinKind = (typeof PROTEIN_KINDS)[number]['id'];

/** Below this much protein per 100 g, amino acid values say little about the food's protein. */
const MIN_PROTEIN_G = 3;

export interface AminoProfile {
  kind: ProteinKind;
  foods: number;
  /** Median mg of each amino acid per g of protein; missing when no food of that kind has a value. */
  mgPerG: Record<string, number | undefined>;
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Median amino acid content of protein (mg per g protein) for each kind of food.
 * Medians, so a few unusual foods don't move the result; BLS null values are left out, not zero.
 */
export function aminoProfiles(foods: readonly Food[], aminoIds: readonly string[]): AminoProfile[] {
  return PROTEIN_KINDS.map(({ id, prefix }) => {
    const items = foods.filter((f) => prefix.test(f.code) && typeof f.per100.PROT625 === 'number' && f.per100.PROT625 >= MIN_PROTEIN_G);
    const mgPerG: Record<string, number | undefined> = {};
    for (const aa of aminoIds) {
      const vals = items.flatMap((f) => {
        const v = f.per100[aa];
        return typeof v === 'number' ? [(v / (f.per100.PROT625 as number)) * 1000] : [];
      });
      mgPerG[aa] = median(vals);
    }
    return { kind: id, foods: items.length, mgPerG };
  });
}

/** Common fats and fatty foods for the fat info page (BLS 4.0 codes). */
export const FAT_EXAMPLES = ['Q611000', 'Q860000', 'Q550000', 'Q120000', 'Q180000', 'Q320000', 'Q160000', 'H120100', 'T410100'] as const;

export interface FatProfile {
  code: string;
  /** Shares of all fatty acids (0–1); undefined when BLS has no value. */
  saturated?: number;
  mono?: number;
  poly?: number;
  omega3?: number;
}

/** Saturated, mono- and polyunsaturated and omega-3 fatty acids as shares of the food's fatty acids. */
export function fatProfile(food: Food): FatProfile {
  const num = (id: string) => (typeof food.per100[id] === 'number' ? (food.per100[id] as number) : food.per100[id] === 't' ? 0 : undefined);
  const sat = num('FASAT');
  const mono = num('FAMS');
  const poly = num('FAPU');
  const n3 = num('FAPUN3');
  const total = sat !== undefined && mono !== undefined && poly !== undefined ? sat + mono + poly : undefined;
  if (!total) return { code: food.code };
  return { code: food.code, saturated: sat! / total, mono: mono! / total, poly: poly! / total, omega3: n3 === undefined ? undefined : n3 / total };
}
