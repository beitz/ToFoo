import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import type { Food } from '../../foods/foodDb';
import { productLabel } from '../../foods/products';
import { repo } from '../../storage/repo';
import type { Product } from '../../storage/types';
import { Field, NumberInput, Sheet } from '../../ui/controls';
import { MatchPicker, ProductInfo } from '../log/ProductParts';

/**
 * A packaged product or USDA food as a recipe ingredient: its label values, the BLS food for the
 * vitamins and minerals the label lacks (as on the log screen), and the grams in the recipe.
 */
export function ProductIngredientSheet({ product, onAdd, onClose }: { product: Product; onAdd: (p: Product, grams: number) => void; onClose: () => void }) {
  const d = useData();
  const [match, setMatch] = useState<Food | undefined>(() => (product.match ? d.foods.byCode.get(product.match.code) : undefined));
  const [grams, setGrams] = useState<number>();
  const draft = useMemo<Product>(() => {
    const { match: _saved, ...rest } = product;
    return match ? { ...rest, match: { version: d.foods.version, code: match.code } } : rest;
  }, [product, match, d.foods.version]);
  // A product with no label values and no matched food would add nothing but a name.
  const hasValues = Object.keys(draft.per100).length > 0 || !!match;

  async function add() {
    if (!grams || !hasValues) return;
    await repo.saveProduct(draft);
    await repo.setProductMatch(draft.id, draft.match ?? null);
    onAdd(draft, grams);
  }

  return (
    <Sheet title={productLabel(draft)} onClose={onClose}>
      <ProductInfo product={draft} />
      <Field label={t('recipes.gramsInRecipe')}>
        {(id) => <NumberInput id={id} value={grams} onChange={setGrams} placeholder="0" suffix={draft.perMl ? 'ml' : 'g'} min={0} autoFocus />}
      </Field>
      {draft.quantity && <p className="muted small">{t('recipes.packSize', { size: draft.quantity })}</p>}
      <MatchPicker product={draft} match={match} onChange={setMatch} />
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!grams || !hasValues} onClick={() => void add()}>
          {t('recipes.addToRecipe')}
        </button>
      </div>
    </Sheet>
  );
}
