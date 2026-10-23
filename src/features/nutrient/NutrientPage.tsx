import type { ReactNode } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { fmtAmount, fmtFill, fmtNumber, fmtPercent } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { tankTrend, type GaugeStatus, type HistoryPoint, type NutrientResult, type StoreResult } from '../../model/simulate';
import type { Range } from '../../model/paramTypes';
import { statusThresholds, trendDisplay } from '../../../model/parameters';
import { storeTrendOf, trendOf } from '../../model/trend';
import { isOn } from '../../settings/features';
import { infoId, NUTRIENT_INFO_SOURCES } from '../../i18n/nutrientInfo.en';
import { storeAhead } from '../../logic/nutrientPage';
import { AskChips } from '../../ui/AskChips';
import { LineChart } from '../../ui/LineChart';
import { hasNoData, storeTrendLabel, trendArrows, trendLabel } from '../../ui/Gauge';
import { statusLabel } from '../../ui/status';
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

  return (
    <section className="nutrient-page">
      <header className="page-head row">
        <BackButton />
        <div className="grow">
          <p className="muted small page-kicker">{t('nutrient.lastDays', { n: r.windowDays })}</p>
          <h1>{def.name}</h1>
        </div>
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

      {history.length > 1 && (
        <div className="card">
          <div className="card-head">
            <h2>{t(store ? 'nutrient.fillTitle' : 'nutrient.history')}</h2>
            <span className="card-note">
              {ahead.length
                ? t('nutrient.fillNote', {
                    back: history.length,
                    ahead: STORE_AHEAD_DAYS / 7,
                  })
                : t('nutrient.historyNote', { n: history.length })}
            </span>
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
          <p className="muted small">{store ? `${t('nutrient.historyTank')}${ahead.length ? ` ${t('nutrient.aheadNote')}` : ''}` : t('nutrient.historyRolling', { days: r.windowDays })}</p>
        </div>
      )}

      {uptakeVaries(id) && req && <UptakeCard id={id} need={req.physiological} />}
      <CameFromCard r={r} />
      {fills && <FillsBest id={id} recommended={req.recommended} />}

      <NutrientInfo id={id} />
      {store && <BloodTests id={id} folded />}

      <a className="card why-link" href={href('nutrient', id, 'why')}>
        <Icon name="question" size={20} />
        <span className="grow">{t('nutrient.whyLink', { value: shown })}</span>
        <Icon name="chevron" size={16} />
      </a>
      <p className="muted small">
        {t('nutrient.modelNote')} {t('nutrient.notAdvice')}
      </p>
    </section>
  );
}

/** Weeks of history shown back, and how far "if you go on like this" reaches. */
const STORE_BACK_DAYS = 56;
const STORE_AHEAD_DAYS = 28;

/**
 * The top of the page (design 2026-10-22): the tank or tile (tap: "Why?"), the number, the likely
 * range, the status in words, where it is heading, and the notes that keep it from misleading.
 */
