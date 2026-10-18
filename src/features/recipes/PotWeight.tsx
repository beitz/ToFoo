import { t } from '../../i18n';
import { fmtGrams } from '../../lib/format';
import { cookedWeight } from '../../logic/batch';
import { Field, NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';

export interface PotScale {
  /** The pot with the cooked food in it (g). */
  full?: number;
  /** The empty pot (g); remembered from the last time. */
  empty?: number;
}

/**
 * Weigh the cooked pot: the full pot minus the empty one (which the app remembers) is the cooked
 * food, so portions can later be logged by grams. With the food weighed on its own, the empty pot
 * stays at 0.
 */
export function PotWeight({ value, portions, onChange }: { value: PotScale; portions: number; onChange: (v: PotScale) => void }) {
  const food = cookedWeight(value.full, value.empty);
  const typed = value.full !== undefined && value.full > 0;
  return (
    <div className="pot-weight">
      <div className="grid-2">
        <Field label={t('batch.fullPot')}>{(id) => <NumberInput id={id} value={value.full} onChange={(full) => onChange({ ...value, full })} suffix="g" min={0} placeholder="0" />}</Field>
        <Field label={t('batch.emptyPot')}>{(id) => <NumberInput id={id} value={value.empty} onChange={(empty) => onChange({ ...value, empty })} suffix="g" min={0} placeholder="0" />}</Field>
      </div>
      <p className="small" role="status">
        {food !== undefined ? (
          <>
            <strong>{t('batch.cookedFood', { grams: fmtGrams(food) })}</strong> · {t('batch.perPortion', { grams: fmtGrams(food / Math.max(1, portions)) })}
          </>
        ) : typed ? (
          <span className="notice"><Icon name="alert" size={14} /> {t('batch.weightImplausible')}</span>
        ) : (
          <span className="muted">{t('batch.weighHint')}</span>
        )}
      </p>
    </div>
  );
}
