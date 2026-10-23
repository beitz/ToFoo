import type { AppData } from '../../app/data';
import { fmtGrams, fmtNumber } from '../../lib/format';
import { t } from '../../i18n';
import type { LogEntry } from '../../storage/types';

/** Short amount text for a log entry ("120 g", "1 portion · freezer", …). */
export function entryAmount(e: LogEntry, d: Pick<AppData, 'customFoodsById'>): string {
  switch (e.kind) {
    case 'food':
      return e.pieces ? `${t(e.pieces === 1 ? 'piece.one' : 'piece.many', { n: fmtNumber(e.pieces, 2) })} · ${fmtGrams(e.grams)}` : fmtGrams(e.grams);
    case 'portion':
      return [e.grams ? fmtGrams(e.grams) : t('entry.portions', { n: fmtNumber(e.portions, 2) }), t(`storage.${e.storage}`), ...(e.ingredients ? [t('entry.changed')] : [])].join(' · ');
    case 'custom': {
      const c = d.customFoodsById.get(e.customFoodId);
      return `${fmtNumber(e.servings, 2)} × ${c?.servingLabel ?? t('entry.serving')}`;
    }
    case 'manual':
      return e.isSupplement ? t('log.supplement') : t('entry.manual');
    case 'drink':
      return t('entry.drink');
  }
}
