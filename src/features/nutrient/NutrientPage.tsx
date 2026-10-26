import type { ReactNode } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { fmtAmount, fmtFill, fmtNumber, fmtPercent } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { earlyReading, isUnsure, tankTrend, type GaugeStatus, type HistoryPoint, type NutrientResult, type StoreResult } from '../../model/simulate';
import type { Range } from '../../model/paramTypes';
import { statusThresholds, trendDisplay } from '../../../model/parameters';
import { logTrust, trustReasons } from '../../../model/log-trust';
import { storeTrendOf, trendOf, type Trend } from '../../model/trend';
import { isOn } from '../../settings/features';
import { infoId, NUTRIENT_INFO_SOURCES } from '../../i18n/nutrientInfo.en';
import { storeAhead, tileTop, windowDays, type WindowDay } from '../../logic/nutrientPage';
import { InfoButton } from '../../ui/InfoButton';
import { AskChips } from '../../ui/AskChips';
import { LineChart } from '../../ui/LineChart';
import { hasNoData, storeTrendLabel, trendArrows, trendLabel } from '../../ui/Gauge';
import { statusText } from '../../ui/status';
import { StatusMark, symbolOf } from '../../ui/Tile';
import { Icon } from '../../ui/Icon';
import { energyBasisText } from '../settings/EnergyTarget';
import { proteinBasisText } from '../settings/ProteinTarget';
import { carbBasisText } from '../settings/CarbMax';
import { currentWeight } from '../../logic/resolve';
import { PROFILE_DEFAULTS } from '../../model/requirements';
import { testHintText } from './testHint';
import { BloodTests, markersFor } from './BloodTests';
import { formatDay } from '../../lib/dates';
import { fmtDuration } from '../../ui/duration';
import { GroupInfoLink, hasGroupInfo } from '../info/GroupInfo';
import { nutrientType } from '../home/grouping';
import { SplitCard, type SplitContext } from './NutrientSplit';
import { BackButton } from '../../ui/BackButton';
import { CameFromCard } from './CameFromCard';
import { FillsBest } from './FillsBest';
import { UptakeCard, uptakeVaries } from './UptakeCard';
import { EffectCard } from './EffectCard';
import { EnergyBurnCard } from './EnergyBurnCard';
import { hasLadder, LevelLadder } from './LevelLadder';
import { WhatItDoes } from './WhatItDoes';

