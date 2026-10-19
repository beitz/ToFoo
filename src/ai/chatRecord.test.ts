import { describe, expect, it } from 'vitest';
import { buildChatExport, cardSummary, chatFileName, chatTitle, joinPhotos, splitPhotos, type ChatRecord } from './chatRecord';

const photo = (data: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
const messages = [
  { role: 'user', content: [{ type: 'text', text: 'Photo 1, taken Sun 2026-10-18 08:00' }, photo('AAAA'), photo('BBBB'), { type: 'text', text: 'breakfast' }] },
  { role: 'assistant', content: [{ type: 'thinking', thinking: 'Two photos of muesli.', signature: 'x'.repeat(500) }, { type: 'tool_use', id: 't1', name: 'search_foods', input: { queries: ['muesli'] } }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'C131000 | Muesli' }, photo('CCCC')] },
];

function record(over: Partial<ChatRecord> = {}): ChatRecord {
  return {
    id: 'c1',
    schemaVersion: 1,
    kind: 'log',
    startedAt: new Date(2026, 9, 18, 10, 52).getTime(),
    updatedAt: new Date(2026, 9, 18, 10, 55).getTime(),
    model: 'claude-opus-5-5',
    day: '2026-10-18',
    title: 'breakfast',
    features: { aiAssistant: true },
    messages: splitPhotos(messages, 'c1').messages,
    events: [{ at: new Date(2026, 9, 18, 10, 52).getTime(), type: 'user', text: 'breakfast', photos: ['Photo 1', 'Photo 2'] }],
    photos: 3,
    tokens: {},
    ...over,
  };
}

describe('saved chats', () => {
  it('keeps photos apart from the messages, numbered in the order they were sent, and puts them back', () => {
    const split = splitPhotos(messages, 'c1');
    expect(split.photos.map((p) => [p.id, p.n, p.data])).toEqual([
      ['c1:1', 1, 'AAAA'],
      ['c1:2', 2, 'BBBB'],
      ['c1:3', 3, 'CCCC'],
    ]);
    expect(JSON.stringify(split.messages)).not.toContain('AAAA');
    expect((split.messages[0] as { content: unknown[] }).content[1]).toEqual({ type: 'image', photo: 1 });
    // Splitting again (after the next turn) finds the same numbers and no new photos.
    expect(splitPhotos(split.messages, 'c1').photos).toEqual([]);
    expect(joinPhotos(split.messages, split.photos)).toEqual(messages);
  });

  it('exports messages, tool calls and events without photos by default, and with them when asked', () => {
    const rec = record();
    const out = buildChatExport(rec, { appVersion: '0.1.0', exportedAt: rec.updatedAt });
    expect(out).toMatchObject({ format: 'tofoo-chat', version: 1, chat: { kind: 'log', model: 'claude-opus-5-5', day: '2026-10-18' } });
    expect(out.photos).toContain('left out (3)');
    const text = JSON.stringify(out);
    expect(text).not.toContain('AAAA');
    expect(text).toContain('search_foods');
    expect(text).toContain('Two photos of muesli.');
    expect(text).not.toContain('xxxxxxxx'); // thinking signatures are left out
    expect(out.events[0]!.at).toMatch(/^2026-10-18T/);

    const withPhotos = buildChatExport(rec, { appVersion: '0.1.0', exportedAt: rec.updatedAt, photos: splitPhotos(messages, 'c1').photos });
    expect(withPhotos.photos).toBe('included');
    expect(JSON.stringify(withPhotos.messages)).toContain('CCCC');
  });

  it('summarizes proposed foods instead of copying their nutrient tables, with readable times', () => {
    const food = { code: 'C131000', nameEn: 'Muesli', nameDe: 'Müsli', per100: { ENERCC: 360 } };
    const card = cardSummary({ id: 'M1', summary: 'Breakfast', time: new Date(2026, 9, 18, 8, 0).getTime(), items: [{ food, grams: 60, preparation: 'asListed', note: '' }] });
    expect(card).toEqual({ id: 'M1', summary: 'Breakfast', time: 'Sun 2026-10-18 08:00', items: [{ code: 'C131000', name: 'Muesli', grams: 60, preparation: 'asListed' }] });
    // A shopping card's things are not foods: kept as they are.
    const list = { id: 'L1', items: [{ name: 'Milk', amount: '2 l' }], recipes: [] };
    expect(cardSummary(list)).toEqual(list);
  });

  it('names chats by their first message and files by start time and kind', () => {
    expect(chatTitle([{ at: 0, type: 'user', text: '  two   eggs\nand toast ', photos: [] }])).toBe('two eggs and toast');
    expect(chatTitle([{ at: 0, type: 'user', text: '', photos: ['a', 'b'] }])).toBe('(2 photos)');
    expect(chatFileName(record())).toBe('tofoo-chat-2026-10-18-1052-log.json');
  });
});
