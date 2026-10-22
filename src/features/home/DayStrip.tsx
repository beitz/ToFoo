import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { addDays, parseDay } from '../../lib/dates';

/**
 * The days behind Home's numbers (design 2026-10-22): the days the averages cover (they end yesterday), each with a mark
 * for how it was logged, and today, which counts once it is over. Tap a day to open it in the diary.
 */
export function DayStrip({ days: shown }: { days: number }) {
  const d = useData();
  const days = Array.from({ length: shown }, (_, i) => addDays(d.today, i - shown));
  return (
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
    </nav>
  );
}
