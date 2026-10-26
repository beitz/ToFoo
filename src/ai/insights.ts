/**
 * Insights conversation (docs/SPEC.md, "Insights"): the model reads the journal and asks the app
 * for counts and averages; the app answers from src/logic/insights.ts. The API call is injected so
 * the loop can be tested without a network.
 */
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import { parseDay } from '../lib/dates';
import { fmtNumber } from '../lib/format';
import {
  compareMeasures,
  conditionProblem,
  countDays,
  DAY_STATUSES,
  habitName,
  journalEntries,
  MEASURE_BY_ID,
  OPS,
  type CompareResult,
  type Condition,
  type CountResult,
  type InsightData,
  type Overview,
  type ShareKind,
  type Stats,
} from '../logic/insights';
import type { AiModel, CreateMessage } from './assistant';
import { textOf } from './assistant';
import { INSIGHT_SYSTEM, INSIGHT_TOOLS, WEEKDAYS } from './insightsPrompt';
import { fmtLocalDateTime } from './photoTime';
import { usageOf, type ModelTokens } from './pricing';

/** Tool rounds per question: reading the journal, then a few rounds of comparisons and a closer look. */
const MAX_STEPS = 16;
const MAX_MEASURES = 8;
const MAX_DETAIL_DAYS = 31;
/** Journal entries per read: a few months of daily notes; more would crowd out the comparisons. */
const MAX_JOURNAL_ENTRIES = 400;

export interface InsightConversation {
  messages: Beta.BetaMessageParam[];
}

/** One comparison the app computed in a turn, shown under the answer so its numbers can be checked. */
export type Check =
  | { kind: 'count'; from: string; to: string; group: Condition[]; outcome: Condition[]; result: CountResult }
  | { kind: 'compare'; from: string; to: string; group: Condition[]; measures: string[]; result: CompareResult };

export type InsightOutcome = { kind: 'reply'; text: string; checks: Check[] } | { kind: 'error'; reason: 'refusal' | 'tooLong' | 'tooManySteps' };

export function insightParams(model: AiModel, messages: Beta.BetaMessageParam[]): Beta.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 32000,
    system: INSIGHT_SYSTEM,
    tools: INSIGHT_TOOLS,
    messages,
    cache_control: { type: 'ephemeral' },
    // Looking for patterns is the kind of reasoning worth more effort; it runs only when asked.
    output_config: { effort: 'high' },
    ...(model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
  };
}

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Days are "YYYY-MM-DD".');
const conditionInput = z.object({
  kind: z.enum(['journal', 'food', 'measure', 'weekday', 'status', 'habit']),
  habit: z.string().default(''),
  words: z.array(z.string()).default([]),
  measure: z.string().default(''),
  op: z.enum(OPS).default('<'),
  value: z.number().default(0),
  weekdays: z.array(z.enum(WEEKDAYS)).default([]),
  statuses: z.array(z.enum(DAY_STATUSES)).default([]),
  offset: z.number().int().default(0),
  span: z.number().int().default(1),
  negate: z.boolean().default(false),
});
const period = { from: dayKey, to: dayKey };
const journalInput = z.object({ ...period, words: z.array(z.string()).default([]) });
const countInput = z.object({ ...period, group: z.array(conditionInput), outcome: z.array(conditionInput).min(1) });
const compareInput = z.object({ ...period, group: z.array(conditionInput).default([]), measures: z.array(z.string()).min(1) });
const detailsInput = z.object({ days: z.array(dayKey).min(1) });

function toCondition(c: z.infer<typeof conditionInput>): Condition {
  const common = { offset: c.offset, span: c.span, negate: c.negate };
  switch (c.kind) {
    case 'journal':
    case 'food':
      return { kind: c.kind, words: c.words, ...common };
    case 'measure':
      return { kind: 'measure', measure: c.measure, op: c.op, value: c.value, ...common };
    case 'weekday':
      return { kind: 'weekday', weekdays: c.weekdays.map((w) => WEEKDAYS.indexOf(w)), ...common };
    case 'status':
      return { kind: 'status', statuses: c.statuses, ...common };
    case 'habit':
      return { kind: 'habit', habit: c.habit, ...common };
  }
}

