import { useMemo } from 'react';
import { useData, type AppData } from '../../app/data';
import type { LogEntry } from '../../storage/types';
import { refHref } from '../food/links';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { fmtAmount, fmtFill, fmtNumber, fmtPercent } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { tankTrend, type HistoryPoint, type NutrientResult, type StoreResult } from '../../model/simulate';
import type { Range } from '../../model/paramTypes';
import { nutrientParams, statusThresholds, storage, trendDisplay } from '../../../model/parameters';
import { storeTrendOf, trendOf } from '../../model/trend';
import { referenceValues } from '../../../model/reference-values';
import { portionGrams } from '../../model/ranking';
import { isOn } from '../../settings/features';
import { NON_SINGLE_FOOD_GROUPS } from '../../foods/foodDb';
import { diverseTop } from '../../foods/variety';
import { infoId, NUTRIENT_INFO_SOURCES } from '../../i18n/nutrientInfo.en';
import { LineChart } from '../../ui/LineChart';
import { hasNoData, storeTrendLabel, trendArrows, trendLabel } from '../../ui/Gauge';
import { StatusBadge } from '../../ui/status';
import { Icon } from '../../ui/Icon';
import { energyBasisText } from '../settings/EnergyTarget';
import { proteinBasisText } from '../settings/ProteinTarget';
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

