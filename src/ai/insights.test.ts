import { describe, expect, it } from 'vitest';
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { dayRange } from '../lib/dates';
import { buildInsightData, overview } from '../logic/insights';
import type { DayStatus, ModelEntry } from '../model/types';
import type { CreateMessage } from './assistant';
import { askInsights, fmtChance, fmtMeasure, insightNote, insightParams, runInsightTool } from './insights';
import { INSIGHT_TOOLS } from './insightsPrompt';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
const key = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
const days = dayRange(key(1), key(8));
const coffee = (day: number): ModelEntry => ({
  id: `c${day}`,
  label: 'Coffee',
  time: at(day, 8),
  dayKey: key(day),
  confidence: 'B',
  isSupplement: false,
  parts: [{ label: 'Coffee (beverage)', nameEn: 'Coffee (beverage)', nameDe: 'Kaffee', grams: 200, per100: { ALC: 0, WATER: 99 }, preparation: 'asListed', storage: 'fresh' }],
});
const input = {
  days,
  daily: days.map(() => ({ absorbed: { low: {}, central: {}, high: {} }, intake: { ENERCC: 2000 }, supplementIntake: {}, missing: new Set<string>() })),
  dayStatus: Object.fromEntries(days.map((d) => [d, 'logged' as DayStatus])),
  entries: [1, 2, 3, 4, 5, 6, 7].map(coffee),
  journal: [2, 5].map((d) => ({ id: `j${d}`, schemaVersion: 1, day: key(d), time: at(d, 15, 30), text: 'Headache  since lunch' })),
  sleep: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ id: `s${d}`, schemaVersion: 1, day: key(d), start: d % 3 === 2 ? at(d, 1) : at(d - 1, 23, 30), end: at(d, 7) })),
  activities: [],
  water: [],
  mealWindowMinutes: 60,
  today: key(8),
};
const data = buildInsightData(input);

const cond = (o: Record<string, unknown>) => ({ kind: 'journal', words: [], measure: '', op: '<', value: 0, weekdays: [], statuses: [], habit: '', offset: 0, span: 1, negate: false, ...o });
const headache = cond({ words: ['headache'] });
const shortNight = cond({ kind: 'measure', measure: 'sleep_hours', op: '<', value: 7 });

function reply(content: Beta.BetaContentBlock[], stop_reason: Beta.BetaStopReason): Beta.BetaMessage {
  const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null, iterations: null };
  return { id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, usage } as unknown as Beta.BetaMessage;
}
const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input }) as Beta.BetaToolUseBlock;
const text = (t: string) => ({ type: 'text', text: t }) as Beta.BetaTextBlock;

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

