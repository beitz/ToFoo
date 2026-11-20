/**
 * Pure: protein quality numbers for the protein page, computed from BLS amino acids and the WHO 2007
 * requirement pattern, so "lentils are low in methionine" or "bread and lentils make up for each other"
 * are shown from real data rather than written (owner's ask, 2026-11-20).
 */
import type { Food } from '../foods/foodDb';
import type { DigestibilityRow } from '../../model/proteinQuality';

/** Amounts of protein and of each essential amino acid, in g. */
export type AminoTotals = Record<string, number>;

/**
 * Protein and amino acids in some grams of some foods, summed. Undefined when a food lacks protein or
 * any of the amino acids: a missing value is not zero, and leaving it out would make the mix look poorer.
 */
export function aminoTotals(parts: ReadonlyArray<{ food: Food; grams: number }>, aminoIds: readonly string[]): AminoTotals | undefined {
  const out: AminoTotals = { PROT625: 0 };
  for (const id of aminoIds) out[id] = 0;
  for (const { food, grams } of parts) {
    for (const id of ['PROT625', ...aminoIds]) {
      const v = food.per100[id];
      if (typeof v !== 'number') return undefined;
      out[id] = out[id]! + (v * grams) / 100;
    }
  }
  return out.PROT625! > 0 ? out : undefined;
}

export interface AminoScore {
  /** mg of each amino acid per g protein over the pattern's mg per g; 1 = exactly what the body needs. */
  ratios: Record<string, number>;
  /** The lowest ratio: the amino acid score. */
  score: number;
  /** The amino acid with the lowest ratio. */
  limiting: string;
}

/** Amino acid score (WHO 2007 section 6.1.3): each amino acid per g protein against the pattern, the lowest counts. */
export function aminoScore(totals: AminoTotals, pattern: Readonly<Record<string, number>>): AminoScore {
  const ratios: Record<string, number> = {};
  let score = Infinity;
  let limiting = '';
  for (const [id, mgPerG] of Object.entries(pattern)) {
    const r = ((totals[id] ?? 0) / totals.PROT625!) * 1000 / mgPerG;
    ratios[id] = r;
    if (r < score) {
      score = r;
      limiting = id;
    }
  }
  return { ratios, score, limiting };
}

/**
 * PDCAAS = amino acid score × digestibility, with the score cut at 1 first: WHO 2007 (section 6.2)
 * argues that digestibility limits first, so a surplus of amino acids cannot make up for protein lost
 * in digestion, and the result is never above the digestibility.
 */
export function pdcaas(score: number, digestibilityPct: number): number {
  return Math.min(1, score) * (digestibilityPct / 100);
}

export interface ScoreRow {
  row: DigestibilityRow;
  food: Food;
  aminoScore: AminoScore;
  pdcaas: number;
}

/** WHO's digestibility rows with their BLS food's amino acid score and PDCAAS, highest PDCAAS first; rows whose food lacks data are left out. */
export function scoreTable(
  rows: readonly DigestibilityRow[],
  byCode: ReadonlyMap<string, Food>,
  pattern: Readonly<Record<string, number>>,
): ScoreRow[] {
  const ids = Object.keys(pattern);
  return rows
    .flatMap((row) => {
      const food = byCode.get(row.bls);
      const totals = food && aminoTotals([{ food, grams: 100 }], ids);
      if (!food || !totals) return [];
      const s = aminoScore(totals, pattern);
      return [{ row, food, aminoScore: s, pdcaas: pdcaas(s.score, row.pct) }];
    })
    .sort((a, b) => b.pdcaas - a.pdcaas || b.row.pct - a.row.pct);
}

/** The worked example for mixing plant proteins: a pot of lentils with wholemeal bread (BLS codes, grams as eaten). */
export const COMPLEMENT_EXAMPLE = [
  { code: 'H730132', grams: 250 },
  { code: 'B101000', grams: 100 },
] as const;

export interface ComplementResult {
  parts: Array<{ food: Food; grams: number; score: AminoScore }>;
  together: AminoScore;
}

/** Each part's amino acid score on its own, and the score of all of them eaten together. */
export function complement(
  example: ReadonlyArray<{ code: string; grams: number }>,
  byCode: ReadonlyMap<string, Food>,
  pattern: Readonly<Record<string, number>>,
): ComplementResult | undefined {
  const ids = Object.keys(pattern);
  const parts: ComplementResult['parts'] = [];
  for (const { code, grams } of example) {
    const food = byCode.get(code);
    const totals = food && aminoTotals([{ food, grams }], ids);
    if (!food || !totals) return undefined;
    parts.push({ food, grams, score: aminoScore(totals, pattern) });
  }
  const all = aminoTotals(parts, ids);
  return all ? { parts, together: aminoScore(all, pattern) } : undefined;
}

/** The lowest of the essential amino acids by share of need, from the model's results; undefined without data. */
export function lowestAmino(shares: ReadonlyArray<{ id: string; share: number | undefined }>): { id: string; share: number } | undefined {
  let best: { id: string; share: number } | undefined;
  for (const { id, share } of shares) if (share !== undefined && (!best || share < best.share)) best = { id, share };
  return best;
}
