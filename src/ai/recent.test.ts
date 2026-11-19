import { describe, expect, it } from 'vitest';
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { RecentRecord } from '../logic/edits';
import type { LogEntry, SleepRecord } from '../storage/types';
import { buildIndex } from '../foods/search';
import { emptyConversation, sendMessage, type CreateMessage } from './assistant';
import { validateChangeProposal, validateDeleteProposal } from './edits';
import { toolsFor } from './prompt';
import { recentDays, recentLine, recentUpdate } from './recent';
import type { ToolContext } from './tools';

const at = (s: string) => new Date(s).getTime();
const eggs: LogEntry = { id: 'L1', schemaVersion: 1, kind: 'food', ref: { source: 'BLS', version: '4.0', code: 'E111000' }, grams: 150, preparation: 'fried', time: at('2026-11-18T08:10'), day: '2026-11-18', confidence: 'C', label: 'Scrambled eggs' };
const toast: LogEntry = { id: 'L2', schemaVersion: 1, kind: 'food', ref: { source: 'BLS', version: '4.0', code: 'B100000' }, grams: 60, preparation: 'asListed', time: at('2026-11-18T08:10'), day: '2026-11-18', confidence: 'C', label: 'Toast' };
const night: SleepRecord = { id: 'S1', schemaVersion: 1, start: at('2026-11-17T23:40'), end: at('2026-11-18T07:10'), day: '2026-11-18' };
const records: RecentRecord[] = [
  { kind: 'log', rec: toast },
  { kind: 'sleep', rec: night },
  { kind: 'log', rec: eggs },
  { kind: 'water', rec: { id: 'W1', schemaVersion: 1, ml: 500, time: at('2026-11-18T09:00'), day: '2026-11-18' } },
  { kind: 'habit', rec: { id: 'h|2026-11-18', schemaVersion: 1, habitId: 'h', day: '2026-11-18', did: false }, habit: { name: 'Alcohol', kind: 'avoid' } },
];
const days = ['2026-11-17', '2026-11-18', '2026-11-19'];
const NOW = at('2026-11-19T10:00');

describe('recent days', () => {
  it('covers today, the n days before and the chat day, and keeps days already covered', () => {
    expect(recentDays('2026-11-19', 2)).toEqual(['2026-11-17', '2026-11-18', '2026-11-19']);
    expect(recentDays('2026-11-19', 1, '2026-11-10')).toEqual(['2026-11-10', '2026-11-18', '2026-11-19']);
    expect(recentDays('2026-11-20', 1, undefined, ['2026-11-18'])).toEqual(['2026-11-18', '2026-11-19', '2026-11-20']);
  });

  it('lists every day with refs per entry, foods with grams, preparation and code', () => {
    const u = recentUpdate(records, undefined, { n: 2, days, today: '2026-11-19' });
    expect(u.note).toContain('Wed 2026-11-18:\n  food: e1 08:10 Scrambled eggs 150 g, fried [BLS E111000]; e2 08:10 Toast 60 g [BLS B100000]');
    expect(u.note).toContain('  sleep: s1 Tue 23:40 – Wed 07:10');
    expect(u.note).toContain('  water: w1 09:00 500 ml');
    expect(u.note).toContain('  habits: h1 "Alcohol": none');
    expect(u.note).toContain('Tue 2026-11-17: nothing logged.');
    expect(u.note).toContain('Thu 2026-11-19 (today): nothing logged yet.');
    expect(u.state.refs.e1).toEqual({ kind: 'log', id: 'L1' });
    expect(u.context.byRef.get('s1')?.rec).toBe(night);
  });

  it('sends only what changed later, with the same refs and never reusing one', () => {
    const first = recentUpdate(records, undefined, { n: 2, days, today: '2026-11-19' });
    expect(recentUpdate(records, first.state, { n: 2, days, today: '2026-11-19' }).note).toBeUndefined();
    const apple: LogEntry = { ...toast, id: 'L3', label: 'Apple', grams: 150, ref: { source: 'BLS', version: '4.0', code: 'F110100' }, time: at('2026-11-19T09:30'), day: '2026-11-19' };
    const next = [...records.filter((r) => r.rec !== toast), { kind: 'log', rec: { ...eggs, grams: 100 } } as RecentRecord, { kind: 'log', rec: apple } as RecentRecord].filter((r) => r.rec !== eggs);
    const u = recentUpdate(next, first.state, { n: 2, days, today: '2026-11-19' });
    expect(u.note).toBe('Diary changes in the recent days since the last list (refs stay the same): new: e3 Thu 2026-11-19 (today) 09:30 Apple 150 g [BLS F110100]. changed: e1 now Wed 2026-11-18 08:10 Scrambled eggs 100 g, fried [BLS E111000]. deleted: e2.');
    expect(u.state.refs.e2).toBeUndefined();
    expect(u.state.counters.e).toBe(3);
  });

  it('quotes only the start of a journal entry', () => {
    const line = recentLine({ kind: 'journal', rec: { id: 'J', schemaVersion: 1, time: at('2026-11-18T21:00'), day: '2026-11-18', text: 'word '.repeat(60) } });
    expect(line.length).toBeLessThan(140);
    expect(line.endsWith('…"')).toBe(true);
  });
});

