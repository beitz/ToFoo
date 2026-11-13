import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { formatDate } from '../../lib/dates';
import { lastMealBefore, nightsWindow, nightTimes, sleepDebt, weeklySleep, type Night, type Spread } from '../../logic/nights';
import { sleepNeed } from '../../../model/parameters';
import { sleepAgeGroup, sleepDuration, sleepQuality } from '../../../model/sleep';
import { isOn } from '../../settings/features';
import { AskChips } from '../../ui/AskChips';
import { BackButton } from '../../ui/BackButton';
import { Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { useSleepNeed } from '../settings/SleepNeed';
import { clockText, hmText } from './format';
import { axisLength, dayLabel, NightAxis, NightLegend, NightRow, NormalRow } from './NightRow';
import { useSleep } from './useSleep';
import { DEFAULT_LATITUDE } from '../../logic/resolve';

const WINDOWS = ['7', '14', '28'] as const;
type Window = (typeof WINDOWS)[number];
/** Weeks in the bottom chart, the current one included. */
const WEEKS = 8;

/**
 * The sleep page (design 2026-10-22, "Sleep"; route #/nights): sleep debt against the need over a
 * window of nights, the usual times and how regular they are, each night on a timeline with the last
 * meal before it, and eight weeks of averages. Unlogged nights are unknown, never zero.
 */
export function SleepPage() {
  const d = useData();
  const records = useSleep();
  const need = useSleepNeed();
  const [win, setWin] = useState<Window>(String(sleepNeed.windowNights.value) as Window);
  const [info, setInfo] = useState(false);
  const count = Number(win);

  const nights = useMemo(() => nightsWindow(records ?? [], d.today, count, need.minutes), [records, d.today, count, need.minutes]);
  const debt = useMemo(() => sleepDebt(nights), [nights]);
  const times = useMemo(() => nightTimes(nights), [nights]);
  const weeks = useMemo(() => weeklySleep(records ?? [], d.today, WEEKS), [records, d.today]);
  const mealStarts = useMemo(() => d.model.meals.map((m) => m.start), [d.model.meals]);
  const usual = times.bed && times.wake ? { bed: times.bed.median, wake: times.wake.median } : undefined;
  const unknown = nights.filter((n) => n.asleep === undefined);
  const axisLen = useMemo(() => axisLength(nights), [nights]);
  // "Compare with a normal night": off until tapped, for this visit.
  const [normal, setNormal] = useState(false);
  const group = d.profile.birthYear ? sleepAgeGroup(Number(d.today.slice(0, 4)) - d.profile.birthYear) : 'adult';
  const hours = sleepDuration.value.recommended[group];

  return (
    <section>
      <header className="page-head row">
        <BackButton to={['overview']} />
        <h1 className="grow">{t('nights.title')}</h1>
      </header>
      <Segmented label={t('nights.window')} value={win} onChange={setWin} options={WINDOWS.map((w) => ({ value: w, label: t('nights.nights', { n: Number(w) }) }))} />

      {records && debt.logged === 0 ? (
        <div className="card">
          <p>{t('nights.none', { n: count })}</p>
          <p className="muted small">{t('nights.noneHint')}</p>
        </div>
      ) : (
        <>
          <div className="card nights-hero">
            <div className="row-between">
              <span className="muted">{t(debt.balance < 0 ? 'nights.debt' : 'nights.ahead')}</span>
              <button type="button" className="icon-btn" aria-expanded={info} aria-controls="nights-info" aria-label={t('nights.howLabel')} onClick={() => setInfo((o) => !o)}>
                <Icon name="info" size={20} />
              </button>
            </div>
            <p className="nights-big">{hmText(debt.balance)}</p>
            <p className="muted small">
              {t('nights.over', { n: debt.logged })}
              {unknown.length > 0 && ` · ${t(unknown.length === 1 ? 'nights.unknownOne' : 'nights.unknownMany', { n: unknown.length })}`}
            </p>
            {nights.length > 7 && (
              <p className="nights-change">
                <Icon name={debt.lastWeek < 0 ? 'down' : debt.lastWeek > 0 ? 'up' : 'minus'} size={16} />{' '}
                {debt.lastWeek < 0 ? t('nights.weekShort', { hm: hmText(debt.lastWeek) }) : debt.lastWeek > 0 ? t('nights.weekOver', { hm: hmText(debt.lastWeek) }) : t('nights.weekEven')}
              </p>
            )}
            <DebtChart nights={nights} running={debt.running} />
            {info && (
              <p className="muted small" id="nights-info">
                {t('nights.how')}{' '}
                <a href={sleepNeed.hours.url} target="_blank" rel="noreferrer">
                  {t('sleepNeed.sourceLink')}
                </a>
              </p>
            )}
            <p className="small">
              {t(need.own ? 'nights.needOwn' : 'nights.need', { need: hmText(need.minutes) })} <a href={href('settings', 'profile')}>{t('nights.changeNeed')}</a>
            </p>
          </div>

          <div className="nights-tiles">
            <Stat label={t('nights.average')} value={debt.average !== undefined ? hmText(debt.average) : '–'} sub={debt.average !== undefined ? averageNote(debt.average - need.minutes) : ''} />
            <Stat
              label={t('nights.logged')}
              value={t('nights.loggedOf', { n: debt.logged, of: count })}
              sub={
                unknown.length
                  ? t('nights.unknownDays', {
                      days:
                        unknown
                          .slice(-2)
                          .map((n) => dayLabel(n.day))
                          .join(', ') + (unknown.length > 2 ? '…' : ''),
                    })
                  : t('nights.allLogged')
              }
            />
            <Stat label={t('nights.usualAsleep')} value={times.bed ? clockText(times.bed.median) : '–'} sub={times.bed ? t('nights.plusMinus', { m: times.bed.plusMinus }) : ''} />
            <Stat label={t('nights.usualUp')} value={times.wake ? clockText(times.wake.median) : '–'} sub={times.wake ? t('nights.plusMinus', { m: times.wake.plusMinus }) : ''} />
          </div>

          <div className="card">
            <div className="card-head">
              <h2>
                <a className="card-head-link" href={href('nights', 'days')}>
                  {t('nights.when')} <Icon name="chevron" size={18} />
                </a>
              </h2>
              <span className="card-note">{t('nights.vsNeed', { need: hmText(need.minutes) })}</span>
            </div>
            {usual && (
              <div className="nights-normal-toggle">
                <button type="button" className={`chip chip-small${normal ? ' on' : ''}`} aria-pressed={normal} onClick={() => setNormal((v) => !v)}>
                  {t('nights.normalToggle')}
                </button>
              </div>
            )}
            <NightAxis axisLen={axisLen} />
            {normal && usual && (
              <>
                <NormalRow axisLen={axisLen} bed={usual.bed} hours={hours} />
                <p className="nights-normal-note small muted">
                  {t('nights.normalNote', { low: hours[0], high: hours[1], wakeUps: sleepQuality.awakenings.value.goodMax[group], minutes: sleepQuality.awakenings.value.minMinutes, awake: sleepQuality.awakeMinutes.value.goodMax })}
                </p>
              </>
            )}
            <ol className="plain-list nights-rows">
              {[...nights].reverse().map((n) => (
                <li key={n.day}>
                  <NightRow night={n} axisLen={axisLen} latitude={d.profile.latitude ?? DEFAULT_LATITUDE} usual={usual} lastMeal={n.block ? lastMealBefore(mealStarts, n.block.start) : undefined} />
                </li>
              ))}
            </ol>
            <NightLegend usual={usual} />
          </div>

          {times.bed && times.wake && (
            <div className="card">
              <div className="card-head">
                <h2>{t('nights.regular')}</h2>
                <span className="card-note">{t('nights.regularNote')}</span>
              </div>
              <SpreadRow label={t('nights.asleep')} spread={times.bed} />
              <SpreadRow label={t('nights.up')} spread={times.wake} />
              <p className="small muted">
                {t('nights.regularText', { bed1: clockText(times.bed.q1), bed2: clockText(times.bed.q3), wake1: clockText(times.wake.q1), wake2: clockText(times.wake.q3) })}
              </p>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h2>{t('nights.weeksTitle', { n: WEEKS })}</h2>
              <span className="card-note">{t('nights.weeksNote')}</span>
            </div>
            <WeekBars weeks={weeks} need={need.minutes} />
          </div>
        </>
      )}

      <AskChips questions={[t('nights.ask')]} to={isOn(d.settings.features, 'insights') ? 'insights' : 'assistant'} />
      <p className="muted small disclaimer">{t('nights.explain')}</p>
    </section>
  );
}

function averageNote(diff: number): string {
  if (Math.abs(diff) < 1) return t('nights.atNeed');
  return t(diff < 0 ? 'nights.shortOf' : 'nights.overNeed', { hm: hmText(diff) });
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card nights-stat">
      <span className="small muted">{label}</span>
      <strong>{value}</strong>
      <span className="small muted">{sub}</span>
    </div>
  );
}

/** The running balance after each night, the need as the zero line; flat across an unlogged night. */
function DebtChart({ nights, running }: { nights: readonly Night[]; running: readonly number[] }) {
  if (running.length < 2) return null;
  const W = 300;
  const H = 110;
  const pad = { l: 4, r: 40, t: 8, b: 4 };
  const lo = Math.min(0, ...running);
  const hi = Math.max(0, ...running);
  const span = Math.max(hi - lo, 60);
  const x = (i: number) => pad.l + (i / (running.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / span) * (H - pad.t - pad.b);
  const line = running.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(running.length - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
  // A line every 1 or 2 hours, whichever gives at most four.
  const step = span > 4 * 60 ? 120 : 60;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  return (
    <figure className="nights-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('nights.chartLabel')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'nights-chart-zero' : 'nights-chart-grid'} />
            <text x={W - pad.r + 6} y={y(v) + 4} className="nights-chart-tick">
              {v === 0 ? '0 h' : `${v < 0 ? '−' : '+'}${Math.abs(v / 60)} h`}
            </text>
          </g>
        ))}
        <path d={area} className="nights-chart-area" />
        <path d={line} className="nights-chart-line" />
        {nights.map((n, i) => (n.asleep === undefined ? <circle key={n.day} cx={x(i)} cy={y(running[i]!)} r={3} className="nights-chart-unknown" /> : null))}
        <circle cx={x(running.length - 1)} cy={y(running[running.length - 1]!)} r={4} className="nights-chart-dot" />
      </svg>
      <figcaption className="row-between small muted">
        <span>{dayLabel(nights[0]!.day)}</span>
        <span>{t('nights.lastNight')}</span>
      </figcaption>
    </figure>
  );
}

/** A clock time's spread: the whole range pale, the middle half dark, the median as a tick; ±4 h around the median. */
function SpreadRow({ label, spread: s }: { label: string; spread: Spread }) {
  const from = s.median - 4 * 60;
  const pos = (m: number) => `${(Math.max(0, Math.min(480, (m - from + 1440 * 2) % 1440)) / 480) * 100}%`;
  const width = (a: number, b: number) => `${(Math.max(0, Math.min(480, (b - from + 2880) % 1440) - Math.min(480, (a - from + 2880) % 1440)) / 480) * 100}%`;
  return (
    <div className="nights-spread" role="group" aria-label={t('nights.spreadSpoken', { label, median: clockText(s.median), q1: clockText(s.q1), q3: clockText(s.q3) })}>
      <span className="nights-spread-label">{label}</span>
      <span className="nights-spread-track" aria-hidden>
        <span className="nights-spread-range" style={{ left: pos(s.min), width: width(s.min, s.max) }} />
        <span className="nights-spread-mid" style={{ left: pos(s.q1), width: width(s.q1, s.q3) }} />
        <span className="nights-spread-tick" style={{ left: pos(s.median) }} />
        <span className="nights-spread-ends small muted">
          <span>{clockText(from)}</span>
          <span>{clockText(s.median + 4 * 60)}</span>
        </span>
      </span>
      <span className="nights-spread-value" aria-hidden>
        <strong>{clockText(s.median)}</strong>
        <span className="small muted">{t('nights.plusMinus', { m: s.plusMinus })}</span>
      </span>
    </div>
  );
}

/** Average sleep per night by week against the need (dashed); a week under it is striped, and every bar has its value. */
function WeekBars({ weeks, need }: { weeks: Array<{ monday: string; average?: number; nights: number }>; need: number }) {
  const top = Math.max(need * 1.25, ...weeks.map((w) => w.average ?? 0));
  const pct = (v: number) => `${(v / top) * 100}%`;
  return (
    <ol className="plain-list nights-weeks">
      {weeks.map((w, i) => {
        const now = i === weeks.length - 1;
        const label = now ? t('nights.thisWeek') : `−${weeks.length - 1 - i}`;
        const spokenWeek = formatDate(w.monday, false);
        const value = w.average !== undefined ? clockText(w.average).replace(/^0/, '') : '–';
        return (
          <li key={w.monday}>
            <button
              type="button"
              className="nights-week"
              onClick={() => navigate('week', w.monday)}
              aria-label={w.average !== undefined ? t('nights.weekSpoken', { week: spokenWeek, hm: hmText(w.average), n: w.nights }) : t('nights.weekNone', { week: spokenWeek })}
            >
              <span className="nights-week-value small" aria-hidden>
                {value}
              </span>
              <span className="nights-week-track" aria-hidden>
                <span className="nights-week-need" style={{ bottom: pct(need) }} />
                {w.average !== undefined && <span className={`nights-week-bar${w.average < need ? ' is-short' : ''}${now ? ' is-now' : ''}`} style={{ height: pct(w.average) }} />}
              </span>
              <span className="nights-week-label small muted" aria-hidden>
                {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
