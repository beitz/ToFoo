/**
 * Reads McCance and Widdowson's Composition of Foods Integrated Dataset (CoFID) 2021, the UK food
 * composition table, from data/raw/CoFID_2021.xlsx. Used at build time only, to estimate selenium
 * for BLS foods (BLS 4.0 has no selenium); see scripts/selenium.ts and data/README.md.
 */
import ExcelJS from 'exceljs';
import type { CofidFood, CofidValue } from './selenium';

/** CoFID sheets and the nutrient codes taken from each (codes are in row 2 of every sheet). */
const SHEETS: Record<string, readonly string[]> = {
  '1.3 Proximates': ['WATER', 'PROT', 'FAT', 'CHO', 'AOACFIB'],
  '1.4 Inorganics': ['NA', 'K', 'CA', 'MG', 'P', 'FE', 'CU', 'ZN', 'MN', 'SE', 'I'],
  '1.5 Vitamins': ['THIA', 'RIBO', 'NIAC', 'VITB6', 'VITB12', 'FOLT', 'PANTO', 'VITC'],
};

function cellText(v: ExcelJS.CellValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('');
  if (typeof v === 'object' && 'result' in v) return (v.result as number | string) ?? null;
  return String(v);
}

/** CoFID cell → value: a number, "t" for "Tr" (trace), null for "N" (present, not measured) or empty. */
export function parseCofidValue(v: string | number | null): CofidValue {
  if (typeof v === 'number') return v;
  if (v === null) return null;
  const s = v.trim();
  if (s === '' || s === 'N') return null;
  if (s === 'Tr') return 't';
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  throw new Error(`Unexpected CoFID value "${s}"`);
}

export async function readCofid(xlsx: Buffer): Promise<CofidFood[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx as unknown as ArrayBuffer);
  const foods = new Map<string, CofidFood>();
  for (const [sheetName, codes] of Object.entries(SHEETS)) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`CoFID sheet "${sheetName}" not found`);
    const codeRow = (ws.getRow(2).values as ExcelJS.CellValue[]).map(cellText);
    const cols = codes.map((c) => {
      const i = codeRow.indexOf(c);
      if (i < 0) throw new Error(`CoFID column ${c} not found in "${sheetName}"`);
      return i;
    });
    ws.eachRow((row, n) => {
      if (n <= 3) return; // header, codes, descriptions
      const cells = (row.values as ExcelJS.CellValue[]).map(cellText);
      const code = typeof cells[1] === 'string' ? cells[1].trim() : '';
      if (!code) return;
      let food = foods.get(code);
      if (!food) {
        food = { code, name: String(cells[2] ?? '').trim(), group: String(cells[4] ?? '').trim(), values: {} };
        foods.set(code, food);
      }
      codes.forEach((c, i) => {
        food.values[c] = parseCofidValue(cells[cols[i]!] ?? null);
      });
    });
  }
  return [...foods.values()];
}
