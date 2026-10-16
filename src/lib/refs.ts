import type { FoodRef } from '../storage/types';

/** A stable key for a food reference (favourites, de-duplication). BLS keys leave out the version on purpose: a favourite survives a BLS update. */
export function refKey(ref: FoodRef): string {
  return ref.source === 'custom' ? `custom:${ref.id}` : `${ref.source}:${ref.code}`;
}
