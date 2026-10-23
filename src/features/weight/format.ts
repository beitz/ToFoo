import { fmtNumber } from '../../lib/format';

/** A weight to one decimal, as a scale shows it ("81.4"); the unit comes from the text around it. */
export const fmtKg = (kg: number) => kg.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** A change in kg with its sign, never coloured or judged ("+0.4", "−0.3", "±0.0"). */
export const fmtKgChange = (kg: number) => {
  const r = Math.round(kg * 10) / 10;
  return r === 0 ? '±0.0' : `${r > 0 ? '+' : '−'}${fmtKg(Math.abs(r))}`;
};

/** Energy rounded to the nearest 10 kcal: the estimate is not more precise than that. */
export const fmtKcal10 = (kcal: number) => fmtNumber(Math.round(kcal / 10) * 10);