describe('insight tools', () => {
  it('reads the journal, with words or all of it', () => {
    const r = runInsightTool('read_journal', { from: key(1), to: key(8), words: [] }, data);
    expect(r.text).toBe('2 entries:\n2026-10-02 Fri 15:30 | Headache since lunch\n2026-10-05 Mon 15:30 | Headache since lunch');
    expect(runInsightTool('read_journal', { from: key(1), to: key(8), words: ['tired'] }, data).text).toMatch(/No journal entries with these words/);
  });

  it('counts days and returns the check for the screen', () => {
    const r = runInsightTool('count_days', { from: key(1), to: key(7), group: [shortNight], outcome: [headache] }, data);
    expect(r.ok).toBe(true);
    expect(r.text).toContain('Group days (all group conditions hold): 2. Outcome on 2 of 2 (100 %).');
    expect(r.text).toContain('Other days: 5. Outcome on 0 of 4 (0 %); on 1 it cannot be told.');
    expect(r.text).toContain('Group days: 2026-10-02 yes, 2026-10-05 yes.');
    expect(r.text).toMatch(/Chance check \(Fisher exact, two-sided\): .* in 6\.7 % of cases/);
    expect(r.ok && r.check).toMatchObject({ kind: 'count', group: [{ kind: 'measure', measure: 'sleep_hours' }], result: { group: { yes: 2, known: 2 } } });
  });

  it('compares measures with clock times as clock times', () => {
    const r = runInsightTool('compare_measures', { from: key(1), to: key(7), group: [headache], measures: ['bedtime', 'ENERCC'] }, data);
    expect(r.text).toContain('bedtime (Fell asleep): group days average 01:00');
    expect(r.text).toContain('other days average 23:30');
    expect(r.text).toContain('ENERCC (Energy): group days average 2,000 kcal');
    const all = runInsightTool('compare_measures', { from: key(1), to: key(7), group: [], measures: ['sleep_hours'] }, data);
    expect(all.text).toContain('sleep_hours (Sleep): average 7.1 h');
  });

  it('maps weekday names and shows a day in detail', () => {
    const r = runInsightTool('count_days', { from: key(1), to: key(7), group: [cond({ kind: 'weekday', weekdays: ['monday'] })], outcome: [headache] }, data);
    expect(r.ok && r.check?.kind === 'count' && r.check.result.groupDays).toEqual([{ day: key(5), outcome: true }]);
    const d = runInsightTool('day_details', { days: [key(2)] }, data).text;
    expect(d).toContain('2026-10-02 Fri · food log: logged');
    expect(d).toContain('food: 08:00 Coffee 200 g');
    expect(d).toContain('sleep: 01:00–07:00 (6 h)');
    expect(d).toContain('journal: 15:30 Headache since lunch');
  });

  it('sends back clear errors for input it cannot use', () => {
    expect(runInsightTool('compare_measures', { from: key(1), to: key(7), group: [], measures: ['mood'] }, data)).toEqual({ ok: false, text: 'Unknown measures: mood.' });
    expect(runInsightTool('count_days', { from: key(7), to: key(1), group: [], outcome: [headache] }, data).text).toMatch(/is after/);
    expect(runInsightTool('count_days', { from: key(1), to: key(7), group: [cond({ words: [] })], outcome: [headache] }, data).text).toMatch(/needs at least one word/);
    expect(runInsightTool('read_journal', { from: 'yesterday', to: key(7), words: [] }, data).text).toMatch(/YYYY-MM-DD/);
  });

  it('compares by habit, shows habits in a day, and names the habits there are', () => {
    const habits = buildInsightData({
      ...input,
      habits: {
        list: [{ id: 'f', schemaVersion: 1, name: 'Floss', colour: 'teal', kind: 'do', goal: { type: 'daily' }, order: 0, createdAt: at(1, 8) }],
        data: { today: key(8), answers: new Map([['f', new Map([[key(2), true], [key(3), false], [key(5), true]])]]), activities: [], noActivity: new Set() },
      },
    });
    const r = runInsightTool('count_days', { from: key(1), to: key(7), group: [cond({ kind: 'habit', habit: 'floss' })], outcome: [headache] }, habits);
    expect(r.ok && r.check?.kind === 'count' && r.check.result.groupDays).toEqual([
      { day: key(2), outcome: true },
      { day: key(5), outcome: true },
    ]);
    expect(runInsightTool('day_details', { days: [key(3)] }, habits).text).toContain('habits: Floss not kept');
    expect(runInsightTool('count_days', { from: key(1), to: key(7), group: [cond({ kind: 'habit', habit: 'Stretch' })], outcome: [headache] }, habits).text).toBe('"Stretch" is not one of the shared habits ("Floss").');
    expect(runInsightTool('count_days', { from: key(1), to: key(7), group: [cond({ kind: 'habit', habit: 'Floss' })], outcome: [headache] }, data).text).toBe('The user shared no habits.');
    const note = insightNote(at(8, 9), overview(habits, key(1), key(7)), true, [], false, habits.habits);
    expect(note).toContain('habits answered on 3 days');
    expect(note).toContain('"Floss" (to do)');
    expect(insightNote(at(8, 9), overview(data, key(1), key(7)), true)).not.toContain('habit');
  });

  it('formats measures and chances', () => {
    expect(fmtMeasure('bedtime', 24.5)).toBe('00:30');
    expect(fmtMeasure('alcohol', 0)).toBe('0 g');
    expect(fmtMeasure('VITD', 2.345)).toBe('2.3 µg');
    expect(fmtChance(0.0004)).toBe('under 0.1 %');
    expect(fmtChance(0.048)).toBe('4.8 %');
    expect(fmtChance(0.42)).toBe('42 %');
  });
});

