import type { useToast } from '../../app/toast';
import type { FoodDb } from '../../foods/foodDb';
import { t } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { containerDrinkKey, containerMl } from '../../logic/drinks';
import { repo } from '../../storage/repo';
import type { DrinkContainer } from '../../storage/types';
import { waterText } from './format';

/** What a container holds, in words: "water", "black tea", … */
export function drinkName(c: Pick<DrinkContainer, 'drink'>, foods: FoodDb): string {
  const key = containerDrinkKey(c);
  if (key !== 'other') return t(`drinks.${key}`);
  return foods.byCode.get(c.drink!.code)?.nameEn ?? c.drink!.code;
}

/** "1 l black tea", "375 ml water". */
export function containerAmountText(c: DrinkContainer, amount: number, foods: FoodDb): string {
  return t('drinks.amountOf', { amount: waterText(containerMl(c, amount)), drink: drinkName(c, foods) });
}

/**
 * Log `amount` of a container (1 = full, 0.5 = half) at `time`, with undo: plain water as a water
 * record, a drink as its BLS food (its water, nutrients and tea or coffee effect count from the data).
 */
export async function logContainer(c: DrinkContainer, amount: number, time: number, foods: FoodDb, toast: ReturnType<typeof useToast>): Promise<void> {
  const ml = containerMl(c, amount);
  const day = dayKey(new Date(time));
  const text = t('drinks.added', { name: c.name, what: containerAmountText(c, amount, foods) });
  if (!c.drink) {
    const added = await repo.addWater({ ml, time, day });
    toast(text, () => void repo.deleteWater(added.id));
    return;
  }
  const food = foods.byCode.get(c.drink.code);
  const entry = await repo.addLog({ kind: 'food', ref: c.drink, grams: ml, preparation: 'asListed', time, day, confidence: 'B', label: food?.nameEn ?? drinkName(c, foods) });
  toast(text, () => void repo.deleteLog(entry.id));
}
