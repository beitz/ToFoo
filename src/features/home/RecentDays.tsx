import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { addDays, formatDay, formatTime } from '../../lib/dates';
import { fmtAmount } from '../../lib/format';
import { Icon } from '../../ui/Icon';

/**
 * Today and yesterday at the bottom of Home (design 2026-10-22): one line per meal with its time,
 * what was in it and its energy, each opening the meal's nutrients; then a link to every day.
 */
export function RecentDays() {
  const d = useData();
  const byId = new Map(d.log.map((e) => [e.id, e]));
  const days = [d.today, addDays(d.today, -1)];
  return (
    <div className="recent-days">
      {days.map((day) => {
        const meals = d.model.meals.filter((m) => m.day === day);
        const kcal = meals.reduce((s, m) => s + (m.intake.ENERCC ?? 0), 0);
        return (
          <section key={day} className="recent-day" aria-label={formatDay(day, d.today)}>
            <h2 className="recent-day-head">
              <a href={href('diary', day)}>{formatDay(day, d.today)}</a>
              <span className="muted small">
                {' · '}
                {meals.length ? t('home.recentMeals', { n: meals.length }) + ` · ${fmtAmount('ENERCC', kcal)}` : day === d.today ? t('home.nothingYet') : t(`day.${d.model.dayStatus[day] ?? 'unknown'}` as never)}
              </span>
            </h2>
            {meals.length > 0 && (
              <ul className="plain-list recent-list">
                {meals.map((m) => {
                  const labels = m.entryIds.map((id) => byId.get(id)?.label).filter(Boolean);
                  const e = m.intake.ENERCC;
                  return (
                    <li key={m.entryIds[0]}>
                      <a className="recent-row" href={href('meal', m.entryIds[0]!)}>
                        <span className="recent-time">{formatTime(m.start)}</span>
                        <span className="recent-what">{labels.join(' · ')}</span>
                        <span className="recent-kcal">{e !== undefined && e > 0 ? fmtAmount('ENERCC', e) : ''}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      <a className="recent-all" href={href('diary')}>
        <span className="grow">{t('home.allDays')}</span>
        <Icon name="chevron" size={16} />
      </a>
    </div>
  );
}
