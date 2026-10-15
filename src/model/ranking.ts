/**
 * "Foods that fill your gaps": rank single foods by how much of the urgent gaps one portion closes,
 * without pushing any nutrient over its upper limit.
 */
import { nutrientParams } from '../../model/parameters';
import type { ResolvedRequirements } from './requirements';
import type { NutrientResult } from './simulate';
import type { RawValue } from './types';

export interface RankCandidate {
  key: string;
  per100: Readonly<Record<string, RawValue>>;
}

export interface RankedFood {
  key: string;
  grams: number;
  score: number;
  /** Nutrients this portion helps with, best first. */
  helps: Array<{ id: string; coverage: number }>;
}

/** Portion used for ranking: about 300 kcal, between 30 g and 200 g. */
export const RANK_PORTION = { kcal: 300, minGrams: 30, maxGrams: 200 };
const URGENCY = { low: 2, gettingLow: 1 } as const;

export function portionGrams(per100: Readonly<Record<string, RawValue>>): number {
  const kcal = typeof per100.ENERCC === 'number' ? per100.ENERCC : 0;
  const g = kcal > 0 ? (RANK_PORTION.kcal / kcal) * 100 : RANK_PORTION.maxGrams;
  return Math.min(RANK_PORTION.maxGrams, Math.max(RANK_PORTION.minGrams, g));
}

export function rankFoods(
  candidates: readonly RankCandidate[],
  results: ReadonlyMap<string, NutrientResult>,
  req: ResolvedRequirements,
  limit = 20,
): RankedFood[] {
  const urgent: Array<{ id: string; weight: number; need: number }> = [];
  const tooHigh = new Set<string>();
  const ulRoom = new Map<string, { basis: string; room: number }>();
  for (const [id, r] of results) {
    const reqs = req.byNutrient.get(id);
    if (!reqs || r.kind === 'info' || r.kind === 'limit' || id === 'ENERCC') {
      if (r.status === 'tooHigh') tooHigh.add(id);
      continue;
    }
    if (r.status === 'low' || r.status === 'gettingLow') urgent.push({ id, weight: URGENCY[r.status], need: reqs.physiological });
    if (r.status === 'tooHigh') tooHigh.add(id);
    const ul = reqs.upperLimit;
    if (ul && ul.scope === 'all') {
      const used = (r.ulRatio ?? 0) * ul.value;
      ulRoom.set(id, { basis: ul.basis, room: Math.max(0, ul.value - used) });
    }
  }
  if (urgent.length === 0) return [];

  const ranked: RankedFood[] = [];
  for (const c of candidates) {
    const grams = portionGrams(c.per100);
    let score = 0;
    const helps: RankedFood['helps'] = [];
    for (const u of urgent) {
      const v = c.per100[u.id];
      if (typeof v !== 'number' || v <= 0 || u.need <= 0) continue;
      const f = nutrientParams[u.id]?.typicalAbsorption.value ?? 1;
      const coverage = Math.min(1, ((v * grams) / 100) * f / u.need);
      if (coverage < 0.05) continue;
      score += u.weight * coverage;
      helps.push({ id: u.id, coverage });
    }
    if (score <= 0) continue;
    // Never suggest a portion that alone would exceed the remaining room under an upper limit.
    let blocked = false;
    for (const { basis, room } of ulRoom.values()) {
      const v = c.per100[basis];
      if (typeof v === 'number' && (v * grams) / 100 > room) blocked = true;
    }
    if (blocked) continue;
    // Foods rich in something already too high are pushed down.
    for (const id of tooHigh) {
      const v = c.per100[id];
      const r = req.byNutrient.get(id);
      if (typeof v === 'number' && r && r.recommended > 0 && (v * grams) / 100 / r.recommended > 0.2) score *= 0.3;
    }
    helps.sort((a, b) => b.coverage - a.coverage);
    ranked.push({ key: c.key, grams, score, helps });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}
