/**
 * The pattern tools of the assistant (docs/SPEC.md, "Insights"), there when the user includes their
 * data in a chat: the model reads the journal and asks the app for counts and averages; the app
 * answers from src/logic/insights.ts, reading only the data the user chose to share.
 */
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
  periodDays,
  type CompareResult,
  type Condition,
  type CountResult,
  type InsightData,
  type Overview,
  type ShareKind,
  type Stats,
} from '../logic/insights';
import { sleepCheck, type Bands, type SleepCheck, type StandOutLine } from '../logic/sleepCheck';
import { caffeineGapHours, napLines, oftenNights, sleepDuration, sleepQuality, SLEEP_AGE_FROM } from '../../model/sleep';
import { INSIGHT_TOOLS, WEEKDAYS } from './insightsPrompt';

/** The pattern tools' names, which the assistant's loop hands to runInsightTool. */
export const INSIGHT_TOOL_NAMES: ReadonlySet<string> = new Set(INSIGHT_TOOLS.map((t) => t.name));

const MAX_MEASURES = 8;
const MAX_DETAIL_DAYS = 31;
/** Values per daily table: three months of 50 measures, about 15k tokens; more would crowd out the rest of the chat. */
const MAX_TABLE_CELLS = 5000;
/** Journal entries per read: a few months of daily notes; more would crowd out the comparisons. */
const MAX_JOURNAL_ENTRIES = 400;

/** One comparison the app computed in a turn, shown under the answer so its numbers can be checked. */
export type Check =
  | { kind: 'count'; from: string; to: string; group: Condition[]; outcome: Condition[]; result: CountResult }
  | { kind: 'compare'; from: string; to: string; group: Condition[]; measures: string[]; result: CompareResult };

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
const tableInput = z.object({ ...period, measures: z.array(z.string()).min(1) });
const sleepInput = z.object({ ...period, caffeine_words: z.array(z.string()).default([]) });

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
  if (name === 'daily_table') {
    const p = tableInput.safeParse(input);
    if (!p.success) return { ok: false, text: zodError(p.error) };
    const bad = periodProblem(p.data.from, p.data.to);
    if (bad) return { ok: false, text: bad };
    const measures = [...new Set(p.data.measures)];
    const unknown = measures.filter((m) => !MEASURE_BY_ID.has(m));
    if (unknown.length) return { ok: false, text: `Unknown measures: ${unknown.join(', ')}.` };
    const days = periodDays(data, p.data.from, p.data.to);
    if (days.length * measures.length > MAX_TABLE_CELLS)
      return { ok: false, text: `${days.length} days × ${measures.length} measures is more than ${MAX_TABLE_CELLS} values: choose fewer measures or a shorter period.` };
    return { ok: true, text: tableText(data, days, measures) };
  }
  if (name === 'sleep_check') {
    const p = sleepInput.safeParse(input);
    if (!p.success) return { ok: false, text: zodError(p.error) };
    const bad = periodProblem(p.data.from, p.data.to);
    if (bad) return { ok: false, text: bad };
    if (!data.sleepProfile) return { ok: false, text: 'Sleep is not shared in this chat (or nothing is logged yet), so there are no nights to check.' };
    return { ok: true, text: sleepCheckText(sleepCheck(data, p.data.from, p.data.to, data.sleepProfile, p.data.caffeine_words), p.data.from, p.data.to) };
  }
  return { ok: false, text: `Unknown tool ${name}.` };
}

const AGE_TEXT = { young: `young adults (${SLEEP_AGE_FROM.young}–${SLEEP_AGE_FROM.adult - 1})`, adult: `adults (${SLEEP_AGE_FROM.adult}–${SLEEP_AGE_FROM.older - 1})`, older: `older adults (${SLEEP_AGE_FROM.older} and over)` };

const STAND_OUT_TEXT: Record<StandOutLine, string> = {
  underNeed: 'under their sleep need',
  tooShort: 'shorter than the NSF recommends for their age',
  tooLong: 'longer than the NSF recommends for their age',
  wakeUps: 'woken often (NSF: not good sleep quality)',
  awake: 'awake long in the night (NSF: not good sleep quality)',
  share: 'a low share of the night asleep (NSF: not good sleep quality)',
  longNaps: `naps of ${napLines.longMinutes.value} min or more a day (Yamada 2015)`,
  caffeine: `caffeine less than ${fmtNumber(caffeineGapHours.value, 1)} h before falling asleep (Gardiner 2023)`,
};

