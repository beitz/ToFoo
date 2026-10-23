import type { Settings } from '../storage/types';

export interface Views {
  /** Energy and macros: bars (five cells) or rings (a calorie ring and four donuts). */
  macros: 'rings' | 'bars';
  /** Nutrient lists: bars (two columns) or comets (one line per nutrient with a trend tail). */
  nutrients: 'comets' | 'bars';
}

/**
 * How energy, macros and nutrient lists look, on Home and the nutrients page alike (owner, 2026-10-23).
 * Bars unless chosen otherwise (owner's pick, 2026-10-23); the earlier single "Home layout" no longer counts.
 */
export function viewsOf(s: Pick<Settings, 'macroView' | 'nutrientView'>): Views {
  return { macros: s.macroView ?? 'bars', nutrients: s.nutrientView ?? 'bars' };
}
