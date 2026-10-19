/**
 * Swap preview in the recipe editor (docs/SPEC.md, "Swap preview in the recipe editor"): how a
 * change to a recipe moves what one portion gives for the user's gaps, e.g. "Adding 100 g spinach:
 * iron 40 % → 65 %". Shares are of the daily recommended intake (limit-only nutrients: of the
 * limit), never absorbed amounts, as on the recipe page and in the assistant's recipe check. The
 * status (low, too high…) is the user's current one. Pure (tested in swapPreview.test.ts).
 */
import { NUTRIENTS } from "../model/nutrients";
import type { ResolvedRequirements } from "../model/requirements";
import type { GaugeStatus, NutrientResult } from "../model/simulate";
import type { Ingredient, Recipe } from "../storage/types";

type Portion = {
  intake: Readonly<Record<string, number>>;
  missing: readonly string[];
};

/** One nutrient's share of the day from one portion, before and after the change. */
export interface ShareMove {
  id: string;
  name: string;
  before: number;
  after: number;
  status: GaugeStatus;
  limitOnly: boolean;
  /** Some ingredient (before or after) has no data for it: the real amount may be higher. */
  missing: boolean;
}

export interface PortionMove {
  /** Energy per portion, when known both before and after. */
  kcal?: { before: number; after: number };
  /** Gaps (low, getting low) and too-high nutrients that move, and any other that moves a lot; most telling first. */
  main: ShareMove[];
  /** Every other nutrient that moves by at least a whole percent, biggest move first. */
  other: ShareMove[];
}

/** A nutrient that is neither a gap nor too high is named first only when one portion moves this much of the day. */
export const NOTABLE_MOVE = 0.1;

/**
 * How much a move counts when ordering the list: a gap's move first, but a big drop of something
 * that is fine now (swapping beef for tofu: B12) still comes before a gap's small move. Display
 * order only, no physiology.
 */
const WEIGHT: Partial<Record<GaugeStatus, number>> = {
  low: 2,
  gettingLow: 1.5,
  tooHigh: 1.5,
};
const shown = (v: number) => Math.round(v * 100);

/**
 * The part of a move that matters for the order: below a whole day's worth for a nutrient to get
 * enough of (one portion going from 187 % to 110 % of the day still covers it), all of it for a
 * limit or something already too high.
 */
function counted(m: ShareMove): number {
  if (m.limitOnly || m.status === "tooHigh")
    return Math.abs(m.after - m.before);
  return Math.abs(Math.min(m.after, 1) - Math.min(m.before, 1));
}

/** What changes for one portion between two versions of a recipe, as the editor shows it. */
export function comparePortions(
  before: Portion,
  after: Portion,
  nutrients: ReadonlyMap<string, Pick<NutrientResult, "status">>,
  req: Pick<ResolvedRequirements, "byNutrient">,
): PortionMove {
  const missing = new Set([...before.missing, ...after.missing]);
  const out: PortionMove = { main: [], other: [] };
  const kb = before.intake.ENERCC;
  const ka = after.intake.ENERCC;
  if (kb !== undefined && ka !== undefined && !missing.has("ENERCC"))
    out.kcal = { before: kb, after: ka };
  for (const n of NUTRIENTS) {
    if (n.id === "ENERCC") continue;
    const r = req.byNutrient.get(n.id);
    if (!r || !(r.recommended > 0)) continue;
    const move: ShareMove = {
      id: n.id,
      name: n.name,
      before: (before.intake[n.id] ?? 0) / r.recommended,
      after: (after.intake[n.id] ?? 0) / r.recommended,
      status: nutrients.get(n.id)?.status ?? "unknown",
      limitOnly: r.limitOnly,
      missing: missing.has(n.id),
    };
    // Below a whole percent the screen would read "40 % → 40 %".
    if (shown(move.before) === shown(move.after)) continue;
    const urgent = WEIGHT[move.status] !== undefined;
    if (urgent || counted(move) >= NOTABLE_MOVE) out.main.push(move);
    else out.other.push(move);
  }
  const size = (m: ShareMove) => Math.abs(m.after - m.before);
  const score = (m: ShareMove) => counted(m) * (WEIGHT[m.status] ?? 1);
  out.main.sort((a, b) => score(b) - score(a));
  out.other.sort((a, b) => size(b) - size(a));
  return out;
}

/** The few moves worth one line (next to the ingredient being changed). */
export function headlineMoves(m: PortionMove, n = 3): ShareMove[] {
  return (m.main.length ? m.main : m.other).slice(0, n);
}

/** The part of a recipe that decides one portion's nutrients. */
export interface RecipeState {
  portions?: number;
  ingredients: Ingredient[];
  saltOverride?: Recipe["saltOverride"];
}

/** What the latest change in the editor was. */
export type Change =
  /** An ingredient was added (no `was`) or changed (food, amount or preparation). */
  | { kind: "ingredient"; index: number; was?: Ingredient }
  | { kind: "removed"; was: Ingredient }
  | { kind: "portions"; was?: number }
  | { kind: "salt" }
  | { kind: "assistant"; added: number };

/** The latest change and the recipe as it was just before it, to compare the recipe now against. */
export interface LastChange {
  change: Change;
  before: RecipeState;
}

const sameTarget = (a: Change, b: Change) =>
  (a.kind === "ingredient" && b.kind === "ingredient" && a.index === b.index) ||
  (a.kind === "portions" && b.kind === "portions") ||
  (a.kind === "salt" && b.kind === "salt");

/**
 * Note an edit. Further edits of the same ingredient (or of the portions) belong to the same change,
 * so typing "1", "0", "0" reads as one change to 100 g, and adding spinach then typing its grams
 * reads as "Adding 100 g spinach". `before` is the recipe just before this edit.
 */
export function recordChange(
  last: LastChange | undefined,
  change: Change,
  before: RecipeState,
): LastChange {
  return last && sameTarget(last.change, change) ? last : { change, before };
}

/** Moving ingredient `i` to `j` in the list: the change still points at the same ingredient. */
export function moveChange(
  last: LastChange | undefined,
  i: number,
  j: number,
): LastChange | undefined {
  if (!last || last.change.kind !== "ingredient") return last;
  const at = last.change.index;
  const index = at === i ? j : at === j ? i : at;
  return index === at ? last : { ...last, change: { ...last.change, index } };
}
