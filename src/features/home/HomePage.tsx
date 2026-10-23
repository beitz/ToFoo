import { useMemo } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { isOn } from '../../settings/features';
import { NUTRIENT_BY_ID, NUTRIENTS } from '../../model/nutrients';
import { rankFoods } from '../../model/ranking';
import { NON_SINGLE_FOOD_GROUPS } from '../../foods/foodDb';
import { diverseTop } from '../../foods/variety';
import type { NutrientResult } from '../../model/simulate';
import { Prompts } from './Prompts';
import { SettingsButton } from '../../ui/SettingsButton';
import { AskChips } from '../../ui/AskChips';
import { SleepQuestion } from '../sleep/SleepQuestion';
import { WaterCard } from '../water/WaterCard';
import { withStores } from '../../logic/stores';
import { DayStrip } from './DayStrip';
import { CatchUpLine } from '../catchup/CatchUpLine';
import { InstallHint } from './InstallHint';
import { AppVersion, UpdateLine } from './AppVersion';
import { FastCard, FastChip } from './FastCard';
import { NextToCook } from './NextToCook';
import { RecentDays } from './RecentDays';
import { HomeCards } from './HomeCards';
import { formatDate, parseDay } from '../../lib/dates';

/** Energy and the macronutrients: today's rings at the top, not in the 7-day list; fibre too (owner's ask). */
const MACRO_ROW = ['ENERCC', 'PROT625', 'FAT', 'CHO', 'FIBT'];

/** Nutrients whose need or store scales with body weight. */
const PER_KG = new Set(['PROT625', 'HIS', 'ILE', 'LEU', 'LYS', 'SAA', 'AAA', 'THR', 'TRP', 'VAL']);

/**
 * Home, "everything on one screen" (owner's pick from the design, 2026-10-22; refined the same day):
 * the days behind the averages, today's energy and macros as rings, one "Last N days" card with the
 * stores and every nutrient, what to cook next, today and yesterday, and the question chips last.
 * Every number taps through to its page.
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
  const stores = withStores(shown);
  const rest = shown.filter((r) => !r.store && !MACRO_ROW.includes(r.id) && r.kind !== 'info');

  const gaps = useMemo(() => {
    const excludedGroups = new Set(d.profile.exclusions.groups);
    const excludedFoods = new Set(d.profile.exclusions.foods);
    const candidates = d.foods.foods.filter((f) => !NON_SINGLE_FOOD_GROUPS.has(f.group) && !excludedGroups.has(f.group) && !excludedFoods.has(f.code)).map((f) => ({ key: f.code, per100: f.per100 }));
    const ranked = rankFoods(candidates, model.nutrients, d.requirements, 80);
    return diverseTop(ranked, 12, (g) => d.foods.byCode.get(g.key) ?? { code: g.key, nameEn: g.key });
  }, [d.foods, d.profile.exclusions, model, d.requirements]);

  const weightDefault = d.requirements.defaultsUsed.includes('weight');
  // An own target per day doesn't use body weight.
  const perKgOnDefault = (id: string) => weightDefault && PER_KG.has(id) && d.requirements.byNutrient.get(id)?.own?.target.per !== 'day';

  return (
    <section className="home">
      <header className="page-head row-between home-head">
        <div className="grow home-title">
          <AppVersion />
          <h1>{`${parseDay(today).toLocaleDateString('en-GB', { weekday: 'long' })} ${formatDate(today, false)}`}</h1>
        </div>
        <FastChip />
        <SettingsButton />
      </header>
      <UpdateLine />
      <InstallHint />
      <DayStrip days={windowDays} />
      <CatchUpLine />
      <FastCard />

      {isOn(d.settings.features, 'sleep') && <SleepQuestion />}
      <Prompts />

      <HomeCards rest={rest} stores={stores} windowDays={windowDays} startLevel={d.profile.startingLevel} showRange={showRange} defaultBased={perKgOnDefault} />
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
      <AskChips className="ask-chips-wrap" tour="home.chips" questions={[t('ask.howAmIDoing'), t('ask.whatNext')]} />
    </section>
  );
}
