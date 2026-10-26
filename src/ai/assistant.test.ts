import { describe, expect, it } from 'vitest';
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { Food } from '../foods/foodDb';
import { buildIndex } from '../foods/search';
import { appNote, emptyConversation, requestParams, retirePhotos, sendMessage, textOf, type CreateMessage } from './assistant';
import { describeFood, validateBatchProposal, validatePortionProposal, MAX_INGREDIENT_GRAMS, MAX_ITEM_GRAMS, runCheckRecipe, runListRecipes, validateRecipeProposal, validateIngredientsProposal, runLookupBarcode, runSearchFoods, runSearchProducts, runSearchUsda, validateJournalProposal, validateProposal, validateSleepProposal, validateActivityProposal, validateWaterProposal, validateKetoneProposal, validateWeightProposal, validateShoppingProposal, validateHomeProposal, type ProductTools, type ToolContext } from './tools';
import type { Product } from '../storage/types';
import type { FindResult } from '../foods/findProduct';

function food(code: string, nameEn: string, nameDe: string, kcal: number | null): Food {
  return { code, nameEn, nameDe, group: code.charAt(0), per100: { ENERCC: kcal, PROT625: 8.9, FAT: 't', CHO: null }, provenance: {} };
}
const foods = [food('D7A5400', 'Milk roll (yeast dough)', 'Milchbrötchen (Hefeteig)', 337), food('S450000', 'Nougat', 'Nugat/Nougat/Noisette', 461)];
const db = { byCode: new Map(foods.map((f) => [f.code, f])), groups: { D: { en: 'Cakes, pastries and biscuits', de: 'Kuchen' } } };
const ctx: ToolContext = { db, index: buildIndex(foods.map((f) => ({ key: f.code, nameEn: f.nameEn, nameDe: f.nameDe }))) };

function reply(content: Beta.BetaContentBlock[], stop_reason: Beta.BetaStopReason): Beta.BetaMessage {
  const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null, iterations: null };
  return { id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, usage } as unknown as Beta.BetaMessage;
}
const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input }) as Beta.BetaToolUseBlock;
const text = (t: string) => ({ type: 'text', text: t }) as Beta.BetaTextBlock;

/** A fake API that answers from a script and records every request. */
function scripted(...responses: Beta.BetaMessage[]) {
  const requests: Beta.MessageCreateParamsNonStreaming[] = [];
  const create: CreateMessage = async (p) => {
    requests.push(structuredClone(p));
    const r = responses.shift();
    if (!r) throw new Error('no more responses');
    return r;
  };
  return { create, requests };
}

describe('tools', () => {
  it('describes a food with code, both names and macros, keeping missing values visible', () => {
    expect(describeFood(foods[0]!, db)).toBe('D7A5400 | Milk roll (yeast dough) | Milchbrötchen (Hefeteig) | Cakes, pastries and biscuits | per 100 g: 337 kcal, protein 8.9 g, fat trace g, carbs ? g');
  });

  it('searches in German and English and reports empty results', () => {
    const r = runSearchFoods({ queries: ['Milchbrötchen', 'kimchi'] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.text).toContain('D7A5400');
    expect(r.text).toContain('Results for "kimchi":\nNo matches');
  });

  it('rejects malformed search input', () => {
    expect(runSearchFoods({ q: 'x' }, ctx).ok).toBe(false);
  });

  it('accepts a proposal of known codes and plausible grams', () => {
    const r = validateProposal({ summary: 'Snack', items: [{ code: 'S450000', grams: 12.34, preparation: 'asListed', note: ' Giotto ' }], assumptions: [' 3 balls ', ''], confidence: 'C' }, db);
    expect(r.ok && r.proposal).toEqual({ summary: 'Snack', items: [{ food: foods[1], grams: 12.3, preparation: 'asListed', note: 'Giotto' }], assumptions: ['3 balls'], confidence: 'C' });
  });

  it('rejects invented codes and implausible amounts, naming each problem', () => {
    const r = validateProposal(
      {
        summary: 'x',
        items: [
          { code: 'X999999', grams: 50, preparation: 'raw', note: '' },
          { code: 'S450000', grams: MAX_ITEM_GRAMS + 1, preparation: 'raw', note: '' },
          { code: 'S450000', grams: 0, preparation: 'raw', note: '' },
        ],
        assumptions: [],
        confidence: 'B',
      },
      db,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Unknown code X999999');
      expect(r.error).toContain(`${MAX_ITEM_GRAMS + 1} g is not plausible`);
      expect(r.error).toContain('0 g is not plausible');
    }
  });
});

describe('sendMessage', () => {
  const proposal = { summary: 'Milk roll', items: [{ code: 'D7A5400', grams: 60, preparation: 'asListed', note: '' }], assumptions: ['one roll'], confidence: 'C' };

  it('runs searches, then stops at a proposal and owes its result to the next message', async () => {
    const api = scripted(
      reply([toolUse('t1', 'search_foods', { queries: ['Milchbrötchen'] })], 'tool_use'),
      reply([text('Looks like one milk roll.'), toolUse('t2', 'propose_meal', proposal)], 'tool_use'),
    );
    const img = { mediaType: 'image/jpeg' as const, data: 'AAAA' };
    const { conversation, outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: ' from work ', images: [img] }, ctx);

    expect(outcome.kind).toBe('proposal');
    if (outcome.kind === 'proposal') {
      expect(outcome.text).toBe('Looks like one milk roll.');
      expect(outcome.proposals[0]!.items[0]?.food.code).toBe('D7A5400');
    }
    // Second request carries the search result for t1.
    const second = api.requests[1]!.messages;
    const toolResult = (second[2]!.content as Beta.BetaContentBlockParam[])[0] as Beta.BetaToolResultBlockParam;
    expect(toolResult.tool_use_id).toBe('t1');
    expect(String(toolResult.content)).toContain('D7A5400');
    // First message: photo, then text.
    expect((api.requests[0]!.messages[0]!.content as Beta.BetaContentBlockParam[]).map((b) => b.type)).toEqual(['image', 'text']);
    expect(conversation.pendingResults.map((r) => r.tool_use_id)).toEqual(['t2']);

    // The user's correction goes out with the owed tool result first.
    const next = scripted(reply([text('Two rolls then?')], 'end_turn'));
    const after = await sendMessage(next.create, 'claude-opus-5-5', conversation, { text: 'it was two', images: [] }, ctx);
    const last = next.requests[0]!.messages.at(-1)!.content as Beta.BetaContentBlockParam[];
    expect(last.map((b) => b.type)).toEqual(['tool_result', 'text']);
    expect(after.outcome).toEqual({ kind: 'reply', text: 'Two rolls then?', checks: [] });
    expect(after.conversation.pendingResults).toEqual([]);
  });

  it('reports the billed tokens of every response', async () => {
    const api = scripted(reply([toolUse('t1', 'search_foods', { queries: ['roll'] })], 'tool_use'), reply([text('One roll?')], 'end_turn'));
    const seen: unknown[] = [];
    await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'a roll', images: [] }, ctx, (t) => seen.push(t));
    expect(seen).toEqual([
      { 'claude-opus-5-5': { input: 100, output: 50, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 } },
      { 'claude-opus-5-5': { input: 100, output: 50, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 } },
    ]);
  });

  it('sends an invalid proposal back to the model as an error', async () => {
    const api = scripted(
      reply([toolUse('t1', 'propose_meal', { ...proposal, items: [{ code: 'NOPE', grams: 60, preparation: 'asListed', note: '' }] })], 'tool_use'),
      reply([text('Let me search first.')], 'end_turn'),
    );
    const { outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'a roll', images: [] }, ctx);
    const result = (api.requests[1]!.messages[2]!.content as Beta.BetaToolResultBlockParam[])[0]!;
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toContain('Unknown code NOPE');
    expect(outcome).toEqual({ kind: 'reply', text: 'Let me search first.', checks: [] });
  });

  it('reports refusals and runaway tool loops instead of looping forever', async () => {
    const refused = scripted(reply([], 'refusal'));
    expect((await sendMessage(refused.create, 'claude-opus-5-5', emptyConversation(), { text: 'x', images: [] }, ctx)).outcome).toEqual({ kind: 'error', reason: 'refusal' });

    const loop = scripted(...Array.from({ length: 30 }, (_, i) => reply([toolUse(`t${i}`, 'search_foods', { queries: ['roll'] })], 'tool_use')));
    expect((await sendMessage(loop.create, 'claude-opus-5-5', emptyConversation(), { text: 'x', images: [] }, ctx)).outcome).toEqual({ kind: 'error', reason: 'tooManySteps' });
  });

  it('does not mutate the conversation it was given', async () => {
    const conv = emptyConversation();
    await sendMessage(scripted(reply([text('Hi')], 'end_turn')).create, 'claude-opus-5-5', conv, { text: 'hi', images: [] }, ctx);
    expect(conv.messages).toEqual([]);
  });
});

