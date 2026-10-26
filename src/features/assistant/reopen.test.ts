import { describe, expect, it } from 'vitest';
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { emptyConversation, retirePhotos, sendMessage, type CreateMessage, type ShownProposal } from '../../ai/assistant';
import { cardSummary, type ChatAudio, type ChatEvent, type ChatPhoto, type ChatRecord, type NewChatEvent } from '../../ai/chatRecord';
import { ChatRecorder } from '../../ai/chatStore';
import type { ToolContext } from '../../ai/tools';
import type { Food } from '../../foods/foodDb';
import { buildIndex } from '../../foods/search';
import type { Product } from '../../storage/types';
import { openCardIds, rebuildConversation, reopenChat, replayEvents, restoreCard } from './reopen';

function food(code: string, nameEn: string): Food {
  return { code, nameEn, nameDe: nameEn, group: code.charAt(0), per100: { ENERCC: 300 }, provenance: {} };
}
const foods = [food('C131000', 'Muesli'), food('M111000', 'Milk')];
const db = { byCode: new Map(foods.map((f) => [f.code, f])), groups: {}, version: '4.0' };
const ctx: ToolContext = { db, index: buildIndex(foods.map((f) => ({ key: f.code, nameEn: f.nameEn, nameDe: f.nameDe }))), now: new Date(2026, 9, 20, 9, 0).getTime() };

function reply(content: unknown[], stop_reason: Beta.BetaStopReason): Beta.BetaMessage {
  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null, iterations: null };
  return { id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, usage } as unknown as Beta.BetaMessage;
}
const scripted = (...responses: Beta.BetaMessage[]): CreateMessage => async () => responses.shift()!;
const meal = (summary: string, time: string, grams = 60) => ({ summary, time, items: [{ code: 'C131000', grams, preparation: 'asListed', note: '' }], assumptions: [], confidence: 'C' });
const at = (e: NewChatEvent, i = 0) => ({ ...e, at: 1000 + i }) as ChatEvent;

function store() {
  const writes: Array<{ chat: ChatRecord; photos: ChatPhoto[]; audio: ChatAudio[] }> = [];
  return { writes, saveChat: async (chat: ChatRecord, photos: ChatPhoto[] = [], audio: ChatAudio[] = []) => void writes.push({ chat: structuredClone(chat), photos, audio }) };
}

/** One turn as the chat screen records it: the user's message, the conversation, the cards shown. */
async function turn(recorder: ChatRecorder, conversation: ReturnType<typeof emptyConversation>, create: CreateMessage, text: string, images: Array<{ data: string; label: string }> = []) {
  recorder.event({ type: 'user', text, photos: images.map((i) => i.label) });
  const r = await sendMessage(create, 'claude-opus-5-5', conversation, { text, images: images.map((i) => ({ mediaType: 'image/jpeg' as const, ...i })) }, ctx);
  const { messages, ...state } = r.conversation;
  recorder.resume({ conversation: state, products: [] });
  recorder.conversation(messages, undefined);
  if (r.outcome.kind === 'proposal') recorder.event({ type: 'cards', text: r.outcome.text, cards: r.outcome.proposals.map((p) => cardSummary(p)) });
  return r;
}

