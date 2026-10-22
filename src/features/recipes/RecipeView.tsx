import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { formatDay } from '../../lib/dates';
import { fmtGrams } from '../../lib/format';
import { repo } from '../../storage/repo';
import type { Batch, Ingredient } from '../../storage/types';
import { sameIngredients } from '../../logic/batch';
import { BatchSheet } from './BatchSheet';
import { Icon } from '../../ui/Icon';
import { PortionNutrients } from './PortionNutrients';
import { PortionGives } from './PortionGives';
import { WhoGivesWhat } from './WhoGivesWhat';
import { SwapSheet } from './SwapSheet';
import { IngredientSheet, draftOf, type SavedIngredient } from './IngredientSheet';
import { IngredientSwapLine } from './SwapPreview';
import { itemIngredient } from '../../logic/ingredients';
import { ingredientsAtHome } from '../../logic/kitchen';
import { usePantry, usePantryLeft } from '../pantry/usePantry';
import { AskChips } from '../../ui/AskChips';
import { refHref } from '../food/links';
import { refKey } from '../../lib/refs';
import { isOn } from '../../settings/features';
import { RecipeToListSheet } from '../shopping/RecipeToListSheet';
import { BackButton } from '../../ui/BackButton';

export function RecipeView({ id }: { id: string }) {
  const d = useData();
  const toast = useToast();
  const recipe = d.recipes.find((r) => r.id === id);
  const [openBatch, setOpenBatch] = useState<Batch | null>(null);
  const [toList, setToList] = useState(false);
  const [sheet, setSheet] = useState<{ index: number; mode: 'edit' | 'pick' } | null>(null);
  const [swapOf, setSwapOf] = useState<number | null>(null);
  /** What a swapped ingredient was, while the page is open ("was spinach"). */
  const [was, setWas] = useState<ReadonlyMap<number, string>>(new Map());
  const atHomeOn = isOn(d.settings.features, 'atHome');
  const shoppingOn = isOn(d.settings.features, 'shoppingList');
  const pantry = usePantry();
  const left = usePantryLeft();
  if (!recipe) {
    return (
      <section>
        <p>{t('recipes.notFound')}</p>
        <a href={href('recipes')}>{t('common.back')}</a>
      </section>
    );
  }
  const batches = d.batches.filter((b) => b.recipeId === id).sort((a, b) => b.cookedAt - a.cookedAt);
  const weighed = batches.find((b) => b.cookedGrams);
  const home = atHomeOn && pantry ? ingredientsAtHome(recipe.ingredients, pantry, (i) => left(i).out) : undefined;
  const editing = sheet ? recipe.ingredients[sheet.index] : undefined;

  async function remove() {
    const old = await repo.deleteRecipe(recipe!.id);
    navigate('recipes');
    if (old) toast(t('recipes.deleted', { name: old.name }), () => void repo.restoreRecipe(old));
  }

  /** Change the saved recipe in place, with an undo (owner's rule: undo instead of confirm). */
  async function changeIngredients(next: Ingredient[], message: string) {
    const old = recipe!;
    await repo.saveRecipe({ ...old, ingredients: next });
    toast(message, () => void repo.restoreRecipe(old));
  }

  function saveSheet(saved: SavedIngredient) {
    const i = sheet!.index;
    const before = recipe!.ingredients[i]!;
    const ing = itemIngredient(saved, d.foods.version, d.profile.salt);
    if (sheet!.mode === 'pick' && refKey(ing.ref) !== refKey(before.ref)) setWas((m) => new Map(m).set(i, before.name));
    void changeIngredients(
      recipe!.ingredients.map((x, j) => (j === i ? ing : x)),
      t('recipeView.changed', { name: ing.name }),
    );
    setSheet(null);
  }

  function removeIngredient() {
    const i = sheet!.index;
    const gone = recipe!.ingredients[i]!;
    // Rows below move up, so what they were no longer lines up.
    setWas(new Map());
    void changeIngredients(
      recipe!.ingredients.filter((_, j) => j !== i),
      t('recipeView.removed', { name: gone.name }),
    );
    setSheet(null);
  }

  function swap(ing: Ingredient, wasName: string) {
    const i = swapOf!;
    setWas((m) => new Map(m).set(i, wasName));
    void changeIngredients(
      recipe!.ingredients.map((x, j) => (j === i ? ing : x)),
      t('recipeView.swapped', { was: wasName, now: ing.name }),
    );
    setSwapOf(null);
  }

  const lastLine = weighed?.cookedGrams ? t('recipeView.weighedLine', { each: fmtGrams(weighed.cookedGrams / weighed.recipe.portions), total: fmtGrams(weighed.cookedGrams) }) : '';

  return (
    <section className="recipe-view">
      <header className="page-head row">
        <BackButton to={['recipes']} />
        <div className="grow">
          <p className="muted small page-kicker">{batches.length ? t('recipeView.cookedTimes', { n: batches.length }) : t('recipeView.notCooked')}</p>
          <h1>{recipe.name}</h1>
        </div>
        <a className="btn btn-small btn-ghost" href={href('recipes', recipe.id, 'edit')}>
          <Icon name="edit" size={16} /> {t('recipeView.edit')}
        </a>
      </header>
      <p className="muted recipe-sub">
        {t('recipes.portions', { n: recipe.portions })}
        {lastLine && ` · ${lastLine}`}
        {recipe.tags.length ? ` · ${recipe.tags.join(', ')}` : ''}
      </p>
      <AskChips questions={[t('recipeView.ask', { name: recipe.name })]} />

      <PortionGives recipe={recipe} />
      <details className="card fold">
        <summary>
          <Icon name="bars" size={18} /> <span className="grow">{t('recipeView.allNutrients')}</span>
          <Icon name="down" size={18} />
        </summary>
        <PortionNutrients recipe={recipe} saved bare />
      </details>

      <WhoGivesWhat recipe={recipe} was={was} onIngredient={(index) => setSheet({ index, mode: 'edit' })} />

      <div className="recipe-cook">
        {home && home.of > 0 && (
          <div className="row recipe-home">
            <Icon name="pantry" size={18} />
            <span className="grow small">
              {t('home.nextAtHome', { have: home.have, of: home.of })}
              {home.missing.length > 0 && ` · ${t('recipeView.missing', { names: home.missing.slice(0, 3).join(', ') + (home.missing.length > 3 ? '…' : '') })}`}
            </span>
            {shoppingOn && home.missing.length > 0 && (
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setToList(true)}>
                <Icon name="plus" size={16} /> {t('fills.basket')}
              </button>
            )}
          </div>
        )}
        {!home && shoppingOn && recipe.ingredients.length > 0 && (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setToList(true)}>
            <Icon name="cart" size={16} /> {t('shopping.toList')}
          </button>
        )}
        <button className="btn btn-primary btn-block btn-big" onClick={() => navigate('cook', recipe.id)}>
          <Icon name="pot" /> {t('recipes.cook')}
        </button>
      </div>

      {recipe.instructions && (
        <>
          <h2 className="section-title">{t('recipes.instructions')}</h2>
          <p className="recipe-steps">{recipe.instructions}</p>
        </>
      )}
      {recipe.notes && <p className="notes">{recipe.notes}</p>}

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
      {sheet && editing && (
        <IngredientSheet
          key={`${sheet.index}-${sheet.mode}`}
          initial={draftOf(d, editing)}
          label={editing.name}
          startWith={sheet.mode}
          preview={(item) => <IngredientSwapLine state={recipe} index={sheet.index} item={item} />}
          actions={
            sheet.mode === 'edit' && !editing.isSalt ? (
              <div className="row wrap">
                <button
                  type="button"
                  className="btn btn-secondary grow"
                  onClick={() => {
                    setSwapOf(sheet.index);
                    setSheet(null);
                  }}
                >
                  <Icon name="swap" /> {t('recipeView.swap')}
                </button>
                {refHref(d, editing.ref) && (
                  <a className="btn btn-ghost" href={refHref(d, editing.ref)}>
                    {t('recipeView.aboutFood')}
                  </a>
                )}
              </div>
            ) : undefined
          }
          onSave={saveSheet}
          onRemove={removeIngredient}
          onClose={() => setSheet(null)}
        />
      )}
      {swapOf !== null && recipe.ingredients[swapOf] && (
        <SwapSheet
          recipe={recipe}
          index={swapOf}
          onSwap={swap}
          onSearch={() => {
            setSheet({ index: swapOf, mode: 'pick' });
            setSwapOf(null);
          }}
          onClose={() => setSwapOf(null)}
        />
      )}
      {toList && <RecipeToListSheet recipe={recipe} onClose={() => setToList(false)} />}
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