describe('several meals at once', () => {
  const now = new Date(2026, 9, 17, 9, 30).getTime();
  const meal = (summary: string, time: string, replaces = '') => ({ summary, items: [{ code: 'D7A5400', grams: 60, preparation: 'asListed', note: '' }], assumptions: [], confidence: 'C', time, replaces });

  it('labels each photo with its capture time and shows all proposals of a response as numbered cards', async () => {
    const api = scripted(reply([text('Here are both.'), toolUse('a', 'propose_meal', meal('Yogurt', '2026-10-16 08:10')), toolUse('b', 'propose_meal', meal('Yogurt', '2026-10-16 21:05'))], 'tool_use'));
    const img = (label: string) => ({ mediaType: 'image/jpeg' as const, data: 'AAAA', label });
    const { conversation, outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'yogurt twice', images: [img('Photo 1: taken …'), img('Photo 2: taken …')], appNote: '(Now: …)' }, { ...ctx, now });
    expect((api.requests[0]!.messages[0]!.content as Beta.BetaContentBlockParam[]).map((b) => b.type)).toEqual(['text', 'image', 'text', 'image', 'text', 'text']);
    expect(outcome.kind === 'proposal' && outcome.proposals.map((p) => [p.id, p.time])).toEqual([
      ['M1', new Date(2026, 9, 16, 8, 10).getTime()],
      ['M2', new Date(2026, 9, 16, 21, 5).getTime()],
    ]);
    expect(conversation.cards).toBe(2);
    expect(conversation.pendingResults.map((r) => r.content)).toEqual(['Shown to the user as card M1. Not logged yet; their reply follows.', 'Shown to the user as card M2. Not logged yet; their reply follows.']);

    // A correction names the card it replaces and gets the next number.
    const next = scripted(reply([toolUse('c', 'propose_meal', meal('Yogurt', '2026-10-16 21:05', 'M2'))], 'tool_use'));
    const after = await sendMessage(next.create, 'claude-opus-5-5', conversation, { text: 'the evening one was bigger', images: [] }, { ...ctx, now });
    expect(after.outcome.kind === 'proposal' && after.outcome.proposals.map((p) => [p.id, p.replaces])).toEqual([['M3', 'M2']]);
  });

  it('takes photos out of the chat once every card made from them is saved or replaced', async () => {
    const api = scripted(reply([toolUse('a', 'propose_meal', meal('Yogurt', '2026-10-16 08:10')), toolUse('b', 'propose_meal', meal('Yogurt', '2026-10-16 21:05'))], 'tool_use'));
    const img = (label: string) => ({ mediaType: 'image/jpeg' as const, data: 'AAAA', label });
    const first = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'yogurt twice', images: [img('Photo 1'), img('Photo 2')] }, { ...ctx, now });
    expect(first.conversation.photoTurns).toEqual([{ message: 0, cards: ['M1', 'M2'] }]);
    const types = (c: typeof first.conversation) => (c.messages[0]!.content as Beta.BetaContentBlockParam[]).map((b) => b.type);

    // M2 still open: the photos stay, the assistant may need them for a correction.
    expect(retirePhotos(first.conversation, (id) => id === 'M1')).toBe(first.conversation);

    // A correction replaces M2 (its card goes away); once M1 and M3 are saved, the photos go.
    const next = scripted(reply([toolUse('c', 'propose_meal', meal('Yogurt', '2026-10-16 21:05', 'M2'))], 'tool_use'));
    const second = await sendMessage(next.create, 'claude-opus-5-5', first.conversation, { text: 'the evening one was bigger', images: [] }, { ...ctx, now });
    expect(second.conversation.photoTurns).toEqual([{ message: 0, cards: ['M1', 'M2', 'M3'] }]);
    const saved = new Set(['M1', 'M3']);
    const lighter = retirePhotos(second.conversation, (id) => id === 'M2' || saved.has(id));
    expect(types(lighter)).toEqual(['text', 'text', 'text', 'text', 'text', 'text']);
    expect(JSON.stringify(lighter.messages[0])).not.toContain('AAAA');
    expect(JSON.stringify(lighter.messages[0])).toContain('Photo 2');
    expect(lighter.photoTurns).toEqual([]);
    // The rest of the chat is untouched.
    expect(lighter.messages.slice(1)).toEqual(second.conversation.messages.slice(1));
    expect(types(second.conversation)).toContain('image');
  });

  it('keeps photos of a message that has no cards yet (questions first)', () => {
    const conv = { ...emptyConversation(), messages: [{ role: 'user' as const, content: [{ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: 'AAAA' } }] }], photoTurns: [{ message: 0, cards: [] }] };
    expect(retirePhotos(conv, () => true)).toBe(conv);
  });

  it('shows no cards when one proposal of a batch is invalid, and asks for all again', async () => {
    const api = scripted(reply([toolUse('a', 'propose_meal', meal('Ok', '2026-10-16 08:10')), toolUse('b', 'propose_meal', meal('Later', '2026-10-18 08:00'))], 'tool_use'), reply([text('Fixing.')], 'end_turn'));
    const { outcome, conversation } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'x', images: [] }, { ...ctx, now });
    const results = api.requests[1]!.messages[2]!.content as Beta.BetaToolResultBlockParam[];
    expect(results.map((r) => [r.tool_use_id, r.is_error])).toEqual([['b', true], ['a', true]]);
    expect(String(results[0]!.content)).toContain('is in the future');
    expect(String(results[1]!.content)).toContain('Call propose_meal again for this meal too');
    expect(outcome.kind).toBe('reply');
    expect(conversation.cards).toBe(0);
  });

  it('checks meal times', () => {
    const v = (time: string) => validateProposal(meal('x', time), db, undefined, now);
    expect(v('').ok && (v('') as { proposal: object }).proposal).not.toHaveProperty('time');
    expect(!v('yesterday').ok && (v('yesterday') as { error: string }).error).toContain('not a valid local time');
    expect(v('2026-02-31 12:00').ok).toBe(false);
    expect(!v('2025-01-01 12:00').ok && (v('2025-01-01 12:00') as { error: string }).error).toContain('more than a year ago');
    expect(v('2026-10-17 09:35').ok).toBe(true);
  });

  it('tells the assistant the time, the chat day, card states and barcodes', () => {
    expect(appNote({ now, day: '2026-10-16', today: '2026-10-17', logged: ['M1'], open: ['M2', 'M3'], barcodes: ['4008400121925'] })).toBe(
      '(Now: Sat 2026-10-17 09:30. The user opened this chat for 2026-10-16. Cards already logged: M1. Cards still open: M2, M3. Barcodes the app read from the photos: 4008400121925.)',
    );
    expect(appNote({ now, day: '2026-10-17', today: '2026-10-17', logged: [], open: [], barcodes: [] })).toBe('(Now: Sat 2026-10-17 09:30.)');
  });

  it('warns that dictated text may have misheard words', () => {
    expect(appNote({ now, day: '2026-10-17', today: '2026-10-17', logged: [], open: [], barcodes: [], dictated: true })).toContain('spoken and turned into text');
  });

  it('leaves room for many cards in one answer', () => {
    expect(requestParams('claude-opus-5-5', []).max_tokens).toBeGreaterThanOrEqual(32000);
  });
});

