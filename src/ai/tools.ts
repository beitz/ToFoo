/**
 * The tools the AI assistant may use, and the app-side code that runs them. The assistant can only
 * look up BLS foods (and, with the Open Food Facts lookup on, packaged products by barcode) and
 * propose a meal made of those codes plus grams. It never supplies nutrient values, so every
 * number in the log still comes from a database (docs/SPEC.md, "AI assistant logging").
 * Everything here is pure except the injected product lookup.
 */
import { z } from 'zod';
import type { Food, FoodDb } from '../foods/foodDb';
import type { FindResult } from '../foods/findProduct';
import { normalizeBarcode } from '../foods/openFoodFacts';
import { barcodeOf, isProductCode, productFood, productId, productLabel } from '../foods/products';
import { normalize, search, type SearchIndex } from '../foods/search';
import { parseLocalDateTime } from './photoTime';
import { fmtNumber } from '../lib/format';
import type { Preparation } from '../model/paramTypes';
import type { RawValue } from '../model/types';
import type { Product } from '../storage/types';

export const PREPARATIONS = ['asListed', 'raw', 'boiled', 'steamed', 'baked', 'fried'] as const satisfies readonly Preparation[];

/** Results per search query: enough to choose from, small enough to keep requests cheap. */
const RESULTS_PER_QUERY = 8;
const MAX_QUERIES = 6;
const MAX_BARCODES = 4;
/** Saved products listed per search query. */
const PRODUCTS_PER_QUERY = 4;
/**
 * Sanity limit for one item, not a physiological number: anything above is far more likely a
 * unit slip (ml vs. l, g vs. kg) than a meal, so the model is asked to check it.
 */
export const MAX_ITEM_GRAMS = 3000;
/** Sanity limits for a proposed meal time: clock skew ahead, about a year back. */
const FUTURE_SLACK_MS = 10 * 60_000;
const MAX_PAST_MS = 400 * 86_400_000;

export const searchInput = z.object({ queries: z.array(z.string()).min(1) });
export const lookupInput = z.object({ barcodes: z.array(z.string()).min(1) });

export const proposalInput = z.object({
  summary: z.string(),
  items: z
    .array(
      z.object({
        code: z.string(),
        grams: z.number(),
        preparation: z.enum(PREPARATIONS),
        note: z.string(),
        /** Products only: BLS code of the most similar food, for what the label lacks. */
        micros_from: z.string().optional(),
      }),
    )
    .min(1),
  assumptions: z.array(z.string()),
  confidence: z.enum(['B', 'C']),
  /** Local "YYYY-MM-DD HH:MM" when the meal was eaten; empty for the chat's default time. */
  time: z.string().optional(),
  /** Id of the open card this proposal replaces (e.g. "M2"); empty for a new meal. */
  replaces: z.string().optional(),
});

export type ProposalInput = z.infer<typeof proposalInput>;

export interface ProposedItem {
  food: Food;
  grams: number;
  preparation: Preparation;
  note: string;
  /** For packaged products: the product with its BLS match, to save when the meal is logged. */
  product?: Product;
}

