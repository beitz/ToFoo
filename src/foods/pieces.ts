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
  // Found in the names and pack sizes of Open Food Facts products sold in Germany (2026-10-23).
  'stck',
  'kpl',
  'sztuk',
  'ct',
  'count',
  'packs?',
  'pk',
  'er',
  'kapseln',
  'capsules?',
  'caps',
  'pads',
  'comprimés',
  'barres?',
  'tranches?',
  'unités?',
  'pastillas?',
  'sobres?',
  'minis',
  'wraps?',
  'croissants?',
  'tortillas?',
  'galettes?',
  'gummies',
  'sheets?',
  'bags?',
  'dumplings?',
  'brownies?',
  'muffins?',
  'nuggets?',
  // German compounds: "Fischstäbchen", "Teebeutel", "Müsliriegel", "Lutschtabletten".
  `[${'a-zäöüß'}]*(?:tabletten|beutel|riegel|kekse|eier|scheiben|stäbchen|brötchen|waffeln|pralinen|würstchen|knödel|bällchen|klopse|kugeln|sticks|kapseln|bonbons|dragees)`,
].join('|');

/** A letter that may not follow or precede a piece word (so "st" does not match in "strong"). */
const L = 'a-zà-ÿß';
const NUM = '(\\d+(?:[.,]\\d+)?)';
// "60 pieces", "50pcs", "8-Pack", "15er", "x 12 Stück".
const COUNT_PART = `(?<![${L}\\d.,])${NUM}\\s*-?\\s*(?:x\\s*)?(?:${PIECE_WORDS})\\.?(?![${L}])`;
const COUNT = new RegExp(COUNT_PART, 'i');
const WEIGHT = new RegExp(`(?<![${L}\\d.,])${NUM}\\s*(kg|g|gr|grams?|gramm|ml|cl|l)\\.?(?![${L}])`, 'i');
/** A multipack: "10 x 1.5 g", "6*14g", "4 × 125 g". */
const MULTI = new RegExp(`(?<![${L}\\d.,])(\\d+)\\s*[x×*]\\s*${NUM}\\s*(kg|g|gr|grams?|gramm|ml|cl|l)\\.?(?![${L}])`, 'i');
/** Pieces with the weight of each: "10 Sticks a 2 g", "8 Riegel x 25 g", "2 Stück à 9,125 g", "10 barres de 18.5 g". */
const EACH = new RegExp(`${COUNT_PART}\\s*(?:a|à|á|x|×|je|zu|de|von|of)\\s*${NUM}\\s*(kg|g|gr|grams?|gramm|ml|cl|l)\\.?(?![${L}])`, 'i');

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
  // "2x 12 slices" is 24 slices.
  const times = m ? /(\d+)\s*[x×*]\s*$/i.exec(text!.slice(0, m.index)) : null;
  const n = m ? num(m[1]!) * (times ? Number(times[1]) : 1) : NaN;
  return n > 0 ? n : undefined;
}

/** Sanity limit for one piece, not a nutritional number: a piece heavier than this is a misread pack. */
export const MAX_PIECE_GRAMS = 1000;

const rounded = (g: number) => Math.round(g * 100) / 100;

/** One piece as the label text gives it: where it was read and the text it came from. */
export interface LabelPiece {
  grams: number;
  from: 'serving' | 'pack' | 'name';
  text: string;
}

type LabelText = Pick<ProductData, 'quantity' | 'serving'> & { name?: string };

/**
 * The weight of one piece from the product's own text, when it gives a count and a weight: the
 * serving ("2 pieces (2.8 g)"), a multipack ("10 x 1.5 g"), a pack that says both ("10 Dragees,
 * 14 g"), or the name's count with the pack's weight (name "Extra Peppermint 50 Stk", pack "70 g";
 * owner's find, 2026-10-23). Undefined when none does (most packs: "60 pieces" or "42 g" alone).
 */
export function labelPiece(p: LabelText): LabelPiece | undefined {
  const serving = p.serving?.label;
  if (serving) {
    const n = pieceCount(serving);
    // The serving's grams as the source gives them (Open Food Facts reads them from the same text).
    const g = p.serving!.grams;
    if (n && g > 0 && g / n <= MAX_PIECE_GRAMS) return { grams: rounded(g / n), from: 'serving', text: serving };
  }
  const pack = p.quantity;
  for (const [text, from] of [[pack, 'pack'], [p.name, 'name']] as const) {
    const each = text ? EACH.exec(text) : null;
    const g = each ? num(each[2]!) * (UNIT_FACTOR[each[3]!.toLowerCase()] ?? NaN) : NaN;
    if (g > 0 && g <= MAX_PIECE_GRAMS) return { grams: rounded(g), from, text: text! };
  }
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
  // The count or the weight in the name: "Extra Peppermint 50 Stk", "Riegel 5 x 25 g".
  const name = p.name;
  if (name) {
    const multi = MULTI.exec(name);
    if (multi) {
      const g = num(multi[2]!) * (UNIT_FACTOR[multi[3]!.toLowerCase()] ?? NaN);
      if (g > 0 && g <= MAX_PIECE_GRAMS) return { grams: rounded(g), from: 'name', text: name };
    }
    // One of the two from the name, the other from the pack, or both from the name.
    const n = pieceCount(name) ?? pieceCount(pack);
    const g = (pack ? weightIn(pack) : undefined) ?? weightIn(name);
    if (n && g && g / n <= MAX_PIECE_GRAMS) return { grams: rounded(g / n), from: 'name', text: pack ? `${name} · ${pack}` : name };
  }
  return undefined;
}

/** What the pack (or the name) says to start the user off with: its weight and how many pieces, each if known. */
export function packHints(p: (Pick<ProductData, 'quantity'> & { name?: string }) | undefined): { grams?: number; count?: number } {
  const pack = p?.quantity && !MULTI.test(p.quantity) ? p.quantity : undefined;
  const name = p?.name && !MULTI.test(p.name) ? p.name : undefined;
  const grams = (pack ? weightIn(pack) : undefined) ?? (name ? weightIn(name) : undefined);
  const count = (pack ? pieceCount(pack) : undefined) ?? (name ? pieceCount(name) : undefined);
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

export function pieceWeight(sizes: readonly PortionSize[] | undefined, product: LabelText | undefined): PieceWeight | undefined {
  const own = savedPiece(sizes);
  if (own) return { grams: own, from: 'yours' };
  const label = product ? labelPiece(product) : undefined;
  return label ? { grams: label.grams, from: label.from, text: label.text } : undefined;
}

/** Grams of a number of pieces, to a tenth of a gram. */
export const piecesToGrams = (pieces: number, piece: number) => Math.round(pieces * piece * 10) / 10;
