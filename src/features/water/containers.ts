import type { useToast } from '../../app/toast';
import type { FoodDb } from '../../foods/foodDb';
import { t } from '../../i18n';
import { dayKey, formatDateTime } from '../../lib/dates';
import { ASK_SINCE_AFTER_DAYS, lastFromContainer, spreadLength } from '../../logic/spread';
import { containerDrinkKey, containerMl } from '../../logic/drinks';
import { repo } from '../../storage/repo';
import type { DrinkContainer, LogEntry, WaterRecord } from '../../storage/types';
import { waterText } from './format';
import { foodName } from '../../i18n/names';

/** What a container holds, in words: "water", "black tea", … */
export function drinkName(c: Pick<DrinkContainer, 'drink'>, foods: FoodDb): string {
  const key = containerDrinkKey(c);
  if (key !== 'other') return t(`drinks.${key}`);
  return foodName(foods.byCode.get(c.drink!.code)) ?? c.drink!.code;
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
  const undo = await saveContainer(c, amount, time, undefined, foods);
  toast(t('drinks.added', { name: c.name, what: containerAmountText(c, amount, foods) }), undo);
}

/**
 * Save `amount` of a container drunk at `time` or, with `from`, finished at `time` after being filled
 * at `from` (drunk evenly in between: src/logic/spread.ts). Returns the undo.
 */
export async function saveContainer(c: DrinkContainer, amount: number, time: number, from: number | undefined, foods: FoodDb): Promise<() => void> {
  const ml = containerMl(c, amount);
  const day = dayKey(new Date(time));
  const spread = from !== undefined && from < time ? { from } : {};
  if (!c.drink) {
    const added = await repo.addWater({ ml, time, day, containerId: c.id, ...spread });
    return () => void repo.deleteWater(added.id);
  }
  const food = foods.byCode.get(c.drink.code);
  const entry = await repo.addLog({ kind: 'food', ref: c.drink, grams: ml, preparation: 'asListed', time, day, confidence: 'B', label: foodName(food) ?? drinkName(c, foods), containerId: c.id, ...spread });
  return () => void repo.deleteLog(entry.id);
}

/** Log a container finished at `time`, filled at `from`, with undo: "Teapot empty: 2 l black tea since Mon 20:04 (2 days)". */
export async function logFinished(c: DrinkContainer, amount: number, time: number, from: number, foods: FoodDb, toast: ReturnType<typeof useToast>): Promise<void> {
  const undo = await saveContainer(c, amount, time, from, foods);
  toast(t('drinks.finished', { name: c.name, what: containerAmountText(c, amount, foods), since: formatDateTime(from), length: lengthText(from, time) }), undo);
}

/** "2 days 4 h", "9 h". */
export function lengthText(from: number, to: number): string {
  const { days, hours } = spreadLength(from, to);
  if (!days) return t('drinks.hours', { h: hours });
  return hours ? t('drinks.daysHours', { n: days, h: hours }) : t(days === 1 ? 'drinks.oneDay' : 'drinks.days', { n: days });
}

/**
 * When a container now finished was filled, for one tap: its last finish (or last logged), unless that
 * was too long ago to be sure (then undefined, and the sheet asks).
 */
export function sinceForTap(c: DrinkContainer, water: readonly WaterRecord[], log: readonly LogEntry[], time: number): number | undefined {
  const last = lastFromContainer(c.id, water, log, time);
  return last !== undefined && time - last <= ASK_SINCE_AFTER_DAYS * 86_400_000 ? last : undefined;
}
