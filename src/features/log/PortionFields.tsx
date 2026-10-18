import { useState } from 'react';
import { t } from '../../i18n';
import { fmtGrams } from '../../lib/format';
import { portionGrams, potShare, sameIngredients, stockPortionsFor } from '../../logic/batch';
import type { Storage } from '../../model/paramTypes';
import type { Batch, Ingredient } from '../../storage/types';
import { Field, NumberInput, Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { IngredientChanges } from '../recipes/IngredientChanges';

/** A portion entry's own fields while it is being logged or edited. */
export interface PortionDraft {
  storage: Storage;
  portions: number;
  grams?: number;
  ingredients?: Ingredient[];
}

/**
 * How much of a batch was eaten and how: by portion, or by grams once the pot was weighed (then
 * also how many portions it took from stock), where it was stored, and "Change ingredients" for
 * this serving only (the recipe and the pot stay as they are).
 */
export function PortionFields({ batch, value, onChange }: { batch: Batch; value: PortionDraft; onChange: (patch: Partial<PortionDraft>) => void }) {
  const perPortion = portionGrams(batch);
  const byWeight = value.grams !== undefined && !!batch.cookedGrams;
  const [changing, setChanging] = useState(!!value.ingredients);
  const share = potShare(value, batch);

  function setMode(mode: 'portion' | 'weight') {
    if (mode === 'weight') {
      const grams = Math.round((perPortion ?? 0) * (value.portions || 1));
      onChange({ grams, portions: stockPortionsFor(grams, batch) });
    } else onChange({ grams: undefined, portions: Math.max(1, value.portions) });
  }

  function setIngredients(list: Ingredient[]) {
    onChange({ ingredients: sameIngredients(list, batch.recipe.ingredients) ? undefined : list });
  }

  return (
    <>
      {batch.cookedGrams ? (
        <div className="field">
          <span className="field-label">{t('portion.howMuch')}</span>
          <Segmented<'portion' | 'weight'>
            label={t('portion.howMuch')}
            value={byWeight ? 'weight' : 'portion'}
            onChange={setMode}
            options={[
              { value: 'portion', label: t('portion.byPortion') },
              { value: 'weight', label: t('portion.byWeight') },
            ]}
          />
        </div>
      ) : null}
      {byWeight ? (
        <div className="grid-2">
          <Field label={t('portion.gramsEaten')} hint={perPortion ? t('portion.perPortionHint', { grams: fmtGrams(perPortion) }) : undefined}>
            {(id) => (
              <NumberInput
                id={id}
                value={value.grams}
                onChange={(g) => onChange(g && g > 0 ? { grams: g, portions: stockPortionsFor(g, batch) } : { grams: 0 })}
                suffix="g"
                min={0}
                autoFocus
              />
            )}
          </Field>
          <Field label={t('portion.fromStock')}>{(id) => <NumberInput id={id} value={value.portions} onChange={(v) => onChange({ portions: Math.max(0, Math.round(v ?? 0)) })} min={0} />}</Field>
        </div>
      ) : (
        <Field label={t('diary.portions')} hint={batch.cookedGrams ? undefined : t('portion.weighFirst')}>
          {(id) => <NumberInput id={id} value={value.portions} onChange={(v) => v && v > 0 && onChange({ portions: v })} min={0} />}
        </Field>
      )}
      <div className="field">
        <span className="field-label">{t('diary.storage')}</span>
        <Segmented<Storage>
          label={t('diary.storage')}
          value={value.storage}
          onChange={(s) => onChange({ storage: s })}
          options={[
            { value: 'fresh', label: t('storage.fresh') },
            { value: 'fridge', label: t('storage.fridge') },
            { value: 'freezer', label: t('storage.freezer') },
          ]}
        />
      </div>
      {changing ? (
        <>
          <h3 className="section-title">{t('portion.ingredientsTitle')}</h3>
          <p className="muted small">{t('portion.ingredientsHint')}</p>
          <IngredientChanges original={batch.recipe.ingredients} value={value.ingredients ?? batch.recipe.ingredients} scale={share} gramsLabel={t('portion.gramsInServing')} onChange={setIngredients} />
        </>
      ) : (
        <button className="btn btn-secondary btn-block" onClick={() => setChanging(true)}>
          <Icon name="edit" size={16} /> {t('portion.changeIngredients')}
        </button>
      )}
    </>
  );
}

/** A portion draft is complete: something eaten (portions, or grams of a weighed pot) and every ingredient with an amount. */
export function portionDraftValid(v: PortionDraft, batch: Batch): boolean {
  const amount = v.grams !== undefined && batch.cookedGrams ? v.grams > 0 && v.portions >= 0 : v.portions > 0;
  return amount && (!v.ingredients || (v.ingredients.length > 0 && v.ingredients.every((i) => i.grams > 0)));
}
