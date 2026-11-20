/** Water (docs/SPEC.md, "Water"): pure helpers. */
import { waterGuide } from '../../model/reference-values';
import { AGE_GROUPS, type AgeGroup } from '../model/paramTypes';
import type { ModelEntry } from '../model/types';
import type { Food } from '../foods/foodDb';
import type { CustomFood, FoodRef, WaterRecord } from '../storage/types';
import { foodForRef, partFromFood, type ResolveContext } from './resolve';
import { spreadDays } from './spread';

export interface DayWater {
  /** Plain water logged as water (ml). */
  plainMl: number;
  /** Water in logged foods and other drinks, from the BLS water content (g ≈ ml). */
  foodMl: number;
  totalMl: number;
  /** Logged items whose water is unknown (no water value, or tea/coffee without an amount): the total is a minimum. */
  unknown: number;
}

/** Water from drinks and food on one day. Missing water values are counted, not taken as zero. */
export function dayWater(day: string, entries: readonly ModelEntry[], water: readonly WaterRecord[]): DayWater {
  const plainMl = water.filter((w) => w.day === day).reduce((sum, w) => sum + w.ml, 0);
  let foodMl = 0;
  let unknown = 0;
  for (const e of entries) {
    // Plain water's minerals: its water is the record's, counted above.
    if (e.dayKey !== day || e.water) continue;
    if (e.parts.length === 0) {
      // Manual entries and saved items list nutrients only; a tea/coffee mark has no amount. Supplements hold no water worth counting.
      if (!e.isSupplement || e.modifiers) unknown++;
      continue;
    }
    for (const p of e.parts) {
      const w = p.per100.WATER;
      if (w === null || w === undefined) unknown++;
      else if (w !== 't') foodMl += (p.grams * w) / 100;
    }
  }
  return { plainMl, foodMl, totalMl: plainMl + foodMl, unknown };
}

/** The DGE guide value to compare with: water from drinks and from food (oxidation water is not logged). */
export function waterTarget(group: AgeGroup): number {
  const i = AGE_GROUPS.indexOf(group);
  return (waterGuide.drinks[i] ?? waterGuide.drinks[1]) + (waterGuide.food[i] ?? waterGuide.food[1]);
}

/** Most plain water in one entry (a large bottle is 1.5 l); more is a typo. */
export const MAX_WATER_ML = 3000;

/**
 * Minerals a bottled water's label lists (Mineral- und Tafelwasser-Verordnung: mg per litre), as the
 * model's nutrients: `factor` turns mg into the model's unit (fluoride is in µg, like the BLS).
 * Sulfate and bicarbonate are on labels too, but no reference value uses them.
 */
export const LABEL_MINERALS = [
  { id: 'CA', factor: 1 },
  { id: 'MG', factor: 1 },
  { id: 'NA', factor: 1 },
  { id: 'K', factor: 1 },
  { id: 'CLD', factor: 1 },
  { id: 'FD', factor: 1000 },
] as const;

export type LabelMineral = (typeof LABEL_MINERALS)[number]['id'];

/** Label values (mg per litre; a mineral left out is not on the label) as a custom food's nutrients per litre. */
export function labelNutrients(mgPerLitre: Partial<Record<LabelMineral, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of LABEL_MINERALS) {
    const v = mgPerLitre[m.id];
    if (v !== undefined && Number.isFinite(v) && v >= 0) out[m.id] = v * m.factor;
  }
  return out;
}

/** A label water's values back in mg per litre, for its form. */
export function labelValues(cf: Pick<CustomFood, 'nutrients' | 'servingGrams'>): Partial<Record<LabelMineral, number>> {
  const perLitre = 1000 / (cf.servingGrams ?? 1000);
  const out: Partial<Record<LabelMineral, number>> = {};
  for (const m of LABEL_MINERALS) {
    const v = cf.nutrients[m.id];
    if (v !== undefined) out[m.id] = (v * perLitre) / m.factor;
  }
  return out;
}

