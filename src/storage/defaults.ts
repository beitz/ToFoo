import { DEFAULT_FEATURES } from '../settings/features';
import { CURRENT_SCHEMA_VERSION, type Profile, type Settings, type StoragePlan } from './types';

/** Global default storage plan: 1 fresh, 1 fridge (next day), rest frozen (docs/SPEC.md). */
export const GLOBAL_DEFAULT_PLAN: StoragePlan = { fresh: 1, fridge: 1, freezer: null };

export function defaultProfile(today: string): Profile {
  return {
    id: 'profile',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    weightHistory: [],
    salt: { iodised: true, fluoridated: false },
    exclusions: { groups: [], foods: [] },
    startingLevel: 'average',
    modelStartDay: today,
    onboarded: false,
  };
}

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    features: { ...DEFAULT_FEATURES },
    hiddenNutrients: [],
    mealWindowMinutes: 120,
    shortWindowDays: 7,
    longWindowDays: 14,
    theme: 'system',
    // A new install has seen no tours yet (older installs have no list and count as all seen).
    toursSeen: [],
    backupReminderDays: 14,
    defaultPlan: GLOBAL_DEFAULT_PLAN,
  };
}

/** Resolve a plan to whole portions for a recipe with `portions` portions. */
export function resolvePlan(plan: StoragePlan, portions: number): { fresh: number; fridge: number; freezer: number } {
  const fresh = Math.min(plan.fresh, portions);
  const fridge = Math.min(plan.fridge, portions - fresh);
  const freezer = plan.freezer === null ? portions - fresh - fridge : Math.min(plan.freezer, portions - fresh - fridge);
  return { fresh, fridge, freezer: Math.max(0, freezer) };
}
