/**
 * The shopping list (docs/SPEC.md, "Shopping list"): what goes on it from typing, a recipe or the
 * assistant, how the same thing stays one line, the shop sections it is sorted by, and the text it
 * is shared as. Pure; tested in shopping.test.ts. The repository applies the changes.
 */
import { normalize, type SearchItem } from '../foods/search';
import { refKey } from '../lib/refs';
import { SHOP_SECTIONS, type FoodRef, type Ingredient, type Recipe, type ShopSection, type ShoppingItem } from '../storage/types';

/** What is added: an item before it is on the list. */
export interface NewShoppingItem {
  name: string;
  ref?: FoodRef;
  section: ShopSection;
  grams?: number;
  amount?: string;
  recipes?: string[];
}

/** The changes to make: records to write and ids to delete. */
export interface ShoppingChange {
  put: ShoppingItem[];
  remove: string[];
}

/** Bought items kept as suggestions; older names drop off. */
export const MAX_REMEMBERED = 300;

/** BLS drinking water: in a recipe it comes from the tap, so it is not offered for the list. */
export const TAP_WATER_CODE = 'N110000';

// The BLS main group is the leading letter of the code (data/README.md, "Food groups"); each maps
// to the part of a shop it is usually found in.
const SECTION_OF_GROUP: Record<string, ShopSection> = {
  F: 'produce',
  G: 'produce',
  K: 'produce',
  B: 'bakery',
  D: 'bakery',
  M: 'dairy',
  T: 'meat',
  U: 'meat',
  V: 'meat',
  W: 'meat',
  C: 'dry',
  H: 'dry',
  Q: 'pantry',
  R: 'pantry',
  S: 'pantry',
  N: 'drinks',
  P: 'drinks',
  X: 'ready',
  Y: 'ready',
};

/** The shop section of a BLS food. */
export function sectionOfCode(code: string): ShopSection {
  // E holds eggs (E1…) and pasta and dumplings (E4… to E9…); Q holds butter and margarine (Q4…,
  // Q6…), which sit in the chilled aisle, as well as oils.
  if (code.startsWith('E')) return code.startsWith('E1') ? 'dairy' : 'dry';
  if (code.startsWith('Q4') || code.startsWith('Q6')) return 'dairy';
  return SECTION_OF_GROUP[code[0] ?? ''] ?? 'other';
}

/** The shop section of any food: BLS by its code, a product by the BLS food it was paired with. */
export function sectionOfRef(ref: FoodRef, matchOf: (ref: FoodRef) => string | undefined): ShopSection {
  if (ref.source === 'BLS') return sectionOfCode(ref.code);
  const match = matchOf(ref);
  return match ? sectionOfCode(match) : 'other';
}

// Common shopping words (English and German) and where they are in a shop, for names typed without
// a food from the database. The database's names are often too specific to tell ("eggs" finds egg
// pasta and egg pâté first); a name not found here is looked up there (guessSection).
const COMMON_WORDS: Array<[ShopSection, string]> = [
  ['produce', 'apple apples banana bananas orange oranges lemon lemons lime limes grapes berries strawberries blueberries raspberries pear pears peach peaches plum plums kiwi mango avocado avocados melon tomato tomatoes potato potatoes onion onions garlic carrot carrots cucumber lettuce salad spinach kale broccoli cauliflower zucchini courgette courgettes paprika mushroom mushrooms ginger parsley basil coriander cabbage leek celery pumpkin beetroot radish radishes fruit vegetables veg herbs apfel äpfel banane bananen tomate tomaten kartoffel kartoffeln zwiebel zwiebeln knoblauch karotte karotten möhre möhren gurke salat spinat pilze champignons zitrone zitronen obst gemüse'],
  ['dairy', 'milk egg eggs cheese yogurt yoghurt quark butter cream skyr kefir buttermilk margarine feta mozzarella parmesan gouda milch ei eier käse joghurt sahne'],
  ['meat', 'chicken beef pork mince ham bacon sausage sausages salami turkey fish salmon tuna shrimp prawns hähnchen huhn rind schwein hack hackfleisch wurst würstchen schinken fisch lachs thunfisch'],
  ['bakery', 'bread roll rolls bun buns toast baguette croissant croissants cake brot brötchen kuchen'],
  ['dry', 'rice pasta spaghetti noodles oats muesli granola cereal flour lentils beans chickpeas nuts almonds walnuts hazelnuts seeds quinoa couscous bulgur reis nudeln haferflocken müsli mehl linsen bohnen kichererbsen nüsse mandeln'],
  ['pantry', 'oil vinegar salt spices sugar honey jam chocolate ketchup mustard mayonnaise mayo sauce stock broth cocoa öl essig salz zucker honig marmelade schokolade senf gewürze brühe'],
  ['drinks', 'water juice coffee tea beer wine soda cola lemonade wasser saft kaffee tee bier wein'],
  ['other', 'toilet paper soap detergent shampoo toothpaste sponges foil tissues klopapier toilettenpapier spülmittel seife waschmittel zahnpasta'],
];
/** Two words that together name something else than their last word. */
const COMMON_PAIRS: Array<[string, ShopSection]> = [
  ['peanut butter', 'pantry'],
  ['sweet potatoes', 'produce'],
  ['coconut milk', 'pantry'],
  ['ice cream', 'other'],
  ['paper towels', 'other'],
  ['kitchen roll', 'other'],
];
const COMMON = new Map<string, ShopSection>([
  ...COMMON_WORDS.flatMap(([section, words]) => words.split(' ').map((w) => [normalize(w), section] as const)),
  ...COMMON_PAIRS.map(([pair, section]) => [normalize(pair), section] as const),
]);