export function NutrientPage({ id, context }: { id: string; context?: SplitContext }) {
  const d = useData();
  const def = NUTRIENT_BY_ID.get(id);
  const r = d.model.nutrients.get(id);
  const req = d.requirements.byNutrient.get(id);
  const ref = referenceValues.find((x) => x.nutrient === id);
  const params = nutrientParams[id];
  const showRange = isOn(d.settings.features, 'uncertaintyRanges');
  const advanced = isOn(d.settings.features, 'advancedNumbers');

  const sources = useMemo(() => {
    const excludedGroups = new Set(d.profile.exclusions.groups);
    const foods = d.foods.foods.filter((f) => !NON_SINGLE_FOOD_GROUPS.has(f.group) && !excludedGroups.has(f.group) && typeof f.per100[id] === 'number');
    const per100 = diverseTop(
      [...foods].sort((a, b) => (b.per100[id] as number) - (a.per100[id] as number)),
      8,
      (f) => f,
    );
    const perPortion = diverseTop(
      foods
        .map((f) => ({ f, amount: ((f.per100[id] as number) * portionGrams(f.per100)) / 100, grams: portionGrams(f.per100) }))
        .sort((a, b) => b.amount - a.amount),
      8,
      (x) => x.f,
    );
    return { per100, perPortion };
  }, [d.foods, d.profile.exclusions, id]);

  if (!def || !r) return <p>{t('nutrient.unknown')}</p>;

  const model = storage[id];
  const noData = hasNoData(r);
  const trend = r.status === 'unknown' ? null : trendOf(r);
  const history = r.history.slice(-120).map(toPercent);
  const guides = r.kind === 'info' ? [] : [{ value: 100, label: '100%' }];

  return (
    <section>
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
      <div className="card">
        <StatusBadge status={r.status} />
        <p className="big-number">
          {noData
            ? '–'
            : r.kind === 'info'
              ? `${fmtAmount(id, r.averageIntake)}/${t('nutrient.day')}`
              : fmtPercent(r.value.central)}
          {showRange && !noData && r.kind !== 'info' && r.value.high - r.value.low > 0.02 && <span className="muted range"> ({fmtPercent(r.value.low)}–{fmtPercent(r.value.high)})</span>}
        </p>
        {trend && !noData && (
          <p className="small trend-line">
            <span className={`trend trend-${trend.better === true ? 'better' : trend.better === false ? 'worse' : 'neutral'}`} aria-hidden>
              {trendArrows(trend)}
            </span>{' '}
            {t('nutrient.trendLine', { label: trendLabel(trend), days: trendDisplay.lookbackDays.value })}
          </p>
        )}
        <p className="small">
          {r.kind === 'limit'
            ? t('nutrient.limitExplain', { days: r.windowDays })
            : r.kind === 'info'
              ? t('nutrient.infoExplain', { days: r.windowDays })
              : r.store
                ? t('nutrient.storeAverageExplain', { days: r.windowDays })
                : t('nutrient.rollingExplain', { days: r.windowDays })}
        </p>
        {r.kind !== 'info' && req && (
          <p className="small muted">
            {t(req.own ? 'nutrient.averageIntakeOwn' : 'nutrient.averageIntake', { amount: fmtAmount(id, r.averageIntake), ref: fmtAmount(id, req.recommended) })}
            {r.leftOutDays > 0
              ? ` ${t('nutrient.knownDaysLeftOut', { known: r.knownDays, days: r.windowDays - r.leftOutDays, left: r.leftOutDays })}`
              : r.knownDays < r.windowDays
                ? ` ${t('nutrient.knownDays', { known: r.knownDays, days: r.windowDays })}`
                : ''}
          </p>
        )}
        {id === 'ENERCC' && (
          <>
            <p className="small">{t('energy.today', { eaten: fmtNumber(d.model.daily.at(-1)?.intake.ENERCC ?? 0), target: fmtNumber(d.requirements.energy.kcal) })}</p>
            <p className="small muted">
              {energyBasisText(d.requirements.energy)} <a href={href('settings', 'profile')}>{t('energy.change')}</a>
            </p>
          </>
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
              limit: fmtAmount(req.upperLimit.basis === id ? id : id, req.upperLimit.value),
              pct: fmtPercent(r.ulRatio),
            })}
            {req.upperLimit.basis !== id ? ` ${t(`nutrient.ulBasis.${req.upperLimit.basis}` as MessageKey)}` : ''}
            {req.upperLimit.scope === 'supplements' ? ` ${t('nutrient.ulSupplements')}` : ''}
          </p>
        )}
      </div>

      {r.store && req && (
        <StoreCard r={r} store={r.store} need={req.physiological} showRange={showRange} startedEmpty={d.profile.startingLevel === 'empty'} today={d.today} />
      )}
      {r.store && <BloodTests id={id} />}

      <NutrientInfo id={id} />

      {history.length > 1 && (
        <>
          <h2 className="section-title">{t('nutrient.history')}</h2>
          <div className="card">
            <LineChart points={history} guides={guides} showRange={showRange} format={(v) => `${Math.round(v)}%`} />
            <p className="muted small">{t('nutrient.historyRolling', { days: r.windowDays })}</p>
          </div>
        </>
      )}

      {r.contributors.length > 0 && (
        <>
          <h2 className="section-title">{t('nutrient.contributors')}</h2>
          <ul className="plain-list card contributors">
            {r.contributors.map((c) => {
              const body = (
                <>
                  <span>{c.label}</span>
                  <span className="muted small">
                    {fmtPercent(c.share)}
                    {advanced ? ` · ${fmtAmount(id, c.amount)}/${t('nutrient.day')}` : ''}
                  </span>
                </>
              );
              const to = contributorHref(d, c.label);
              return (
                <li key={c.label}>
                  {to ? (
                    <a className="row-between contributor-link" href={to}>
                      {body}
                    </a>
                  ) : (
                    <div className="row-between">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h2 className="section-title">{t('nutrient.sources')}</h2>
      <div className="grid-2 sources">
        <div>
          <h3>{t('nutrient.per100')}</h3>
          <ol className="source-list">
            {sources.per100.map((f) => (
              <li key={f.code}>
                <a href={href('food', f.code)}>{f.nameEn}</a> <span className="muted small">{fmtAmount(id, f.per100[id] as number)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3>{t('nutrient.perPortion')}</h3>
          <ol className="source-list">
            {sources.perPortion.map(({ f, amount, grams }) => (
              <li key={f.code}>
                <a href={href('food', f.code)}>{f.nameEn}</a>{' '}
                <span className="muted small">
                  {fmtAmount(id, amount)} / {Math.round(grams)} g
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <a className="btn btn-secondary btn-block" href={href('nutrient', id, 'foods')}>
        <Icon name="search" /> {t('nutrient.allFoods')}
      </a>

      <h2 className="section-title">{t('nutrient.howModelled')}</h2>
      <div className="card small">
        <p>
          {model?.kind === 'rolling' ? t('nutrient.modelRolling', { days: r.windowDays }) : t('nutrient.modelTank')}{' '}
          {params?.rule.type === 'saturable' && t('nutrient.ruleSaturable')}
          {params?.rule.type === 'doseTable' && t('nutrient.ruleDose')}
          {params?.rule.type === 'doseLog' && t('nutrient.ruleDose')}
          {params?.rule.type === 'iron' && t('nutrient.ruleIron')}
          {params?.fatSoluble && ` ${t('nutrient.ruleFat')}`}
          {id === 'VITD' && ` ${t('nutrient.vitDSun')}`}
        </p>
        {req && (
          <ul className="plain-list">
            <li>
              {req.own ? t('nutrient.ownTarget') : t(`refKind.${req.kind}` as MessageKey)}: <strong>{fmtAmount(id, req.recommended)}</strong>/{t('nutrient.day')}
            </li>
            {req.own && (
              <li>
                {t('nutrient.withoutOwn')}: {fmtAmount(id, req.own.referenceRecommended)}/{t('nutrient.day')}
              </li>
            )}
            {req.physiological !== req.recommended && (
              <li>
                {t('nutrient.absorbedNeed')}: {fmtAmount(id, req.physiological)}/{t('nutrient.day')}
                {req.physiologicalDerived ? ` (${t('nutrient.derived')})` : ''}
              </li>
            )}
            {r.store && advanced && (
              <li>
                {t('nutrient.capacity')}: {fmtAmount(id, r.store.capacity)}
              </li>
            )}
          </ul>
        )}
        {ref && (
          <p className="muted">
            {t('nutrient.source')}: {ref.url ? <a href={ref.url} target="_blank" rel="noreferrer">{ref.source}</a> : ref.source} · {t('nutrient.confidence')}: {t(`conf.${ref.confidence}` as MessageKey)}
            {advanced && ref.note ? ` · ${ref.note}` : ''}
          </p>
        )}
        <p className="muted">{t('nutrient.notAdvice')}</p>
      </div>
    </section>
  );
}

/**
 * Where a "Where it came from" line leads: contributors are summed by name, so the latest entry of
 * that name says what it is: a recipe portion its recipe, a food its page, anything else that entry.
 */
function contributorHref(d: AppData, label: string): string | undefined {
  let latest: LogEntry | undefined;
  for (const e of d.log) if (e.label === label && (!latest || e.time > latest.time)) latest = e;
  if (!latest) return undefined;
  if (latest.kind === 'portion') {
    const recipeId = d.batchesById.get(latest.batchId)?.recipeId;
    if (recipeId && d.recipes.some((r) => r.id === recipeId)) return href('recipes', recipeId);
  }
  if (latest.kind === 'food') return refHref(d, latest.ref) ?? href('entry', latest.id);
  return href('entry', latest.id);
}

/** What the nutrient does and what too little / too much means. */
function NutrientInfo({ id }: { id: string }) {
  const key = infoId(id);
  const group = nutrientType(id);
  const source = NUTRIENT_INFO_SOURCES[key];
  const text = (part: 'role' | 'low' | 'high') => t(`info.${key}.${part}` as MessageKey);
  if (text('role').startsWith('info.')) return null; // no text for this nutrient
  return (
    <>
      <h2 className="section-title">{t('nutrient.whatItDoes')}</h2>
      <div className="card small nutrient-info">
        <p>{text('role')}</p>
        {key === 'EAA' && <p>{t(`aaRole.${id}` as MessageKey)}</p>}
        <p>
          <strong>{t('nutrient.tooLittle')}:</strong> {text('low')}
        </p>
        <p>
          <strong>{t('nutrient.tooMuch')}:</strong> {text('high')}
        </p>
        {source && (
          <p className="muted">
            {t('nutrient.infoSource')}:{' '}
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.label}
            </a>
          </p>
        )}
        {hasGroupInfo(group) && <GroupInfoLink group={group} />}
      </div>
    </>
  );
}

/** How long a full store would cover the need with nothing eaten, with its sourced range. */
function storeLastsText(days: Range): string {
  const low = fmtDuration(days.low);
  const high = fmtDuration(days.high);
  const central = fmtDuration(days.central);
  return low === high ? t('nutrient.storeLasts', { central }) : t('nutrient.storeLastsRange', { central, low, high });
}

const toPercent = (p: HistoryPoint): HistoryPoint => ({ ...p, low: p.low * 100, central: p.central * 100, high: p.high * 100 });

/**
 * The body store behind a nutrient: how full it is, whether it is filling, how long a full one lasts, the
 * notes that keep an empty start or iron's adapted absorption from misleading, and the fill history.
 */
function StoreCard({ r, store, need, showRange, startedEmpty, today }: { r: NutrientResult; store: StoreResult; need: number; showRange: boolean; startedEmpty: boolean; today: string }) {
  const tr = storeTrendOf(store);
  const history = store.history.slice(-120).map(toPercent);
  const gettingLow = statusThresholds.tank.value.gettingLow;
  return (
    <>
      <h2 className="section-title">{t('nutrient.storeTitle')}</h2>
      <div className="card">
        <StatusBadge status={store.status} />
        <p className="big-number">
          {t('gauge.full', { pct: fmtFill(store.fill.central) })}
          {showRange && store.fill.high - store.fill.low > 0.02 && (
            <span className="muted range">
              {' '}
              ({fmtFill(store.fill.low)}–{fmtFill(store.fill.high)})
            </span>
          )}
        </p>
        {tr && (
          <p className="small trend-line">
            <span className={`trend trend-${tr.better === true ? 'better' : tr.better === false ? 'worse' : 'neutral'}`} aria-hidden>
              {trendArrows(tr)}
            </span>{' '}
            {storeTrendLabel(tr)}
          </p>
        )}
        <p className="small">
          {store.storeDays && `${storeLastsText(store.storeDays)} `}
          {t('nutrient.tankExplain')}
          {store.slow && !store.measuredOn ? ` ${t('nutrient.slowExplain')}` : ''}
        </p>
        <TankTrendNote r={r} store={store} need={need} startedEmpty={startedEmpty && !store.measuredOn} />
        <IronReferenceNote r={r} store={store} need={need} />
        {store.slow && !store.measuredOn && !markersFor(r.id).length && <p className="small muted">{t('nutrient.noLabYet')}</p>}
        {store.measuredOn && <p className="small">{t('nutrient.measuredOn', { day: formatDay(store.measuredOn, today) })}</p>}
        {history.length > 1 && (
          <>
            <LineChart
              points={history}
              guides={[
                { value: 100, label: '100%' },
                { value: gettingLow * 100, label: fmtPercent(gettingLow) },
              ]}
              showRange={showRange}
              format={(v) => `${Math.round(v)}%`}
            />
            <p className="muted small">{t('nutrient.historyTank')}</p>
          </>
        )}
      </div>
    </>
  );
}

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
  const vars = { absorbed: fmtAmount(r.id, Math.max(0, need + store.netPerDay)), need: fmtAmount(r.id, need) };
  const text =
    trend.direction === 'draining'
      ? t(store.level.central > 0 ? 'nutrient.trendDraining' : 'nutrient.trendEmpty', vars)
      : trend.direction === 'steady'
        ? t('nutrient.trendSteady', vars)
        : trend.daysToFine !== undefined
          ? t('nutrient.trendFillingTime', { ...vars, time: fmtDuration(trend.daysToFine) })
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
  return <p className="small">{t('nutrient.ironReference', { absorbed: fmtAmount(r.id, reference), need: fmtAmount(r.id, need) })}</p>;
}

function TestHint({ r, name }: { r: NutrientResult; name: string }) {
  const text = testHintText(r, name);
  return text ? <p className="small notice">{text}</p> : null;
}
