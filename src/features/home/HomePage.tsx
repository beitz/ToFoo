import { useMemo } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { isOn } from '../../settings/features';
import { hasNoData } from '../../ui/Gauge';
import { NUTRIENT_BY_ID, NUTRIENTS } from '../../model/nutrients';
import { rankFoods } from '../../model/ranking';
import { NON_SINGLE_FOOD_GROUPS } from '../../foods/foodDb';
import { diverseTop } from '../../foods/variety';
import type { GaugeStatus, NutrientResult } from '../../model/simulate';
import { Prompts } from './Prompts';
import { SettingsButton } from '../../ui/SettingsButton';
import { AskChips } from '../../ui/AskChips';
import { SleepQuestion } from '../sleep/SleepQuestion';
import { WaterCard } from '../water/WaterCard';
import { withStores } from '../../logic/stores';
import { DayStrip } from './DayStrip';
import { FastCard, FastChip } from './FastCard';
import { MacrosCard } from './MacrosCard';
import { NeedsCard, StatusChips } from './NeedsCard';
import { NextToCook } from './NextToCook';
import { RecentDays } from './RecentDays';
import { StoresCard } from './StoresCard';

/** Energy and the macronutrients, in their own card with amounts; fibre too (owner's ask). */
const MACRO_ROW = ['ENERCC', 'PROT625', 'FAT', 'CHO', 'FIBT'];

/** Nutrients whose need or store scales with body weight. */
const PER_KG = new Set(['PROT625', 'HIS', 'ILE', 'LEU', 'LYS', 'SAA', 'AAA', 'THR', 'TRP', 'VAL']);

/**
 * Home, "everything on one screen" (owner's pick from the design, 2026-10-22): the days behind the
 * averages, stores, what needs attention, energy and macros, what to cook next, then today and
 * yesterday. Every number taps through to its page.
 */
export function HomePage() {
  const d = useData();
  const { model, settings, today } = d;
  const showRange = isOn(settings.features, 'uncertaintyRanges');
  const hidden = new Set(settings.hiddenNutrients);
  const windowDays = settings.shortWindowDays;

  const shown = NUTRIENTS.filter((n) => !hidden.has(n.id))
    .map((n) => model.nutrients.get(n.id))
    .filter((r): r is NutrientResult => !!r);
  const macros = MACRO_ROW.map((id) => shown.find((r) => r.id === id)).filter((r): r is NutrientResult => !!r);
  const stores = withStores(shown);
  const rest = shown.filter((r) => !r.store && !MACRO_ROW.includes(r.id) && r.kind !== 'info');
  const statusOf = (r: NutrientResult): GaugeStatus => (r.store ? r.store.status : hasNoData(r) ? 'unknown' : r.status);
  const statuses = [...stores, ...rest, ...macros].map(statusOf).filter((s) => s !== 'info');

  const gaps = useMemo(() => {
    const excludedGroups = new Set(d.profile.exclusions.groups);
    const excludedFoods = new Set(d.profile.exclusions.foods);
    const candidates = d.foods.foods
      .filter((f) => !NON_SINGLE_FOOD_GROUPS.has(f.group) && !excludedGroups.has(f.group) && !excludedFoods.has(f.code))
      .map((f) => ({ key: f.code, per100: f.per100 }));
    const ranked = rankFoods(candidates, model.nutrients, d.requirements, 80);
    return diverseTop(ranked, 12, (g) => d.foods.byCode.get(g.key) ?? { code: g.key, nameEn: g.key });
  }, [d.foods, d.profile.exclusions, model, d.requirements]);

  const weightDefault = d.requirements.defaultsUsed.includes('weight');
  // An own target per day doesn't use body weight.
  const perKgOnDefault = (id: string) => weightDefault && PER_KG.has(id) && d.requirements.byNutrient.get(id)?.own?.target.per !== 'day';

  return (
    <section className="home">
      <header className="page-head row-between home-head">
        <h1 className="grow">{t('home.lastDays', { n: windowDays })}</h1>
        <FastChip />
        <SettingsButton />
      </header>
      <AskChips questions={[t('ask.howAmIDoing'), t('ask.whatNext')]} />
      <DayStrip days={windowDays} />
      <StatusChips statuses={statuses} />
      <FastCard />

      {isOn(d.settings.features, 'sleep') && <SleepQuestion />}
      <Prompts />

      <StoresCard stores={stores} showRange={showRange} startLevel={d.profile.startingLevel} />
      <NeedsCard results={rest} showRange={showRange} windowDays={windowDays} />
      <MacrosCard results={macros} defaultBased={perKgOnDefault} windowDays={windowDays} />
      {isOn(d.settings.features, 'water') && <WaterCard day={today} compact />}
      <NextToCook />

      {gaps.length > 0 && (
        <div className="card home-card">
          <div className="card-head">
            <h2>{t('home.gaps')}</h2>
          </div>
          <div className="hscroll" role="list">
            {gaps.map((g) => {
              const food = d.foods.byCode.get(g.key)!;
              return (
                <a key={g.key} role="listitem" className="food-card" href={href('food', g.key)}>
                  <strong className="food-card-name">{food.nameEn}</strong>
                  <span className="muted small">{food.nameDe}</span>
                  <span className="food-card-helps small">
                    {g.helps
                      .slice(0, 3)
                      .map((h) => NUTRIENT_BY_ID.get(h.id)?.short ?? h.id)
                      .join(' · ')}
                  </span>
                  <span className="muted small">{t('home.perPortion', { g: Math.round(g.grams) })}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      <RecentDays />
      <p className="muted small disclaimer">{t('home.disclaimer')}</p>
    </section>
  );
}
