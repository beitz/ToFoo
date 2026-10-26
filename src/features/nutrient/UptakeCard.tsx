import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { useState } from 'react';
import { formatDay, weekdayShort } from '../../lib/dates';
import { fmtAmount } from '../../lib/format';
import { uptakeDays, type UptakeDay } from '../../logic/nutrientPage';
import { InfoButton } from '../../ui/InfoButton';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { nutrientParams } from '../../../model/parameters';

/**
 * Nutrients whose uptake depends on the meal in the model, so "eaten" and "taken up" really differ
 * day to day: iron (enhancers, inhibitors), B12 (capped per meal), calcium and vitamin C (less per
 * meal at bigger doses), A, D, E, K (fat in the meal). For the rest a fixed share is taken up.
 */
export function uptakeVaries(id: string): boolean {
  const p = nutrientParams[id];
  return !!p && (p.rule.type !== 'fixed' || !!p.fatSoluble);
}

/**
 * "Eaten → taken up" (design 2026-10-22): per day of the window, what the body took up (the bar) and
 * what it needs (the line), on one scale. What the food held is a number only, since it is many times
 * larger for iron; it shows for the day tapped, in one line above the bars.
 */
export function UptakeCard({ id, need }: { id: string; need: number }) {
  const d = useData();
  const def = NUTRIENT_BY_ID.get(id);
  const r = d.model.nutrients.get(id);
  const [picked, setPicked] = useState<string | null>(null);
  if (!def || !r) return null;
  // Bars keep the charts' usual span, also where the average spans more (omega-3, vitamin E: 8 weeks).
  const span = Math.min(r.windowDays, d.settings.longWindowDays);
  const days = uptakeDays(d.modelDays, d.model.daily, d.model.dayStatus, id, span);
  if (!days.some((x) => x.eaten !== undefined)) return null;
  const top = Math.max(need, ...days.map((x) => x.takenUp ?? 0)) * 1.1 || 1;
  // The numbers of one day at a time (a row of numbers per bar did not fit 14 days on a phone):
  // the day tapped, else the last finished day the log tells (today is still going).
  const shown = days.find((x) => x.day === picked) ?? [...days].reverse().find((x) => x.eaten !== undefined && x.day < d.today) ?? days.at(-1)!;
  const spoken = (x: UptakeDay) =>
    x.eaten === undefined
      ? t('uptake.daySpokenUnknown', { day: weekdayShort(x.day) })
      : t('uptake.daySpoken', {
          day: weekdayShort(x.day),
          eaten: fmtAmount(id, x.eaten),
          up: fmtAmount(id, x.takenUp!),
        }) + (x.missing ? ` ${t('uptake.missingSpoken')}` : '');
  // Every other weekday under 14 bars, so the labels don't run into each other.
  const every = days.length > 8 ? 2 : 1;
  return (
    <div className="card uptake">
      <div className="card-head">
        <h2>{t('uptake.title')}</h2>
        <InfoButton title={t('uptake.title')}>
          <p>{t('uptake.info', { unit: def.unit, need: fmtAmount(id, need) })}</p>
          {id === 'VITD' && <p>{t('uptake.vitDSun')}</p>}
          {span < r.windowDays && <p>{t('window.chartSpan', { n: span, days: r.windowDays })}</p>}
        </InfoButton>
      </div>
      <p className="uptake-readout small" aria-live="polite">
        <strong>{formatDay(shown.day, d.today)}</strong>{' '}
        {shown.eaten === undefined
          ? t('uptake.notLogged')
          : t('uptake.readout', {
              eaten: `${fmtAmount(id, shown.eaten)}${shown.missing ? '+' : ''}`,
              up: fmtAmount(id, shown.takenUp!),
            })}
      </p>
      <div className="uptake-days" role="group" aria-label={t('uptake.title')}>
        {days.map((x, i) => {
          const known = x.eaten !== undefined;
          return (
            <button
              type="button"
              key={x.day}
              className={`uptake-day${x.day === shown.day ? ' picked' : ''}`}
              aria-label={spoken(x)}
              aria-pressed={x.day === shown.day}
              onClick={() => setPicked(x.day)}
            >
              <span className="uptake-col" aria-hidden>
                {known && <span className="uptake-bar" style={{ height: `${((x.takenUp ?? 0) / top) * 100}%` }} />}
                <span className="uptake-need" style={{ bottom: `${(need / top) * 100}%` }} />
              </span>
              <span className="uptake-wd muted" aria-hidden>
                {x.fasted ? t('uptake.fast') : (days.length - 1 - i) % every === 0 ? weekdayShort(x.day) : ''}
              </span>
            </button>
          );
        })}
      </div>
      <p className="chart-legend small muted">
        <span>
          <span className="legend-bar" /> {t('uptake.legendUp')}
        </span>
        <span>
          <span className="legend-line" /> {t('uptake.legendNeedShort')}
        </span>
      </p>
      {id === 'FE' && <IronHelpers />}
    </div>
  );
}

const IRON_HELPERS: Array<{ up: boolean; name: MessageKey; when: MessageKey }> = [
  { up: true, name: 'uptake.ironVitC', when: 'uptake.sameMeal' },
  { up: true, name: 'uptake.ironMeat', when: 'uptake.sameMeal' },
  { up: false, name: 'uptake.ironTea', when: 'uptake.withinHour' },
  { up: false, name: 'uptake.ironCalcium', when: 'uptake.sameMeal' },
];

/** What the iron model counts as helping or hindering uptake (model/parameters.ts `iron`), iron only. */
function IronHelpers() {
  return (
    <>
      <ul className="plain-list helper-tiles" aria-label={t('uptake.helpersLabel')}>
        {IRON_HELPERS.map((h) => (
          <li key={h.name} className={`helper-tile ${h.up ? 'helper-up' : 'helper-down'}`}>
            <span className="helper-sign" aria-hidden>
              {h.up ? '↑' : '↓'}
            </span>
            <span>
              <span className="visually-hidden">{t(h.up ? 'uptake.helps' : 'uptake.hinders')}: </span>
              <strong>{t(h.name)}</strong>
              <span className="muted small"> {t(h.when)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="small muted">
        {t('uptake.ironPhytate')} <a href={href('nutrient', 'FE', 'why')}>{t('uptake.howCounted')}</a>
      </p>
    </>
  );
}
