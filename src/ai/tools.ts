/**
 * The tools the AI assistant may use, and the app-side code that runs them. The assistant can only
 * look up BLS foods (and, with the Open Food Facts lookup on, packaged products by barcode; with
 * USDA on, USDA foods by name) and propose a meal (or, in the recipe editor, ingredients) made of
 * those codes plus grams. It never supplies nutrient values, so every number in the log and in
 * recipes still comes from a database (docs/SPEC.md, "AI assistant logging").
 * Everything here is pure except the injected lookups.
 */
import { z } from 'zod';
import type { Food, FoodDb } from '../foods/foodDb';
import type { FindResult, UsdaFindResult } from '../foods/findProduct';
import type { OffListing } from '../foods/offIndex';
import { normalizeBarcode } from '../foods/openFoodFacts';
import { labelPiece, piecesToGrams } from '../foods/pieces';
import { hasOwnMicros, isProductCode, productFood, productId, productLabel, productRef } from '../foods/products';
import { normalize, search, type SearchIndex } from '../foods/search';
import { parseLocalDateTime } from './photoTime';
import { fmtNumber } from '../lib/format';
import { refKey } from '../lib/refs';
import { MAX_SLEEP_MS } from '../logic/sleep';
import { MAX_ACTIVITY_MINUTES } from '../logic/activity';
import { MAX_WATER_ML } from '../logic/water';
import { MAX_POT_GRAMS, MAX_POT_PORTIONS } from '../logic/batch';
import type { Preparation } from '../model/paramTypes';
import type { RawValue } from '../model/types';
import type { SkinExposure } from '../model/sun';
import { excludedFoods, type RecipeInfo } from '../logic/recipeIdeas';
import { stockAmount } from '../logic/pantry';
import { ACTIVITY_KINDS, HOME_PLACES, INTENSITIES, type ActivityKind, type FoodRef, type HomePlace, type Ingredient, type Intensity, type KetoneType, type Product, type Profile } from '../storage/types';

export const PREPARATIONS = ['asListed', 'raw', 'boiled', 'steamed', 'baked', 'fried'] as const satisfies readonly Preparation[];
const SKIN_EXPOSURES = ['faceHands', 'faceHandsForearms', 'faceHandsArms', 'armsLegs', 'mostOfBody'] as const satisfies readonly SkinExposure[];

/** Results per search query: enough to choose from, small enough to keep requests cheap. */
const RESULTS_PER_QUERY = 8;
const MAX_QUERIES = 6;
const MAX_BARCODES = 4;
/** USDA searches per call: each is one request, and the shared demo key allows few a day. */
const MAX_USDA_QUERIES = 3;
const USDA_RESULTS_PER_QUERY = 8;
/** Saved products listed per search query. */
const PRODUCTS_PER_QUERY = 4;
/**
 * Sanity limit for one item, not a physiological number: anything above is far more likely a
 * unit slip (ml vs. l, g vs. kg) than a meal, so the model is asked to check it.
 */
export const MAX_ITEM_GRAMS = 3000;
/** The same for one recipe ingredient: a big pot, not a meal (10 kg of potatoes is still a pot). */
export const MAX_INGREDIENT_GRAMS = 10000;
/** Sanity limit for pieces of one food in one meal, not a nutritional number (a bag of sweets is still under it). */
const MAX_PIECES = 200;
/** Sanity limit for a recipe's portions (a party pot), not a physiological number. */
const MAX_PORTIONS = 100;
/** Longest proposed preparation steps: a long recipe, not a transcript of the whole chat. */
const MAX_INSTRUCTIONS_CHARS = 8000;
/** Sanity limits for a proposed meal time: clock skew ahead, about a year back. */
const FUTURE_SLACK_MS = 10 * 60_000;
const MAX_PAST_MS = 400 * 86_400_000;

export const searchInput = z.object({ queries: z.array(z.string()).min(1) });
export const lookupInput = z.object({ barcodes: z.array(z.string()).min(1) });
export const usdaInput = z.object({ queries: z.array(z.string()).min(1), branded: z.boolean() });
export const productsInput = z.object({ queries: z.array(z.string()).min(1) });

