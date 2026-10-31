import { useData } from '../../app/data';
import { foodSizes, type FoodSize, type SizeKind } from '../../foods/sizes';
import { t, type MessageKey } from '../../i18n';
import { fmtNumber } from '../../lib/format';
import { refKey } from '../../lib/refs';
import type { Product } from '../../storage/types';
import { usePieceWeight } from '../log/AmountField';

/** "420 g", "2.8 g", "500 ml". */
export const fmtSize = (grams: number, unit: string) => `${fmtNumber(grams, grams < 10 ? 1 : 0)} ${unit}`;

/** Grams of the food logged most recently (BLS code, or a product's id). */
function lastLogged(log: ReturnType<typeof useData>['log'], code: string): number | undefined {
  let best: { at: number; grams: number } | undefined;
  for (const e of log) {
    if (e.kind !== 'food' || !(e.grams > 0)) continue;
    const key = e.ref.source === 'BLS' ? e.ref.code : refKey(e.ref);
    if (key === code && (!best || e.time > best.at)) best = { at: e.time, grams: e.grams };
  }
  return best?.grams;
}

/**
 * The amounts a food's nutrients can be shown for besides 100 g (see foods/sizes.ts). `logged`:
 * offer the amount logged last time (the food page; an item page shows what was eaten already).
 */
export function useFoodSizes(code: string | undefined, product: Product | undefined, opts: { logged?: boolean; taken?: readonly number[] } = {}): FoodSize[] {
  const d = useData();
  const { sizes } = usePieceWeight(code ?? '', product);
  if (!code) return [];
  return foodSizes({ product, sizes, logged: opts.logged ? lastLogged(d.log, code) : undefined, taken: opts.taken });
}

const BUTTON: Record<SizeKind, MessageKey> = {
  pack: 'size.pack',
  serving: 'size.serving',
  logged: 'size.logged',
  saved: 'size.saved',
  piece: 'size.piece',
};

const HEADING: Record<SizeKind, MessageKey> = {
  pack: 'size.packHeading',
  serving: 'size.servingHeading',
  logged: 'size.loggedHeading',
  saved: 'size.savedHeading',
  piece: 'size.pieceHeading',
};

/** The switch's label: "Pack 420 g". */
export const sizeButton = (s: FoodSize, unit: string) => t(BUTTON[s.kind], { g: fmtSize(s.grams, unit), name: s.label ?? '' });

/** A heading: "One pack, 420 g". */
export const sizeHeading = (s: FoodSize, unit: string) => t(HEADING[s.kind], { g: fmtSize(s.grams, unit), name: s.label ?? '' });

/** The switch's layout for this many options: one row up to three, two rows of two for four, else three per row. */
export const switchClass = (options: number) => (options === 4 ? 'segmented-grid segmented-two' : options > 4 ? 'segmented-grid' : undefined);

/** A value for the switch: 'per100' or the size's place in the list ("size:0"). */
export const sizeValue = (i: number) => `size:${i}` as const;
export type SizeChoice = 'per100' | `size:${number}`;

export function chosenSize(sizes: readonly FoodSize[], choice: string): FoodSize | undefined {
  const m = /^size:(\d+)$/.exec(choice);
  return m ? sizes[Number(m[1])] : undefined;
}

const REMEMBER_KEY = 'tofoo.foodPage.size';

/** The kind of amount last picked on a food page, so the next pack opens on its pack too. */
export function rememberedKind(): SizeKind | 'per100' | undefined {
  try {
    const v = localStorage.getItem(REMEMBER_KEY);
    return v === 'per100' || (v && v in BUTTON) ? (v as SizeKind | 'per100') : undefined;
  } catch {
    return undefined;
  }
}

export function rememberKind(kind: SizeKind | 'per100') {
  try {
    localStorage.setItem(REMEMBER_KEY, kind);
  } catch {
    // Private window or blocked storage: the page just opens on 100 g next time.
  }
}
