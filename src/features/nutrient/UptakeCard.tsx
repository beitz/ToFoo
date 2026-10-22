import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { weekdayShort } from '../../lib/dates';
import { fmtAmount, fmtNumber } from '../../lib/format';
import { uptakeDays } from '../../logic/nutrientPage';
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
 * "Eaten → taken up" (design 2026-10-22): per day of the window, what the food held (the number on
 * top), what the body took up (the bar) and what it needs (the line). The bars share one scale with
 * the line; what was eaten is a number only, since it is many times larger for iron.
 */
export function UptakeCard({ id, need }: { id: string; need: number }) {
  const d = useData();
  const def = NUTRIENT_BY_ID.get(id);
  const r = d.model.nutrients.get(id);
  if (!def || !r) return null;
  const days = uptakeDays(d.modelDays, d.model.daily, d.model.dayStatus, id, r.windowDays);
  if (!days.some((x) => x.eaten !== undefined)) return null;
  const top = Math.max(need, ...days.map((x) => x.takenUp ?? 0)) * 1.1 || 1;
  const digits = (v: number) => fmtNumber(v, v < 10 ? 1 : 0);
  return (
    <div className="card uptake">
      <div className="card-head">
        <h2>{t('uptake.title')}</h2>
        <span className="card-note">{t('uptake.note', { unit: def.unit })}</span>
      </div>
      <div className="uptake-days" role="list">
        {days.map((x) => {
          const known = x.eaten !== undefined;
          const spoken = !known
            ? t('uptake.daySpokenUnknown', { day: weekdayShort(x.day) })
            : t('uptake.daySpoken', {
                day: weekdayShort(x.day),
                eaten: fmtAmount(id, x.eaten!),
                up: fmtAmount(id, x.takenUp!),
              }) + (x.missing ? ` ${t('uptake.missingSpoken')}` : '');
          return (
            <div key={x.day} className="uptake-day" role="listitem" aria-label={spoken}>
              <span className="uptake-eaten" aria-hidden>
                {known ? `${digits(x.eaten!)}${x.missing ? '+' : ''}` : '–'}
              </span>
              <span className="uptake-col" aria-hidden>
                {known && <span className="uptake-bar" style={{ height: `${((x.takenUp ?? 0) / top) * 100}%` }} />}
                <span className="uptake-need" style={{ bottom: `${(need / top) * 100}%` }} />
              </span>
              <span className="uptake-up" aria-hidden>
                {known ? digits(x.takenUp!) : '–'}
              </span>
              <span className="uptake-wd muted" aria-hidden>
                {x.fasted ? t('uptake.fast') : weekdayShort(x.day)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="uptake-legend small muted">
        <span>{t('uptake.legendEaten')}</span>
        <span>
          <span className="legend-bar" /> {t('uptake.legendUp')}
        </span>
        <span>
          <span className="legend-line" /> {t('uptake.legendNeed', { need: fmtAmount(id, need) })}
        </span>
      </p>
      {id === 'VITD' && <p className="small muted">{t('uptake.vitDSun')}</p>}
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