describe('requestParams', () => {
  it('uses server-side fallback where the model supports it', () => {
    expect(requestParams('claude-opus-5-5', []).fallbacks).toBe('default');
    expect(requestParams('claude-sonnet-5-5', []).betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(requestParams('claude-haiku-5-5', []).fallbacks).toBeUndefined();
  });
});

describe('packaged products (Open Food Facts lookup on)', () => {
  const giotto: Product = {
    id: 'OFF:4008400121925',
    schemaVersion: 1,
    source: 'OFF',
    code: '4008400121925',
    name: 'Giotto Haselnuss',
    brand: 'Ferrero',
    serving: { label: '3 balls (13 g)', grams: 13 },
    per100: { ENERCC: 632, FAT: 48, PROT625: 10.1 },
    categories: [],
    fetchedAt: 0,
  };
  const saved: Product = { ...giotto, id: 'OFF:8000500319475', code: '8000500319475', name: 'GiOTTO Haselnuss Stick', match: { version: '4.0', code: 'S450000' } };
  const lookups: string[] = [];
  const products = (): ProductTools => ({
    saved: new Map([[saved.id, saved]]),
    seen: new Map(),
    find: async (code): Promise<FindResult> => {
      lookups.push(code);
      return code === giotto.code ? { kind: 'found', product: giotto } : { kind: 'notFound' };
    },
  });

  it('looks up barcodes, checks digits and remembers what it found', async () => {
    const p = products();
    const r = await runLookupBarcode({ barcodes: ['4008400121925', '4008400121926', '4000000000013'] }, { ...ctx, products: p });
    expect(r.text).toContain('OFF:4008400121925 | Giotto Haselnuss · Ferrero | serving 3 balls (13 g) | label per 100 g: 632 kcal, protein 10.1 g, fat 48 g | no similar BLS food chosen yet');
    expect(r.text).toContain('4008400121926: not a valid barcode');
    expect(r.text).toContain('4000000000013: not in Open Food Facts');
    expect(lookups).toEqual(['4008400121925', '4000000000013']);
    expect(p.seen.has('OFF:4008400121925')).toBe(true);
    expect((await runLookupBarcode({ barcodes: ['1'] }, ctx)).ok).toBe(false);
  });

  it('passes the full error to the assistant and asks it to tell the user', async () => {
    const p: ProductTools = { ...products(), find: async (): Promise<FindResult> => ({ kind: 'error', reason: 'denied', detail: 'HTTP 403 from world.openfoodfacts.org/api/v3/product/4008400121925: "login required"' }) };
    const r = await runLookupBarcode({ barcodes: ['4008400121925'] }, { ...ctx, products: p });
    expect(r.text).toContain('Error: HTTP 403 from world.openfoodfacts.org/api/v3/product/4008400121925: "login required" Tell the user this error word for word');
  });

  it('does not fetch a product again that this chat already looked up', async () => {
    const p = products();
    lookups.length = 0;
    await runLookupBarcode({ barcodes: ['4008400121925'] }, { ...ctx, products: p });
    const again = await runLookupBarcode({ barcodes: ['4008400121925'] }, { ...ctx, products: p });
    expect(again.text).toContain('OFF:4008400121925 | Giotto Haselnuss');
    expect(lookups).toEqual(['4008400121925']);
  });

  it('lists saved products in food searches', () => {
    const r = runSearchFoods({ queries: ['giotto'] }, { ...ctx, products: products() });
    expect(r.text).toContain('OFF:8000500319475 | GiOTTO Haselnuss Stick · Ferrero');
    expect(r.text).toContain('micronutrients from S450000 Nougat (chosen by the user)');
  });

  it('needs a similar BLS food for a product, unless the user chose one', () => {
    const p = products();
    p.seen.set(giotto.id, giotto);
    const item = (code: string, micros_from: string) => ({ summary: 'Snack', items: [{ code, grams: 4.3, preparation: 'asListed', note: '1 ball', micros_from }], assumptions: [], confidence: 'B' });
    const missing = validateProposal(item('OFF:4008400121925', ''), db, p);
    expect(!missing.ok && missing.error).toContain('micros_from must be the BLS code');
    const ok = validateProposal(item('OFF:4008400121925', 'S450000'), db, p);
    expect(ok.ok && ok.proposal.items[0]!.product?.match?.code).toBe('S450000');
    expect(ok.ok && ok.proposal.items[0]!.food.per100.ENERCC).toBe(632);
    // The user's own choice wins over the assistant's.
    const kept = validateProposal(item('OFF:8000500319475', 'D7A5400'), db, p);
    expect(kept.ok && kept.proposal.items[0]!.product?.match?.code).toBe('S450000');
    const unknown = validateProposal(item('OFF:1234', 'S450000'), db, p);
    expect(!unknown.ok && unknown.error).toContain('Unknown product OFF:1234');
    // The app's own pick stands without micros_from, and gives way to the assistant's.
    p.seen.set(giotto.id, { ...giotto, match: { version: '4.0', code: 'S450000', auto: true } });
    const auto = validateProposal(item('OFF:4008400121925', ''), db, p);
    expect(auto.ok && auto.proposal.items[0]!.product?.match).toEqual({ version: '4.0', code: 'S450000', auto: true });
    const closer = validateProposal(item('OFF:4008400121925', 'D7A5400'), db, p);
    expect(closer.ok && closer.proposal.items[0]!.product?.match).toEqual({ version: '4.0', code: 'D7A5400' });
    // "Label values only" is the user's choice too.
    p.seen.set(giotto.id, { ...giotto, labelOnly: true });
    const labelOnly = validateProposal(item('OFF:4008400121925', 'S450000'), db, p);
    expect(labelOnly.ok && labelOnly.proposal.items[0]!.product).toMatchObject({ labelOnly: true });
    expect(labelOnly.ok && labelOnly.proposal.items[0]!.product?.match).toBeUndefined();
  });

  it('weighs counted pieces with the user\'s or the label\'s piece weight, else keeps the estimate', async () => {
    const p = products();
    p.seen.set(giotto.id, giotto);
    const meal = (code: string, pieces: number, grams: number) => ({ summary: 'Snack', items: [{ code, grams, preparation: 'asListed', note: '', micros_from: 'S450000', pieces }], assumptions: [], confidence: 'B' });
    // "3 balls (13 g)" on the label: one ball weighs 4.33 g, whatever grams the assistant wrote.
    const label = validateProposal(meal('OFF:4008400121925', 2, 0), db, p);
    expect(label.ok && label.proposal.items[0]).toMatchObject({ grams: 8.7, pieces: { n: 2, grams: 4.33, from: 'serving' } });
    // The user's own weight wins.
    const own = validateProposal(meal('OFF:4008400121925', 2, 0), db, p, undefined, new Map([['OFF:4008400121925', 4.5]]));
    expect(own.ok && own.proposal.items[0]).toMatchObject({ grams: 9, pieces: { n: 2, grams: 4.5, from: 'yours' } });
    // No weight known (a BLS food without one): the assistant's grams stand, marked as its estimate.
    const guess = validateProposal(meal('S450000', 2, 10), db, p);
    expect(guess.ok && guess.proposal.items[0]).toMatchObject({ grams: 10, pieces: { n: 2, grams: 5, from: 'estimate' } });
    const none = validateProposal(meal('S450000', 2, 0), db, p);
    expect(!none.ok && none.error).toContain('0 g is not plausible');
    // Not counted: grams as given, no pieces.
    const grams = validateProposal(meal('S450000', 0, 12), db, p);
    expect(grams.ok && grams.proposal.items[0]!.pieces).toBeUndefined();
    // The tools tell the assistant what one piece weighs.
    expect((await runLookupBarcode({ barcodes: ['4008400121925'] }, { ...ctx, products: p })).text).toContain('1 piece = 4.33 g (label serving "3 balls (13 g)")');
    expect(runSearchFoods({ queries: ['nougat'] }, { ...ctx, pieces: new Map([['S450000', 5]]) }).text).toContain("1 piece = 5 g (the user's own weight)");
    expect(runSearchFoods({ queries: ['nougat'] }, ctx).text).not.toContain('piece');
  });

  it('offers lookup_barcode only when the lookup is on, and passes barcodes read from photos', async () => {
    const api = scripted(
      reply([toolUse('t1', 'lookup_barcode', { barcodes: ['4008400121925'] })], 'tool_use'),
      reply([toolUse('t2', 'propose_meal', { summary: 'Giotto', items: [{ code: 'OFF:4008400121925', grams: 4.3, preparation: 'asListed', note: '', micros_from: 'S450000' }], assumptions: [], confidence: 'B' })], 'tool_use'),
    );
    const { outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'one ball', images: [], appNote: '(Barcodes the app read from the photos: 4008400121925)' }, { ...ctx, products: products() });
    expect(outcome.kind === 'proposal' && outcome.proposals[0]!.items[0]!.product?.code).toBe('4008400121925');
    expect(api.requests[0]!.tools!.map((t) => (t as { name: string }).name)).toEqual(['search_foods', 'search_products', 'lookup_barcode', 'propose_meal']);
    expect(JSON.stringify(api.requests[0]!.messages[0]!.content)).toContain('Barcodes the app read');
    expect(requestParams('claude-opus-5-5', []).tools!.map((t) => (t as { name: string }).name)).toEqual(['search_foods', 'propose_meal']);
  });

  it('finds a barcode by name in the bundled product list, then looks it up', async () => {
    const queries: string[] = [];
    const p: ProductTools = {
      ...products(),
      searchProducts: async (q) => {
        queries.push(q);
        return q === 'Giotto' ? [{ code: giotto.code, name: 'Giotto', brand: 'Ferrero', quantity: '38,7 g' }] : [];
      },
    };
    const r = await runSearchProducts({ queries: ['Giotto', 'Nothing here'] }, { ...ctx, products: p });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('4008400121925 | Giotto (Ferrero) | 38,7 g');
    expect(r.text).toContain('Products for "Nothing here" (barcode | name (brand) | pack size):\nNo matches.');
    expect(queries).toEqual(['Giotto', 'Nothing here']);
    expect((await runSearchProducts({ queries: ['x'] }, { ...ctx, products: products() })).ok).toBe(false);
    const failing: ProductTools = { ...products(), searchProducts: async () => Promise.reject(new Error('HTTP 404')) };
    const failed = await runSearchProducts({ queries: ['x'] }, { ...ctx, products: failing });
    expect(!failed.ok && failed.text).toContain('HTTP 404');

    const api = scripted(
      reply([toolUse('t1', 'search_products', { queries: ['Giotto'] })], 'tool_use'),
      reply([toolUse('t2', 'lookup_barcode', { barcodes: [giotto.code] })], 'tool_use'),
      reply([toolUse('t3', 'propose_meal', { summary: 'Giotto', items: [{ code: 'OFF:4008400121925', grams: 4.3, preparation: 'asListed', note: '', micros_from: 'S450000' }], assumptions: [], confidence: 'B' })], 'tool_use'),
    );
    const { outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'one Giotto ball', images: [] }, { ...ctx, products: p });
    expect(outcome.kind === 'proposal' && outcome.proposals[0]!.items[0]!.product?.code).toBe('4008400121925');
    expect(JSON.stringify(api.requests[1]!.messages)).toContain('Giotto (Ferrero)');
    expect(api.requests[0]!.system).toContain('search_products');
  });

  it('finds a barcode by name with web search, then looks it up; carries on after a paused search', async () => {
    const search = { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'Ferrero Giotto 38,7 g' } } as Beta.BetaServerToolUseBlock;
    const found = {
      type: 'web_search_tool_result',
      tool_use_id: 's1',
      content: [{ type: 'web_search_result', url: 'https://world.openfoodfacts.org/product/4008400121925/giotto-ferrero', title: 'Giotto - Ferrero - 38,7 g', encrypted_content: 'x', page_age: null }],
    } as unknown as Beta.BetaWebSearchToolResultBlock;
    const api = scripted(
      reply([search], 'pause_turn'),
      reply([found, toolUse('t1', 'lookup_barcode', { barcodes: ['4008400121925'] })], 'tool_use'),
      reply([toolUse('t2', 'propose_meal', { summary: 'Giotto', items: [{ code: 'OFF:4008400121925', grams: 4.3, preparation: 'asListed', note: '', micros_from: 'S450000' }], assumptions: [], confidence: 'B' })], 'tool_use'),
    );
    const { conversation, outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'one ball', images: [] }, { ...ctx, products: { ...products(), webSearch: true } });
    expect(outcome.kind === 'proposal' && outcome.proposals[0]!.items[0]!.product?.code).toBe('4008400121925');
    const tools = api.requests[0]!.tools!;
    expect(tools.map((t) => (t as { name: string }).name)).toEqual(['search_foods', 'search_products', 'lookup_barcode', 'web_search', 'propose_meal']);
    expect(tools[3]).toMatchObject({ type: 'web_search_20250305', allowed_domains: ['openfoodfacts.org'] });
    expect(api.requests[0]!.system).toContain('web_search');
    // After the pause the same conversation goes back unchanged, ending with the paused search.
    expect(api.requests[1]!.messages.at(-1)).toEqual({ role: 'assistant', content: [search] });
    // Search blocks stay in the history, so the next request can replay them.
    expect(JSON.stringify(conversation.messages)).toContain('web_search_tool_result');
  });

  it('offers web search only together with the lookup', () => {
    const names = (sources: Parameters<typeof requestParams>[2]) => requestParams('claude-opus-5-5', [], sources).tools!.map((t) => (t as { name: string }).name);
    expect(names({ off: true })).not.toContain('web_search');
    expect(names({ webSearch: true })).not.toContain('web_search');
    expect(names({ off: true, webSearch: true })).toContain('web_search');
    expect(requestParams('claude-opus-5-5', [], { webSearch: true }).system).not.toContain('web_search');
  });
});

