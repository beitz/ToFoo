/**
 * Find packaged products by name without asking anyone: a list of the Open Food Facts products sold
 * in Germany (barcode, name, brand, pack size) ships with the app, built by scripts/off-products.py.
 * Open Food Facts' own name search does not answer browser apps (docs/OPEN_QUESTIONS.md), so typing
 * searches this list on the phone, and only picking a product sends its barcode, as a scan would.
 *
 * Parsing and search are pure and tested (offIndex.test.ts); loading takes `fetch` as a parameter.
 */
import { gunzipSync } from 'fflate';
import { OFF_INDEX } from './offIndexInfo';
import { normalize, withinOneEdit } from './search';

export interface OffListing {
  code: string;
  name: string;
  brand: string;
  quantity: string;
}

export interface OffIndex {
  /** When the list was built (YYYY-MM-DD). */
  date: string;
  /** Per row, the file's line ("barcode\tname\tbrand\tquantity"): one string each keeps memory low on a phone. */
  lines: string[];
  /** Per row: " <name words> | <brand words>", normalized for search. Rows are most-scanned first. */
  hay: string[];
}

/**
 * Like the food search's normalize, but "Wrigley's" becomes "wrigleys" (not "wrigley s"), so the
 * brand matches however it is typed.
 */
const prep = (s: string) => normalize(s.replace(/['’‘`´]/g, ''));

export function parseOffIndex(text: string, date = ''): OffIndex {
  const lines: string[] = [];
  const hay: string[] = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const { code, name, brand } = listing(line);
    if (!code || !name) continue;
    lines.push(line);
    hay.push(` ${prep(name)} | ${prep(brand)}`);
  }
  return { date, lines, hay };
}

export function listing(line: string): OffListing {
  const [code = '', name = '', brand = '', quantity = ''] = line.split('\t');
  return { code, name, brand, quantity };
}

/**
 * Matches ranked; more are only rarer products (the list is most-scanned first), and the cap keeps a
 * one-word search ("milch", thousands of hits) fast on a phone.
 */
const MAX_HITS = 1000;
/** Below this many hits, words one typo away count too ("wrigly"). */
const FEW_HITS = 3;
/** Typed words this long may be one typo off, or miss a last letter ("keks" for "Kekse"); shorter ones would match too much. */
const LONG_WORD = 4;

/**
 * Per typed word, how well it matched (tuned by feel; offIndex.test.ts pins the expected order). A
 * word start scores more the more of the word it covers, so "wrigley" for "Wrigleys" is nearly whole.
 */
const WORD = { name: 3, namePrefix: 2, brand: 2.5, brandPrefix: 1.5, runTogether: 1.5, typo: 1 };
/** Each name word nobody typed costs this much (up to EXTRA_MAX): "Milch" before "Milchreis Classic". */
const EXTRA_WORD = 0.12;
const EXTRA_MAX = 1;
/** Popularity adds up to this much: the most-scanned product of two equal matches comes first. */
const POPULARITY = 1.2;

/** How well `t` matches one word: whole word, word start, or (with `typos`) one edit off. */
function wordMatch(t: string, w: string, typos: boolean): 'word' | 'prefix' | 'typo' | null {
  // A word with one more letter is the same word: "wrigley" for "Wrigleys", "keks" for "Kekse".
  if (w === t || (t.length >= LONG_WORD && w.length === t.length + 1 && w.startsWith(t))) return 'word';
  if (w.startsWith(t)) return 'prefix';
  if (typos && t.length >= LONG_WORD && (withinOneEdit(t, w) || (w.length > t.length && withinOneEdit(t, w.slice(0, t.length))))) return 'typo';
  return null;
}

/** Relevance of one row whose words all matched; see the weights above. */
function relevance(hay: string, tokens: string[], at: number, total: number, typos: boolean): number {
  const bar = hay.indexOf(' | ');
  const nameWords = hay.slice(1, bar).split(' ').filter(Boolean);
  const brandWords = hay.slice(bar + 3).split(' ').filter(Boolean);
  const used = new Set<number>();
  let sum = 0;
  for (const t of tokens) {
    let best = 0;
    const score = (w: string, whole: number, start: number) => {
      const m = wordMatch(t, w, typos);
      if (m === 'word') return whole;
      if (m === 'prefix') return start + ((whole - start) * t.length) / w.length;
      return m === 'typo' ? WORD.typo : 0;
    };
    nameWords.forEach((w, k) => {
      const s = score(w, WORD.name, WORD.namePrefix);
      if (s) used.add(k);
      best = Math.max(best, s);
    });
    for (const w of brandWords) best = Math.max(best, score(w, WORD.brand, WORD.brandPrefix));
    sum += best || WORD.runTogether;
  }
  // Pack sizes and percentages ("1,5%", "50er") are not extra words.
  const extra = nameWords.filter((w, k) => !used.has(k) && !/\d/.test(w)).length;
  const popularity = 1 - Math.log10(at + 1) / Math.log10(total + 1);
  return sum / tokens.length - Math.min(EXTRA_MAX, EXTRA_WORD * extra) + POPULARITY * popularity;
}

/**
 * Products whose name or brand has every typed word at a word start ("wrigley pepp" → "Wrigley's
 * Extra Peppermint"), or that contain the typed words run together ("pickup" → "Pick Up"); when
 * that finds almost nothing, words one typo away too. Ranked by how well the words match (whole
 * words before word starts, the name before the brand, few other words), then by popularity.
 * `exclude`: barcodes already shown.
 */
export function searchOffIndex(index: OffIndex, query: string, opts: { limit?: number; exclude?: ReadonlySet<string> } = {}): OffListing[] {
  const q = prep(query);
  if (q.length < 2) return [];
  const tokens = q.split(' ');
  const compact = tokens.join('');
  const total = index.hay.length;
  const find = (typos: boolean) => {
    const hits: Array<{ at: number; score: number }> = [];
    for (let i = 0; i < total && hits.length < MAX_HITS; i++) {
      const words = index.hay[i]!;
      const found = typos
        ? tokens.every((t) => words.split(' ').some((w) => w !== '|' && wordMatch(t, w, true)))
        : tokens.every((t) => words.includes(` ${t}`)) || (startsAWord(words, compact) && runTogetherAtWordStart(words, compact));
      if (!found) continue;
      const line = index.lines[i]!;
      if (opts.exclude?.has(line.slice(0, line.indexOf('\t')))) continue;
      hits.push({ at: i, score: relevance(words, tokens, i, total, typos) });
    }
    return hits;
  };
  let hits = find(false);
  if (hits.length < FEW_HITS && tokens.some((t) => t.length >= LONG_WORD)) {
    const seen = new Set(hits.map((h) => h.at));
    hits = [...hits, ...find(true).filter((h) => !seen.has(h.at))];
  }
  hits.sort((a, b) => b.score - a.score || a.at - b.at);
  return hits.slice(0, opts.limit ?? 20).map((h) => listing(index.lines[h.at]!));
}

/** A quick test that rules out most rows before runTogetherAtWordStart: a word starts with compact's first two letters, maybe split ("5 gum"). */
function startsAWord(words: string, compact: string): boolean {
  const [a = '', b = ''] = compact;
  return words.includes(` ${a}${b}`) || words.includes(` ${a} ${b}`);
}

/** Whether `compact` (words run together) starts at a word start of `words`, spaces ignored: "pickup" in " pick up choco". */
function runTogetherAtWordStart(words: string, compact: string): boolean {
  for (let p = words.indexOf(' '); p !== -1; p = words.indexOf(' ', p + 1)) {
    let i = 0;
    for (let j = p + 1; j < words.length && i < compact.length; j++) {
      const c = words[j]!;
      if (c === ' ') continue;
      if (c !== compact[i]) break;
      i++;
    }
    if (i === compact.length) return true;
  }
  return false;
}

/** The file as text. gzip starts with 1f 8b; a server that already unpacked it sends plain text. */
export function decodeOffFile(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes);
}

let loading: Promise<OffIndex> | null = null;

/** The list, fetched once per app start (the service worker keeps the file for offline use). */
export function loadOffIndex(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<OffIndex> {
  loading ??= (async () => {
    const res = await fetchImpl(`${baseUrl}${OFF_INDEX.file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseOffIndex(decodeOffFile(new Uint8Array(await res.arrayBuffer())), OFF_INDEX.date);
  })();
  // A failed load (offline on first use) is tried again next time instead of staying failed.
  loading.catch(() => (loading = null));
  return loading;
}

/** True when every typed word starts a word of `name`: a real hit, not a typo-level one. */
export function wordStartsMatch(name: string, query: string): boolean {
  const words = ` ${normalize(name)}`;
  const tokens = normalize(query).split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => words.includes(` ${t}`));
}
