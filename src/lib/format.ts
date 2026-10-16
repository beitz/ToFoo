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

/** US dollars with enough decimals for small amounts (AI costs are often fractions of a cent). */
export function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return '–';
  if (v > 0 && v < 0.001) return '<$0.001';
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: v < 1 ? 3 : 2, maximumFractionDigits: v < 1 ? 3 : 2 })}`;
}

/** Token counts in thousands or millions ("12.3k"). */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${fmtNumber(n / 1_000_000, 2)}M`;
  if (n >= 1000) return `${fmtNumber(n / 1000, 1)}k`;
  return fmtNumber(n);
}