export interface Proposal {
  summary: string;
  items: ProposedItem[];
  assumptions: string[];
  confidence: 'B' | 'C';
  /** When it was eaten (epoch ms); absent means the chat's default time. */
  time?: number;
  /** Card id this one replaces. */
  replaces?: string;
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

/** Packaged products (Open Food Facts lookup on): what the assistant may use and how it looks them up. */
export interface ProductTools {
  /** Products saved on this phone, by barcode (listed by search_foods without any request). */
  saved: ReadonlyMap<string, Product>;
  /** Look up a barcode: this phone first, then Open Food Facts. */
  find: (barcode: string) => Promise<FindResult>;
  /** Products looked up in this conversation, by barcode (filled by lookup_barcode). */
  seen: Map<string, Product>;
}

export interface ToolContext {
  db: Pick<FoodDb, 'byCode' | 'groups'> & { version?: string };
  index: SearchIndex;
  boost?: (code: string) => number;
  /** Absent when the Open Food Facts lookup is off. */
  products?: ProductTools;
  /** Current time, for checking proposed meal times (injected to keep this pure). */
  now?: number;
}

const LABEL_FIELDS: Array<[string, string, string]> = [
  ['ENERCC', '', 'kcal'],
  ['PROT625', 'protein ', 'g'],
  ['FAT', 'fat ', 'g'],
  ['CHO', 'carbs ', 'g'],
  ['SUGAR', 'sugars ', 'g'],
];

/** One line per product: code, name, brand, sizes, label macros and its BLS match if chosen. */
export function describeProduct(p: Product, db: Pick<FoodDb, 'byCode'>): string {
  const sizes = [p.quantity && `pack ${p.quantity}`, p.serving && `serving ${p.serving.label}`].filter(Boolean).join(', ');
  const label = LABEL_FIELDS.filter(([id]) => p.per100[id] !== undefined).map(([id, name, unit]) => `${name}${fmtNumber(p.per100[id]!, 1)} ${unit}`);
  const match = p.match ? db.byCode.get(p.match.code) : undefined;
  return [
    productId(p.code),
    productLabel(p),
    sizes || 'size unknown',
    label.length ? `label per 100 ${p.perMl ? 'ml' : 'g'}: ${label.join(', ')}` : 'no nutrition values on the label data',
    match ? `micronutrients from ${match.code} ${match.nameEn} (chosen by the user)` : 'no similar BLS food chosen yet',
  ].join(' | ');
}

function savedProductHits(q: string, products: ProductTools | undefined): Product[] {
  if (!products) return [];
  const words = normalize(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  return [...products.saved.values()].filter((p) => words.every((w) => normalize(`${p.name} ${p.brand ?? ''}`).includes(w))).slice(0, PRODUCTS_PER_QUERY);
}

/** Run `search_foods`. Returns the text sent back to the model. */
export function runSearchFoods(input: unknown, ctx: ToolContext): { ok: boolean; text: string } {
  const parsed = searchInput.safeParse(input);
  if (!parsed.success) return { ok: false, text: 'Invalid input: expected {"queries": ["…"]}.' };
  const blocks = parsed.data.queries.slice(0, MAX_QUERIES).map((q) => {
    const hits = search(ctx.index, q, { limit: RESULTS_PER_QUERY, boost: ctx.boost })
      .map((h) => ctx.db.byCode.get(h.key))
      .filter((f): f is Food => !!f);
    const products = savedProductHits(q, ctx.products);
    const lines = [...products.map((p) => describeProduct(p, ctx.db)), ...hits.map((f) => describeFood(f, ctx.db))];
    return `Results for "${q}":\n${lines.length ? lines.join('\n') : 'No matches. Try a shorter or more generic word, in English or German.'}`;
  });
  return { ok: true, text: blocks.join('\n\n') };
}

/** Run `lookup_barcode`: products found are remembered for propose_meal. */
export async function runLookupBarcode(input: unknown, ctx: ToolContext): Promise<{ ok: boolean; text: string }> {
  if (!ctx.products) return { ok: false, text: 'The Open Food Facts lookup is off.' };
  const parsed = lookupInput.safeParse(input);
  if (!parsed.success) return { ok: false, text: 'Invalid input: expected {"barcodes": ["…"]}.' };
  const lines: string[] = [];
  for (const raw of parsed.data.barcodes.slice(0, MAX_BARCODES)) {
    const code = normalizeBarcode(raw);
    if (!code) {
      lines.push(`${raw}: not a valid barcode (check the digits; the last one is a check digit).`);
      continue;
    }
    const r = await ctx.products.find(code);
    if (r.kind === 'found') {
      ctx.products.seen.set(r.product.code, r.product);
      lines.push(describeProduct(r.product, ctx.db));
    } else if (r.kind === 'notFound') lines.push(`${code}: not in Open Food Facts. Use the closest generic BLS food instead.`);
    else lines.push(`${code}: could not be looked up right now (${r.reason === 'offline' ? 'no connection' : 'Open Food Facts is busy'}). Use the closest generic BLS food instead.`);
  }
  return { ok: true, text: lines.join('\n') };
}

/** A product the assistant may use: looked up in this conversation or saved on this phone. */
function knownProduct(code: string, products: ProductTools | undefined): Product | undefined {
  const barcode = barcodeOf(code);
  return products?.seen.get(barcode) ?? products?.saved.get(barcode);
}

/**
 * Check a `propose_meal` call: every code must be a BLS food (or a product looked up or saved),
 * every amount plausible. A product needs a similar BLS food for its micronutrients unless the
 * user already chose one, which always wins.
 */
export function validateProposal(
  input: unknown,
  db: Pick<FoodDb, 'byCode'> & { version?: string },
  products?: ProductTools,
  now?: number,
): { ok: true; proposal: Proposal } | { ok: false; error: string } {
  const parsed = proposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const problems: string[] = [];
  const items: ProposedItem[] = [];
  for (const it of parsed.data.items) {
    const code = it.code.trim();
    let food: Food | undefined;
    let product: Product | undefined;
    if (isProductCode(code)) {
      const found = knownProduct(code, products);
      if (!found) problems.push(`Unknown product ${code}: use only products returned by lookup_barcode or search_foods.`);
      else if (found.match) product = found;
      else {
        const microsFrom = it.micros_from?.trim() ?? '';
        const match = microsFrom ? db.byCode.get(microsFrom) : undefined;
        if (!match) problems.push(`${code}: micros_from must be the BLS code (from search_foods) of the most similar generic food${microsFrom ? `; ${microsFrom} is not one` : ''}.`);
        else product = { ...found, match: { version: db.version ?? '4.0', code: match.code } };
      }
      if (product) food = productFood(product, db);
    } else {
      food = db.byCode.get(code);
      if (!food) problems.push(`Unknown code ${it.code}: use only codes returned by search_foods.`);
    }
    if (!(it.grams > 0) || it.grams > MAX_ITEM_GRAMS) problems.push(`${it.code}: ${it.grams} g is not plausible (expected more than 0 and at most ${MAX_ITEM_GRAMS} g).`);
    if (food && it.grams > 0 && it.grams <= MAX_ITEM_GRAMS) items.push({ food, grams: Math.round(it.grams * 10) / 10, preparation: it.preparation, note: it.note.trim(), ...(product ? { product } : {}) });
  }
  const timeText = parsed.data.time?.trim() ?? '';
  const time = timeText ? parseLocalDateTime(timeText) : undefined;
  if (timeText && time === undefined) problems.push(`time "${timeText}" is not a valid local time; write it as YYYY-MM-DD HH:MM, or leave it empty.`);
  else if (time !== undefined && now !== undefined && time > now + FUTURE_SLACK_MS) problems.push(`time ${timeText} is in the future.`);
  else if (time !== undefined && now !== undefined && time < now - MAX_PAST_MS) problems.push(`time ${timeText} is more than a year ago; check the year.`);
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_meal again.` };
  const replaces = parsed.data.replaces?.trim();
  return {
    ok: true,
    proposal: {
      summary: parsed.data.summary.trim(),
      items,
      assumptions: parsed.data.assumptions.map((a) => a.trim()).filter(Boolean),
      confidence: parsed.data.confidence,
      ...(time !== undefined ? { time } : {}),
      ...(replaces ? { replaces } : {}),
    },
  };
}
