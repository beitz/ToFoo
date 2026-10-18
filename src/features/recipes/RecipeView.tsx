import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { formatDay } from '../../lib/dates';
import { fmtGrams } from '../../lib/format';
import { resolvePlan } from '../../storage/defaults';
import { repo } from '../../storage/repo';
import type { Batch, Ingredient, Recipe, StoragePlan } from '../../storage/types';
import { cookedWeight, sameIngredients } from '../../logic/batch';
import { BatchSheet, initialPot } from './BatchSheet';
import { IngredientChanges } from './IngredientChanges';
import { PotWeight, type PotScale } from './PotWeight';
import { Field, Sheet, Toggle } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { prepLabel } from '../log/PreparationSelect';
import { PlanEditor } from './PlanEditor';
import { PortionNutrients } from './PortionNutrients';
import { SourceTag } from './SourceTag';
import { refKey } from '../../lib/refs';

export function RecipeView({ id }: { id: string }) {
  const d = useData();
  const toast = useToast();
  const recipe = d.recipes.find((r) => r.id === id);
  const [cooking, setCooking] = useState(false);
  const [openBatch, setOpenBatch] = useState<Batch | null>(null);
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
                {!ing.isSalt && (
                  <>
                    {' '}
                    <SourceTag source={ing.ref.source} product={d.productsById.get(refKey(ing.ref))} />
                  </>
                )}
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
          <ul className="result-list">
            {batches.map((b) => (
              <li key={b.id}>
                <button className="result" onClick={() => setOpenBatch(b)}>
                  <span className="result-name row-between">
                    <span>{formatDay(b.cookedDay, d.today)}</span>
                    <span className="muted small">{t('recipes.batchLeft', { n: b.remaining.fresh + b.remaining.fridge + b.remaining.freezer, of: b.recipe.portions })}</span>
                  </span>
                  <span className="muted small">{batchLine(b)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button className="btn btn-danger-ghost" onClick={() => void remove()}>
        {t('recipes.delete')}
      </button>
      {cooking && <CookSheet recipe={recipe} onClose={() => setCooking(false)} />}
      {openBatch && <BatchSheet batch={d.batchesById.get(openBatch.id) ?? openBatch} onClose={() => setOpenBatch(null)} />}
    </section>
  );
}

/** A batch's weight and whether its pot differed from the recipe, in a few words. */
function batchLine(b: Batch): string {
  const parts = [b.cookedGrams ? t('batch.weighed', { grams: fmtGrams(b.cookedGrams) }) : t('batch.notWeighed')];
  if (b.recipeIngredients && !sameIngredients(b.recipeIngredients, b.recipe.ingredients)) parts.push(t('batch.potChanged'));
  return parts.join(' · ');
}

function CookSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const [plan, setPlan] = useState<StoragePlan>(recipe.defaultPlan ?? d.settings.defaultPlan);
  const [day, setDay] = useState(d.today);
  const [remember, setRemember] = useState(false);
  const [pot, setPot] = useState<PotScale>(() => initialPot(undefined, recipe.potGrams ?? d.settings.potGrams));
  const [ingredients, setIngredients] = useState<Ingredient[]>(recipe.ingredients);
  const [changing, setChanging] = useState(false);
  const cooked = cookedWeight(pot.full, pot.empty);
  const valid = ingredients.length > 0 && ingredients.every((i) => i.grams > 0) && (!pot.full || cooked !== undefined);
  async function cook() {
    if (!valid) return;
    const resolved = resolvePlan(plan, recipe.portions);
    const batch = await repo.cookBatch(recipe, resolved, day, remember ? plan : undefined, { ingredients, ...(cooked ? { cookedGrams: cooked, emptyPotGrams: pot.empty } : {}) });
    toast(t('recipes.cooked', { n: recipe.portions }), () => void repo.deleteBatch(batch.id));
    onClose();
    navigate('recipes');
  }
  return (
    <Sheet title={t('recipes.cookTitle', { name: recipe.name })} onClose={onClose}>
      <Field label={t('recipes.cookDay')}>{(id) => <input id={id} type="date" value={day} max={d.today} onChange={(e) => e.target.value && setDay(e.target.value)} />}</Field>
      <PlanEditor plan={plan} portions={recipe.portions} onChange={setPlan} />
      <Toggle checked={remember} onChange={setRemember} label={t('recipes.rememberPlan')} />
      <h3 className="section-title">{t('batch.weighTitleOptional')}</h3>
      <PotWeight value={pot} portions={recipe.portions} onChange={setPot} />
      {changing ? (
        <>
          <h3 className="section-title">{t('batch.potIngredients')}</h3>
          <p className="muted small">{t('batch.cookChangesHint')}</p>
          <IngredientChanges original={recipe.ingredients} value={ingredients} scale={1} gramsLabel={t('batch.gramsInPot')} onChange={setIngredients} />
        </>
      ) : (
        <button className="btn btn-secondary btn-block" onClick={() => setChanging(true)}>
          <Icon name="edit" size={16} /> {t('batch.changeForPot')}
        </button>
      )}
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!valid} onClick={() => void cook()}>
          {t('recipes.cookConfirm')}
        </button>
      </div>
    </Sheet>
  );
}
