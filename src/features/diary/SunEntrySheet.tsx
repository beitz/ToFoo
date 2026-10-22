import { useState } from 'react';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import type { SkinExposure } from '../../model/sun';
import { repo } from '../../storage/repo';
import { Field, NumberInput, Sheet } from '../../ui/controls';
import { SkinSelect } from '../settings/SkinSelect';
import { TimeInput } from '../../ui/DateInputs';

export function SunEntrySheet({ day, onClose }: { day: string; onClose: () => void }) {
  const toast = useToast();
  const [minutes, setMinutes] = useState<number | undefined>(60);
  const [start, setStart] = useState('12:00');
  const [skin, setSkin] = useState<SkinExposure>('faceHandsArms');
  async function save() {
    if (!minutes) return;
    const [h, m] = start.split(':').map(Number);
    await repo.addSunEntry({ day, startHour: (h ?? 12) + (m ?? 0) / 60, minutes, skin });
    toast(t('diary.sunAdded'));
    onClose();
  }
  return (
    <Sheet title={t('diary.addOutside')} onClose={onClose}>
      <Field label={t('sun.minutes')}>{(id) => <NumberInput id={id} value={minutes} onChange={setMinutes} suffix="min" min={0} />}</Field>
      <Field label={t('sun.start')}>{(id) => <TimeInput id={id} value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
      <SkinSelect value={skin} onChange={setSkin} />
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!minutes} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
