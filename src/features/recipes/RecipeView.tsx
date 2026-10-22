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
import { PotPortions, potPortionsValid } from './PotPortions';
import { Field, Sheet, Toggle } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { PlanEditor } from './PlanEditor';
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
import { DateInput } from '../../ui/DateInputs';

export function RecipeView({ id }: { id: string }) {
  const d = useData();
  const toast = useToast();
  const recipe = d.recipes.find((r) => r.id === id);
  const [cooking, setCooking] = useState(false);
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
        <button className="btn btn-primary btn-block btn-big" onClick={() => setCooking(true)}>
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

/**
 * Cooking a batch: what actually went into the pot (the recipe's amounts to start with, every one
 * editable, foods swapped, taken out or added), how many portions it made, its weight and where the
 * portions go. All of it is this pot's own; the recipe stays as it is.
 */
function CookSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const [plan, setPlan] = useState<StoragePlan>(recipe.defaultPlan ?? d.settings.defaultPlan);
  const [day, setDay] = useState(d.today);
  const [remember, setRemember] = useState(false);
  const [pot, setPot] = useState<PotScale>(() => initialPot(undefined, recipe.potGrams ?? d.settings.potGrams));
  const [ingredients, setIngredients] = useState<Ingredient[]>(recipe.ingredients);
  const [portions, setPortions] = useState<number | undefined>(recipe.portions);
  const cooked = cookedWeight(pot.full, pot.empty);
  const valid = ingredients.length > 0 && ingredients.every((i) => i.grams > 0) && (!pot.full || cooked !== undefined) && potPortionsValid(portions);
  const n = potPortionsValid(portions) ? portions : recipe.portions;
  async function cook() {
    if (!valid) return;
    const resolved = resolvePlan(plan, n);
    const batch = await repo.cookBatch(recipe, resolved, day, remember ? plan : undefined, { ingredients, portions: n, ...(cooked ? { cookedGrams: cooked, emptyPotGrams: pot.empty } : {}) });
    toast(t('recipes.cooked', { n }), () => void repo.deleteBatch(batch.id));
    onClose();
    navigate('recipes');
  }
  return (
    <Sheet title={t('recipes.cookTitle', { name: recipe.name })} onClose={onClose}>
      <Field label={t('recipes.cookDay')}>{(id) => <DateInput id={id} value={day} max={d.today} onChange={(e) => e.target.value && setDay(e.target.value)} />}</Field>
      <h3 className="section-title">{t('batch.whatGoesIn')}</h3>
      <p className="muted small">{t('batch.cookChangesHint')}</p>
      <IngredientChanges original={recipe.ingredients} value={ingredients} scale={1} gramsLabel={t('batch.gramsInPot')} onChange={setIngredients} />
      <h3 className="section-title">{t('batch.weighTitleOptional')}</h3>
      <PotWeight value={pot} portions={n} onChange={setPot} />
      <h3 className="section-title">{t('batch.portionsTitle')}</h3>
      <PotPortions value={portions} recipePortions={recipe.portions} onChange={setPortions} />
      <PlanEditor plan={plan} portions={n} onChange={setPlan} />
      <Toggle checked={remember} onChange={setRemember} label={t('recipes.rememberPlan')} />
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!valid} onClick={() => void cook()}>
          {t('recipes.cookConfirm')}
        </button>
      </div>
    </Sheet>
  );
}