describe('textOf', () => {
  it('joins text split by citations, and starts a new paragraph after a tool call', () => {
    const cited = { type: 'text', text: 'Giotto by Ferrero', citations: [] } as unknown as Beta.BetaTextBlock;
    expect(textOf([text('Found it: '), cited, text('.'), toolUse('t', 'search_foods', {}), text(' Which size? ')])).toBe('Found it: Giotto by Ferrero.\n\nWhich size?');
  });
});

describe('USDA FoodData Central (on)', () => {
  const kimchi: Product = {
    id: 'USDA:170392',
    schemaVersion: 1,
    source: 'USDA',
    usdaType: 'SR Legacy',
    code: '170392',
    name: 'Cabbage, kimchi',
    serving: { label: '1 cup', grams: 150 },
    per100: { ENERCC: 15, PROT625: 1.1, FAT: 0.5, CHO: 0.8, NA: 498 },
    categories: ['Vegetables and Vegetable Products', 'Cabbage'],
    fetchedAt: 0,
  };
  const paste: Product = { ...kimchi, id: 'USDA:2345678', code: '2345678', usdaType: 'Branded', name: 'Gochujang', brand: 'Bibigo', serving: undefined, categories: [] };
  const searches: string[] = [];
  const usda = (result: 'ok' | 'rateLimit' = 'ok'): ProductTools => ({
    saved: new Map(),
    seen: new Map(),
    searchUsda: async (q, kind) => {
      searches.push(`${q}:${kind}`);
      if (result === 'rateLimit') return { kind: 'error', reason: 'rateLimit' };
      return { kind: 'ok', products: kind === 'branded' ? [paste] : [kimchi] };
    },
  });

  it('searches USDA, describes the data type and remembers the results', async () => {
    const p = usda();
    const r = await runSearchUsda({ queries: ['kimchi', 'a', 'b', 'c'], branded: false }, { ...ctx, products: p });
    expect(r.text).toContain('USDA:170392 | Cabbage, kimchi | USDA SR Legacy, generic food with full nutrient data | serving 1 cup | per 100 g: 15 kcal, protein 1.1 g, fat 0.5 g, carbs 0.8 g | no similar BLS food chosen (optional)');
    expect(searches).toEqual(['kimchi:generic', 'a:generic', 'b:generic']);
    expect(p.seen.has('USDA:170392')).toBe(true);
    const b = await runSearchUsda({ queries: ['gochujang'], branded: true }, { ...ctx, products: p });
    expect(b.text).toContain('USDA branded product (US label)');
    expect((await runSearchUsda({ queries: ['x'], branded: false }, ctx)).ok).toBe(false);
  });

  it('stops after a rate limit and tells the model why', async () => {
    searches.length = 0;
    const r = await runSearchUsda({ queries: ['kimchi', 'tteok'], branded: false }, { ...ctx, products: usda('rateLimit') });
    expect(r.text).toContain('search limit');
    expect(searches).toEqual(['kimchi:generic']);
  });

  it('accepts generic USDA foods without micros_from, but not branded ones', () => {
    const p = usda();
    p.seen.set(kimchi.id, kimchi);
    p.seen.set(paste.id, paste);
    const item = (code: string, micros_from: string) => ({ summary: 'Side', items: [{ code, grams: 50, preparation: 'asListed', note: '', micros_from }], assumptions: [], confidence: 'C' });
    const generic = validateProposal(item('USDA:170392', ''), db, p);
    expect(generic.ok && generic.proposal.items[0]!.product?.match).toBeUndefined();
    expect(generic.ok && generic.proposal.items[0]!.food.provenance.NA).toBe('D');
    const filled = validateProposal(item('USDA:170392', 'S450000'), db, p);
    expect(filled.ok && filled.proposal.items[0]!.product?.match?.code).toBe('S450000');
    const brandedMissing = validateProposal(item('USDA:2345678', ''), db, p);
    expect(!brandedMissing.ok && brandedMissing.error).toContain('micros_from must be the BLS code');
    const wrong = validateProposal(item('USDA:170392', 'X1'), db, p);
    expect(!wrong.ok && wrong.error).toContain('X1 is not one');
  });

  it('offers search_usda only when USDA is on', async () => {
    const api = scripted(
      reply([toolUse('t1', 'search_usda', { queries: ['kimchi'], branded: false })], 'tool_use'),
      reply([toolUse('t2', 'propose_meal', { summary: 'Kimchi', items: [{ code: 'USDA:170392', grams: 50, preparation: 'asListed', note: '', micros_from: '' }], assumptions: [], confidence: 'C' })], 'tool_use'),
    );
    const { outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'some kimchi', images: [] }, { ...ctx, products: usda() });
    expect(outcome.kind === 'proposal' && outcome.proposals[0]!.items[0]!.product?.id).toBe('USDA:170392');
    expect(api.requests[0]!.tools!.map((t) => (t as { name: string }).name)).toEqual(['search_foods', 'search_usda', 'propose_meal']);
    expect(api.requests[0]!.system).toContain('search_usda');
    expect(requestParams('claude-opus-5-5', [], { off: true, usda: true }).tools!.map((t) => (t as { name: string }).name)).toEqual(['search_foods', 'search_products', 'lookup_barcode', 'search_usda', 'propose_meal']);
    // The same objects every time, so the prompt cache keeps working.
    expect(requestParams('claude-opus-5-5', [], { usda: true }).system).toBe(requestParams('claude-opus-5-5', [], { usda: true }).system);
  });
});

describe('journal entries', () => {
  const now = new Date(2026, 9, 17, 20, 0).getTime();
  const entry = (text: string, time = '', replaces = '') => ({ text, time, replaces });

  it('offers propose_journal_entry only with the journal on', () => {
    const names = (journal: boolean) => (requestParams('claude-opus-5-5', [], { journal }).tools ?? []).map((t) => ('name' in t ? t.name : ''));
    expect(names(false)).not.toContain('propose_journal_entry');
    expect(names(true)).toContain('propose_journal_entry');
    expect(String(requestParams('claude-opus-5-5', [], { journal: true }).system)).toContain('do not interpret');
    expect(String(requestParams('claude-opus-5-5', [], { journal: false }).system)).not.toContain('propose_journal_entry');
  });

  it('shows a journal card next to a meal card, and owes both results', async () => {
    const meal = { summary: 'Milk roll', items: [{ code: 'D7A5400', grams: 60, preparation: 'asListed', note: '' }], assumptions: [], confidence: 'C', time: '', replaces: '' };
    const api = scripted(reply([toolUse('m', 'propose_meal', meal), toolUse('j', 'propose_journal_entry', entry(' Tired after lunch. ', '2026-10-17 14:30'))], 'tool_use'));
    const { conversation, outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'a roll, then tired', images: [] }, { ...ctx, now, journal: true });
    expect(outcome.kind === 'proposal' && outcome.proposals.map((p) => p.id)).toEqual(['M1']);
    expect(outcome.kind === 'proposal' && outcome.notes).toEqual([{ id: 'J1', text: 'Tired after lunch.', time: new Date(2026, 9, 17, 14, 30).getTime() }]);
    expect(conversation.notes).toBe(1);
    expect(conversation.pendingResults.map((r) => r.content)).toEqual(['Shown to the user as card M1. Not logged yet; their reply follows.', 'Shown to the user as card J1. Not saved yet; their reply follows.']);
  });

  it('refuses journal entries when the journal is off', async () => {
    const api = scripted(reply([toolUse('j', 'propose_journal_entry', entry('Headache'))], 'tool_use'), reply([text('Ok.')], 'end_turn'));
    const { outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'headache', images: [] }, { ...ctx, now });
    expect(outcome.kind).toBe('reply');
    expect(String((api.requests[1]!.messages[2]!.content as Beta.BetaToolResultBlockParam[])[0]!.content)).toContain('Unknown tool');
  });

  it('checks journal entries: text, length and time', () => {
    expect(validateJournalProposal(entry('  '), now)).toMatchObject({ ok: false });
    expect(validateJournalProposal(entry('x'.repeat(5000)), now)).toMatchObject({ ok: false });
    expect(validateJournalProposal(entry('Slept badly', '2026-10-18 07:00'), now)).toMatchObject({ ok: false });
    expect(validateJournalProposal(entry('Slept badly', '', 'J2'), now)).toEqual({ ok: true, proposal: { text: 'Slept badly', replaces: 'J2' } });
  });
});

describe('sleep', () => {
  const now = new Date(2026, 9, 17, 20, 0).getTime();
  const sleep = (start: string, end: string, replaces = '') => ({ start, end, replaces });

  it('offers propose_sleep only with sleep on, and sends sleep quality to the journal', () => {
    const names = (on: boolean) => (requestParams('claude-opus-5-5', [], { sleep: on }).tools ?? []).map((t) => ('name' in t ? t.name : ''));
    expect(names(false)).not.toContain('propose_sleep');
    expect(names(true)).toContain('propose_sleep');
    expect(String(requestParams('claude-opus-5-5', [], { sleep: true, journal: true }).system)).toContain('goes in a journal entry');
    expect(String(requestParams('claude-opus-5-5', [], { sleep: true }).system)).not.toContain('journal entry');
  });

  it('shows a sleep card next to the others', async () => {
    const api = scripted(reply([toolUse('s', 'propose_sleep', sleep('2026-10-16 23:30', '2026-10-17 07:10')), toolUse('j', 'propose_journal_entry', { text: 'Woke up twice.', time: '2026-10-17 07:10', replaces: '' })], 'tool_use'));
    const { conversation, outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'slept 23:30 to 7:10, woke up twice', images: [] }, { ...ctx, now, journal: true, sleep: true });
    expect(outcome.kind === 'proposal' && outcome.sleeps).toEqual([{ id: 'S1', start: new Date(2026, 9, 16, 23, 30).getTime(), end: new Date(2026, 9, 17, 7, 10).getTime() }]);
    expect(outcome.kind === 'proposal' && outcome.notes.map((n) => n.id)).toEqual(['J1']);
    expect(conversation.sleeps).toBe(1);
  });

  it('checks sleeps: both times, waking after falling asleep, not in the future, not too long', () => {
    expect(validateSleepProposal(sleep('', '2026-10-17 07:00'), now)).toMatchObject({ ok: false });
    expect(validateSleepProposal(sleep('2026-10-17 23:30', '2026-10-17 07:00'), now)).toMatchObject({ ok: false });
    expect(validateSleepProposal(sleep('2026-10-17 23:30', '2026-10-18 07:00'), now)).toMatchObject({ ok: false });
    expect(validateSleepProposal(sleep('2026-10-15 23:30', '2026-10-17 07:00'), now)).toMatchObject({ ok: false });
    expect(validateSleepProposal(sleep('2026-10-17 14:00', '2026-10-17 14:40', 'S1'), now)).toEqual({
      ok: true,
      proposal: { start: new Date(2026, 9, 17, 14, 0).getTime(), end: new Date(2026, 9, 17, 14, 40).getTime(), replaces: 'S1' },
    });
  });
});