export function NutrientPage({ id, context }: { id: string; context?: SplitContext }) {
  const d = useData();
  const def = NUTRIENT_BY_ID.get(id);
  const r = d.model.nutrients.get(id);
  const req = d.requirements.byNutrient.get(id);
  const showRange = isOn(d.settings.features, 'uncertaintyRanges');

  if (!def || !r) return <p>{t('nutrient.unknown')}</p>;

  const noData = hasNoData(r);
  const store = r.store;
  const history = (store ? store.history : r.history).slice(-STORE_BACK_DAYS).map(toPercent);
  const ahead = store ? storeAhead(store, d.today, STORE_AHEAD_DAYS).map(toPercent) : [];
  const gettingLow = statusThresholds.tank.value.gettingLow;
  const guides = store
    ? [
        { value: 100, label: '100%' },
        { value: gettingLow * 100, label: fmtPercent(gettingLow) },
      ]
    : r.kind === 'info'
      ? []
      : [{ value: 100, label: '100%' }];
  const lab = store?.measuredOn ? (d.profile.labResults ?? []).find((x) => x.day === store.measuredOn && markersFor(id).some(([m]) => m === x.marker)) : undefined;
  const gap = r.kind === 'rolling' && (r.status === 'low' || r.status === 'gettingLow' || store?.status === 'low' || store?.status === 'gettingLow');
  const fills = r.kind === 'rolling' && !!req && req.recommended > 0 && !req.limitOnly;
  const shown = noData ? '–' : store ? fmtFill(store.fill.central) : r.kind === 'info' ? fmtAmount(id, r.averageIntake) : fmtPercent(r.value.central);
  const chartTitle = t(store ? 'nutrient.fillTitle' : 'nutrient.history');

  return (
    <section className="nutrient-page">
      <header className="page-head row">
        <BackButton />
        <h1 className="grow">{def.name}</h1>
      </header>
      {context && (
        <>
          <SplitCard nutrient={id} context={context} />
          <h2 className="section-title">{t('split.overall', { name: def.name })}</h2>
        </>
      )}
      <EffectCard r={r} />
      <Hero r={r} noData={noData} showRange={showRange} whyLabel={t('nutrient.whyLink', { value: shown })} />
      <AskChips questions={gap ? [t('nutrient.askMore', { name: def.name.toLowerCase() })] : []} />
      {id === 'ENERCC' && <EnergyBurnCard />}

      {history.length > 1 && (
        <div className="card">
          <div className="card-head">
            <h2>{chartTitle}</h2>
            <InfoButton title={chartTitle}>
              <p>
                {ahead.length
                  ? t('nutrient.fillNote', {
                      back: history.length,
                      ahead: STORE_AHEAD_DAYS / 7,
                    })
                  : t('nutrient.historyNote', { n: history.length })}
              </p>
              <p>{store ? t('nutrient.historyTank') : t('nutrient.historyRolling', { days: r.windowDays })}</p>
              {ahead.length > 0 && <p>{t('nutrient.aheadNote')}</p>}
            </InfoButton>
          </div>
          <LineChart
            points={history}
            ahead={ahead}
            guides={guides}
            showRange={showRange}
            format={(v) => `${Math.round(v)}%`}
            tone={store ? 'tank' : undefined}
            todayLabel={t('nutrient.today')}
            {...(lab
              ? {
                  marker: {
                    day: lab.day,
                    label: t(`lab.${lab.marker}` as MessageKey).toLowerCase(),
                  },
                }
              : {})}
          />
          <ChartLegend tone={store ? 'tank' : undefined} ahead={ahead.length > 0} range={showRange} />
        </div>
      )}

      {uptakeVaries(id) && req && <UptakeCard id={id} need={req.physiological} />}
      <CameFromCard r={r} />
      {fills && <FillsBest id={id} recommended={req.recommended} />}

      <div className="card fold-group" data-tour="nutrient.why">
        <NutrientInfo id={id} r={r} />
        <a className="fold-row why-link" href={href('nutrient', id, 'why')}>
          <Icon name="question" size={18} />
          <span className="grow">{t('nutrient.whyLink', { value: shown })}</span>
          <Icon name="chevron" size={16} />
        </a>
      </div>
      {store && <BloodTests id={id} folded />}
    </section>
  );
}

/** Weeks of history shown back, and how far "if you go on like this" reaches. */
const STORE_BACK_DAYS = 56;
const STORE_AHEAD_DAYS = 28;

/** What the chart's lines and band mean, as small samples of them instead of a sentence. */
function ChartLegend({ tone, ahead, range }: { tone?: 'tank'; ahead: boolean; range: boolean }) {
  const cls = tone ? `chart chart-${tone} legend-sample` : 'chart legend-sample';
  return (
    <p className="chart-legend small muted">
      <span>
        <svg className={cls} viewBox="0 0 18 8" width="18" height="8" aria-hidden>
          <line x1="0" y1="4" x2="18" y2="4" className="chart-line" />
        </svg>{' '}
        {t(ahead ? 'nutrient.legendSoFar' : 'nutrient.legendAverage')}
      </span>
      {ahead && (
        <span>
          <svg className={cls} viewBox="0 0 18 8" width="18" height="8" aria-hidden>
            <line x1="0" y1="4" x2="18" y2="4" className="chart-line chart-ahead" />
          </svg>{' '}
          {t('nutrient.legendAhead')}
        </span>
      )}
      {range && (
        <span>
          <svg className={cls} viewBox="0 0 14 10" width="14" height="10" aria-hidden>
            <rect width="14" height="10" rx="2" className="chart-band" />
          </svg>{' '}
          {t('nutrient.legendLikely')}
        </span>
      )}
    </p>
  );
}

