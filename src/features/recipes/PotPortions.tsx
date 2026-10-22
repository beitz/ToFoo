import { t } from '../../i18n';
import { MAX_POT_PORTIONS } from '../../logic/batch';
import { Field, NumberInput } from '../../ui/controls';

/** A pot's portion count as typed: a whole number from 1 up to the sanity limit. */
export function potPortionsValid(n: number | undefined): n is number {
  return n !== undefined && Number.isInteger(n) && n >= 1 && n <= MAX_POT_PORTIONS;
}

/**
 * How many portions this pot made, when it was not what the recipe says (a bigger celeriac, more
 * boxes). Only how the pot is shared changes; the amounts stay as typed.
 */
export function PotPortions({ value, recipePortions, onChange }: { value: number | undefined; recipePortions: number; onChange: (n: number | undefined) => void }) {
  return (
    <Field
      label={t('batch.potPortions')}
      hint={potPortionsValid(value) || value === undefined ? t('batch.potPortionsHint', { n: recipePortions }) : <span className="notice">{t('batch.potPortionsInvalid', { max: MAX_POT_PORTIONS })}</span>}
    >
      {(id) => <NumberInput id={id} value={value} onChange={onChange} min={1} />}
    </Field>
  );
}
