/**
 * The assistant's review of what was logged (owner's pick, 2026-10-27: the check list in Settings
 * and an assistant that looks it over and proposes fixes as cards). check_logged_foods reads the
 * same list as Settings → Check logged foods, with each food's label, ingredients and BLS food so
 * the model can judge the pairing; propose_food_fix shows one fix as a card (F1, F2, …): a
 * product's similar BLS food, built from its ingredients or label values only, or another BLS food
 * for entries logged as a BLS food. Pure, tested in foodCheck.test.ts.
 */
import { z } from 'zod';
import type { FoodDb } from '../foods/foodDb';
import { ingredientMix } from '../foods/productMatch';
import { productLabel } from '../foods/products';
import { addDays } from '../lib/dates';
import { fmtNumber } from '../lib/format';
import { refKey } from '../lib/refs';
import { foodCheck, type CheckRow } from '../logic/foodCheck';
import type { Batch, LogEntry, MixPart, Product } from '../storage/types';
import { describeFood, describeProduct } from './tools';

/** What was logged, for the check (main chat only; read only when the model calls the tool). */
export interface FoodCheckData {
  today: string;
  log: readonly LogEntry[];
  batchesById: ReadonlyMap<string, Batch>;
  productsById: ReadonlyMap<string, Product>;
}

/** Entries listed per food; the rest is counted. */
const ENTRIES_SHOWN = 8;
/** Ingredients listed per product, biggest first; enough to tell a beer from a sausage. */
const INGREDIENTS_SHOWN = 12;

const period = (days: number, data: FoodCheckData) => ({
  from: days > 0 ? addDays(data.today, -days + 1) : data.log.reduce((a, e) => (e.day < a ? e.day : a), data.today),
  to: data.today,
});

/** Food entries of one food (by refKey) in the period, oldest first. */
function entriesOf(key: string, from: string, to: string, log: readonly LogEntry[]): Array<Extract<LogEntry, { kind: 'food' }>> {
  return log
    .filter((e): e is Extract<LogEntry, { kind: 'food' }> => e.kind === 'food' && e.ref.source !== 'custom' && refKey(e.ref) === key && e.day >= from && e.day <= to)
    .sort((a, b) => a.time - b.time);
}

const FLAG_TEXT = { misfit: 'LABEL AND ITS BLS FOOD DIFFER A LOT', none: 'NO BLS FOOD: only the label counts', auto: 'picked by the app, not checked' } as const;

function describeRow(r: CheckRow, data: FoodCheckData, db: Pick<FoodDb, 'byCode' | 'groups'>, from: string, to: string): string {
  const parts: string[] = [];
  if (r.product) {
    parts.push(describeProduct(r.product, db));
    if (r.product.categories.length) parts.push(`categories: ${r.product.categories.join(', ')}`);
    const ings = r.product.ingredients;
    if (ings?.length) parts.push(`ingredients: ${ings.slice(0, INGREDIENTS_SHOWN).map((i) => (i.percent !== undefined ? `${i.text} ${fmtNumber(i.percent, 1)}%` : i.text)).join(', ')}${ings.length > INGREDIENTS_SHOWN ? ', …' : ''}`);
    const food = r.product.match && !r.product.match.parts ? db.byCode.get(r.product.match.code) : undefined;
    if (food) parts.push(`its BLS food: ${describeFood(food, db)}`);
    if (r.fit !== undefined) parts.push(`label fit ${fmtNumber(r.fit, 2)}`);
  } else {
    const food = r.ref.source === 'BLS' ? db.byCode.get(r.ref.code) : undefined;
    parts.push(food ? `BLS:${describeFood(food, db)}` : `${r.key} | ${r.name}`);
  }
  for (const f of r.flags) parts.push(FLAG_TEXT[f]);
  const entries = entriesOf(r.key, from, to, data.log);
  if (entries.length) {
    const shown = entries.slice(0, ENTRIES_SHOWN).map((e) => `${e.day} ${fmtNumber(e.grams, 0)} g${e.pieces ? ` (${e.pieces} pieces)` : ''}`);
    parts.push(`eaten: ${shown.join(', ')}${entries.length > ENTRIES_SHOWN ? `, and ${entries.length - ENTRIES_SHOWN} more` : ''}`);
  }
  if (r.recipes.length) parts.push(`in recipes: ${r.recipes.join(', ')}`);
  return parts.join(' | ');
}

const checkInput = z.object({ days: z.number().int().min(0).max(3650) });

