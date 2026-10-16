import { describe, expect, it } from 'vitest';
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { Food } from '../foods/foodDb';
import { buildIndex } from '../foods/search';
import { emptyConversation, requestParams, sendMessage, type CreateMessage } from './assistant';
import { describeFood, MAX_ITEM_GRAMS, runLookupBarcode, runSearchFoods, validateProposal, type ProductTools, type ToolContext } from './tools';
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
      expect(outcome.proposal.items[0]?.food.code).toBe('D7A5400');
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
    saved: new Map([[saved.code, saved]]),
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
    expect(p.seen.has('4008400121925')).toBe(true);
    expect((await runLookupBarcode({ barcodes: ['1'] }, ctx)).ok).toBe(false);
  });

  it('lists saved products in food searches', () => {
    const r = runSearchFoods({ queries: ['giotto'] }, { ...ctx, products: products() });
    expect(r.text).toContain('OFF:8000500319475 | GiOTTO Haselnuss Stick · Ferrero');
    expect(r.text).toContain('micronutrients from S450000 Nougat (chosen by the user)');
  });

  it('needs a similar BLS food for a product, unless the user chose one', () => {
    const p = products();
    p.seen.set(giotto.code, giotto);
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
    expect(outcome.kind === 'proposal' && outcome.proposal.items[0]!.product?.code).toBe('4008400121925');
    expect(api.requests[0]!.tools!.map((t) => (t as { name: string }).name)).toEqual(['search_foods', 'lookup_barcode', 'propose_meal']);
    expect(JSON.stringify(api.requests[0]!.messages[0]!.content)).toContain('Barcodes the app read');
    expect(requestParams('claude-opus-5-5', []).tools!.map((t) => (t as { name: string }).name)).toEqual(['search_foods', 'propose_meal']);
  });
});
