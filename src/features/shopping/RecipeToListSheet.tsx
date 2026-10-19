import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { newId } from '../../lib/id';
import { amountText, planAdd, recipeLines, type RecipeLine } from '../../logic/shopping';
import { repo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION, type Recipe } from '../../storage/types';
import { Field, NumberInput, Sheet } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { useShopFoods } from './useShopping';

/**
 * A recipe's ingredients onto the shopping list: pick the recipe (unless it is given), the portions
 * to cook, and untick what is at home already. Amounts scale with the portions.
 */
export function RecipeToListSheet({ recipe: given, onClose }: { recipe?: Recipe; onClose: () => void }) {
  const d = useData();
  const [recipe, setRecipe] = useState(given);
  const recipes = d.recipes.filter((r) => !r.archived && r.ingredients.length > 0).sort((a, b) => a.name.localeCompare(b.name));

  if (!recipe) {
    return (
      <Sheet title={t('shopping.fromRecipeTitle')} onClose={onClose}>
        {recipes.length === 0 && <p className="muted">{t('shopping.noRecipes')}</p>}
        <ul className="result-list">
          {recipes.map((r) => (
            <li key={r.id}>
              <button className="result" onClick={() => setRecipe(r)}>
                <span className="result-name">{r.name}</span>
                <span className="muted small">{t('recipes.portions', { n: r.portions })}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    );
  }
  return <Ingredients recipe={recipe} onClose={onClose} />;
}

function Ingredients({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const toast = useToast();
  const { nameOf, sectionOf } = useShopFoods();
  const [portions, setPortions] = useState<number | undefined>(recipe.portions);
  const [off, setOff] = useState<ReadonlySet<number>>(() => new Set(recipeLines(recipe, recipe.portions, nameOf, sectionOf).flatMap((l, i) => (l.selected ? [] : [i]))));
  const lines: RecipeLine[] = portions && portions > 0 ? recipeLines(recipe, portions, nameOf, sectionOf) : [];
  const chosen = lines.filter((_, i) => !off.has(i));

  async function add() {
    if (!chosen.length) return;
    const now = Date.now();
    const undo = await repo.changeShopping((items) => planAdd(items, chosen.map((l) => l.item), now, newId, CURRENT_SCHEMA_VERSION));
    toast(t('shopping.recipeAdded', { n: chosen.length, name: recipe.name }), () => repo.undoShopping(undo));
    onClose();
  }

  const toggle = (i: number) =>
    setOff((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <Sheet title={t('shopping.recipeTitle', { name: recipe.name })} onClose={onClose}>
      <Field label={t('shopping.portions')} hint={t('shopping.portionsHint', { n: recipe.portions })}>
        {(id) => <NumberInput id={id} value={portions} onChange={(v) => setPortions(v === undefined ? undefined : Math.max(0, Math.round(v)))} min={0} />}
      </Field>
      <p className="muted small">{t('shopping.untickHint')}</p>
      <ul className="plain-list shop-pick">
        {lines.map((l, i) => (
          <li key={i}>
            <button className="shop-row" role="checkbox" aria-checked={!off.has(i)} onClick={() => toggle(i)}>
              <span className={`shop-check${off.has(i) ? '' : ' on'}`} aria-hidden>
                {!off.has(i) && <Icon name="check" size={16} />}
              </span>
              <span className="shop-name">{l.item.name}</span>
              <span className="muted small shop-amount">{amountText(l.item)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!chosen.length} onClick={() => void add()}>
          <Icon name="cart" size={18} /> {t('shopping.addN', { n: chosen.length })}
        </button>
      </div>
    </Sheet>
  );
}