describe('insight conversation', () => {
  it('runs the tools the model asks for and returns the answer with the checks behind it', async () => {
    const { create, requests } = scripted(
      reply([toolUse('t1', 'read_journal', { from: key(1), to: key(7), words: [] })], 'tool_use'),
      reply([text('Comparing.'), toolUse('t2', 'count_days', { from: key(1), to: key(7), group: [shortNight], outcome: [headache] }), toolUse('t3', 'compare_measures', { from: key(1), to: key(7), group: [headache], measures: ['alcohol'] })], 'tool_use'),
      reply([text('Headache on 2 of 2 days after a short night.')], 'end_turn'),
    );
    const note = insightNote(at(8, 9), overview(data, key(1), key(7)), true);
    const r = await askInsights(create, 'claude-opus-5-5', { messages: [] }, { text: 'Look for patterns', appNote: note }, data);
    expect(r.outcome).toMatchObject({ kind: 'reply', text: 'Headache on 2 of 2 days after a short night.' });
    expect(r.outcome.kind === 'reply' && r.outcome.checks.map((c) => c.kind)).toEqual(['count', 'compare']);
    expect(requests).toHaveLength(3);
    expect(requests[0]!.tools!.map((t) => ('name' in t ? t.name : ''))).toEqual(INSIGHT_TOOLS.map((t) => t.name));
    const first = requests[0]!.messages[0]!.content as Beta.BetaTextBlockParam[];
    expect(first[1]!.text).toContain('Period chosen by the user: 2026-10-01 to 2026-10-07 (7 days)');
    expect(first[1]!.text).toContain('food log complete on 7 days');
    const results = requests[2]!.messages.at(-1)!.content as Beta.BetaToolResultBlockParam[];
    expect(results.map((x) => x.tool_use_id)).toEqual(['t2', 't3']);
    expect(r.conversation.messages).toHaveLength(6);
  });

  it('tells the model what the user chose not to share', () => {
    const note = insightNote(at(8, 9), overview(data, key(1), key(7)), true, ['sleep', 'water']);
    expect(note).toContain('no days outside it');
    expect(note).toContain('chose not to share their sleep, water');
    expect(insightNote(at(8, 9), overview(data, key(1), key(7)), true)).not.toContain('not to share');
    expect(insightNote(at(8, 9), overview(data, key(1), key(7)), true, [], true)).toContain('journal entries private');
    expect(insightNote(at(8, 9), overview(data, key(1), key(7)), true)).not.toContain('private');
  });

  it('gives up after too many tool rounds and leaves the conversation as it was', async () => {
    const loop = Array.from({ length: 16 }, (_, i) => reply([toolUse(`t${i}`, 'read_journal', { from: key(1), to: key(7), words: [] })], 'tool_use'));
    const { create } = scripted(...loop);
    const r = await askInsights(create, 'claude-opus-5-5', { messages: [] }, { text: 'Why?', appNote: '(Now.)' }, data);
    expect(r.outcome).toEqual({ kind: 'error', reason: 'tooManySteps' });
    expect(r.conversation.messages).toEqual([]);
  });

  it('asks for more effort and keeps the prompt stable for caching', () => {
    const a = insightParams('claude-opus-5-5', []);
    expect(a.output_config).toEqual({ effort: 'high' });
    expect(insightParams('claude-haiku-5-5', []).system).toBe(a.system);
    expect('fallbacks' in insightParams('claude-haiku-5-5', [])).toBe(false);
  });
});
