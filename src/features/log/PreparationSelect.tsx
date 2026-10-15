import { t, type MessageKey } from '../../i18n';
import type { Preparation } from '../../model/paramTypes';

export const PREPARATIONS: Preparation[] = ['asListed', 'raw', 'boiled', 'steamed', 'baked', 'fried'];

export function prepLabel(p: Preparation): string {
  return t(`prep.${p}` as MessageKey);
}

export function PreparationSelect({ value, onChange, id, hint = true }: { value: Preparation; onChange: (p: Preparation) => void; id?: string; hint?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={id ?? 'prep'}>{t('prep.label')}</label>
      <select id={id ?? 'prep'} value={value} onChange={(e) => onChange(e.target.value as Preparation)}>
        {PREPARATIONS.map((p) => (
          <option key={p} value={p}>
            {prepLabel(p)}
          </option>
        ))}
      </select>
      {hint && <div className="field-hint">{t('prep.hint')}</div>}
    </div>
  );
}
