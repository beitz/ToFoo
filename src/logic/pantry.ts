/**
 * At home (docs/SPEC.md, "At home"): what was bought and is at home, how much of it is left, where
 * it is kept, and what runs low. Only the amount at the time it was bought or counted is stored;
 * what is left is worked out from the log and the cooked batches since then, like the stores are
 * worked out from the log. Pure; tested in pantry.test.ts. The repository applies the changes.
 */
import { normalize, type SearchItem } from '../foods/search';
import { refKey } from '../lib/refs';
import { HOME_PLACES, type Batch, type FoodRef, type HomePlace, type LogEntry, type PantryItem, type ShopSection, type ShoppingItem } from '../storage/types';
import { commonSection, fmtShopGrams, isOpen, namedFoods, parseAmount, parseEntry, sameThing } from './shopping';

/** What is added: something bought, before it is on the list. */
export interface NewPantryItem {
  name: string;
  ref?: FoodRef;
  place: HomePlace;
  pieces?: number;
  grams?: number;
  amount?: string;
}

/** The changes to make: records to write and ids to delete. */
export interface PantryChange {
  put: PantryItem[];
  remove: string[];
}

/** What is left of something now. */
export interface Left {
  /** Pieces left, when it is counted in pieces. */
  pieces?: number;
  /** Grams left, when it is counted in grams. */
  grams?: number;
  /** Used up: marked so, or nothing left of a counted amount. */
  out: boolean;
  /** Marked as running low (and not used up). */
  low: boolean;
}

/** One use of a food: a log entry of it or a pot cooked with it. */
interface Use {
  time: number;
  pieces: number;
  grams: number;
}

/** Uses of every food, by food key (refKey): one piece per log entry or pot, the grams eaten or cooked. */
export type Usage = ReadonlyMap<string, readonly Use[]>;

export function usageOf(log: readonly LogEntry[], batches: readonly Batch[]): Usage {
  const usage = new Map<string, Use[]>();
  const add = (key: string, use: Use) => {
    const list = usage.get(key);
    if (list) list.push(use);
    else usage.set(key, [use]);
  };
  for (const e of log) {
    if (e.kind === 'food') add(refKey(e.ref), { time: e.time, pieces: 1, grams: e.grams });
    // Saved items (supplements, own foods) are logged in servings, without grams.
    else if (e.kind === 'custom') add(refKey({ source: 'custom', id: e.customFoodId }), { time: e.time, pieces: e.servings, grams: 0 });
  }
  for (const b of batches) {
    // What went into the pot: one piece per pot (a can, a pack), its grams for the whole pot.
    const grams = new Map<string, number>();
    for (const ing of b.recipe.ingredients) grams.set(refKey(ing.ref), (grams.get(refKey(ing.ref)) ?? 0) + ing.grams);
    for (const [key, g] of grams) add(key, { time: b.cookedAt, pieces: 1, grams: g });
  }
  return usage;
}

/** What is left of an item now: its amount at `since` less what was logged or cooked with it from then on. */
export function leftOf(item: PantryItem, usage: Usage): Left {
  let pieces = 0;
  let grams = 0;
  for (const u of item.ref ? (usage.get(refKey(item.ref)) ?? []) : []) {
    if (u.time < item.since) continue;
    pieces += u.pieces;
    grams += u.grams;
  }
  const left: Left = { out: false, low: false };
  if (item.pieces !== undefined) left.pieces = Math.max(0, Math.round((item.pieces - pieces) * 10) / 10);
  if (item.grams !== undefined) left.grams = Math.max(0, Math.round(item.grams - grams));
  left.out = item.status === 'out' || left.pieces === 0 || left.grams === 0;
  left.low = !left.out && item.status === 'low';
  return left;
}

/** How much is left, as shown: "2 left", "350 g", "1 l"; '' when there is no amount (just "have it"). */
export function leftText(item: PantryItem, left: Left, piecesLeft: (n: number) => string): string {
  if (left.pieces !== undefined) return piecesLeft(left.pieces);
  if (left.grams !== undefined) return fmtShopGrams(left.grams);
  return item.amount ?? '';
}

/** The amount field as it reads for editing: "2", "350 g", "1 l". */
export function amountField(item: PantryItem, left: Left): string {
  if (left.pieces !== undefined) return String(left.pieces);
  if (left.grams !== undefined) return fmtShopGrams(left.grams);
  return item.amount ?? '';
}

const PIECES = /^(\d+(?:[.,]\d+)?)\s*(?:x|pcs?|pieces?|packs?|packets?|cans?|tins?|bottles?|jars?|bags?|box|boxes|st|stk|stück|packungen?|dosen?|gläser|glas|flaschen?|beutel)?\.?$/i;

/**
 * An amount as typed: a plain number or a count of packs, cans or jars is pieces, g or kg is grams,
 * anything else ("1 l") stays as typed and is not counted down.
 */
export function stockAmount(text: string): { pieces?: number; grams?: number; amount?: string } {
  const s = text.trim();
  if (!s) return {};
  const m = PIECES.exec(s);
  if (m) return { pieces: Number(m[1]!.replace(',', '.')) };
  return parseAmount(s);
}