export const proposalInput = z.object({
  summary: z.string(),
  items: z
    .array(
      z.object({
        code: z.string(),
        grams: z.number(),
        preparation: z.enum(PREPARATIONS),
        // Missing is fine for tools that are not strict (see STRICT_NESTED in ./prompt.ts).
        note: z.string().default(''),
        /** Products and USDA foods only: BLS code of the most similar food, for what the source lacks. */
        micros_from: z.string().optional(),
        /** Meals only: a count of pieces ("one piece of gum"); the app sets grams from the piece weight when it knows one. 0 or missing: by grams. */
        pieces: z.number().optional(),
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

/** Ingredients for the recipe being edited (the assistant in the recipe editor). */
export const ingredientsProposalInput = z.object({
  /** The dish's name, e.g. "Lentil curry"; empty if unknown. */
  name: z.string(),
  /** Portions the whole recipe makes; 0 if unknown. */
  portions: z.number(),
  /** May be empty when the card only brings the preparation steps. */
  items: z.array(proposalInput.shape.items.element),
  assumptions: z.array(z.string()),
  /** The recipe's preparation steps, complete, in the user's words; empty to leave them as they are. */
  instructions: z.string().optional(),
  /** Id of the open card this proposal replaces (e.g. "R1"); empty for new ingredients. */
  replaces: z.string().optional(),
});

/** A recipe for the recipe book (main chat): one the user cooked, an idea, or a change to one of theirs. */
export const recipeProposalInput = z.object({
  /** "own": a dish the user cooked or told; "idea": the assistant's suggestion (only with recipe ideas on). */
  kind: z.enum(['own', 'idea']),
  name: z.string(),
  portions: z.number(),
  items: z.array(proposalInput.shape.items.element),
  assumptions: z.array(z.string()).default([]),
  /** The complete preparation steps; empty for none (or, for a change, to keep the recipe's). */
  instructions: z.string().optional(),
  /** One line on why it is suggested, quoting the app's numbers; empty for the user's own recipe. */
  reason: z.string().optional(),
  /** Id of the recipe in the book this changes; empty for a new recipe. */
  recipe_id: z.string().optional(),
  /** Id of the open card this proposal replaces (e.g. "R1"); empty for a new one. */
  replaces: z.string().optional(),
});

export const checkRecipeInput = z.object({
  portions: z.number(),
  items: z.array(proposalInput.shape.items.element),
  /** Check a recipe in the book as it is (items empty) instead. */
  recipe_id: z.string().optional(),
});

export const listRecipesInput = z.object({ query: z.string() });

export const journalProposalInput = z.object({
  text: z.string(),
  /** Local "YYYY-MM-DD HH:MM" the entry is about; empty for now (or the chat's day). */
  time: z.string().optional(),
  /** Id of the open journal card this replaces (e.g. "J1"); empty for a new entry. */
  replaces: z.string().optional(),
});

/** A journal entry the assistant proposes (the user's words, for the user to check). */
export interface JournalProposal {
  text: string;
  time?: number;
  replaces?: string;
}

export const sleepProposalInput = z.object({
  /** Local "YYYY-MM-DD HH:MM" the user fell asleep. */
  start: z.string(),
  /** Local "YYYY-MM-DD HH:MM" the user woke up. */
  end: z.string(),
  /** Id of the open sleep card this replaces (e.g. "S1"); empty for a new one. */
  replaces: z.string().optional(),
});

/** A sleep the assistant proposes, for the user to check. */
export interface SleepProposal {
  start: number;
  end: number;
  replaces?: string;
}

export const activityProposalInput = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  /** The user's own word for it ("Football", "Yoga"); empty when the kind says it all. */
  name: z.string().optional(),
  /** Local "YYYY-MM-DD HH:MM" it started. */
  start: z.string(),
  minutes: z.number(),
  intensity: z.union([z.literal(''), z.enum(INTENSITIES)]).optional(),
  outside: z.boolean(),
  /** Skin uncovered outside, when the user said ("in shorts and T-shirt"); empty for the default. */
  skin: z.union([z.literal(''), z.enum(SKIN_EXPOSURES)]).optional(),
  /** Id of the open activity card this replaces (e.g. "A1"); empty for a new one. */
  replaces: z.string().optional(),
});

/** An activity the assistant proposes, for the user to check. */
export interface ActivityProposal {
  kind: ActivityKind;
  name?: string;
  start: number;
  minutes: number;
  intensity?: Intensity;
  outside: boolean;
  skin?: SkinExposure;
  replaces?: string;
}

export const waterProposalInput = z.object({
  ml: z.number(),
  /** Local "YYYY-MM-DD HH:MM" it was drunk (or the middle of the time it was drunk over); empty for now. */
  time: z.string().optional(),
  /** Id of the open water card this replaces (e.g. "W1"); empty for a new one. */
  replaces: z.string().optional(),
});

/** Plain water the assistant proposes, for the user to check. */
export interface WaterProposal {
  ml: number;
  time?: number;
  replaces?: string;
}

export const ketoneProposalInput = z.object({
  type: z.enum(['blood', 'breath', 'urine']),
  value: z.number(),
  /** Local "YYYY-MM-DD HH:MM" it was measured; empty for now. */
  time: z.string().optional(),
  /** Id of the open ketone card this replaces (e.g. "K1"); empty for a new one. */
  replaces: z.string().optional(),
});

/** A ketone measurement the assistant proposes, for the user to check. */
export interface KetoneProposal {
  type: KetoneType;
  value: number;
  time?: number;
  replaces?: string;
}

export const shoppingProposalInput = z.object({
  /** Things to buy, in the user's words, with an amount only when they said one. */
  items: z.array(z.object({ name: z.string(), amount: z.string().optional() })).default([]),
  /** Recipes from the book whose ingredients go on the list, for this many portions (0 = the recipe's own). */
  recipes: z.array(z.object({ recipe_id: z.string(), portions: z.number().optional() })).default([]),
  /** Id of the open shopping card this replaces (e.g. "L1"); empty for a new one. */
  replaces: z.string().optional(),
});

/** Things for the shopping list the assistant proposes, for the user to check. */
export interface ShoppingProposal {
  items: Array<{ name: string; amount?: string }>;
  /** Recipes from the book, by id, with the portions to shop for. */
  recipes: Array<{ recipeId: string; name: string; portions: number }>;
  replaces?: string;
}

export const homeProposalInput = z.object({
  /** Things bought, running low or used up, in the user's words. */
  items: z
    .array(z.object({ name: z.string(), code: z.string().optional(), amount: z.string().optional(), place: z.string().optional(), status: z.string().optional() }))
    .default([]),
  /** Id of the open At home card this replaces (e.g. "H1"); empty for a new one. */
  replaces: z.string().optional(),
});

/** One thing for the At home list, checked: the food it is (when known), its amount and place. */
export interface HomeProposedItem {
  name: string;
  ref?: FoodRef;
  /** A product looked up in the chat, saved when the card is. */
  product?: Product;
  pieces?: number;
  grams?: number;
  amount?: string;
  /** Where it is kept; missing: the app guesses. */
  place?: HomePlace;
  status: 'bought' | 'low' | 'out';
}

/** Things bought, running low or used up that the assistant proposes for At home, for the user to check. */
export interface HomeProposal {
  items: HomeProposedItem[];
  replaces?: string;
}

/** Most things on one card: a week's shopping, not a whole shop. */
const MAX_SHOPPING_ITEMS = 60;

/** Ingredients the assistant proposes for the recipe being edited, for the user to check. */
export interface IngredientsProposal {
  name: string;
  /** Absent when the assistant could not tell. */
  portions?: number;
  items: ProposedItem[];
  assumptions: string[];
  /** The complete preparation steps; absent to leave the recipe's as they are. */
  instructions?: string;
  replaces?: string;
}

/** A recipe the assistant proposes for the recipe book, for the user to check. */
export interface RecipeProposal {
  kind: 'own' | 'idea';
  name: string;
  portions: number;
  items: ProposedItem[];
  assumptions: string[];
  /** The complete steps; absent for none (a change then keeps the recipe's steps). */
  instructions?: string;
  reason?: string;
  /** The recipe in the book this changes. */
  recipeId?: string;
  replaces?: string;
}

/** Longest reason line on an idea: one line, not a paragraph. */
const MAX_REASON_CHARS = 300;

/** Longest proposed journal entry: a few paragraphs, not a transcript of the whole chat. */
const MAX_JOURNAL_CHARS = 4000;

export interface ProposedItem {
  food: Food;
  grams: number;
  preparation: Preparation;
  note: string;
  /** Counted in pieces: how many, and the weight of one (the user's, the label's, or the assistant's estimate). */
  pieces?: { n: number; grams: number; from: 'yours' | 'serving' | 'pack' | 'estimate' };
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

/**
 * Foods from online databases (Open Food Facts lookup or USDA on): what the assistant may use and
 * how it looks them up.
 */
export interface ProductTools {
  /** Products and USDA foods saved on this phone, by id (listed by search_foods without any request). */
  saved: ReadonlyMap<string, Product>;
  /** Look up a barcode: this phone first, then Open Food Facts. Absent when the lookup is off. */
  find?: (barcode: string) => Promise<FindResult>;
  /** Search the bundled list of Open Food Facts products by name (on the phone, no request). Absent when the lookup is off. */
  searchProducts?: (query: string) => Promise<OffListing[]>;
  /** Search USDA FoodData Central by name. Absent when USDA is off. */
  searchUsda?: (query: string, kind: 'generic' | 'branded') => Promise<UsdaFindResult>;
  /**
   * Let the model find a product's barcode by name with Anthropic's web search on openfoodfacts.org
   * (Open Food Facts' own name search cannot be called from a browser). Needs `find`.
   */
  webSearch?: boolean;
  /** Products and USDA foods looked up in this conversation, by id (filled by lookup_barcode and search_usda). */
  seen: Map<string, Product>;
}

export interface ToolContext {
  db: Pick<FoodDb, 'byCode' | 'groups'> & { version?: string };
  index: SearchIndex;
  boost?: (code: string) => number;
  /** Absent when both the Open Food Facts lookup and USDA are off. */
  products?: ProductTools;
  /** Piece weights the user saved, by food code (BLS code or product id). */
  pieces?: ReadonlyMap<string, number>;
  /** Current time, for checking proposed meal times (injected to keep this pure). */
  now?: number;
  /** The journal is on: the assistant may propose journal entries. */
  journal?: boolean;
  /** Sleep is on: the assistant may propose sleeps. */
  sleep?: boolean;
  /** Activity is on: the assistant may propose activities. */
  activity?: boolean;
  /** Water is on: the assistant may propose plain water. */
  water?: boolean;
  /** The ketosis estimate is on: the assistant may propose ketone measurements. */
  ketones?: boolean;
  /** The shopping list is on: the assistant may propose things to put on it. */
  shopping?: boolean;
  /** At home is on: the assistant may propose things bought or running low, and search_foods marks what is at home (by refKey). */
  pantry?: ReadonlySet<string>;
  /**
   * The chat belongs to the recipe editor: the assistant proposes ingredients for the recipe
   * instead of meals, and nothing else (no journal, sleep, activity or water).
   */
  recipe?: boolean;
  /** The main chat's recipe book: save, change and (with recipe ideas on) suggest recipes. Absent in the recipe editor. */
  recipes?: RecipeTools;
}

/** The recipe book as the assistant may read it, and the app's numbers for ideas. */
export interface RecipeTools {
  list: readonly RecipeInfo[];
  /** An ingredient's current name (its food or product). */
  nameOf: (ing: Ingredient) => string;
  /** Recipe ideas on: the app's numbers for ideas and improvements. */
  ideas?: IdeaTools;
}

export interface IdeaTools {
  /** nutrient_gaps' answer: status, foods that fill the gaps, foods eaten often, exclusions, preferences. */
  gaps: () => string;
  /** check_recipe's answer: what one portion gives against the current gaps. */
  check: (items: readonly ProposedItem[], portions: number) => string;
  /** The same for a recipe in the book as it is saved (undefined if there is no such recipe). */
  checkSaved: (recipeId: string) => string | undefined;
  exclusions: Profile['exclusions'];
}

/** Which online sources the assistant is offered (decides the prompt and tool variant). */
export function sourcesOf(ctx: Pick<ToolContext, 'products' | 'journal' | 'sleep' | 'activity' | 'water' | 'ketones' | 'shopping' | 'pantry' | 'recipe' | 'recipes'>): {
  off: boolean;
  usda: boolean;
  webSearch: boolean;
  journal: boolean;
  sleep: boolean;
  activity: boolean;
  water: boolean;
  ketones: boolean;
  shopping: boolean;
  pantry: boolean;
  recipe: boolean;
  recipes: boolean;
  ideas: boolean;
} {
  const { products } = ctx;
  const online = { off: !!products?.find, usda: !!products?.searchUsda, webSearch: !!products?.find && !!products.webSearch };
  if (ctx.recipe) return { ...online, journal: false, sleep: false, activity: false, water: false, ketones: false, shopping: false, pantry: false, recipe: true, recipes: false, ideas: false };
  return {
    ...online,
    journal: !!ctx.journal,
    sleep: !!ctx.sleep,
    activity: !!ctx.activity,
    water: !!ctx.water,
    ketones: !!ctx.ketones,
    shopping: !!ctx.shopping,
    pantry: !!ctx.pantry,
    recipe: false,
    recipes: !!ctx.recipes,
    ideas: !!ctx.recipes?.ideas,
  };
}

const LABEL_FIELDS: Array<[string, string, string]> = [
  ['ENERCC', '', 'kcal'],
  ['PROT625', 'protein ', 'g'],
  ['FAT', 'fat ', 'g'],
  ['CHO', 'carbs ', 'g'],
  ['SUGAR', 'sugars ', 'g'],
];

/** One line per product or USDA food: code, name, brand, sizes, macros and its BLS match if chosen. */
export function describeProduct(p: Product, db: Pick<FoodDb, 'byCode'>): string {
  const sizes = [p.quantity && `pack ${p.quantity}`, p.serving && `serving ${p.serving.label}`].filter(Boolean).join(', ');
  const label = LABEL_FIELDS.filter(([id]) => p.per100[id] !== undefined).map(([id, name, unit]) => `${name}${fmtNumber(p.per100[id]!, 1)} ${unit}`);
  const match = p.match ? db.byCode.get(p.match.code) : undefined;
  const own = hasOwnMicros(p);
  const per = `per 100 ${p.perMl ? 'ml' : 'g'}`;
  return [
    p.id,
    productLabel(p),
    ...(p.source === 'USDA' ? [own ? `USDA ${p.usdaType}, generic food with full nutrient data` : 'USDA branded product (US label)'] : []),
    sizes || 'size unknown',
    label.length ? `${own ? '' : 'label '}${per}: ${label.join(', ')}` : 'no nutrition values on the label data',
    match
      ? `${own ? 'gaps filled' : 'micronutrients'} from ${match.code} ${match.nameEn} (${p.match?.auto ? 'picked by the app, not checked: give micros_from if a closer food fits' : 'chosen by the user'})`
      : p.labelOnly
        ? 'label values only (the user chose no similar food)'
        : own
          ? 'no similar BLS food chosen (optional)'
          : 'no similar BLS food chosen yet',
  ].join(' | ');
}

/**
 * The weight of one piece, as the assistant reads it: the user's own, or the label's. Products
 * without one say so (the assistant then estimates from the pack and says it); BLS foods only
 * when the user saved one.
 */
export function pieceNote(code: string, product: Product | undefined, pieces: ReadonlyMap<string, number> | undefined): string {
  const own = pieces?.get(code);
  if (own) return ` | 1 piece = ${fmtNumber(own, 2)} g (the user's own weight)`;
  const label = product ? labelPiece(product) : undefined;
  if (label) return ` | 1 piece = ${fmtNumber(label.grams, 2)} g (label ${label.from === 'serving' ? 'serving' : 'pack'} "${label.text}")`;
  return product ? ' | weight of one piece unknown' : '';
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
    // What is at home is marked, so the model picks the exact product the user has.
    const home = (key: string) => (ctx.pantry?.has(key) ? ' [at home]' : '');
    const lines = [
      ...products.map((p) => describeProduct(p, ctx.db) + pieceNote(p.id, p, ctx.pieces) + home(p.id)),
      ...hits.map((f) => describeFood(f, ctx.db) + pieceNote(f.code, undefined, ctx.pieces) + home(`BLS:${f.code}`)),
    ];
    return `Results for "${q}":\n${lines.length ? lines.join('\n') : 'No matches. Try a shorter or more generic word, in English or German.'}`;
  });
  return { ok: true, text: blocks.join('\n\n') };
}

/** Run `lookup_barcode`: products found are remembered for propose_meal. */
export async function runLookupBarcode(input: unknown, ctx: ToolContext): Promise<{ ok: boolean; text: string }> {
  const find = ctx.products?.find;
  if (!ctx.products || !find) return { ok: false, text: 'The Open Food Facts lookup is off.' };
  const parsed = lookupInput.safeParse(input);
  if (!parsed.success) return { ok: false, text: 'Invalid input: expected {"barcodes": ["…"]}.' };
  const lines: string[] = [];
  for (const raw of parsed.data.barcodes.slice(0, MAX_BARCODES)) {
    const code = normalizeBarcode(raw);
    if (!code) {
      lines.push(`${raw}: not a valid barcode (check the digits; the last one is a check digit).`);
      continue;
    }
    // A product already looked up in this chat is not fetched again.
    const seen = ctx.products.seen.get(productId(code));
    const r: FindResult = seen ? { kind: 'found', product: seen } : await find(code);
    if (r.kind === 'found') {
      ctx.products.seen.set(r.product.id, r.product);
      lines.push(describeProduct(r.product, ctx.db) + pieceNote(r.product.id, r.product, ctx.pieces));
    } else if (r.kind === 'notFound') lines.push(`${code}: not in Open Food Facts. Use the closest generic BLS food instead.`);
    else lines.push(`${code}: could not be looked up. Error: ${r.detail} Tell the user this error word for word (it helps them trace the problem), then use the closest generic BLS food instead.`);
  }
  return { ok: true, text: lines.join('\n') };
}

/** Products listed per query: enough to hold the sizes and variants of one product line. */
const MAX_PRODUCT_HITS = 8;

/** Run `search_products`: barcodes from the bundled Open Food Facts list, for lookup_barcode. */
export async function runSearchProducts(input: unknown, ctx: ToolContext): Promise<{ ok: boolean; text: string }> {
  const searchProducts = ctx.products?.searchProducts;
  if (!searchProducts) return { ok: false, text: 'The Open Food Facts lookup is off.' };
  const parsed = productsInput.safeParse(input);
  if (!parsed.success) return { ok: false, text: 'Invalid input: expected {"queries": ["…"]}.' };
  let rows: OffListing[][];
  try {
    rows = await Promise.all(parsed.data.queries.slice(0, MAX_QUERIES).map((q) => searchProducts(q)));
  } catch (e) {
    return { ok: false, text: `The product list could not be loaded (${e instanceof Error ? e.message : String(e)}). Use web_search if offered, else the closest generic BLS food.` };
  }
  const blocks = parsed.data.queries.slice(0, MAX_QUERIES).map((q, i) => {
    const hits = rows[i]!.slice(0, MAX_PRODUCT_HITS);
    const lines = hits.map((r) => `${r.code} | ${r.name}${r.brand ? ` (${r.brand})` : ''}${r.quantity ? ` | ${r.quantity}` : ''}`);
    return `Products for "${q}" (barcode | name (brand) | pack size):\n${lines.length ? lines.join('\n') : 'No matches. Try the brand alone, or fewer words.'}`;
  });
  return { ok: true, text: blocks.join('\n\n') };
}

const USDA_ERRORS: Record<Extract<UsdaFindResult, { kind: 'error' }>['reason'], string> = {
  offline: 'no connection',
  busy: 'USDA is busy',
  rateLimit: "the USDA search limit for this phone is used up; the user can add their own free key in the settings",
  badKey: 'the USDA API key in the settings is not valid',
  other: 'USDA gave an unexpected answer',
};

/** Run `search_usda`: foods found are remembered for propose_meal. */
export async function runSearchUsda(input: unknown, ctx: ToolContext): Promise<{ ok: boolean; text: string }> {
  const searchUsda = ctx.products?.searchUsda;
  if (!ctx.products || !searchUsda) return { ok: false, text: 'USDA FoodData Central is off.' };
  const parsed = usdaInput.safeParse(input);
  if (!parsed.success) return { ok: false, text: 'Invalid input: expected {"queries": ["…"], "branded": false}.' };
  const blocks: string[] = [];
  for (const q of parsed.data.queries.slice(0, MAX_USDA_QUERIES)) {
    const r = await searchUsda(q, parsed.data.branded ? 'branded' : 'generic');
    if (r.kind !== 'ok') {
      blocks.push(`Results for "${q}": could not search USDA right now (${USDA_ERRORS[r.reason]}). Use BLS foods instead.`);
      if (r.reason === 'rateLimit' || r.reason === 'badKey' || r.reason === 'offline') break;
      continue;
    }
    const found = r.products.slice(0, USDA_RESULTS_PER_QUERY);
    for (const p of found) ctx.products.seen.set(p.id, p);
    blocks.push(`Results for "${q}":\n${found.length ? found.map((p) => describeProduct(p, ctx.db) + pieceNote(p.id, p, ctx.pieces)).join('\n') : 'No matches. Try other English words.'}`);
  }
  return { ok: true, text: blocks.join('\n\n') };
}

/** Parse a proposed local time and check it is plausible (not in the future, not years back). */
function checkTime(text: string | undefined, now: number | undefined): { time?: number; problem?: string } {
  const timeText = text?.trim() ?? '';
  if (!timeText) return {};
  const time = parseLocalDateTime(timeText);
  if (time === undefined) return { problem: `time "${timeText}" is not a valid local time; write it as YYYY-MM-DD HH:MM, or leave it empty.` };
  if (now !== undefined && time > now + FUTURE_SLACK_MS) return { problem: `time ${timeText} is in the future.` };
  if (now !== undefined && time < now - MAX_PAST_MS) return { problem: `time ${timeText} is more than a year ago; check the year.` };
  return { time };
}

/** Check a `propose_journal_entry` call: some text, of a sane length, at a plausible time. */
export function validateJournalProposal(input: unknown, now?: number): { ok: true; proposal: JournalProposal } | { ok: false; error: string } {
  const parsed = journalProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const problems: string[] = [];
  const text = parsed.data.text.trim();
  if (!text) problems.push('text is empty.');
  if (text.length > MAX_JOURNAL_CHARS) problems.push(`text is ${text.length} characters; keep an entry under ${MAX_JOURNAL_CHARS}, or split it.`);
  const { time, problem } = checkTime(parsed.data.time, now);
  if (problem) problems.push(problem);
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_journal_entry again.` };
  const replaces = parsed.data.replaces?.trim();
  return { ok: true, proposal: { text, ...(time !== undefined ? { time } : {}), ...(replaces ? { replaces } : {}) } };
}

/** Check a `propose_sleep` call: both times valid and plausible, waking after falling asleep, not too long. */
export function validateSleepProposal(input: unknown, now?: number): { ok: true; proposal: SleepProposal } | { ok: false; error: string } {
  const parsed = sleepProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const problems: string[] = [];
  const start = checkTime(parsed.data.start, now);
  const end = checkTime(parsed.data.end, now);
  if (start.problem) problems.push(`start: ${start.problem}`);
  else if (start.time === undefined) problems.push('start is empty; give the time the user fell asleep.');
  if (end.problem) problems.push(`end: ${end.problem}`);
  else if (end.time === undefined) problems.push('end is empty; give the time the user woke up.');
  if (start.time !== undefined && end.time !== undefined) {
    if (end.time <= start.time) problems.push('end must be after start (a night runs from the evening to the next morning; check the dates).');
    else if (end.time - start.time > MAX_SLEEP_MS) problems.push(`the sleep is ${Math.round((end.time - start.time) / 3_600_000)} hours long; check the dates.`);
  }
  if (problems.length || start.time === undefined || end.time === undefined) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_sleep again.` };
  const replaces = parsed.data.replaces?.trim();
  return { ok: true, proposal: { start: start.time, end: end.time, ...(replaces ? { replaces } : {}) } };
}

/** Check a `propose_activity` call: a plausible start time and a length within one waking day. */
export function validateActivityProposal(input: unknown, now?: number): { ok: true; proposal: ActivityProposal } | { ok: false; error: string } {
  const parsed = activityProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const problems: string[] = [];
  const { kind, minutes, intensity, outside, skin } = parsed.data;
  const start = checkTime(parsed.data.start, now);
  if (start.problem) problems.push(`start: ${start.problem}`);
  else if (start.time === undefined) problems.push('start is empty; give the time it started (estimate from what the user said).');
  if (!(minutes > 0)) problems.push('minutes must be more than 0.');
  else if (minutes > MAX_ACTIVITY_MINUTES) problems.push(`minutes is ${minutes}, more than ${MAX_ACTIVITY_MINUTES / 60} hours; check the number.`);
  if (problems.length || start.time === undefined) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_activity again.` };
  const name = parsed.data.name?.trim();
  const replaces = parsed.data.replaces?.trim();
  return {
    ok: true,
    proposal: {
      kind,
      ...(name ? { name } : {}),
      start: start.time,
      minutes: Math.round(minutes),
      ...(intensity ? { intensity } : {}),
      outside,
      ...(outside && skin ? { skin } : {}),
      ...(replaces ? { replaces } : {}),
    },
  };
}

/** Check a `propose_water` call: a plausible amount at a plausible time. */
export function validateWaterProposal(input: unknown, now?: number): { ok: true; proposal: WaterProposal } | { ok: false; error: string } {
  const parsed = waterProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const problems: string[] = [];
  const { ml } = parsed.data;
  if (!(ml > 0)) problems.push('ml must be more than 0.');
  else if (ml > MAX_WATER_ML) problems.push(`ml is ${ml}, more than ${MAX_WATER_ML} in one card; split it over the day (one card per part of the day).`);
  const { time, problem } = checkTime(parsed.data.time, now);
  if (problem) problems.push(problem);
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_water again.` };
  const replaces = parsed.data.replaces?.trim();
  return { ok: true, proposal: { ml: Math.round(ml), ...(time !== undefined ? { time } : {}), ...(replaces ? { replaces } : {}) } };
}

