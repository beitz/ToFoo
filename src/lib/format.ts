import { NUTRIENT_BY_ID } from '../model/nutrients';

export function fmtNumber(v: number, decimals = 0): string {
  if (!Number.isFinite(v)) return '–';
  return v.toLocaleString('en-GB', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

/** Amount of a nutrient with its unit, using sensible decimals. */
export function fmtAmount(id: string, value: number): string {
  let v = value;
  const def = NUTRIENT_BY_ID.get(id);
  let unit = def?.unit ?? '';
  // BLS keeps e.g. vitamin B6 and manganese in µg; large amounts read better in mg.
  let decimals = def?.decimals ?? 1;
  if (unit === 'µg' && Math.abs(v) >= 1000) {
    v = v / 1000;
    unit = 'mg';
    decimals = 1;
  }
  if (Math.abs(v) >= 100) decimals = 0;
  else if (Math.abs(v) < 1 && v !== 0) decimals = Math.max(decimals, 2);
  return `${fmtNumber(v, decimals)} ${unit}`.trim();
}

export function fmtPercent(v: number): string {
  if (!Number.isFinite(v)) return '–';
  return `${Math.round(v * 100)}%`;
}

export function fmtGrams(g: number): string {
  return `${fmtNumber(g, g < 10 ? 1 : 0)} g`;
}
