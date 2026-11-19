/**
 * Conversion: USDA household measures → common sizes of BLS foods (src/foods/portions-usda.json).
 *
 * Run with `npm run portions` after changing data/usda-portions.csv (the JSON is committed, like the
 * Compendium). Input: data/raw/FoodData_Central_sr_legacy_food_csv_2018-04.zip, the SR Legacy
 * release of USDA FoodData Central (public domain, CC0), never edited. BLS 4.0 itself has no
 * portion weights, and no open German source with them was found (2026-11-19), so the sizes come
 * from the USDA food of the same kind and shape. Only the gram weights are taken; every nutrient
 * still comes from BLS. Format documented in data/README.md.
 *
 * Kept: pieces, sizes (small/medium/large), slices, leaves, wedges and spoons. Dropped: cups, fluid
 * ounces, pounds, packages, cans and servings, which are US kitchen or pack measures. A count in an
 * ounce measure ("1 oz (22 whole kernels)") becomes that count. Inches become centimetres.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import type { PortionsFile, UsdaSize } from '../src/foods/portions';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ZIP = resolve(root, 'data/raw/FoodData_Central_sr_legacy_food_csv_2018-04.zip');
const MAP = resolve(root, 'data/usda-portions.csv');
const BLS = resolve(root, 'public/data/bls-4.0.json');
const OUT = resolve(root, 'src/foods/portions-usda.json');

/** More sizes than this crowd the amount sheet; the first ones in USDA's order are kept. */
export const MAX_SIZES = 6;

/** Minimal CSV: commas, double-quoted fields with "" escapes (USDA's files). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** US kitchen and pack measures: not useful for a European kitchen, or not a size of the food. */
const DROPPED = /\b(cups?|oz|ounces?|fl|lbs?|pounds?|NLEA|serving|package|pkg|jars?|cans?|container|bottle|cubic|quarts?|pints?|box|carton|bag|gallon|liters?|packet|envelope|recipe|yields? from|dash|pinch)\b/i;
/** "1 oz (22 whole kernels)", "1 oz (10-12 kernels)": a count in an ounce measure. */
const OZ_COUNT = /^oz\s*\((\d+)\s+([a-z ]+)\)$/i;

/** 2-1/2 → 2.5, 3/4 → 0.75, 3 → 3 */
function inches(s: string): number {
  const m = /^(?:(\d+(?:\.\d+)?)(?:-|$))?(?:(\d+)\/(\d+))?$/.exec(s);
  if (!m || (!m[1] && !m[2])) return Number.NaN;
  return Number(m[1] ?? 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
}

const fmtCm = (inch: number) => {
  const cm = inch * 2.54;
  return cm >= 2 ? String(Math.round(cm * 2) / 2) : String(Math.round(cm * 10) / 10);
};

const NUM = String.raw`\d+-\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?`;
/** `3"`, `2-1/2"`, `7" to 7-7/8"`, `5-6"` (a range) */
const INCHES = new RegExp(`(${NUM})("?)(?:\\s*(?:to|-)\\s*(${NUM})")?`, 'g');

/** Inches in USDA's text as centimetres: `3-1/4" dia` → `8.5 cm across`. */
export function toCm(text: string): string {
  return text
    .replace(INCHES, (m, a: string, quote: string, b?: string) => {
      if (!quote && !b) return m;
      const x = inches(a);
      const y = b ? inches(b) : undefined;
      if (Number.isNaN(x) || (y !== undefined && Number.isNaN(y))) return m;
      return y !== undefined ? `${fmtCm(x)}–${fmtCm(y)} cm` : `${fmtCm(x)} cm`;
    })
    .replace(/\bdia(meter)?\.?(?=\W|$)/gi, 'across');
}

/** USDA's note in brackets, in centimetres. Undefined when nothing useful is left. */
export function tidyDetail(text: string): string | undefined {
  const s = toCm(
    text
      .replace(/\b\d+(-\d+\/\d+)? per (lb|pound),?\s*/gi, '')
      .replace(/\(?\b\d+(\.\d+)? ?oz\)?/gi, '')
      .replace(/\bapprox\.?(?=\W|$)/gi, 'about'),
  )
    .replace(/\bsq\b/g, 'square')
    .replace(/\s+/g, ' ')
    .replace(/^[,;\s]+|[,;\s]+$/g, '')
    .trim();
  // Leftover inch figures or USDA typos ("8-/1/2") are better left out than shown half-converted.
  if (!s || !/[a-z0-9]/i.test(s) || /"|-\/|\d-\d+\//.test(s)) return undefined;
  return s;
}

const fmtAmount = (n: number) => (n === 0.5 ? '½' : n === 0.25 ? '¼' : String(Math.round(n * 100) / 100));

/**
 * One USDA measure as a size, or undefined when it is not one to offer (cups, packages…).
 * `keep` (a regex from the mapping) overrides the default choice.
 */
export function toSize(amount: number, modifier: string, grams: number, keep?: RegExp): UsdaSize | undefined {
  // "1 tsp or 1 packet": the spoon is the size.
  const raw = modifier.replace(/\s+or 1 packet\b/i, '').trim();
  if (!(grams > 0) || !(amount > 0) || !raw) return undefined;
  if (keep && !keep.test(raw)) return undefined;
  const oz = OZ_COUNT.exec(raw);
  if (oz) return { label: `${oz[1]} ${oz[2]!.trim()}`, grams: round(grams) };
  if (DROPPED.test(raw.replace(/\([^)]*\)/g, ''))) return undefined;
  const paren = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]!).join(', ');
  const main = raw
    .replace(/\([^)]*\)/g, '')
    .replace(/,?\s*NS as to .*$/i, '')
    .replace(/\b(without refuse|yields)\b/gi, '')
    .replace(/\btablespoons?\b/gi, 'tbsp')
    .replace(/\bsweetpotato\b/g, 'sweet potato')
    .replace(/^Potato\b/, 'potato')
    .replace(/\bteaspoons?\b/gi, 'tsp')
    .replace(/\s+/g, ' ')
    .replace(/[\s,]+$/, '')
    .trim();
  if (!main || /"/.test(toCm(main))) return undefined;
  const detail = paren ? tidyDetail(paren) : undefined;
  return { label: `${fmtAmount(amount)} ${toCm(main)}`, grams: round(grams), ...(detail ? { detail } : {}) };
}

