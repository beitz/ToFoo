import type { useToast } from '../../app/toast';
import type { AppData } from '../../app/data';
import { productLabel } from '../../foods/products';
import { refKey } from '../../lib/refs';
import { t } from '../../i18n';
import { dayKey, formatDateTime } from '../../lib/dates';
import { ASK_SINCE_AFTER_DAYS, lastFromContainer, spreadLength } from '../../logic/spread';
import { containerDrinkKey, containerMl } from '../../logic/drinks';
import { repo } from '../../storage/repo';
import type { DrinkContainer, FoodRef, LogEntry, WaterRecord } from '../../storage/types';
import { waterText } from './format';
import { foodName } from '../../i18n/names';

/** What the water and drink texts look things up in: foods, saved products and label waters. */
export type DrinkContext = Pick<AppData, 'foods' | 'productsById' | 'customFoodsById'>;

/** A water's name: the product ("klar Medium"), the BLS water, or the name typed with its label; undefined when it is gone. */
export function waterName(ref: FoodRef, d: DrinkContext): string | undefined {
  if (ref.source === 'custom') return d.customFoodsById.get(ref.id)?.name;
  if (ref.source === 'BLS') return foodName(d.foods.byCode.get(ref.code));
  const p = d.productsById.get(refKey(ref));
  return p ? productLabel(p) : undefined;
}

/** What a container holds, in words: "water", "klar Medium", "black tea", … */
export function drinkName(c: Pick<DrinkContainer, 'drink' | 'water'>, d: DrinkContext): string {
  const key = containerDrinkKey(c);
  if (key === 'water') return (c.water && waterName(c.water, d)) ?? t('drinks.water');
  if (key !== 'other') return t(`drinks.${key}`);
  return foodName(d.foods.byCode.get(c.drink!.code)) ?? c.drink!.code;
}

/** How a container counts, as an icon: + a full one drunk at once, the hourglass one logged when empty (spread over the days since it was filled). */
export function containerIcon(c: Pick<DrinkContainer, 'whenEmpty'>): 'plus' | 'hourglass' {
  return c.whenEmpty ? 'hourglass' : 'plus';
}

/** "1 l black tea", "375 ml water", "1 l klar Medium". */
export function containerAmountText(c: DrinkContainer, amount: number, d: DrinkContext): string {
  return t('drinks.amountOf', { amount: waterText(containerMl(c, amount)), drink: drinkName(c, d) });
}

/**
 * Log `amount` of a container (1 = full, 0.5 = half) at `time`, with undo: plain water as a water
 * record, a drink as its BLS food (its water, nutrients and tea or coffee effect count from the data).
 */
export async function logContainer(c: DrinkContainer, amount: number, time: number, d: DrinkContext, toast: ReturnType<typeof useToast>): Promise<void> {
  const undo = await saveContainer(c, amount, time, undefined, d);
  toast(t('drinks.added', { name: c.name, what: containerAmountText(c, amount, d) }), undo);
}

/**
 * Save `amount` of a container drunk at `time` or, with `from`, finished at `time` after being filled
 * at `from` (drunk evenly in between: src/logic/spread.ts). Plain water keeps which water it was, so
 * its minerals count (and keep counting if the container later holds another). Returns the undo.
 */
export async function saveContainer(c: DrinkContainer, amount: number, time: number, from: number | undefined, d: DrinkContext): Promise<() => void> {
  const ml = containerMl(c, amount);
  const day = dayKey(new Date(time));
  const spread = from !== undefined && from < time ? { from } : {};
  if (!c.drink) {
    const added = await repo.addWater({ ml, time, day, containerId: c.id, ...spread, ...(c.water ? { water: c.water } : {}) });
    return () => void repo.deleteWater(added.id);
  }
  const food = d.foods.byCode.get(c.drink.code);
  const entry = await repo.addLog({ kind: 'food', ref: c.drink, grams: ml, preparation: 'asListed', time, day, confidence: 'B', label: foodName(food) ?? drinkName(c, d), containerId: c.id, ...spread });
  return () => void repo.deleteLog(entry.id);
}

/** Log a container finished at `time`, filled at `from`, with undo: "Teapot empty: 2 l black tea since Mon 20:04 (2 days)". */
export async function logFinished(c: DrinkContainer, amount: number, time: number, from: number, d: DrinkContext, toast: ReturnType<typeof useToast>): Promise<void> {
  const undo = await saveContainer(c, amount, time, from, d);
  toast(t('drinks.finished', { name: c.name, what: containerAmountText(c, amount, d), since: formatDateTime(from), length: lengthText(from, time) }), undo);
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
