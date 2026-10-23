/**
 * Build-time conversion: data/raw/BLS_4_0_2025_DE.zip → public/data/bls-4.0.json
 *
 * Run with `npm run data`. The format of the raw files is documented in data/README.md.
 * Rules (docs/SPEC.md, "Data sources and pipeline"):
 *  - missing values stay `null`, never zero;
 *  - "<LOD", "<LOQ", "<LOD or <LOQ" and "TR" become "t" (trace / below detection);
 *  - the output records the BLS version.
 * BLS 4.0 has no selenium, so one column is added: selenium estimated from the UK table CoFID 2021
 * (data/raw/CoFID_2021.xlsx, scripts/selenium.ts), with its own provenance code "C".
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import ExcelJS from 'exceljs';
import type { BlsFile, BlsFoodRow, BlsNutrientMeta, BlsRawValue } from '../src/foods/blsTypes';
import { COFID_PROVENANCE } from '../src/foods/blsTypes';
import { readCofid } from './cofid';
import { SELENIUM, bestMatch, estimateFrom, prepare, type BlsFoodLike } from './selenium';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ZIP = resolve(root, 'data/raw/BLS_4_0_2025_DE.zip');
const COFID = resolve(root, 'data/raw/CoFID_2021.xlsx');
const OUT = resolve(root, 'public/data/bls-4.0.json');
const VERSION = '4.0';

/**
 * Nutrients kept in the app bundle (BLS component codes). Everything the nutrient model,
 * reference values or UI uses; minor fatty acids, sugars, organic acids etc. are dropped
 * to keep the download small. Add a code here to make it available.
 */
export const KEPT_NUTRIENTS = [
  'ENERCC', 'WATER', 'PROT625', 'FAT', 'CHO', 'SUGAR', 'STARCH', 'FIBT', 'ALC',
  'VITA', 'VITAA', 'RETOL', 'CARTB', 'VITD', 'VITE', 'VITK',
  'THIA', 'RIBF', 'NIAEQ', 'NIA', 'PANTAC', 'VITB6', 'BIOT', 'FOL', 'FOLAC', 'VITB12', 'VITC',
  'NACL', 'NA', 'CLD', 'K', 'CA', 'MG', 'P', 'FE', 'ZN', 'ID', 'CU', 'MN', 'FD', 'CR', 'MO',
  'FASAT', 'FAMS', 'FAPU', 'FAPUN3', 'FAPUN6', 'F18:3CN3', 'F18:2CN6', 'F20:5CN3', 'F22:6CN3', 'CHORL',
  'HIS', 'ILE', 'LEU', 'LYS', 'MET', 'CYSTE', 'PHE', 'TYR', 'THR', 'TRP', 'VAL',
] as const;

/** BLS "Datenherkunft" (data provenance) categories → one-letter codes. */
const PROVENANCE: Record<string, string> = {
  Analyse: 'A',
  Rezeptberechnung: 'R',
  Formelberechnung: 'F',
  Musterberechnung: 'M',
  'Nährstoffdatenbank': 'D',
  Reskalierung: 'S',
  'Übernommener Wert': 'U',
  'Logische Null': 'Z',
  Literatur: 'L',
  Aggregation: 'G',
  Spuren: 'T',
  Labelangabe: 'B',
  'Logische Annahme': 'N',
};

/**
 * Main food groups by the leading letter of the BLS code. The BLS 4.0 documentation states that the
 * letter marks the main group but does not list the groups, so these labels were derived by
 * inspecting the foods in each letter (see data/README.md).
 */