/** Input check against unit mix-ups (e.g. mg/dL for mmol/L), not physiology: values above these are sent back to the assistant to check. */
const MAX_KETONE: Record<KetoneType, number> = { blood: 10, breath: 500, urine: 16 };

/** Check a `propose_ketone` call: a value in the method's own unit, at a plausible time. */
export function validateKetoneProposal(input: unknown, now?: number): { ok: true; proposal: KetoneProposal } | { ok: false; error: string } {
  const parsed = ketoneProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const problems: string[] = [];
  const { type, value } = parsed.data;
  if (!(value >= 0)) problems.push('value must be 0 or more.');
  else if (value > MAX_KETONE[type]) problems.push(`value ${value} is not a plausible ${type} reading (more than ${MAX_KETONE[type]}); check the unit: blood in mmol/L, breath in ppm, urine in mmol/L as the strip reads.`);
  const { time, problem } = checkTime(parsed.data.time, now);
  if (problem) problems.push(problem);
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_ketone again.` };
  const replaces = parsed.data.replaces?.trim();
  return { ok: true, proposal: { type, value, ...(time !== undefined ? { time } : {}), ...(replaces ? { replaces } : {}) } };
}

/** Check a `propose_shopping` call: something to buy, and recipes that are in the book. */
export function validateShoppingProposal(input: unknown, recipes: readonly Pick<RecipeInfo, 'id' | 'name' | 'portions'>[] = []): { ok: true; proposal: ShoppingProposal } | { ok: false; error: string } {
  const parsed = shoppingProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const problems: string[] = [];
  const items = parsed.data.items.map((i) => ({ name: i.name.trim(), amount: i.amount?.trim() })).filter((i) => i.name);
  const chosen: ShoppingProposal['recipes'] = [];
  for (const r of parsed.data.recipes) {
    const recipe = recipes.find((x) => x.id === r.recipe_id.trim());
    if (!recipe) {
      problems.push(`recipe_id "${r.recipe_id}" is not in the recipe book; use a recipe_id from list_recipes.`);
      continue;
    }
    const portions = r.portions && r.portions > 0 ? Math.round(r.portions) : recipe.portions;
    if (portions > 100) problems.push(`${recipe.name}: ${portions} portions is more than 100; check the number.`);
    chosen.push({ recipeId: recipe.id, name: recipe.name, portions });
  }
  if (items.length === 0 && parsed.data.recipes.length === 0) problems.push('Nothing to put on the list: give items or recipes.');
  if (items.length > MAX_SHOPPING_ITEMS) problems.push(`${items.length} items is more than ${MAX_SHOPPING_ITEMS} on one card; split them over two cards.`);
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_shopping again.` };
  const replaces = parsed.data.replaces?.trim();
  return { ok: true, proposal: { items: items.map((i) => ({ name: i.name, ...(i.amount ? { amount: i.amount } : {}) })), recipes: chosen, ...(replaces ? { replaces } : {}) } };
}

