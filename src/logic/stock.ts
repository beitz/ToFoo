import type { Storage } from '../model/paramTypes';
import type { Batch } from '../storage/types';

/** The storage a portion is taken from when tapped: fresh on cooking day, then fridge, then freezer. */
export function nextStorage(b: Batch, today: string): Storage | null {
  if (b.remaining.fresh > 0 && b.cookedDay === today) return 'fresh';
  if (b.remaining.fridge > 0) return 'fridge';
  if (b.remaining.fresh > 0) return 'fridge'; // a "fresh" portion not eaten on cooking day was kept chilled
  if (b.remaining.freezer > 0) return 'freezer';
  return null;
}

export function totalLeft(b: Batch): number {
  return b.remaining.fresh + b.remaining.fridge + b.remaining.freezer;
}

/** The slot a portion is booked from: a fresh portion kept past cooking day is booked from "fresh" but modelled as fridge. */
export function bookingSlot(b: Batch, storage: Storage): Storage {
  return storage === 'fridge' && b.remaining.fridge === 0 && b.remaining.fresh > 0 ? 'fresh' : storage;
}
