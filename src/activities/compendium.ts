/**
 * The 2024 Adult Compendium of Physical Activities (data/README.md): 1,111 activities with their MET
 * value, bundled like the BLS for foods. An activity record keeps only the row's code (rule 5).
 */
import file from './compendium-2024.json';

export interface CompendiumActivity {
  /** Five digits; the first two are the major heading. */
  code: string;
  met: number;
  description: string;
  heading: string;
}

/** Major headings by the first two digits of the code, as the Compendium names them. */
const HEADINGS: Record<string, string> = {
  '01': 'Bicycling',
  '02': 'Conditioning exercise',
  '03': 'Dancing',
  '04': 'Fishing and hunting',
  '05': 'Home activities',
  '06': 'Home repair',
  '07': 'Inactivity',
  '08': 'Lawn and garden',
  '09': 'Miscellaneous',
  '10': 'Music playing',
  '11': 'Occupation',
  '12': 'Running',
  '13': 'Self care',
  '14': 'Sexual activity',
  '15': 'Sports',
  '16': 'Transportation',
  '17': 'Walking',
  '18': 'Water activities',
  '19': 'Winter activities',
  '20': 'Religious activities',
  '21': 'Volunteer activities',
  '22': 'Video games',
};

export const COMPENDIUM_VERSION = '2024';
export const COMPENDIUM_SOURCE = file.source;
export const COMPENDIUM_URL = file.url;

export const COMPENDIUM: readonly CompendiumActivity[] = (file.rows as Array<[string, number, string]>).map(([code, met, description]) => ({
  code,
  met,
  description,
  heading: HEADINGS[code.slice(0, 2)] ?? '',
}));

const byCode = new Map(COMPENDIUM.map((a) => [a.code, a]));

export function compendiumActivity(code: string | undefined): CompendiumActivity | undefined {
  return code ? byCode.get(code) : undefined;
}

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
const index = COMPENDIUM.map((a) => ({ a, words: words(`${a.heading} ${a.description}`), desc: words(a.description), heading: words(a.heading) }));

/**
 * Activities whose heading and description hold every query word (as a word start), best first:
 * the description starting with a query word, then the heading matching ("walk" → Walking), then the
 * general rows, then shorter descriptions.
 */
export function searchCompendium(query: string, limit = 20): CompendiumActivity[] {
  const q = words(query);
  if (!q.length) return [];
  const hits: Array<{ a: CompendiumActivity; score: number }> = [];
  for (const { a, words: w, desc, heading } of index) {
    if (!q.every((qw) => w.some((x) => x.startsWith(qw)))) continue;
    const score =
      (q.some((qw) => (desc[0] ?? '').startsWith(qw)) ? 1000 : 0) +
      (q.some((qw) => heading.some((h) => h.startsWith(qw))) ? 400 : 0) +
      (desc.includes('general') ? 150 : 0) -
      a.description.length;
    hits.push({ a, score });
  }
  return hits.sort((x, y) => y.score - x.score).slice(0, limit).map((h) => h.a);
}
