import { t, type MessageKey } from '../../i18n';
import type { SkinExposure } from '../../model/sun';

export const SKIN_OPTIONS: SkinExposure[] = ['faceHands', 'faceHandsForearms', 'faceHandsArms', 'armsLegs', 'mostOfBody'];

export function SkinSelect({ value, onChange, id = 'skin' }: { value: SkinExposure; onChange: (s: SkinExposure) => void; id?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{t('sun.skin')}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as SkinExposure)}>
        {SKIN_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {t(`skin.${s}` as MessageKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