/** A custom food holding a water's label values (per litre). */
export function labelWater(id: string, name: string, mgPerLitre: Partial<Record<LabelMineral, number>>, now: number): CustomFood {
  return { id, schemaVersion: 1, name: name.trim(), isSupplement: false, servingLabel: '1 l', servingGrams: 1000, nutrients: labelNutrients(mgPerLitre), confidence: 'B', createdAt: now, water: true };
}

/**
 * Most energy a water may have: one with juice, sugar or flavour added is a drink, logged as a food.
 * The same line as the plain teas and coffees (src/logic/drinks.ts: 0–2 kcal per 100 g in the BLS).
 */
export const WATER_MAX_KCAL = 2;

/** True when a food can be a container's water: no energy to speak of (unknown energy is let through). */
export function canBeWater(food: Pick<Food, 'per100'>): boolean {
  const kcal = food.per100.ENERCC;
  return kcal === null || kcal === undefined || kcal === 't' || kcal <= WATER_MAX_KCAL;
}

/**
 * Plain water of a known kind as the nutrient model counts it: its minerals, as a meal of its own
 * (`water`), with ids `water:<record id>`; a container finished over several days one part per day,
 * like the food log's (src/logic/spread.ts). Water without a kind, or whose food is gone, adds none.
 */
export function waterEntries(records: readonly WaterRecord[], ctx: ResolveContext, nameOf: (ref: FoodRef) => string | undefined): ModelEntry[] {
  const out: ModelEntry[] = [];
  for (const r of records) {
    if (!r.water || !(r.ml > 0)) continue;
    const whole = waterEntry(r, r.water, ctx, nameOf);
    if (!whole) continue;
    if (r.from === undefined || !(r.time > r.from)) {
      out.push(whole);
      continue;
    }
    for (const p of spreadDays(r.from, r.time)) {
      out.push({
        ...whole,
        id: `${whole.id}@${p.day}`,
        time: p.time,
        dayKey: p.day,
        spread: true,
        parts: whole.parts.map((part) => ({ ...part, grams: part.grams * p.share })),
        ...(whole.direct ? { direct: scale(whole.direct, p.share) } : {}),
      });
    }
  }
  return out;
}

function waterEntry(r: WaterRecord, ref: FoodRef, ctx: ResolveContext, nameOf: (ref: FoodRef) => string | undefined): ModelEntry | undefined {
  const base = { id: `water:${r.id}`, time: r.time, dayKey: r.day, confidence: 'B' as const, isSupplement: false, water: true };
  if (ref.source === 'custom') {
    const cf = ctx.customFoods.get(ref.id);
    if (!cf) return undefined;
    return { ...base, label: cf.name, parts: [], direct: scale(cf.nutrients, r.ml / (cf.servingGrams ?? 1000)) };
  }
  const food = foodForRef(ref, ctx);
  if (!food) return undefined;
  return { ...base, label: nameOf(ref) ?? food.nameEn, parts: [partFromFood(food, r.ml, 'asListed', 'fresh')] };
}

function scale(values: Readonly<Record<string, number>>, f: number): Record<string, number> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v * f]));
}

/**
 * Calcium and magnesium (the minerals that matter in water) from plain water on one day, as eaten
 * (before absorption); a nutrient no water there lists is left out.
 */
export function dayWaterMinerals(day: string, entries: readonly ModelEntry[]): Partial<Record<'CA' | 'MG', number>> {
  const out: Partial<Record<'CA' | 'MG', number>> = {};
  for (const e of entries) {
    if (!e.water || e.dayKey !== day) continue;
    for (const id of ['CA', 'MG'] as const) {
      let v = e.direct?.[id];
      for (const p of e.parts) {
        const per = p.per100[id];
        if (typeof per === 'number') v = (v ?? 0) + (p.grams * per) / 100;
      }
      if (v !== undefined) out[id] = (out[id] ?? 0) + v;
    }
  }
  return out;
}
