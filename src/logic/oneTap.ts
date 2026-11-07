/**
 * What one tap on a kitchen tile in Log meal adds (owner's pick, 2026-11-07: "one tap should just
 * add one", with the amount shown next to Undo). Pure; tested in oneTap.test.ts.
 */
import type { PieceUnits } from './pantry';

/** One of something, in grams, and what it is called in the toast. */
export interface OneOf {
  grams: number;
  /** Set when it is one piece, so the entry keeps the count and At home takes one off. */
  pieces?: 1;
  /** piece: its known piece weight; pack: the label's pack weight; last: the amount logged last time; serving: the label's serving. */
  what: 'piece' | 'pack' | 'last' | 'serving';
}

/**
 * One of a food at home: one piece when a piece weighs a known amount (an egg, a yogurt, a piece of
 * gum); a whole pack when it is counted in packs at home and the label gives the pack's weight (a
 * pizza); else what was logged of it last time (oats); else one serving from the label. Undefined
 * when none is known: the tap then opens the amount sheet, once.
 */
export function oneOf({ countedInPieces, units, lastGrams, servingGrams }: { countedInPieces: boolean; units?: PieceUnits; lastGrams?: number; servingGrams?: number }): OneOf | undefined {
  if (units?.piece && units.piece > 0) return { grams: units.piece, pieces: 1, what: 'piece' };
  if (countedInPieces && units?.pack && units.pack > 0) return { grams: units.pack, what: 'pack' };
  if (lastGrams && lastGrams > 0) return { grams: lastGrams, what: 'last' };
  if (servingGrams && servingGrams > 0) return { grams: servingGrams, what: 'serving' };
  return undefined;
}
