import { useId, useState } from 'react';
import { t } from '../../i18n';
import { formatDateTime } from '../../lib/dates';
import { fromLocalInput, toLocalInput } from './time';
import { DateTimeInput } from '../../ui/DateInputs';

/** "Just finished" by default; date and time one tap away. */
export function TimeField({ value, onChange, label = t('log.time') }: { value: number; onChange: (t: number) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!open) {
    return (
      <div className="field row-between">
        <span className="muted">
          {label}: {formatDateTime(value)}
        </span>
        <button type="button" className="btn btn-small btn-ghost" aria-label={`${t('log.changeTime')}: ${label}`} onClick={() => setOpen(true)}>
          {t('log.changeTime')}
        </button>
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <DateTimeInput id={id} value={toLocalInput(value)} onChange={(e) => {
        const v = fromLocalInput(e.target.value);
        if (v !== undefined) onChange(v);
      }} />
    </div>
  );
}
