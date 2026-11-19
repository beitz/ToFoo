/**
 * Amounts a food's nutrients can be shown for besides 100 g: the pack ("420 g" ready meal), the
 * label's serving, the amount last logged, the user's saved portion sizes and one piece. Pure,
 * tested in sizes.test.ts.
 */
import type { PortionSize } from '../storage/types';
import type { ProductData } from './openFoodFacts';
import { packHints, pieceWeight } from './pieces';

export type SizeKind = 'pack' | 'serving' | 'logged' | 'saved' | 'piece' | 'common';

export interface FoodSize {
  kind: SizeKind;
  /** Grams (ml for drinks). */
  grams: number;
  /** A saved portion size's own name ("bowl"), or a common size's ("1 medium"). */
  label?: string;
}

/** More than this many amounts besides 100 g crowd the switch on a phone. */
export const MAX_SIZES = 3;

/** Two amounts closer than this (in grams) show the same numbers, so only the first is offered. */
const SAME_GRAMS = 0.5;

/** Medium first, then small and large; extra sizes and everything else after. Stable for ties. */
const sizeRank = (label: string) => (/\bextra\b|\bjumbo\b/.test(label) ? 4 : /\bmedium\b/.test(label) ? 0 : /\bsmall\b/.test(label) ? 1 : /\blarge\b/.test(label) ? 2 : 3);

type ProductText = Pick<ProductData, 'quantity' | 'serving'> & { name?: string };

/**
 * The amounts to offer, most useful first: pack, label serving, last logged amount, saved portion
 * sizes, one piece, then a BLS food's common sizes from USDA (`common`: medium, small, large, then the rest). Leaves out amounts that match an earlier one, 100 g, or one of `taken` (amounts
 * the view already offers, such as what was eaten).
 */
export function foodSizes(input: { product?: ProductText; sizes?: readonly PortionSize[]; logged?: number; taken?: readonly number[]; common?: readonly { label: string; grams: number }[] }, max = MAX_SIZES): FoodSize[] {
  const { product, sizes, logged } = input;
  const candidates: FoodSize[] = [];
  const pack = product ? packHints(product).grams : undefined;
  if (pack) candidates.push({ kind: 'pack', grams: pack });
  if (product?.serving && product.serving.grams > 0) candidates.push({ kind: 'serving', grams: product.serving.grams });
  if (logged && logged > 0) candidates.push({ kind: 'logged', grams: logged });
  for (const s of sizes ?? []) if (!s.piece && s.grams > 0) candidates.push({ kind: 'saved', grams: s.grams, label: s.label });
  const piece = pieceWeight(sizes, product);
  if (piece) candidates.push({ kind: 'piece', grams: piece.grams });
  const common = [...(input.common ?? [])].sort((a, b) => sizeRank(a.label) - sizeRank(b.label));
  for (const c of common) candidates.push({ kind: 'common', grams: c.grams, label: c.label });

  const seen = [100, ...(input.taken ?? [])];
  const out: FoodSize[] = [];
  for (const c of candidates) {
    if (out.length >= max) break;
    if (seen.some((g) => Math.abs(g - c.grams) < SAME_GRAMS)) continue;
    seen.push(c.grams);
    out.push(c);
  }
  return out;
}
