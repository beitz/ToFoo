import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { parseDay } from '../../lib/dates';
import { addMonths, formatMonth, monthGrid, presetRange } from '../../lib/periods';
import type { CatchUpKind } from '../../logic/catchUp';
import { dayLayers, layerCounts, LAYERS, type DayLayers, type Layer } from '../../logic/calendarLayers';
import type { DayStatus } from '../../model/types';
import { repo } from '../../storage/repo';
import type { Settings } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { isOn } from '../../settings/features';
import { InsightsTabs } from './InsightsTabs';
import { DAY_ICON } from './dayStatus';
import { useSleep } from '../sleep/useSleep';
import { useJournal } from '../journal/useJournal';
import { hmShort } from '../sleep/format';
import { fmtNumber } from '../../lib/format';

type View = NonNullable<Settings['calendarLayer']>;

/** The trackers switched on, in the calendar's fixed order (meals always). */
function layersOn(features: Settings['features']): Layer[] {
  return LAYERS.filter((l) => l === 'meals' || isOn(features, l));
}

/** Kinds skipped on the fill-in page, by day, from the meta table ("nudge:<day>" is the meals skip). */
function useSkipped(): Record<string, CatchUpKind[]> | undefined {
  return useLiveQuery(async () => {
    const out: Record<string, CatchUpKind[]> = {};
    for (const m of await repo.db.meta.toArray()) {
      if (m.key.startsWith('catchUp:') && Array.isArray(m.value)) out[m.key.slice(8)] = [...(out[m.key.slice(8)] ?? []), ...(m.value as CatchUpKind[])];
      else if (m.key.startsWith('nudge:') && m.value === true) out[m.key.slice(6)] = [...(out[m.key.slice(6)] ?? []), 'food'];
    }
    return out;
  }, []);
}

const STATUSES: Array<DayStatus | 'pending'> = ['logged', 'partial', 'fasted', 'unknown', 'filled', 'excluded'];

/**
 * Month view; tap a day to open it in the diary. Route: #/calendar[/YYYY-MM]. Chips pick what it shows
 * (owner's ask, 2026-10-23): "All" puts one dot per tracker at a fixed spot in each day, filled when
 * logged and a hollow ring when forgotten, so missed days stand out; one tracker shows its amount per day.
 */
