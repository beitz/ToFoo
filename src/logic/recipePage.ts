/**
 * Numbers for the recipe page (design 2026-10-22, "Recipe · who gives what, live swap"): which
 * nutrient columns a group shows, each ingredient's share of the pot per nutrient, and which foods
 * of the same BLS group could take an ingredient's place to lift the user's gaps. Pure arithmetic
 * on database values (tested in recipePage.test.ts); no physiological numbers.
 */
import type { Food } from '../foods/foodDb';
import { nameWords } from '../foods/variety';
import { NUTRIENTS } from '../model/nutrients';
import type { SplitPiece } from './nutrientSplit';

/** The column groups of "Who gives what" (owner's decision, 2026-10-22: opens on "Your gaps"). */
export const COLUMN_GROUPS = ['gaps', 'macros', 'vitamins', 'minerals', 'fats', 'limits', 'all'] as const;
export type ColumnGroup = (typeof COLUMN_GROUPS)[number];

const MACROS = ['ENERCC', 'PROT625', 'FAT', 'CHO', 'FIBT'];
const FATS = ['FAT', 'FASAT', 'F18:2CN6', 'F18:3CN3', 'EPADHA'];
/** Amino acids follow protein; nine more columns would bury the rest. */
const COLUMN_NUTRIENTS = NUTRIENTS.filter((n) => !n.path.includes('eaa'));

/**
 * The nutrient ids a group shows, in the app's usual order. "Your gaps" is energy, protein and
 * whatever is low or a bit low now; `isLimit` says which nutrients are kept under a maximum.
 */
export function columnsOf(group: ColumnGroup, isGap: (id: string) => boolean, isLimit: (id: string) => boolean): string[] {
  const all = COLUMN_NUTRIENTS.map((n) => n.id);
  switch (group) {
    case 'gaps':
      return ['ENERCC', 'PROT625', ...all.filter((id) => id !== 'ENERCC' && id !== 'PROT625' && isGap(id))];
    case 'macros':
      return MACROS;
    case 'fats':
      return FATS;
    case 'limits':
      return all.filter(isLimit);
    case 'all':
      return all;
    default:
      return COLUMN_NUTRIENTS.filter((n) => n.path[0] === group).map((n) => n.id);
  }
}

/** One cell: the ingredient's share of the pot's amount; undefined when the pot has none of it. */
export interface GiveCell {
  share?: number;
  /** The ingredient has no data for this nutrient: unknown, not zero. */
  missing: boolean;
}

/** Each ingredient's share of the whole pot for each nutrient (rows follow `pieces`, columns `ids`). */
export function whoGivesWhat(pieces: readonly SplitPiece[], ids: readonly string[]): GiveCell[][] {
  const totals = ids.map((id) => pieces.reduce((s, p) => s + (p.intake[id] ?? 0), 0));
  return pieces.map((p) =>
    ids.map((id, j) => {
      const missing = p.missing.includes(id);
      const total = totals[j]!;
      const amount = p.intake[id] ?? 0;
      return total > 0 && amount > 0 ? { share: amount / total, missing } : { missing };
    }),
  );
}

/** A gap as the swap list weighs it. */
export interface SwapGap {
  id: string;
  /** How much this gap counts (low counts double). */
  weight: number;
  /** A day's recommended intake, in the nutrient's unit. */
  recommended: number;
  /** What one portion gives of it now, as a share of the day. */
  before: number;
}

export interface SwapCandidate {
  food: Food;
  /** Weighted share of a day the swap adds to the gaps (per portion, before cooking losses); ranking only. */
  score: number;
}

/**
 * Whether a food could stand in for another at the same weight: its energy per 100 g is within half
 * to double, give or take 30 kcal, so dried parsley or soup powder never replaces 450 g of fresh
 * spinach. A plausibility rule for the list, not physiology; unknown energy passes.
 */
function comparable(a: Food['per100'], b: Food['per100']): boolean {
  const x = a.ENERCC;
  const y = b.ENERCC;
  if (typeof x !== 'number' || typeof y !== 'number') return true;
  return y >= x / 2 - 30 && y <= x * 2 + 30;
}

/**
 * Foods that could take an ingredient's place: the same BLS main group (vegetables for spinach),
 * in the same state (a code ending in "00" is the food as bought, other endings are prepared
 * forms, and the recipe sets the preparation itself), of a comparable kind, ranked by how much the
 * same amount would add to the gaps. A gap counts up to a whole day from one portion (more of it
 * does not fill it more), as the editor's swap preview counts. A nutrient the candidate has no
 * value for adds nothing to its rank, since it is unknown, not zero. Variants of the ingredient
 * and of foods already listed are skipped.
 */
export function swapCandidates(
  current: Pick<Food, 'code' | 'nameEn' | 'group' | 'per100'>,
  foods: readonly Food[],
  gaps: readonly SwapGap[],
  gramsPerPortion: number,
  allowed: (food: Food) => boolean,
  n = 6,
): SwapCandidate[] {
  if (gaps.length === 0 || !(gramsPerPortion > 0)) return [];
  const asBought = (code: string) => code.endsWith('00');
  const scored: SwapCandidate[] = [];
  for (const food of foods) {
    if (food.group !== current.group || food.code === current.code || asBought(food.code) !== asBought(current.code) || !comparable(current.per100, food.per100) || !allowed(food)) continue;
    let score = 0;
    for (const g of gaps) {
      const now = current.per100[g.id];
      const then = food.per100[g.id];
      if (typeof then !== 'number') continue;
      const delta = ((then - (typeof now === 'number' ? now : 0)) * gramsPerPortion) / 100 / g.recommended;
      score += g.weight * (Math.min(1, g.before + delta) - Math.min(1, g.before));
    }
    if (score > 0) scored.push({ food, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const out: SwapCandidate[] = [];
  const taken = new Set(nameWords(current.nameEn));
  for (const c of scored) {
    if (out.length >= n) break;
    const words = nameWords(c.food.nameEn);
    if (words.some((w) => taken.has(w))) continue;
    out.push(c);
    words.forEach((w) => taken.add(w));
  }
  return out;
}
