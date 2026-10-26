/** Plain words for the comparisons the app ran, so each number under an answer says what it counts. */
import { t, type MessageKey } from '../../i18n';
import { fmtMeasure } from '../../ai/insights';
import { CHANCE_HINT, CHANCE_PATTERN, MEASURE_BY_ID, type Condition } from '../../logic/insights';
import { parseDay } from '../../lib/dates';

const OP_TEXT = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' } as const;

const quoted = (words: readonly string[]) => words.map((w) => `“${w}”`).join(t('insights.or'));
const weekdayName = (n: number) => parseDay(`2026-10-${String(4 + n).padStart(2, '0')}`).toLocaleDateString('en-GB', { weekday: 'long' }); // 4 Oct 2026 is a Sunday

/** When a condition looks, relative to the day counted; empty for the same day. */
function whenText(offset: number, span: number): string {
  const at = (o: number) => (o === -1 ? t('insights.when.dayBefore') : o < 0 ? t('insights.when.daysBefore', { n: -o }) : o === 1 ? t('insights.when.dayAfter') : t('insights.when.daysAfter', { n: o }));
  if (span <= 1) return offset === 0 ? '' : at(offset);
  if (offset === 0) return t('insights.when.upTo', { n: span - 1 });
  if (offset === -1) return t('insights.when.within', { n: span });
  return t('insights.when.spanTo', { n: span, when: at(offset) });
}

export function describeCondition(c: Condition): string {
  let s: string;
  switch (c.kind) {
    case 'journal':
      s = t('insights.c.journal', { words: quoted(c.words) });
      break;
    case 'food':
      s = t('insights.c.food', { words: quoted(c.words) });
      break;
    case 'measure': {
      const name = MEASURE_BY_ID.get(c.measure)?.name ?? c.measure;
      s = t('insights.c.measure', { name, op: OP_TEXT[c.op], value: fmtMeasure(c.measure, c.value) });
      if ((c.span ?? 1) > 1) s = t('insights.c.average', { c: s });
      break;
    }
    case 'weekday':
      s = c.weekdays.map(weekdayName).join(t('insights.or'));
      break;
    case 'habit':
      s = t('insights.c.habit', { name: c.habit });
      break;
    case 'status':
      s = t('insights.c.status', { statuses: c.statuses.map((x) => t(`day.${x}` as MessageKey).toLowerCase()).join(t('insights.or')) });
      break;
  }
  if (c.negate) s = t('insights.c.not', { c: s });
  const when = whenText(c.offset ?? 0, c.span ?? 1);
  return when ? t('insights.c.when', { c: s, when }) : s;
}

export function describeConditions(cs: readonly Condition[]): string {
  return cs.length ? cs.map(describeCondition).join(t('insights.and')) : t('insights.allDays');
}

export function verdict(chance: number): string {
  return t(chance < CHANCE_PATTERN ? 'insights.verdict.pattern' : chance < CHANCE_HINT ? 'insights.verdict.hint' : 'insights.verdict.chance');
}
