/**
 * The tools the AI assistant may use, and the app-side code that runs them. Pure functions: the
 * assistant can only look up BLS foods and propose a meal made of BLS codes plus grams. It never
 * supplies nutrient values, so every number in the log still comes from the database
 * (docs/SPEC.md, "AI assistant logging").
 */
import { z } from 'zod';
import type { Food, FoodDb } from '../foods/foodDb';
import { search, type SearchIndex } from '../foods/search';
import type { Preparation } from '../model/paramTypes';
import type { RawValue } from '../model/types';

export const PREPARATIONS = ['asListed', 'raw', 'boiled', 'steamed', 'baked', 'fried'] as const satisfies readonly Preparation[];

/** Results per search query: enough to choose from, small enough to keep requests cheap. */
const RESULTS_PER_QUERY = 8;
const MAX_QUERIES = 6;
/**
 * Sanity limit for one item, not a physiological number: anything above is far more likely a
 * unit slip (ml vs. l, g vs. kg) than a meal, so the model is asked to check it.
 */
export const MAX_ITEM_GRAMS = 3000;

export const searchInput = z.object({ queries: z.array(z.string()).min(1) });

export const proposalInput = z.object({
  summary: z.string(),
  items: z
    .array(
      z.object({
        code: z.string(),
        grams: z.number(),
        preparation: z.enum(PREPARATIONS),
        note: z.string(),
      }),
    )
    .min(1),
  assumptions: z.array(z.string()),
  confidence: z.enum(['B', 'C']),
});

export type ProposalInput = z.infer<typeof proposalInput>;

export interface ProposedItem {
  food: Food;
  grams: number;
  preparation: Preparation;
  note: string;
}

export interface Proposal {
  summary: string;
  items: ProposedItem[];
  assumptions: string[];
  confidence: 'B' | 'C';
}

function fmt(v: RawValue | undefined): string {
  if (v === null || v === undefined) return '?';
  if (v === 't') return 'trace';
  return String(Math.round(v * 10) / 10);
}

/** One line per food: code, names, group and macros per 100 g (so the model can sanity-check). */
export function describeFood(food: Food, db: Pick<FoodDb, 'groups'>): string {
  const p = food.per100;
  const group = db.groups[food.group]?.en ?? food.group;
  return `${food.code} | ${food.nameEn} | ${food.nameDe} | ${group} | per 100 g: ${fmt(p.ENERCC)} kcal, protein ${fmt(p.PROT625)} g, fat ${fmt(p.FAT)} g, carbs ${fmt(p.CHO)} g`;
}

export interface ToolContext {
  db: Pick<FoodDb, 'byCode' | 'groups'>;
  index: SearchIndex;
  boost?: (code: string) => number;
}

/** Run `search_foods`. Returns the text sent back to the model. */
export function runSearchFoods(input: unknown, ctx: ToolContext): { ok: boolean; text: string } {
  const parsed = searchInput.safeParse(input);
  if (!parsed.success) return { ok: false, text: 'Invalid input: expected {"queries": ["…"]}.' };
  const blocks = parsed.data.queries.slice(0, MAX_QUERIES).map((q) => {
    const hits = search(ctx.index, q, { limit: RESULTS_PER_QUERY, boost: ctx.boost })
      .map((h) => ctx.db.byCode.get(h.key))
      .filter((f): f is Food => !!f);
    const lines = hits.length ? hits.map((f) => describeFood(f, ctx.db)).join('\n') : 'No matches. Try a shorter or more generic word, in English or German.';
    return `Results for "${q}":\n${lines}`;
  });
  return { ok: true, text: blocks.join('\n\n') };
}

/** Check a `propose_meal` call: every code must exist in BLS and every amount must be plausible. */
export function validateProposal(input: unknown, db: Pick<FoodDb, 'byCode'>): { ok: true; proposal: Proposal } | { ok: false; error: string } {
  const parsed = proposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const problems: string[] = [];
  const items: ProposedItem[] = [];
  for (const it of parsed.data.items) {
    const food = db.byCode.get(it.code.trim());
    if (!food) problems.push(`Unknown code ${it.code}: use only codes returned by search_foods.`);
    if (!(it.grams > 0) || it.grams > MAX_ITEM_GRAMS) problems.push(`${it.code}: ${it.grams} g is not plausible (expected more than 0 and at most ${MAX_ITEM_GRAMS} g).`);
    if (food && it.grams > 0 && it.grams <= MAX_ITEM_GRAMS) items.push({ food, grams: Math.round(it.grams * 10) / 10, preparation: it.preparation, note: it.note.trim() });
  }
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_meal again.` };
  return {
    ok: true,
    proposal: {
      summary: parsed.data.summary.trim(),
      items,
      assumptions: parsed.data.assumptions.map((a) => a.trim()).filter(Boolean),
      confidence: parsed.data.confidence,
    },
  };
}
