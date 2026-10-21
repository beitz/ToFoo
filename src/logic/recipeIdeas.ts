/**
 * What the assistant is told for recipes, ideas and improvements (docs/SPEC.md, "AI recipe ideas"),
 * computed by the app: what one portion of a recipe gives against the current gaps, the user's
 * nutrient status, the foods that fill the gaps and the recipe book. The model may only quote these
 * numbers. Pure (tested in recipeIdeas.test.ts).
 */
import type { Food, FoodDb } from '../foods/foodDb';
import { NON_SINGLE_FOOD_GROUPS } from '../foods/foodDb';
import { diverseTop } from '../foods/variety';
import { entryIntake } from '../model/intake';
import { NUTRIENTS, NUTRIENT_BY_ID } from '../model/nutrients';
import type { Storage } from '../model/paramTypes';
import { rankFoods } from '../model/ranking';
import type { ResolvedRequirements } from '../model/requirements';
import type { NutrientResult } from '../model/simulate';
import { addDays } from '../lib/dates';
import { fmtNumber } from '../lib/format';
import type { Batch, Ingredient, LogEntry, Profile, Recipe } from '../storage/types';
import { batchParts, type ResolveContext } from './resolve';
import { totalLeft } from './stock';
import { sameIngredients } from './batch';

type RecipeLike = Pick<Recipe, 'name' | 'portions' | 'ingredients' | 'saltOverride'>;

/** A whole pot of the recipe, never stored: what a portion of it is computed from. */
export function previewBatch(recipe: RecipeLike): Batch {
  return {
    id: 'preview',
    schemaVersion: 1,
    recipeId: 'preview',
    recipe: { name: recipe.name, portions: recipe.portions, ingredients: recipe.ingredients, ...(recipe.saltOverride ? { saltOverride: recipe.saltOverride } : {}) },
    cookedDay: '',
    cookedAt: 0,
    plan: { fresh: 1, fridge: 0, freezer: 0 },
    remaining: { fresh: 1, fridge: 0, freezer: 0 },
    corrections: [],
  };
}

/** Nutrients in one portion after cooking (and storage) losses, as the recipe page shows them. */
export function portionIntake(recipe: RecipeLike, ctx: ResolveContext, storage: Storage = 'fresh'): { intake: Record<string, number>; missing: string[] } {
  const batch = previewBatch(recipe);
  const parts = batchParts(batch, 1 / recipe.portions, storage, ctx);
  const res = entryIntake({ id: 'portion', label: recipe.name, time: 0, dayKey: '', confidence: 'A', isSupplement: false, parts }, 'central', { retention: true });
  return { intake: res.intake, missing: res.missing };
}

/** One nutrient of a portion: its share of the daily recommended intake (or, for a limit, of the limit). */
export interface PortionShare {
  id: string;
  name: string;
  /** Portion amount ÷ daily recommended intake (limit-only nutrients: ÷ the daily limit). */
  share: number;
  /** Some ingredient has no data for it: the real amount may be higher. */
  missing: boolean;
}

export interface PortionCheck {
  kcal?: number;
  proteinG?: number;
  /** Nutrients low or getting low now, most urgent first. */
  gaps: Array<PortionShare & { status: 'low' | 'gettingLow' }>;
  /** Nutrients already too high now. */
  high: PortionShare[];
  /** Other nutrients one portion gives a lot of (at least a third of the day). */
  rich: PortionShare[];
}

/** A third of the daily intake from one portion: worth naming even when it is not a gap. */
const RICH_SHARE = 1 / 3;

/** What one portion gives against the current status (shares of the daily reference intake, never absorbed amounts). */
export function checkPortion(
  portion: { intake: Readonly<Record<string, number>>; missing: readonly string[] },
  nutrients: ReadonlyMap<string, Pick<NutrientResult, 'status'>>,
  req: Pick<ResolvedRequirements, 'byNutrient'>,
): PortionCheck {
  const missing = new Set(portion.missing);
  const share = (id: string): PortionShare | undefined => {
    const r = req.byNutrient.get(id);
    if (!r || !(r.recommended > 0)) return undefined;
    return { id, name: NUTRIENT_BY_ID.get(id)?.name ?? id, share: (portion.intake[id] ?? 0) / r.recommended, missing: missing.has(id) };
  };
  const out: PortionCheck = { gaps: [], high: [], rich: [] };
  if (!missing.has('ENERCC') && portion.intake.ENERCC !== undefined) out.kcal = portion.intake.ENERCC;
  if (!missing.has('PROT625') && portion.intake.PROT625 !== undefined) out.proteinG = portion.intake.PROT625;
  for (const n of NUTRIENTS) {
    if (n.id === 'ENERCC') continue;
    const status = nutrients.get(n.id)?.status;
    const s = share(n.id);
    if (!s) continue;
    if (status === 'low' || status === 'gettingLow') out.gaps.push({ ...s, status });
    else if (status === 'tooHigh') out.high.push(s);
    else if (s.share >= RICH_SHARE && !req.byNutrient.get(n.id)?.limitOnly) out.rich.push(s);
  }
  out.gaps.sort((a, b) => (a.status === b.status ? 0 : a.status === 'low' ? -1 : 1));
  out.rich.sort((a, b) => b.share - a.share);
  return out;
}

