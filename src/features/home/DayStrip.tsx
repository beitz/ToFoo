import { useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { addDays, parseDay } from '../../lib/dates';
import { Icon } from '../../ui/Icon';

/** The marks, each with what it means, for the ⓘ legend (owner's ask, 2026-10-22). */
const LEGEND = [
  { cls: 'day-logged', key: 'home.dayKey.logged' },
  { cls: 'day-partial', key: 'home.dayKey.partial' },
  { cls: 'day-fasted', key: 'home.dayKey.outlined' },
  { cls: 'day-unknown', key: 'home.dayKey.dashed' },
  { cls: 'day-today', key: 'home.dayKey.today' },
] as const;

/**
 * The days behind Home's numbers (design 2026-10-22): the days the averages cover (they end yesterday), each with a mark
 * for how it was logged, and today, which counts once it is over. Tap a day to open it in the diary; ⓘ explains the marks.
 */
export function DayStrip({ days: shown }: { days: number }) {
  const d = useData();
  const [legend, setLegend] = useState(false);
  const days = Array.from({ length: shown }, (_, i) => addDays(d.today, i - shown));
  return (
    <>
      <nav className="day-strip" aria-label={t('home.daysLabel')}>
        {[...days, d.today].map((day) => {
          const status = day === d.today ? 'today' : (d.model.dayStatus[day] ?? 'unknown');
          const date = parseDay(day);
          const label = status === 'today' ? t('home.dayToday') : t(`day.${status}` as MessageKey);
          return (
            <a key={day} href={href('diary', day)} className={`day-cell day-${status}`} aria-label={`${date.toLocaleDateString('en-GB', { weekday: 'long' })} ${date.getDate()}: ${label}`}>
              <span className="day-wd" aria-hidden>
                {date.toLocaleDateString('en-GB', { weekday: 'narrow' })}
              </span>
              <span className="day-num" aria-hidden>
                {date.getDate()}
              </span>
              <span className="day-mark" aria-hidden />
            </a>
          );
        })}
        <button type="button" className="day-info" aria-expanded={legend} aria-controls="days-legend" aria-label={t('home.daysInfo')} onClick={() => setLegend((o) => !o)}>
          <Icon name="info" size={16} />
        </button>
      </nav>
      {legend && (
        <div className="card day-legend" id="days-legend">
          <ul className="plain-list">
            {LEGEND.map((l) => (
              <li key={l.cls} className={l.cls}>
                <span className="day-mark" aria-hidden />
                <span>{t(l.key)}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('home.dayKey.more', { n: shown })}</p>
        </div>
      )}
    </>
  );
}