/**
 * The section of a typed name from common shopping words, or undefined. The last known word
 * decides, since it names the thing in English ("orange juice", "olive oil", "chicken breast").
 */
export function commonSection(name: string): ShopSection | undefined {
  const words = normalize(name).split(' ').filter(Boolean);
  for (let i = words.length - 1; i >= 0; i--) {
    const section = (i > 0 ? COMMON.get(`${words[i - 1]} ${words[i]}`) : undefined) ?? COMMON.get(words[i]!);
    if (section) return section;
  }
  return undefined;
}

/** A word and its singular forms ("tomatoes": tomatoe, tomato), to match database names. */
function forms(w: string): string[] {
  if (w.length <= 3 || !w.endsWith('s')) return [w];
  return w.endsWith('es') ? [w, w.slice(0, -1), w.slice(0, -2)] : [w, w.slice(0, -1)];
}

/**
 * The section of a typed name from the food database's best hits (`hits`, best first): only foods
 * whose name has every typed word count (no typo matches: "paper towels" is not paprika), composite
 * dishes do not, and the section most of the top ones share wins.
 */
export function sectionFromFoods(name: string, hits: readonly SearchItem[]): ShopSection {
  const votes = new Map<ShopSection, number>();
  let rank = 0;
  for (const h of namedFoods(name, hits)) {
    const section = sectionOfCode(h.key);
    // Better hits weigh more.
    votes.set(section, (votes.get(section) ?? 0) + 1 / (++rank + 1));
  }
  return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
}

/** Of the database's hits for a typed name, the single foods whose name has every typed word (no typo matches, no composite dishes). */
export function namedFoods<T extends SearchItem>(name: string, hits: readonly T[]): T[] {
  const tokens = normalize(name).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  return hits.filter((h) => {
    if (h.key.startsWith('X') || h.key.startsWith('Y')) return false;
    const words = `${normalize(h.nameEn)} ${normalize(h.nameDe)}`.split(' ');
    return tokens.every((tk) => forms(tk).some((f) => words.some((w) => w.startsWith(f))));
  });
}

const UNIT = '(kg|g|ml|l|x|pcs?|packs?|cans?|bottles?|jars?|bags?|bunch(?:es)?)';
const QTY = `(\\d+(?:[.,]\\d+)?)\\s*(?:${UNIT}\\b)?`;
const LEADING = new RegExp(`^${QTY}\\s+(.+)$`, 'i');
const TRAILING = new RegExp(`^(.+?)\\s+${QTY}$`, 'i');

/** An amount as typed: grams when it is in g or kg, otherwise the words as they were. */
export function parseAmount(text: string): { grams?: number; amount?: string } {
  const s = text.trim();
  if (!s) return {};
  const m = new RegExp(`^${QTY}$`, 'i').exec(s);
  if (m) {
    const grams = toGrams(m[1]!, m[2]);
    if (grams !== undefined) return { grams };
  }
  return { amount: s };
}

/**
 * One typed line: "Milk", "Milk 2 l", "500 g oats", "oats 1kg", "6 eggs". A number with g or kg
 * becomes grams (so it can add up with a recipe's); any other number stays as typed.
 */