export function CalendarPage({ month: monthParam }: { month?: string }) {
  const d = useData();
  const thisMonth = d.today.slice(0, 7);
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) && monthParam <= thisMonth ? monthParam : thisMonth;
  const weeks = monthGrid(month);
  const on = layersOn(d.settings.features);
  const saved = d.settings.calendarLayer ?? 'all';
  const view: View = saved === 'all' || on.includes(saved) ? saved : 'all';
  const sleep = useSleep();
  const water = useLiveQuery(() => repo.db.water.toArray(), []);
  const journal = useJournal();
  const skipped = useSkipped();
  const days = useMemo(() => weeks.flat().filter((x): x is string => !!x && x <= d.today), [weeks, d.today]);
  const layers = useMemo(
    () => (sleep && water && journal && skipped ? dayLayers({ days, today: d.today, dayStatus: d.model.dayStatus, sleep, activities: d.activities, water, journal, skipped }) : undefined),
    [days, d.today, d.model.dayStatus, sleep, d.activities, water, journal, skipped],
  );
  const counts: Record<string, number> = {};
  for (const day of weeks.flat()) {
    const st = day ? d.model.dayStatus[day] : undefined;
    if (st) counts[st] = (counts[st] ?? 0) + 1;
  }
  const range = presetRange('month', `${month}-01`, d.today);
  const weekdays = [...Array(7)].map((_, i) => parseDay(`2026-10-${String(12 + i).padStart(2, '0')}`).toLocaleDateString('en-GB', { weekday: 'narrow' }));

  return (
    <section>
      <InsightsTabs view="calendar" day={month === d.today.slice(0, 7) ? d.today : `${month}-01`} />
      <header className="week-head">
        <div className="grow">
          <h1>{formatMonth(month)}</h1>
          <p className="muted small">{t(view === 'meals' ? 'calendar.sub' : 'calendar.subLayers')}</p>
        </div>
        <button className="icon-btn" onClick={() => navigate('calendar', addMonths(month, -1))} aria-label={t('calendar.prev')}>
          <Icon name="back" />
        </button>
        <button className="icon-btn" disabled={month >= thisMonth} onClick={() => navigate('calendar', addMonths(month, 1))} aria-label={t('calendar.next')}>
          <Icon name="chevron" />
        </button>
      </header>

      {on.length > 1 && (
        <div className="chips cal-layers" role="radiogroup" aria-label={t('calendar.show')}>
          {(['all', ...on] as View[]).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={v === view} className={v === view ? 'chip on' : 'chip'} onClick={() => void repo.updateSettings({ calendarLayer: v })}>
              {v !== 'all' && <span className={`cal-dot cal-${v} mark-logged`} aria-hidden />}
              {t(`calendar.layer.${v}` as MessageKey)}
            </button>
          ))}
        </div>
      )}

      <div className="card">
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
                const date = parseDay(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
                const l = layers?.get(day);
                if (view === 'meals' || !l)
                  return (
                    <a
                      key={day}
                      role="gridcell"
                      className={`calendar-day day-${st}${day === d.today ? ' today' : ''}`}
                      href={href('diary', day)}
                      aria-label={`${date}: ${t(`day.${st}` as MessageKey)}`}
                    >
                      <span className="calendar-num">{num}</span>
                      <Icon name={DAY_ICON[st]} size={16} />
                    </a>
                  );
                return (
                  <a
                    key={day}
                    role="gridcell"
                    className={`calendar-day${day === d.today ? ' today' : ''}`}
                    href={href('diary', day)}
                    aria-label={`${date}: ${(view === 'all' ? on : [view]).map((layer) => spokenMark(layer, l)).join(', ')}`}
                  >
                    <span className="calendar-num">{num}</span>
                    {view === 'all' ? (
                      <span className="cal-dots" aria-hidden>
                        {on.map((layer) => (
                          <span key={layer} className={`cal-dot cal-${layer} mark-${l.marks[layer]}`} />
                        ))}
                      </span>
                    ) : (
                      <LayerValue layer={view} l={l} />
                    )}
                  </a>
                );
              })}
            </div>
          ))}
        </div>

        {view === 'meals' || !layers ? (
          <ul className="calendar-legend plain-list">
            {STATUSES.filter((s) => (s !== 'filled' && s !== 'excluded') || counts[s]).map((s) => (
              <li key={s} className={`day-${s}`}>
                <Icon name={DAY_ICON[s]} size={16} /> {t(`day.${s}` as MessageKey)} · {counts[s] ?? 0}
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="calendar-legend plain-list">
              {(view === 'all' ? on : [view]).map((layer) => {
                const c = layerCounts(layers, layer);
                return (
                  <li key={layer}>
                    <span className={`cal-dot cal-${layer} mark-logged`} aria-hidden /> {t(`calendar.layer.${layer}` as MessageKey)} ·{' '}
                    {layer === 'journal' ? t('calendar.daysWith', { n: c.logged }) : t('calendar.loggedMissing', { logged: c.logged, missing: c.missing })}
                  </li>
                );
              })}
            </ul>
            <p className="muted small cal-key">
              <span className="cal-dot mark-logged" aria-hidden /> {t('calendar.keyLogged')} <span className="cal-dot mark-missing" aria-hidden /> {t('calendar.keyMissing')}{' '}
              <span className="cal-dot mark-skipped" aria-hidden /> {t('calendar.keySkipped')}
            </p>
          </>
        )}
      </div>
      <p className="muted small">{view === 'meals' ? t(isOn(d.settings.features, 'fillUnloggedDays') ? 'calendar.hintFilled' : 'calendar.hint') : t('calendar.hintLayers')}</p>

      <a className="btn btn-secondary btn-block" href={href('review', range.from, range.to)}>
        <Icon name="bars" /> {t('calendar.monthNutrients')}
      </a>
    </section>
  );
}

function spokenMark(layer: Layer, l: DayLayers): string {
  const name = t(`calendar.layer.${layer}` as MessageKey);
  const mark = l.marks[layer];
  if (mark === 'none') return `${name} –`;
  return `${name} ${t(`calendar.mark.${mark}` as MessageKey)}`;
}

/** One tracker's amount for the day: hours slept, minutes active, water, journal entries; a ring when forgotten. */
function LayerValue({ layer, l }: { layer: Exclude<Layer, 'meals'>; l: DayLayers }) {
  const mark = l.marks[layer];
  if (mark !== 'logged') return <span className={`cal-dot cal-${layer} mark-${mark}`} aria-hidden />;
  const text = layer === 'sleep' ? hmShort(l.sleepMinutes) : layer === 'activity' ? `${l.activityMinutes}′` : layer === 'water' ? `${fmtNumber(l.waterMl / 1000, 1)} l` : String(l.journal);
  return (
    <span className={`cal-value cal-${layer}`} aria-hidden>
      {text}
    </span>
  );
}
