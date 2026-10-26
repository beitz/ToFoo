/**
 * The pattern tools and their part of the assistant's system prompt (docs/SPEC.md, "Insights"),
 * added when the user includes their data in the chat: the model chooses what to compare, the
 * app's tools compute every number.
 */
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { CHANCE_HINT, CHANCE_PATTERN, DAY_STATUSES, MEASURES, OPS, type MeasureGroup } from '../logic/insights';

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const DAY = { type: 'string', description: 'Local day "YYYY-MM-DD".' };

const CONDITION = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['journal', 'food', 'measure', 'weekday', 'status'] },
    words: { type: 'array', items: { type: 'string' }, description: 'journal and food: words or word stems, any of them; empty otherwise.' },
    measure: { type: 'string', description: 'measure: a measure id from the list; empty otherwise.' },
    op: { type: 'string', enum: [...OPS], description: 'measure: how to compare; any value otherwise.' },
    value: { type: 'number', description: 'measure: the number to compare with, in the measure\'s unit; 0 otherwise.' },
    weekdays: { type: 'array', items: { type: 'string', enum: [...WEEKDAYS] }, description: 'weekday: any of these; empty otherwise.' },
    statuses: { type: 'array', items: { type: 'string', enum: [...DAY_STATUSES] }, description: 'status: any of these food-log statuses; empty otherwise.' },
    offset: { type: 'integer', description: 'Which day to check, relative to the day being counted: 0 the same day, -1 the day before, 1 the day after.' },
    span: { type: 'integer', description: '1: only that day. 3: that day and the 2 before it (holds if it holds on any of them; a measure: its average over them).' },
    negate: { type: 'boolean', description: 'true: the condition must not hold.' },
  },
  required: ['kind', 'words', 'measure', 'op', 'value', 'weekdays', 'statuses', 'offset', 'span', 'negate'],
  additionalProperties: false,
};

const CONDITIONS = (what: string) => ({ type: 'array', items: CONDITION, description: what });

/**
 * Not strict: their conditions are lists of objects, which would grow the main chat's compiled
 * grammar past the API's limit (see STRICT_NESTED in ./prompt.ts). The app validates every input
 * itself (src/ai/insights.ts) and sends errors back to the model.
 */
export const INSIGHT_TOOLS: BetaTool[] = [
  {
    name: 'read_journal',
    description: 'The journal entries of a period, oldest first, as "YYYY-MM-DD Weekday HH:MM | text". With words, only entries containing one of them.',
    input_schema: {
      type: 'object',
      properties: { from: DAY, to: DAY, words: { type: 'array', items: { type: 'string' }, description: 'Empty for all entries.' } },
      required: ['from', 'to', 'words'],
      additionalProperties: false,
    },
  },
  {
    name: 'count_days',
    description:
      'Count, in a period, on how many of the days where all group conditions hold the outcome conditions also hold, against the other days. Days where either cannot be told are left out and counted. Includes a chance check and the group days.',
    input_schema: {
      type: 'object',
      properties: {
        from: DAY,
        to: DAY,
        group: CONDITIONS('Conditions that pick the days to look at, all must hold, e.g. sleep_hours < 6.'),
        outcome: CONDITIONS('Conditions to count on those days, all must hold, e.g. the journal mentions a headache.'),
      },
      required: ['from', 'to', 'group', 'outcome'],
      additionalProperties: false,
    },
  },
  {
    name: 'compare_measures',
    description:
      'Average, median and range of measures on the days where all group conditions hold, against the other days, with a chance check for each. With no group conditions: over all days of the period.',
    input_schema: {
      type: 'object',
      properties: {
        from: DAY,
        to: DAY,
        group: CONDITIONS('Conditions that pick the days, all must hold; empty for all days.'),
        measures: { type: 'array', items: { type: 'string' }, description: 'Up to 8 measure ids.' },
      },
      required: ['from', 'to', 'group', 'measures'],
      additionalProperties: false,
    },
  },
  {
    name: 'day_details',
    description: 'Everything logged on some days: food log status, meals with foods and grams, energy, protein, alcohol, sleep, activities, water and journal entries.',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'array', items: DAY, description: 'Up to 31 days.' } },
      required: ['days'],
      additionalProperties: false,
    },
  },
];