const pct = (v: number) => `${fmtNumber(Math.round(v * 100))} %`;
const shareText = (s: PortionShare) => `${s.name} ${pct(s.share)}${s.missing ? ' (some ingredients have no data, may be more)' : ''}`;

/** check_recipe's answer: one portion against the gaps, in words the model can quote. */
export function describeCheck(c: PortionCheck, portions: number): string {
  const head = [c.kcal !== undefined ? `${fmtNumber(Math.round(c.kcal))} kcal` : 'energy unknown', c.proteinG !== undefined ? `protein ${fmtNumber(Math.round(c.proteinG))} g` : 'protein unknown'];
  const lines = [`One portion (1 of ${portions}, after cooking losses): ${head.join(', ')}. Shares are of the daily recommended intake.`];
  const low = c.gaps.filter((g) => g.status === 'low');
  const getting = c.gaps.filter((g) => g.status === 'gettingLow');
  lines.push(low.length ? `Low now: ${low.map(shareText).join('; ')}.` : 'Low now: nothing.');
  if (getting.length) lines.push(`Getting low now: ${getting.map(shareText).join('; ')}.`);
  if (c.high.length) lines.push(`Already too high (keep these small): ${c.high.map(shareText).join('; ')}.`);
  if (c.rich.length) lines.push(`Also rich in: ${c.rich.slice(0, 8).map(shareText).join('; ')}.`);
  return lines.join('\n');
}

/** A short line for a card: the gaps one portion helps with most (at most three). */
export function topGaps(c: PortionCheck, n = 3): PortionShare[] {
  return [...c.gaps].sort((a, b) => b.share - a.share).filter((g) => g.share >= 0.05).slice(0, n);
}

const STATUS_WORD: Record<string, string> = { low: 'Low', gettingLow: 'Getting low', tooHigh: 'Too high', fine: 'Enough', unknown: 'Not enough data' };

/** How each status value reads: what the percentage means for that kind of gauge. */
function valueText(r: Pick<NutrientResult, 'kind' | 'value' | 'windowDays' | 'store'>): string {
  const v = pct(r.value.central);
  if (r.kind === 'limit') return `about ${v} of the daily limit`;
  const average = `about ${v} of the need on average over ${r.windowDays} days`;
  return r.store ? `${average}; body store about ${pct(r.store.fill.central)} full` : average;
}

/** The current nutrient status, grouped, for nutrient_gaps. */
export function describeStatus(nutrients: ReadonlyMap<string, Pick<NutrientResult, 'kind' | 'status' | 'value' | 'windowDays' | 'store'>>, hidden: ReadonlySet<string> = new Set()): string {
  const groups = new Map<string, string[]>();
  for (const n of NUTRIENTS) {
    const r = nutrients.get(n.id);
    if (!r || r.kind === 'info' || hidden.has(n.id) || n.id === 'ENERCC') continue;
    const word = STATUS_WORD[r.status];
    if (!word) continue;
    const list = groups.get(word) ?? [];
    list.push(r.status === 'fine' || r.status === 'unknown' ? n.name : `${n.name} (${valueText(r)})`);
    groups.set(word, list);
  }
  return ['Low', 'Getting low', 'Too high', 'Enough', 'Not enough data']
    .filter((w) => groups.get(w)?.length)
    .map((w) => `${w}: ${groups.get(w)!.join('; ')}.`)
    .join('\n');
}