describe('activity', () => {
  const now = new Date(2026, 9, 17, 20, 0).getTime();
  const activity = (o: Partial<{ kind: string; name: string; start: string; minutes: number; intensity: string; outside: boolean; skin: string; replaces: string }> = {}) => ({
    kind: 'walk',
    name: '',
    start: '2026-10-17 12:30',
    minutes: 40,
    intensity: '',
    outside: true,
    skin: '',
    replaces: '',
    ...o,
  });

  it('offers propose_activity only with activity on, and keeps exercise out of the journal then', () => {
    const names = (on: boolean) => (requestParams('claude-opus-5-5', [], { activity: on }).tools ?? []).map((t) => ('name' in t ? t.name : ''));
    expect(names(false)).not.toContain('propose_activity');
    expect(names(true)).toContain('propose_activity');
    expect(String(requestParams('claude-opus-5-5', [], { journal: true }).system)).toContain('exercise,');
    expect(String(requestParams('claude-opus-5-5', [], { journal: true, activity: true }).system)).not.toContain('exercise,');
  });

  it('shows an activity card next to a meal', async () => {
    const api = scripted(reply([toolUse('a', 'propose_activity', activity({ kind: 'other', name: 'Football', minutes: 90, intensity: 'hard' }))], 'tool_use'));
    const { conversation, outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'played football for 90 minutes at half twelve', images: [] }, { ...ctx, now, activity: true });
    expect(outcome.kind === 'proposal' && outcome.activities).toEqual([
      { id: 'A1', kind: 'other', name: 'Football', start: new Date(2026, 9, 17, 12, 30).getTime(), minutes: 90, intensity: 'hard', outside: true },
    ]);
    expect(conversation.activities).toBe(1);
  });

  it('ignores propose_activity while activity is off', async () => {
    const api = scripted(reply([toolUse('a', 'propose_activity', activity())], 'tool_use'), reply([{ type: 'text', text: 'ok' } as Beta.BetaTextBlock], 'end_turn'));
    const { outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'walked', images: [] }, { ...ctx, now });
    expect(outcome.kind).toBe('reply');
  });

  it('checks activities: start time, minutes, and keeps skin only outside', () => {
    expect(validateActivityProposal(activity({ start: '' }), now)).toMatchObject({ ok: false });
    expect(validateActivityProposal(activity({ start: '2026-10-18 08:00' }), now)).toMatchObject({ ok: false });
    expect(validateActivityProposal(activity({ minutes: 0 }), now)).toMatchObject({ ok: false });
    expect(validateActivityProposal(activity({ minutes: 17 * 60 }), now)).toMatchObject({ ok: false });
    expect(validateActivityProposal(activity({ kind: 'swim' }), now)).toMatchObject({ ok: false });
    expect(validateActivityProposal(activity({ outside: false, skin: 'armsLegs', minutes: 44.6, replaces: 'A1' }), now)).toEqual({
      ok: true,
      proposal: { kind: 'walk', start: new Date(2026, 9, 17, 12, 30).getTime(), minutes: 45, outside: false, replaces: 'A1' },
    });
    expect(validateActivityProposal(activity({ skin: 'armsLegs' }), now)).toMatchObject({ ok: true, proposal: { skin: 'armsLegs' } });
  });
});

describe('water', () => {
  const now = new Date(2026, 9, 17, 20, 0).getTime();

  it('offers propose_water only with water on, and keeps other drinks in meals', () => {
    const names = (on: boolean) => (requestParams('claude-opus-5-5', [], { water: on }).tools ?? []).map((t) => ('name' in t ? t.name : ''));
    expect(names(false)).not.toContain('propose_water');
    expect(names(true)).toContain('propose_water');
    expect(String(requestParams('claude-opus-5-5', [], { water: true }).system)).toContain('Every other drink');
  });

  it('shows water cards next to the others', async () => {
    const api = scripted(reply([toolUse('w', 'propose_water', { ml: 500, time: '2026-10-17 10:00', replaces: '' }), toolUse('v', 'propose_water', { ml: 750, time: '', replaces: '' })], 'tool_use'));
    const { conversation, outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'half a litre at 10, then 750 ml', images: [] }, { ...ctx, now, water: true });
    expect(outcome.kind === 'proposal' && outcome.waters).toEqual([
      { id: 'W1', ml: 500, time: new Date(2026, 9, 17, 10, 0).getTime() },
      { id: 'W2', ml: 750 },
    ]);
    expect(conversation.waters).toBe(2);
  });

  it('checks water: an amount within one card, at a plausible time', () => {
    expect(validateWaterProposal({ ml: 0, time: '', replaces: '' }, now)).toMatchObject({ ok: false });
    expect(validateWaterProposal({ ml: 4000, time: '', replaces: '' }, now)).toMatchObject({ ok: false });
    expect(validateWaterProposal({ ml: 250, time: '2026-10-18 09:00', replaces: '' }, now)).toMatchObject({ ok: false });
    expect(validateWaterProposal({ ml: 249.6, time: '', replaces: 'W1' }, now)).toEqual({ ok: true, proposal: { ml: 250, replaces: 'W1' } });
  });
});

describe('ketones', () => {
  const now = new Date(2026, 9, 21, 20, 0).getTime();

  it('offers propose_ketone only with the ketosis estimate on, not strict, never in the recipe editor', () => {
    const tool = (sources: Parameters<typeof requestParams>[2]) => (requestParams('claude-opus-5-5', [], sources).tools ?? []).find((t) => 'name' in t && t.name === 'propose_ketone') as { strict?: boolean } | undefined;
    expect(tool({})).toBeUndefined();
    expect(tool({ ketones: true, recipe: true })).toBeUndefined();
    expect(tool({ ketones: true })!.strict).toBeUndefined();
    expect(String(requestParams('claude-opus-5-5', [], { ketones: true }).system)).toContain('never estimate or convert');
  });

  it('shows ketone cards next to the others', async () => {
    const api = scripted(reply([toolUse('k', 'propose_ketone', { type: 'blood', value: 1.2, time: '2026-10-21 08:00', replaces: '' }), toolUse('b', 'propose_ketone', { type: 'breath', value: 14, time: '', replaces: '' })], 'tool_use'));
    const { conversation, outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'ketones 1.2 this morning, breath 14 now', images: [] }, { ...ctx, now, ketones: true });
    expect(outcome.kind === 'proposal' && outcome.ketones).toEqual([
      { id: 'K1', type: 'blood', value: 1.2, time: new Date(2026, 9, 21, 8, 0).getTime() },
      { id: 'K2', type: 'breath', value: 14 },
    ]);
    expect(conversation.ketones).toBe(2);
  });

  it('checks a measurement: a value in the method\'s unit, at a plausible time', () => {
    expect(validateKetoneProposal({ type: 'blood', value: -1, time: '', replaces: '' }, now)).toMatchObject({ ok: false });
    // 20 mmol/L blood is a unit mix-up (mg/dL), sent back to check.
    expect(validateKetoneProposal({ type: 'blood', value: 20, time: '', replaces: '' }, now)).toMatchObject({ ok: false });
    expect(validateKetoneProposal({ type: 'urine', value: 4, time: '2026-10-22 09:00', replaces: '' }, now)).toMatchObject({ ok: false });
    expect(validateKetoneProposal({ type: 'breath', value: 30, time: '', replaces: 'K1' }, now)).toEqual({ ok: true, proposal: { type: 'breath', value: 30, replaces: 'K1' } });
  });
});

describe('weight', () => {
  const now = new Date(2026, 9, 23, 9, 0).getTime();

  it('offers propose_weight only with Weight on, not strict, never in the recipe editor', () => {
    const tool = (sources: Parameters<typeof requestParams>[2]) => (requestParams('claude-opus-5-5', [], sources).tools ?? []).find((t) => 'name' in t && t.name === 'propose_weight') as { strict?: boolean } | undefined;
    expect(tool({})).toBeUndefined();
    expect(tool({ weight: true, recipe: true })).toBeUndefined();
    expect(tool({ weight: true })!.strict).toBeUndefined();
    expect(String(requestParams('claude-opus-5-5', [], { weight: true }).system)).toContain('do not comment on the weight itself');
  });

  it('shows weight cards next to the others', async () => {
    const api = scripted(reply([toolUse('g', 'propose_weight', { kg: 82.44, day: '2026-10-22', replaces: '' }), toolUse('h', 'propose_weight', { kg: 82, day: '', replaces: '' })], 'tool_use'));
    const { conversation, outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: '82.4 yesterday, 82 today', images: [] }, { ...ctx, now, weight: true });
    expect(outcome.kind === 'proposal' && outcome.weights).toEqual([
      { id: 'G1', kg: 82.4, day: '2026-10-22' },
      { id: 'G2', kg: 82 },
    ]);
    expect(conversation.weights).toBe(2);
  });

  it('checks a weigh-in: kg in a plausible range, a day not in the future', () => {
    expect(validateWeightProposal({ kg: 180, day: '', replaces: '' }, now)).toMatchObject({ ok: true });
    // 180 lb sent as kg would pass, but 900 is surely pounds or grams.
    expect(validateWeightProposal({ kg: 900, day: '', replaces: '' }, now)).toMatchObject({ ok: false });
    expect(validateWeightProposal({ kg: 80, day: '2026-10-24', replaces: '' }, now)).toMatchObject({ ok: false });
    expect(validateWeightProposal({ kg: 80, day: '23.10.2026', replaces: '' }, now)).toMatchObject({ ok: false });
    expect(validateWeightProposal({ kg: 80, day: '2026-10-23', replaces: 'G1' }, now)).toEqual({ ok: true, proposal: { kg: 80, day: '2026-10-23', replaces: 'G1' } });
  });
});