export function parseEntry(text: string): { name: string; grams?: number; amount?: string } {
  const s = text.trim().replace(/\s+/g, ' ');
  const lead = LEADING.exec(s);
  if (lead) return { name: lead[3]!, ...quantity(lead[1]!, lead[2]) };
  const trail = TRAILING.exec(s);
  if (trail) return { name: trail[1]!, ...quantity(trail[2]!, trail[3]) };
  return { name: s };
}

function quantity(num: string, unit: string | undefined): { grams?: number; amount?: string } {
  const grams = toGrams(num, unit);
  return grams !== undefined ? { grams } : { amount: unit ? `${num} ${unit}` : num };
}

function toGrams(num: string, unit: string | undefined): number | undefined {
  const n = Number(num.replace(',', '.'));
  if (!(n > 0)) return undefined;
  const u = unit?.toLowerCase();
  if (u === 'g') return n;
  if (u === 'kg') return n * 1000;
  return undefined;
}

/** Grams as they read on a list: "350 g", "1.2 kg". */
export function fmtShopGrams(g: number): string {
  if (g < 1000) return `${Math.round(g)} g`;
  return `${(Math.round(g / 100) / 10).toLocaleString('en-GB')} kg`;
}

/** The amount of a line, or '' when none was given: "500 g", "2 l", "500 g + 1 pack". */
export function amountText(item: Pick<ShoppingItem, 'grams' | 'amount'>): string {
  return [item.grams ? fmtShopGrams(item.grams) : '', item.amount ?? ''].filter(Boolean).join(' + ');
}

/** Two typed amounts as one: "2 l" and "1 l" make "3 l"; anything else is joined with "+". */
export function joinAmounts(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  const pa = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(a);
  const pb = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(b);
  if (pa && pb && pa[2]!.toLowerCase() === pb[2]!.toLowerCase()) {
    const sum = Math.round((Number(pa[1]!.replace(',', '.')) + Number(pb[1]!.replace(',', '.'))) * 100) / 100;
    return pa[2] ? `${sum} ${pa[2]}` : String(sum);
  }
  return `${a} + ${b}`;
}

const nameKey = (name: string) => normalize(name);

/** The same thing: the same food, or (when either was typed) the same name. */
export function sameThing(a: Pick<ShoppingItem, 'name' | 'ref'>, b: Pick<ShoppingItem, 'name' | 'ref'>): boolean {
  if (a.ref && b.ref) return refKey(a.ref) === refKey(b.ref);
  return nameKey(a.name) === nameKey(b.name);
}

/** Still to buy: on the list and not ticked off. */
export const isOpen = (i: ShoppingItem) => i.clearedAt === undefined && i.checkedAt === undefined;
/** On the list: to buy or in the basket, not cleared yet. */
export const onList = (i: ShoppingItem) => i.clearedAt === undefined;

/**
 * Put items on the list. Something already there and not yet ticked off becomes one line with the
 * amounts added up and the recipes joined; anything else is a new line. A thing already in the
 * basket gets a new line (more of it is needed).
 */
export function planAdd(items: readonly ShoppingItem[], adds: readonly NewShoppingItem[], now: number, newId: () => string, schemaVersion: number): ShoppingChange {
  const changed = new Map<string, ShoppingItem>();
  const open = items.filter(isOpen);
  for (const add of adds) {
    if (!add.name.trim()) continue;
    const current = [...changed.values(), ...open.filter((i) => !changed.has(i.id))];
    const same = current.find((i) => isOpen(i) && sameThing(i, add));
    if (same) {
      const grams = same.grams || add.grams ? (same.grams ?? 0) + (add.grams ?? 0) : undefined;
      const amount = joinAmounts(same.amount, add.amount);
      const recipes = [...new Set([...(same.recipes ?? []), ...(add.recipes ?? [])])];
      const ref = same.ref ?? add.ref;
      const next: ShoppingItem = { ...same, ...(ref ? { ref } : {}) };
      setOptional(next, 'grams', grams);
      setOptional(next, 'amount', amount);
      setOptional(next, 'recipes', recipes.length ? recipes : undefined);
      changed.set(same.id, next);
    } else {
      const item: ShoppingItem = { id: newId(), schemaVersion, name: add.name.trim(), section: add.section, addedAt: now };
      if (add.ref) item.ref = add.ref;
      setOptional(item, 'grams', add.grams && add.grams > 0 ? add.grams : undefined);
      setOptional(item, 'amount', add.amount?.trim() || undefined);
      setOptional(item, 'recipes', add.recipes?.length ? [...new Set(add.recipes)] : undefined);
      changed.set(item.id, item);
    }
  }
  return { put: [...changed.values()], remove: [] };
}

