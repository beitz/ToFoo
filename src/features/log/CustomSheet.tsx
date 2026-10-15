import { useState } from 'react';
import { t } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { repo } from '../../storage/repo';
import type { CustomFood, LogEntry } from '../../storage/types';
import { Field, NumberInput, Sheet } from '../../ui/controls';
import { TimeField } from './TimeField';

export function CustomSheet({ food, time: initialTime, onClose, onAdded }: { food: CustomFood; day: string; time: number; onClose: () => void; onAdded: (e: LogEntry) => void }) {
  const [servings, setServings] = useState<number | undefined>(1);
  const [time, setTime] = useState(initialTime);
  async function save() {
    if (!servings) return;
    const entry = await repo.addLog({ kind: 'custom', customFoodId: food.id, servings, time, day: dayKey(new Date(time)), confidence: food.confidence, label: food.name });
    onAdded(entry);
  }
  return (
    <Sheet title={food.name} onClose={onClose}>
      <Field label={t('log.servings', { serving: food.servingLabel })}>{(id) => <NumberInput id={id} value={servings} onChange={setServings} min={0} autoFocus />}</Field>
      <TimeField value={time} onChange={setTime} />
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!servings} onClick={() => void save()}>
          {t('log.add')}
        </button>
      </div>
    </Sheet>
  );
}