/** One word for where the number is heading; the full sentence is in the ⓘ sheet. */
function trendWord(tr: Trend, store: boolean): string {
  if (store) {
    if (tr.direction === 'steady') return t(tr.better === false ? 'store.staysEmptyShort' : tr.unsure ? 'store.unsureShort' : 'store.holding');
    return t(tr.direction === 'up' ? 'store.filling' : 'store.draining');
  }
  return t(tr.direction === 'steady' ? (tr.unsure ? 'trend.unsureShort' : 'trend.steady') : tr.direction === 'up' ? 'trend.up' : 'trend.down');
}

/**
 * The top of the page (design 2026-10-22, slimmed 2026-10-23 on the owner's ask): the tank or tile
 * (tap: "Why?"), the number, the likely range, the status, an arrow and one word for the trend, and
 * one dot per day behind the average. Amounts are a bar, extras are chips; every sentence that
 * explains them sits behind ⓘ, so each nutrient's page shows the same pieces and stays short.
 */
function Hero({ r, noData, showRange, whyLabel }: { r: NutrientResult; noData: boolean; showRange: boolean; whyLabel: string }) {
  const d = useData();
  const id = r.id;
  const def = NUTRIENT_BY_ID.get(id)!;
  const req = d.requirements.byNutrient.get(id);
  const store = r.store;
  const status: GaugeStatus = noData ? 'unknown' : (store?.status ?? r.status);
  const span = noData ? undefined : (store?.statusSpan ?? r.statusSpan);
  const trend = noData ? null : store ? storeTrendOf(store) : r.status === 'unknown' ? null : trendOf(r);
  const early = noData ? null : earlyReading(r);
  const trust = logTrust[id];
  const value = noData
    ? '–'
    : store
      ? t('gauge.full', { pct: fmtFill(store.fill.central) })
      : r.kind === 'info'
        ? `${fmtAmount(id, r.averageIntake)}/${t('nutrient.day')}`
        : fmtPercent(r.value.central);
  const range = noData
    ? undefined
    : store
      ? store.fill.high - store.fill.low > 0.02
        ? `${fmtFill(store.fill.low)}–${fmtFill(store.fill.high)}`
        : undefined
      : r.kind !== 'info' && r.value.high - r.value.low > 0.02
        ? `${fmtPercent(r.value.low)}–${fmtPercent(r.value.high)}`
        : undefined;
  const week = store?.netPerDay !== undefined ? store.netPerDay * 7 : undefined;
  const weekText = week !== undefined && Math.abs(week) > 0 ? `${week > 0 ? '+' : '−'}${fmtAmount(id, Math.abs(week))} ${t('nutrient.aWeek')}` : '';
  const days = windowDays(d.modelDays, d.model.daily, d.model.dayStatus, id, r.windowDays, isOn(d.settings.features, 'fillUnloggedDays'));
  const ulOver = r.ulRatio !== undefined && !!req?.upperLimit && r.ulRatio > 1;
  const target = id === 'ENERCC' || id === 'PROT625' || id === 'CHO';
  // Amounts as a bar: for a store what is taken up against what the body uses (they set its direction),
  // otherwise what is eaten against the reference intake, as the number itself compares.
  const bar =
    noData || r.kind === 'info' || !req
      ? undefined
      : store
        ? store.netPerDay === undefined
          ? undefined
          : { amount: Math.max(0, req.physiological + store.netPerDay), ref: req.physiological, label: 'nutrient.barTakenUp' as const, refLabel: 'nutrient.barNeed' as const }
        : {
            amount: r.averageIntake,
            ref: req.recommended,
            label: 'nutrient.barEaten' as const,
            refLabel: req.limitOnly ? ('nutrient.barMax' as const) : req.own ? ('nutrient.barTarget' as const) : ('nutrient.barNeed' as const),
          };
  const todayKcal = d.model.daily.at(-1)?.intake.ENERCC ?? 0;

  return (
    <div className="card nut-hero" data-tour="nutrient.hero">
      <div className="nut-hero-main">
        {r.kind === 'info' ? (
          <span className="nut-sym" aria-hidden>
            {symbolOf(id)}
          </span>
        ) : (
          <a className="nut-visual" href={href('nutrient', id, 'why')} aria-label={whyLabel}>
            {store ? <BigTank fill={store.fill} showRange={showRange} /> : <BigTile r={r} noData={noData} showRange={showRange} />}
          </a>
        )}
        <div className="nut-hero-text grow">
          <p className="muted small">
            <strong>{symbolOf(id)}</strong>
          </p>
          <p className="big-number">{value}</p>
          {range && showRange && <p className="muted small">{t('nutrient.likely', { range })}</p>}
          {r.kind !== 'info' && (
            <p className="status-line">
              <StatusMark status={status} size={14} unsure={isUnsure(span)} /> {statusText(status, span).toLowerCase()}
            </p>
          )}
          {trend && (
            <p className="small trend-line">
              <span aria-hidden>{trendArrows(trend)}</span> {trendWord(trend, !!store)}
              {weekText ? ` · ${weekText}` : ''}
            </p>
          )}
          <DayDots days={days} early={early} />
        </div>
        <InfoButton title={def.name} label={t('nutrient.heroInfo', { name: def.name })}>
          <HeroNotes r={r} noData={noData} trend={trend} weekText={weekText} />
        </InfoButton>
      </div>

      {bar && bar.ref > 0 && <AmountBar id={id} {...bar} status={status} />}
      {id === 'ENERCC' && (
        <AmountBar id={id} amount={todayKcal} ref={d.requirements.energy.kcal} label="nutrient.barToday" refLabel="nutrient.barNeed" status="unknown" today />
      )}

      <div className="chips nut-chips">
        {store?.storeDays && (
          <span className="chip">
            <Icon name="hourglass" size={14} /> {t('tank.lasts', { time: `~${fmtDuration(store.storeDays.central)}` })}
          </span>
        )}
        {store?.measuredOn && (
          <span className="chip">
            <Icon name="drop" size={14} /> {t('nutrient.chipMeasured', { day: formatDay(store.measuredOn, d.today) })}
          </span>
        )}
        {target && (
          <a className="chip chip-link" href={href('settings', 'profile')}>
            <Icon name="target" size={14} /> {t('nutrient.chipTarget')}
            <Icon name="chevron" size={12} />
          </a>
        )}
        {ulOver && (
          <span className="chip chip-warn">
            <Icon name="warning" size={14} /> {t('nutrient.chipUpperLimit', { pct: fmtPercent(r.ulRatio!) })}
          </span>
        )}
        {r.missingDataDays > 0 && (
          <span className="chip chip-warn">
            <Icon name="question" size={14} /> {t('nutrient.chipMissing', { n: r.missingDataDays })}
          </span>
        )}
        {trust && (
          <span className={trust.trust === 'blind' ? 'chip chip-warn' : 'chip'} data-tour="nutrient.trust">
            <Icon name="eye" size={14} /> {t(`trust.chip.${trust.trust}`)}
          </span>
        )}
      </div>
      <TestHint r={r} name={def.name} />
    </div>
  );
}

