/**
 * Pure: numbers for the nutrient-group info pages, computed from BLS so the comparisons are real
 * data rather than textbook claims: the amino acid make-up of protein by kind of food, and the
 * fatty acid make-up of common fats.
 */
import type { Food } from './foodDb';

/**
 * Kinds of protein food by BLS code prefix (data/README.md), so the comparisons cover what people eat,
 * not only grains and legumes (owner's ask, 2026-11-20). Fruit is left out: it brings almost no protein.
 * `minProtein`: below this many g per 100 g, the food is not counted for its kind; amino acid values
 * relative to a trace of protein say little, but vegetables, potatoes and mushrooms rarely reach 3 g.
 */
export const PROTEIN_KINDS = [
  { id: 'grains', prefix: /^[BC]/, minProtein: 3 },
  { id: 'legumes', prefix: /^H7/, minProtein: 3 },
  { id: 'soy', prefix: /^(H84|H86|H011|G75)/, minProtein: 1 },
  { id: 'nuts', prefix: /^H[1-4]/, minProtein: 3 },
  { id: 'vegetables', prefix: /^G(?!75)/, minProtein: 1 },
  { id: 'potatoes', prefix: /^K[1-4]/, minProtein: 1 },
  { id: 'mushrooms', prefix: /^K7/, minProtein: 1 },
  { id: 'dairy', prefix: /^M/, minProtein: 3 },
  { id: 'eggs', prefix: /^E1/, minProtein: 3 },
  { id: 'meat', prefix: /^[UVW]/, minProtein: 3 },
  { id: 'fish', prefix: /^T/, minProtein: 3 },
] as const;
export type ProteinKind = (typeof PROTEIN_KINDS)[number]['id'];

export interface AminoProfile {
  kind: ProteinKind;
  foods: number;
  /** Median g protein per 100 g over the counted foods; undefined when none. */
  protein?: number;
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
  return PROTEIN_KINDS.map(({ id, prefix, minProtein }) => {
    const items = foods.filter((f) => prefix.test(f.code) && typeof f.per100.PROT625 === 'number' && f.per100.PROT625 >= minProtein);
    const mgPerG: Record<string, number | undefined> = {};
    for (const aa of aminoIds) {
      const vals = items.flatMap((f) => {
        const v = f.per100[aa];
        return typeof v === 'number' ? [(v / (f.per100.PROT625 as number)) * 1000] : [];
      });
      mgPerG[aa] = median(vals);
    }
    const protein = median(items.map((f) => f.per100.PROT625 as number));
    return { kind: id, foods: items.length, ...(protein !== undefined ? { protein } : {}), mgPerG };
  });
}

export interface KindSummary {
  profile: AminoProfile;
  /** Each amino acid as a share of the need per g protein (1 = what the body needs). */
  ratios: Record<string, number>;
  /** The amino acid with the lowest share, and that share. */
  shortest?: { id: string; ratio: number };
  /** Up to three other kinds richest in that amino acid (share above 1), richest first: the ones that make up for it. */
  partners: ProteinKind[];
}

/** For each kind of food: its shortest amino acid against the pattern, and which kinds have most of it. */
export function kindSummaries(profiles: readonly AminoProfile[], pattern: Readonly<Record<string, number>>): KindSummary[] {
  const ratiosOf = (p: AminoProfile) =>
    Object.fromEntries(Object.entries(pattern).flatMap(([aa, need]) => (p.mgPerG[aa] === undefined ? [] : [[aa, p.mgPerG[aa]! / need]]))) as Record<string, number>;
  const all = profiles.map((p) => ({ profile: p, ratios: ratiosOf(p) }));
  return all.map(({ profile, ratios }) => {
    const sorted = Object.entries(ratios).sort((a, b) => a[1] - b[1]);
    const low = sorted[0];
    const shortest = low ? { id: low[0], ratio: low[1] } : undefined;
    const partners = shortest
      ? all
          .filter((o) => o.profile.kind !== profile.kind && (o.ratios[shortest.id] ?? 0) > 1)
          .sort((a, b) => b.ratios[shortest.id]! - a.ratios[shortest.id]!)
          .slice(0, 3)
          .map((o) => o.profile.kind)
      : [];
    return { profile, ratios, ...(shortest ? { shortest } : {}), partners };
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