const GROUPS: BlsFile['groups'] = {
  B: { en: 'Bread and rolls', de: 'Brot und Kleingebäck' },
  C: { en: 'Cereals and cereal products', de: 'Getreide und Getreideprodukte' },
  D: { en: 'Cakes, pastries and biscuits', de: 'Kuchen, Feine Backwaren und Kekse' },
  E: { en: 'Eggs, pasta and dumplings', de: 'Eier, Teigwaren und Klöße' },
  F: { en: 'Fruit and fruit products', de: 'Obst und Obstprodukte' },
  G: { en: 'Vegetables', de: 'Gemüse' },
  H: { en: 'Legumes, nuts, seeds and plant-based alternatives', de: 'Hülsenfrüchte, Nüsse, Samen und pflanzliche Alternativen' },
  K: { en: 'Potatoes and mushrooms', de: 'Kartoffeln und Pilze' },
  M: { en: 'Milk and dairy products', de: 'Milch und Milchprodukte' },
  N: { en: 'Non-alcoholic beverages', de: 'Alkoholfreie Getränke' },
  P: { en: 'Alcoholic beverages', de: 'Alkoholische Getränke' },
  Q: { en: 'Fats and oils', de: 'Fette und Öle' },
  R: { en: 'Spices, salt, condiments and additives', de: 'Gewürze, Salz, Würzmittel und Zusatzstoffe' },
  S: { en: 'Sweets, sugar and ice cream', de: 'Süßwaren, Zucker und Speiseeis' },
  T: { en: 'Fish and seafood', de: 'Fisch und Meeresfrüchte' },
  U: { en: 'Meat', de: 'Fleisch' },
  V: { en: 'Poultry, game and offal', de: 'Geflügel, Wild und Innereien' },
  W: { en: 'Sausages and cold cuts', de: 'Wurstwaren' },
  X: { en: 'Composite dishes: soups, sauces, savoury dishes', de: 'Gerichte: Suppen, Soßen, herzhafte Gerichte' },
  Y: { en: 'Composite dishes: meat dishes, desserts, compotes', de: 'Gerichte: Fleischgerichte, Desserts, Kompotte' },
};

const TRACE_MARKERS = new Set(['<LOD', '<LOQ', '<LOD or <LOQ', 'TR']);
const MISSING_MARKERS = new Set(['-', '']);

function cellText(v: ExcelJS.CellValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('');
  if (typeof v === 'object' && 'result' in v) return (v.result as number | string) ?? null;
  return String(v);
}

function parseValue(v: string | number | null, where: string): BlsRawValue {
  if (typeof v === 'number') return v;
  if (v === null) return null;
  const s = v.trim();
  if (MISSING_MARKERS.has(s)) return null;
  if (TRACE_MARKERS.has(s)) return 't';
  const n = Number(s.replace(',', '.'));
  if (Number.isFinite(n)) return n;
  throw new Error(`Unexpected value "${s}" at ${where}`);
}

async function readRows(xlsx: Uint8Array): Promise<(string | number | null)[][]> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(Buffer.from(xlsx)), {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    worksheets: 'emit',
  });
  const rows: (string | number | null)[][] = [];
  for await (const sheet of reader) {
    for await (const row of sheet) {
      const values = row.values as ExcelJS.CellValue[];
      // exceljs row.values is 1-based
      rows.push(values.slice(1).map(cellText));
    }
    break; // first sheet only
  }
  return rows;
}