/** Everything the hero used to say in sentences, word for word, for the ⓘ sheet. */
function HeroNotes({ r, noData, trend, weekText }: { r: NutrientResult; noData: boolean; trend: Trend | null; weekText: string }) {
  const d = useData();
  const id = r.id;
  const def = NUTRIENT_BY_ID.get(id)!;
  const req = d.requirements.byNutrient.get(id);
  const store = r.store;
  return (
    <>
      <p>
        <strong>{symbolOf(id)}</strong> · {t(store ? 'nutrient.kindStore' : r.kind === 'limit' ? 'nutrient.kindLimit' : r.kind === 'info' ? 'nutrient.kindInfo' : 'nutrient.kindNeed')}
      </p>
      <p>
        {store
          ? t('nutrient.tankExplain')
          : r.kind === 'limit'
            ? t(req?.own ? 'nutrient.limitExplainOwn' : 'nutrient.limitExplain', { days: r.windowDays })
            : r.kind === 'info'
              ? t('nutrient.infoExplain', { days: r.windowDays })
              : t('nutrient.rollingExplain', { days: r.windowDays })}
      </p>
      {trend && (
        <p>
          <span aria-hidden>{trendArrows(trend)}</span>{' '}
          {store
            ? `${storeTrendLabel(trend)}${weekText ? ` · ${weekText}` : ''}`
            : t('nutrient.trendLine', {
                label: trendLabel(trend),
                days: trendDisplay.lookbackDays.value,
              })}
        </p>
      )}
      {store && req && !noData && (
        <>
          <TankTrendNote r={r} store={store} need={req.physiological} startedEmpty={d.profile.startingLevel === 'empty' && !store.measuredOn} />
          <IronReferenceNote r={r} store={store} need={req.physiological} />
          {store.slow && !store.measuredOn && <p>{t('nutrient.slowExplain')}</p>}
          {store.slow && !store.measuredOn && !markersFor(id).length && <p>{t('nutrient.noLabYet')}</p>}
          {store.measuredOn && <p>{t('nutrient.measuredOn', { day: formatDay(store.measuredOn, d.today) })}</p>}
        </>
      )}
      {store?.storeDays && <p>{storeLastsText(store.storeDays, def.name)}</p>}
      {!store && r.kind !== 'info' && req && !noData && (
        <p>
          {t(req.own ? (req.limitOnly ? 'nutrient.averageIntakeOwnMax' : 'nutrient.averageIntakeOwn') : 'nutrient.averageIntake', {
            amount: fmtAmount(id, r.averageIntake),
            ref: fmtAmount(id, req.recommended),
          })}
        </p>
      )}
      {id === 'ENERCC' && (
        <>
          <p>
            {t('energy.today', {
              eaten: fmtNumber(d.model.daily.at(-1)?.intake.ENERCC ?? 0),
              target: fmtNumber(d.requirements.energy.kcal),
            })}
          </p>
          <p>
            {energyBasisText(d.requirements.energy)} <a href={href('settings', 'profile')}>{t('energy.change')}</a>
          </p>
        </>
      )}
      {id === 'CHO' && (
        <p>
          {carbBasisText(req)} <a href={href('settings', 'profile')}>{t('carbs.change')}</a>
        </p>
      )}
      {id === 'PROT625' && req && (
        <p>
          {proteinBasisText(req, currentWeight(d.profile) ?? PROFILE_DEFAULTS.weightKg)} <a href={href('settings', 'profile')}>{t('protein.change')}</a>
        </p>
      )}
      {r.ulRatio !== undefined && req?.upperLimit && (
        <p>
          {t('nutrient.upperLimit', {
            limit: fmtAmount(id, req.upperLimit.value),
            pct: fmtPercent(r.ulRatio),
          })}
          {req.upperLimit.basis !== id ? ` ${t(`nutrient.ulBasis.${req.upperLimit.basis}` as MessageKey)}` : ''}
          {req.upperLimit.scope === 'supplements' ? ` ${t('nutrient.ulSupplements')}` : ''}
        </p>
      )}
      <p>
        {r.leftOutDays > 0
          ? t('nutrient.knownDaysLeftOut', {
              known: r.knownDays,
              days: r.windowDays - r.leftOutDays,
              left: r.leftOutDays,
            })
          : t('nutrient.knownDays', { known: r.knownDays, days: r.windowDays })}{' '}
        {t('nutrient.dotsLegend')}
      </p>
      {r.missingDataDays > 0 && <p>{t('nutrient.missingData', { n: r.missingDataDays })}</p>}
      {!noData && isUnsure(store?.statusSpan ?? r.statusSpan) && <p>{t('nutrient.unsureExplain')}</p>}
      <TrustNote id={id} />
      <p className="muted">
        {t('nutrient.modelNote')} {t('nutrient.notAdvice')}
      </p>
      <p>
        <a href={href('nutrient', id, 'why')}>{t('nutrient.whyLink', { value: noData ? '–' : store ? fmtFill(store.fill.central) : r.kind === 'info' ? fmtAmount(id, r.averageIntake) : fmtPercent(r.value.central) })}</a>
      </p>
    </>
  );
}