describe('shopping list', () => {
  const book = [{ id: 'r1', name: 'Lentil curry', portions: 4 }];

  it('offers propose_shopping only with the list on, not strict, with recipes only beside the recipe book', () => {
    const tool = (sources: Parameters<typeof requestParams>[2]) => (requestParams('claude-opus-5-5', [], sources).tools ?? []).find((t) => 'name' in t && t.name === 'propose_shopping') as { strict?: boolean; input_schema: { properties: object } } | undefined;
    expect(tool({})).toBeUndefined();
    expect(tool({ shopping: true, recipe: true })).toBeUndefined();
    expect(tool({ shopping: true })!.strict).toBeUndefined();
    expect(Object.keys(tool({ shopping: true })!.input_schema.properties)).toEqual(['items', 'replaces']);
    expect(Object.keys(tool({ shopping: true, recipes: true })!.input_schema.properties)).toEqual(['items', 'recipes', 'replaces']);
  });

  it('shows a shopping card', async () => {
    const api = scripted(reply([toolUse('s', 'propose_shopping', { items: [{ name: 'Milk', amount: '2 l' }, { name: 'Eggs' }] })], 'tool_use'));
    const { conversation, outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'put milk and eggs on the list', images: [] }, { ...ctx, shopping: true });
    expect(outcome.kind === 'proposal' && outcome.shopping).toEqual([{ id: 'L1', items: [{ name: 'Milk', amount: '2 l' }, { name: 'Eggs' }], recipes: [] }]);
    expect(conversation.lists).toBe(1);
  });

  it('checks the recipes and that there is something to buy', () => {
    expect(validateShoppingProposal({ items: [] }, book)).toMatchObject({ ok: false });
    expect(validateShoppingProposal({ items: [{ name: ' ' }] }, book)).toMatchObject({ ok: false });
    expect(validateShoppingProposal({ items: [], recipes: [{ recipe_id: 'nope' }] }, book)).toMatchObject({ ok: false, error: expect.stringContaining('list_recipes') });
    expect(validateShoppingProposal({ items: [{ name: 'Rice', amount: '' }], recipes: [{ recipe_id: 'r1', portions: 0 }, { recipe_id: 'r1', portions: 6.4 }], replaces: 'L1' }, book)).toEqual({
      ok: true,
      proposal: { items: [{ name: 'Rice' }], recipes: [{ recipeId: 'r1', name: 'Lentil curry', portions: 4 }, { recipeId: 'r1', name: 'Lentil curry', portions: 6 }], replaces: 'L1' },
    });
  });
});

describe('at home', () => {
  it('offers propose_home only with At home on, not strict', () => {
    const tool = (sources: Parameters<typeof requestParams>[2]) => (requestParams('claude-opus-5-5', [], sources).tools ?? []).find((t) => 'name' in t && t.name === 'propose_home') as { strict?: boolean } | undefined;
    expect(tool({})).toBeUndefined();
    expect(tool({ pantry: true, recipe: true })).toBeUndefined();
    expect(tool({ pantry: true })!.strict).toBeUndefined();
  });

  it('shows an At home card', async () => {
    const api = scripted(reply([toolUse('h', 'propose_home', { items: [{ name: 'Nougat', code: 'S450000', amount: '2', status: 'bought' }, { name: 'Cumin', status: 'low' }] })], 'tool_use'));
    const { conversation, outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'bought two nougat bars, cumin is running low', images: [] }, { ...ctx, pantry: new Set() });
    expect(outcome.kind === 'proposal' && outcome.homes).toEqual([
      {
        id: 'H1',
        items: [
          { name: 'Nougat', ref: { source: 'BLS', version: '4.0', code: 'S450000' }, pieces: 2, status: 'bought' },
          { name: 'Cumin', status: 'low' },
        ],
      },
    ]);
    expect(conversation.homes).toBe(1);
  });

  it('checks codes, places and statuses', () => {
    expect(validateHomeProposal({ items: [] }, db)).toMatchObject({ ok: false });
    expect(validateHomeProposal({ items: [{ name: 'X', code: 'NOPE' }] }, db)).toMatchObject({ ok: false, error: expect.stringContaining('unknown code') });
    expect(validateHomeProposal({ items: [{ name: 'X', place: 'garage' }] }, db)).toMatchObject({ ok: false, error: expect.stringContaining('place') });
    expect(validateHomeProposal({ items: [{ name: 'X', status: 'gone' }] }, db)).toMatchObject({ ok: false, error: expect.stringContaining('status') });
    expect(validateHomeProposal({ items: [{ name: ' Oats ', amount: '500 g', place: 'cupboard', status: 'used_up' }], replaces: 'H1' }, db)).toEqual({
      ok: true,
      proposal: { items: [{ name: 'Oats', grams: 500, place: 'cupboard', status: 'out' }], replaces: 'H1' },
    });
  });

  it('takes a counted amount as what is left, and needs the amount for it', () => {
    expect(validateHomeProposal({ items: [{ name: 'Paprika', amount: '8,5 g', status: 'left' }] }, db)).toEqual({ ok: true, proposal: { items: [{ name: 'Paprika', grams: 8.5, status: 'left' }] } });
    expect(validateHomeProposal({ items: [{ name: 'Paprika', status: 'left' }] }, db)).toMatchObject({ ok: false, error: expect.stringContaining('needs the amount') });
  });

  it('marks foods at home in search results', () => {
    const r = runSearchFoods({ queries: ['Nougat'] }, { ...ctx, pantry: new Set(['BLS:S450000']) });
    expect(r.text).toContain('[at home]');
    expect(runSearchFoods({ queries: ['Nougat'] }, ctx).text).not.toContain('[at home]');
  });
});

describe('the recipe editor assistant', () => {
  const ingredients = (over: object = {}) => ({ name: 'Milk roll dough', portions: 6, items: [{ code: 'D7A5400', grams: 1200, preparation: 'baked', note: '' }], assumptions: ['6 rolls ≈ 1.2 kg'], replaces: '', ...over });
  const recipeCtx: ToolContext = { ...ctx, recipe: true, journal: true, sleep: true };

  it('offers the lookups and propose_ingredients, never meals or the trackers', () => {
    const names = (sources: Parameters<typeof requestParams>[2]) => requestParams('claude-opus-5-5', [], sources).tools!.map((t) => (t as { name: string }).name);
    expect(names({ recipe: true, journal: true, water: true })).toEqual(['search_foods', 'propose_ingredients']);
    expect(names({ recipe: true, off: true, usda: true, webSearch: true })).toEqual(['search_foods', 'search_products', 'lookup_barcode', 'web_search', 'search_usda', 'propose_ingredients']);
    const system = requestParams('claude-opus-5-5', [], { recipe: true, off: true, usda: true }).system as string;
    expect(system).toContain('enter a recipe');
    expect(system).toContain('code in propose_ingredients');
    expect(system).not.toContain('propose_meal');
  });

  it('shows proposed ingredients as numbered R cards, and refuses meals', async () => {
    const api = scripted(
      reply([toolUse('a', 'propose_meal', { summary: 'x', items: [{ code: 'D7A5400', grams: 60, preparation: 'asListed', note: '' }], assumptions: [], confidence: 'C', time: '', replaces: '' })], 'tool_use'),
      reply([text('Here is the list.'), toolUse('b', 'propose_ingredients', ingredients())], 'tool_use'),
    );
    const { outcome, conversation } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'my rolls', images: [] }, recipeCtx);
    const refused = (api.requests[1]!.messages[2]!.content as Beta.BetaToolResultBlockParam[])[0]!;
    expect(refused.is_error && String(refused.content)).toContain('Unknown tool propose_meal');
    expect(outcome.kind === 'proposal' && outcome.ingredients.map((r) => [r.id, r.name, r.portions, r.items[0]!.grams, r.items[0]!.preparation])).toEqual([['R1', 'Milk roll dough', 6, 1200, 'baked']]);
    expect(conversation.recipes).toBe(1);
    expect(conversation.pendingResults.map((r) => r.content)).toEqual(['Shown to the user as card R1. Not added to the recipe yet; their reply follows.']);
  });

  it('allows a whole pot but checks amounts and portions', () => {
    const v = (over: object) => validateIngredientsProposal(ingredients(over), db);
    expect(v({ items: [{ code: 'D7A5400', grams: MAX_ITEM_GRAMS + 500, preparation: 'raw', note: '' }] }).ok).toBe(true);
    expect(!v({ items: [{ code: 'D7A5400', grams: MAX_INGREDIENT_GRAMS + 1, preparation: 'raw', note: '' }] }).ok).toBe(true);
    expect(!v({ portions: 2.5 }).ok && (v({ portions: 2.5 }) as { error: string }).error).toContain('portions 2.5');
    const unknown = v({ portions: 0, name: ' ' });
    expect(unknown.ok && unknown.proposal).not.toHaveProperty('portions');
    expect(unknown.ok && unknown.proposal.name).toBe('');
    expect(!v({ items: [{ code: 'X1', grams: 10, preparation: 'raw', note: '' }] }).ok).toBe(true);
  });

  it('takes preparation steps, alone or with ingredients, but never an empty card', () => {
    const v = (over: object) => validateIngredientsProposal(ingredients(over), db);
    const steps = v({ items: [], instructions: ' 1. Fry the onions.\n2. Simmer. ' });
    expect(steps.ok && [steps.proposal.items.length, steps.proposal.instructions]).toEqual([0, '1. Fry the onions.\n2. Simmer.']);
    const none = v({ instructions: '' });
    expect(none.ok && none.proposal).not.toHaveProperty('instructions');
    expect(!v({ items: [], instructions: '' }).ok && (v({ items: [], instructions: '' }) as { error: string }).error).toContain('items is empty');
    expect(requestParams('claude-opus-5-5', [], { recipe: true }).system).toContain('Preparation steps');
  });

  it('tells the assistant what the recipe already has, instead of the day', () => {
    const now = new Date(2026, 9, 18, 10, 0).getTime();
    expect(appNote({ now, day: '2026-10-17', today: '2026-10-18', logged: ['R1'], open: [], barcodes: [], recipe: { name: 'Dal', portions: 4, ingredients: ['Lentils, dried 250 g, boiled'] } })).toBe(
      '(Now: Sun 2026-10-18 10:00. The recipe in the editor: name "Dal", 4 portions; ingredients: Lentils, dried 250 g, boiled; no steps yet. Cards already added to the recipe: R1.)',
    );
    expect(appNote({ now, day: '2026-10-18', today: '2026-10-18', logged: [], open: [], barcodes: [], recipe: { name: 'Dal', ingredients: [], instructions: '1. Fry the onions.\n2. Add lentils.' } })).toContain(
      'no ingredients yet; steps:\n1. Fry the onions.\n2. Add lentils.\n',
    );
    expect(appNote({ now, day: '2026-10-18', today: '2026-10-18', logged: [], open: [], barcodes: [], recipe: { name: '', ingredients: [] } })).toContain('no name yet, portions not set; no ingredients yet');
  });
});