async function main() {
  if (!existsSync(ZIP) || statSync(ZIP).size < 1_000_000) {
    throw new Error(`BLS zip missing or broken at ${ZIP} (expected ~14 MB).`);
  }
  const files = unzipSync(readFileSync(ZIP));
  const find = (suffix: string) => {
    const name = Object.keys(files).find((f) => f.endsWith(suffix));
    const file = name ? files[name] : undefined;
    if (!file) throw new Error(`${suffix} not found in zip`);
    return file;
  };

  // Component list: names (DE/EN) and units.
  const compRows = await readRows(find('BLS_4_0_Components_DE_EN.xlsx'));
  const compHeader = compRows[0] ?? [];
  if (compHeader[1] !== 'Nährstoffcode / Component code') throw new Error('Unexpected components header');
  const components = new Map<string, BlsNutrientMeta>();
  for (const r of compRows.slice(1)) {
    if (typeof r[1] !== 'string' || !r[1].trim()) continue;
    const id = r[1].trim();
    components.set(id, {
      id,
      nameDe: String(r[2]).trim(),
      nameEn: String(r[3]).trim(),
      unit: String(r[4]).trim(),
    });
  }

  // Food data.
  const rows = await readRows(find('BLS_4_0_Daten_2025_DE.xlsx'));
  const header = (rows[0] ?? []).map((h) => (h === null ? '' : String(h)));
  if (header[0] !== 'BLS Code' || header[1] !== 'Lebensmittelbezeichnung' || header[2] !== 'Food name') {
    throw new Error(`Unexpected data header: ${header.slice(0, 3).join(' | ')}`);
  }
  const nutrients: BlsNutrientMeta[] = [];
  const valueCol: number[] = [];
  const provCol: number[] = [];
  for (const id of KEPT_NUTRIENTS) {
    const meta = components.get(id);
    if (!meta) throw new Error(`Component ${id} not in components list`);
    const vi = header.findIndex((h) => h.startsWith(`${id} `) && h.includes('[') && h.endsWith('/100g]'));
    const pi = header.indexOf(`${id} Datenherkunft`);
    if (vi < 0 || pi < 0) throw new Error(`Columns for ${id} not found`);
    const col = header[vi] ?? '';
    const unitInHeader = col.slice(col.lastIndexOf('[') + 1, -'/100g]'.length);
    if (unitInHeader !== meta.unit) throw new Error(`Unit mismatch for ${id}: ${unitInHeader} vs ${meta.unit}`);
    nutrients.push(meta);
    valueCol.push(vi);
    provCol.push(pi);
  }

  const foods: BlsFoodRow[] = [];
  const unknownProvenance = new Set<string>();
  for (const r of rows.slice(1)) {
    const code = typeof r[0] === 'string' ? r[0].trim() : '';
    if (!code) continue;
    if (!GROUPS[code.charAt(0)]) throw new Error(`Unknown food group letter in ${code}`);
    const values = valueCol.map((c, i) => parseValue(r[c] ?? null, `${code}/${nutrients[i]?.id}`));
    const prov = provCol
      .map((c) => {
        const p = r[c];
        if (p === null || p === '-' || p === '') return '-';
        const letter = PROVENANCE[String(p).trim()];
        if (!letter) unknownProvenance.add(String(p));
        return letter ?? '?';
      })
      .join('');
    foods.push([code, String(r[1]).trim(), String(r[2]).trim(), values, prov]);
  }
  if (unknownProvenance.size) throw new Error(`Unknown provenance values: ${[...unknownProvenance].join(', ')}`);

  // Selenium from CoFID: each food's most alike CoFID food, scaled by protein (scripts/selenium.ts).
  const candidates = prepare(await readCofid(readFileSync(COFID)), SELENIUM);
  let withSelenium = 0;
  for (const row of foods) {
    const like: BlsFoodLike = { code: row[0], nameEn: row[2], per100: Object.fromEntries(nutrients.map((n, i) => [n.id, row[3][i] ?? null])) };
    const match = bestMatch(like, candidates);
    const v = match ? estimateFrom(like, match.cofid) : null;
    row[3].push(v);
    row[4] += v === null ? '-' : COFID_PROVENANCE;
    if (v !== null) withSelenium++;
  }
  nutrients.push({ id: 'SE', nameDe: 'Selen', nameEn: 'Selenium', unit: 'µg' });

  const out: BlsFile = {
    format: 'tofoo-bls',
    formatVersion: 1,
    source: 'BLS',
    version: VERSION,
    attribution:
      'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 — Deutsche Nährstoffdatenbank. Karlsruhe. DOI: 10.25826/Data20251217-134202-0. Converted and abridged for ToFoo.',
    licence: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
    provenanceCodes: {
      ...Object.fromEntries(Object.entries(PROVENANCE).map(([k, v]) => [v, k])),
      [COFID_PROVENANCE]: 'Geschätzt aus CoFID 2021 (UK), über ein ähnliches Lebensmittel',
    },
    extraSources: [
      {
        nutrients: ['SE'],
        attribution:
          "Public Health England (2021): McCance and Widdowson's The Composition of Foods Integrated Dataset 2021. Selenium estimated for BLS foods by ToFoo (most alike CoFID food, scaled by protein).",
        licence: 'Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)',
      },
    ],
    groups: GROUPS,
    nutrients,
    foods,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  const json = JSON.stringify(out);
  writeFileSync(OUT, json);
  console.log(`Wrote ${foods.length} foods × ${nutrients.length} nutrients → ${OUT} (${(json.length / 1e6).toFixed(2)} MB)`);
  console.log(`Selenium from CoFID for ${withSelenium} of ${foods.length} foods`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
