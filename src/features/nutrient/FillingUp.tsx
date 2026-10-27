import { useMemo } from 'react';
import { useData, type AppData } from '../../app/data';
import { href } from '../../app/router';
import { NON_SINGLE_FOOD_GROUPS, type Food } from '../../foods/foodDb';
import { t } from '../../i18n';
import { fmtAmount, fmtGrams, fmtNumber } from '../../lib/format';
import { coverExamples } from '../../logic/howOften';
import { timesEaten } from '../../logic/nutrientPage';
import { daysToFine, omega3Rows, portionAbsorbed } from '../../logic/fillingUp';
import { partFromFood } from '../../logic/resolve';
import { portionGrams } from '../../model/ranking';
import { typicalFractionFor, type NutrientResult } from '../../model/simulate';
import { isOn } from '../../settings/features';
import { fmtDuration } from '../../ui/duration';
import { InfoButton } from '../../ui/InfoButton';
import { omega3Index, omega3IndexLevels } from '../../../model/nutrientFacts';
import { statusThresholds } from '../../../model/parameters';
import { contributorHref } from './CameFromCard';

/** Rows of the store card: portions a week of the example food. A choice of examples, not physiology. */
const PER_WEEK = [1, 3, 7];
/** The nutrient the omega-3 dose study is about. */
const OMEGA3 = 'EPADHA';

/**
 * "Filling up" (owner's question, 2026-10-27: how fast could I get my omega-3 back to a normal level?).
 * Shown only when it helps: a store below fine, or omega-3 below the need. A store says how long it
 * takes at the recent rate and with a few portions a week of one food; omega-3 shows what each daily
 * amount reached in a dose study, in portions of a food the user eats.
 */
export function FillingUp({ r, noData }: { r: NutrientResult; noData: boolean }) {
  if (noData) return null;
  if (r.store) return <StoreFilling r={r} />;
  if (r.id === OMEGA3 && r.kind === 'rolling' && r.value.central < 1) return <Omega3Filling r={r} />;
  return null;
}

function StoreFilling({ r }: { r: NutrientResult }) {
  const d = useData();
  const store = r.store!;
  const now = daysToFine(store);
  const example = useMemo(() => (now === undefined ? undefined : storeExample(d, r.id, store)), [d, r.id, store, now]);
  if (now === undefined) return null;
  return (
    <div className="card filling" data-tour="nutrient.filling">
      <div className="card-head">
        <h2>{t('fill.title')}</h2>
        <InfoButton title={t('fill.title')}>
          <p>{t('fill.storeInfo', { pct: fmtNumber(statusThresholds.tank.value.gettingLow * 100) })}</p>
          {r.id === 'FE' && <p>{t('fill.ironInfo')}</p>}
        </InfoButton>
      </div>
      <p className="small muted">{t('fill.storeLead')}</p>
      <ul className="plain-list fill-list">
        <li className="fill-line">
          <span className="grow">{t('fill.now')}</span>
          <strong>{when(now)}</strong>
        </li>
        {example &&
          PER_WEEK.map((n) => (
            <li key={n} className="fill-line">
              <span className="grow">{n === 7 ? t('fill.everyDay') : t('fill.withWeek', { n })}</span>
              <strong>{when(daysToFine(store, (example.absorbed * n) / 7))}</strong>
            </li>
          ))}
      </ul>
      {example && (
        <p className="small muted">
          {t('fill.portionOf')}{' '}
          <a href={href('food', example.food.code)}>
            {example.food.nameEn}, {fmtGrams(example.grams)}
          </a>
        </p>
      )}
    </div>
  );
}

function when(days: number | null | undefined): string {
  if (days === undefined) return t('fill.fine');
  if (days === null) return t('fill.notFilling');
  return `~${fmtDuration(days)}`;
}

/**
 * The food for the store rows: of the BLS foods eaten before, the one whose portion gives the most, if
 * two a week of it would fill the store; else the one that gives the most of all single foods the user
 * doesn't exclude.
 */
function storeExample(d: AppData, id: string, store: NonNullable<NutrientResult['store']>): { food: Food; grams: number; absorbed: number } | undefined {
  const retention = isOn(d.settings.features, 'retention');
  const absorption = isOn(d.settings.features, 'absorption');
  const typicalFraction = typicalFractionFor(d.requirements);
  const excluded = new Set(d.profile.exclusions.groups);
  const usable = (f: Food) => !NON_SINGLE_FOOD_GROUPS.has(f.group) && !excluded.has(f.group) && !d.profile.exclusions.foods.includes(f.code) && typeof f.per100[id] === 'number';
  const intakeOf = (f: Food) => ((f.per100[id] as number) * portionGrams(f.per100)) / 100;
  const eaten = new Set(d.log.flatMap((e) => (e.kind === 'food' && e.ref.source === 'BLS' ? [e.ref.code] : [])));
  const best = (foods: Food[]) => foods.filter(usable).sort((a, b) => intakeOf(b) - intakeOf(a))[0];
  const option = (food: Food | undefined) => {
    if (!food || !(intakeOf(food) > 0)) return undefined;
    const grams = portionGrams(food.per100);
    const absorbed = portionAbsorbed(partFromFood(food, grams, 'asListed', 'fresh'), id, { retention, absorption, typicalFraction });
    return absorbed > 0 ? { food, grams, absorbed } : undefined;
  };
  const known = option(best(d.foods.foods.filter((f) => eaten.has(f.code))));
  if (known && daysToFine(store, (known.absorbed * 3) / 7) !== null) return known;
  return option(best(d.foods.foods)) ?? known;
}

