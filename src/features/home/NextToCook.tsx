import { useMemo } from 'react';
import { useData } from '../../app/data';
import { setAsk } from '../../app/ask';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { fmtPercent } from '../../lib/format';
import { ingredientsAtHome } from '../../logic/kitchen';
import { nextToCook } from '../../logic/nextToCook';
import { portionIntake } from '../../logic/recipeIdeas';
import { isOn } from '../../settings/features';
import type { Storage } from '../../model/paramTypes';
import type { Batch, Recipe } from '../../storage/types';
import { useHasApiKey } from '../../ui/AskChips';
import { Icon } from '../../ui/Icon';
import { symbolOf } from '../../ui/Tile';
import { usePantry, usePantryLeft } from '../pantry/usePantry';
import { logPortion, nextStorage, totalLeft } from './StockChips';

type Option = { kind: 'recipe'; recipe: Recipe } | { kind: 'batch'; batch: Batch; storage: Storage };

/** At most this many options before "Ask for an idea" stops being offered. */
const ASK_BELOW = 3;

/**
 * "Next to cook" on Home (owner's rule, 2026-10-22, logic/nextToCook.ts): up to three dishes or
 * ready portions whose one portion really lifts a gap and pushes no limit over. Hidden when nothing
 * qualifies and the assistant can't be asked; with two or fewer, "Ask for an idea" opens the
 * assistant with the question typed, never sent.
 */
export function NextToCook() {
  const d = useData();
  const toast = useToast();
  const pantry = usePantry();
  const left = usePantryLeft();
  const aiOn = isOn(d.settings.features, 'aiAssistant');
  const hasKey = useHasApiKey(aiOn);
  const atHomeOn = isOn(d.settings.features, 'atHome');

  const options = useMemo(() => {
    const ctx = { foods: d.foods, products: d.productsById, batches: new Map<string, Batch>(), customFoods: d.customFoodsById, salt: d.profile.salt };
    // A pot with portions left stands in for its recipe: eating it is quicker than cooking again.
    const ready: Option[] = [];
    for (const b of d.batches) {
      const storage = totalLeft(b) > 0 ? nextStorage(b, d.today) : undefined;
      if (storage) ready.push({ kind: 'batch', batch: b, storage });
    }
    const readyRecipes = new Set(ready.map((o) => (o.kind === 'batch' ? o.batch.recipeId : '')));
    const recipes: Option[] = d.recipes.filter((r) => !r.archived && r.ingredients.length > 0 && !readyRecipes.has(r.id)).map((recipe) => ({ kind: 'recipe', recipe }));
    const portion = (o: Option) => (o.kind === 'recipe' ? portionIntake(o.recipe, ctx) : portionIntake(o.batch.recipe, ctx, o.storage));
    return nextToCook([...ready, ...recipes], portion, d.model.nutrients, d.requirements, d.settings.shortWindowDays);
  }, [d.foods, d.productsById, d.customFoodsById, d.profile.salt, d.batches, d.recipes, d.today, d.model, d.requirements, d.settings.shortWindowDays]);

  // The assistant only knows the gaps with Recipe ideas on (it sends the nutrient status then).
  const canAsk = aiOn && isOn(d.settings.features, 'recipeIdeas') && hasKey === true && options.length < ASK_BELOW;
  if (options.length === 0 && !canAsk) return null;

  return (
    <div className="card home-card next-cook">
      <div className="card-head">
        <h2>{t('home.nextToCook')}</h2>
        <span className="card-note">{t('home.nextNote')}</span>
      </div>
      {options.length === 0 && <p className="muted small">{t('home.nextNone')}</p>}
      <ul className="plain-list next-list">
        {options.map(({ item: o, helps }) => {
          const name = o.kind === 'recipe' ? o.recipe.name : o.batch.recipe.name;
          const home = o.kind === 'recipe' && atHomeOn && pantry ? ingredientsAtHome(o.recipe.ingredients, pantry, (i) => left(i).out) : undefined;
          const key = o.kind === 'recipe' ? o.recipe.id : o.batch.id;
          return (
            <li key={key} className="next-item">
              <div className="next-line">
                <span className="next-icon" aria-hidden>
                  <Icon name={o.kind === 'recipe' ? 'pot' : o.storage === 'freezer' ? 'snow' : 'fridge'} size={20} />
                </span>
                <a className="next-name" href={href('recipes', o.kind === 'recipe' ? o.recipe.id : o.batch.recipeId)}>
                  <strong>{name}</strong>
                  <span className="muted small">
                    {o.kind === 'batch'
                      ? t(o.storage === 'freezer' ? 'home.nextFrozen' : 'home.nextReady', { n: totalLeft(o.batch) })
                      : home
                        ? t('home.nextAtHome', { have: home.have, of: home.of })
                        : t('home.nextRecipe')}
                  </span>
                </a>
                {o.kind === 'recipe' ? (
                  <button type="button" className="btn btn-small" onClick={() => navigate('recipes', o.recipe.id)}>
                    {t('home.cookIt')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-small" onClick={() => void logPortion(o.batch, o.storage, toast)}>
                    {t('home.eatOne')}
                  </button>
                )}
              </div>
              <div className="next-chips" aria-label={t('home.nextHelpsLabel')}>
                {helps.slice(0, 4).map((h) => (
                  <a key={h.id} className="next-chip" href={href('nutrient', h.id)} aria-label={t('home.nextChipSpoken', { name: h.name, pct: fmtPercent(h.share) })}>
                    <strong aria-hidden>{symbolOf(h.id)}</strong>
                    <span aria-hidden>
                      +{fmtPercent(h.share).replace(/\s/g, '')}
                      {h.missing ? '+' : ''}
                    </span>
                  </a>
                ))}
              </div>
              {home && home.missing.length > 0 && (
                <a className="muted small next-missing" href={href('shopping')}>
                  {t('home.nextMissing', { names: home.missing.slice(0, 3).join(', ') + (home.missing.length > 3 ? '…' : '') })}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {canAsk && (
        <button
          type="button"
          className="btn btn-ghost btn-small next-ask"
          onClick={() => {
            setAsk(t('home.nextAskText'));
            navigate('assistant');
          }}
        >
          <Icon name="chat" size={16} /> {t('home.nextAsk')}
        </button>
      )}
    </div>
  );
}