const GROUP_TITLE: Record<MeasureGroup, string> = {
  food: 'Food (only on days whose food log is complete; nutrients as eaten after cooking and storage losses, not absorbed)',
  sleep: 'Sleep (a night belongs to the day it ended: sleep_hours on a day is the night before it)',
  activity: 'Activity',
  water: 'Water',
  journal: 'Journal',
};

function measureList(): string {
  return (Object.keys(GROUP_TITLE) as MeasureGroup[])
    .map((g) => {
      const items = MEASURES.filter((m) => m.group === g).map((m) => `${m.id} (${m.name}${m.unit ? `, ${m.unit}` : ''}${m.about ? `: ${m.about}` : ''})`);
      return `- ${GROUP_TITLE[g]}: ${items.join('; ')}.`;
    })
    .join('\n');
}

export const INSIGHT_GUIDE = `Looking for patterns (the user chose to include some of their data in this chat): look for patterns across their free-text journal, food log, sleep, activity and water, and answer their questions about them. The journal is in their own words, in German or English.

The core rule: you choose what to compare, the app computes every number. Every count, average, percentage and date in your answer comes from a tool result in this chat. Do not work out new numbers yourself (no sums, differences or percentages the tools did not give) and never estimate values.

Tools for this:
- read_journal: the journal entries of a period, all or those containing given words.
- count_days: on how many of the days where the group conditions hold (e.g. the night before was short) the outcome conditions held too (e.g. the journal mentions a headache), against the other days, with a chance check.
- compare_measures: a measure (sleep, energy, a nutrient, …) on the group days against the other days, or over all days of a period.
- day_details: everything logged on given days, to look at them closely or show them to the user.

Conditions: journal (words in that day's journal entries), food (words in the names of the foods and dishes logged that day, English or German), measure (a measure compared with a number), weekday, or status (the food log status of the day). offset moves a condition in time: -1 checks the day before the day being counted, 1 the day after. span widens it to several days ending at the offset day: it holds if it holds on any of them (a measure: its average over them). negate reverses it. All conditions in a list must hold. Give every field of a condition (empty lists, "", 0, false and span 1 where they do not apply). Words match parts of words, ignoring case and accents, so use stems and both languages: ["kopfschm", "kopfweh", "headache", "migr"]. Read the journal first to see which words the user actually uses.

Measures (id, name, unit):
${measureList()}

Only what the user chose to share is there: the period and the kinds of data (food log, journal, sleep, activity, water) in the app's note on the message they first shared it with. Days outside the period and kinds left out have no data, so the tools treat them as unknown.

Unknown stays unknown: a day whose food log is not complete, or a tracker before its first record, cannot be told and is left out of a comparison, never counted as zero or "no". Days without a journal entry count as "not mentioned" once the user has started the journal. The tool results say how many days were left out; mention it when it is many.

How to look for patterns:
- Start with read_journal over the period (unless the question is not about the journal), then see what recurs (symptoms, energy, mood, sleep complaints, digestion) and what might go with it. Compare several candidates at once, with several tool calls in one response: sleep the night before; alcohol and coffee (food words such as "kaffee", "coffee", "espresso", "cola") the same day and the day before; late, early or skipped meals; energy, protein, sugar, fibre; particular foods in the one or two days before; activity; water; the weekday. Delayed effects matter: try offset -1, and spans of 2 or 3 days where it makes sense.
- With one person and a few weeks of data many patterns are chance. The chance check says how often a split at least this uneven turns up by chance alone: under ${CHANCE_PATTERN * 100} % is worth mentioning as a possible pattern, ${CHANCE_PATTERN * 100} to ${CHANCE_HINT * 100} % is at most a hint, above that there is no clear pattern. The more comparisons you try, the more look striking by luck, so say roughly how many you looked at, and prefer patterns that are both lopsided and rest on more days.
- Each finding gives the pattern with the counts and days the tools gave ("headache on 4 of the 6 days after less than 6 h of sleep, on 3 of the other 25"), and the chance check in plain words. These are possible patterns, never causes: no medical advice or diagnoses. If something sounds like it needs a doctor (a symptom that keeps coming back or gets worse), say once, briefly, that it is worth checking with one.
- If the data is too thin for the question (few days logged, the outcome on only one or two days), say so plainly and say what to log to answer it later.
- The user may dig deeper ("show me those days", "and with coffee?"): use day_details or a narrower count.
- The user may also log things in the same chat: cards work as always, and a pattern answer never proposes cards unless asked.
- Pattern answers: lead with the answer, at most about five findings, short lists are fine, clock times as 23:30.`;
