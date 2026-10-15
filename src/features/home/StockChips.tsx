import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { repo } from '../../storage/repo';
import type { Batch } from '../../storage/types';
import type { Storage } from '../../model/paramTypes';
import { Icon } from '../../ui/Icon';
import { dayKey } from '../../lib/dates';

/** The storage a portion is taken from when tapped: fresh on cooking day, then fridge, then freezer. */
export function nextStorage(b: Batch, today: string): Storage | null {
  if (b.remaining.fresh > 0 && b.cookedDay === today) return 'fresh';
  if (b.remaining.fridge > 0) return 'fridge';
  if (b.remaining.fresh > 0) return 'fridge'; // a "fresh" portion not eaten on cooking day was kept chilled
  if (b.remaining.freezer > 0) return 'freezer';
  return null;
}

export function totalLeft(b: Batch): number {
  return b.remaining.fresh + b.remaining.fridge + b.remaining.freezer;
}

export async function logPortion(b: Batch, storage: Storage, toast: (m: string, undo?: () => void) => void, time = Date.now()) {
  // A fresh portion kept past cooking day is booked from the "fresh" slot but modelled as fridge.
  const slot: Storage = storage === 'fridge' && b.remaining.fridge === 0 && b.remaining.fresh > 0 ? 'fresh' : storage;
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