/**
 * One dot per day behind the average: filled = logged, faint = filled in, dashed = left out, ringed = a food had
 * no data. An early reading says how many of its window's days there are so far ("5 of 14 days so far").
 */
function DayDots({ days, early }: { days: WindowDay[]; early?: { days: number; of: number } | null }) {
  if (!days.length) return null;
  const known = days.filter((x) => x.dot === 'known').length;
  return (
    <p className="day-dots" role="img" aria-label={t('nutrient.dotsSpoken', { n: days.length, known })}>
      {days.map((x) => (
        <span key={x.day} className={`day-dot day-dot-${x.dot}${x.missing ? ' day-dot-missing' : ''}`} />
      ))}
      <span className="small muted">{early ? t('nutrient.earlySoFar', early) : t('nutrient.dotsDays', { n: days.length })}</span>
    </p>
  );
}

/** An amount against its reference on one line: the bar to scale, the reference as a mark. */
export function AmountBar({
  id,
  amount,
  ref,
  label,
  refLabel,
  status,
  today,
}: {
  id: string;
  amount: number;
  ref: number;
  label: MessageKey;
  refLabel: MessageKey;
  status: GaugeStatus;
  today?: boolean;
}) {
  const scale = Math.max(amount, ref) || 1;
  const left = t(label, { amount: fmtAmount(id, amount) });
  const right = t(refLabel, { amount: fmtAmount(id, ref) });
  return (
    <div className={`amount-bar smark-${status}${today ? ' amount-today' : ''}`} role="img" aria-label={`${left}, ${right}`}>
      <span className="small">{left}</span>
      <span className="amount-track" aria-hidden>
        <span className="amount-fill" style={{ width: `${(amount / scale) * 100}%` }} />
        <span className="amount-mark" style={{ left: `calc(${(ref / scale) * 100}% - 1px)` }} />
      </span>
      <span className="small muted">{right}</span>
    </div>
  );
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The store as a big tank, as on Home: solid to the low estimate, the likely range paler, a line at the middle. */
function BigTank({ fill, showRange }: { fill: Range; showRange: boolean }) {
  const low = clamp01(showRange ? fill.low : fill.central);
  const high = clamp01(showRange ? fill.high : fill.central);
  const mid = clamp01(fill.central);
  return (
    <span className="store-tank nut-tank" aria-hidden>
      <span className="store-band" style={{ bottom: `${low * 100}%`, height: `${(high - low) * 100}%` }} />
      <span className="store-fill" style={{ height: `${low * 100}%` }} />
      <span className="store-level" style={{ bottom: `calc(${mid * 100}% - 1px)` }} />
    </span>
  );
}

/**
 * A need or a limit as a big tile, as on Home (fills from the bottom; a limit is striped). Unlike a
 * store, a share of the need can pass 100 %: then the tile's top becomes 150, 200 or 300 % and a
 * dashed line marks 100 %, so "140 %, likely 94–187 %" looks like that (owner's ask, 2026-10-23).
 */
export function BigTile({ r, noData, showRange }: { r: NutrientResult; noData: boolean; showRange: boolean }) {
  const lowV = showRange ? r.value.low : r.value.central;
  const highV = showRange ? r.value.high : r.value.central;
  const { top, over } = noData ? { top: 1, over: false } : tileTop(Math.max(highV, r.value.central));
  const y = (v: number) => clamp01(v / top) * 100;
  const status: GaugeStatus = noData ? 'unknown' : r.status;
  return (
    <span className={`ntile ntile-${r.kind} ntile-${status} nut-tile${over ? ' nut-tile-over' : ''}`} aria-hidden>
      {!noData && (
        <>
          <span className="ntile-fill" style={{ height: `${y(lowV)}%` }} />
          <span className="ntile-band" style={{ bottom: `${y(lowV)}%`, height: `${y(highV) - y(lowV)}%` }} />
          <span className="nut-tile-level" style={{ bottom: `calc(${y(r.value.central)}% - 1px)` }} />
          {top > 1 && (
            <>
              <span className="nut-tile-scale">{over ? '↑' : fmtPercent(top)}</span>
              <span className="nut-tile-need" style={{ bottom: `${y(1)}%` }}>
                <span>100%</span>
              </span>
            </>
          )}
        </>
      )}
      {noData && <span className="ntile-value">?</span>}
    </span>
  );
}

/**
 * What the nutrient does and what too little / too much means, folded (design 2026-10-22: the page
 * stays short; each opens on a tap), with the source under each. Rows of one card since 2026-10-23.
 * Too little and too much are one ladder since 2026-10-26 (info-only nutrients keep the two rows).
 */
function NutrientInfo({ id, r }: { id: string; r: NutrientResult }) {
  const key = infoId(id);
  const group = nutrientType(id);
  const source = NUTRIENT_INFO_SOURCES[key];
  const text = (part: 'role' | 'low' | 'high') => t(`info.${key}.${part}` as MessageKey);
  if (text('role').startsWith('info.')) return null; // no text for this nutrient
  // "Vitamin C" → "vitamin C", not "vitamin c".
  const full = NUTRIENT_BY_ID.get(id)?.name ?? id;
  const name = full.charAt(0).toLowerCase() + full.slice(1);
  const cite = source && (
    <p className="muted small">
      {t('nutrient.infoSource')}:{' '}
      <a href={source.url} target="_blank" rel="noreferrer">
        {source.label}
      </a>
    </p>
  );
  const folds: Array<{
    icon: 'leaf' | 'info' | 'warning';
    title: string;
    body: ReactNode;
  }> = [
    {
      icon: 'leaf',
      title: t('nutrient.whatItDoesName', { name }),
      body: (
        <>
          <WhatItDoes id={id} skipUrl={source?.url} extra={key === 'EAA' ? t(`aaRole.${id}` as MessageKey) : undefined} />
        </>
      ),
    },
  ];
  const ladder = hasLadder(r);
  if (!ladder)
    folds.push(
      {
        icon: 'info',
        title: t('nutrient.tooLittleTitle'),
        body: <p>{text('low')}</p>,
      },
      {
        icon: 'warning',
        title: t('nutrient.tooMuchTitle'),
        body: <p>{text('high')}</p>,
      },
    );
  return (
    <>
      {folds.map((f) => (
        <details key={f.title} className="fold">
          <summary className="fold-row">
            <Icon name={f.icon} size={18} />
            <span className="grow">{f.title}</span>
            <Icon name="down" size={16} />
          </summary>
          <div className="small fold-body">
            {f.body}
            {cite}
            {f.icon === 'leaf' && hasGroupInfo(group) && <GroupInfoLink group={group} />}
          </div>
        </details>
      ))}
      {ladder ? <LevelLadder id={id} r={r} /> : <p className="muted small ladder-note">{t(`ladder.noLadder.${key}` as MessageKey)}</p>}
    </>
  );
}

function storeLastsText(days: Range, name: string): string {
  const low = fmtDuration(days.low);
  const high = fmtDuration(days.high);
  const central = fmtDuration(days.central);
  const vars = { central, low, high, name: name.toLowerCase() };
  return low === high ? t('nutrient.storeLastsNone', vars) : t('nutrient.storeLastsNoneRange', vars);
}

const toPercent = (p: HistoryPoint): HistoryPoint => ({
  ...p,
  low: p.low * 100,
  central: p.central * 100,
  high: p.high * 100,
});

/**
 * Whether a store is filling or going down at the recent rate, so a low tank on a good diet
 * doesn't read as "you eat too little" (e.g. after starting empty).
 */
function TankTrendNote({ r, store, need, startedEmpty }: { r: NutrientResult; store: StoreResult; need: number; startedEmpty: boolean }) {
  const trend = tankTrend(store);
  const fill = store.fill.central;
  if (!trend || store.netPerDay === undefined || fill >= 1) return null;
  const low = fill < statusThresholds.tank.value.gettingLow;
  // "Not because you eat too little" only holds when the diet covers the need (at normal iron stores for iron).
  const dietCovers = r.value.central >= 1;
  // Absorbed = need + net change, so the two numbers always explain the direction (vitamin D includes sun).
  const vars = {
    absorbed: fmtAmount(r.id, Math.max(0, need + store.netPerDay)),
    need: fmtAmount(r.id, need),
  };
  const text = storeTrendOf(store)?.unsure
    ? t('nutrient.trendUnsure', vars)
    : trend.direction === 'draining'
      ? t(store.level.central > 0 ? 'nutrient.trendDraining' : 'nutrient.trendEmpty', vars)
      : trend.direction === 'steady'
        ? t('nutrient.trendSteady', vars)
        : trend.daysToFine !== undefined
          ? t('nutrient.trendFillingTime', {
              ...vars,
              time: fmtDuration(trend.daysToFine),
            })
          : t('nutrient.trendFilling', vars);
  return (
    <>
      <p>{text}</p>
      {low && startedEmpty && dietCovers && trend.direction === 'filling' && (
        <p>
          {t('nutrient.startedEmpty')} <a href={href('settings', 'start')}>{t('nutrient.changeStart')}</a>
        </p>
      )}
    </>
  );
}

/**
 * Iron is absorbed better while stores are low, so the store can fill on a diet that would not cover the need
 * at normal stores. Say so in amounts, so the filling store doesn't read as "my diet is enough".
 */
function IronReferenceNote({ r, store, need }: { r: NutrientResult; store: StoreResult; need: number }) {
  if (store.netPerDay === undefined || hasNoData(r)) return null;
  const adapted = Math.max(0, need + store.netPerDay);
  const reference = r.value.central * need;
  if (adapted - reference <= 0.05 * need) return null;
  return (
    <p>
      {t('nutrient.ironReference', {
        absorbed: fmtAmount(r.id, reference),
        need: fmtAmount(r.id, need),
      })}
    </p>
  );
}

function TestHint({ r, name }: { r: NutrientResult; name: string }) {
  const text = testHintText(r, name);
  return text ? <p className="small notice">{text}</p> : null;
}

/** How far a food log can see this nutrient (model/log-trust.ts), with the reason and its source. */
function TrustNote({ id }: { id: string }) {
  const trust = logTrust[id];
  if (!trust) return null;
  const reason = trustReasons[trust.reason];
  return (
    <p>
      <strong>{t(`trust.chip.${trust.trust}`)}.</strong> {t(`trust.${trust.trust}`)} {t(`trust.reason.${trust.reason}`)}{' '}
      {reason.url && (
        <a href={reason.url} target="_blank" rel="noreferrer">
          {t('trust.source')}
        </a>
      )}
    </p>
  );
}
