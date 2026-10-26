/**
 * Reopening a saved chat (docs/SPEC.md, "Saved chats"): the chat as it was left, cards not yet
 * saved included, so the user can carry on. Pure.
 *
 * Bubbles and cards are replayed from the chat's events the way the chat screen built them; the
 * cards come back from their saved summaries (foods by code, products from this phone or the ones
 * looked up in the chat). The conversation is the saved messages with the state saved after the
 * last turn; chats saved before reopening existed get the tool results owed to the model rebuilt.
 */
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { cardVerb, emptyConversation, shownText, type Conversation } from '../../ai/assistant';
import { joinPhotos, photoNumber, type ChatAudio, type ChatEvent, type ChatPhoto, type ChatRecord } from '../../ai/chatRecord';
import { parseLocalDateTime } from '../../ai/photoTime';
import type { Check } from '../../ai/insights';
import type { ProposedItem } from '../../ai/tools';
import type { FoodDb } from '../../foods/foodDb';
import { productFood } from '../../foods/products';
import type { Preparation } from '../../model/paramTypes';
import type { Product } from '../../storage/types';
import type { Bubble, Card } from './cards';

type Summary = Record<string, unknown>;
const isObj = (x: unknown): x is Summary => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A replayed bubble: a user message keeps its photos' and recordings' numbers until they are read. */
export type ReplayedBubble = Exclude<Bubble, { role: 'user' }> | { role: 'user'; text: string; photos: number[]; audio: number[] };

export interface Replayed {
  bubbles: ReplayedBubble[];
  /** The cards shown, in the chat's order, each as saved in the chat and whether it was saved to the diary. */
  cards: Map<string, { summary: Summary; logged: boolean }>;
  /** The last pages bubble's key. */
  pages: number;
}

/** Errors that came with an answer: the user's message stayed in the chat. Any other error took it out again. */
const ANSWER_ERRORS = new Set(['refusal', 'tooLong', 'tooManySteps']);

/** The chat's bubbles and cards, built from its events as the chat screen built them. */
export function replayEvents(events: readonly ChatEvent[], recipe = false): Replayed {
  let bubbles: ReplayedBubble[] = [];
  const cards = new Map<string, { summary: Summary; logged: boolean }>();
  let pages = 0;
  let prev: ChatEvent | undefined;
  for (const e of events) {
    if (e.type === 'user') {
      bubbles.push({ role: 'user', text: e.text, photos: e.photos.map(photoNumber).filter((n): n is number => n !== undefined), audio: e.audio ?? [] });
    } else if (e.type === 'assistant') {
      if (e.text) bubbles.push({ role: 'assistant', text: e.text });
      if (e.checks?.length) bubbles.push({ role: 'checks', checks: e.checks as Check[] });
    } else if (e.type === 'error') {
      if (prev?.type === 'user' && !ANSWER_ERRORS.has(e.reason)) bubbles.pop();
    } else if (e.type === 'cards') {
      const shown = e.cards.filter((c): c is Summary & { id: string } => isObj(c) && typeof c.id === 'string');
      // A correction replaces its open card, as on screen.
      const replaced = new Set(shown.map((c) => c.replaces).filter((id): id is string => typeof id === 'string' && cards.get(id)?.logged === false));
      for (const id of replaced) cards.delete(id);
      for (const c of shown) cards.set(c.id, { summary: c, logged: false });
      const ids = shown.map((c) => c.id);
      bubbles = bubbles.filter((b) => !(b.role === 'card' && replaced.has(b.id)));
      if (ids.length >= 2 && !recipe) bubbles.push({ role: 'pages', key: ++pages, text: e.text, ids });
      else bubbles.push(...(e.text ? [{ role: 'assistant' as const, text: e.text }] : []), ...ids.map((id) => ({ role: 'card' as const, id })));
      if (e.checks?.length) bubbles.push({ role: 'checks', checks: e.checks as Check[] });
    } else {
      const card = cards.get(e.card);
      if (card) card.logged = e.type === 'saved';
    }
    prev = e;
  }
  return { bubbles, cards, pages };
}

/** Cards of a saved chat still waiting to be saved, e.g. for "Continue last chat". */
export function openCardIds(events: readonly ChatEvent[]): string[] {
  return [...replayEvents(events).cards].filter(([, c]) => !c.logged).map(([id]) => id);
}

