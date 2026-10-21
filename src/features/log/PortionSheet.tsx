import { useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { portionGrams } from '../../logic/batch';
import { bookingSlot, nextStorage } from '../../logic/stock';
import { repo } from '../../storage/repo';
import type { Batch, LogEntry } from '../../storage/types';
import { Sheet } from '../../ui/controls';
import { PortionFields, portionDraftValid, type PortionDraft } from './PortionFields';
import { TimeField } from './TimeField';

/**
 * Log some of a batch in stock: one portion by default, or by grams once its pot was weighed (then
 * the pot's average portion to start with), with "Change ingredients" for this serving.
 */
export function PortionSheet({ batch, day, time: initialTime, onClose, onAdded }: { batch: Batch; day: string; time: number; onClose: () => void; onAdded: (e: LogEntry) => void }) {
  const d = useData();
  const [time, setTime] = useState(initialTime);
  const [draft, setDraft] = useState<PortionDraft>(() => {
    const storage = bookingSlot(batch, nextStorage(batch, day) ?? 'freezer');
    const per = portionGrams(batch);
    return { storage, portions: 1, ...(per ? { grams: Math.round(per) } : {}) };
  });
  const valid = portionDraftValid(draft, batch);

  async function log() {
    if (!valid) return;
    const { grams, ingredients, ...rest } = draft;
    const entry = await repo.addLog({
      kind: 'portion',
      batchId: batch.id,
      ...rest,
      ...(grams && batch.cookedGrams ? { grams } : {}),
      ...(ingredients ? { ingredients } : {}),
      time,
      day: dayKey(new Date(time)),
      confidence: 'A',
      label: batch.recipe.name,
    });
    onAdded(entry);
  }

  return (
    <Sheet title={batch.recipe.name} onClose={onClose}>
      {d.recipes.some((r) => r.id === batch.recipeId) && (
        <p className="muted small">
          <a href={href('recipes', batch.recipeId)}>{t('log.recipeDetails')}</a>
        </p>
      )}
      <PortionFields batch={d.batchesById.get(batch.id) ?? batch} value={draft} onChange={(patch) => setDraft((v) => ({ ...v, ...patch }))} />
      <TimeField value={time} onChange={setTime} />
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!valid} onClick={() => void log()}>
          {t('log.add')}
        </button>
      </div>
    </Sheet>
  );
}
