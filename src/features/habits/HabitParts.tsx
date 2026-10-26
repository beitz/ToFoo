import { useState, type CSSProperties } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t, type MessageKey } from '../../i18n';
import { formatDay, parseDay } from '../../lib/dates';
import { activityCounts, type HabitMark } from '../../logic/habits';
import { repo } from '../../storage/repo';
import type { Habit, HabitActivity } from '../../storage/types';
import { Sheet } from '../../ui/controls';
import { atDayMinute } from '../../logic/catchUp';
import { ActivitySheet } from '../activity/ActivitySheet';
import { activityName } from '../activity/ActivityForm';

/** The habit's colour for its name and marks (it tells habits apart, never status). */
export const habitStyle = (h: Pick<Habit, 'colour'>) => ({ '--hc': `var(--habit-${h.colour})` }) as CSSProperties;

/** A mark as shown: `quiet` is a day of a weekly "do" goal that didn't count (no day is due, so it is neither missed nor open). */
export type ShownMark = HabitMark | 'quiet';

/** ✓ kept, ✗ missed, ○ open, – not due, · nothing counted: shapes, so status never rests on colour. */
export const MARK_GLYPH: Record<ShownMark, string> = { kept: '✓', missed: '✗', open: '○', off: '–', quiet: '·' };

/** How a day's mark is shown for this habit. */
export function shownMark(h: Pick<Habit, 'kind' | 'goal'>, mark: HabitMark): ShownMark {
  return h.goal.type === 'perWeek' && h.kind !== 'avoid' && (mark === 'open' || mark === 'missed') ? 'quiet' : mark;
}

export function MarkGlyph({ mark }: { mark: ShownMark }) {
  return (
    <span className={`habit-mark mark-${mark}`} aria-hidden>
      {MARK_GLYPH[mark]}
    </span>
  );
}

/** What a mark means for this habit, read out and in sheets ("Done", "Had some", "Not answered"). */
export function markText(h: Pick<Habit, 'kind'>, mark: ShownMark): string {
  if (mark === 'quiet') return t('habits.mark.quiet');
  if (mark === 'open') return t('habits.mark.open');
  if (mark === 'off') return t('habits.mark.off');
  return t(`habits.mark.${h.kind}.${mark}` as MessageKey);
}

/** The two answers for a do or avoid habit: what `did: true` and `did: false` mean. */
export function answerLabels(h: Pick<Habit, 'kind'>): { yes: string; no: string } {
  return h.kind === 'avoid' ? { yes: t('habits.answer.hadSome'), no: t('habits.answer.none') } : { yes: t('habits.answer.done'), no: t('habits.answer.notDone') };
}

const WEEKDAY_ANCHOR = '2026-10-12'; // a Monday

/** "Mon", "Tue"… for 1 = Monday … 7 = Sunday. */
export function weekdayName(n: number, style: 'short' | 'narrow' = 'short'): string {
  const d = parseDay(WEEKDAY_ANCHOR);
  d.setDate(d.getDate() + n - 1);
  return d.toLocaleDateString('en-GB', { weekday: style });
}

/** "Every day", "Mon, Wed, Fri", "2× a week"; for avoid habits "Never", "Not on Mon, Fri", "At most 2 days a week". */
export function goalText(h: Pick<Habit, 'kind' | 'goal' | 'minutes'>): string {
  const g = h.goal;
  const days = g.type === 'weekdays' ? [...g.days].sort().map((n) => weekdayName(n)).join(', ') : '';
  const when =
    h.kind === 'avoid'
      ? g.type === 'daily'
        ? t('habits.goal.never')
        : g.type === 'weekdays'
          ? t('habits.goal.notOn', { days })
          : t('habits.goal.atMost', { n: g.times })
      : g.type === 'daily'
        ? t('habits.goal.daily')
        : g.type === 'weekdays'
          ? days
          : t('habits.goal.perWeek', { n: g.times });
  return h.kind === 'minutes' ? `${t('tracker.minutes', { m: h.minutes ?? 0 })} · ${when}` : when;
}

/** "Run, Yoga" or "Any activity". */
export function activitiesText(picks: readonly HabitActivity[] | undefined): string {
  return picks?.length ? picks.map((p) => activityName(p)).join(', ') : t('habits.anyActivity');
}

/** Set a do or avoid habit's answer for a day (null clears it), with undo. */
export function useAnswer() {
  const toast = useToast();
  return async (h: Habit, day: string, did: boolean | null) => {
    const old = await repo.setHabitDay(h.id, day, did);
    const labels = answerLabels(h);
    toast(t('habits.answered', { name: h.name, answer: did === null ? t('habits.mark.open') : did ? labels.yes : labels.no }), () => repo.restoreHabitDay(h.id, day, old));
  };
}

/** The activity sheet for a minutes habit: its first activity and its minutes filled in, the others as chips. */
export function HabitActivitySheet({ habit: h, day, onClose }: { habit: Habit; day: string; onClose: () => void }) {
  const d = useData();
  const picks = h.activities ?? [];
  const patch = (p: HabitActivity) => ({ kind: p.kind, name: p.name ?? '' });
  const time = day === d.today ? Date.now() : atDayMinute(day, 12 * 60);
  return (
    <ActivitySheet
      defaultTime={time}
      onClose={onClose}
      initial={{ ...(picks[0] ? patch(picks[0]) : {}), minutes: h.minutes, outside: picks[0]?.kind === 'walk' || picks[0]?.kind === 'run' || picks[0]?.kind === 'cycling' }}
      presets={picks.map((p) => ({ label: activityName(p), patch: patch(p) }))}
    />
  );
}

/** Answer or change one day of a habit: two answers and "Not answered" for do and avoid, the day's activities for minutes. */
export function DaySheet({ habit: h, day, onClose }: { habit: Habit; day: string; onClose: () => void }) {
  const d = useData();
  const answer = useAnswer();
  const [adding, setAdding] = useState(false);
  const title = `${h.name} · ${formatDay(day, d.today)}`;
  if (adding) return <HabitActivitySheet habit={h} day={day} onClose={onClose} />;
  if (h.kind === 'minutes') {
    const acts = d.activities.filter((a) => a.day === day && activityCounts(h, a));
    return (
      <Sheet title={title} onClose={onClose}>
        <p className="muted small">{activitiesText(h.activities)}</p>
        {acts.length ? (
          <ul className="plain-list">
            {acts.map((a) => (
              <li key={a.id} className="row-between tracker-row">
                <span>{activityName(a)}</span>
                <span className="muted small">{t('tracker.minutes', { m: a.minutes })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">{t('habits.noActivityThatDay')}</p>
        )}
        <div className="sheet-actions">
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            {t('habits.addActivity')}
          </button>
        </div>
      </Sheet>
    );
  }
  const labels = answerLabels(h);
  const set = async (did: boolean | null) => {
    await answer(h, day, did);
    onClose();
  };
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="habit-answers">
        <button className="btn btn-secondary" onClick={() => void set(true)}>
          {labels.yes}
        </button>
        <button className="btn btn-secondary" onClick={() => void set(false)}>
          {labels.no}
        </button>
        <button className="btn btn-ghost" onClick={() => void set(null)}>
          {t('habits.clear')}
        </button>
      </div>
    </Sheet>
  );
}
