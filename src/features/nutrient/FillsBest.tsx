import { useMemo } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { fmtAmount, fmtPercent } from '../../lib/format';
import { newId } from '../../lib/id';
import { portionIntake } from '../../logic/recipeIdeas';
import { planAdd, sectionOfCode } from '../../logic/shopping';
import { portionGrams } from '../../model/ranking';
import type { Storage } from '../../model/paramTypes';
import { NON_SINGLE_FOOD_GROUPS, type Food } from '../../foods/foodDb';
import { diverseTop } from '../../foods/variety';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION, type Batch, type Recipe } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { InfoButton } from '../../ui/InfoButton';
import { usePantry, usePantryLeft, leftLabel, placeName } from '../pantry/usePantry';
import { logPortion, nextStorage, totalLeft } from '../home/StockChips';

type Option =
  | {
      kind: 'batch';
      batch: Batch;
      storage: Storage;
      share: number;
      amount: number;
    }
  | { kind: 'recipe'; recipe: Recipe; share: number; amount: number }
  | {
      kind: 'home';
      food: Food;
      grams: number;
      where: string;
      share: number;
      amount: number;
    }
  | { kind: 'food'; food: Food; grams: number; share: number; amount: number };

/** At most this many lines: what is at home or in the recipe book first, then foods to buy. */
const MAX_LINES = 4;
const MAX_AT_HOME = 2;
/** A portion that gives less than this share of a day's need is not worth a line. */
const MIN_SHARE = 0.05;

/**
 * "Fills it best" (design 2026-10-22): one portion of what is ready, cookable or at home, then the
 * foods that give the most per portion, each with the step that gets it eaten (Eat, Cook, Log,
 * + Basket). The share is of a day's recommended intake, as on Home's "Next to cook".
 */