function Omega3Filling({ r }: { r: NutrientResult }) {
  const d = useData();
  const example = useMemo(() => omega3Example(d, r), [d, r]);
  const rows = omega3Rows(example?.perPortion);
  const good = omega3IndexLevels.value.good;
  const top = Math.max(good, ...rows.map((x) => x.index)) * 1.05;
  const pct = (v: number) => `${(v / top) * 100}%`;
  return (
    <div className="card filling" data-tour="nutrient.filling">
      <div className="card-head">
        <h2>{t('fill.title')}</h2>
        <InfoButton title={t('fill.title')}>
          <p>{t('fill.o3Info', { start: fmtNumber(omega3Index.value.start, 1), months: omega3Index.value.months, good, poor: omega3IndexLevels.value.poor })}</p>
          <p>{t('fill.o3Own')}</p>
          <p className="muted small">
            <a href={omega3Index.url} target="_blank" rel="noreferrer">
              {shortSource(omega3Index.source)}
            </a>{' '}
            ·{' '}
            <a href={omega3IndexLevels.url} target="_blank" rel="noreferrer">
              {shortSource(omega3IndexLevels.source)}
            </a>
          </p>
        </InfoButton>
      </div>
      <p className="small">{t('fill.o3Lead', { months: omega3Index.value.months, start: fmtNumber(omega3Index.value.start, 1), good })}</p>
      <ul className="plain-list fill-doses">
        {rows.map((x) => (
          <li key={x.dose} className="fill-dose">
            <span className="fill-dose-amount">{t('fill.perDay', { amount: fmtAmount(r.id, x.dose) })}</span>
            <span className="fill-bar" aria-hidden>
              <span className={`fill-bar-value${x.index >= good ? ' is-good' : ''}`} style={{ width: pct(x.index) }} />
              <span className="fill-bar-line" style={{ left: pct(good) }} />
            </span>
            <strong className="fill-dose-index">{fmtNumber(x.index, 1)}%</strong>
            {x.perWeek !== undefined && <span className="fill-dose-week muted small">{perWeekText(x.perWeek)}</span>}
          </li>
        ))}
      </ul>
      <p className="small muted">
        {t('fill.you', { amount: fmtAmount(r.id, r.averageIntake), days: r.windowDays })}
        {example && (
          <>
            {' · '}
            {t('fill.portionOf')}{' '}
            {example.href ? <a href={example.href}>{example.label}</a> : example.label}, {fmtAmount(r.id, example.perPortion)}
          </>
        )}
      </p>
    </div>
  );
}

/** "Flock MR et al. (2013): Determinants of …" → "Flock MR et al. (2013)". */
function shortSource(s: string): string {
  return s.split(': ')[0] ?? s;
}

function perWeekText(n: number): string {
  // Less than about one a week reads better as "1 every 2 weeks".
  if (n < 0.75) return t('fill.everyWeeks', { n: Math.max(2, Math.round(1 / n)) });
  return t('fill.timesWeek', { n: fmtNumber(n, n < 10 ? 1 : 0) });
}

/**
 * The food for the omega-3 rows: what gave the most in the window, as eaten each time (the study's
 * amounts are eaten, not taken up); else the guideline's first example fish, 100 g.
 */
function omega3Example(d: AppData, r: NutrientResult): { label: string; href?: string; perPortion: number } | undefined {
  const typical = typicalFractionFor(d.requirements)(r.id);
  const windowDays = new Set(d.modelDays.slice(Math.max(0, d.modelDays.length - 1 - r.windowDays), -1));
  const times = timesEaten(d.log, windowDays);
  const top = r.contributors[0];
  const n = top ? (times.get(top.label) ?? 0) : 0;
  if (top && n > 0 && typical > 0) {
    const perPortion = (top.amount * r.windowDays) / n / typical;
    if (perPortion > 0) return { label: top.label, href: contributorHref(d, top.label), perPortion };
  }
  const recommended = d.requirements.byNutrient.get(r.id)?.recommended ?? 0;
  const fish = coverExamples(r.id, d.foods.byCode, recommended)[0];
  if (!fish) return undefined;
  return { label: t('fill.hundredOf', { name: fish.food.nameEn }), href: href('food', fish.food.code), perPortion: fish.days * recommended };
}