const HOME_STATUS: Record<string, HomeProposedItem['status']> = { '': 'bought', bought: 'bought', low: 'low', used_up: 'out' };

/** Check a `propose_home` call: names, known codes, places and statuses. */
export function validateHomeProposal(input: unknown, db: Pick<FoodDb, 'byCode'> & { version?: string }, products?: ProductTools): { ok: true; proposal: HomeProposal } | { ok: false; error: string } {
  const parsed = homeProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const problems: string[] = [];
  const items: HomeProposedItem[] = [];
  for (const it of parsed.data.items) {
    const name = it.name.trim();
    if (!name) continue;
    const item: HomeProposedItem = { name, status: 'bought' };
    const code = it.code?.trim() ?? '';
    if (code && isProductCode(code)) {
      const product = knownProduct(code, products);
      if (!product) problems.push(`${name}: unknown product ${code}; use only codes returned by lookup_barcode, search_usda or search_foods.`);
      else {
        item.ref = productRef(product);
        if (!products?.saved.has(code)) item.product = product;
      }
    } else if (code) {
      if (!db.byCode.has(code)) problems.push(`${name}: unknown code ${code}; use only codes returned by search_foods, or none.`);
      else item.ref = { source: 'BLS', version: db.version ?? '4.0', code };
    }
    Object.assign(item, stockAmount(it.amount ?? ''));
    const place = it.place?.trim() ?? '';
    if (place) {
      if ((HOME_PLACES as readonly string[]).includes(place)) item.place = place as HomePlace;
      else problems.push(`${name}: place "${place}" is not one of ${HOME_PLACES.join(', ')}; leave it empty to let the app choose.`);
    }
    const status = HOME_STATUS[it.status?.trim() ?? ''];
    if (status) item.status = status;
    else problems.push(`${name}: status "${it.status}" is not bought, low or used_up.`);
    items.push(item);
  }
  if (items.length === 0) problems.push('Nothing to save: give items.');
  if (items.length > MAX_SHOPPING_ITEMS) problems.push(`${items.length} items is more than ${MAX_SHOPPING_ITEMS} on one card; split them over two cards.`);
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_home again.` };
  const replaces = parsed.data.replaces?.trim();
  return { ok: true, proposal: { items, ...(replaces ? { replaces } : {}) } };
}

/** A product the assistant may use: looked up in this conversation or saved on this phone. */
function knownProduct(code: string, products: ProductTools | undefined): Product | undefined {
  return products?.seen.get(code) ?? products?.saved.get(code);
}

/**
 * Check proposed items: every code must be a BLS food (or a product looked up or saved), every
 * amount plausible. A product needs a similar BLS food for its micronutrients unless the user
 * already chose one, which always wins.
 */
function validateItems(
  input: ProposalInput['items'],
  db: Pick<FoodDb, 'byCode'> & { version?: string },
  products: ProductTools | undefined,
  maxGrams: number,
  pieceWeights?: ReadonlyMap<string, number>,
): { items: ProposedItem[]; problems: string[] } {
  const problems: string[] = [];
  const items: ProposedItem[] = [];
  for (const it of input) {
    const code = it.code.trim();
    let food: Food | undefined;
    let product: Product | undefined;
    if (isProductCode(code)) {
      const found = knownProduct(code, products);
      const microsFrom = it.micros_from?.trim() ?? '';
      const match = microsFrom ? db.byCode.get(microsFrom) : undefined;
      if (!found) problems.push(`Unknown product ${code}: use only codes returned by lookup_barcode, search_usda or search_foods.`);
      // The user's own choice (a food, or "label values only") always wins.
      else if ((found.match && !found.match.auto) || found.labelOnly) product = found;
      // The assistant's food replaces the app's own pick.
      else if (match) product = { ...found, match: { version: db.version ?? '4.0', code: match.code } };
      else if (microsFrom) problems.push(`${code}: micros_from must be the BLS code (from search_foods) of the most similar generic food; ${microsFrom} is not one.`);
      // USDA generic foods have their own vitamins and minerals; a similar BLS food only fills gaps.
      else if (found.match || hasOwnMicros(found)) product = found;
      else problems.push(`${code}: micros_from must be the BLS code (from search_foods) of the most similar generic food.`);
      if (product) food = productFood(product, db);
    } else {
      food = db.byCode.get(code);
      if (!food) problems.push(`Unknown code ${it.code}: use only codes returned by search_foods.`);
    }
    // Pieces: the app's weight of one (the user's, else the label's) sets the grams; without one, the
    // assistant's grams stand as its estimate.
    const n = it.pieces && it.pieces > 0 ? it.pieces : 0;
    if (n > MAX_PIECES) problems.push(`${it.code}: ${n} pieces is not plausible (at most ${MAX_PIECES}); give grams instead.`);
    const own = n && food ? pieceWeights?.get(food.code) : undefined;
    const label = n && !own && product ? labelPiece(product) : undefined;
    const known = own ?? label?.grams;
    const from = own ? 'yours' : (label?.from ?? 'estimate');
    const grams = known ? piecesToGrams(n, known) : it.grams;
    if (!(grams > 0) || grams > maxGrams) problems.push(`${it.code}: ${grams} g is not plausible (expected more than 0 and at most ${maxGrams} g).`);
    else if (food && n <= MAX_PIECES)
      items.push({
        food,
        grams: Math.round(grams * 10) / 10,
        preparation: it.preparation,
        note: it.note.trim(),
        ...(product ? { product } : {}),
        ...(n ? { pieces: { n, grams: known ?? Math.round((grams / n) * 100) / 100, from } } : {}),
      });
  }
  return { items, problems };
}

/** Check a `propose_meal` call: known codes, plausible grams (see validateItems) and a plausible time. */
export function validateProposal(
  input: unknown,
  db: Pick<FoodDb, 'byCode'> & { version?: string },
  products?: ProductTools,
  now?: number,
  pieces?: ReadonlyMap<string, number>,
): { ok: true; proposal: Proposal } | { ok: false; error: string } {
  const parsed = proposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const { items, problems } = validateItems(parsed.data.items, db, products, MAX_ITEM_GRAMS, pieces);
  const { time, problem } = checkTime(parsed.data.time, now);
  if (problem) problems.push(problem);
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

/**
 * Check a `propose_ingredients` call (the recipe editor's assistant): the same checks as a meal,
 * with room for a whole pot, and a whole number of portions if any.
 */
export function validateIngredientsProposal(
  input: unknown,
  db: Pick<FoodDb, 'byCode'> & { version?: string },
  products?: ProductTools,
): { ok: true; proposal: IngredientsProposal } | { ok: false; error: string } {
  const parsed = ingredientsProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const { items, problems } = validateItems(parsed.data.items, db, products, MAX_INGREDIENT_GRAMS);
  const { portions } = parsed.data;
  if (portions < 0 || portions > MAX_PORTIONS || !Number.isInteger(portions)) problems.push(`portions ${portions} is not plausible (a whole number up to ${MAX_PORTIONS}, or 0 if unknown).`);
  const instructions = parsed.data.instructions?.trim() ?? '';
  if (instructions.length > MAX_INSTRUCTIONS_CHARS) problems.push(`instructions are ${instructions.length} characters; keep them under ${MAX_INSTRUCTIONS_CHARS}.`);
  if (parsed.data.items.length === 0 && !instructions) problems.push('items is empty: propose at least one ingredient, or the preparation steps.');
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_ingredients again.` };
  const replaces = parsed.data.replaces?.trim();
  return {
    ok: true,
    proposal: {
      name: parsed.data.name.trim(),
      ...(portions > 0 ? { portions } : {}),
      items,
      assumptions: parsed.data.assumptions.map((a) => a.trim()).filter(Boolean),
      ...(instructions ? { instructions } : {}),
      ...(replaces ? { replaces } : {}),
    },
  };
}

