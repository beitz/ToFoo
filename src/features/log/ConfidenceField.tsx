import { t } from '../../i18n';
import type { EntryConfidence } from '../../model/types';
import { Segmented } from '../../ui/controls';

export function ConfidenceField({ value, onChange }: { value: EntryConfidence; onChange: (v: EntryConfidence) => void }) {
  return (
    <div className="field">
      <span className="field-label">{t('confidence.label')}</span>
      <Segmented
        label={t('confidence.label')}
        value={value}
        onChange={onChange}
        options={[
          { value: 'A', label: t('confidence.A') },
          { value: 'B', label: t('confidence.B') },
          { value: 'C', label: t('confidence.C') },
        ]}
      />
    </div>
  );
}
