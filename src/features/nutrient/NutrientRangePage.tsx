import { useMemo } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { dayRange, formatDate, weekdayShort } from '../../lib/dates';
import { fmtAmount, fmtPercent } from '../../lib/format';
import { formatRange } from '../../lib/periods';
import { contributorsOver, periodDays, type PeriodDay } from '../../logic/nutrientPage';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { periodBreakdown } from '../../model/period';
import { isOn } from '../../settings/features';
import { hasNoData } from '../../ui/Gauge';
import { Icon } from '../../ui/Icon';
import { InfoButton } from '../../ui/InfoButton';
import { BackButton } from '../../ui/BackButton';
import { statusLabel } from '../../ui/status';
import { StatusMark, symbolOf } from '../../ui/Tile';
import { CameFromCard } from './CameFromCard';
import { MissingChip } from './MissingChip';
import { AmountBar, BigTile } from './NutrientPage';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A nutrient over a past day, week or range (owner's ask, 2026-10-23: "what contributed to last
 * week's protein?"): opened from the nutrients of a period on Insights, it shows that period only,
 * with a band at the top saying so and a way to the usual view. Same numbers as the period's list
 * (model/period.ts): the average per counted day, what each day gave and where it came from.
 * Route: #/nutrient/<id>/range/<from>/<to>. Home's energy and macros, which show today so far, open
 * the same view for today (owner's ask, 2026-10-29): #/nutrient/<id>/today, back to Home.
 */
export function NutrientRangePage({ id, from: fromParam, to: toParam, today = false }: { id: string; from?: string; to?: string; today?: boolean }) {
  const d = useData();
  const def = NUTRIENT_BY_ID.get(id);
  const valid = !today && !!fromParam && !!toParam && DAY_KEY.test(fromParam) && DAY_KEY.test(toParam) && fromParam <= toParam;
  const from = valid ? fromParam : d.today;
  const to = valid ? (toParam > d.today ? d.today : toParam) : d.today;
  const impute = isOn(d.settings.features, 'fillUnloggedDays');
  const showRange = isOn(d.settings.features, 'uncertaintyRanges');

  const period = useMemo(
    () => periodBreakdown({ days: d.modelDays, sim: d.model, requirements: d.requirements, imputeUnlogged: impute, from, to }),
    [d.modelDays, d.model, d.requirements, impute, from, to],
  );
  const retention = isOn(d.settings.features, 'retention');
  const contributors = useMemo(() => contributorsOver(period.counted, d.modelEntries, d.model.meals, id, { retention }), [period.counted, d.modelEntries, d.model.meals, id, retention]);
  const base = period.nutrients.get(id);
  const req = d.requirements.byNutrient.get(id);
  const days = useMemo(
    () =>
      base
        ? periodDays(dayRange(from, to), period.counted, d.modelDays, d.model.daily, id, {
            kind: base.kind,
            ref: base.kind === 'rolling' ? req?.physiological : base.kind === 'limit' ? req?.recommended : undefined,
          })
        : [],
    [base, from, to, period.counted, d.modelDays, d.model.daily, id, req],
  );

  if (!def || !base) return <p>{t('nutrient.unknown')}</p>;
  // Today isn't over: below the need is not yet "low" (as on Home), so it shows without a judgement.
  const open = today && (base.status === 'low' || base.status === 'gettingLow');
  const r = { ...base, contributors, status: open ? ('info' as const) : base.status };
  const counted = period.countedDays;
  const noData = counted === 0 || hasNoData(r);
  const value = noData ? '–' : r.kind === 'info' ? `${fmtAmount(id, r.averageIntake)}/${t('nutrient.day')}` : fmtPercent(r.value.central);
  const likely = !noData && r.kind !== 'info' && r.value.high - r.value.low > 0.02 ? `${fmtPercent(r.value.low)}–${fmtPercent(r.value.high)}` : undefined;
  const ulOver = r.ulRatio !== undefined && !!req?.upperLimit && r.ulRatio > 1;
  const title = formatRange(from, to, d.today);
  const single = from === to;

  return (
    <section className="nutrient-page nutrient-range">
      <div className="range-banner" role="note">
        <Icon name="calendar" size={18} />
        <span className="grow">
          <strong>{title}</strong>
          <span className="range-banner-sub">{today ? t('nrange.todayOnly') : single ? t('nrange.oneDay') : t('nrange.days', { n: counted })}</span>
        </span>
        <a className="icon-btn range-banner-x" href={href('nutrient', id)} aria-label={t('nrange.usual')}>
          <Icon name="close" size={18} />
        </a>
      </div>
      <header className="page-head row">
        <BackButton to={today ? [] : ['review', from, to]} />
        <h1 className="grow">{def.name}</h1>
      </header>

      <div className="card nut-hero">
        <div className="nut-hero-main">
          {r.kind === 'info' ? (
            <span className="nut-sym" aria-hidden>
              {symbolOf(id)}
            </span>
          ) : (
            <span className="nut-visual">
              <BigTile r={r} noData={noData} showRange={showRange} />
            </span>
          )}
          <div className="nut-hero-text grow">
            <p className="muted small">
              <strong>{symbolOf(id)}</strong>
            </p>
            <p className="big-number">{value}</p>
            {likely && showRange && <p className="muted small">{t('nutrient.likely', { range: likely })}</p>}
            {r.kind !== 'info' && !open && (
              <p className="status-line">
                <StatusMark status={noData ? 'unknown' : r.status} size={14} /> {statusLabel(noData ? 'unknown' : r.status).toLowerCase()}
              </p>
            )}
            <p className="small muted">{today ? t('nrange.soFar') : single ? t('nrange.thatDay') : t('nrange.perDay', { n: counted })}</p>
          </div>
          <InfoButton title={def.name} label={t('nutrient.heroInfo', { name: def.name })}>
            <p>{today ? t('nrange.explainToday') : t(single ? 'nrange.explainDay' : 'nrange.explain', { range: title, n: counted })}</p>
            <p>{t(impute ? 'review.hintFilled' : 'review.hint')}</p>
            {!noData && r.kind !== 'info' && req && (
              <p>
                {t(req.own ? (req.limitOnly ? 'nutrient.averageIntakeOwnMax' : 'nutrient.averageIntakeOwn') : 'nutrient.averageIntake', {
                  amount: fmtAmount(id, r.averageIntake),
                  ref: fmtAmount(id, req.recommended),
                })}
              </p>
            )}
            {r.missingDataDays > 0 && <p>{t('nutrient.missingData', { n: r.missingDataDays })}</p>}
            <p>
              <a href={href('nutrient', id)}>{t('nrange.usual')}</a>
            </p>
          </InfoButton>
        </div>
        {!noData && r.kind !== 'info' && req && req.recommended > 0 && (
          <AmountBar
            id={id}
            amount={r.averageIntake}
            ref={req.recommended}
            label="nutrient.barEaten"
            refLabel={req.limitOnly ? 'nutrient.barMax' : req.own ? 'nutrient.barTarget' : 'nutrient.barNeed'}
            status={r.status}
          />
        )}
        {(ulOver || r.missingDataDays > 0) && (
          <div className="chips nut-chips">
            {ulOver && (
              <span className="chip chip-warn">
                <Icon name="warning" size={14} /> {t('nutrient.chipUpperLimit', { pct: fmtPercent(r.ulRatio!) })}
              </span>
            )}
            {r.missingDataDays > 0 && <MissingChip id={id} days={period.counted} />}
          </div>
        )}
      </div>

      {days.length > 1 && <DayBars id={id} days={days} kind={r.kind} />}
      <CameFromCard r={r} days={period.counted} />
    </section>
  );
}

/** One bar per day of the period, the dashed line at the need or maximum; tap a day to open it. */
function DayBars({ id, days, kind }: { id: string; days: PeriodDay[]; kind: 'rolling' | 'limit' | 'info' }) {
  const ref = kind === 'info' ? undefined : 1;
  const top = Math.max(ref ? ref * 1.25 : 0, ...days.map((x) => x.value ?? 0)) || 1;
  const pct = (v: number) => `${(Math.min(v, top) / top) * 100}%`;
  const text = (v: number) => (kind === 'info' ? fmtAmount(id, v) : fmtPercent(v));
  return (
    <div className="card">
      <div className="card-head">
        <h2>{t('nrange.dayByDay')}</h2>
        <span className="card-note">{t(kind === 'limit' ? 'week.ofMax' : kind === 'info' ? 'nrange.amount' : 'week.ofNeed')}</span>
      </div>
      <ol className={`plain-list rday-bars${days.length > 14 ? ' is-dense' : ''}`}>
        {days.map((x) => (
          <li key={x.day}>
            <a
              className={`rday${x.value === undefined ? ' is-out' : ''}${x.missing ? ' is-missing' : ''}`}
              href={href('diary', x.day)}
              aria-label={`${weekdayShort(x.day)} ${formatDate(x.day, false)}: ${x.value === undefined ? t('nrange.notCounted') : text(x.value)}`}
            >
              <span className="rday-track" aria-hidden>
                {ref && <span className="rday-ref" style={{ bottom: pct(ref) }} />}
                {x.value !== undefined && <span className="rday-bar" style={{ height: pct(x.value) }} />}
              </span>
            </a>
          </li>
        ))}
      </ol>
      <p className="rday-axis small muted" aria-hidden>
        <span>{formatDate(days[0]!.day, false)}</span>
        <span>{formatDate(days[days.length - 1]!.day, false)}</span>
      </p>
    </div>
  );
}
