import { describe, expect, it } from 'vitest';
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { dayRange } from '../lib/dates';
import { buildInsightData, overview } from '../logic/insights';
import type { DayStatus, ModelEntry } from '../model/types';
import { buildIndex } from '../foods/search';
import { appNote, emptyConversation, requestParams, sendMessage, type CreateMessage } from './assistant';
import { fmtChance, fmtMeasure, runInsightTool, shareNote } from './insights';
import { INSIGHT_TOOLS } from './insightsPrompt';
import { toolsFor } from './prompt';
import type { ToolContext } from './tools';

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
    expect(d).toContain('sleep: 01:00–07:00 (6 h asleep)');
    expect(d).toContain('journal: 15:30 Headache since lunch');
  });

  it('shows each sleep of a night with its wake-ups, and naps with their times', () => {
    const split = buildInsightData({
      ...input,
      sleep: [
        { id: 'a', schemaVersion: 1, day: key(2), start: at(1, 23), end: at(2, 1, 30) },
        { id: 'b', schemaVersion: 1, day: key(2), start: at(2, 2, 55), end: at(2, 7) },
        { id: 'n', schemaVersion: 1, day: key(2), start: at(2, 13), end: at(2, 13, 40) },
      ],
    });
    expect(runInsightTool('day_details', { days: [key(2)] }, split).text).toContain('sleep: 23:00–01:30, 02:55–07:00 (6.6 h asleep; woken 1 time, awake 85 min); naps 13:00–13:40 (40 min)');
  });

  it('gives a compact daily table, and clear errors', () => {
    const r = runInsightTool('daily_table', { from: key(1), to: key(3), measures: ['sleep_hours', 'wake_time', 'ENERCC'] }, data);
    expect(r.ok).toBe(true);
    const lines = r.text.split('\n');
    expect(lines[1]).toBe('day,sleep_hours (h),wake_time (HH:MM),ENERCC (kcal)');
    expect(lines[3]).toBe('2026-10-02 Fri,6,07:00,2000');
    expect(lines).toHaveLength(5);
    expect(runInsightTool('daily_table', { from: key(1), to: key(3), measures: ['mood'] }, data)).toEqual({ ok: false, text: 'Unknown measures: mood.' });
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
    const note = shareNote(overview(habits, key(1), key(7)), [], false, habits.habits);
    expect(note).toContain('habits answered on 3 days');
    expect(note).toContain('"Floss" (to do)');
    expect(shareNote(overview(data, key(1), key(7)))).not.toContain('habit');
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

describe('patterns in the assistant chat (Include my data)', () => {
  const ctx: ToolContext = { db: { byCode: new Map(), groups: {} }, index: buildIndex([]), insights: data };
  const note = (share?: string) => appNote({ now: at(8, 9), day: key(8), today: key(8), logged: [], open: [], barcodes: [], ...(share ? { share } : {}) });

  it('runs the pattern tools the model asks for and returns the answer with the checks behind it', async () => {
    const { create, requests } = scripted(
      reply([toolUse('t1', 'read_journal', { from: key(1), to: key(7), words: [] })], 'tool_use'),
      reply([text('Comparing.'), toolUse('t2', 'count_days', { from: key(1), to: key(7), group: [shortNight], outcome: [headache] }), toolUse('t3', 'compare_measures', { from: key(1), to: key(7), group: [headache], measures: ['alcohol'] })], 'tool_use'),
      reply([text('Headache on 2 of 2 days after a short night.')], 'end_turn'),
    );
    const share = shareNote(overview(data, key(1), key(7)));
    const r = await sendMessage(create, 'claude-opus-5-5', emptyConversation(), { text: 'Look for patterns', images: [], appNote: note(share) }, ctx);
    expect(r.outcome).toMatchObject({ kind: 'reply', text: 'Headache on 2 of 2 days after a short night.' });
    expect(r.outcome.kind === 'reply' && r.outcome.checks.map((c) => c.kind)).toEqual(['count', 'compare']);
    expect(requests).toHaveLength(3);
    const names = requests[0]!.tools!.map((t) => ('name' in t ? t.name : ''));
    for (const t of INSIGHT_TOOLS) expect(names).toContain(t.name);
    expect(requests[0]!.output_config).toEqual({ effort: 'high' });
    const first = requests[0]!.messages[0]!.content as Beta.BetaTextBlockParam[];
    expect(first[1]!.text).toContain('Period chosen by the user: 2026-10-01 to 2026-10-07 (7 days)');
    expect(first[1]!.text).toContain('food log complete on 7 days');
    const results = requests[2]!.messages.at(-1)!.content as Beta.BetaToolResultBlockParam[];
    expect(results.map((x) => x.tool_use_id)).toEqual(['t2', 't3']);
    expect(r.conversation.messages).toHaveLength(6);
  });

  it('offers no pattern tools without data included, and says how to include it', async () => {
    const { create, requests } = scripted(reply([text('Hi')], 'end_turn'));
    const { insights: _, ...without } = ctx;
    const r = await sendMessage(create, 'claude-opus-5-5', emptyConversation(), { text: 'Do I sleep worse after coffee?', images: [] }, without);
    expect(r.outcome).toEqual({ kind: 'reply', text: 'Hi', checks: [] });
    const names = requests[0]!.tools!.map((t) => ('name' in t ? t.name : ''));
    expect(names).not.toContain('read_journal');
    expect(requests[0]!.output_config).toEqual({ effort: 'medium' });
    expect(requests[0]!.system).toContain('Include my data');
    // A pattern tool the model calls anyway reads nothing.
    const sneaky = scripted(reply([toolUse('t1', 'read_journal', { from: key(1), to: key(7), words: [] })], 'tool_use'), reply([text('Cannot.')], 'end_turn'));
    await sendMessage(sneaky.create, 'claude-opus-5-5', emptyConversation(), { text: 'Read my journal', images: [] }, without);
    expect((sneaky.requests[1]!.messages.at(-1)!.content as Beta.BetaToolResultBlockParam[])[0]).toMatchObject({ is_error: true, content: 'Unknown tool read_journal.' });
  });

  it('keeps what was shared with the conversation, so a reopened chat stays the same', async () => {
    const shared = { from: key(1), kinds: ['food' as const, 'journal' as const], privateJournal: false };
    const r = await sendMessage(scripted(reply([text('Ok')], 'end_turn')).create, 'claude-opus-5-5', { ...emptyConversation(), shared }, { text: 'hi', images: [] }, ctx);
    expect(r.conversation.shared).toEqual(shared);
  });

  it('tells the model what the user chose not to share', () => {
    const o = overview(data, key(1), key(7));
    expect(shareNote(o, ['sleep', 'water'])).toContain('no days outside it');
    expect(shareNote(o, ['sleep', 'water'])).toContain('chose not to share their sleep, water');
    expect(shareNote(o)).not.toContain('not to share');
    expect(shareNote(o, [], true)).toContain('journal entries private');
    expect(shareNote(o)).not.toContain('private');
  });

  it('keeps the strict grammar as it was: the pattern tools are checked by the app', () => {
    const tools = toolsFor({ insights: true }) as Array<{ name: string; strict?: boolean }>;
    expect(tools.filter((t) => INSIGHT_TOOLS.some((x) => x.name === t.name)).every((t) => !t.strict)).toBe(true);
    // Missing fields of a condition take their defaults rather than failing.
    expect(runInsightTool('count_days', { from: key(1), to: key(7), group: [{ kind: 'measure', measure: 'sleep_hours', op: '<', value: 7 }], outcome: [{ kind: 'journal', words: ['headache'] }] }, data).ok).toBe(true);
    expect(requestParams('claude-opus-5-5', [], { insights: true }).system).toBe(requestParams('claude-haiku-5-5', [], { insights: true }).system);
  });
});
