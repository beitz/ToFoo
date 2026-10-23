/**
 * Fast fuzzy food search, "like a search engine": English names weigh more than German ones,
 * word starts beat substrings, short names beat long ones, recently used foods rise, and small
 * typos are forgiven. Tuned by feel; see search.test.ts for the expected behaviour.
 */

export interface SearchItem {
  key: string;
  nameEn: string;
  nameDe: string;
}

interface Indexed {
  item: SearchItem;
  en: string;
  de: string;
  enWords: string[];
  deWords: string[];
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%.]+/g, ' ')
    .trim();
}

const words = (s: string) => s.split(' ').filter(Boolean);

export interface SearchIndex {
  items: Indexed[];
}

export function buildIndex(items: readonly SearchItem[]): SearchIndex {
  return {
    items: items.map((item) => {
      const en = normalize(item.nameEn);
      const de = normalize(item.nameDe);
      return { item, en, de, enWords: words(en), deWords: words(de) };
    }),
  };
}

/** Damerau-free edit distance ≤ 1 check (substitution, insertion, deletion). */
export function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Very light English/German plural stemming. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && (w.endsWith('s') || w.endsWith('n'))) return w.slice(0, -1);
  return w;
}

/** Score one query token against a name's words (0 = no match). */
function tokenScore(token: string, ws: string[], full: string, isLast: boolean): number {
  let best = 0;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    const pos = i === 0 ? 1.1 : 1; // first word of the name is the main food
    let s = 0;
    const next = ws[i + 1];
    if (w === token) s = 12;
    else if (stem(w) === stem(token)) s = 10; // oats ↔ oat
    else if (w.startsWith(token)) s = isLast ? 7 : 5;
    else if (next && token.length >= 5 && (w + next).startsWith(token)) s = 11; // "haferflocken" ↔ "Hafer Flocken"
    else if (token.length >= 4 && w.includes(token)) s = 4; // compound words: "vollkornbrot" ∋ "brot"
    else if (token.length >= 4 && (withinOneEdit(token, w) || (w.length > token.length && withinOneEdit(token, w.slice(0, token.length))))) s = 3;
    best = Math.max(best, s * pos);
  }
  if (best === 0 && token.length >= 3 && full.includes(token)) best = 2;
  return best;
}

/** Words that describe a state or preparation, not a different food. */
const PLAIN_WORDS = new Set(
  'raw boiled cooked fresh dried whole stewed steamed baked fried roasted mature peeled canned drained deep frozen pasteurised ultra heated unsweetened natural plain fat roh gekocht frisch getrocknet gedunstet gebraten gebacken reif geschalt'.split(' '),
);

function nameScore(tokens: string[], ws: string[], full: string): number {
  let total = 0;
  for (let i = 0; i < tokens.length; i++) {
    const s = tokenScore(tokens[i]!, ws, full, i === tokens.length - 1);
    if (s === 0) return 0; // every token must match
    total += s;
  }
  // Prefer plain foods ("Apple raw") over products and dishes ("Apple pie with …").
  const rest = ws.filter((w) => !tokens.some((t) => w.startsWith(t) || stem(w) === stem(t)) && !/^[0-9.%]+$/.test(w));
  const plain = rest.every((w) => PLAIN_WORDS.has(w)) ? 1.4 : 1;
  return total * plain * (1 + 2 / (2 + ws.length));
}

export interface SearchOptions {
  limit?: number;
  /** key → recency boost (e.g. 1 for most recent, decaying). */
  recent?: ReadonlyMap<string, number>;
  /** key → extra multiplier, e.g. to push raw/plain foods. */
  boost?: (key: string) => number;
}

export function search(index: SearchIndex, query: string, opts: SearchOptions = {}): SearchItem[] {
  const q = normalize(query);
  const limit = opts.limit ?? 30;
  if (!q) return [];
  const tokens = words(q);
  const scored: Array<{ item: SearchItem; score: number }> = [];
  for (const it of index.items) {
    const en = nameScore(tokens, it.enWords, it.en);
    const de = nameScore(tokens, it.deWords, it.de) * 0.8;
    let score = Math.max(en, de);
    if (score === 0) continue;
    const r = opts.recent?.get(it.item.key);
    if (r) score *= 1 + 0.6 * r;
    if (opts.boost) score *= opts.boost(it.item.key);
    scored.push({ item: it.item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.nameEn.length - b.item.nameEn.length);
  return scored.slice(0, limit).map((s) => s.item);
}

const singular = (w: string) => (w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.slice(0, -1));

/**
 * Loose search for matching a product to a similar food: tokens may go unmatched, and a name
 * scores by how many of them it covers (squared, so covering most of them wins over one exact
 * word). Used where the query is a category or product name, not something the user typed.
 */
export function looseSearch(index: SearchIndex, query: string, opts: { limit?: number; boost?: (key: string) => number } = {}): Array<{ key: string; score: number }> {
  const tokens = words(normalize(query));
  if (!tokens.length) return [];
  const scored: Array<{ key: string; score: number; len: number }> = [];
  for (const it of index.items) {
    let total = 0;
    let hits = 0;
    for (let i = 0; i < tokens.length; i++) {
      // Product names mix languages, so each word may hit the English or the German name.
      // Category names are plural ("Chocolates"); typo-level hits are left out ("candies" is not "candied").
      const tok = tokens[i]!;
      const last = i === tokens.length - 1;
      // A hit worth counting always shares the first three letters; checking that first keeps this fast.
      const head = tok.slice(0, 3);
      if (!it.en.includes(head) && !it.de.includes(head)) continue;
      const forms = tok.length > 3 && tok.endsWith('s') ? [tok, singular(tok)] : [tok];
      let s = 0;
      for (const f of forms) s = Math.max(s, tokenScore(f, it.enWords, it.en, last), 0.8 * tokenScore(f, it.deWords, it.de, last));
      if (s < 4) continue;
      hits++;
      total += s;
    }
    if (!hits) continue;
    const covered = hits / tokens.length;
    const rest = it.enWords.filter((w) => !tokens.some((t) => w.startsWith(t) || stem(w) === stem(t)) && !/^[0-9.%]+$/.test(w));
    const plain = rest.every((w) => PLAIN_WORDS.has(w)) ? 1.4 : 1;
    let score = total * covered * covered * plain * (1 + 2 / (2 + it.enWords.length));
    if (opts.boost) score *= opts.boost(it.item.key);
    scored.push({ key: it.item.key, score, len: it.item.nameEn.length });
  }
  scored.sort((a, b) => b.score - a.score || a.len - b.len);
  return scored.slice(0, opts.limit ?? 30).map(({ key, score }) => ({ key, score }));
}
