import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import { formatDay, formatTime } from '../../lib/dates';
import { activitySummary, perDay, windowDays } from '../../logic/trackers';
import type { ActivityRecord } from '../../storage/types';
import { BackButton } from '../../ui/BackButton';
import { Icon } from '../../ui/Icon';
import { ActivitySheet } from '../activity/ActivitySheet';
import { activityName } from '../activity/ActivityForm';
import { hmText } from '../sleep/format';
import { DayBars, MissingDays, useMissingDays, WindowSwitch, type Window } from './TrackerParts';

/**
 * #/activity (owner's ask, 2026-10-23: every tracker gets a page): minutes per day over 7, 30 or 90
 * days, the days nothing was logged (to fill in), what you do most, and every entry to edit.
 */
export function ActivityPage() {
  const d = useData();
  const [win, setWin] = useState<Window>('30');
  const [sheet, setSheet] = useState<ActivityRecord | 'new' | null>(null);
  const days = useMemo(() => windowDays(d.today, Number(win)), [d.today, win]);
  const s = useMemo(() => activitySummary(d.activities, days), [d.activities, days]);
  const minutes = useMemo(() => perDay(d.activities, days, (r) => r.minutes), [d.activities, days]);
  const missing = useMissingDays('activity', days);
  const entries = d.activities.filter((a) => a.day >= days[0]!).sort((a, b) => b.time - a.time);
  const top = Math.max(60, ...minutes.values());

  return (
    <section>
      <header className="page-head row">
        <BackButton to={['calendar']} />
        <h1 className="grow">{t('activity.short')}</h1>
        <button className="btn btn-small btn-primary" onClick={() => setSheet('new')}>
          <Icon name="plus" size={16} /> {t('tracker.add')}
        </button>
      </header>
      <WindowSwitch value={win} onChange={setWin} />

      <div className="card tracker-hero">
        <p className="tracker-big">{s.averageMinutes !== undefined ? t('tracker.minPerDay', { m: s.averageMinutes }) : '–'}</p>
        <p className="muted small">
          {t('tracker.loggedOf', { n: s.loggedDays, of: days.length })}
          {s.totalMinutes > 0 && ` · ${t('tracker.total', { hm: hmText(s.totalMinutes) })} · ${t('tracker.outside', { hm: hmText(s.outsideMinutes) })}`}
        </p>
        <DayBars
          days={days}
          values={minutes}
          missing={new Set(missing ?? [])}
          top={top}
          layer="activity"
          spoken={(day, v) => `${formatDay(day, d.today)}: ${v !== undefined ? t('tracker.minutes', { m: v }) : t('calendar.mark.missing')}`}
        />
        <p className="muted small">{t('tracker.averageNote')}</p>
      </div>

      <MissingDays days={missing ?? []} />

      {s.top.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>{t('tracker.mostOften')}</h2>
          </div>
          <ul className="plain-list">
            {s.top.map((g) => (
              <li key={`${g.kind}|${g.name ?? ''}`} className="row-between tracker-row">
                <span>{activityName(g)}</span>
                <span className="muted small">{t('tracker.timesTotal', { n: g.count, hm: hmText(g.minutes) })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>{t('tracker.entries')}</h2>
        </div>
        {entries.length === 0 ? (
          <p className="muted small">{t('tracker.none')}</p>
        ) : (
          <ul className="plain-list">
            {entries.map((a) => (
              <li key={a.id}>
                <button className="entry-row" onClick={() => setSheet(a)}>
                  <span className="entry-label">
                    {activityName(a)} · {t('tracker.minutes', { m: a.minutes })}
                    {a.outside ? ` · ${t('tracker.outsideShort')}` : ''}
                  </span>
                  <span className="muted small">
                    {formatDay(a.day, d.today)}, {formatTime(a.time)}
                  </span>
                  <span className="entry-edit">
                    <Icon name="edit" size={16} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {sheet && <ActivitySheet activity={sheet === 'new' ? undefined : sheet} defaultTime={Date.now()} onClose={() => setSheet(null)} />}
    </section>
  );
}