describe('change and delete cards', () => {
  const recent = recentUpdate(records, undefined, { n: 2, days, today: '2026-11-19' }).context;

  it('accepts a change of only what changes, by ref', () => {
    const r = validateChangeProposal({ edits: [{ ref: 'e1', grams: 100 }, { ref: 's1', start: '2026-11-18 01:00' }], reason: 'You said 2 eggs' }, recent, NOW);
    expect(r.ok && r.proposal).toEqual({
      edits: [
        { ref: 'e1', kind: 'log', id: 'L1', name: 'Scrambled eggs', day: '2026-11-18', patch: { grams: 100 } },
        { ref: 's1', kind: 'sleep', id: 'S1', name: '', day: '2026-11-18', patch: { start: at('2026-11-18T01:00') } },
      ],
      reason: 'You said 2 eggs',
    });
  });

  it('refuses unknown refs, fields an entry does not have, values that change nothing and bad results', () => {
    const r = validateChangeProposal(
      {
        edits: [
          { ref: 'e9', grams: 10 },
          { ref: 'w1', grams: 10 },
          { ref: 'e2', grams: 60 },
          { ref: 's1', end: '2026-11-17 22:00' },
        ],
      },
      recent,
      NOW,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('"e9" is not a ref');
    expect(r.error).toContain('w1 (water) cannot change grams; it takes time, ml.');
    expect(r.error).toContain('e2 already has these values');
    expect(r.error).toContain('s1: end must be after start');
  });

  it('points at a delete and a swap instead of changing the food', () => {
    const r = validateChangeProposal({ edits: [{ ref: 'e1', text: 'oat milk' }] }, recent, NOW);
    expect(!r.ok && r.error).toContain('propose_delete the entry and propose_meal the right food');
  });

  it('deletes entries still saved, each once', () => {
    const r = validateDeleteProposal({ refs: ['e2', 'e2', 'w1'], reason: 'Logged twice' }, recent);
    expect(r.ok && r.proposal.targets.map((x) => x.ref)).toEqual(['e2', 'w1']);
    const gone = validateDeleteProposal({ refs: ['e2'] }, { ...recent, byRef: new Map() });
    expect(!gone.ok && gone.error).toContain('e2 was deleted from the diary since the list');
  });
});

describe('assistant with recent days', () => {
  const base: ToolContext = { db: { byCode: new Map(), groups: {} }, index: buildIndex([]), now: NOW };

  it('offers change and delete tools only with recent days in the chat, never strict', () => {
    const names = (edits: boolean) => (toolsFor({ edits }) as Array<{ name: string }>).map((t) => t.name);
    expect(names(false)).not.toContain('propose_change');
    const tools = (toolsFor({ edits: true }) as Array<{ name: string; strict?: boolean }>).filter((t) => t.name === 'propose_change' || t.name === 'propose_delete');
    expect(tools.map((t) => t.name)).toEqual(['propose_change', 'propose_delete']);
    expect(tools.every((t) => !t.strict)).toBe(true);
  });

  it('shows C and X cards and keeps the refs with the conversation', async () => {
    const recent = recentUpdate(records, undefined, { n: 2, days, today: '2026-11-19' });
    const responses = [
      {
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        stop_reason: 'tool_use',
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [
          { type: 'tool_use', id: 'c', name: 'propose_change', input: { edits: [{ ref: 'e1', grams: 100 }], reason: '2 eggs' } },
          { type: 'tool_use', id: 'x', name: 'propose_delete', input: { refs: ['w1'], reason: 'Twice' } },
        ],
      } as unknown as Beta.BetaMessage,
    ];
    const create: CreateMessage = async () => responses.shift()!;
    const r = await sendMessage(create, 'claude-opus-5-5', { ...emptyConversation(), recent: recent.state }, { text: 'only 2 eggs, and no water', images: [] }, { ...base, recent: recent.context });
    expect(r.outcome.kind).toBe('proposal');
    if (r.outcome.kind !== 'proposal') return;
    expect(r.outcome.changes.map((c) => c.id)).toEqual(['C1']);
    expect(r.outcome.deletes.map((c) => c.id)).toEqual(['X1']);
    expect(r.outcome.order).toEqual(['C1', 'X1']);
    expect(r.conversation.recent).toBe(recent.state);
    expect(r.conversation.pendingResults.map((p) => p.content)).toEqual(['Shown to the user as card C1. Not changed yet; their reply follows.', 'Shown to the user as card X1. Not deleted yet; their reply follows.']);
  });
});
