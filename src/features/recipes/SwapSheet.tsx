import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { setAsk } from '../../app/ask';
import { navigate } from '../../app/router';
import { t } from '../../i18n';
import { fmtGrams, fmtPercent } from '../../lib/format';
import { refKey } from '../../lib/refs';
import { foodIngredient } from '../../logic/ingredients';
import { portionIntake } from '../../logic/recipeIdeas';
import { swapCandidates } from '../../logic/recipePage';
import { comparePortions, headlineMoves, type PortionMove } from '../../logic/swapPreview';
import { isOn } from '../../settings/features';
import type { Food } from '../../foods/foodDb';
import type { Ingredient, Recipe } from '../../storage/types';
import { useHasApiKey } from '../../ui/AskChips';
import { Field, Sheet } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { symbolOf } from '../../ui/Tile';
import { SwapPreview } from './SwapPreview';
import { useSwapGaps } from './useGaps';

/**
 * Swap one ingredient (owner's decision, 2026-10-22): foods from the same BLS group ranked by how
 * much the same amount lifts the gaps, each with what one portion would gain or lose, computed by
 * the app; search or scan any other food; or ask the assistant with an optional goal, typed in
 * and not sent.
 */
export function SwapSheet({ recipe, index, onSwap, onSearch, onClose }: { recipe: Recipe; index: number; onSwap: (ing: Ingredient, was: string) => void; onSearch: () => void; onClose: () => void }) {
  const d = useData();
  const ing = recipe.ingredients[index]!;
  const ctx = useMemo(
    () => ({ foods: d.foods, products: d.productsById, batches: new Map(), customFoods: d.customFoodsById, salt: recipe.saltOverride ?? d.profile.salt }),
    [d.foods, d.productsById, d.customFoodsById, recipe.saltOverride, d.profile.salt],
  );
  const before = useMemo(() => portionIntake(recipe, ctx), [recipe, ctx]);
  const gaps = useSwapGaps(before.intake);
  const [picked, setPicked] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const askOn = isOn(d.settings.features, 'aiAssistant');
  const hasKey = useHasApiKey(askOn);

  /** The BLS food the ingredient is, or that stands in for a product's vitamins and minerals. */
  const current = useMemo<Food | undefined>(() => {
    const code = ing.ref.source === 'BLS' ? ing.ref.code : ing.ref.source === 'custom' ? undefined : d.productsById.get(refKey(ing.ref))?.match?.code;
    return code ? d.foods.byCode.get(code) : undefined;
  }, [ing, d.foods, d.productsById]);
  const name = current?.nameEn ?? ing.name;

  const options = useMemo(() => {
    if (!current) return [];
    const ex = d.profile.exclusions;
    const found = swapCandidates(current, d.foods.foods, gaps, ing.grams / recipe.portions, (f) => !ex.groups.includes(f.group) && !ex.foods.includes(f.code));
    return found.map(({ food }) => {
      const next = foodIngredient(food, d.foods.version, d.profile.salt, ing.grams, ing.preparation);
      const after = portionIntake({ ...recipe, ingredients: recipe.ingredients.map((x, j) => (j === index ? next : x)) }, ctx);
      const move: PortionMove = comparePortions(before, after, d.model.nutrients, d.requirements);
      return { food, next, move };
    });
  }, [current, gaps, recipe, index, ing, ctx, before, d.foods, d.profile, d.model.nutrients, d.requirements]);
  const chosen = options.find((o) => o.food.code === picked);

  function ask() {
    const q = t('swapSheet.askText', { grams: fmtGrams(ing.grams), name, recipe: recipe.name });
    setAsk(goal.trim() ? `${q} ${t('swapSheet.askGoal', { goal: goal.trim() })}` : q);
    navigate('assistant');
  }

  return (
    <Sheet title={t('swapSheet.title', { name })} onClose={onClose}>
      <p className="muted small">{t('swapSheet.lead', { grams: fmtGrams(ing.grams) })}</p>
      {!current ? (
        <p className="muted small">{t('swapSheet.noGroup')}</p>
      ) : gaps.length === 0 ? (
        <p className="muted small">{t('swapSheet.noGaps')}</p>
      ) : options.length === 0 ? (
        <p className="muted small">{t('swapSheet.none')}</p>
      ) : (
        <ul className="plain-list swap-options" aria-label={t('swapSheet.optionsLabel')}>
          {options.map((o) => {
            const top = headlineMoves(o.move, 3);
            return (
              <li key={o.food.code}>
                <button
                  type="button"
                  className={`swap-option${o.food.code === picked ? ' on' : ''}`}
                  aria-pressed={o.food.code === picked}
                  onClick={() => setPicked(o.food.code === picked ? null : o.food.code)}
                >
                  <span className="swap-option-name">{o.food.nameEn}</span>
                  <span className="swap-option-moves">
                    {top.map((m) => (
                      <span
                        key={m.id}
                        className={`swap-move-chip ${m.after > m.before ? 'up' : 'down'}`}
                        aria-label={t('swapSheet.moveSpoken', { name: m.name, before: fmtPercent(m.before), after: fmtPercent(m.after) })}
                      >
                        <strong aria-hidden>{symbolOf(m.id)}</strong>
                        <span aria-hidden>
                          {m.after > m.before ? '↑' : '↓'} {Math.round(m.before * 100)}→{Math.round(m.after * 100)}%
                        </span>
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {chosen && (
        <>
          <SwapPreview title={t('swap.swapped', { was: name, now: chosen.food.nameEn })} move={chosen.move} />
          <button type="button" className="btn btn-primary btn-block" onClick={() => onSwap(chosen.next, name)}>
            {t('swapSheet.use', { name: chosen.food.nameEn })}
          </button>
        </>
      )}
      <button type="button" className="btn btn-secondary btn-block" onClick={onSearch}>
        <Icon name="search" /> {t('swapSheet.search')}
      </button>
      {askOn && hasKey && (
        <div className="swap-ask">
          <Field label={t('swapSheet.goalLabel')}>{(id) => <input id={id} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t('swapSheet.goalPlaceholder')} />}</Field>
          <button type="button" className="btn btn-ghost btn-block" onClick={ask}>
            <Icon name="chat" /> {t('swapSheet.ask')}
          </button>
          <p className="muted small">{t('swapSheet.askNote')}</p>
        </div>
      )}
    </Sheet>
  );
}
