import { useState } from 'react';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { addDays, parseDay } from '../../lib/dates';
import { addMonths, formatMonth, monthGrid, weekStart } from '../../lib/periods';
import { habitDay, habitRun, habitStart, habitTally, habitWeek, TALLY_WEEKS } from '../../logic/habits';
import { BackButton } from '../../ui/BackButton';
import { Icon } from '../../ui/Icon';
import { activitiesText, DaySheet, goalText, HabitActivitySheet, habitStyle, markText, MarkGlyph, quickText, shownMark, useQuickLog, weekdayName } from './HabitParts';
import { runText, tallyUnit, useHabit } from './HabitsPage';

/**
 * #/habits/<id>: one habit's month, every past day answerable or clearable; for a weekly goal its last
 * weeks; how often it was kept and its run.
 */
export function HabitPage({ id }: { id: string }) {
  const found = useHabit(id);
  const [month, setMonth] = useState<string>();
  const [day, setDay] = useState<string>();
  const [changing, setChanging] = useState(false);
  const quickLog = useQuickLog();
  if (!found) return null;
  const { habit: h, data } = found;
  if (!h)
    return (
      <section>
        <header className="page-head row">
          <BackButton to={['habits']} />
          <h1 className="grow">{t('habits.title')}</h1>
        </header>
        <p className="muted">{t('habits.gone')}</p>
      </section>
    );
  const thisMonth = data.today.slice(0, 7);
  const shown = month ?? thisMonth;
  const start = habitStart(h, data);
  const tally = habitTally(h, data);
  const run = habitRun(h, data);
  const weeks = h.goal.type === 'perWeek' ? [...Array(TALLY_WEEKS)].map((_, i) => addDays(weekStart(data.today), -7 * i)).filter((m) => addDays(m, 6) >= start) : [];

  return (
    <section style={habitStyle(h)}>
      <header className="page-head row">
        <BackButton to={['habits']} />
        <h1 className="grow habit-name">{h.name}</h1>
        <a className="icon-btn" href={href('habits', h.id, 'edit')} aria-label={t('habits.edit')}>
          <Icon name="edit" />
        </a>
      </header>
      <div className="card tracker-hero" data-tour="habits.summary">
        {h.goal.type === 'none' ? (
          <p>
            <span className="tracker-big">{tally.kept}</span> <span className="muted">{t(tally.kept === 1 ? 'habits.tally.day1' : 'habits.tally.days')}</span>
          </p>
        ) : tally.of ? (
          <p>
            <span className="tracker-big">{t('habits.tally.count', { n: tally.kept, of: tally.of })}</span> <span className="muted">{tallyUnit(tally)}</span>
          </p>
        ) : (
          <p className="muted">{t('habits.tally.none')}</p>
        )}
        <p className="muted small">
          {goalText(h)}
          {h.kind === 'minutes' && ` · ${activitiesText(h.activities)}`}
          {h.archived && ` · ${t('habits.isArchived')}`}
        </p>
        {h.goal.type !== 'none' && (
          <p className="small">
            {runText(run)} · {runText(run, 'longest')}
          </p>
        )}
        {h.quick && !h.archived && (
          <div className="sheet-actions">
            <button className="btn" onClick={() => setChanging(true)}>
              {t('habits.quickChange')}
            </button>
            <button className="btn btn-primary" onClick={() => void quickLog(h)} aria-label={t('habits.quickLog', { what: quickText(h.quick) })}>
              <Icon name="plus" size={16} /> {quickText(h.quick)}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row-between">
          <h2>{formatMonth(shown)}</h2>
          <span className="row">
            <button className="icon-btn" onClick={() => setMonth(addMonths(shown, -1))} aria-label={t('calendar.prev')}>
              <Icon name="back" />
            </button>
            <button className="icon-btn" disabled={shown >= thisMonth} onClick={() => setMonth(addMonths(shown, 1))} aria-label={t('calendar.next')}>
              <Icon name="chevron" />
            </button>
          </span>
        </div>
        <div className="calendar habit-calendar" role="grid" aria-label={formatMonth(shown)}>
          <div className="calendar-row calendar-weekdays" role="row">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <span key={n} role="columnheader" className="muted small">
                {weekdayName(n, 'narrow')}
              </span>
            ))}
          </div>
          {monthGrid(shown).map((week, wi) => (
            <div className="calendar-row" role="row" key={wi}>
              {week.map((day, i) => {
                if (!day) return <span key={i} role="gridcell" />;
                const num = Number(day.slice(8));
                if (day > data.today)
                  return (
                    <span key={day} role="gridcell" className="calendar-day off">
                      <span className="calendar-num">{num}</span>
                    </span>
                  );
                const s = habitDay(h, day, data, start);
                const value = h.kind === 'minutes' && s.minutes ? `${s.minutes}′` : null;
                const date = parseDay(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
                return (
                  <button
                    key={day}
                    role="gridcell"
                    className={`calendar-day habit-day${day === data.today ? ' today' : ''}`}
                    onClick={() => setDay(day)}
                    aria-label={`${date}: ${markText(h, shownMark(h, s.mark))}${value ? `, ${t('tracker.minutes', { m: s.minutes ?? 0 })}` : ''}`}
                  >
                    <span className="calendar-num">{num}</span>
                    {value && (s.mark !== 'kept' || h.goal.type === 'none') ? <span className="habit-day-minutes">{value}</span> : <MarkGlyph mark={shownMark(h, s.mark)} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="muted small">{t('habits.tapDay')}</p>
      </div>

      {weeks.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>{t('habits.weeks')}</h2>
          </div>
          <ul className="plain-list">
            {weeks.map((monday) => {
              const w = habitWeek(h, monday, data, start);
              return (
                <li key={monday} className="row-between tracker-row">
                  <span>{t('habits.weekOf', { day: parseDay(monday).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) })}</span>
                  <span className="small">
                    {t(h.kind === 'avoid' ? 'habits.card.max' : 'habits.card.week', { n: w.count, of: w.of, max: w.of })} · {t(`habits.outcome.${w.outcome}`)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {day && <DaySheet habit={h} day={day} onClose={() => setDay(undefined)} />}
      {changing && <HabitActivitySheet habit={h} day={data.today} onClose={() => setChanging(false)} />}
    </section>
  );
}