describe('recipes in the main chat', () => {
  const curry = {
    id: 'rec1',
    name: 'Nougat rolls',
    portions: 6,
    ingredients: [{ ref: { source: 'BLS' as const, version: '4.0', code: 'D7A5400' }, name: 'Milk roll', grams: 600, preparation: 'baked' as const }],
    instructions: 'Bake.',
    cookedLately: 2,
    inStock: 3,
    potGrams: 1200,
    stock: [
      {
        id: 'bat1',
        cookedDay: '2026-10-10',
        portions: 6,
        left: { fresh: 0, fridge: 1, freezer: 2 },
        cookedGrams: 900,
        ingredients: [{ ref: { source: 'BLS' as const, version: '4.0', code: 'D7A5400' }, name: 'Milk roll', grams: 600, preparation: 'baked' as const }],
        changed: false,
      },
      { id: 'bat2', cookedDay: '2026-10-12', portions: 8, left: { fresh: 0, fridge: 0, freezer: 1 }, ingredients: [], changed: false },
    ],
  };
  const checked: Array<[number, number]> = [];
  const recipes = (ideas: boolean): ToolContext['recipes'] => ({
    list: [curry],
    nameOf: (ing) => ing.name,
    ...(ideas
      ? {
          ideas: {
            gaps: () => 'Low: Iron.',
            check: (items: readonly { grams: number }[], portions: number) => {
              checked.push([items.length, portions]);
              return `checked ${items.length} items, ${portions} portions`;
            },
            checkSaved: (id: string) => (id === 'rec1' ? 'checked 1 items, 6 portions' : undefined),
            exclusions: { groups: [], foods: ['S450000'] },
          },
        }
      : {}),
  });
  const recipe = (over: object = {}) => ({
    kind: 'own',
    name: 'Nougat rolls',
    portions: 6,
    items: [
      { code: 'D7A5400', grams: 600, preparation: 'baked', note: '' },
      { code: 'S450000', grams: 100, preparation: 'asListed', note: '' },
    ],
    assumptions: [],
    instructions: '',
    reason: '',
    recipe_id: '',
    replaces: '',
    ...over,
  });

  it('offers list_recipes and propose_recipe, and the idea tools only with recipe ideas on', () => {
    const names = (sources: Parameters<typeof requestParams>[2]) => requestParams('claude-opus-5-5', [], sources).tools!.map((t) => (t as { name: string }).name);
    expect(names({ recipes: true })).toEqual(['search_foods', 'propose_meal', 'list_recipes', 'propose_recipe', 'propose_portion', 'propose_batch']);
    expect(names({ recipes: true, ideas: true })).toEqual(['search_foods', 'propose_meal', 'list_recipes', 'propose_recipe', 'propose_portion', 'propose_batch', 'nutrient_gaps', 'check_recipe']);
    expect(names({})).toEqual(['search_foods', 'propose_meal']);
    const off = requestParams('claude-opus-5-5', [], { recipes: true }).system as string;
    expect(off).toContain('Recipe ideas are turned off');
    expect(off).toContain('Several parts');
    const on = requestParams('claude-opus-5-5', [], { recipes: true, ideas: true }).system as string;
    expect(on).toContain('call check_recipe');
    expect(on).not.toContain('Recipe ideas are turned off');
  });

  it('lists the recipe book with ids, codes, how often cooked and stock', () => {
    const r = runListRecipes({ query: 'nougat' }, { ...ctx, recipes: recipes(false) });
    expect(r.text).toContain('recipe_id rec1 | Nougat rolls | 6 portions | cooked 2× in the last 60 days | 3 portions in stock');
    expect(r.text).toContain('D7A5400 Milk roll 600 g, baked');
    expect(r.text).toContain('Steps:\nBake.');
    expect(r.text).toContain('Empty pot (remembered): 1200 g');
    expect(r.text).toContain('- batch_id bat1 | cooked 2026-10-10 | 6 portions | 1 in the fridge, 2 in the freezer | cooked food 900 g, about 150 g a portion');
    expect(r.text).toContain('- batch_id bat2 | cooked 2026-10-12 | 8 portions | 1 in the freezer | not weighed');
    expect(runListRecipes({ query: 'soup' }, { ...ctx, recipes: recipes(false) }).text).toContain('No recipe matches "soup". The book has: Nougat rolls.');
    expect(runListRecipes({ query: '' }, ctx).ok).toBe(false);
  });

  it('checks a recipe with the app, given or saved', () => {
    checked.length = 0;
    const c = { ...ctx, recipes: recipes(true) };
    expect(runCheckRecipe({ portions: 4, items: recipe().items, recipe_id: '' }, c).text).toBe('checked 2 items, 4 portions');
    expect(runCheckRecipe({ portions: 0, items: [], recipe_id: 'rec1' }, c).text).toBe('Nougat rolls as saved:\nchecked 1 items, 6 portions');
    expect(runCheckRecipe({ portions: 2.5, items: recipe().items, recipe_id: '' }, c).ok).toBe(false);
    expect(runCheckRecipe({ portions: 4, items: recipe().items, recipe_id: '' }, { ...ctx, recipes: recipes(false) }).ok).toBe(false);
  });

  it('checks proposed recipes: own ones freely, ideas need a reason and no excluded food', () => {
    const own = validateRecipeProposal(recipe(), { ...ctx, recipes: recipes(true) });
    expect(own.ok && [own.proposal.kind, own.proposal.items.length, own.proposal]).toEqual(['own', 2, expect.not.objectContaining({ recipeId: expect.anything() })]);
    const idea = validateRecipeProposal(recipe({ kind: 'idea' }), { ...ctx, recipes: recipes(true) });
    expect(!idea.ok && idea.error).toContain('reason is empty');
    expect(!idea.ok && idea.error).toContain('excluded these foods: Nougat');
    const ok = validateRecipeProposal(recipe({ kind: 'idea', reason: 'Iron is low; one portion gives 30 %.', items: [recipe().items[0]] }), { ...ctx, recipes: recipes(true) });
    expect(ok.ok && ok.proposal.reason).toBe('Iron is low; one portion gives 30 %.');
    const ideasOff = validateRecipeProposal(recipe({ kind: 'idea', reason: 'x' }), { ...ctx, recipes: recipes(false) });
    expect(!ideasOff.ok && ideasOff.error).toContain('recipe ideas, which are turned off');
    expect(!validateRecipeProposal(recipe({ recipe_id: 'nope' }), { ...ctx, recipes: recipes(false) }).ok).toBe(true);
    const change = validateRecipeProposal(recipe({ recipe_id: 'rec1' }), { ...ctx, recipes: recipes(false) });
    expect(change.ok && change.proposal.recipeId).toBe('rec1');
    expect(!validateRecipeProposal(recipe({ portions: 0 }), { ...ctx, recipes: recipes(false) }).ok).toBe(true);
    expect(!validateRecipeProposal(recipe({ name: ' ' }), { ...ctx, recipes: recipes(false) }).ok).toBe(true);
  });

  const portion = (over: object = {}) => ({ batch_id: 'bat1', portions: 1, grams: 0, changes: [], assumptions: [], time: '', replaces: '', ...over });
  const cookAgain = (over: object = {}) => ({
    recipe_id: 'rec1',
    day: '',
    usual_plan: true,
    fresh: 0,
    fridge: 0,
    pot_grams: 0,
    food_grams: 0,
    changes: [],
    ate_portions: 0,
    ate_grams: 0,
    ate_time: '',
    assumptions: [],
    replaces: '',
    ...over,
  });

  it('checks servings from stock: a known batch, grams only for a weighed pot, enough left, changes to what the pot has', () => {
    const c = { ...ctx, recipes: recipes(false) };
    const one = validatePortionProposal(portion(), c);
    expect(one.ok && [one.proposal.batchId, one.proposal.name, one.proposal.portions, one.proposal.grams]).toEqual(['bat1', 'Nougat rolls', 1, undefined]);
    const byWeight = validatePortionProposal(portion({ portions: 0, grams: 180.4 }), c);
    expect(byWeight.ok && [byWeight.proposal.portions, byWeight.proposal.grams]).toEqual([0, 180]);
    expect(!validatePortionProposal(portion({ batch_id: 'bat2', portions: 0, grams: 200 }), c).ok && 'rejected').toBe('rejected');
    const tooMany = validatePortionProposal(portion({ portions: 4 }), c);
    expect(!tooMany.ok && tooMany.error).toContain('only 3 left');
    expect(!validatePortionProposal(portion({ batch_id: 'nope' }), c).ok).toBe(true);
    const swap = validatePortionProposal(portion({ changes: [{ replaces: 'D7A5400', code: 'S450000', grams: 50, preparation: 'asListed', micros_from: '' }, { replaces: '', code: 'S450000', grams: 10, preparation: 'asListed', micros_from: '' }] }), c);
    expect(swap.ok && swap.proposal.changes.map((ch) => [ch.replaces, ch.item?.food.code, ch.item?.grams])).toEqual([
      ['BLS:D7A5400', 'S450000', 50],
      [undefined, 'S450000', 10],
    ]);
    const out = validatePortionProposal(portion({ changes: [{ replaces: 'D7A5400', code: '', grams: 0, preparation: 'asListed', micros_from: '' }] }), c);
    expect(out.ok && out.proposal.changes).toEqual([{ replaces: 'BLS:D7A5400' }]);
    const notInPot = validatePortionProposal(portion({ changes: [{ replaces: 'S450000', code: '', grams: 0, preparation: 'asListed', micros_from: '' }] }), c);
    expect(!notInPot.ok && notInPot.error).toContain('S450000 is not an ingredient of this pot');
  });

  it('checks a cooked batch: a recipe in the book, a plan within its portions, one pot weight, eaten grams only when weighed', () => {
    const now = new Date(2026, 9, 18, 20, 0).getTime();
    const c = { ...ctx, now, recipes: recipes(false) };
    const usual = validateBatchProposal(cookAgain({ pot_grams: 3150 }), c);
    expect(usual.ok && usual.proposal).toEqual({ recipeId: 'rec1', name: 'Nougat rolls', potGrams: 3150, changes: [], assumptions: [] });
    const planned = validateBatchProposal(cookAgain({ usual_plan: false, fresh: 1, fridge: 2, day: '2026-10-17', ate_portions: 1, ate_time: '2026-10-17 19:30' }), c);
    expect(planned.ok && [planned.proposal.plan, planned.proposal.day, planned.proposal.ate?.portions]).toEqual([{ fresh: 1, fridge: 2 }, '2026-10-17', 1]);
    expect(!validateBatchProposal(cookAgain({ usual_plan: false, fresh: 4, fridge: 3 }), c).ok).toBe(true);
    expect(!validateBatchProposal(cookAgain({ pot_grams: 3000, food_grams: 1800 }), c).ok).toBe(true);
    const grams = validateBatchProposal(cookAgain({ ate_grams: 400 }), c);
    expect(!grams.ok && grams.error).toContain('ate_grams needs the pot weighed');
    expect(!validateBatchProposal(cookAgain({ day: '2026-11-30' }), c).ok).toBe(true);
    expect(!validateBatchProposal(cookAgain({ recipe_id: 'x' }), c).ok).toBe(true);
    const tofu = validateBatchProposal(cookAgain({ changes: [{ replaces: 'D7A5400', code: 'S450000', grams: 500, preparation: 'asListed', micros_from: '' }] }), c);
    expect(tofu.ok && tofu.proposal.changes[0]?.replaces).toBe('BLS:D7A5400');
    // A bigger pot: more portions, and a plan and a serving within them.
    const bigger = validateBatchProposal(cookAgain({ portions: 8, usual_plan: false, fresh: 1, fridge: 6, ate_portions: 7 }), c);
    expect(bigger.ok && bigger.proposal.portions).toBe(8);
    expect(validateBatchProposal(cookAgain({ portions: 6 }), c).ok && 'same as the recipe').toBe('same as the recipe');
    expect(!validateBatchProposal(cookAgain({ portions: 2.5 }), c).ok).toBe(true);
  });

  it('changes a pot already cooked: a batch in stock, its weight, portions and ingredients, nothing eaten', () => {
    const c = { ...ctx, recipes: recipes(false) };
    const pot = validateBatchProposal(cookAgain({ batch_id: 'bat1', portions: 7, changes: [{ replaces: 'D7A5400', code: 'D7A5400', grams: 666, preparation: 'baked', micros_from: '' }] }), c);
    expect(pot.ok && [pot.proposal.batchId, pot.proposal.recipeId, pot.proposal.portions, pot.proposal.changes[0]?.item?.grams]).toEqual(['bat1', 'rec1', 7, 666]);
    expect(pot.ok && pot.proposal.plan).toBeUndefined();
    const nothing = validateBatchProposal(cookAgain({ batch_id: 'bat1', portions: 6 }), c);
    expect(!nothing.ok && nothing.error).toContain('Nothing to change');
    const ate = validateBatchProposal(cookAgain({ batch_id: 'bat1', food_grams: 950, ate_portions: 1 }), c);
    expect(!ate.ok && ate.error).toContain('call propose_portion');
    expect(!validateBatchProposal(cookAgain({ batch_id: 'nope', food_grams: 950 }), c).ok).toBe(true);
    const notInPot = validateBatchProposal(cookAgain({ batch_id: 'bat2', changes: [{ replaces: 'D7A5400', code: '', grams: 0, preparation: 'asListed', micros_from: '' }] }), c);
    expect(!notInPot.ok && notInPot.error).toContain('not an ingredient of this pot');
  });

  it('shows a serving from stock and a cooked batch as P and B cards', async () => {
    const api = scripted(reply([toolUse('a', 'propose_batch', cookAgain()), toolUse('b', 'propose_portion', portion())], 'tool_use'));
    const { outcome, conversation } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'cooked rolls again; had one from the fridge', images: [] }, { ...ctx, recipes: recipes(false) });
    expect(outcome.kind === 'proposal' && [outcome.batches.map((b) => b.id), outcome.portions.map((p) => p.id), outcome.order]).toEqual([['B1'], ['P1'], ['B1', 'P1']]);
    expect(conversation.portions).toBe(1);
    expect(conversation.batches).toBe(1);
  });

  it('shows a recipe and a meal from one message together, numbered R and M', async () => {
    const api = scripted(
      reply(
        [
          text('Saved the pot as a recipe, and your bowl as a meal.'),
          toolUse('a', 'propose_recipe', recipe({ items: [recipe().items[0]] })),
          toolUse('b', 'propose_meal', { summary: 'Rolls', items: [{ code: 'D7A5400', grams: 100, preparation: 'asListed', note: '' }], assumptions: [], confidence: 'C', time: '', replaces: '' }),
        ],
        'tool_use',
      ),
    );
    const { outcome, conversation } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'baked rolls, ate one', images: [] }, { ...ctx, recipes: recipes(false) });
    expect(outcome.kind === 'proposal' && [outcome.recipes.map((r) => r.id), outcome.proposals.map((p) => p.id)]).toEqual([['R1'], ['M1']]);
    expect(conversation.pendingResults.map((r) => r.content)).toContain('Shown to the user as card R1. Not saved yet; their reply follows.');
  });
});