/** One typed line: "lasagne 2", "500 g oats", "2 cans tomatoes", "paprika powder". */
export function parseStock(text: string): { name: string; pieces?: number; grams?: number; amount?: string } {
  const { name, grams, amount } = parseEntry(text);
  if (grams !== undefined) return { name, grams };
  return amount ? { name, ...stockAmount(amount) } : { name };
}

/** A shopping list line as something to put away: pieces when it says how many, else grams. */
export function fromShopping(line: Pick<ShoppingItem, 'name' | 'ref' | 'grams' | 'amount'>, place: HomePlace): NewPantryItem {
  const item: NewPantryItem = { name: line.name, place };
  if (line.ref) item.ref = line.ref;
  if (line.grams) item.grams = line.grams;
  else if (line.amount) Object.assign(item, stockAmount(line.amount));
  return item;
}

// ── Where things are kept ──

// Words that tell where something is kept, in English and German, before its food group does.
const FREEZER_WORDS = new Set(['frozen', 'tk', 'tiefkuhl', 'tiefgekuhlt', 'tiefgefroren', 'gefroren', 'eis', 'speiseeis', 'icecream']);
const SPICE_WORDS = new Set(
  'spice spices pepper salt cumin cinnamon oregano thyme rosemary nutmeg turmeric cardamom cloves vanilla marjoram caraway coriander chili chilli powder seasoning gewurz gewurze pfeffer salz zimt kreuzkummel kummel kurkuma muskat muskatnuss thymian rosmarin majoran lorbeer lorbeerblatter nelken kardamom vanille pulver'.split(' '),
);

/**
 * Where a typed name says it is kept, or undefined: frozen anywhere in it ("frozen spinach"), a
 * spice as its last word ("paprika powder", "sea salt"; not "cinnamon rolls" or "vanilla yogurt").
 */
export function placeFromWords(name: string): HomePlace | undefined {
  const n = normalize(name);
  const words = n.split(' ').filter(Boolean);
  if (words.some((w) => FREEZER_WORDS.has(w)) || n.includes('ice cream')) return 'freezer';
  const last = words[words.length - 1] ?? '';
  // Peppers that are vegetables.
  if (last === 'pepper' && ['bell', 'sweet', 'red', 'green', 'yellow'].includes(words[words.length - 2] ?? '')) return undefined;
  if (SPICE_WORDS.has(last) || last.endsWith('pulver') || last.endsWith('gewurz')) return 'spices';
  return undefined;
}

/** Where a BLS food is usually kept, by its main group (data/README.md, "Food groups"). */
export function placeOfCode(code: string): HomePlace {
  const group = code[0] ?? '';
  if (group === 'R') return 'spices';
  // Dairy, fish, meat, poultry, sausages, vegetables, eggs, butter and cooked dishes go in the fridge.
  if ('MTUVWGXY'.includes(group) || code.startsWith('E1') || code.startsWith('Q4') || code.startsWith('Q6')) return 'fridge';
  return 'cupboard';
}

const PLACE_OF_SECTION: Partial<Record<ShopSection, HomePlace>> = { dairy: 'fridge', meat: 'fridge', ready: 'fridge' };

/**
 * Where something is kept: its words first ("frozen", "powder"), then the food it is (a product by
 * its paired BLS food), then common shopping words, then the food database's best hits (`hits`).
 */
export function guessPlace(name: string, matchCode: string | undefined, hits: () => readonly SearchItem[]): HomePlace {
  const fromWords = placeFromWords(name);
  if (fromWords) return fromWords;
  if (matchCode) return placeOfCode(matchCode);
  const section = commonSection(name);
  const food = () => namedFoods(name, hits())[0];
  // Fruit and vegetables differ (bananas in the bowl, carrots in the fridge): the database tells.
  if (section === 'produce') {
    const f = food();
    return f ? placeOfCode(f.key) : 'fridge';
  }
  if (section) return PLACE_OF_SECTION[section] ?? 'cupboard';
  const f = food();
  return f ? placeOfCode(f.key) : 'cupboard';
}

// ── Changes ──

/** Set or delete an optional field (no `undefined` values in stored records). */
function setOptional<K extends 'pieces' | 'grams' | 'amount'>(item: PantryItem, key: K, value: PantryItem[K] | undefined) {
  if (value === undefined) delete item[key];
  else item[key] = value;
}

/** An item with a new amount from `now`: pieces, grams, another amount, or none (just "have it"). */
export function withAmount(item: PantryItem, amount: { pieces?: number; grams?: number; amount?: string }, now: number): PantryItem {
  const next: PantryItem = { ...item, since: now };
  setOptional(next, 'pieces', amount.pieces);
  setOptional(next, 'grams', amount.pieces === undefined ? amount.grams : undefined);
  setOptional(next, 'amount', amount.pieces === undefined && amount.grams === undefined ? amount.amount : undefined);
  return next;
}

/**
 * An item marked as running low, used up, or had again (no status). Had again after it was used
 * up by eating: its count starts over without an amount, since how much is there is not known.
 */
