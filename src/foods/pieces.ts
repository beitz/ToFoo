/**
 * Pieces of a food ("one piece of chewing gum", "2 bars"): how much one weighs. Pure, tested in
 * pieces.test.ts.
 *
 * Neither Open Food Facts nor USDA has a field for the number of pieces in a pack (checked
 * 2026-10-23). What they do have is text: the pack size as printed ("60 pieces", "42 g", now and
 * then "10 x 1.5 g") and the serving ("2 pieces (2.8 g)", USDA "2 PIECES (3 g)"). A piece weight is
 * read from that text only when it gives both a count of pieces and a weight; otherwise the user
 * types it once (or the pack's weight and count, and the app divides), and it is kept as one of the
 * food's saved portion sizes, so it is in backups.
 */
import type { PortionSize } from '../storage/types';
import type { ProductData } from './openFoodFacts';

/**
 * Words that count pieces on labels, in the languages Open Food Facts mostly has in Germany (EN,
 * DE, FR, NL, IT, ES). Measures (cup, tbsp, portion, serving) are left out: they are amounts, not
 * pieces.
 */
const PIECE_WORDS = [
  'pieces?',
  'pcs?',
  'pce',
  'st(?:ü|ue)cke?',
  'stk',
  'st',
  'dragees?',
  'dragées?',
  'bars?',
  'riegel',
  'sticks?',
  'streifen',
  'tablets?',
  'tabletten?',
  'pastill(?:es?|en)',
  'bonbons?',
  'sweets?',
  'cand(?:y|ies)',
  'cookies?',
  'biscuits?',
  'kekse?',
  'crackers?',
  'pralin(?:es?|en)',
  'balls?',
  'kugeln?',
  'eggs?',
  'eier',
  'slices?',
  'scheiben?',
  'sachets?',
  'beutel',
  'pods?',
  'gums?',
  'kaugummis?',
  'squares?',
  'fingers?',
  'mints?',
  'units?',
  'pi(?:è|e)ces?',
  'stuks?',
  'pezzi',
  'piezas?',
  'unidades?',
].join('|');

/** A letter that may not follow or precede a piece word (so "st" does not match in "strong"). */
const L = 'a-zà-ÿß';
const NUM = '(\\d+(?:[.,]\\d+)?)';
const COUNT = new RegExp(`(?<![${L}\\d.,])${NUM}\\s*(?:x\\s*)?(?:${PIECE_WORDS})\\.?(?![${L}])`, 'i');
const WEIGHT = new RegExp(`(?<![${L}\\d.,])${NUM}\\s*(kg|g|gr|grams?|gramm|ml|cl|l)\\.?(?![${L}])`, 'i');
/** A multipack: "10 x 1.5 g", "6*14g", "4 × 125 g". */
const MULTI = new RegExp(`(?<![${L}\\d.,])(\\d+)\\s*[x×*]\\s*${NUM}\\s*(kg|g|gr|grams?|gramm|ml|cl|l)\\.?(?![${L}])`, 'i');

const UNIT_FACTOR: Record<string, number> = { kg: 1000, g: 1, gr: 1, gram: 1, grams: 1, gramm: 1, ml: 1, cl: 10, l: 1000 };

const num = (s: string) => Number(s.replace(',', '.'));

/** Grams (ml for drinks) in a piece of text, e.g. "2.8 g" → 2.8, "0,5 l" → 500. */
function weightIn(text: string): number | undefined {
  const m = WEIGHT.exec(text);
  if (!m) return undefined;
  const v = num(m[1]!) * (UNIT_FACTOR[m[2]!.toLowerCase()] ?? NaN);
  return v > 0 ? v : undefined;
}

/** How many pieces a text counts: "60 pieces" → 60, "10 Dragees" → 10; undefined if it counts none. */
export function pieceCount(text: string | undefined): number | undefined {
  const m = text ? COUNT.exec(text) : null;
  const n = m ? num(m[1]!) : NaN;
  return n > 0 ? n : undefined;
}

/** Sanity limit for one piece, not a nutritional number: a piece heavier than this is a misread pack. */
export const MAX_PIECE_GRAMS = 1000;

const rounded = (g: number) => Math.round(g * 100) / 100;

/** One piece as the label text gives it: where it was read and the text it came from. */
export interface LabelPiece {
  grams: number;
  from: 'serving' | 'pack';
  text: string;
}

/**
 * The weight of one piece from the product's own text, when it gives a count and a weight: the
 * serving ("2 pieces (2.8 g)"), a multipack ("10 x 1.5 g"), or a pack that says both ("10 Dragees,
 * 14 g"). Undefined when it does not (most packs: "60 pieces" or "42 g" alone).
 */
export function labelPiece(p: Pick<ProductData, 'quantity' | 'serving'>): LabelPiece | undefined {
  const serving = p.serving?.label;
  if (serving) {
    const n = pieceCount(serving);
    // The serving's grams as the source gives them (Open Food Facts reads them from the same text).
    const g = p.serving!.grams;
    if (n && g > 0 && g / n <= MAX_PIECE_GRAMS) return { grams: rounded(g / n), from: 'serving', text: serving };
  }
  const pack = p.quantity;
  if (pack) {
    const multi = MULTI.exec(pack);
    if (multi) {
      const g = num(multi[2]!) * (UNIT_FACTOR[multi[3]!.toLowerCase()] ?? NaN);
      if (g > 0 && g <= MAX_PIECE_GRAMS) return { grams: rounded(g), from: 'pack', text: pack };
    }
    const n = pieceCount(pack);
    const g = weightIn(pack);
    if (n && g && g / n <= MAX_PIECE_GRAMS) return { grams: rounded(g / n), from: 'pack', text: pack };
  }
  return undefined;
}

/** What the pack says to start the user off with: its weight and how many pieces, each if known. */
export function packHints(p: Pick<ProductData, 'quantity'> | undefined): { grams?: number; count?: number } {
  const pack = p?.quantity;
  if (!pack || MULTI.test(pack)) return {};
  const grams = weightIn(pack);
  const count = pieceCount(pack);
  return { ...(grams ? { grams } : {}), ...(count ? { count } : {}) };
}

/** The piece weight the user saved among a food's portion sizes. */
export const savedPiece = (sizes: readonly PortionSize[] | undefined): number | undefined => sizes?.find((s) => s.piece)?.grams;

/** A food's portion sizes with the piece weight set (or taken out, for undefined); other sizes stay. */
export function withPiece(sizes: readonly PortionSize[] | undefined, grams: number | undefined, label: string): PortionSize[] {
  const rest = (sizes ?? []).filter((s) => !s.piece);
  return grams && grams > 0 ? [...rest, { label, grams: rounded(grams), piece: true }] : rest;
}

/** One piece of a food: the user's own weight wins over the label's. */
export interface PieceWeight {
  grams: number;
  from: 'yours' | LabelPiece['from'];
  /** The label text it was read from. */
  text?: string;
}

export function pieceWeight(sizes: readonly PortionSize[] | undefined, product: Pick<ProductData, 'quantity' | 'serving'> | undefined): PieceWeight | undefined {
  const own = savedPiece(sizes);
  if (own) return { grams: own, from: 'yours' };
  const label = product ? labelPiece(product) : undefined;
  return label ? { grams: label.grams, from: label.from, text: label.text } : undefined;
}

/** Grams of a number of pieces, to a tenth of a gram. */
export const piecesToGrams = (pieces: number, piece: number) => Math.round(pieces * piece * 10) / 10;
