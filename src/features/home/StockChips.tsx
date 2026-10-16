import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { repo } from '../../storage/repo';
import type { Batch } from '../../storage/types';
import type { Storage } from '../../model/paramTypes';
import { Icon } from '../../ui/Icon';
import { dayKey } from '../../lib/dates';
import { bookingSlot, nextStorage, totalLeft } from '../../logic/stock';

export { nextStorage, totalLeft };

export async function logPortion(b: Batch, storage: Storage, toast: (m: string, undo?: () => void) => void, time = Date.now()) {
  const slot = bookingSlot(b, storage);
  const entry = await repo.addLog({ kind: 'portion', batchId: b.id, storage: slot, portions: 1, time, day: dayKey(new Date(time)), confidence: 'A', label: b.recipe.name });
  toast(t('stock.logged', { name: b.recipe.name }), () => void repo.deleteLog(entry.id));
}

export function StockChips() {
  const d = useData();
  const toast = useToast();
  const inStock = d.batches.filter((b) => totalLeft(b) > 0).sort((a, b) => a.cookedAt - b.cookedAt);
  if (!inStock.length) return null;
  return (
    <div className="chips" aria-label={t('stock.title')}>
      {inStock.map((b) => {
        const s = nextStorage(b, d.today);
        return (
          <button key={b.id} className="chip" disabled={!s} onClick={() => s && void logPortion(b, s, toast)}>
            <Icon name={s === 'freezer' ? 'snow' : s === 'fridge' ? 'fridge' : 'pot'} size={16} />
            <span>
              {b.recipe.name} · {t('stock.left', { n: totalLeft(b) })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
