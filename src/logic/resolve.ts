/**
 * Turn stored data into model inputs (pure, tested in resolve.test.ts).
 */
import type { Food, FoodDb } from '../foods/foodDb';
import { ALL_SALT_CODES, saltCode } from '../foods/foodDb';
import { productFood } from '../foods/products';
import { refKey } from '../lib/refs';
import { potShare, servingIngredients } from './batch';
import { addDays, dayRange, parseDay, utcOffsetHours } from '../lib/dates';
import { sun as sunParams } from '../../model/parameters';
import type { Range } from '../model/paramTypes';
import { sunVitaminD, type SunSession } from '../model/sun';
import type { DayStatus, FoodPart, ModelEntry } from '../model/types';
import type { Batch, CustomFood, DayStatusRecord, Fast, FoodRef, Ingredient, LogEntry, Product, Profile, SunEntry } from '../storage/types';

export interface FoodContext {
  foods: FoodDb;
  /** Foods from online databases (Open Food Facts, USDA) by id (`OFF:<barcode>`, `USDA:<fdcId>`). */
  products: ReadonlyMap<string, Product>;
}

export interface ResolveContext extends FoodContext {
  batches: ReadonlyMap<string, Batch>;
  customFoods: ReadonlyMap<string, CustomFood>;
  salt: Profile['salt'];
}

export function foodForRef(ref: FoodRef, ctx: FoodContext): Food | undefined {
  if (ref.source === 'BLS') return ctx.foods.byCode.get(ref.code);
  if (ref.source === 'OFF' || ref.source === 'USDA') {
    const p = ctx.products.get(refKey(ref));
    return p ? productFood(p, ctx.foods) : undefined;
  }
  return undefined;
}

/** The food to use for an ingredient, with salt replaced by the kitchen default. */
export function ingredientFood(ing: Ingredient, ctx: FoodContext & { salt: Profile['salt'] }): Food | undefined {
  if (ing.ref.source === 'BLS' && (ing.isSalt || ALL_SALT_CODES.has(ing.ref.code))) {
    return ctx.foods.byCode.get(saltCode(ctx.salt));
  }
  return foodForRef(ing.ref, ctx);
}

function partFromFood(food: Food, grams: number, preparation: FoodPart['preparation'], storage: FoodPart['storage']): FoodPart {
  return {
    label: food.nameEn,
    code: food.code,
    grams,
    per100: food.per100,
    provenance: food.provenance,
    group: food.group,
    nameEn: food.nameEn,
    nameDe: food.nameDe,
    preparation,
    storage,
  };
}

/** Parts for a share of a batch's pot (1 / portions for one portion), of its ingredients or a serving's changed ones. */
export function batchParts(batch: Batch, share: number, storage: FoodPart['storage'], ctx: ResolveContext, ingredients: readonly Ingredient[] = batch.recipe.ingredients): FoodPart[] {
  const parts: FoodPart[] = [];
  const saltCtx = batch.recipe.saltOverride ? { ...ctx, salt: batch.recipe.saltOverride } : ctx;
  for (const ing of ingredients) {
    const food = ingredientFood(ing, saltCtx);
    if (!food) continue;
    parts.push(partFromFood(food, ing.grams * share, ing.preparation, storage));
  }
  return parts;
}

export function resolveEntry(e: LogEntry, ctx: ResolveContext): ModelEntry | null {
  const base = { id: e.id, label: e.label, time: e.time, dayKey: e.day, confidence: e.confidence };
  switch (e.kind) {
    case 'food': {
      const food = foodForRef(e.ref, ctx);
      if (!food) return null;
      const f = ALL_SALT_CODES.has(food.code) ? (ctx.foods.byCode.get(saltCode(ctx.salt)) ?? food) : food;
      return { ...base, isSupplement: false, parts: [partFromFood(f, e.grams, e.preparation, 'fresh')] };
    }
    case 'portion': {
      const batch = ctx.batches.get(e.batchId);
      if (!batch) return null;
      return { ...base, isSupplement: false, parts: batchParts(batch, potShare(e, batch), e.storage, ctx, servingIngredients(e, batch)) };
    }
    case 'custom': {
      const cf = ctx.customFoods.get(e.customFoodId);
      if (!cf) return null;
      const direct = Object.fromEntries(Object.entries(cf.nutrients).map(([k, v]) => [k, v * e.servings]));
      return { ...base, isSupplement: cf.isSupplement, parts: [], direct };
    }
    case 'manual':
      return { ...base, isSupplement: e.isSupplement, parts: [], direct: e.nutrients };
    case 'drink':
      // No nutrients of its own (log the drink as a food for that); changes iron absorption of the meal.
      return { ...base, isSupplement: true, parts: [], direct: {}, modifiers: { [e.drink]: true } };
  }
}

