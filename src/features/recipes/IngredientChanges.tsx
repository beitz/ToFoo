import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useData, type AppData } from '../../app/data';
import { t } from '../../i18n';
import { productFood, productLabel } from '../../foods/products';
import { fmtNumber } from '../../lib/format';
import { refKey } from '../../lib/refs';
import { compareIngredients, sameIngredients, scaleIngredients } from '../../logic/batch';
import { foodIngredient, itemIngredient } from '../../logic/ingredients';
import type { Ingredient, Product } from '../../storage/types';
import { NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { BarcodeSheet } from '../log/BarcodeSheet';
import type { PickedFood } from '../log/FoodPicker';
import { prepLabel } from '../log/PreparationSelect';
import { IngredientSearch } from './IngredientSearch';
import { IngredientSheet, type IngredientDraft, type SavedIngredient } from './IngredientSheet';
import { SourceTag } from './SourceTag';

/** An ingredient's display name: its food's or product's current name, or the name it was saved with. */
export function ingredientName(ing: Ingredient, d: Pick<AppData, 'foods' | 'productsById'>): string {
  if (ing.isSalt) return t('recipes.salt');
  if (ing.ref.source === 'BLS') return d.foods.byCode.get(ing.ref.code)?.nameEn ?? ing.name;
  const product = d.productsById.get(refKey(ing.ref));
  return product ? productLabel(product) : ing.name;
}

const round1 = (g: number) => Math.round(g * 10) / 10;

/**
 * Change what one pot or one serving had, against what it would have had (the recipe, or the pot):
 * swap a food, change an amount or preparation, take one out or add one. Amounts are shown and typed
 * for what was eaten or cooked (`scale` × the whole-pot grams the list keeps), so "150 g tofu in my
 * bowl" is typed as 150 g. New, changed and taken-out ingredients are marked.
 */
export function IngredientChanges({
  original,
  value,
  scale,
  gramsLabel,
  onChange,
}: {
  original: Ingredient[];
  value: Ingredient[];
  scale: number;
  /** What the amounts are for, e.g. "Grams in this pot". */
  gramsLabel: string;
  onChange: (list: Ingredient[]) => void;
}) {
  const d = useData();
  const [sheet, setSheet] = useState<{ index?: number; initial: IngredientDraft; label?: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const { marks, removed } = compareIngredients(original, value);
  const changed = !sameIngredients(original, value);
  const k = scale > 0 ? scale : 1;

  function draftOf(ing: Ingredient): IngredientDraft {
    const grams = ing.grams ? round1(ing.grams * k) : undefined;
    if (ing.ref.source === 'BLS') return { food: d.foods.byCode.get(ing.ref.code), grams, preparation: ing.preparation };
    const product = d.productsById.get(refKey(ing.ref));
    return { ...(product ? { food: productFood(product, d.foods), product } : {}), grams, preparation: ing.preparation };
  }

  function openProduct(product: Product) {
    setSheet({ initial: { food: productFood(product, d.foods), product, preparation: 'asListed' } });
  }

  function pick(p: PickedFood) {
    if (p.product) openProduct(p.product);
    else onChange([...value, foodIngredient(p.food, d.foods.version, d.profile.salt)]);
  }

  function saveSheet(saved: SavedIngredient) {
    const ing = itemIngredient({ ...saved, grams: saved.grams / k }, d.foods.version, d.profile.salt);
    const index = sheet?.index;
    onChange(index === undefined ? [...value, ing] : value.map((x, j) => (j === index ? ing : x)));
    setSheet(null);
  }

  const update = (i: number, patch: Partial<Ingredient>) => onChange(value.map((ing, j) => (j === i ? { ...ing, ...patch } : ing)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  return (
    <div className="ingredient-changes">
      <ul className="plain-list">
        {value.map((ing, i) => {
          const mark = marks[i];
          const name = ingredientName(ing, d);
          const tag =
            mark?.kind === 'new'
              ? t('ai.recipeItemNew')
              : mark?.kind === 'changed'
                ? mark.wasGrams !== undefined
                  ? t('ai.recipeItemWas', { grams: fmtNumber(round1(mark.wasGrams * k), 1) })
                  : t('batch.wasPrep', { prep: prepLabel(mark.wasPreparation!) })
                : undefined;
          return (
            <li key={`${refKey(ing.ref)}-${i}`} className="proposal-item">
              <button className="proposal-name ingredient-name" onClick={() => setSheet({ index: i, initial: draftOf(ing), label: ing.name })} aria-label={t('recipes.changeIngredient', { name })}>
                <span className="link-like">
                  {name} <Icon name="edit" size={14} />
                </span>
                <span className="muted small block">
                  {!ing.isSalt && <SourceTag source={ing.ref.source} product={d.productsById.get(refKey(ing.ref))} />}
                  {ing.preparation !== 'asListed' && ` · ${prepLabel(ing.preparation)}`}
                </span>
                {tag && <span className="change-tag small">{tag}</span>}
              </button>
              <NumberInput value={ing.grams ? round1(ing.grams * k) : undefined} onChange={(g) => update(i, { grams: (g ?? 0) / k })} suffix="g" min={0} autoFocus={ing.grams === 0} />
              <button className="icon-btn" aria-label={t('ai.removeItem', { name })} onClick={() => remove(i)}>
                <Icon name="trash" size={18} />
              </button>
            </li>
          );
        })}
      </ul>
      {removed.length > 0 && (
        <p className="small">
          <span className="muted">{t('ai.recipeRemoved')}</span>{' '}
          {removed.map((r, i) => (
            <button key={i} className="btn btn-small btn-ghost" onClick={() => onChange([...value, r])} aria-label={t('batch.putBack', { name: ingredientName(r, d) })}>
              <span className="removed-items">{ingredientName(r, d)}</span> {t('batch.putBackShort')}
            </button>
          ))}
        </p>
      )}
      <IngredientSearch onPick={pick} onScan={() => setScanning(true)} />
      {changed && (
        <button className="btn btn-small btn-ghost" onClick={() => onChange(scaleIngredients(original, 1))}>
          <Icon name="repeat" size={16} /> {t('batch.undoChanges')}
        </button>
      )}
      {/* On top of the sheet this list sits in, so they render at the page's root. */}
      {scanning &&
        createPortal(
          <BarcodeSheet
            onFound={(product) => {
              setScanning(false);
              openProduct(product);
            }}
            onClose={() => setScanning(false)}
          />,
          document.body,
        )}
      {sheet &&
        createPortal(
          <IngredientSheet
            key={sheet.index ?? 'new'}
            initial={sheet.initial}
            label={sheet.label}
            gramsLabel={gramsLabel}
            addLabel={t('batch.addIngredient')}
            onSave={saveSheet}
            onRemove={
              sheet.index === undefined
                ? undefined
                : () => {
                    remove(sheet.index!);
                    setSheet(null);
                  }
            }
            onClose={() => setSheet(null)}
          />,
          document.body,
        )}
    </div>
  );
}
