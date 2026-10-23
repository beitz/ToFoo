import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import { formatDay, formatTime } from '../../lib/dates';
import { perDay, waterSummary, windowDays } from '../../logic/trackers';
import { dayWater, waterTarget } from '../../logic/water';
import { repo } from '../../storage/repo';
import type { WaterRecord } from '../../storage/types';
import { BackButton } from '../../ui/BackButton';
import { Icon } from '../../ui/Icon';
import { waterText } from '../water/format';
import { WaterSheet } from '../water/WaterSheet';
import { DayBars, MissingDays, useMissingDays, WindowSwitch, type Window } from './TrackerParts';

/**
 * #/water (owner's ask, 2026-10-23): water per day against the DGE guide value over 7, 30 or 90 days.
 * A day counts once plain water is logged for it; then the water in its food and other drinks is added,
 * as on the day's card. Days without plain water are not logged, never zero.
 */
export function WaterPage() {
  const d = useData();
  const records = useLiveQuery(() => repo.db.water.toArray(), []);
  const [win, setWin] = useState<Window>('30');
  const [sheet, setSheet] = useState<WaterRecord | 'new' | null>(null);
  const days = useMemo(() => windowDays(d.today, Number(win)), [d.today, win]);
  const target = waterTarget(d.requirements.ageGroup);
  const totals = useMemo(() => {
    const plain = perDay(records ?? [], days, (r) => r.ml);
    return new Map([...plain.keys()].map((day) => [day, dayWater(day, d.modelEntries, records ?? []).totalMl]));
  }, [records, days, d.modelEntries]);
  const s = waterSummary(totals, target);
  const missing = useMissingDays('water', days);
  if (!records) return null;
  const entries = records.filter((w) => w.day >= days[0]!).sort((a, b) => b.time - a.time);

  return (
    <section>
      <header className="page-head row">
        <BackButton to={['calendar']} />
        <h1 className="grow">{t('water.title')}</h1>
        <button className="btn btn-small btn-primary" onClick={() => setSheet('new')}>
          <Icon name="plus" size={16} /> {t('tracker.add')}
        </button>
      </header>
      <WindowSwitch value={win} onChange={setWin} />

      <div className="card tracker-hero">
        <p className="tracker-big">{s.averageMl !== undefined ? t('tracker.perDay', { amount: waterText(s.averageMl) }) : '–'}</p>
        <p className="muted small">
          {t('tracker.loggedOf', { n: s.loggedDays, of: days.length })} · {t('tracker.atGuide', { n: s.daysAtTarget, target: waterText(target) })}
        </p>
        <DayBars
          days={days}
          values={totals}
          missing={new Set(missing ?? [])}
          top={Math.max(target * 1.3, ...totals.values())}
          target={target}
          layer="water"
          spoken={(day, v) => `${formatDay(day, d.today)}: ${v !== undefined ? waterText(v) : t('calendar.mark.missing')}`}
        />
        <p className="muted small">{t('tracker.waterNote', { target: waterText(target) })}</p>
      </div>

      <MissingDays days={missing ?? []} />

      <div className="card">
        <div className="card-head">
          <h2>{t('tracker.entries')}</h2>
        </div>
        {entries.length === 0 ? (
          <p className="muted small">{t('tracker.none')}</p>
        ) : (
          <ul className="plain-list">
            {entries.map((w) => (
              <li key={w.id}>
                <button className="entry-row" onClick={() => setSheet(w)}>
                  <span className="entry-label">{waterText(w.ml)}</span>
                  <span className="muted small">
                    {formatDay(w.day, d.today)}, {formatTime(w.time)}
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
      {sheet && <WaterSheet record={sheet === 'new' ? undefined : sheet} defaultTime={Date.now()} onClose={() => setSheet(null)} />}
    </section>
  );
}
