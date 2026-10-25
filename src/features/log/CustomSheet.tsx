import { useState } from 'react';
import { t } from '../../i18n';
import { dayKey, formatDateTime } from '../../lib/dates';
import { repo } from '../../storage/repo';
import type { CustomFood, LogEntry } from '../../storage/types';
import { Field, NumberInput, Sheet } from '../../ui/controls';
import { FoodActions } from '../food/FoodActions';

export function CustomSheet({ food, time: initialTime, onClose, onAdded }: { food: CustomFood; day: string; time: number; onClose: () => void; onAdded: (e: LogEntry) => void }) {
  const [servings, setServings] = useState<number | undefined>(1);
  // The meal's time is set once, at the top of the Log screen (owner's ask, 2026-10-22).
  const time = initialTime;
  async function save() {
    if (!servings) return;
    const entry = await repo.addLog({ kind: 'custom', customFoodId: food.id, servings, time, day: dayKey(new Date(time)), confidence: food.confidence, label: food.name });
    onAdded(entry);
  }
  return (
    <Sheet title={food.name} onClose={onClose}>
      <FoodActions foodRef={{ source: 'custom', id: food.id }} name={food.name} inSheet />
      <Field label={t('log.servings', { serving: food.servingLabel })}>{(id) => <NumberInput id={id} value={servings} onChange={setServings} min={0} autoFocus />}</Field>
      <p className="muted small">{t('log.atMealTime', { time: formatDateTime(time) })}</p>
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!servings} onClick={() => void save()}>
          {t('log.add')}
        </button>
      </div>
    </Sheet>
  );
}