const hm = (minutes: number) => `${Math.floor(Math.round(minutes) / 60)} h ${String(Math.round(minutes) % 60).padStart(2, '0')} min`;
const bands = (b: Bands, labels: [string, string, string | undefined]) =>
  [`${labels[0]} on ${b.good}`, `${labels[1]} on ${b.between}`, ...(labels[2] ? [`${labels[2]} on ${b.poor}`] : [])].join(', ');

/** sleep_check's answer: the counts per line, each line with its source, and what is worth mentioning. */
function sleepCheckText(c: SleepCheck, from: string, to: string): string {
  const g = c.profile.ageGroup;
  const q = sleepQuality;
  const dur = sleepDuration.value;
  const lines = [
    `Sleep check ${from} to ${to}: ${c.nights} nights logged of ${c.days} days.`,
    `Lines for ${AGE_TEXT[g]}${c.profile.ageUnknown ? ' (no birth year in the profile, so the adult lines)' : ', the user\'s age group'}; the user's sleep need: ${fmtNumber(c.profile.needHours, 1)} h (${c.profile.ownNeed ? 'their own, set in Profile' : 'the default: AASM/SRS consensus, Watson 2015'}).`,
  ];
  if (!c.nights) return [...lines, 'No nights to check.'].join('\n');
  const L = c.length!;
  lines.push(
    `Length: average ${fmtNumber(L.mean, 1)} h asleep. Under the user's need on ${L.underNeed} nights; under ${dur.notBelow[g]} h (NSF: not recommended, Hirshkowitz 2015) on ${L.tooShort}; over ${dur.notAbove[g]} h (not recommended) on ${L.tooLong}. NSF recommends ${dur.recommended[g][0]}–${dur.recommended[g][1]} h.`,
    `Wake-ups over ${q.awakenings.value.minMinutes} min (logged as separate sleeps), NSF sleep quality lines (Ohayon 2017): ${bands(c.wakeUps, [`${q.awakenings.value.goodMax[g]} or fewer (good)`, 'in between (no agreed line)', `${q.awakenings.value.poorMin} or more (not good)`])}.`,
    `Awake in the night in all: ${bands(c.awake, [`${q.awakeMinutes.value.goodMax} min or less (good)`, q.awakeMinutes.value.poorMin[g] === null ? 'more (the panel agreed on no poor line for this age)' : 'in between', q.awakeMinutes.value.poorMin[g] === null ? undefined : `${q.awakeMinutes.value.poorMin[g]} min or more (not good)`])}.`,
    `Share asleep from first falling asleep to last waking up${c.share.mean !== undefined ? `, average ${Math.round(c.share.mean)} %` : ''}: ${bands(c.share, [`${q.efficiency.value.goodMin} % or more (good)`, 'in between', `${q.efficiency.value.poorMax[g]} % or less (not good)`])}. The panel's sleep efficiency counts from getting into bed, which the app does not know, so a measured efficiency would be lower.`,
  );
  const t = c.timing;
  if (t)
    lines.push(
      `Timing: first asleep median ${fmtMeasure('bedtime', t.bed.median)}, varying by ${hm(t.bed.sd * 60)} (standard deviation); up median ${fmtMeasure('wake_time', t.up.median)}, varying by ${hm(t.up.sd * 60)}.${t.weekend ? ` Middle of the night on weekend nights (ending Saturday or Sunday; the app does not know the user's work days) ${hm(Math.abs(t.weekend.shiftMinutes))} ${t.weekend.shiftMinutes >= 0 ? 'later' : 'earlier'} than on the other nights (${t.weekend.nights} and ${t.weekend.otherNights} nights).` : ''} No sourced line for either: compare with the user's own weeks.`,
    );
  const n = c.naps;
  lines.push(
    `Naps: on ${n.napDays} of ${n.trackedDays} days; ${napLines.longMinutes.value} min or more in a day (Yamada 2015: linked to more heart disease) on ${n.longDays}; a nap over ${napLines.tooLongMinutes.value} min (NSF: not good) on ${n.tooLong}; ${napLines.manyPerDay.value} or more naps (NSF: not good) on ${n.many}.`,
  );
  if (c.caffeine) {
    const k = c.caffeine;
    lines.push(
      `Caffeine (food names with ${k.words.map((w) => `"${w}"`).join(', ')}), within 24 h before falling asleep: on ${k.known} nights it can be told (complete food log or a match); less than ${fmtNumber(caffeineGapHours.value, 1)} h before (Gardiner 2023: shortens sleep) on ${k.within}; none in those 24 h on ${k.none}${k.medianGapHours !== undefined ? `; median ${fmtNumber(k.medianGapHours, 1)} h before` : ''}.`,
    );
  }
  const { perWeek, minNights } = oftenNights.value;
  lines.push(
    c.standsOut.length
      ? `Worth mentioning (on ${perWeek} or more nights a week on average): ${c.standsOut.map((s) => `${STAND_OUT_TEXT[s.line]} on ${s.count} of ${s.of}`).join('; ')}.`
      : c.nights < minNights
        ? `Too few nights (under ${minNights}) to call anything frequent.`
        : `Nothing crosses a line on ${perWeek} or more nights a week: nothing worth mentioning against the norms.`,
  );
  return lines.join('\n');
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

/** A value for the daily table: no units or thousands separators, clock measures as HH:MM. */
function cell(id: string, v: number): string {
  if (CLOCK_MEASURES.has(id)) return fmtMeasure(id, v);
  const decimals = id === 'sleep_hours' ? 1 : (MEASURE_BY_ID.get(id)?.decimals ?? 0);
  return String(Math.round(v * 10 ** decimals) / 10 ** decimals);
}

/** One row per day, units once in the header, nothing repeated: day-by-day values at the fewest tokens. */
function tableText(data: InsightData, days: readonly string[], measures: readonly string[]): string {
  if (!days.length) return 'No shared days in this period.';
  const head = measures.map((id) => {
    const unit = CLOCK_MEASURES.has(id) ? 'HH:MM' : MEASURE_BY_ID.get(id)?.unit;
    return unit ? `${id} (${unit})` : id;
  });
  const rows = days.map((day) => {
    const f = data.days.get(day)!;
    const cells = measures.map((id) => {
      const v = f.values[id];
      return v === null || v === undefined ? '' : `${cell(id, v)}${f.missing.has(id) ? '*' : ''}`;
    });
    return [`${day} ${weekday(day)}`, ...cells].join(',');
  });
  return [
    `${days.length} days, ${days[0]} to ${days[days.length - 1]}. Empty: unknown that day (not logged, not tracked yet or not shared). *: at least this much (some items had no data for it).`,
    ['day', ...head].join(','),
    ...rows,
  ].join('\n');
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
  const span = (p: { start: number; end: number }) => `${clock(p.start)}–${clock(p.end)}`;
  const naps = f.naps.length ? `; naps ${f.naps.map(span).join(', ')} (${fmtMeasure('nap_minutes', v.nap_minutes ?? 0)})` : '';
  if (f.night) {
    const woke = v.wake_ups ? `; woken ${v.wake_ups} ${v.wake_ups === 1 ? 'time' : 'times'}, awake ${fmtMeasure('awake_minutes', v.awake_minutes ?? 0)}` : '';
    lines.push(`sleep: ${f.night.parts.map(span).join(', ')} (${fmtMeasure('sleep_hours', v.sleep_hours ?? 0)} asleep${woke})${naps}`);
  } else if (v.nap_minutes !== null) lines.push(`sleep: no night logged${naps}`);
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
 * The app's note on the message the user first shares their data with: the period, what its data
 * consists of, and what the user chose not to share. `privateLeftOut`: the period has private
 * journal entries the user kept back.
 */
export function shareNote(o: Overview, notShared: readonly ShareKind[] = [], privateLeftOut = false, habits: InsightData['habits'] = []): string {
  const s = o.status;
  return [
    `The user included their data from now on. Period chosen by the user: ${o.from} to ${o.to} (${o.days} days); the app shares no days outside it, so if the user asks about other days, say they can choose a longer period in a new chat.`,
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
  ].join(' ');
}
