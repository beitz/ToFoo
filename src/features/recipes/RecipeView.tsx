import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { formatDay } from '../../lib/dates';
import { fmtGrams } from '../../lib/format';
import { resolvePlan } from '../../storage/defaults';
import { repo } from '../../storage/repo';
import type { Recipe, StoragePlan } from '../../storage/types';
import { Field, Sheet, Toggle } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { prepLabel } from '../log/PreparationSelect';
import { PlanEditor } from './PlanEditor';
import { PortionNutrients } from './PortionNutrients';

export function RecipeView({ id }: { id: string }) {
  const d = useData();
  const toast = useToast();
  const recipe = d.recipes.find((r) => r.id === id);
  const [cooking, setCooking] = useState(false);
  if (!recipe) {
    return (
      <section>
        <p>{t('recipes.notFound')}</p>
        <a href={href('recipes')}>{t('common.back')}</a>
      </section>
    );
  }
  const batches = d.batches.filter((b) => b.recipeId === id).sort((a, b) => b.cookedAt - a.cookedAt);

  async function remove() {
    const old = await repo.deleteRecipe(recipe!.id);
    navigate('recipes');
    if (old) toast(t('recipes.deleted', { name: old.name }), () => void repo.restoreRecipe(old));
  }

  return (
    <section>
      <header className="page-head row-between">
        <a className="icon-btn" href={href('recipes')} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1 className="grow">{recipe.name}</h1>
        <a className="icon-btn" href={href('recipes', recipe.id, 'edit')} aria-label={t('recipes.edit')}>
          <Icon name="edit" />
        </a>
      </header>
      <p className="muted">
        {t('recipes.portions', { n: recipe.portions })}
        {recipe.tags.length ? ` · ${recipe.tags.join(', ')}` : ''}
      </p>
      <button className="btn btn-primary btn-block" onClick={() => setCooking(true)}>
        <Icon name="pot" /> {t('recipes.cook')}
      </button>

      <h2 className="section-title">{t('recipes.ingredientsTitle')}</h2>
      <ul className="plain-list">
        {recipe.ingredients.map((ing, i) => {
          const food = ing.ref.source === 'BLS' ? d.foods.byCode.get(ing.ref.code) : undefined;
          return (
            <li key={i} className="row-between ingredient-line">
              <span>
                {ing.isSalt ? t('recipes.salt') : (food?.nameEn ?? ing.name)}
                {ing.preparation !== 'asListed' && <span className="muted small"> · {prepLabel(ing.preparation)}</span>}
              </span>
              <span className="muted">{fmtGrams(ing.grams)}</span>
            </li>
          );
        })}
      </ul>
      <a className="btn btn-small btn-ghost" href={href('recipes', recipe.id, 'edit')}>
        <Icon name="edit" size={16} /> {t('recipes.changeIngredients')}
      </a>
      {recipe.instructions && (
        <>
          <h2 className="section-title">{t('recipes.instructions')}</h2>
          <p className="recipe-steps">{recipe.instructions}</p>
        </>
      )}
      {recipe.notes && <p className="notes">{recipe.notes}</p>}

      <h2 className="section-title">{t('recipes.perPortion')}</h2>
      <PortionNutrients recipe={recipe} />

      {batches.length > 0 && (
        <>
          <h2 className="section-title">{t('recipes.batches')}</h2>
          <ul className="plain-list">
            {batches.map((b) => (
              <li key={b.id} className="row-between">
                <span>{formatDay(b.cookedDay, d.today)}</span>
                <span className="muted small">
                  {t('recipes.batchLeft', { n: b.remaining.fresh + b.remaining.fridge + b.remaining.freezer, of: b.recipe.portions })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <button className="btn btn-danger-ghost" onClick={() => void remove()}>
        {t('recipes.delete')}
      </button>
      {cooking && <CookSheet recipe={recipe} onClose={() => setCooking(false)} />}
    </section>
  );
}

function CookSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const [plan, setPlan] = useState<StoragePlan>(recipe.defaultPlan ?? d.settings.defaultPlan);
  const [day, setDay] = useState(d.today);
  const [remember, setRemember] = useState(false);
  async function cook() {
    const resolved = resolvePlan(plan, recipe.portions);
    const batch = await repo.cookBatch(recipe, resolved, day, remember ? plan : undefined);
    toast(t('recipes.cooked', { n: recipe.portions }), () => void repo.deleteBatch(batch.id));
    onClose();
    navigate('recipes');
  }
  return (
    <Sheet title={t('recipes.cookTitle', { name: recipe.name })} onClose={onClose}>
      <Field label={t('recipes.cookDay')}>{(id) => <input id={id} type="date" value={day} max={d.today} onChange={(e) => e.target.value && setDay(e.target.value)} />}</Field>
      <PlanEditor plan={plan} portions={recipe.portions} onChange={setPlan} />
      <Toggle checked={remember} onChange={setRemember} label={t('recipes.rememberPlan')} />
      <div className="sheet-actions">
        <button className="btn btn-primary" onClick={() => void cook()}>
          {t('recipes.cookConfirm')}
        </button>
      </div>
    </Sheet>
  );
}
