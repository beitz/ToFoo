import { useState } from 'react';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { repo } from '../../storage/repo';
import { KETONE_TYPES, type KetoneReading, type KetoneType } from '../../storage/types';
import { Field, NumberInput, Segmented, Sheet } from '../../ui/controls';
import { TimeField } from '../log/TimeField';
import { KETONE_TYPE_KEY, KETONE_UNIT, ketoneProblem, ketoneValueText } from './ketoneFormat';

/** The colour blocks printed on common urine ketone strips (acetoacetate, mmol/L): negative, trace, small, moderate, large. */
const URINE_LEVELS = [0, 0.5, 1.5, 4, 8, 16];

const HINT: Record<KetoneType, Parameters<typeof t>[0]> = { blood: 'ketone.hint.blood', breath: 'ketone.hint.breath', urine: 'ketone.hint.urine' };

/** Add a ketone measurement (now by default), or edit or delete one, with undo. */
export function KetoneSheet({ reading, onClose }: { reading?: KetoneReading; onClose: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<KetoneType>(reading?.type ?? 'blood');
  const [value, setValue] = useState<number | undefined>(reading?.value);
  const [time, setTime] = useState(reading?.time ?? Date.now());
  const problem = ketoneProblem(value, time, Date.now());

  async function save() {
    if (problem || value === undefined) return;
    const rec = { type, value, time, day: dayKey(new Date(time)) };
    if (reading) {
      await repo.restoreKetone({ ...reading, ...rec });
      toast(t('ketone.updated'), () => repo.restoreKetone(reading));
    } else {
      const added = await repo.addKetone(rec);
      toast(t('ketone.added', { value: ketoneValueText(added) }), () => void repo.deleteKetone(added.id));
    }
    onClose();
  }

  async function remove() {
    if (!reading) return;
    const old = await repo.deleteKetone(reading.id);
    if (old) toast(t('ketone.deleted'), () => repo.restoreKetone(old));
    onClose();
  }

  return (
    <Sheet title={t(reading ? 'ketone.editTitle' : 'ketone.addTitle')} onClose={onClose}>
      <Segmented label={t('ketone.type')} value={type} onChange={setType} options={KETONE_TYPES.map((k) => ({ value: k, label: t(KETONE_TYPE_KEY[k]) }))} />
      {type === 'urine' && (
        <div className="chips" role="group" aria-label={t('ketone.urineLevels')}>
          {URINE_LEVELS.map((l) => (
            <button key={l} type="button" className={`chip${value === l ? ' on' : ''}`} aria-pressed={value === l} onClick={() => setValue(l)}>
              {l}
            </button>
          ))}
        </div>
      )}
      <Field label={t('ketone.value')}>{(id) => <NumberInput id={id} value={value} onChange={setValue} suffix={KETONE_UNIT[type]} min={0} autoFocus={!reading} />}</Field>
      <TimeField value={time} onChange={setTime} label={t('ketone.time')} />
      <p className="muted small">{t(HINT[type])}</p>
      {problem && value !== undefined && (
        <p className="notice small" role="alert">
          {problem}
        </p>
      )}
      <div className="sheet-actions">
        {reading && (
          <button className="btn btn-ghost" onClick={() => void remove()}>
            {t('common.delete')}
          </button>
        )}
        <button className="btn btn-primary" disabled={!!problem} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