/** An ingredient's code as the assistant writes it: a BLS code, or OFF:… / USDA:… for a product. */
export function ingredientCode(ing: Ingredient): string {
  return ing.ref.source === 'BLS' ? ing.ref.code : refKey(ing.ref);
}

/** Run `list_recipes`: the user's recipes whose name has all the query's words (all for an empty query). */
export function runListRecipes(input: unknown, ctx: ToolContext): { ok: boolean; text: string } {
  const recipes = ctx.recipes;
  if (!recipes) return { ok: false, text: 'The recipe book is not available here.' };
  const parsed = listRecipesInput.safeParse(input);
  if (!parsed.success) return { ok: false, text: 'Invalid input: expected {"query": "…"} (empty for all recipes).' };
  const words = normalize(parsed.data.query).split(' ').filter(Boolean);
  const hits = recipes.list.filter((r) => words.every((w) => normalize(r.name).includes(w)));
  if (recipes.list.length === 0) return { ok: true, text: 'The recipe book is empty.' };
  if (hits.length === 0) return { ok: true, text: `No recipe matches "${parsed.data.query}". The book has: ${recipes.list.map((r) => r.name).join('; ')}.` };
  const blocks = hits.map((r) => {
    const head = [
      `recipe_id ${r.id}`,
      r.name,
      `${r.portions} portions`,
      `cooked ${r.cookedLately}× in the last 60 days`,
      r.inStock ? `${r.inStock} portions in stock` : 'none in stock',
    ].join(' | ');
    const line = (i: Ingredient) => `${ingredientCode(i)} ${recipes.nameOf(i)} ${Math.round(i.grams * 10) / 10} g, ${i.preparation}`;
    const ings = r.ingredients.map(line);
    const stock = r.stock.map((b) => {
      const where = (['fresh', 'fridge', 'freezer'] as const).filter((k) => b.left[k] > 0).map((k) => `${b.left[k]} ${k === 'fresh' ? 'fresh (not yet stored)' : `in the ${k}`}`);
      const weight = b.cookedGrams ? `cooked food ${b.cookedGrams} g, about ${Math.round(b.cookedGrams / b.portions)} g a portion` : 'not weighed';
      return `- batch_id ${b.id} | cooked ${b.cookedDay} | ${b.portions} portions | ${where.join(', ')} | ${weight}${b.changed ? `\n  This pot was made differently: ${b.ingredients.map(line).join('; ')}` : ''}`;
    });
    return [
      head,
      `Ingredients (whole pot): ${ings.length ? ings.join('; ') : 'none'}`,
      r.instructions ? `Steps:\n${r.instructions}` : 'Steps: none',
      ...(r.potGrams ? [`Empty pot (remembered): ${r.potGrams} g`] : []),
      ...(stock.length ? [`In stock:\n${stock.join('\n')}`] : []),
    ].join('\n');
  });
  return { ok: true, text: blocks.join('\n\n') };
}