describe('reopening a saved chat', () => {
  it('keeps the recordings a message was spoken in, numbered across the chat, and plays them back in their bubbles', async () => {
    const s = store();
    const recorder = new ChatRecorder({ kind: 'log', model: 'm', day: '2026-10-20', features: {} }, true, s);
    const clip = (n: number) => ({ data: new Uint8Array([n]).buffer, mediaType: 'audio/webm', ms: n * 1000 });
    recorder.user({ text: 'breakfast', photos: [], dictated: true }, [clip(1), clip(2)], 1000);
    recorder.event({ type: 'assistant', text: 'Noted.' }, 1001);
    recorder.user({ text: 'and tea', photos: [] }, [], 1002);
    recorder.user({ text: 'lunch', photos: [] }, [clip(3)], 1003);
    await recorder.saved();
    const chat = s.writes.at(-1)!.chat;
    const audio = s.writes.flatMap((w) => w.audio);
    expect(chat.audio).toBe(3);
    expect(audio.map((a) => [a.id, a.n, a.ms])).toEqual([[`${chat.id}:a1`, 1, 1000], [`${chat.id}:a2`, 2, 2000], [`${chat.id}:a3`, 3, 3000]]);
    expect(chat.events.filter((e) => e.type === 'user').map((e) => (e.type === 'user' ? e.audio : undefined))).toEqual([[1, 2], undefined, [3]]);

    // A recording that is gone (or a chat saved before recordings were kept) just leaves its bubble without a player.
    const back = reopenChat(chat, [], { db, saved: new Map() }, audio.slice(1));
    expect(back.bubbles.map((b) => (b.role === 'user' ? (b.audio ?? []).map((a) => a.ms) : b.role))).toEqual([[2000], 'assistant', [], [3000]]);
  });

  it('comes back as it was left: messages, photos, open cards and the tool results still owed', async () => {
    const s = store();
    const recorder = new ChatRecorder({ kind: 'log', model: 'claude-opus-5-5', day: '2026-10-20', features: {} }, true, s);
    const create = scripted(reply([{ type: 'text', text: 'Breakfast:' }, { type: 'tool_use', id: 'u1', name: 'propose_meal', input: meal('Muesli', '2026-10-20 08:15') }], 'tool_use'));
    const live = await turn(recorder, emptyConversation(), create, 'breakfast', [{ data: 'AAAA', label: 'Photo 1: taken Tue 2026-10-20 08:10 (from the photo\'s data).' }]);
    await recorder.saved();
    const { chat, photos } = { chat: s.writes.at(-1)!.chat, photos: s.writes.flatMap((w) => w.photos) };

    const back = reopenChat(chat, photos, { db, saved: new Map() });
    expect(back.conversation).toEqual(live.conversation);
    expect(back.bubbles).toEqual([
      { role: 'user', text: 'breakfast', previews: ['data:image/jpeg;base64,AAAA'] },
      { role: 'assistant', text: 'Breakfast:' },
      { role: 'card', id: 'M1' },
    ]);
    const card = back.cards.get('M1');
    expect(card).toEqual({ kind: 'meal', proposal: (live.outcome as { proposals: ShownProposal[] }).proposals[0], logged: false });
    expect(back.photoCount).toBe(1);
    expect(back.lost).toEqual([]);

    // Chats saved before reopening existed have no saved state: the owed tool results are rebuilt the same.
    const old = reopenChat({ ...chat, resume: undefined, schemaVersion: 1 }, photos, { db, saved: new Map() });
    expect(old.conversation.pendingResults).toEqual(live.conversation.pendingResults);
    expect(old.conversation.cards).toBe(1);
  });

  it('carries on writing the same saved chat', async () => {
    const s = store();
    const rec: ChatRecord = { id: 'c1', schemaVersion: 1, kind: 'log', startedAt: 1, updatedAt: 2, model: 'm', title: 'lunch', features: {}, messages: [], events: [at({ type: 'user', text: 'lunch', photos: [] })], photos: 2, tokens: {} };
    const r = new ChatRecorder({ kind: 'log', model: 'm', features: {} }, true, s, rec);
    expect(r.id).toBe('c1');
    r.event({ type: 'assistant', text: 'How much?' }, 3);
    await r.saved();
    const saved = s.writes.at(-1)!.chat;
    expect(saved).toMatchObject({ id: 'c1', startedAt: 1, updatedAt: 3, title: 'lunch', photos: 2, schemaVersion: 2 });
    expect(saved.events.map((e) => e.type)).toEqual(['user', 'assistant']);
    expect(rec.events).toHaveLength(1); // the loaded record is not changed
  });

  it('replays corrections, saves, undos, failed messages and answers in pages as the chat showed them', () => {
    const c = (id: string, extra = {}) => ({ id, summary: id, items: [], ...extra });
    const events: ChatEvent[] = [
      at({ type: 'user', text: 'day', photos: ['Photo 1: capture time unknown.', 'Photo 2: capture time unknown.'] }, 0),
      at({ type: 'cards', text: 'Two meals', cards: [c('M1'), c('M2')] }, 1),
      at({ type: 'saved', card: 'M1', saved: {} }, 2),
      at({ type: 'user', text: 'oops', photos: [] }, 3),
      at({ type: 'error', reason: 'network', detail: 'offline' }, 4),
      at({ type: 'user', text: 'M2 was 80 g', photos: [] }, 5),
      at({ type: 'cards', text: '', cards: [c('M3', { replaces: 'M2' })] }, 6),
      at({ type: 'saved', card: 'M3', saved: {} }, 7),
      at({ type: 'undone', card: 'M3' }, 8),
    ];
    const r = replayEvents(events);
    expect(r.bubbles).toEqual([
      { role: 'user', text: 'day', photos: [1, 2], audio: [] },
      { role: 'pages', key: 1, text: 'Two meals', ids: ['M1', 'M2'] },
      { role: 'user', text: 'M2 was 80 g', photos: [], audio: [] },
      { role: 'card', id: 'M3' },
    ]);
    expect([...r.cards].map(([id, x]) => [id, x.logged])).toEqual([
      ['M1', true],
      ['M3', false],
    ]);
    expect(r.pages).toBe(1);
    expect(openCardIds(events)).toEqual(['M3']);
  });

  it('puts the app\'s numbers back under a pattern answer', () => {
    const check = { kind: 'compare', from: '2026-10-01', to: '2026-10-07', group: [], measures: ['alcohol'], result: { days: 7, groupDays: [], unknownGroup: 0, measures: [] } };
    const events: ChatEvent[] = [
      at({ type: 'user', text: 'Look for patterns in my data.', photos: [] }, 0),
      at({ type: 'assistant', text: 'Little alcohol.', checks: [check] }, 1),
      at({ type: 'user', text: 'Log it', photos: [] }, 2),
      at({ type: 'cards', text: 'Here.', cards: [{ id: 'J1', text: 'x' }], checks: [check] }, 3),
    ];
    expect(replayEvents(events).bubbles).toEqual([
      { role: 'user', text: 'Look for patterns in my data.', photos: [], audio: [] },
      { role: 'assistant', text: 'Little alcohol.' },
      { role: 'checks', checks: [check] },
      { role: 'user', text: 'Log it', photos: [], audio: [] },
      { role: 'assistant', text: 'Here.' },
      { role: 'card', id: 'J1' },
      { role: 'checks', checks: [check] },
    ]);
  });

  it('rebuilds cards of every kind with their times, and leaves out a product no longer on the phone', () => {
    const product = { id: 'OFF:400', name: 'Oat drink', source: 'OFF', per100: {} } as unknown as Product;
    const products = new Map([[product.id, product]]);
    const sleep = restoreCard({ id: 'S1', start: 'Mon 2026-10-19 23:30', end: 'Tue 2026-10-20 07:00' }, false, { db, products });
    expect(sleep).toEqual({ kind: 'sleep', sleep: { id: 'S1', start: new Date(2026, 9, 19, 23, 30).getTime(), end: new Date(2026, 9, 20, 7, 0).getTime() }, logged: false });
    const list = restoreCard({ id: 'L1', items: [{ name: 'Milk', amount: '2 l' }], recipes: [] }, true, { db, products });
    expect(list).toMatchObject({ kind: 'shopping', logged: true, shopping: { items: [{ name: 'Milk', amount: '2 l' }] } });
    const home = restoreCard({ id: 'H1', items: [{ name: 'Oat drink', ref: { source: 'OFF', code: '400' }, pieces: 2, status: 'bought' }] }, false, { db, products });
    expect(home).toMatchObject({ kind: 'home', logged: false, home: { items: [{ name: 'Oat drink', pieces: 2 }] } });

    const withProduct = restoreCard({ id: 'M1', summary: 'Oats', items: [{ code: 'OFF:400', name: 'Oat drink', grams: 200, preparation: 'asListed', product: { id: 'OFF:400', name: 'Oat drink', microsFrom: 'M111000' } }] }, false, { db, products });
    const item = withProduct?.kind === 'meal' ? withProduct.proposal.items[0] : undefined;
    expect(item?.product?.match).toEqual({ version: '4.0', code: 'M111000' });
    expect(item?.food.code).toBe('OFF:400');
    expect(restoreCard({ id: 'M2', summary: 'x', items: [{ code: 'OFF:999', grams: 1, preparation: 'asListed', product: { id: 'OFF:999' } }] }, false, { db, products })).toBeUndefined();
    expect(restoreCard({ id: 'P1', name: 'Soup', changes: [{ item: { code: 'NOPE', grams: 1, preparation: 'asListed' } }] }, false, { db, products })).toBeUndefined();
  });

  it('answers tool calls of an old chat\'s last answer that are not cards with an error, so the next request is valid', () => {
    const messages = [
      { role: 'user', content: 'x' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'u1', name: 'search_foods', input: {} }, { type: 'tool_use', id: 'u2', name: 'propose_sleep', input: {} }] },
    ] as Beta.BetaMessageParam[];
    const events = [at({ type: 'cards', text: '', cards: [{ id: 'S4' }] })];
    const conv = rebuildConversation(messages, events);
    expect(conv.pendingResults.map((r) => [r.tool_use_id, r.is_error ?? false])).toEqual([
      ['u1', true],
      ['u2', false],
    ]);
    expect(conv.pendingResults[1]!.content).toContain('card S4');
    expect(conv.sleeps).toBe(4);
  });

  it('numbers photos by their label, also after earlier photos left the chat', async () => {
    const s = store();
    const recorder = new ChatRecorder({ kind: 'log', model: 'm', features: {} }, true, s);
    const create = scripted(
      reply([{ type: 'tool_use', id: 'u1', name: 'propose_meal', input: meal('Muesli', '2026-10-20 08:15') }], 'tool_use'),
      reply([{ type: 'tool_use', id: 'u2', name: 'propose_meal', input: meal('Muesli', '2026-10-20 08:45', 80) }], 'tool_use'),
    );
    const first = await turn(recorder, emptyConversation(), create, 'one', [{ data: 'AAAA', label: 'Photo 1: capture time unknown.' }]);
    // M1 saved: photo 1 leaves the chat before the next message.
    const lighter = retirePhotos(first.conversation, () => true);
    await turn(recorder, lighter, create, 'two', [{ data: 'BBBB', label: 'Photo 2: capture time unknown.' }]);
    await recorder.saved();
    const photos = s.writes.flatMap((w) => w.photos);
    expect(photos.map((p) => [p.n, p.data])).toEqual([
      [1, 'AAAA'],
      [2, 'BBBB'],
    ]);
    const back = reopenChat(s.writes.at(-1)!.chat, photos, { db, saved: new Map() });
    expect(back.bubbles.filter((b) => b.role === 'user').map((b) => (b.role === 'user' ? b.previews : []))).toEqual([['data:image/jpeg;base64,AAAA'], ['data:image/jpeg;base64,BBBB']]);
    expect(JSON.stringify(back.conversation.messages)).toContain('BBBB');
    expect(JSON.stringify(back.conversation.messages)).not.toContain('AAAA');
    expect(back.photoCount).toBe(2);
  });
});