function Hero({ r, noData, showRange, whyLabel }: { r: NutrientResult; noData: boolean; showRange: boolean; whyLabel: string }) {
  const d = useData();
  const id = r.id;
  const def = NUTRIENT_BY_ID.get(id)!;
  const req = d.requirements.byNutrient.get(id);
  const store = r.store;
  const status: GaugeStatus = noData ? 'unknown' : (store?.status ?? r.status);
  const trend = noData ? null : store ? storeTrendOf(store) : r.status === 'unknown' ? null : trendOf(r);
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
  return (
    <div className="card nut-hero">
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
        <div className="nut-hero-text">
          <p className="muted small">
            <strong>{symbolOf(id)}</strong> · {t(store ? 'nutrient.kindStore' : r.kind === 'limit' ? 'nutrient.kindLimit' : r.kind === 'info' ? 'nutrient.kindInfo' : 'nutrient.kindNeed')}
          </p>
          <p className="big-number">{value}</p>
          {range && showRange && <p className="muted small">{t('nutrient.likely', { range })}</p>}
          {r.kind !== 'info' && (
            <p className="status-line">
              <StatusMark status={status} size={14} /> {statusLabel(status).toLowerCase()}
            </p>
          )}
          {trend && (
            <p className="small trend-line">
              <span aria-hidden>{trendArrows(trend)}</span>{' '}
              {store
                ? storeTrendLabel(trend)
                : t('nutrient.trendLine', {
                    label: trendLabel(trend),
                    days: trendDisplay.lookbackDays.value,
                  })}
              {week !== undefined && Math.abs(week) > 0 ? ` · ${week > 0 ? '+' : '−'}${fmtAmount(id, Math.abs(week))} ${t('nutrient.aWeek')}` : ''}
            </p>
          )}
          {store?.storeDays && <p className="small muted">{storeLastsText(store.storeDays, def.name)}</p>}
        </div>
      </div>
      <div className="nut-hero-notes">
        <p className="small muted">
          {store
            ? t('nutrient.tankExplain')
            : r.kind === 'limit'
              ? t(req?.own ? 'nutrient.limitExplainOwn' : 'nutrient.limitExplain', { days: r.windowDays })
              : r.kind === 'info'
                ? t('nutrient.infoExplain', { days: r.windowDays })
                : t('nutrient.rollingExplain', { days: r.windowDays })}
        </p>
        {store && req && !noData && (
          <>
            <TankTrendNote r={r} store={store} need={req.physiological} startedEmpty={d.profile.startingLevel === 'empty' && !store.measuredOn} />
            <IronReferenceNote r={r} store={store} need={req.physiological} />
            {store.slow && !store.measuredOn && <p className="small muted">{t('nutrient.slowExplain')}</p>}
            {store.slow && !store.measuredOn && !markersFor(id).length && <p className="small muted">{t('nutrient.noLabYet')}</p>}
            {store.measuredOn && (
              <p className="small">
                {t('nutrient.measuredOn', {
                  day: formatDay(store.measuredOn, d.today),
                })}
              </p>
            )}
          </>
        )}
        {!store && r.kind !== 'info' && req && !noData && (
          <p className="small muted">
            {t(req.own ? (req.limitOnly ? 'nutrient.averageIntakeOwnMax' : 'nutrient.averageIntakeOwn') : 'nutrient.averageIntake', {
              amount: fmtAmount(id, r.averageIntake),
              ref: fmtAmount(id, req.recommended),
            })}
          </p>
        )}
        {r.leftOutDays > 0 ? (
          <p className="small muted">
            {t('nutrient.knownDaysLeftOut', {
              known: r.knownDays,
              days: r.windowDays - r.leftOutDays,
              left: r.leftOutDays,
            })}
          </p>
        ) : r.knownDays < r.windowDays ? (
          <p className="small muted">
            {t('nutrient.knownDays', {
              known: r.knownDays,
              days: r.windowDays,
            })}
          </p>
        ) : null}
        {id === 'ENERCC' && (
          <>
            <p className="small">
              {t('energy.today', {
                eaten: fmtNumber(d.model.daily.at(-1)?.intake.ENERCC ?? 0),
                target: fmtNumber(d.requirements.energy.kcal),
              })}
            </p>
            <p className="small muted">
              {energyBasisText(d.requirements.energy)} <a href={href('settings', 'profile')}>{t('energy.change')}</a>
            </p>
          </>
        )}
        {id === 'CHO' && (
          <p className="small muted">
            {carbBasisText(req)} <a href={href('settings', 'profile')}>{t('carbs.change')}</a>
          </p>
        )}
        {id === 'PROT625' && req && (
          <p className="small muted">
            {proteinBasisText(req, currentWeight(d.profile) ?? PROFILE_DEFAULTS.weightKg)} <a href={href('settings', 'profile')}>{t('protein.change')}</a>
          </p>
        )}
        <TestHint r={r} name={def.name} />
        {r.missingDataDays > 0 && <p className="small notice">{t('nutrient.missingData', { n: r.missingDataDays })}</p>}
        {r.ulRatio !== undefined && req?.upperLimit && (
          <p className={`small${r.ulRatio > 1 ? ' notice' : ' muted'}`}>
            {t('nutrient.upperLimit', {
              limit: fmtAmount(id, req.upperLimit.value),
              pct: fmtPercent(r.ulRatio),
            })}
            {req.upperLimit.basis !== id ? ` ${t(`nutrient.ulBasis.${req.upperLimit.basis}` as MessageKey)}` : ''}
            {req.upperLimit.scope === 'supplements' ? ` ${t('nutrient.ulSupplements')}` : ''}
          </p>
        )}
      </div>
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

/** A need or a limit as a big tile, as on Home (fills from the bottom; a limit is striped). */
function BigTile({ r, noData, showRange }: { r: NutrientResult; noData: boolean; showRange: boolean }) {
  const low = clamp01(showRange ? r.value.low : r.value.central);
  const high = clamp01(showRange ? r.value.high : r.value.central);
  const status: GaugeStatus = noData ? 'unknown' : r.status;
  return (
    <span className={`ntile ntile-${r.kind} ntile-${status} nut-tile`} aria-hidden>
      {!noData && (
        <>
          <span className="ntile-fill" style={{ height: `${low * 100}%` }} />
          <span
            className="ntile-band"
            style={{
              bottom: `${low * 100}%`,
              height: `${(high - low) * 100}%`,
            }}
          />
        </>
      )}
      {noData && <span className="ntile-value">?</span>}
    </span>
  );
}

/**
 * What the nutrient does and what too little / too much means, folded (design 2026-10-22: the page
 * stays short; each opens on a tap), with the source under each.
 */
function NutrientInfo({ id }: { id: string }) {
  const key = infoId(id);
  const group = nutrientType(id);
  const source = NUTRIENT_INFO_SOURCES[key];
  const text = (part: 'role' | 'low' | 'high') => t(`info.${key}.${part}` as MessageKey);
  if (text('role').startsWith('info.')) return null; // no text for this nutrient
  const name = NUTRIENT_BY_ID.get(id)?.name.toLowerCase() ?? id;
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
          {<p>{text('role')}</p>}
          {key === 'EAA' && <p>{t(`aaRole.${id}` as MessageKey)}</p>}
        </>
      ),
    },
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
  ];
  return (
    <div className="folds">
      {folds.map((f) => (
        <details key={f.title} className="card fold">
          <summary>
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
    </div>
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
  const text =
    trend.direction === 'draining'
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
      <p className="small">{text}</p>
      {low && startedEmpty && dietCovers && trend.direction === 'filling' && (
        <p className="small">
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
    <p className="small">
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
