import type { Settings } from '../storage/types';

export interface Views {
  /** Energy and macros: rings (a calorie ring and four donuts) or bars (five cells). */
  macros: 'rings' | 'bars';
  /** Nutrient lists: comets (one line per nutrient with a trend tail) or bars (two columns). */
  nutrients: 'comets' | 'bars';
}

/**
 * How energy, macros and nutrient lists look, on Home and the nutrients page alike (owner, 2026-10-23).
 * Unset follows the earlier single "Home layout" choice: Lists meant bars for both.
 */
export function viewsOf(s: Pick<Settings, 'macroView' | 'nutrientView' | 'homeView'>): Views {
  const lists = s.homeView === 'compact';
  return { macros: s.macroView ?? (lists ? 'bars' : 'rings'), nutrients: s.nutrientView ?? (lists ? 'bars' : 'comets') };
}