/** Run `check_logged_foods`: every food eaten in the period, flagged ones first. */
export function runCheckLoggedFoods(input: unknown, data: FoodCheckData, db: Pick<FoodDb, 'byCode' | 'groups'>): { ok: boolean; text: string } {
  const parsed = checkInput.safeParse(input);
  if (!parsed.success) return { ok: false, text: 'Invalid input: expected {"days": 7} (0 for everything logged).' };
  const { from, to } = period(parsed.data.days, data);
  const rows = foodCheck(data.log, data.batchesById, data.productsById, db, from, to);
  if (!rows.length) return { ok: true, text: `Nothing was logged from ${from} to ${to}.` };
  const flagged = rows.filter((r) => r.flags.length).length;
  return {
    ok: true,
    text: `Foods logged from ${from} to ${to}: ${rows.length}, ${flagged} flagged by the app. One line each: key, the food or product, its BLS food and what was eaten. Keys are BLS:<code> for BLS foods and OFF:/USDA: for products.\n${rows.map((r) => describeRow(r, data, db, from, to)).join('\n')}`,
  };
}

/** A fix as proposed: for a product, its new similar food (or mix, or none); for a BLS food, the entries that change. */
export interface FoodFixProposal {
  /** refKey of the food, as check_logged_foods listed it. */
  food: string;
  name: string;
  use: 'bls' | 'ingredients' | 'label_only';
  /** The new BLS food (use 'bls'); for 'ingredients' the mix's biggest part. */
  code?: string;
  parts?: MixPart[];
  /** BLS foods only: the entries that get the new food. */
  entryIds?: string[];
  reason: string;
  replaces?: string;
}

const fixInput = z.object({
  food: z.string(),
  use: z.enum(['bls', 'ingredients', 'label_only']),
  code: z.string().optional(),
  days: z.number().int().min(0).max(3650).optional(),
  reason: z.string().optional(),
  replaces: z.string().optional(),
});

/** Check a `propose_food_fix` call against what was logged and the food database. */
export function validateFoodFix(input: unknown, data: FoodCheckData, db: Pick<FoodDb, 'byCode'>): { ok: true; proposal: FoodFixProposal } | { ok: false; error: string } {
  const parsed = fixInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input: expected {"food": "OFF:… or BLS:…", "use": "bls" | "ingredients" | "label_only", "code": "BLS code for bls", "days": 7, "reason": "…", "replaces": ""}.' };
  const { food, use, days = 7, reason = '', replaces } = parsed.data;
  const code = parsed.data.code?.trim().replace(/^BLS:/, '');
  const base = { food, use, reason: reason.trim(), ...(replaces ? { replaces } : {}) };
  const product = data.productsById.get(food);
  if (product) {
    const name = productLabel(product);
    if (use === 'label_only') return { ok: true, proposal: { ...base, name } };
    if (use === 'ingredients') {
      const parts = ingredientMix(product, db);
      if (!parts) return { ok: false, error: `${food}: its ingredient list is missing, too little of it is known, or the mix does not fit the label. Propose a BLS food instead.` };
      return { ok: true, proposal: { ...base, name, code: parts[0]!.code, parts } };
    }
    if (!code || !db.byCode.has(code)) return { ok: false, error: `${food}: "${code ?? ''}" is not a BLS code. Use a code from search_foods.` };
    if (product.match?.code === code && !product.match.parts) return { ok: false, error: `${food} already takes its micronutrients from ${code}.` };
    return { ok: true, proposal: { ...base, name, code } };
  }
  if (!food.startsWith('BLS:')) return { ok: false, error: `${food} is not in the list from check_logged_foods. Use a key it gave (OFF:…, USDA:… or BLS:…).` };
  const current = db.byCode.get(food.slice(4));
  if (!current) return { ok: false, error: `${food} is not a BLS food.` };
  if (use !== 'bls') return { ok: false, error: `${food} is a BLS food: only use "bls" with another BLS code works for it.` };
  if (!code || !db.byCode.has(code)) return { ok: false, error: `${food}: "${code ?? ''}" is not a BLS code. Use a code from search_foods.` };
  if (code === current.code) return { ok: false, error: `${food} is already that food.` };
  const { from, to } = period(days, data);
  const entries = entriesOf(food, from, to, data.log);
  if (!entries.length) return { ok: false, error: `${food} was not logged by itself from ${from} to ${to}. Foods only eaten in a recipe are changed in the recipe, not here.` };
  return { ok: true, proposal: { ...base, name: current.nameEn, code, entryIds: entries.map((e) => e.id) } };
}