/** Foods the user can eat that close the urgent gaps best (the "Foods that fill your gaps" ranking). */
export function gapFoods(
  db: Pick<FoodDb, 'foods' | 'byCode'>,
  nutrients: ReadonlyMap<string, NutrientResult>,
  req: ResolvedRequirements,
  exclusions: Profile['exclusions'],
  n = 15,
): string[] {
  const groups = new Set(exclusions.groups);
  const foods = new Set(exclusions.foods);
  const candidates = db.foods.filter((f) => !NON_SINGLE_FOOD_GROUPS.has(f.group) && !groups.has(f.group) && !foods.has(f.code)).map((f) => ({ key: f.code, per100: f.per100 }));
  const ranked = diverseTop(rankFoods(candidates, nutrients, req, 80), n, (g) => db.byCode.get(g.key) ?? { code: g.key, nameEn: g.key });
  return ranked.map((r) => {
    const f = db.byCode.get(r.key);
    const helps = r.helps.slice(0, 3).map((h) => `${NUTRIENT_BY_ID.get(h.id)?.name ?? h.id} ${pct(h.coverage)}`);
    return `${r.key} | ${f?.nameEn ?? r.key} | ${fmtNumber(Math.round(r.grams))} g covers about: ${helps.join(', ')} of the day's absorbed need`;
  });
}

/** Foods logged most often in the last `days` days, by name, for ideas the user actually eats. */
export function oftenEaten(log: readonly LogEntry[], today: string, days: number, n = 20): string[] {
  const since = addDays(today, -days);
  const counts = new Map<string, number>();
  for (const e of log) {
    if (e.day < since || e.day > today || (e.kind !== 'food' && e.kind !== 'portion')) continue;
    counts.set(e.label, (counts.get(e.label) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([label, c]) => `${label} (${c}×)`);
}

/** The foods in a proposal that the user excluded (by food or by food group), by name. */
export function excludedFoods(foods: ReadonlyArray<Pick<Food, 'code' | 'group' | 'nameEn'>>, exclusions: Profile['exclusions']): string[] {
  const groups = new Set(exclusions.groups);
  const codes = new Set(exclusions.foods);
  return foods.filter((f) => codes.has(f.code) || groups.has(f.group)).map((f) => f.nameEn);
}

/** A recipe as the assistant sees it in list_recipes. */
export interface RecipeInfo {
  id: string;
  name: string;
  portions: number;
  ingredients: Ingredient[];
  instructions?: string;
  /** Batches cooked in the last 60 days. */
  cookedLately: number;
  /** Portions left in stock across its batches. */
  inStock: number;
  /** Weight of the empty pot it was last cooked in (g), if weighed. */
  potGrams?: number;
  /** Its batches with portions left, oldest first: what the user can eat from stock. */
  stock: StockBatch[];
}

/** A batch with portions left, as the assistant is told about it. */
export interface StockBatch {
  id: string;
  cookedDay: string;
  left: Batch['remaining'];
  cookedGrams?: number;
  /** What went into this pot (the recipe's ingredients unless the pot was made differently). */
  ingredients: Ingredient[];
  /** The pot was made differently from the recipe. */
  changed: boolean;
}

/** Days counted as "lately" for how often a recipe was cooked. */
export const COOKED_LATELY_DAYS = 60;

export function recipeInfos(recipes: readonly Recipe[], batches: readonly Batch[], today: string): RecipeInfo[] {
  const since = addDays(today, -COOKED_LATELY_DAYS);
  return recipes
    .filter((r) => !r.archived)
    .map((r) => {
      const own = batches.filter((b) => b.recipeId === r.id);
      return {
        id: r.id,
        name: r.name,
        portions: r.portions,
        ingredients: r.ingredients,
        ...(r.instructions?.trim() ? { instructions: r.instructions.trim() } : {}),
        cookedLately: own.filter((b) => b.cookedDay >= since).length,
        inStock: own.reduce((n, b) => n + totalLeft(b), 0),
        ...(r.potGrams ? { potGrams: r.potGrams } : {}),
        stock: own
          .filter((b) => totalLeft(b) > 0)
          .sort((a, b) => a.cookedAt - b.cookedAt)
          .map((b) => ({
            id: b.id,
            cookedDay: b.cookedDay,
            left: b.remaining,
            ...(b.cookedGrams ? { cookedGrams: b.cookedGrams } : {}),
            ingredients: b.recipe.ingredients,
            changed: !!b.recipeIngredients && !sameIngredients(b.recipeIngredients, b.recipe.ingredients),
          })),
      };
    });
}
