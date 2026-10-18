import { describe, expect, it } from 'vitest';
import type { ChatPhoto, ChatRecord } from './chatRecord';
import { ChatRecorder } from './chatStore';

function fakeStore() {
  const writes: Array<{ chat: ChatRecord; photos: ChatPhoto[] }> = [];
  return { writes, saveChat: async (chat: ChatRecord, photos: ChatPhoto[] = []) => void writes.push({ chat: structuredClone(chat), photos }) };
}
const photo = (data: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });

describe('chat recorder', () => {
  it('starts the record with the first message and writes each photo once', async () => {
    const store = fakeStore();
    const r = new ChatRecorder({ kind: 'log', model: 'claude-opus-5-5', day: '2026-10-18', features: {} }, true, store);
    expect(r.id).toBeUndefined();
    r.event({ type: 'user', text: 'lunch', photos: ['Photo 1'] }, 1000);
    const turn1 = [{ role: 'user', content: [photo('AAAA'), { type: 'text', text: 'lunch' }] }, { role: 'assistant', content: [{ type: 'text', text: 'How much rice?' }] }];
    r.usage({ 'claude-opus-5-5': { input: 10, output: 5, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 } });
    r.conversation(turn1, { system: 'You help…', tools: [] }, 2000);
    r.event({ type: 'assistant', text: 'How much rice?' }, 2000);
    r.conversation([...turn1, { role: 'user', content: [{ type: 'text', text: '200 g' }] }], undefined, 3000);
    await r.saved();

    expect(store.writes.map((w) => w.photos.map((p) => p.n))).toEqual([[], [1], [], []]);
    const last = store.writes.at(-1)!.chat;
    expect(last).toMatchObject({ id: r.id, kind: 'log', title: 'lunch', startedAt: 1000, updatedAt: 3000, photos: 1, setup: { system: 'You help…' } });
    expect(last.events.map((e) => e.type)).toEqual(['user', 'assistant']);
    expect(JSON.stringify(last.messages)).not.toContain('AAAA');
    expect(Object.keys(last.tokens)).toEqual(['claude-opus-5-5']);
  });

  it('saves nothing when saving chats is off', async () => {
    const store = fakeStore();
    const r = new ChatRecorder({ kind: 'insights', model: 'claude-opus-5-5', features: {} }, false, store);
    r.event({ type: 'user', text: 'why tired?', photos: [] });
    r.conversation([], undefined);
    await r.saved();
    expect(store.writes).toEqual([]);
    expect(r.id).toBeUndefined();
  });

  it('keeps going when a write fails', async () => {
    let fail = true;
    const saved: ChatRecord[] = [];
    const r = new ChatRecorder({ kind: 'log', model: 'm', features: {} }, true, {
      saveChat: async (c) => {
        if (fail) throw new Error('quota');
        saved.push(c);
      },
    });
    r.event({ type: 'user', text: 'a', photos: [] });
    await r.saved();
    fail = false;
    r.event({ type: 'assistant', text: 'b' });
    await r.saved();
    expect(saved[0]!.events).toHaveLength(2);
  });
});
