import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { addDays } from '../../lib/dates';
import { habitDay, habitRun, habitTally, isoWeekday, type HabitData, type HabitRun, type HabitTally } from '../../logic/habits';
import type { Habit } from '../../storage/types';
import { BackButton } from '../../ui/BackButton';
import { Icon } from '../../ui/Icon';
import { goalText, habitStyle, markText, MarkGlyph, shownMark, weekdayName } from './HabitParts';
import { useHabits } from './useHabits';

/**
 * #/habits (docs/SPEC.md, "Habits"): every habit with this week's days, how often it was kept and its
 * run; a habit opens its own page. Archived habits are folded away at the end.
 */
export function HabitsPage() {
  const habits = useHabits();
  if (!habits) return null;
  const archived = habits.all.filter((h) => h.archived);
  return (
    <section>
      <header className="page-head row">
        <BackButton />
        <h1 className="grow">{t('habits.title')}</h1>
        <a className="btn btn-small btn-primary" href={href('habits', 'new')}>
          <Icon name="plus" size={16} /> {t('habits.add')}
        </a>
      </header>
      {habits.active.length === 0 && (
        <div className="card">
          <p>{t('habits.empty')}</p>
          <p className="muted small">{t('habits.emptyHint')}</p>
        </div>
      )}
      {habits.active.length > 0 && (
        <div className="card habits-list" data-tour="habits.list">
          {habits.active.map((h) => (
            <HabitRow key={h.id} habit={h} data={habits.data} />
          ))}
        </div>
      )}
      {habits.active.length > 0 && (
        <p className="muted small" data-tour="habits.key">
          {t('habits.keyLine')}
        </p>
      )}
      {archived.length > 0 && (
        <details className="card habits-archived">
          <summary>{t('habits.archived', { n: archived.length })}</summary>
          {archived.map((h) => (
            <HabitRow key={h.id} habit={h} data={habits.data} />
          ))}
        </details>
      )}
    </section>
  );
}

/** The last 7 days, so a Monday still shows a week (owner's look: "this week" was one day on Mondays). */
function HabitRow({ habit: h, data }: { habit: Habit; data: HabitData }) {
  const days = [...Array(7)].map((_, i) => addDays(data.today, i - 6));
  const tally = habitTally(h, data);
  const run = habitRun(h, data);
  return (
    <a className="habit-row" href={href('habits', h.id)} style={habitStyle(h)}>
      <span className="habit-row-head">
        <strong className="habit-name">{h.name}</strong>
        <span className="muted small">{goalText(h)}</span>
      </span>
      <span className="habit-week" role="img" aria-label={days.map((day) => `${weekdayName(isoWeekday(day))} ${markText(h, shownMark(h, habitDay(h, day, data).mark))}`).join(', ')}>
        {days.map((day) => (
          <span key={day} className={day === data.today ? 'habit-week-day today' : 'habit-week-day'} aria-hidden>
            <span className="habit-week-letter">{weekdayName(isoWeekday(day), 'narrow')}</span>
            <MarkGlyph mark={shownMark(h, habitDay(h, day, data).mark)} />
          </span>
        ))}
      </span>
      <span className="muted small">
        {tallyText(tally)}
        {run.current > 1 && ` · ${runText(run)}`}
      </span>
    </a>
  );
}

/** "18 of 26 days this month", "5 of 8 weeks". */
export function tallyText(x: HabitTally): string {
  if (!x.of) return t('habits.tally.none');
  return `${t('habits.tally.count', { n: x.kept, of: x.of })} ${tallyUnit(x)}`;
}

/** "days this month · 3 open", the part under the big number on a habit's page. */
export function tallyUnit(x: HabitTally): string {
  return t(x.unit === 'days' ? 'habits.tally.days' : 'habits.tally.weeks') + (x.open ? ` · ${t('habits.tally.open', { n: x.open })}` : '');
}

/** "Run: 12 days", "Run: 3 weeks". */
export function runText(r: HabitRun, which: 'current' | 'longest' = 'current'): string {
  const n = r[which];
  return t(which === 'current' ? 'habits.run' : 'habits.longest', { n, unit: t(r.unit === 'days' ? (n === 1 ? 'habits.unit.day' : 'habits.unit.days') : n === 1 ? 'habits.unit.week' : 'habits.unit.weeks') });
}

export function useHabit(id: string): { habit: Habit | undefined; data: HabitData } | undefined {
  const habits = useHabits();
  const d = useData();
  if (!habits) return undefined;
  return { habit: habits.all.find((h) => h.id === id), data: { ...habits.data, today: d.today } };
}