const round = (g: number) => Math.round(g * 10) / 10;

/** Sizes of one USDA food: the first MAX_SIZES distinct ones in USDA's order, then smallest first. */
export function sizesOf(rows: Array<{ seq: number; amount: number; modifier: string; grams: number }>, keep?: RegExp): UsdaSize[] {
  const out: UsdaSize[] = [];
  for (const r of [...rows].sort((a, b) => a.seq - b.seq)) {
    const s = toSize(r.amount, r.modifier, r.grams, keep);
    if (!s || out.some((o) => o.label === s.label || Math.abs(o.grams - s.grams) < 0.05)) continue;
    out.push(s);
    if (out.length >= MAX_SIZES) break;
  }
  return out.sort((a, b) => a.grams - b.grams);
}

function main() {
  const files = unzipSync(new Uint8Array(readFileSync(ZIP)));
  const csv = (name: string) => {
    const key = Object.keys(files).find((k) => k.endsWith(`/${name}`));
    if (!key) throw new Error(`${name} not in ${ZIP}`);
    const [head, ...rows] = parseCsv(strFromU8(files[key]!)).filter((r) => r.length > 1);
    return rows.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ''])));
  };
  const names = new Map(csv('food.csv').map((r) => [r.fdc_id!, r.description!]));
  const portions = new Map<string, Array<{ seq: number; amount: number; modifier: string; grams: number }>>();
  for (const r of csv('food_portion.csv')) {
    const list = portions.get(r.fdc_id!) ?? [];
    list.push({ seq: Number(r.seq_num), amount: Number(r.amount), modifier: r.modifier!, grams: Number(r.gram_weight) });
    portions.set(r.fdc_id!, list);
  }
  const bls = existsSync(BLS) ? new Map((JSON.parse(readFileSync(BLS, 'utf8')) as { foods: Array<[string, string, string]> }).foods.map((f) => [f[0], f[2]])) : undefined;
  if (!bls) throw new Error(`${BLS} missing: run \`npm run data\` first`);

  const file: PortionsFile = {
    source: 'U.S. Department of Agriculture, Agricultural Research Service (2019): FoodData Central, SR Legacy (April 2018), food portions',
    url: 'https://fdc.nal.usda.gov/',
    licence: 'Public domain (CC0 1.0)',
    usda: {},
    foods: {},
  };
  const report: string[] = [];
  for (const line of readFileSync(MAP, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#') || line.startsWith('bls_code')) continue;
    const [code, fdc, keep, note] = line.split(',').map((s) => s.trim());
    if (!code || !fdc) throw new Error(`Bad line: ${line}`);
    if (!bls.has(code)) throw new Error(`Unknown BLS code ${code}`);
    if (file.foods[code]) throw new Error(`BLS code ${code} listed twice`);
    const name = names.get(fdc);
    if (!name) throw new Error(`Unknown FDC id ${fdc} (for ${code})`);
    const keepRe = keep ? new RegExp(keep, 'i') : undefined;
    const sizes = sizesOf(portions.get(fdc) ?? [], keepRe);
    if (!sizes.length) throw new Error(`No sizes for ${code} from ${fdc} ${name}${keep ? ` (keep ${keep})` : ''}`);
    // Several BLS foods can share one USDA food; a keep filter makes its own entry.
    const key = keep ? `${fdc}:${keep}` : fdc;
    file.usda[key] ??= { fdc: Number(fdc), name: name.replace(/\s*\(Includes foods for USDA's Food Distribution Program\)/i, ''), sizes };
    file.foods[code] = note ? { usda: key, note } : { usda: key };
    report.push(`${code} ${bls.get(code)} ← ${name.slice(0, 60)}: ${sizes.map((s) => `${s.label}${s.detail ? ` (${s.detail})` : ''} ${s.grams} g`).join('; ')}`);
  }
  writeFileSync(OUT, `${JSON.stringify(file)}\n`);
  if (process.argv.includes('--report')) console.log(report.join('\n'));
  console.log(`Wrote sizes for ${Object.keys(file.foods).length} BLS foods from ${Object.keys(file.usda).length} USDA foods → ${OUT}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
