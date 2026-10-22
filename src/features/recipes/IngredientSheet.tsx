import { useMemo, useState, type ReactNode } from 'react';
import { useData, type AppData } from '../../app/data';
import { t } from '../../i18n';
import type { Food } from '../../foods/foodDb';
import { productFood, productLabel } from '../../foods/products';
import type { Preparation } from '../../model/paramTypes';
import type { Ingredient, Product } from '../../storage/types';
import { refKey } from '../../lib/refs';
import { Field, NumberInput, Sheet } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { BarcodeSheet } from '../log/BarcodeSheet';
import { FoodPicker, type PickedFood } from '../log/FoodPicker';
import { PreparationSelect } from '../log/PreparationSelect';
import { MatchPicker, ProductInfo, saveProductChoice, useMatchChoice } from '../log/ProductParts';

/** An ingredient being added or changed: a BLS food, or a product (Open Food Facts or USDA) as a food. */
export interface IngredientDraft {
  /** The BLS food, or the product as a food; absent when the food is no longer in the database. */
  food?: Food;
  product?: Product;
  grams?: number;
  preparation: Preparation;
}

/** The sheet's starting point for an ingredient of a recipe. */
export function draftOf(d: Pick<AppData, 'foods' | 'productsById'>, ing: Ingredient): IngredientDraft {
  if (ing.ref.source === 'BLS') return { food: d.foods.byCode.get(ing.ref.code), grams: ing.grams || undefined, preparation: ing.preparation };
  const product = d.productsById.get(refKey(ing.ref));
  return { ...(product ? { food: productFood(product, d.foods), product } : {}), grams: ing.grams || undefined, preparation: ing.preparation };
}

export type SavedIngredient = { food: Food; product?: Product; grams: number; preparation: Preparation };

/**
 * Add or change one recipe ingredient (in the editor, or on the assistant's card): the amount, how
 * it is cooked, and the food itself, replaced by another BLS food, a saved product, a USDA food or a
 * scanned barcode, as when changing a logged entry. A product shows its label values and the BLS
 * food that supplies the vitamins and minerals it lacks.
 */
export function IngredientSheet({
  initial,
  label,
  startWith = 'edit',
  gramsLabel,
  addLabel,
  preview,
  actions,
  onSave,
  onRemove,
  onClose,
}: {
  initial: IngredientDraft;
  /** Shown when the food is missing (the name the ingredient was saved with). */
  label?: string;
  startWith?: 'edit' | 'pick';
  /** The amount field's label; default "grams in the recipe". */
  gramsLabel?: string;
  /** The button's label for a new ingredient; default "Add to recipe". */
  addLabel?: string;
  /** What saving the ingredient as it stands would change (the recipe editor's swap preview); `undefined` while it is incomplete. */
  preview?: (item: SavedIngredient | undefined) => ReactNode;
  /** More ways to change the ingredient, under "Change food" (the recipe page's Swap). */
  actions?: ReactNode;
  onSave: (i: SavedIngredient) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const d = useData();
  const [mode, setMode] = useState<'edit' | 'pick' | 'scan'>(startWith);
  const [food, setFood] = useState<Food | undefined>(initial.product ? undefined : initial.food);
  const [product, setProduct] = useState<Product | undefined>(initial.product);
  const [grams, setGrams] = useState<number | undefined>(initial.grams);
  const [preparation, setPreparation] = useState<Preparation>(initial.preparation);
  const { choice, setChoice, draft: productDraft, reset: resetChoice } = useMatchChoice(product);
  const current = productDraft ? productFood(productDraft, d.foods) : food;
  const name = productDraft ? productLabel(productDraft) : (current?.nameEn ?? label ?? '');
  // A product with no label values and no matched food would count nothing but a name.
  const hasValues = !productDraft || Object.keys(productDraft.per100).length > 0 || !!choice.food;
  const valid = !!current && !!grams && grams > 0 && hasValues;
  const item = useMemo<SavedIngredient | undefined>(
    () => (valid && current ? { food: current, ...(productDraft ? { product: productDraft } : {}), grams: grams!, preparation } : undefined),
    // `current` is rebuilt every render from the same inputs.
    [valid, food, productDraft, grams, preparation],
  );

  /** The BLS food the ingredient had: a good first guess for a product's missing vitamins and minerals. */
  function blsBefore(): Food | undefined {
    if (food) return food;
    return product?.match ? d.foods.byCode.get(product.match.code) : undefined;
  }

  function pick(p: PickedFood) {
    if (p.product) {
      resetChoice(p.product, blsBefore());
      setProduct(p.product);
      setFood(undefined);
    } else {
      setProduct(undefined);
      resetChoice(undefined);
      setFood(p.food);
    }
    setMode('edit');
  }

  async function save() {
    if (!valid || !current) return;
    if (productDraft) {
      // Saved on this phone, as when a product is logged, so the recipe can refer to it.
      await saveProductChoice(productDraft);
    }
    onSave(item!);
  }

  if (mode === 'scan') return <BarcodeSheet onFound={(p) => pick({ product: p })} onClose={() => setMode('pick')} />;

  return (
    <Sheet title={name || t('recipes.ingredient')} onClose={onClose}>
      {mode === 'pick' ? (
        <FoodPicker onPick={pick} onScan={() => setMode('scan')} onCancel={() => (current ? setMode('edit') : onClose())} />
      ) : (
        <>
          {productDraft && <ProductInfo product={productDraft} />}
          {!productDraft && current && <p className="muted small">{current.nameDe}</p>}
          {!current && (
            <p className="notice small" role="alert">
              <Icon name="alert" size={16} /> {t('recipes.missingFood')}
            </p>
          )}
          <button className="btn btn-secondary btn-block" onClick={() => setMode('pick')}>
            <Icon name="search" /> {t('edit.changeFood')}
          </button>
          {actions}
          <Field label={gramsLabel ?? t('recipes.gramsInRecipe')}>
            {(id) => <NumberInput id={id} value={grams} onChange={setGrams} placeholder="0" suffix={productDraft?.perMl ? 'ml' : 'g'} min={0} autoFocus={!grams} />}
          </Field>
          {productDraft && <MatchPicker key={productDraft.id} product={productDraft} choice={choice} onChange={setChoice} />}
          <PreparationSelect id="ingredient-prep" value={preparation} onChange={setPreparation} />
          {preview?.(item)}
          <div className="sheet-actions">
            {onRemove && (
              <button className="btn btn-danger-ghost" onClick={onRemove}>
                {t('common.delete')}
              </button>
            )}
            <button className="btn btn-primary" disabled={!valid} onClick={() => void save()}>
              {onRemove ? t('common.save') : (addLabel ?? t('recipes.addToRecipe'))}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
