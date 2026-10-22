import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { formatDay } from '../../lib/dates';
import { cookedWeight } from '../../logic/batch';
import { totalLeft } from '../../logic/stock';
import { repo } from '../../storage/repo';
import type { Batch, Ingredient } from '../../storage/types';
import { Sheet } from '../../ui/controls';
import { IngredientChanges } from './IngredientChanges';
import { PotWeight, type PotScale } from './PotWeight';
import { PotPortions, potPortionsValid } from './PotPortions';

/** The pot as it was weighed: the cooked food plus the empty pot remembered now, or just the remembered empty pot. */
export function initialPot(cookedGrams: number | undefined, remembered: number | undefined): PotScale {
  return cookedGrams ? { full: cookedGrams + (remembered ?? 0), empty: remembered } : { empty: remembered };
}

/**
 * One cooked pot: its weight (for logging portions by grams), what went into it, when it differed
 * from the recipe ("this pot had tofu"), and the portions it made. Changes count for every portion
 * of the pot, also those already eaten, since they were the same pot.
 */
export function BatchSheet({ batch, onClose }: { batch: Batch; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const recipe = d.recipes.find((r) => r.id === batch.recipeId);
  const original = batch.recipeIngredients ?? batch.recipe.ingredients;
  const [ingredients, setIngredients] = useState<Ingredient[]>(batch.recipe.ingredients);
  const [pot, setPot] = useState<PotScale>(() => initialPot(batch.cookedGrams, recipe?.potGrams ?? d.settings.potGrams));
  const [portions, setPortions] = useState<number | undefined>(batch.recipe.portions);
  const cooked = cookedWeight(pot.full, pot.empty);
  const valid = ingredients.length > 0 && ingredients.every((i) => i.grams > 0) && (!pot.full || cooked !== undefined) && potPortionsValid(portions);
  const n = potPortionsValid(portions) ? portions : batch.recipe.portions;

  async function save() {
    if (!valid) return;
    const old = await repo.updateBatchPot(batch.id, { ingredients, portions: n, ...(cooked ? { cookedGrams: cooked, emptyPotGrams: pot.empty } : {}) });
    onClose();
    if (old) toast(t('batch.saved', { name: batch.recipe.name }), () => void repo.restoreBatch(old));
  }

  return (
    <Sheet title={batch.recipe.name} onClose={onClose}>
      <p className="muted small">
        {t('stock.cooked', { day: formatDay(batch.cookedDay, d.today) })} · {t('recipes.batchLeft', { n: totalLeft(batch), of: batch.recipe.portions })}
      </p>
      <h3 className="section-title">{t('batch.weighTitle')}</h3>
      <PotWeight value={pot} portions={n} onChange={setPot} />
      <h3 className="section-title">{t('batch.potIngredients')}</h3>
      <p className="muted small">{t('batch.potIngredientsHint')}</p>
      <IngredientChanges original={original} value={ingredients} scale={1} gramsLabel={t('batch.gramsInPot')} onChange={setIngredients} />
      <h3 className="section-title">{t('batch.portionsTitle')}</h3>
      <PotPortions value={portions} recipePortions={recipe?.portions ?? batch.recipe.portions} onChange={setPortions} />
      {n !== batch.recipe.portions && <p className="muted small">{t('batch.portionsChangeHint')}</p>}
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!valid} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