/** Run `nutrient_gaps` (recipe ideas on). */
export function runNutrientGaps(ctx: ToolContext): { ok: boolean; text: string } {
  const ideas = ctx.recipes?.ideas;
  if (!ideas) return { ok: false, text: 'Recipe ideas are turned off.' };
  return { ok: true, text: ideas.gaps() };
}

/** Run `check_recipe` (recipe ideas on): the app's numbers for one portion of the given (or a saved) recipe. */
export function runCheckRecipe(input: unknown, ctx: ToolContext): { ok: boolean; text: string } {
  const ideas = ctx.recipes?.ideas;
  if (!ideas || !ctx.recipes) return { ok: false, text: 'Recipe ideas are turned off.' };
  const parsed = checkRecipeInput.safeParse(input);
  if (!parsed.success) return { ok: false, text: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const id = parsed.data.recipe_id?.trim();
  if (id && parsed.data.items.length === 0) {
    const r = ctx.recipes.list.find((x) => x.id === id);
    const text = r && ideas.checkSaved(id);
    if (!r || !text) return { ok: false, text: `Unknown recipe_id ${id}: use an id from list_recipes.` };
    return { ok: true, text: `${r.name} as saved:\n${text}` };
  }
  const { items, problems } = validateItems(parsed.data.items, ctx.db, ctx.products, MAX_INGREDIENT_GRAMS);
  const { portions } = parsed.data;
  if (!Number.isInteger(portions) || portions < 1 || portions > MAX_PORTIONS) problems.push(`portions ${portions} is not plausible (a whole number from 1 to ${MAX_PORTIONS}).`);
  if (items.length === 0 && problems.length === 0) problems.push('items is empty.');
  if (problems.length) return { ok: false, text: `${problems.join('\n')}\nFix these and call check_recipe again.` };
  return { ok: true, text: ideas.check(items, portions) };
}

/**
 * Check a `propose_recipe` call: known codes and plausible grams for a whole pot, a name, whole
 * portions, a known recipe for a change; an idea needs recipe ideas on, a reason line and no
 * excluded food (the hard filter: the preferences text is only guidance).
 */
export function validateRecipeProposal(input: unknown, ctx: ToolContext): { ok: true; proposal: RecipeProposal } | { ok: false; error: string } {
  const parsed = recipeProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const p = parsed.data;
  const { items, problems } = validateItems(p.items, ctx.db, ctx.products, MAX_INGREDIENT_GRAMS);
  if (p.items.length === 0) problems.push('items is empty: a recipe needs its ingredients.');
  const name = p.name.trim();
  if (!name) problems.push('name is empty.');
  if (!Number.isInteger(p.portions) || p.portions < 1 || p.portions > MAX_PORTIONS) problems.push(`portions ${p.portions} is not plausible (a whole number from 1 to ${MAX_PORTIONS}; estimate it from the pot if the user did not say, and say so in assumptions).`);
  const instructions = p.instructions?.trim() ?? '';
  if (instructions.length > MAX_INSTRUCTIONS_CHARS) problems.push(`instructions are ${instructions.length} characters; keep them under ${MAX_INSTRUCTIONS_CHARS}.`);
  const reason = p.reason?.trim() ?? '';
  if (reason.length > MAX_REASON_CHARS) problems.push(`reason is ${reason.length} characters; keep it to one line under ${MAX_REASON_CHARS}.`);
  const recipeId = p.recipe_id?.trim() ?? '';
  if (recipeId && !ctx.recipes?.list.some((r) => r.id === recipeId)) problems.push(`Unknown recipe_id ${recipeId}: use an id from list_recipes, or leave it empty for a new recipe.`);
  if (p.kind === 'idea') {
    const ideas = ctx.recipes?.ideas;
    if (!ideas) problems.push('kind "idea" needs recipe ideas, which are turned off; use kind "own" for the user\'s own recipe.');
    else {
      if (!reason) problems.push('reason is empty: an idea needs one line on why, quoting numbers from check_recipe.');
      const excluded = excludedFoods(
        items.map((i) => i.food),
        ideas.exclusions,
      );
      if (excluded.length) problems.push(`The user excluded these foods: ${excluded.join(', ')}. Ideas must not contain them; replace them.`);
    }
  }
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_recipe again.` };
  const replaces = p.replaces?.trim();
  return {
    ok: true,
    proposal: {
      kind: p.kind,
      name,
      portions: p.portions,
      items,
      assumptions: p.assumptions.map((a) => a.trim()).filter(Boolean),
      ...(instructions ? { instructions } : {}),
      ...(reason ? { reason } : {}),
      ...(recipeId ? { recipeId } : {}),
      ...(replaces ? { replaces } : {}),
    },
  };
}

// ── Batch cooking (docs/SPEC.md, "Cooked weight per batch", "Changing a dish when logging it") ──

/** One change to a pot or a serving: re-weigh, swap or take out an ingredient it has, or add one. */
const changeInput = z.object({
  /** Code of the ingredient this replaces, re-weighs or takes out; empty for an added food. */
  replaces: z.string(),
  /** The food now; empty to take `replaces` out. */
  code: z.string(),
  grams: z.number(),
  preparation: z.enum(PREPARATIONS),
  micros_from: z.string().optional(),
});

export const portionProposalInput = z.object({
  batch_id: z.string(),
  /** Portions eaten; 0 when eaten by grams. */
  portions: z.number().default(0),
  /** Grams eaten of a weighed pot; 0 when eaten by portions. */
  grams: z.number().default(0),
  changes: z.array(changeInput).default([]),
  assumptions: z.array(z.string()).default([]),
  time: z.string().optional(),
  replaces: z.string().optional(),
});

export const batchProposalInput = z.object({
  recipe_id: z.string(),
  /** A batch already cooked (in stock) whose pot this changes; empty to cook a new batch. */
  batch_id: z.string().default(''),
  /** Portions this pot made when not the recipe's number; 0 for the recipe's (or the batch's). */
  portions: z.number().default(0),
  /** Local "YYYY-MM-DD" it was cooked; empty for today (or the chat's day). */
  day: z.string().default(''),
  /** Use the recipe's usual storage plan (then fresh and fridge are ignored). */
  usual_plan: z.boolean(),
  fresh: z.number(),
  fridge: z.number(),
  /** The full pot's weight as the user said it (the app takes off the empty pot it remembers); 0 if not said. */
  pot_grams: z.number().default(0),
  /** The cooked food's own weight, when weighed without the pot; 0 if not said. */
  food_grams: z.number().default(0),
  changes: z.array(changeInput).default([]),
  /** Portions of this pot eaten right away (fresh); 0 for none. */
  ate_portions: z.number().default(0),
  /** Or grams of this pot eaten right away (needs its weight); 0 for none. */
  ate_grams: z.number().default(0),
  ate_time: z.string().optional(),
  assumptions: z.array(z.string()).default([]),
  replaces: z.string().optional(),
});

/** A proposed change: `replaces` is the refKey of the ingredient it changes (absent for an added food); `item` absent takes it out. */
export interface ProposedChange {
  replaces?: string;
  item?: ProposedItem;
}

/** Eating from a batch in stock, as the assistant proposes it. */
export interface PortionProposal {
  batchId: string;
  /** The dish's name, for the card's title. */
  name: string;
  /** Portions eaten; with `grams`, the app works out what it takes from stock. */
  portions: number;
  grams?: number;
  /** For this serving only; amounts are for what was eaten. */
  changes: ProposedChange[];
  assumptions: string[];
  time?: number;
  replaces?: string;
}

/** Cooking a batch of a recipe in the book, as the assistant proposes it. */
export interface BatchProposal {
  recipeId: string;
  /** A batch already cooked whose pot this changes (weight, portions, ingredients); absent to cook a new one. */
  batchId?: string;
  /** Portions this pot made, when not the recipe's (or, for a cooked batch, its current) number. */
  portions?: number;
  /** The recipe's name, for the card's title. */
  name: string;
  /** Local day it was cooked; absent for the chat's day. */
  day?: string;
  /** Absent for the recipe's usual plan. */
  plan?: { fresh: number; fridge: number };
  /** The full pot as weighed (the empty pot comes off in the app). */
  potGrams?: number;
  /** The cooked food weighed on its own. */
  foodGrams?: number;
  /** For this pot; amounts for the whole pot, against the recipe (or a cooked batch's pot). */
  changes: ProposedChange[];
  /** Some of it eaten right away. */
  ate?: { portions: number; grams?: number; time?: number };
  assumptions: string[];
  replaces?: string;
}

/** Sanity limit for portions in one serving, not a physiological number. */
const MAX_SERVING_PORTIONS = 10;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Check changes against the ingredients they change: known foods, plausible amounts, an ingredient that is there. */
function validateChanges(input: z.infer<typeof changeInput>[], base: readonly Ingredient[], ctx: ToolContext, maxGrams: number, what: string): { changes: ProposedChange[]; problems: string[] } {
  const problems: string[] = [];
  const changes: ProposedChange[] = [];
  const codes = new Map(base.map((i) => [ingredientCode(i), refKey(i.ref)] as const));
  for (const c of input) {
    const replaces = c.replaces.trim();
    const code = c.code.trim();
    if (replaces && !codes.has(replaces)) {
      problems.push(`changes: ${replaces} is not an ingredient of ${what}; replaces must be one of: ${[...codes.keys()].join(', ')} (or empty for an added food).`);
      continue;
    }
    if (!code) {
      if (!replaces) problems.push('changes: a change needs a code, or replaces to take an ingredient out.');
      else changes.push({ replaces: codes.get(replaces)! });
      continue;
    }
    const { items, problems: p } = validateItems([{ code, grams: c.grams, preparation: c.preparation, note: '', micros_from: c.micros_from }], ctx.db, ctx.products, maxGrams);
    problems.push(...p.map((x) => `changes: ${x}`));
    if (items[0]) changes.push({ ...(replaces ? { replaces: codes.get(replaces)! } : {}), item: items[0] });
  }
  return { changes, problems };
}

function stockBatch(ctx: ToolContext, batchId: string) {
  for (const r of ctx.recipes?.list ?? []) {
    const b = r.stock.find((s) => s.id === batchId);
    if (b) return { recipe: r, batch: b };
  }
  return undefined;
}

/**
 * Check a `propose_portion` call: a batch in stock, portions or grams (grams only for a weighed
 * pot) within what is left, changes to ingredients the pot has, and a plausible time.
 */
export function validatePortionProposal(input: unknown, ctx: ToolContext): { ok: true; proposal: PortionProposal } | { ok: false; error: string } {
  const parsed = portionProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const p = parsed.data;
  const found = stockBatch(ctx, p.batch_id.trim());
  if (!found) return { ok: false, error: `Unknown batch_id ${p.batch_id}: use a batch_id from list_recipes (batches in stock). For a dish not in stock, use propose_meal.\nFix this and call propose_portion again.` };
  const { batch } = found;
  const left = batch.left.fresh + batch.left.fridge + batch.left.freezer;
  const problems: string[] = [];
  const byGrams = p.grams > 0;
  if (byGrams) {
    if (!batch.cookedGrams) problems.push('grams: this pot was not weighed, so give portions instead (and grams 0).');
    else if (p.grams > batch.cookedGrams) problems.push(`grams ${p.grams} is more than the whole pot (${batch.cookedGrams} g).`);
  } else if (!(p.portions > 0) || p.portions > MAX_SERVING_PORTIONS) problems.push(`portions ${p.portions} is not plausible (more than 0, at most ${MAX_SERVING_PORTIONS}; or give grams).`);
  else if (p.portions > left) problems.push(`portions ${p.portions}: only ${left} left in stock of this batch.`);
  if (p.grams < 0) problems.push('grams must not be negative.');
  const { changes, problems: cp } = validateChanges(p.changes, batch.ingredients, ctx, MAX_ITEM_GRAMS, 'this pot');
  problems.push(...cp);
  const { time, problem } = checkTime(p.time, ctx.now);
  if (problem) problems.push(problem);
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_portion again.` };
  const replaces = p.replaces?.trim();
  return {
    ok: true,
    proposal: {
      batchId: batch.id,
      name: found.recipe.name,
      portions: byGrams ? 0 : p.portions,
      ...(byGrams ? { grams: Math.round(p.grams) } : {}),
      changes,
      assumptions: p.assumptions.map((a) => a.trim()).filter(Boolean),
      ...(time !== undefined ? { time } : {}),
      ...(replaces ? { replaces } : {}),
    },
  };
}

const potPortionsOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_POT_PORTIONS;

/**
 * Check a `propose_batch` call for a pot already cooked (batch_id): a batch in stock, its weight,
 * portions and changes against what that pot has now. Day, plan and what was eaten belong to
 * cooking (and propose_portion), so they must not be given.
 */
function validatePotChange(p: z.infer<typeof batchProposalInput>, batchId: string, ctx: ToolContext): { ok: true; proposal: BatchProposal } | { ok: false; error: string } {
  const found = stockBatch(ctx, batchId);
  if (!found) return { ok: false, error: `Unknown batch_id ${batchId}: use a batch_id from list_recipes (batches in stock), or leave it empty to cook a new batch.\nFix this and call propose_batch again.` };
  const { recipe, batch } = found;
  const problems: string[] = [];
  if (p.portions !== 0 && !potPortionsOk(p.portions)) problems.push(`portions ${p.portions} must be a whole number from 1 to ${MAX_POT_PORTIONS} (0 to keep ${batch.portions}).`);
  if (p.pot_grams < 0 || p.food_grams < 0) problems.push('pot_grams and food_grams must not be negative.');
  if (p.pot_grams > 0 && p.food_grams > 0) problems.push('give pot_grams (full pot) or food_grams (food weighed alone), not both.');
  for (const g of [p.pot_grams, p.food_grams]) if (g > MAX_POT_GRAMS) problems.push(`${g} g is more than ${MAX_POT_GRAMS} g for one pot; check the unit (kg or g).`);
  if (p.ate_portions > 0 || p.ate_grams > 0) problems.push('ate_portions and ate_grams are for a new batch; for eating from this pot, call propose_portion with its batch_id.');
  const { changes, problems: cp } = validateChanges(p.changes, batch.ingredients, ctx, MAX_INGREDIENT_GRAMS, 'this pot');
  problems.push(...cp);
  if (changes.length === 0 && p.pot_grams <= 0 && p.food_grams <= 0 && (p.portions === 0 || p.portions === batch.portions)) problems.push('Nothing to change: give changes, portions, pot_grams or food_grams.');
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_batch again.` };
  const replaces = p.replaces?.trim();
  return {
    ok: true,
    proposal: {
      recipeId: recipe.id,
      batchId: batch.id,
      name: recipe.name,
      ...(p.portions > 0 && p.portions !== batch.portions ? { portions: p.portions } : {}),
      ...(p.pot_grams > 0 ? { potGrams: Math.round(p.pot_grams) } : {}),
      ...(p.food_grams > 0 ? { foodGrams: Math.round(p.food_grams) } : {}),
      changes,
      assumptions: p.assumptions.map((a) => a.trim()).filter(Boolean),
      ...(replaces ? { replaces } : {}),
    },
  };
}

/**
 * Check a `propose_batch` call: a recipe in the book, a plausible day, storage plan, pot weight and
 * changes to the recipe's ingredients, and what was eaten right away.
 */
export function validateBatchProposal(input: unknown, ctx: ToolContext): { ok: true; proposal: BatchProposal } | { ok: false; error: string } {
  const parsed = batchProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const p = parsed.data;
  const batchId = p.batch_id.trim();
  if (batchId) return validatePotChange(p, batchId, ctx);
  const recipe = ctx.recipes?.list.find((r) => r.id === p.recipe_id.trim());
  if (!recipe) return { ok: false, error: `Unknown recipe_id ${p.recipe_id}: use an id from list_recipes. A dish not in the book is saved with propose_recipe first.\nFix this and call propose_batch again.` };
  const problems: string[] = [];
  const portions = p.portions > 0 ? p.portions : recipe.portions;
  if (p.portions !== 0 && !potPortionsOk(p.portions)) problems.push(`portions ${p.portions} must be a whole number from 1 to ${MAX_POT_PORTIONS} (0 for the recipe's ${recipe.portions}).`);
  const day = p.day.trim();
  if (day) {
    const t = DAY_RE.test(day) ? parseLocalDateTime(`${day} 12:00`) : undefined;
    if (t === undefined) problems.push(`day "${day}" is not a valid date; write it as YYYY-MM-DD, or leave it empty.`);
    else if (ctx.now !== undefined && t > ctx.now + 86_400_000) problems.push(`day ${day} is in the future.`);
    else if (ctx.now !== undefined && t < ctx.now - MAX_PAST_MS) problems.push(`day ${day} is more than a year ago; check the year.`);
  }
  if (!p.usual_plan) {
    for (const [k, v] of [['fresh', p.fresh], ['fridge', p.fridge]] as const) if (!Number.isInteger(v) || v < 0) problems.push(`${k} ${v} must be a whole number, 0 or more.`);
    if (p.fresh + p.fridge > portions) problems.push(`fresh + fridge is ${p.fresh + p.fridge}, more than the ${portions} portions this pot makes.`);
  }
  if (p.pot_grams < 0 || p.food_grams < 0) problems.push('pot_grams and food_grams must not be negative.');
  if (p.pot_grams > 0 && p.food_grams > 0) problems.push('give pot_grams (full pot) or food_grams (food weighed alone), not both.');
  for (const g of [p.pot_grams, p.food_grams]) if (g > MAX_POT_GRAMS) problems.push(`${g} g is more than ${MAX_POT_GRAMS} g for one pot; check the unit (kg or g).`);
  const { changes, problems: cp } = validateChanges(p.changes, recipe.ingredients, ctx, MAX_INGREDIENT_GRAMS, 'the recipe');
  problems.push(...cp);
  if (p.ate_portions < 0 || p.ate_portions > portions) problems.push(`ate_portions ${p.ate_portions} is not plausible (0 to ${portions}).`);
  if (p.ate_grams < 0) problems.push('ate_grams must not be negative.');
  if (p.ate_grams > 0 && !(p.pot_grams > 0 || p.food_grams > 0)) problems.push('ate_grams needs the pot weighed (pot_grams or food_grams); give ate_portions instead.');
  const ateTime = checkTime(p.ate_time, ctx.now);
  if (ateTime.problem) problems.push(`ate_time: ${ateTime.problem}`);
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_batch again.` };
  const ate = p.ate_grams > 0 ? { portions: 0, grams: Math.round(p.ate_grams) } : p.ate_portions > 0 ? { portions: p.ate_portions } : undefined;
  const replaces = p.replaces?.trim();
  return {
    ok: true,
    proposal: {
      recipeId: recipe.id,
      name: recipe.name,
      ...(day ? { day } : {}),
      ...(p.portions > 0 && p.portions !== recipe.portions ? { portions: p.portions } : {}),
      ...(p.usual_plan ? {} : { plan: { fresh: p.fresh, fridge: p.fridge } }),
      ...(p.pot_grams > 0 ? { potGrams: Math.round(p.pot_grams) } : {}),
      ...(p.food_grams > 0 ? { foodGrams: Math.round(p.food_grams) } : {}),
      changes,
      ...(ate ? { ate: { ...ate, ...(ateTime.time !== undefined ? { time: ateTime.time } : {}) } } : {}),
      assumptions: p.assumptions.map((a) => a.trim()).filter(Boolean),
      ...(replaces ? { replaces } : {}),
    },
  };
}