describe('forgotten foods (docs/SPEC.md)', () => {
  const oil = food('Q100000', 'Rapeseed oil', 'Rapsöl', 884);
  const cola = food('N310000', 'Cola', 'Cola', 42);
  const withFoods = { byCode: new Map([...foods, oil, cola].map((f) => [f.code, f])), groups: {} };
  const meal = (codes: string[], ask: string[]) => ({ summary: 'Dinner', items: codes.map((code) => ({ code, grams: 100, preparation: 'asListed', note: '' })), assumptions: [], confidence: 'C', ask_about: ask });

  it('keeps what the assistant asks about, at most three, without what the meal already has', () => {
    const r = validateProposal(meal(['D7A5400'], ['spread', 'drink', 'spread', 'sauce', 'cooking_fat']), withFoods);
    expect(r.ok && r.proposal.askAbout).toEqual(['spread', 'drink', 'sauce']);
    const fat = validateProposal(meal(['D7A5400', 'Q100000', 'N310000'], ['spread', 'cooking_fat', 'drink', 'sauce']), withFoods);
    expect(fat.ok && fat.proposal.askAbout).toEqual(['sauce']);
  });

  it('asks nothing when none was given, and old chats without the field still load', () => {
    const r = validateProposal(meal(['D7A5400'], []), withFoods);
    expect(r.ok && r.proposal).not.toHaveProperty('askAbout');
    const { ask_about: _, ...old } = meal(['D7A5400'], []);
    expect(validateProposal(old, withFoods).ok).toBe(true);
    expect(validateProposal(meal(['D7A5400'], ['dessert']), withFoods).ok).toBe(false);
  });

  it('offers ask_about only with the switch on, and keeps the strict grammar small', () => {
    const meal = (sources: Parameters<typeof requestParams>[2]) =>
      (requestParams('claude-opus-5-5', [], sources).tools ?? []).find((t) => 'name' in t && t.name === 'propose_meal') as { input_schema: { properties: object; required: string[] } };
    expect(meal({}).input_schema.properties).not.toHaveProperty('ask_about');
    expect(meal({ forgotten: true }).input_schema.properties).toHaveProperty('ask_about');
    expect(meal({ forgotten: true }).input_schema.required).toContain('ask_about');
    expect(JSON.stringify(requestParams('claude-opus-5-5', [], { forgotten: true }).system)).toContain('ask_about');
    expect(JSON.stringify(requestParams('claude-opus-5-5', [], {}).system)).not.toContain('ask_about');
  });
});
