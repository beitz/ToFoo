import { useMemo } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { fmtAmount, fmtFill, fmtNumber, fmtPercent } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { tankTrend, type NutrientResult } from '../../model/simulate';
import type { Range } from '../../model/paramTypes';
import { nutrientParams, statusThresholds, storage, trendDisplay } from '../../../model/parameters';
import { trendOf } from '../../model/trend';
import { referenceValues } from '../../../model/reference-values';
import { portionGrams } from '../../model/ranking';
import { isOn } from '../../settings/features';
import { NON_SINGLE_FOOD_GROUPS } from '../../foods/foodDb';
import { diverseTop } from '../../foods/variety';
import { infoId, NUTRIENT_INFO_SOURCES } from '../../i18n/nutrientInfo.en';
import { LineChart } from '../../ui/LineChart';
import { hasNoData, trendArrows, trendLabel } from '../../ui/Gauge';
import { StatusBadge } from '../../ui/status';
import { Icon } from '../../ui/Icon';
import { energyBasisText } from '../settings/EnergyTarget';
import { testHintText } from './testHint';
import { BloodTests, markersFor } from './BloodTests';
import { formatDay } from '../../lib/dates';

export function NutrientPage({ id }: { id: string }) {
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
  const isTank = r.kind === 'tank';
  const noData = hasNoData(r);
  const trend = r.status === 'unknown' ? null : trendOf(r);
  const scale = (v: number) => v * 100;
  const history = r.history.slice(-120).map((p) => ({ ...p, low: scale(p.low), central: scale(p.central), high: scale(p.high) }));
  const guides =
    r.kind === 'tank'
      ? [
          { value: 100, label: '100%' },
          { value: statusThresholds.tank.value.gettingLow * 100, label: fmtPercent(statusThresholds.tank.value.gettingLow) },
        ]
      : r.kind === 'info'
        ? []
        : [{ value: 100, label: '100%' }];

  return (
    <section>
      <header className="page-head row">
        <a className="icon-btn" href={href()} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1 className="grow">{def.name}</h1>
      </header>
      <div className="card">
        <StatusBadge status={r.status} />
        <p className="big-number">
          {noData
            ? '–'
            : r.kind === 'tank'
            ? t('gauge.full', { pct: fmtFill(r.value.central) })
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
          {(r.kind === 'tank' || r.kind === 'balance') && r.storeDays && `${storeLastsText(r.storeDays)} `}
          {r.kind === 'tank'
            ? t('nutrient.tankExplain')
            : r.kind === 'balance'
              ? t('nutrient.balanceExplain', { days: r.windowDays })
            : r.kind === 'limit'
              ? t('nutrient.limitExplain', { days: r.windowDays })
              : r.kind === 'info'
                ? t('nutrient.infoExplain', { days: r.windowDays })
                : t('nutrient.rollingExplain', { days: r.windowDays })}
        </p>
        {r.kind !== 'info' && req && (
          <p className="small muted">
            {t('nutrient.averageIntake', { amount: fmtAmount(id, r.averageIntake), ref: fmtAmount(id, req.recommended) })}
            {r.kind !== 'tank' && r.leftOutDays > 0
              ? ` ${t('nutrient.knownDaysLeftOut', { known: r.knownDays, days: r.windowDays - r.leftOutDays, left: r.leftOutDays })}`
              : r.knownDays < r.windowDays && r.kind !== 'tank'
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
        {isTank && req && <TankTrendNote r={r} need={req.physiological} startedEmpty={d.profile.startingLevel === 'empty' && !r.measuredOn} />}
        {r.measuredOn && <p className="small">{t('nutrient.measuredOn', { day: formatDay(r.measuredOn, d.today) })}</p>}
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

      {r.kind === 'balance' && req && (
        <>
          <h2 className="section-title">{t('nutrient.storeTitle')}</h2>
          <div className="card">
            <p className="small">{t('nutrient.storeUnknown')}</p>
            <p className="small">
              {t(r.averageAbsorbed >= req.physiological ? 'nutrient.storeGaining' : 'nutrient.storeLosing', {
                absorbed: fmtAmount(id, r.averageAbsorbed),
                need: fmtAmount(id, req.physiological),
              })}
            </p>
            {!markersFor(id).length && <p className="small muted">{t('nutrient.noLabYet')}</p>}
          </div>
        </>
      )}
      {(r.kind === 'balance' || r.kind === 'tank') && <BloodTests id={id} />}

      <NutrientInfo id={id} />

      {history.length > 1 && (
        <>
          <h2 className="section-title">{t('nutrient.history')}</h2>
          <div className="card">
            <LineChart points={history} guides={guides} showRange={showRange} format={(v) => `${Math.round(v)}%`} />
            <p className="muted small">{isTank ? t('nutrient.historyTank') : t('nutrient.historyRolling', { days: r.windowDays })}</p>
          </div>
        </>
      )}

      {r.contributors.length > 0 && (
        <>
          <h2 className="section-title">{t('nutrient.contributors')}</h2>
          <ul className="plain-list card">
            {r.contributors.map((c) => (
              <li key={c.label} className="row-between">
                <span>{c.label}</span>
                <span className="muted small">
                  {fmtPercent(c.share)}
                  {advanced ? ` · ${fmtAmount(id, c.amount)}/${t('nutrient.day')}` : ''}
                </span>
              </li>
            ))}
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
              {t(`refKind.${req.kind}` as MessageKey)}: <strong>{fmtAmount(id, req.recommended)}</strong>/{t('nutrient.day')}
            </li>
            {req.physiological !== req.recommended && (
              <li>
                {t('nutrient.absorbedNeed')}: {fmtAmount(id, req.physiological)}/{t('nutrient.day')}
                {req.physiologicalDerived ? ` (${t('nutrient.derived')})` : ''}
              </li>
            )}
            {r.capacity !== undefined && advanced && (
              <li>
                {t('nutrient.capacity')}: {fmtAmount(id, r.capacity)}
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

/** What the nutrient does and what too little / too much means. */
function NutrientInfo({ id }: { id: string }) {
  const key = infoId(id);
  const source = NUTRIENT_INFO_SOURCES[key];
  const text = (part: 'role' | 'low' | 'high') => t(`info.${key}.${part}` as MessageKey);
  if (text('role').startsWith('info.')) return null; // no text for this nutrient
  return (
    <>
      <h2 className="section-title">{t('nutrient.whatItDoes')}</h2>
      <div className="card small nutrient-info">
        <p>{text('role')}</p>
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

/** Rough duration for "about …": days, then weeks, months, years. */
function fmtDuration(days: number): string {
  if (days < 1.5) return t('duration.day');
  if (days < 14) return t('duration.days', { n: Math.round(days) });
  if (days < 60) return t('duration.weeks', { n: Math.round(days / 7) });
  if (days < 730) return t('duration.months', { n: Math.round(days / 30.44) });
  return t('duration.years', { n: fmtNumber(days / 365.25, 1) });
}

/**
 * Whether a store is filling or going down at the recent rate, so a low tank on a good diet
 * doesn't read as "you eat too little" (e.g. after starting empty).
 */
function TankTrendNote({ r, need, startedEmpty }: { r: NutrientResult; need: number; startedEmpty: boolean }) {
  const trend = tankTrend(r);
  const fill = r.store?.central ?? r.value.central;
  if (!trend || r.netPerDay === undefined || fill >= 1) return null;
  const low = fill < statusThresholds.tank.value.gettingLow;
  // "Not because you eat too little" only holds when the diet covers the need (a tank's status is its fill level).
  const dietCovers = r.kind === 'tank' || r.value.central >= 1;
  // Absorbed = need + net change, so the two numbers always explain the direction (vitamin D includes sun).
  const vars = { absorbed: fmtAmount(r.id, Math.max(0, need + r.netPerDay)), need: fmtAmount(r.id, need) };
  const text =
    trend.direction === 'draining'
      ? t(r.level!.central > 0 ? 'nutrient.trendDraining' : 'nutrient.trendEmpty', vars)
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
          {t('nutrient.startedEmpty')}
          {r.kind === 'tank' && (
            <>
              {' '}
              <a href={href('settings', 'start')}>{t('nutrient.changeStart')}</a>
            </>
          )}
        </p>
      )}
    </>
  );
}

function TestHint({ r, name }: { r: NutrientResult; name: string }) {
  const text = testHintText(r, name);
  return text ? <p className="small notice">{text}</p> : null;
}
