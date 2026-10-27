/**
 * The assistant's review of what was logged (owner's pick, 2026-10-27: the check list in Settings
 * and an assistant that looks it over and proposes fixes as cards). check_logged_foods reads the
 * same list as Settings → Check logged foods, with each food's label, ingredients and BLS food so
 * the model can judge the pairing; propose_food_fix shows one fix as a card (F1, F2, …): a
 * product's similar BLS food, built from its ingredients or label values only, or another BLS food
 * for entries logged as a BLS food. propose_mark_checked marks the foods it found right as checked in
 * one card, so the next check covers only new ones (owner's ask, 2026-10-27). With Patterns on, the
 * check reads only what the user ticked under Include my data: the food log from its period, the
 * things at home in the ticked places. Pure, tested in foodCheck.test.ts.
 */
import { z } from 'zod';
import type { FoodDb } from '../foods/foodDb';
import { ingredientMix } from '../foods/productMatch';
import { productLabel } from '../foods/products';
import { addDays } from '../lib/dates';
import { fmtNumber } from '../lib/format';
import { refKey } from '../lib/refs';
import { foodCheck, type CheckRow, type HomeRef } from '../logic/foodCheck';
import type { Batch, HomePlace, LogEntry, MixPart, Product } from '../storage/types';
import { describeFood, describeProduct } from './tools';

/** What was logged, for the check (main chat only; read only when the model calls the tool). */
export interface FoodCheckData {
  today: string;
  log: readonly LogEntry[];
  batchesById: ReadonlyMap<string, Batch>;
  productsById: ReadonlyMap<string, Product>;
  /** Foods the user marked "Looks right" (refKey → checkSignature); left out unless asked for. */
  checked?: Readonly<Record<string, string>>;
  /**
   * What the user included under Include my data (Patterns on): the food log from this day on
   * (false: not included), and the things at home in the ticked places (false: the kitchen is
   * there to tick but was not). Missing: there are no tick boxes, the check reads the whole log.
   */
  scope?: { log: string | false; kitchen?: false | { places: HomePlace[]; items: HomeRef[] } };
}

/** Entries listed per food; the rest is counted. */
const ENTRIES_SHOWN = 8;
/** Ingredients listed per product, biggest first; enough to tell a beer from a sausage. */
const INGREDIENTS_SHOWN = 12;

/** The days to look at and the log to read: what the user included, within the days asked for. */
function scoped(days: number, data: FoodCheckData): { from: string; to: string; log: readonly LogEntry[] } {
  const log = data.scope?.log === false ? [] : data.log;
  let from = days > 0 ? addDays(data.today, -days + 1) : log.reduce((a, e) => (e.day < a ? e.day : a), data.today);
  if (data.scope?.log && from < data.scope.log) from = data.scope.log;
  return { from, to: data.today, log };
}

const kitchenOf = (data: FoodCheckData) => data.scope?.kitchen || undefined;

/** The rows of the check: what was eaten in the days asked for and what is at home, as included. */
function rowsOf(days: number, data: FoodCheckData, db: Pick<FoodDb, 'byCode'>) {
  const { from, to, log } = scoped(days, data);
  return { from, to, log, rows: foodCheck(log, data.batchesById, data.productsById, db, from, to, data.checked, kitchenOf(data)?.items ?? []) };
}

const NOT_INCLUDED =
  'The user has not included their food log or their kitchen in this chat, so there is nothing to check. Ask them to tick Food log (and Kitchen, for what they have at home) under Include my data below the message box, then send again; in a new chat if this one already has data.';

/** Food entries of one food (by refKey) in the period, oldest first. */
function entriesOf(key: string, from: string, to: string, log: readonly LogEntry[]): Array<Extract<LogEntry, { kind: 'food' }>> {
  return log
    .filter((e): e is Extract<LogEntry, { kind: 'food' }> => e.kind === 'food' && e.ref.source !== 'custom' && refKey(e.ref) === key && e.day >= from && e.day <= to)
    .sort((a, b) => a.time - b.time);
}

const FLAG_TEXT = { misfit: 'LABEL AND ITS BLS FOOD DIFFER A LOT', none: 'NO BLS FOOD: only the label counts', auto: 'picked by the app, not checked' } as const;
const KIND_TEXT = {
  drink: 'A DRINK PAIRED WITH A FOOD',
  food: 'A FOOD PAIRED WITH A DRINK',
  fish: 'PAIRED WITH FISH BUT IS NOT FISH',
  meat: 'PAIRED WITH MEAT BUT IS NOT MEAT',
  supplement: 'A SUPPLEMENT PAIRED WITH A FOOD (should be label only)',
} as const;