export function FillsBest({ id, recommended }: { id: string; recommended: number }) {
  const d = useData();
  const toast = useToast();
  const pantry = usePantry();
  const left = usePantryLeft();
  const shoppingOn = isOn(d.settings.features, 'shoppingList');

  const options = useMemo(() => {
    const ctx = {
      foods: d.foods,
      products: d.productsById,
      batches: new Map<string, Batch>(),
      customFoods: d.customFoodsById,
      salt: d.profile.salt,
    };
    const share = (amount: number) => amount / recommended;
    const ready: Option[] = [];
    for (const batch of d.batches) {
      const storage = totalLeft(batch) > 0 ? nextStorage(batch, d.today) : undefined;
      if (!storage) continue;
      const amount = portionIntake(batch.recipe, ctx, storage).intake[id] ?? 0;
      ready.push({
        kind: 'batch',
        batch,
        storage,
        amount,
        share: share(amount),
      });
    }
    const readyRecipes = new Set(ready.map((o) => (o.kind === 'batch' ? o.batch.recipeId : '')));
    const recipes: Option[] = d.recipes
      .filter((r) => !r.archived && r.ingredients.length > 0 && !readyRecipes.has(r.id))
      .map((recipe) => {
        const amount = portionIntake(recipe, ctx).intake[id] ?? 0;
        return { kind: 'recipe', recipe, amount, share: share(amount) };
      });
    const atHome: Option[] = [];
    const homeCodes = new Set<string>();
    for (const item of pantry ?? []) {
      const l = left(item);
      if (l.out || item.ref?.source !== 'BLS') continue;
      const food = d.foods.byCode.get(item.ref.code);
      const v = food?.per100[id];
      if (!food || typeof v !== 'number') continue;
      homeCodes.add(food.code);
      const grams = portionGrams(food.per100);
      atHome.push({
        kind: 'home',
        food,
        grams,
        where: `${placeName(item.place)} · ${leftLabel(item, l)}`,
        amount: (v * grams) / 100,
        share: share((v * grams) / 100),
      });
    }
    const mine = [...ready, ...recipes, ...atHome]
      .filter((o) => o.share >= MIN_SHARE)
      .sort((a, b) => b.share - a.share)
      .slice(0, MAX_AT_HOME);

    const excluded = new Set(d.profile.exclusions.groups);
    const foods = d.foods.foods
      .filter((f) => !NON_SINGLE_FOOD_GROUPS.has(f.group) && !excluded.has(f.group) && !d.profile.exclusions.foods.includes(f.code) && !homeCodes.has(f.code) && typeof f.per100[id] === 'number')
      .map((food): Option & { kind: 'food' } => {
        const grams = portionGrams(food.per100);
        const amount = ((food.per100[id] as number) * grams) / 100;
        return { kind: 'food', food, grams, amount, share: share(amount) };
      })
      .sort((a, b) => b.amount - a.amount);
    // Foods already in the log come first: a known food is likelier to be eaten than the top of a
    // 7,000-food table (which starts with offal and blood for iron).
    const eaten = new Set(d.log.flatMap((e) => (e.kind === 'food' && e.ref.source === 'BLS' ? [e.ref.code] : [])));
    const known = diverseTop(
      foods.filter((o) => eaten.has(o.food.code) && o.share >= MIN_SHARE),
      MAX_LINES - mine.length,
      (o) => o.food,
    );
    const others = diverseTop(
      foods.filter((o) => !eaten.has(o.food.code)),
      MAX_LINES - mine.length - known.length,
      (o) => o.food,
    );
    return [...mine, ...known, ...others];
  }, [d.foods, d.productsById, d.customFoodsById, d.profile.salt, d.profile.exclusions, d.batches, d.recipes, d.log, d.today, pantry, left, id, recommended]);

  const eatenBefore = useMemo(() => new Set(d.log.flatMap((e) => (e.kind === 'food' && e.ref.source === 'BLS' ? [e.ref.code] : []))), [d.log]);

  async function toBasket(food: Food) {
    const u = await repo.changeShopping((items) =>
      planAdd(
        items,
        [
          {
            name: food.nameEn,
            ref: { source: 'BLS', version: d.foods.version, code: food.code },
            section: sectionOfCode(food.code),
          },
        ],
        Date.now(),
        newId,
        CURRENT_SCHEMA_VERSION,
      ),
    );
    toast(t('fills.added', { name: food.nameEn }), () => void repo.undoShopping(u));
  }

  if (options.length === 0) return null;
  return (
    <div className="card fills">
      <div className="card-head">
        <h2>{t('fills.title')}</h2>
        <InfoButton title={t('fills.title')}>
          <p>{t('fills.info')}</p>
        </InfoButton>
      </div>
      <ul className="plain-list fills-list">
        {options.map((o) => {
          const name = o.kind === 'batch' ? o.batch.recipe.name : o.kind === 'recipe' ? o.recipe.name : `${o.food.nameEn}, ${Math.round(o.grams)} g`;
          const link = o.kind === 'batch' ? href('recipes', o.batch.recipeId) : o.kind === 'recipe' ? href('recipes', o.recipe.id) : href('food', o.food.code);
          const sub =
            o.kind === 'batch'
              ? t(o.storage === 'freezer' ? 'home.nextFrozen' : 'home.nextReady', { n: totalLeft(o.batch) })
              : o.kind === 'recipe'
                ? t('fills.recipe')
                : o.kind === 'home'
                  ? o.where
                  : eatenBefore.has(o.food.code)
                    ? t('fills.eatenBefore')
                    : '';
          // Small icons instead of "had before · not at home": only what is true is shown.
          const icon = o.kind === 'home' ? 'pantry' : o.kind === 'food' && eatenBefore.has(o.food.code) ? 'history' : o.kind === 'batch' ? (o.storage === 'freezer' ? 'snow' : 'fridge') : undefined;
          const key = o.kind === 'batch' ? o.batch.id : o.kind === 'recipe' ? o.recipe.id : `${o.kind}:${o.food.code}`;
          return (
            <li key={key} className="fills-line">
              <a className="fills-name" href={link}>
                <span>{name}</span>
                {sub && (
                  <span className="muted small fills-sub">
                    {icon && <Icon name={icon} size={14} />} {sub}
                  </span>
                )}
              </a>
              <span
                className="fills-share"
                aria-label={t('fills.shareSpoken', {
                  pct: fmtPercent(o.share),
                  amount: fmtAmount(id, o.amount),
                })}
              >
                +{fmtPercent(o.share).replace(/\s/g, '')}
              </span>
              {o.kind === 'batch' ? (
                <button type="button" className="btn btn-small" onClick={() => void logPortion(o.batch, o.storage, toast)}>
                  {t('home.eatOne')}
                </button>
              ) : o.kind === 'recipe' ? (
                <button type="button" className="btn btn-small" onClick={() => navigate('cook', o.recipe.id)}>
                  {t('home.cookIt')}
                </button>
              ) : o.kind === 'home' || !shoppingOn ? (
                <a className="btn btn-small" href={href('food', o.food.code)}>
                  {t('fills.look')}
                </a>
              ) : (
                <button type="button" className="btn btn-small" onClick={() => void toBasket(o.food)}>
                  <Icon name="plus" size={16} /> {t('fills.basket')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <a className="small fills-all" href={href('nutrient', id, 'foods')}>
        {t('nutrient.allFoods')}
      </a>
    </div>
  );
}