/**
 * After shopping: ticked-off lines leave the list and are remembered for suggestions. Only the
 * newest line per name is remembered, and at most MAX_REMEMBERED of them.
 */
export function planClear(items: readonly ShoppingItem[], now: number): ShoppingChange {
  const cleared = items.filter((i) => i.clearedAt === undefined && i.checkedAt !== undefined).map((i) => ({ ...i, clearedAt: now }));
  const remembered = [...items.filter((i) => i.clearedAt !== undefined), ...cleared].sort((a, b) => b.clearedAt! - a.clearedAt! || b.addedAt - a.addedAt);
  const seen = new Set<string>();
  const remove: string[] = [];
  for (const i of remembered) {
    const key = nameKey(i.name);
    if (seen.has(key) || seen.size >= MAX_REMEMBERED) remove.push(i.id);
    else seen.add(key);
  }
  return { put: cleared.filter((i) => !remove.includes(i.id)), remove };
}

/** Bought before (or in the basket now), matching what is typed: newest first, one per name, none already to buy. */
export function suggestions(items: readonly ShoppingItem[], query: string, limit = 5): ShoppingItem[] {
  const q = normalize(query);
  if (!q) return [];
  const toBuy = new Set(items.filter(isOpen).map((i) => nameKey(i.name)));
  const seen = new Set<string>();
  const out: ShoppingItem[] = [];
  const past = items.filter((i) => !isOpen(i)).sort((a, b) => (b.clearedAt ?? b.checkedAt ?? 0) - (a.clearedAt ?? a.checkedAt ?? 0));
  for (const i of past) {
    const key = nameKey(i.name);
    if (seen.has(key) || toBuy.has(key)) continue;
    if (!(key.startsWith(q) || key.includes(` ${q}`))) continue;
    seen.add(key);
    out.push(i);
    if (out.length >= limit) break;
  }
  return out;
}

/** A recipe's ingredients for the list, for this many portions, with what is offered unticked. */
export interface RecipeLine {
  item: NewShoppingItem;
  /** Ticked when the sheet opens: everything but salt (most kitchens have it). */
  selected: boolean;
}

/** A recipe's ingredients scaled to `portions`, one line per food, tap water left out. */
export function recipeLines(
  recipe: Pick<Recipe, 'name' | 'portions' | 'ingredients'>,
  portions: number,
  nameOf: (ing: Ingredient) => string,
  sectionOf: (ref: FoodRef) => ShopSection,
): RecipeLine[] {
  const scale = recipe.portions > 0 ? portions / recipe.portions : 1;
  const lines: RecipeLine[] = [];
  for (const ing of recipe.ingredients) {
    if (ing.ref.source === 'BLS' && ing.ref.code === TAP_WATER_CODE) continue;
    const grams = Math.round(ing.grams * scale);
    const same = lines.find((l) => l.item.ref && refKey(l.item.ref) === refKey(ing.ref));
    if (same) {
      same.item.grams = (same.item.grams ?? 0) + grams;
      continue;
    }
    lines.push({ item: { name: nameOf(ing), ref: ing.ref, section: sectionOf(ing.ref), grams, recipes: [recipe.name] }, selected: !ing.isSalt });
  }
  return lines;
}

/** Lines by shop section, in the order a shop is usually walked; within a section, in the order added. */
export function bySection(items: readonly ShoppingItem[]): Array<{ section: ShopSection; items: ShoppingItem[] }> {
  return SHOP_SECTIONS.map((section) => ({ section, items: items.filter((i) => i.section === section).sort((a, b) => a.addedAt - b.addedAt) })).filter((g) => g.items.length > 0);
}

/** What is still to buy as plain text, for sending to someone: a heading per section, one line per item. */
export function shareText(items: readonly ShoppingItem[], title: string, sectionName: (s: ShopSection) => string): string {
  const groups = bySection(items.filter(isOpen));
  const body = groups.map((g) => [sectionName(g.section), ...g.items.map((i) => `- ${i.name}${amountText(i) ? ` (${amountText(i)})` : ''}`)].join('\n'));
  return [title, ...body].join('\n\n');
}

/** Set or delete an optional field (no `undefined` values in stored records). */
function setOptional<K extends 'grams' | 'amount' | 'recipes'>(item: ShoppingItem, key: K, value: ShoppingItem[K] | undefined) {
  if (value === undefined) delete item[key];
  else item[key] = value;
}
