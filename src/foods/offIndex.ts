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
import { normalize } from './search';

export interface OffListing {
  code: string;
  name: string;
  brand: string;
  quantity: string;
}

export interface OffIndex {
  /** When the list was built (YYYY-MM-DD) and how many products it has, for the settings line. */
  date: string;
  /** Per row, the file's line ("barcode\tname\tbrand\tquantity"): one string each keeps memory low on a phone. */
  lines: string[];
  /** Per row: " <name and brand words>", normalized for search. */
  hay: string[];
}

export function parseOffIndex(text: string, date = ''): OffIndex {
  const lines: string[] = [];
  const hay: string[] = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const { code, name, brand } = listing(line);
    if (!code || !name) continue;
    lines.push(line);
    hay.push(` ${normalize(`${name} ${brand}`)}`);
  }
  return { date, lines, hay };
}

export function listing(line: string): OffListing {
  const [code = '', name = '', brand = '', quantity = ''] = line.split('\t');
  return { code, name, brand, quantity };
}

/** Enough matches to rank: the list is most-scanned first, so later matches are rarer products. */
const SCAN_LIMIT = 300;

/**
 * Products whose name or brand has every typed word at a word start ("pick up" → "PiCK UP! Choco"),
 * or that contain the typed words run together ("pickup"). Products named with the words lead those
 * found by brand alone; otherwise the most-scanned come first. `exclude`: barcodes already shown.
 */
export function searchOffIndex(index: OffIndex, query: string, opts: { limit?: number; exclude?: ReadonlySet<string> } = {}): OffListing[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const tokens = q.split(' ');
  const compact = q.replace(/ /g, '');
  const hits: Array<{ row: OffListing; score: number; at: number }> = [];
  for (let i = 0; i < index.hay.length && hits.length < SCAN_LIMIT; i++) {
    const words = index.hay[i]!;
    const line = index.lines[i]!;
    if (opts.exclude?.has(line.slice(0, line.indexOf('\t')))) continue;
    let score: number;
    if (tokens.every((t) => words.includes(` ${t}`))) score = 2;
    else if (runTogetherAtWordStart(words, compact)) score = 1;
    else continue;
    const row = listing(line);
    const name = ` ${normalize(row.name)}`;
    if (tokens.every((t) => name.includes(` ${t}`))) score += 1;
    if (name.startsWith(` ${tokens[0]}`)) score += 1;
    hits.push({ row, score, at: i });
  }
  hits.sort((a, b) => b.score - a.score || a.at - b.at);
  return hits.slice(0, opts.limit ?? 20).map((h) => h.row);
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