export interface RestoreContext {
  db: Pick<FoodDb, 'byCode'> & { version?: string };
  /** Products and USDA foods by id: saved on this phone and looked up in the chat. */
  products: ReadonlyMap<string, Product>;
  /** The recipe editor's chat (R cards are ingredients there). */
  recipe?: boolean;
}

/** "Sun 2026-10-18 10:52", as times are saved in a chat, back to epoch ms. */
function parseSavedTime(s: string): number | undefined {
  return parseLocalDateTime(s.replace(/^[A-Z][a-z]{2} /, ''));
}

function restoreItem(x: unknown, ctx: RestoreContext): ProposedItem | undefined {
  if (!isObj(x) || typeof x.code !== 'string' || typeof x.grams !== 'number' || typeof x.preparation !== 'string') return undefined;
  let product: Product | undefined;
  if (isObj(x.product)) {
    product = typeof x.product.id === 'string' ? ctx.products.get(x.product.id) : undefined;
    // A product that is neither saved nor was looked up in this chat cannot come back: no guessing its values.
    if (!product) return undefined;
    // The BLS food the assistant chose for its micronutrients.
    const micros = x.product.microsFrom;
    if (typeof micros === 'string' && product.match?.code !== micros) product = { ...product, match: { version: ctx.db.version ?? '4.0', code: micros } };
  }
  const food = product ? productFood(product, ctx.db) : ctx.db.byCode.get(x.code);
  if (!food) return undefined;
  const pieces = isObj(x.pieces) && typeof x.pieces.n === 'number' && typeof x.pieces.grams === 'number' && x.pieces.n > 0 ? (x.pieces as NonNullable<ProposedItem['pieces']>) : undefined;
  return { food, grams: x.grams, preparation: x.preparation as Preparation, note: typeof x.note === 'string' ? x.note : '', ...(product ? { product } : {}), ...(pieces ? { pieces } : {}) };
}

/** A card from its summary in a saved chat; undefined if one of its foods or products is not on this phone. */
export function restoreCard(summary: Summary, logged: boolean, ctx: RestoreContext): Card | undefined {
  const o: Summary = { ...summary };
  const id = o.id;
  if (typeof id !== 'string') return undefined;
  for (const k of ['time', 'start', 'end']) {
    if (typeof o[k] !== 'string') continue;
    const time = parseSavedTime(o[k] as string);
    if (time === undefined) return undefined;
    o[k] = time;
  }
  // Foods carry a code; a shopping card's things do not and stay as they are.
  if (Array.isArray(o.items) && o.items.some((it) => isObj(it) && 'code' in it)) {
    const items = o.items.map((it) => restoreItem(it, ctx));
    if (items.some((it) => !it)) return undefined;
    o.items = items;
  }
  if (Array.isArray(o.changes)) {
    const changes = o.changes.map((ch: unknown) => (isObj(ch) && ch.item ? { ...ch, item: restoreItem(ch.item, ctx) } : ch));
    if (changes.some((ch) => isObj(ch) && 'item' in ch && !ch.item)) return undefined;
    o.changes = changes;
  }
  // Saved by this app from a card of this kind (its id's letter): the fields are the card's own.
  const c = o as never;
  switch (id[0]) {
    case 'M':
      return { kind: 'meal', proposal: c, logged };
    case 'J':
      return { kind: 'note', note: c, logged };
    case 'S':
      return { kind: 'sleep', sleep: c, logged };
    case 'A':
      return { kind: 'activity', activity: c, logged };
    case 'W':
      return { kind: 'water', water: c, logged };
    case 'K':
      return { kind: 'ketone', ketone: c, logged };
    case 'G':
      return { kind: 'weight', weight: c, logged };
    case 'L':
      return { kind: 'shopping', shopping: c, logged };
    case 'H':
      return { kind: 'home', home: c, logged };
    case 'R':
      return ctx.recipe ? { kind: 'ingredients', ingredients: c, logged } : { kind: 'recipe', recipe: c, logged };
    case 'P':
      return { kind: 'portion', portion: c, logged };
    case 'B':
      return { kind: 'batch', batch: c, logged };
    default:
      return undefined;
  }
}

const NO_RESULT = 'No result: the app was closed before the answer arrived and the chat was reopened later. Call the tool again if you still need it.';

/**
 * For chats saved before reopening existed: the conversation state after the last turn. Card
 * numbers continue from the highest shown; a last answer with tool calls gets its results back
 * (the cards it showed, in the order it proposed them).
 */
