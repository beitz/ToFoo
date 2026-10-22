import { t } from '../../i18n';
import { repo } from '../../storage/repo';
import type { Batch } from '../../storage/types';
import type { Storage } from '../../model/paramTypes';
import { dayKey } from '../../lib/dates';
import { bookingSlot, nextStorage, totalLeft } from '../../logic/stock';

export { nextStorage, totalLeft };

export async function logPortion(b: Batch, storage: Storage, toast: (m: string, undo?: () => void) => void, time = Date.now()) {
  const slot = bookingSlot(b, storage);
  const entry = await repo.addLog({ kind: 'portion', batchId: b.id, storage: slot, portions: 1, time, day: dayKey(new Date(time)), confidence: 'A', label: b.recipe.name });
  toast(t('stock.logged', { name: b.recipe.name }), () => void repo.deleteLog(entry.id));
}