function describeRow(r: CheckRow, log: readonly LogEntry[], db: Pick<FoodDb, 'byCode' | 'groups'>, from: string, to: string): string {
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
  if (r.checked) parts.push('checked by the user');
  else for (const f of r.flags) parts.push(f === 'kind' ? KIND_TEXT[r.kind!] : FLAG_TEXT[f]);
  const entries = entriesOf(r.key, from, to, log);
  if (entries.length) {
    const shown = entries.slice(0, ENTRIES_SHOWN).map((e) => `${e.day} ${fmtNumber(e.grams, 0)} g${e.pieces ? ` (${e.pieces} pieces)` : ''}`);
    parts.push(`eaten: ${shown.join(', ')}${entries.length > ENTRIES_SHOWN ? `, and ${entries.length - ENTRIES_SHOWN} more` : ''}`);
  }
  if (r.recipes.length) parts.push(`in recipes: ${r.recipes.join(', ')}`);
  if (r.home) parts.push(`at home: ${r.home.join(', ')}`);
  return parts.join(' | ');
}

const checkInput = z.object({ days: z.number().int().min(0).max(3650), include_checked: z.boolean().optional() });

/** Run `check_logged_foods`: every food eaten in the period (and at home, if included), flagged ones first. */
export function runCheckLoggedFoods(input: unknown, data: FoodCheckData, db: Pick<FoodDb, 'byCode' | 'groups'>): { ok: boolean; text: string } {
  const parsed = checkInput.safeParse(input);
  if (!parsed.success) return { ok: false, text: 'Invalid input: expected {"days": 7, "include_checked": false} (days 0 for everything logged).' };
  const kitchen = kitchenOf(data);
  if (data.scope?.log === false && !kitchen) return { ok: true, text: NOT_INCLUDED };
  const { from, to, log, rows: all } = rowsOf(parsed.data.days, data, db);
  const rows = parsed.data.include_checked ? all : all.filter((r) => !r.checked);
  const skipped = all.length - rows.length;
  const notes = [
    data.scope?.log === false && 'The user did not include their food log: only what is at home is listed.',
    typeof data.scope?.log === 'string' && from === data.scope.log && `The user included their food log from ${from} on only.`,
    data.scope?.kitchen === false && 'The kitchen is not included (the user can tick Kitchen under Include my data).',
    skipped && `${skipped} more the user already checked are left out (include_checked: true lists them too).`,
  ].filter((n): n is string => !!n);
  const note = notes.map((n) => ` ${n}`).join('');
  const what = [data.scope?.log !== false && `logged from ${from} to ${to}`, kitchen && `at home (${kitchen.places.join(', ')})`].filter(Boolean).join(' and ');
  if (!rows.length) return { ok: true, text: `Nothing ${skipped ? 'left to check' : 'to check'}: no foods ${what}.${note}` };
  const flagged = rows.filter((r) => !r.checked && r.flags.length).length;
  return {
    ok: true,
    text: `Foods ${what}: ${rows.length}, ${flagged} flagged by the app.${note} One line each: key, the food or product, its BLS food and what was eaten. Keys are BLS:<code> for BLS foods and OFF:/USDA: for products.\n${rows.map((r) => describeRow(r, log, db, from, to)).join('\n')}`,
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
  const { from, to, log } = scoped(days, data);
  const entries = entriesOf(food, from, to, log);
  if (!entries.length) {
    if (kitchenOf(data)?.items.some((h) => refKey(h.ref) === food)) return { ok: false, error: `${food} is at home but was not logged by itself from ${from} to ${to}: say in your text which food it should be; the user changes it in the Kitchen.` };
    return { ok: false, error: `${food} was not logged by itself from ${from} to ${to}. Foods only eaten in a recipe are changed in the recipe, not here.` };
  }
  return { ok: true, proposal: { ...base, name: current.nameEn, code, entryIds: entries.map((e) => e.id) } };
}

/** Foods the assistant found right, marked as checked in one card so later checks leave them out. */
export interface MarkCheckedProposal {
  use: 'looks_right';
  foods: Array<{ key: string; name: string }>;
  reason: string;
  replaces?: string;
}

const markInput = z.object({ foods: z.array(z.string()).min(1).max(1000), reason: z.string().optional(), replaces: z.string().optional() });

/** Check a `propose_mark_checked` call: every key from the check (anything included, all days), each once, not checked already. */
export function validateMarkChecked(input: unknown, data: FoodCheckData, db: Pick<FoodDb, 'byCode'>): { ok: true; proposal: MarkCheckedProposal } | { ok: false; error: string } {
  const parsed = markInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input: expected {"foods": ["OFF:…", "BLS:…"], "reason": "…", "replaces": ""}.' };
  const byKey = new Map(rowsOf(0, data, db).rows.map((r) => [r.key, r]));
  const keys = [...new Set(parsed.data.foods.map((f) => f.trim()))];
  const unknown = keys.filter((k) => !byKey.has(k));
  if (unknown.length) return { ok: false, error: `Not in the list from check_logged_foods: ${unknown.join(', ')}. Use the keys it gave (OFF:…, USDA:… or BLS:…).` };
  const rows = keys.map((k) => byKey.get(k)!).filter((r) => !r.checked);
  if (!rows.length) return { ok: false, error: 'The user already checked all of these.' };
  const { reason = '', replaces } = parsed.data;
  return { ok: true, proposal: { use: 'looks_right', foods: rows.map((r) => ({ key: r.key, name: r.name })), reason: reason.trim(), ...(replaces ? { replaces } : {}) } };
}
