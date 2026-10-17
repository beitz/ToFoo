import { describe, expect, it } from 'vitest';
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { Food } from '../foods/foodDb';
import { buildIndex } from '../foods/search';
import { appNote, emptyConversation, requestParams, sendMessage, textOf, type CreateMessage } from './assistant';
import { describeFood, MAX_ITEM_GRAMS, runLookupBarcode, runSearchFoods, runSearchUsda, validateProposal, type ProductTools, type ToolContext } from './tools';
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
    expect(after.outcome).toEqual({ kind: 'reply', text: 'Two rolls then?' });
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
    expect(outcome).toEqual({ kind: 'reply', text: 'Let me search first.' });
  });

  it('reports refusals and runaway tool loops instead of looping forever', async () => {
    const refused = scripted(reply([], 'refusal'));
    expect((await sendMessage(refused.create, 'claude-opus-5-5', emptyConversation(), { text: 'x', images: [] }, ctx)).outcome).toEqual({ kind: 'error', reason: 'refusal' });

    const loop = scripted(...Array.from({ length: 20 }, (_, i) => reply([toolUse(`t${i}`, 'search_foods', { queries: ['roll'] })], 'tool_use')));
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
  });

  it('offers lookup_barcode only when the lookup is on, and passes barcodes read from photos', async () => {
    const api = scripted(
      reply([toolUse('t1', 'lookup_barcode', { barcodes: ['4008400121925'] })], 'tool_use'),
      reply([toolUse('t2', 'propose_meal', { summary: 'Giotto', items: [{ code: 'OFF:4008400121925', grams: 4.3, preparation: 'asListed', note: '', micros_from: 'S450000' }], assumptions: [], confidence: 'B' })], 'tool_use'),
    );
    const { outcome } = await sendMessage(api.create, 'claude-opus-5-5', emptyConversation(), { text: 'one ball', images: [], appNote: '(Barcodes the app read from the photos: 4008400121925)' }, { ...ctx, products: products() });
    expect(outcome.kind === 'proposal' && outcome.proposals[0]!.items[0]!.product?.code).toBe('4008400121925');
    expect(api.requests[0]!.tools!.map((t) => (t as { name: string }).name)).toEqual(['search_foods', 'lookup_barcode', 'propose_meal']);
    expect(JSON.stringify(api.requests[0]!.messages[0]!.content)).toContain('Barcodes the app read');
    expect(requestParams('claude-opus-5-5', []).tools!.map((t) => (t as { name: string }).name)).toEqual(['search_foods', 'propose_meal']);
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
    expect(tools.map((t) => (t as { name: string }).name)).toEqual(['search_foods', 'lookup_barcode', 'web_search', 'propose_meal']);
    expect(tools[2]).toMatchObject({ type: 'web_search_20250305', allowed_domains: ['openfoodfacts.org'] });
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
    expect(requestParams('claude-opus-5-5', [], { off: true, usda: true }).tools!.map((t) => (t as { name: string }).name)).toEqual(['search_foods', 'lookup_barcode', 'search_usda', 'propose_meal']);
    // The same objects every time, so the prompt cache keeps working.
    expect(requestParams('claude-opus-5-5', [], { usda: true }).system).toBe(requestParams('claude-opus-5-5', [], { usda: true }).system);
  });
});