type ToolResult = { ok: true; text: string; check?: Check } | { ok: false; text: string };

const zodError = (e: z.ZodError) => `Invalid input: ${e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`;

function conditions(cs: z.infer<typeof conditionInput>[], data: InsightData): Condition[] | string {
  const out = cs.map(toCondition);
  for (const c of out) {
    const p = conditionProblem(c);
    if (p) return p;
    if (c.kind === 'habit' && !habitName(c.habit, data))
      return data.habits.length ? `"${c.habit}" is not one of the shared habits (${data.habits.map((h) => `"${h.name}"`).join(', ')}).` : 'The user shared no habits.';
  }
  return out;
}

function periodProblem(from: string, to: string): string | undefined {
  return from > to ? `from (${from}) is after to (${to}).` : undefined;
}

/** Run one tool call against the app's data. */
export function runInsightTool(name: string, input: unknown, data: InsightData): ToolResult {
  if (name === 'read_journal') {
    const p = journalInput.safeParse(input);
    if (!p.success) return { ok: false, text: zodError(p.error) };
    const bad = periodProblem(p.data.from, p.data.to);
    if (bad) return { ok: false, text: bad };
    const all = journalEntries(data, p.data.from, p.data.to, p.data.words);
    if (!all.length) return { ok: true, text: p.data.words.length ? 'No journal entries with these words in this period.' : 'No journal entries in this period.' };
    const shown = all.slice(-MAX_JOURNAL_ENTRIES);
    const lines = shown.map((j) => `${j.day} ${weekday(j.day)} ${clock(j.time)} | ${j.text.replace(/\s+/g, ' ').trim()}`);
    const cut = all.length > shown.length ? `Only the latest ${shown.length} of ${all.length} entries; read earlier ones with a shorter period.\n` : '';
    return { ok: true, text: `${cut}${all.length} entries:\n${lines.join('\n')}` };
  }
  if (name === 'count_days') {
    const p = countInput.safeParse(input);
    if (!p.success) return { ok: false, text: zodError(p.error) };
    const bad = periodProblem(p.data.from, p.data.to);
    if (bad) return { ok: false, text: bad };
    const group = conditions(p.data.group, data);
    const outcome = conditions(p.data.outcome, data);
    if (typeof group === 'string') return { ok: false, text: group };
    if (typeof outcome === 'string') return { ok: false, text: outcome };
    const result = countDays(data, p.data.from, p.data.to, group, outcome);
    return { ok: true, text: countText(result, group.length > 0), check: { kind: 'count', from: p.data.from, to: p.data.to, group, outcome, result } };
  }
  if (name === 'compare_measures') {
    const p = compareInput.safeParse(input);
    if (!p.success) return { ok: false, text: zodError(p.error) };
    const bad = periodProblem(p.data.from, p.data.to);
    if (bad) return { ok: false, text: bad };
    const unknown = p.data.measures.filter((m) => !MEASURE_BY_ID.has(m));
    if (unknown.length) return { ok: false, text: `Unknown measures: ${unknown.join(', ')}.` };
    if (p.data.measures.length > MAX_MEASURES) return { ok: false, text: `At most ${MAX_MEASURES} measures per call.` };
    const group = conditions(p.data.group, data);
    if (typeof group === 'string') return { ok: false, text: group };
    const result = compareMeasures(data, p.data.from, p.data.to, group, p.data.measures);
    return { ok: true, text: compareText(result, group.length > 0), check: { kind: 'compare', from: p.data.from, to: p.data.to, group, measures: p.data.measures, result } };
  }
  if (name === 'day_details') {
    const p = detailsInput.safeParse(input);
    if (!p.success) return { ok: false, text: zodError(p.error) };
    if (p.data.days.length > MAX_DETAIL_DAYS) return { ok: false, text: `At most ${MAX_DETAIL_DAYS} days per call.` };
    return { ok: true, text: p.data.days.map((d) => dayText(d, data)).join('\n\n') };
  }
  return { ok: false, text: `Unknown tool ${name}.` };
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (day: string) => WEEKDAY_SHORT[parseDay(day).getDay()]!;
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const CLOCK_MEASURES = new Set(['bedtime', 'wake_time', 'first_meal', 'last_meal']);

/** A measure's value with its unit; clock measures as HH:MM. */
export function fmtMeasure(id: string, v: number): string {
  if (CLOCK_MEASURES.has(id)) {
    const minutes = Math.round(v * 60) % (24 * 60);
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }
  const m = MEASURE_BY_ID.get(id);
  const decimals = id === 'sleep_hours' ? 1 : Math.max(m?.decimals ?? 0, Math.abs(v) < 10 && v !== 0 ? 1 : 0);
  return `${fmtNumber(v, decimals)}${m?.unit ? ` ${m.unit}` : ''}`;
}

/** A chance (0–1) as a percentage that does not pretend to more precision than it has. */
export function fmtChance(p: number): string {
  if (p < 0.001) return 'under 0.1 %';
  return `${fmtNumber(p * 100, p < 0.1 ? 1 : 0)} %`;
}

const pct = (yes: number, n: number) => (n ? ` (${Math.round((100 * yes) / n)} %)` : '');

function countText(r: CountResult, hasGroup: boolean): string {
  const lines = [`${r.days} days in the period.`];
  if (!hasGroup) {
    lines.push(`Outcome on ${r.group.yes} of ${r.group.known} days that can be told${pct(r.group.yes, r.group.known)}; ${r.groupDays.length - r.group.known} days left out (cannot be told).`);
  } else {
    const groupUnknown = r.groupDays.filter((g) => g.outcome === null).length;
    const otherDays = r.days - r.unknownGroup - r.groupDays.length;
    lines.push(`Group days (all group conditions hold): ${r.groupDays.length}. Outcome on ${r.group.yes} of ${r.group.known}${pct(r.group.yes, r.group.known)}${groupUnknown ? `; on ${groupUnknown} it cannot be told` : ''}.`);
    lines.push(`Other days: ${otherDays}. Outcome on ${r.others.yes} of ${r.others.known}${pct(r.others.yes, r.others.known)}${otherDays - r.others.known ? `; on ${otherDays - r.others.known} it cannot be told` : ''}.`);
    if (r.unknownGroup) lines.push(`Left out because the group conditions cannot be told: ${r.unknownGroup} days.`);
    if (r.chance !== undefined) lines.push(`Chance check (Fisher exact, two-sided): a split at least this uneven turns up by chance alone in ${fmtChance(r.chance)} of cases.`);
  }
  if (r.groupDays.length) lines.push(`${hasGroup ? 'Group days' : 'Days'}: ${r.groupDays.map((g) => `${g.day} ${g.outcome === null ? '?' : g.outcome ? 'yes' : 'no'}`).join(', ')}.`);
  return lines.join('\n');
}

function statsText(id: string, s: Stats | undefined): string {
  if (!s) return 'no days with data';
  const min = s.minimumDays ? `; ${s.minimumDays} of these days include items without data for it, so their values are minimums` : '';
  return `average ${fmtMeasure(id, s.mean)}, median ${fmtMeasure(id, s.median)}, range ${fmtMeasure(id, s.min)} to ${fmtMeasure(id, s.max)} (${s.n} days${min})`;
}

function compareText(r: CompareResult, hasGroup: boolean): string {
  const lines = [`${r.days} days in the period.`];
  if (hasGroup) {
    lines.push(`Group days: ${r.groupDays.length}${r.unknownGroup ? `; ${r.unknownGroup} left out because the group conditions cannot be told` : ''}.`);
    if (r.groupDays.length) lines.push(`Group days: ${r.groupDays.join(', ')}.`);
  }
  for (const m of r.measures) {
    const name = `${m.measure} (${MEASURE_BY_ID.get(m.measure)?.name})`;
    if (!hasGroup) lines.push(`${name}: ${statsText(m.measure, m.group)}.`);
    else {
      const chance = m.chance !== undefined ? ` Chance check (shuffled days): a difference in averages at least this large turns up by chance alone in ${fmtChance(m.chance)} of cases.` : '';
      lines.push(`${name}: group days ${statsText(m.measure, m.group)}; other days ${statsText(m.measure, m.others)}.${chance}`);
    }
  }
  return lines.join('\n');
}

const STATUS_TEXT: Record<string, string> = {
  logged: 'logged',
  partial: 'partly logged',
  fasted: 'fasted',
  unknown: 'not logged',
  filled: 'not logged (marked "ate as usual")',
  excluded: 'left out by the user',
  pending: 'today, not over',
};

function dayText(day: string, data: InsightData): string {
  const f = data.days.get(day);
  if (!f) return `${day} ${weekday(day)}: no data (outside the diary).`;
  const v = f.values;
  const lines = [`${day} ${weekday(day)} · food log: ${STATUS_TEXT[f.status] ?? f.status}`];
  if (f.entries.length) lines.push(`food: ${f.entries.map((e) => `${clock(e.time)} ${e.label}${e.grams !== undefined ? ` ${fmtNumber(e.grams)} g` : ''}${e.supplement ? ' (supplement or drink mark)' : ''}`).join('; ')}`);
  if (f.foodComplete) lines.push(`totals: ${['ENERCC', 'PROT625', 'FAT', 'CHO', 'SUGAR', 'FIBT', 'alcohol'].map((id) => `${MEASURE_BY_ID.get(id)?.name.toLowerCase()} ${fmtMeasure(id, v[id] ?? 0)}${f.missing.has(id) ? ' (at least)' : ''}`).join(', ')}`);
  if (f.night) lines.push(`sleep: ${clock(f.night.start)}–${clock(f.night.end)} (${fmtMeasure('sleep_hours', v.sleep_hours ?? 0)})${v.nap_minutes ? `; naps ${fmtMeasure('nap_minutes', v.nap_minutes)}` : ''}`);
  else if (v.nap_minutes !== null) lines.push(`sleep: no night logged${v.nap_minutes ? `; naps ${fmtMeasure('nap_minutes', v.nap_minutes)}` : ''}`);
  if (f.activities.length) lines.push(`activity: ${f.activities.map((a) => `${clock(a.time)} ${a.name || a.kind} ${a.minutes} min${a.intensity ? `, ${a.intensity}` : ''}${a.outside ? ', outside' : ''}`).join('; ')}`);
  if (v.plain_water) lines.push(`plain water: ${fmtMeasure('plain_water', v.plain_water)}${v.total_water !== null ? `; with water in food ${fmtMeasure('total_water', v.total_water ?? 0)}` : ''}`);
  const habits = Object.entries(f.habits);
  if (habits.length) lines.push(`habits: ${habits.map(([name, kept]) => `${name} ${kept ? 'kept' : 'not kept'}`).join(', ')}`);
  if (f.journal.length) lines.push(`journal: ${f.journal.map((j) => `${clock(j.time)} ${j.text.replace(/\s+/g, ' ').trim()}`).join(' / ')}`);
  return lines.join('\n');
}

const KIND_NAME: Record<ShareKind, string> = { food: 'food log', journal: 'journal', sleep: 'sleep', activity: 'activity', water: 'water', habits: 'habits' };

const HABIT_KIND_TEXT: Record<InsightData['habits'][number]['kind'], string> = { do: 'to do', avoid: 'to avoid', minutes: 'minutes of activity, from the activity log' };

/**
 * The app's note with the first question: the period, what its data consists of, and what the user
 * chose not to share. `privateLeftOut`: the period has private journal entries the user kept back.
 */
export function insightNote(now: number, o: Overview, first: boolean, notShared: readonly ShareKind[] = [], privateLeftOut = false, habits: InsightData['habits'] = []): string {
  if (!first) return `(Now: ${fmtLocalDateTime(now)}.)`;
  const s = o.status;
  const parts = [
    `Now: ${fmtLocalDateTime(now)}.`,
    `Period chosen by the user: ${o.from} to ${o.to} (${o.days} days); the app shares no days outside it, so if the user asks about other days, say they can choose a longer period in a new chat.`,
    ...(notShared.length
      ? [`The user chose not to share their ${notShared.map((k) => KIND_NAME[k]).join(', ')}: the tools have no data for it, so draw no conclusions about it; if the question needs it, say they can tick it in a new chat.`]
      : []),
    ...(privateLeftOut
      ? ['The user keeps some journal entries private and did not share them: a day with only private entries reads as not mentioned, so say "not in the shared entries" rather than "never mentioned" where it matters.']
      : []),
    `In this period: food log complete on ${o.foodComplete} days (logged ${s.logged}, fasted ${s.fasted}), partly logged ${s.partial}, not logged ${s.unknown + s.filled}, left out by the user ${s.excluded}; ${o.journalEntries} journal entries on ${o.journalDays} days; sleep logged for ${o.nights} nights; activities on ${o.activityDays} days; plain water on ${o.waterDays} days${habits.length ? `; habits answered on ${o.habitDays} days` : ''}.`,
    ...(habits.length
      ? [
          `The user's habits (habit conditions use these names): ${habits.map((h) => `"${h.name}" (${HABIT_KIND_TEXT[h.kind]})`).join(', ')}. A habit condition holds on days it was kept (a habit to do done, a habit to avoid avoided, the minutes reached) and fails on days it was not; days not answered cannot be told.`,
        ]
      : []),
    "Today's food log counts as incomplete until the day is over.",
  ];
  return `(${parts.join(' ')})`;
}

/**
 * Send one question (or follow-up) and run the model until it answers. Returns the updated
 * conversation and the answer with every comparison the app computed for it.
 */
export async function askInsights(
  create: CreateMessage,
  model: AiModel,
  conversation: InsightConversation,
  question: { text: string; appNote: string },
  data: InsightData,
  onUsage?: (tokens: ModelTokens) => void,
): Promise<{ conversation: InsightConversation; outcome: InsightOutcome }> {
  const messages = [...conversation.messages, { role: 'user' as const, content: [{ type: 'text' as const, text: question.text.trim() }, { type: 'text' as const, text: question.appNote }] }];
  const checks: Check[] = [];
  const done = (outcome: InsightOutcome) => ({ conversation: { messages }, outcome });
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await create(insightParams(model, messages));
    onUsage?.(usageOf(res, model));
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'refusal') return done({ kind: 'error', reason: 'refusal' });
    if (res.stop_reason === 'max_tokens' || res.stop_reason === 'model_context_window_exceeded') return done({ kind: 'error', reason: 'tooLong' });
    if (res.stop_reason === 'pause_turn') continue;
    const uses = res.content.filter((b): b is Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (uses.length === 0) return done({ kind: 'reply', text: textOf(res.content), checks });
    const results: Beta.BetaToolResultBlockParam[] = uses.map((use) => {
      const r = runInsightTool(use.name, use.input, data);
      if (r.ok && r.check) checks.push(r.check);
      return { type: 'tool_result', tool_use_id: use.id, content: r.text, is_error: !r.ok };
    });
    messages.push({ role: 'user', content: results });
  }
  // The conversation ends on tool results the model never answered: drop the turn so a retry starts clean.
  return { conversation, outcome: { kind: 'error', reason: 'tooManySteps' } };
}
