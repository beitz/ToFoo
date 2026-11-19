/**
 * Common sizes of BLS foods ("1 medium apple = 182 g"), from USDA FoodData Central SR Legacy food
 * portions, matched to BLS foods of the same kind and shape at build time (scripts/portions.ts,
 * data/usda-portions.csv). Bundled: no network request. Only weights come from USDA; nutrients stay
 * BLS. The user's own saved portion sizes and piece weight always come first in the UI.
 */
import raw from './portions-usda.json';

export interface UsdaSize {
  /** "1 medium", "10 grapes", "½ large", "1 tbsp": the USDA measure, tidied (English, like food names). */
  label: string;
  /** Grams of the edible part. */
  grams: number;
  /** What the measure means, in centimetres: "7.5 cm across". */
  detail?: string;
}

export interface PortionsFile {
  source: string;
  url: string;
  licence: string;
  /** USDA foods (by FDC id, plus the mapping's filter when it has one): description and sizes. */
  usda: Record<string, { fdc: number; name: string; sizes: UsdaSize[] }>;
  /** BLS code → its key in `usda`, and a note key (portions.note.*) when one applies. */
  foods: Record<string, { usda: string; note?: string }>;
}

const file = raw as PortionsFile;

export interface CommonSizes {
  sizes: UsdaSize[];
  /** The USDA food the sizes are from, e.g. "Apples, raw, with skin". */
  usdaName: string;
  fdcId: number;
  /** i18n key suffix (portions.note.*) for a caveat, e.g. US egg sizes. */
  note?: string;
}

export const PORTIONS_SOURCE = { source: file.source, url: file.url, licence: file.licence };

/** Common sizes of a BLS food, or undefined when USDA has none that fit. */
export function commonSizes(code: string): CommonSizes | undefined {
  const ref = file.foods[code];
  const usda = ref ? file.usda[ref.usda] : undefined;
  if (!ref || !usda) return undefined;
  return { sizes: usda.sizes, usdaName: usda.name, fdcId: usda.fdc, ...(ref.note ? { note: ref.note } : {}) };
}

/** How many BLS foods have common sizes (for the About page and tests). */
export const commonSizeCount = (): number => Object.keys(file.foods).length;

/** The USDA page of the food the sizes come from. */
export const usdaFoodUrl = (fdcId: number) => `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`;

/** The count in a size's label: "10 grapes" → 10, "1 medium" → 1, "½ large" → 0.5. */
export function sizeCount(label: string): number {
  const m = /^(\d+(?:\.\d+)?|½|¼)\s/.exec(label);
  if (!m) return 1;
  return m[1] === '½' ? 0.5 : m[1] === '¼' ? 0.25 : Number(m[1]);
}

/** The weight of one piece by a size: "10 grapes 49 g" → 4.9 g; "½ large 166 g" → 166 g (one piece is the half). */
export function onePieceGrams(size: UsdaSize): number {
  const n = sizeCount(size.label);
  return n >= 1 ? Math.round((size.grams / n) * 100) / 100 : size.grams;
}

/** A size picked `n` times: "1 medium" ×2 → "2 × medium"; "10 grapes" ×2 → "2 × 10 grapes". */
export function sizeLabel(label: string, n: number): string {
  if (n <= 1) return label;
  return `${n} × ${label.replace(/^1 /, '')}`;
}

/** One line for the assistant: "common sizes (USDA, edible part): 1 small 149 g, 1 medium 182 g". */
export function sizesNote(code: string): string {
  const c = commonSizes(code);
  if (!c) return '';
  return ` | common sizes (USDA "${c.usdaName}", edible part): ${c.sizes.map((s) => `${s.label}${s.detail ? ` (${s.detail})` : ''} = ${s.grams} g`).join(', ')}${c.note === 'usEggSizes' ? ' (US egg sizes: US large ≈ EU size M)' : ''}`;
}
