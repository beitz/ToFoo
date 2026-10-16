import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { parseDay } from '../../lib/dates';
import { addMonths, formatMonth, monthGrid, presetRange } from '../../lib/periods';
import type { DayStatus } from '../../model/types';
import { Icon } from '../../ui/Icon';
import { isOn } from '../../settings/features';
import { DAY_ICON } from './dayStatus';

const STATUSES: Array<DayStatus | 'pending'> = ['logged', 'partial', 'fasted', 'unknown'];

/** Month view of day statuses; tap a day to open it in the diary. Route: #/calendar[/YYYY-MM]. */
export function CalendarPage({ month: monthParam }: { month?: string }) {
  const d = useData();
  const thisMonth = d.today.slice(0, 7);
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) && monthParam <= thisMonth ? monthParam : thisMonth;
  const weeks = monthGrid(month);
  const counts: Record<string, number> = {};
  for (const day of weeks.flat()) {
    const st = day ? d.model.dayStatus[day] : undefined;
    if (st) counts[st] = (counts[st] ?? 0) + 1;
  }
  const range = presetRange('month', `${month}-01`, d.today);
  const weekdays = [...Array(7)].map((_, i) => parseDay(`2026-10-${String(12 + i).padStart(2, '0')}`).toLocaleDateString('en-GB', { weekday: 'narrow' }));

  return (
    <section>
      <header className="page-head row-between">
        <button className="icon-btn" onClick={() => navigate('calendar', addMonths(month, -1))} aria-label={t('calendar.prev')}>
          <Icon name="back" />
        </button>
        <h1>{formatMonth(month)}</h1>
        <button className="icon-btn" disabled={month >= thisMonth} onClick={() => navigate('calendar', addMonths(month, 1))} aria-label={t('calendar.next')}>
          <Icon name="chevron" />
        </button>
      </header>

      <div className="calendar" role="grid" aria-label={formatMonth(month)}>
        <div className="calendar-row calendar-weekdays" role="row">
          {weekdays.map((w, i) => (
            <span key={i} role="columnheader" className="muted small">
              {w}
            </span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div className="calendar-row" role="row" key={wi}>
            {week.map((day, i) => {
              if (!day) return <span key={i} role="gridcell" />;
              const st = d.model.dayStatus[day];
              const num = Number(day.slice(8));
              if (!st || day > d.today)
                return (
                  <span key={day} role="gridcell" className="calendar-day off" aria-label={String(num)}>
                    <span className="calendar-num">{num}</span>
                  </span>
                );
              return (
                <a key={day} role="gridcell" className={`calendar-day day-${st}${day === d.today ? ' today' : ''}`} href={href('diary', day)} aria-label={`${parseDay(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}: ${t(`day.${st}` as MessageKey)}`}>
                  <span className="calendar-num">{num}</span>
                  <Icon name={DAY_ICON[st]} size={16} />
                </a>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="calendar-legend plain-list">
        {STATUSES.map((s) => (
          <li key={s} className={`day-${s}`}>
            <Icon name={DAY_ICON[s]} size={16} /> {t(`day.${s}` as MessageKey)} · {counts[s] ?? 0}
          </li>
        ))}
      </ul>
      <p className="muted small">{t(isOn(d.settings.features, 'fillUnloggedDays') ? 'calendar.hintFilled' : 'calendar.hint')}</p>

      <a className="btn btn-secondary btn-block" href={href('review', range.from, range.to)}>
        <Icon name="bars" /> {t('calendar.monthNutrients')}
      </a>
    </section>
  );
}