/** True if the entry ends a fast (food, not a drink or supplement). */
export function breaksFast(e: LogEntry, customFoods: ReadonlyMap<string, CustomFood>): boolean {
  if (e.kind === 'drink') return false;
  if (e.kind === 'manual') return !e.isSupplement;
  if (e.kind === 'custom') return !(customFoods.get(e.customFoodId)?.isSupplement ?? false);
  return true;
}

/** Fasted days for one fast: from its start until the day before the first meal after it (or its end, or today). */
export function fastDays(fast: Fast, log: readonly LogEntry[], customFoods: ReadonlyMap<string, CustomFood>, today: string): string[] {
  let end = fast.endDay ?? today;
  const firstMeal = log
    .filter((e) => e.day >= fast.startDay && breaksFast(e, customFoods))
    .reduce<string | null>((min, e) => (min === null || e.day < min ? e.day : min), null);
  if (firstMeal !== null && addDays(firstMeal, -1) < end) end = addDays(firstMeal, -1);
  return end >= fast.startDay ? dayRange(fast.startDay, end) : [];
}

export function activeFast(fasts: readonly Fast[], log: readonly LogEntry[], customFoods: ReadonlyMap<string, CustomFood>, today: string): Fast | undefined {
  return fasts.find((f) => !f.endDay && f.startDay <= today && !log.some((e) => e.day >= f.startDay && breaksFast(e, customFoods)));
}

/**
 * First day the model runs from: the first day with an entry or a day status (a fast, "Leave out"…),
 * today when there is none. Not the day the profile was set up: days before the first log would count
 * as "nothing eaten" and pull every average down (owner's report, 2026-10-23, EPA + DHA after a week).
 */
export function firstModelDay(log: readonly LogEntry[], explicit: Readonly<Record<string, DayStatus>>, today: string): string {
  let first = today;
  for (const e of log) if (e.day < first) first = e.day;
  for (const d of Object.keys(explicit)) if (d < first) first = d;
  return first;
}

export function explicitDayStatus(records: readonly DayStatusRecord[], fasts: readonly Fast[], log: readonly LogEntry[], customFoods: ReadonlyMap<string, CustomFood>, today: string): Record<string, DayStatus> {
  const out: Record<string, DayStatus> = {};
  for (const f of fasts) for (const d of fastDays(f, log, customFoods, today)) out[d] = 'fasted';
  for (const r of records) out[r.day] = r.status; // an explicit status wins
  return out;
}

/** Time outside on one day beyond the routine: logged time outside, or an outside activity. */
export type ExtraSun = Pick<SunEntry, 'day' | 'startHour' | 'minutes' | 'skin'>;

export function sunSessionsFor(day: string, profile: Profile, extra: readonly ExtraSun[]): SunSession[] {
  const weekday = parseDay(day).getDay();
  const routine = profile.outdoorRoutine ?? [
    { weekdays: [0, 1, 2, 3, 4, 5, 6], startHour: sunParams.defaultRoutine.value.startHour, minutes: sunParams.defaultRoutine.value.minutesPerDay, skin: sunParams.defaultRoutine.value.skin },
  ];
  const sessions: SunSession[] = routine.filter((r) => r.weekdays.includes(weekday)).map((r) => ({ startHour: r.startHour, minutes: r.minutes, skin: r.skin }));
  for (const e of extra) if (e.day === day) sessions.push({ startHour: e.startHour, minutes: e.minutes, skin: e.skin });
  return sessions;
}

export const DEFAULT_LATITUDE = 51;

export function sunByDay(days: readonly string[], profile: Profile, extra: readonly ExtraSun[]): Record<string, Range> {
  const out: Record<string, Range> = {};
  for (const d of days) {
    const [y, m, day] = d.split('-').map(Number) as [number, number, number];
    out[d] = sunVitaminD({
      year: y,
      month: m,
      day,
      utcOffsetHours: utcOffsetHours(d),
      latitude: profile.latitude ?? DEFAULT_LATITUDE,
      sessions: sunSessionsFor(d, profile, extra),
    });
  }
  return out;
}

export function currentWeight(profile: Profile): number | undefined {
  const h = [...profile.weightHistory].sort((a, b) => a.day.localeCompare(b.day));
  return h[h.length - 1]?.kg;
}
