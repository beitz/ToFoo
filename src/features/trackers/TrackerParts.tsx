import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { formatDay, parseDay, weekdayShort } from '../../lib/dates';
import { dayLayers, type Layer } from '../../logic/calendarLayers';
import { repo } from '../../storage/repo';
import { Segmented } from '../../ui/controls';
import { useSkipped } from '../catchup/useCatchUp';
import { useHabitLayers } from '../habits/useHabits';
import { useJournal } from '../journal/useJournal';
import { useSleep } from '../sleep/useSleep';

export const WINDOWS = ['7', '30', '90'] as const;
export type Window = (typeof WINDOWS)[number];

export function WindowSwitch({ value, onChange }: { value: Window; onChange: (w: Window) => void }) {
  return <Segmented label={t('tracker.window')} value={value} onChange={onChange} options={WINDOWS.map((w) => ({ value: w, label: t('tracker.days', { n: Number(w) }) }))} />;
}

/** The days in `days` where `layer` was not logged (and not skipped), newest first; the calendar's rule. */
export function useMissingDays(layer: Layer, days: readonly string[]): string[] | undefined {
  const d = useData();
  const sleep = useSleep();
  const water = useLiveQuery(() => repo.db.water.toArray(), []);
  const journal = useJournal();
  const skipped = useSkipped();
  const habits = useHabitLayers();
  return useMemo(() => {
    if (!sleep || !water || !journal || !skipped || habits === undefined) return undefined;
    const layers = dayLayers({ days, today: d.today, dayStatus: d.model.dayStatus, sleep, activities: d.activities, water, journal, skipped, habits: habits ?? undefined });
    return days.filter((day) => layers.get(day)?.marks[layer] === 'missing').reverse();
  }, [layer, days, d.today, d.model.dayStatus, sleep, d.activities, water, journal, skipped, habits]);
}

/** Days with nothing logged, as chips to the fill-in page; the most recent few, then a count. */
export function MissingDays({ days }: { days: readonly string[] }) {
  const d = useData();
  if (!days.length) return null;
  const shown = days.slice(0, 6);
  return (
    <div className="card tracker-missing">
      <p className="small">
        <span className="cal-dot mark-missing" aria-hidden /> {t(days.length === 1 ? 'tracker.missingOne' : 'tracker.missingMany', { n: days.length })}
      </p>
      <div className="prompt-actions">
        {shown.map((day) => (
          <a key={day} className="btn btn-small" href={href('catchup', day)}>
            {formatDay(day, d.today)}
          </a>
        ))}
        {days.length > shown.length && <span className="muted small">{t('tracker.more', { n: days.length - shown.length })}</span>}
      </div>
    </div>
  );
}

/**
 * One bar per day, height against `top` (a target line when given); a day with nothing logged is a ring
 * at the base when `missing` says so, never a zero bar. Tap a bar to open that day.
 */
export function DayBars({
  days,
  values,
  missing,
  top,
  target,
  layer,
  spoken,
}: {
  days: readonly string[];
  values: ReadonlyMap<string, number>;
  missing: ReadonlySet<string>;
  top: number;
  target?: number;
  layer: Layer;
  spoken: (day: string, v: number | undefined) => string;
}) {
  const d = useData();
  const pct = (v: number) => `${Math.min(100, (v / top) * 100)}%`;
  const narrow = days.length > 31;
  return (
    <div className={`tracker-bars cal-${layer}${narrow ? ' is-narrow' : ''}`}>
      <div className="tracker-bars-plot">
        {target !== undefined && <span className="tracker-target" style={{ bottom: pct(target) }} aria-hidden />}
        {days.map((day) => {
          const v = values.get(day);
          return (
            <a key={day} href={href('diary', day)} className="tracker-bar" aria-label={spoken(day, v)}>
              {v !== undefined ? <span className="tracker-bar-fill" style={{ height: pct(v) }} /> : missing.has(day) && !narrow ? <span className="cal-dot mark-missing" /> : null}
            </a>
          );
        })}
      </div>
      <div className="tracker-bars-axis small muted" aria-hidden>
        <span>{dayLabel(days[0]!, d.today)}</span>
        <span>{dayLabel(days[days.length - 1]!, d.today)}</span>
      </div>
    </div>
  );
}

const dayLabel = (day: string, today: string) => (day === today ? t('tracker.today') : `${weekdayShort(day)} ${parseDay(day).getDate()}.`);
