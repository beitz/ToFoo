import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useData, type AppData } from '../../app/data';
import { t } from '../../i18n';
import { foodName } from '../../i18n/names';
import { productLabel, productRef } from '../../foods/products';
import { productFood } from '../../foods/products';
import { fmtAmount, fmtNumber } from '../../lib/format';
import { refKey } from '../../lib/refs';
import { canBeWater, LABEL_MINERALS, labelValues, type LabelMineral } from '../../logic/water';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import type { Food } from '../../foods/foodDb';
import type { DrinkContainer, FoodRef, Product } from '../../storage/types';
import { Field, NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { BarcodeSheet } from '../log/BarcodeSheet';
import { FoodPicker, type PickedFood } from '../log/FoodPicker';

/**
 * Which water a container holds (docs/SPEC.md, "Water", "Which water"): none (minerals not counted),
 * a food or product (a product picked from Open Food Facts is saved with the container), or the
 * label's values typed in (saved as a custom food with the container).
 */
export type WaterChoice =
  | { kind: 'none' }
  | { kind: 'ref'; ref: FoodRef; product?: Product }
  | { kind: 'label'; id?: string; name: string; values: Partial<Record<LabelMineral, number>> };

/** The choice a container starts its form with. */
export function initialWater(c: Pick<DrinkContainer, 'water'> | undefined, d: Pick<AppData, 'customFoodsById'>): WaterChoice {
  const ref = c?.water;
  if (!ref) return { kind: 'none' };
  if (ref.source === 'custom') {
    const cf = d.customFoodsById.get(ref.id);
    return cf ? { kind: 'label', id: cf.id, name: cf.name, values: labelValues(cf) } : { kind: 'none' };
  }
  return { kind: 'ref', ref };
}

/** The food behind a picked water (for its name and minerals), from the choice's product or the saved data. */
function choiceFood(w: Extract<WaterChoice, { kind: 'ref' }>, d: AppData): Food | undefined {
  if (w.product) return productFood(w.product, d.foods);
  if (w.ref.source === 'BLS') return d.foods.byCode.get(w.ref.code);
  if (w.ref.source === 'custom') return undefined;
  const p = d.productsById.get(refKey(w.ref));
  return p ? productFood(p, d.foods) : undefined;
}

function choiceName(w: WaterChoice, d: AppData): string | undefined {
  if (w.kind === 'none') return undefined;
  if (w.kind === 'label') return w.name;
  if (w.product) return productLabel(w.product);
  if (w.ref.source === 'BLS') return foodName(d.foods.byCode.get(w.ref.code));
  const p = w.ref.source === 'custom' ? undefined : d.productsById.get(refKey(w.ref));
  return p ? productLabel(p) : undefined;
}

/** Its calcium and magnesium a litre (the two that matter in water), or undefined when it lists neither. */
function perLitreText(w: WaterChoice, d: AppData): string | undefined {
  let perLitre: Partial<Record<string, number>> = {};
  if (w.kind === 'label') perLitre = { CA: w.values.CA, MG: w.values.MG };
  else if (w.kind === 'ref') {
    const f = choiceFood(w, d);
    for (const id of ['CA', 'MG']) {
      const v = f?.per100[id];
      if (typeof v === 'number') perLitre[id] = v * 10;
    }
  }
  const shown = (['CA', 'MG'] as const).filter((id) => perLitre[id] !== undefined).map((id) => `${fmtAmount(id, perLitre[id]!)} ${NUTRIENT_BY_ID.get(id)?.name ?? id}`);
  return shown.length ? t('drinks.perLitre', { values: shown.join(' · ') }) : undefined;
}

/** The "Which water" part of the container form: what it holds now, and ways to change it. */
export function WaterKindSection({ water, onFind, onLabel, onClear }: { water: WaterChoice; onFind: () => void; onLabel: () => void; onClear: () => void }) {
  const d = useData();
  const name = choiceName(water, d);
  const values = perLitreText(water, d);
  return (
    <>
      <h3 className="section-title">{t('drinks.whichWater')}</h3>
      {water.kind === 'none' ? (
        <p className="muted small">{t('drinks.waterNone')}</p>
      ) : (
        <div className="card water-kind">
          <Icon name="drop" size={18} />
          <span className="grow">
            <strong>{name ?? t('drinks.waterGone')}</strong>
            <span className="muted small">
              {' '}
              · {values ?? t('drinks.noMinerals')}
            </span>
          </span>
        </div>
      )}
      <div className="water-kind-actions">
        <button type="button" className="btn btn-secondary" onClick={onFind}>
          <Icon name="search" /> {t(water.kind === 'ref' ? 'drinks.findOther' : 'drinks.findWater')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onLabel}>
          <Icon name="edit" /> {t(water.kind === 'label' ? 'drinks.changeLabel' : 'drinks.typeLabel')}
        </button>
        {water.kind !== 'none' && (
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            {t('drinks.notCounted')}
          </button>
        )}
      </div>
      <p className="muted small">{t(water.kind === 'none' ? 'drinks.waterWhy' : 'drinks.waterCounts')}</p>
    </>
  );
}

/** Find the water: by name in the foods and products, or by its barcode. One with energy is a drink, not water. */
export function WaterPicker({ onPick, onCancel }: { onPick: (w: WaterChoice) => void; onCancel: () => void }) {
  const d = useData();
  const [scanning, setScanning] = useState(false);
  const [refused, setRefused] = useState<string>();
  function pick(p: PickedFood) {
    const food = p.product ? productFood(p.product, d.foods) : p.food;
    const name = p.product ? productLabel(p.product) : foodName(p.food);
    if (!canBeWater(food)) {
      const kcal = food.per100.ENERCC;
      setRefused(t('drinks.notWater', { name, kcal: typeof kcal === 'number' ? fmtNumber(kcal, 0) : '?' }));
      return;
    }
    onPick(p.product ? { kind: 'ref', ref: productRef(p.product), product: p.product } : { kind: 'ref', ref: { source: 'BLS', version: d.foods.version, code: p.food.code } });
  }
  return (
    <>
      <p className="muted small">{t('drinks.findHint')}</p>
      {refused && (
        <p className="notice small" role="alert">
          {refused}
        </p>
      )}
      <FoodPicker
        onPick={(p) => {
          setScanning(false);
          pick(p);
        }}
        onScan={() => setScanning(true)}
        onCancel={onCancel}
        title={t('drinks.whichWater')}
      />
      {/* Over the open sheet, outside it, so the scanner covers the screen. */}
      {scanning && createPortal(<BarcodeSheet onFound={(product) => (setScanning(false), pick({ product }))} onClose={() => setScanning(false)} />, document.body)}
    </>
  );
}

/** Type a water's label: its name and the minerals it lists, in mg per litre. */
export function LabelForm({ initial, onDone, onCancel }: { initial?: Extract<WaterChoice, { kind: 'label' }>; onDone: (w: WaterChoice) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [values, setValues] = useState<Partial<Record<LabelMineral, number>>>(initial?.values ?? {});
  const any = LABEL_MINERALS.some((m) => values[m.id] !== undefined);
  const problem = !name.trim() ? t('drinks.problem.waterName') : !any ? t('drinks.problem.noValues') : undefined;
  return (
    <>
      <Field label={t('drinks.waterName')}>{(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('drinks.waterNamePlaceholder')} autoFocus={!initial} />}</Field>
      <p className="muted small">{t('drinks.labelHint')}</p>
      <div className="grid-2">
        {LABEL_MINERALS.map((m) => (
          <Field key={m.id} label={NUTRIENT_BY_ID.get(m.id)?.name ?? m.id}>
            {(id) => <NumberInput id={id} value={values[m.id]} onChange={(v) => setValues((old) => ({ ...old, [m.id]: v }))} suffix="mg/l" min={0} />}
          </Field>
        ))}
      </div>
      {initial?.id && <p className="muted small">{t('drinks.labelSameName')}</p>}
      {problem && (name || any) && (
        <p className="notice small" role="alert">
          {problem}
        </p>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="button" className="btn btn-primary" disabled={!!problem} onClick={() => onDone({ kind: 'label', ...(initial?.id ? { id: initial.id } : {}), name: name.trim(), values })}>
          {t('drinks.useLabel')}
        </button>
      </div>
    </>
  );
}