export function withStatus(item: PantryItem, status: PantryItem['status'], left: Left, now: number): PantryItem {
  let next: PantryItem = { ...item };
  if (status) next.status = status;
  else delete next.status;
  if (status !== 'out' && (left.pieces === 0 || left.grams === 0)) next = withAmount(next, {}, now);
  return next;
}

/**
 * Put bought things away. Something already at home gets the amount bought added to what is left
 * (or replaces it, when counted differently), is no longer running low or used up, and keeps its
 * place; anything else is a new item.
 */
export function planStock(
  items: readonly PantryItem[],
  adds: readonly NewPantryItem[],
  now: number,
  newId: () => string,
  schemaVersion: number,
  left: (item: PantryItem) => Left,
): PantryChange {
  const changed = new Map<string, PantryItem>();
  for (const add of adds) {
    if (!add.name.trim()) continue;
    const current = [...changed.values(), ...items.filter((i) => !changed.has(i.id))];
    const same = current.find((i) => sameThing(i, add));
    if (same) {
      // Changed in this call: its count starts now, so nothing was used of it yet.
      const l = changed.has(same.id) ? leftOf(same, new Map()) : left(same);
      const had = (n: number | undefined) => (l.out ? 0 : (n ?? 0));
      let next: PantryItem;
      if (add.pieces !== undefined) next = withAmount(same, { pieces: had(l.pieces) + add.pieces }, now);
      else if (add.grams !== undefined) next = withAmount(same, { grams: had(l.grams) + add.grams }, now);
      else if (add.amount) next = withAmount(same, { amount: add.amount }, now);
      // No amount given: as much as is left stays, or just "have it" when it was used up.
      else next = l.out ? withAmount(same, {}, now) : withAmount(same, { pieces: l.pieces, grams: l.grams, amount: same.amount }, now);
      delete next.status;
      if (!next.ref && add.ref) next.ref = add.ref;
      changed.set(same.id, next);
    } else {
      const item: PantryItem = { id: newId(), schemaVersion, name: add.name.trim(), place: add.place, since: now, addedAt: now };
      if (add.ref) item.ref = add.ref;
      changed.set(item.id, withAmount(item, add, now));
    }
  }
  return { put: [...changed.values()], remove: [] };
}

/** Something the user reported: bought, running low or used up. */
export type Report = NewPantryItem & { status: 'bought' | 'low' | 'out' };

/**
 * Reports (from the assistant): bought things are put away (planStock); things running low or
 * used up are marked so, and added with that mark when they were not at home yet.
 */
export function planReports(
  items: readonly PantryItem[],
  reports: readonly Report[],
  now: number,
  newId: () => string,
  schemaVersion: number,
  left: (item: PantryItem) => Left,
): PantryChange {
  const bought = planStock(items, reports.filter((r) => r.status === 'bought'), now, newId, schemaVersion, left);
  const changed = new Map(bought.put.map((i) => [i.id, i]));
  for (const r of reports) {
    if (r.status === 'bought' || !r.name.trim()) continue;
    const current = [...changed.values(), ...items.filter((i) => !changed.has(i.id))];
    const same = current.find((i) => sameThing(i, r));
    if (same) {
      changed.set(same.id, withStatus(same, r.status, changed.has(same.id) ? leftOf(same, new Map()) : left(same), now));
    } else {
      const item: PantryItem = withAmount({ id: newId(), schemaVersion, name: r.name.trim(), place: r.place, since: now, addedAt: now, status: r.status }, r, now);
      if (r.ref) item.ref = r.ref;
      changed.set(item.id, item);
    }
  }
  return { put: [...changed.values()], remove: [] };
}

/** What needs buying: running low or used up. */
export const needsBuying = (left: Left) => left.low || left.out;

/** On the shopping list already (to buy or in the basket). */
export function onShoppingList(item: Pick<PantryItem, 'name' | 'ref'>, shopping: readonly ShoppingItem[]): boolean {
  return shopping.some((s) => s.clearedAt === undefined && sameThing(s, item));
}

/** Still to buy on the shopping list (not in the basket yet). */
export function toBuy(item: Pick<PantryItem, 'name' | 'ref'>, shopping: readonly ShoppingItem[]): boolean {
  return shopping.some((s) => isOpen(s) && sameThing(s, item));
}

/** Offered on the log screen: a food that is there (not used up), and not a spice. */
export const loggable = (item: PantryItem, left: Left) => !!item.ref && item.place !== 'spices' && !left.out;

/** Items by place in the order of HOME_PLACES; within a place, by name. */
export function byPlace(items: readonly PantryItem[]): Array<{ place: HomePlace; items: PantryItem[] }> {
  return HOME_PLACES.map((place) => ({ place, items: items.filter((i) => i.place === place).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length > 0);
}

/** Things at home matching what is typed, for adding more of them: newest first. */
export function pantrySuggestions(items: readonly PantryItem[], query: string, limit = 5): PantryItem[] {
  const q = normalize(query);
  if (!q) return [];
  return items
    .filter((i) => {
      const key = normalize(i.name);
      return key.startsWith(q) || key.includes(` ${q}`);
    })
    .sort((a, b) => b.since - a.since)
    .slice(0, limit);
}