export function rebuildConversation(messages: Beta.BetaMessageParam[], events: readonly ChatEvent[]): Conversation {
  const shown = events.flatMap((e) => (e.type === 'cards' ? e.cards.map((c) => (isObj(c) && typeof c.id === 'string' ? c.id : '')) : []));
  const highest = (letter: string) => Math.max(0, ...shown.filter((id) => id[0] === letter).map((id) => Number(id.slice(1)) || 0));
  const lastCards = [...events].reverse().find((e) => e.type === 'cards');
  const queue = lastCards?.type === 'cards' ? lastCards.cards.map((c) => (isObj(c) && typeof c.id === 'string' ? c.id : '')) : [];
  const last = messages[messages.length - 1];
  const uses = last?.role === 'assistant' && Array.isArray(last.content) ? last.content.filter((b): b is Beta.BetaToolUseBlockParam => b.type === 'tool_use') : [];
  const pendingResults = uses.map((u): Beta.BetaToolResultBlockParam => {
    const card = u.name.startsWith('propose_') ? queue.shift() : undefined;
    return card ? { type: 'tool_result', tool_use_id: u.id, content: shownText(card, cardVerb(card, false)) } : { type: 'tool_result', tool_use_id: u.id, content: NO_RESULT, is_error: true };
  });
  return {
    ...emptyConversation(),
    messages,
    pendingResults,
    cards: highest('M'),
    notes: highest('J'),
    sleeps: highest('S'),
    activities: highest('A'),
    waters: highest('W'),
    ketones: highest('K'),
    weights: highest('G'),
    lists: highest('L'),
    homes: highest('H'),
    recipes: highest('R'),
    portions: highest('P'),
    batches: highest('B'),
  };
}

/** Said in the conversation where a photo of the chat is no longer on the phone. */
const PHOTO_GONE = '[photo no longer saved]';

export interface Reopened {
  conversation: Conversation;
  bubbles: Bubble[];
  cards: Map<string, Card>;
  /** Products and USDA foods looked up in the chat, still usable in it. */
  seen: Product[];
  /** Photos sent so far (the next one gets the next number) and their size in base64 characters. */
  photoCount: number;
  photoBytes: number;
  /** The last pages bubble's key. */
  pages: number;
  /** Open cards that could not be rebuilt: a food or product is no longer on this phone. */
  lost: string[];
}

/** A saved meal chat, ready to carry on with. */
export function reopenChat(
  rec: ChatRecord,
  photos: readonly ChatPhoto[],
  ctx: Omit<RestoreContext, 'products' | 'recipe'> & { saved: ReadonlyMap<string, Product> },
  audio: readonly ChatAudio[] = [],
): Reopened {
  const seen = rec.resume?.products ?? [];
  const products = new Map([...ctx.saved, ...seen.map((p) => [p.id, p] as const)]);
  const messages = joinPhotos(rec.messages, photos, PHOTO_GONE) as Beta.BetaMessageParam[];
  const conversation = rec.resume ? { ...rec.resume.conversation, messages } : rebuildConversation(messages, rec.events);

  const replayed = replayEvents(rec.events);
  const cards = new Map<string, Card>();
  const lost: string[] = [];
  for (const [id, c] of replayed.cards) {
    const card = restoreCard(c.summary, c.logged, { db: ctx.db, products });
    if (card) cards.set(id, card);
    else if (!c.logged) lost.push(id);
  }
  const byN = new Map(photos.map((p) => [p.n, p]));
  const clipByN = new Map(audio.map((a) => [a.n, a]));
  const bubbles = replayed.bubbles.map((b): Bubble => {
    if (b.role !== 'user') return b;
    const previews = b.photos.flatMap((n) => {
      const p = byN.get(n);
      return p ? [`data:${p.mediaType};base64,${p.data}`] : [];
    });
    const clips = b.audio.flatMap((n) => {
      const a = clipByN.get(n);
      return a ? [{ data: a.data, mediaType: a.mediaType, ms: a.ms }] : [];
    });
    return { role: 'user', text: b.text, previews, ...(clips.length ? { audio: clips } : {}) };
  });
  return {
    conversation,
    bubbles,
    cards,
    seen,
    // Labels count every photo sent, also ones a chat saved by an older version did not keep.
    photoCount: Math.max(rec.photos, ...replayed.bubbles.flatMap((b) => (b.role === 'user' ? b.photos : []))),
    photoBytes: photos.reduce((n, p) => n + p.data.length, 0),
    pages: replayed.pages,
    lost,
  };
}
