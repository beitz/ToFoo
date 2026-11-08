import { t } from '../../i18n';
import { productLabel, productRef } from '../../foods/products';
import { fmtNumber } from '../../lib/format';
import { oneOf, type OneOf } from '../../logic/oneTap';
import type { PieceUnits } from '../../logic/pantry';
import { repo } from '../../storage/repo';
import type { LogEntry } from '../../storage/types';
import type { HomePick } from './useHomeTiles';

/** What one tap logs: the entry and the amount as the toast says it. */
export type OneTap = () => Promise<{ entry: LogEntry; amount: string }>;

/**
 * One tap on a food tile (At home, Favourites, Recent foods): one serving of an own food, else one
 * of a food or product (src/logic/oneTap.ts) at the meal's time. Undefined when no amount is known
 * yet, so the tap opens the amount sheet instead, once.
 */
export function oneTapFor(
  pick: HomePick,
  { time, day, foodsVersion, units, lastGrams, countedInPieces = false }: { time: number; day: string; foodsVersion: string; units?: PieceUnits; lastGrams?: number; countedInPieces?: boolean },
): OneTap | undefined {
  if (pick.kind === 'custom') {
    const food = pick.food;
    return async () => {
      const entry = await repo.addLog({ kind: 'custom', customFoodId: food.id, servings: 1, time, day, confidence: food.confidence, label: food.name });
      return { entry, amount: t('log.oneServing', { serving: food.servingLabel }) };
    };
  }
  if (pick.kind === 'portion') return undefined;
  const product = pick.kind === 'product' ? pick.product : undefined;
  const food = pick.kind === 'food' ? pick.food : undefined;
  const amount = oneOf({ countedInPieces, units, lastGrams, servingGrams: product?.serving?.grams });
  if (!amount) return undefined;
  // Products' last amount goes by the product's id, BLS foods' by their code (as in the amount sheet).
  const lastKey = product ? product.id : food!.code;
  const label = product ? productLabel(product) : food!.nameEn;
  return async () => {
    const entry = await repo.addLog({
      kind: 'food',
      ref: product ? productRef(product) : { source: 'BLS', version: foodsVersion, code: food!.code },
      grams: amount.grams,
      preparation: 'asListed',
      ...(amount.pieces ? { pieces: amount.pieces } : {}),
      time,
      day,
      confidence: 'A',
      label,
    });
    await repo.setMeta(`lastGrams:${lastKey}`, amount.grams);
    return { entry, amount: amountText(amount) };
  };
}

/** The amount one tap added, as the toast says it: "1 piece (60 g)", "1 pack (350 g)", "60 g". */
export function amountText(one: OneOf): string {
  const g = `${fmtNumber(one.grams, 1)} g`;
  if (one.what === 'piece') return t('log.onePiece', { g });
  if (one.what === 'pack') return t('log.onePack', { g });
  if (one.what === 'serving') return t('log.oneLabelServing', { g });
  return g;
}
