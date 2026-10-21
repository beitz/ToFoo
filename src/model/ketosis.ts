/**
 * Ketosis estimate during a fast (docs/SPEC.md, "Ketosis estimate during fasts"): blood BHB as a
 * range by hours since the last meal, from the study curve in model/parameters.ts, moved by the
 * last meal's carbohydrate and by exercise, and scaled by sex and body fat. Pure; nothing is stored.
 */
import { ketosis as k } from '../../model/parameters';
import type { Range, Sex } from './paramTypes';

export interface KetosisInput {
  /** Hours since the last meal. */
  hours: number;
  /** Share of the last meal's energy from carbohydrate (0–1); null when unknown. */
  carbShare: number | null;
  /** Moderate or hard activity since the last meal, in minutes. */
  exerciseMinutes: number;
  sex: Sex | undefined;
  bmi: number | undefined;
  /** The user's own timing learnt from blood readings (hours earlier than the estimate without it). */
  personal?: PersonalShift;
}

export interface PersonalShift {
  hours: number;
  readings: number;
}

export type KetosisPhase = 'none' | 'starting' | 'light' | 'moderate' | 'deep';

/** What moved the estimate, for the "what moved the curve" lines. */
export type KetosisFactor =
  | { kind: 'lowCarb'; carbShare: number }
  | { kind: 'carbUnknown' }
  | { kind: 'exercise'; minutes: number }
  | { kind: 'female' }
  | { kind: 'sexUnknown' }
  | { kind: 'bmi'; bmi: number }
  | { kind: 'bmiUnknown' }
  | { kind: 'personal'; hours: number; readings: number };

export interface KetosisEstimate {
  hours: number;
  /** BHB in mmol/L. */
  bhb: Range;
  phase: KetosisPhase;
  factors: KetosisFactor[];
}

/** Mean BHB at `hours` on the reference curve (linear between points, flat beyond the ends). */
export function curveAt(hours: number): number {
  const pts = k.curve.value;
  const first = pts[0]!;
  if (hours <= first[0]) return first[1];
  for (let i = 1; i < pts.length; i++) {
    const [h1, v1] = pts[i]!;
    if (hours <= h1) {
      const [h0, v0] = pts[i - 1]!;
      return v0 + ((v1 - v0) * (hours - h0)) / (h1 - h0);
    }
  }
  return pts[pts.length - 1]![1];
}

const BASE = () => k.curve.value[0]![1];

/** 1 at `lean` BMI and below, the obese factor from `obese` up, linear between. */
function bmiWeight(bmi: number): number {
  const { lean, obese } = k.bmi.value;
  return Math.min(1, Math.max(0, (bmi - lean) / (obese - lean)));
}

/** The body-fat factor fades out over the stretch where the curve itself comes from people with obesity. */
function bmiFade(hours: number): number {
  const { from, to } = k.obeseFadeHours.value;
  if (hours <= from) return 1;
  if (hours >= to) return 0;
  return 1 - (hours - from) / (to - from);
}

const blend = (factor: Range, w: number): Range => ({
  low: 1 + (factor.low - 1) * w,
  central: 1 + (factor.central - 1) * w,
  high: 1 + (factor.high - 1) * w,
});

const scaleRange = (a: Range, b: Range): Range => ({
  low: Math.min(a.low, a.central, a.high) * Math.min(b.low, b.central, b.high),
  central: a.central * b.central,
  high: Math.max(a.low, a.central, a.high) * Math.max(b.low, b.central, b.high),
});

export function phaseOf(bhb: Range): KetosisPhase {
  const { light, moderate, deep } = k.phases.value;
  if (bhb.high < light) return 'none';
  if (bhb.central < light) return 'starting';
  if (bhb.central < moderate) return 'light';
  if (bhb.central < deep) return 'moderate';
  return 'deep';
}

export function estimateKetosis(input: KetosisInput): KetosisEstimate {
  const hours = Math.max(0, input.hours);
  const factors: KetosisFactor[] = [];

  // Time shifts (hours earlier): person-to-person spread in timing, last meal's carbohydrate, exercise.
  const spread = k.personSpreadHours.value * k.personSpreadSd.value;
  const shift: Range = { low: -spread, central: 0, high: spread };
  const carb = k.lowCarbShiftHours.value;
  if (input.carbShare === null) {
    // Unknown: anywhere from a carbohydrate-rich to a very-low-carbohydrate meal.
    shift.high += Math.max(carb.low, carb.central, carb.high);
    factors.push({ kind: 'carbUnknown' });
  } else {
    const { full, none } = k.carbShareSpan.value;
    const w = Math.min(1, Math.max(0, (none - input.carbShare) / (none - full)));
    if (w > 0) {
      shift.low += carb.low * w;
      shift.central += carb.central * w;
      shift.high += carb.high * w;
      factors.push({ kind: 'lowCarb', carbShare: input.carbShare });
    }
  }
  if (input.exerciseMinutes >= k.exerciseMinMinutes.value) {
    const ex = k.exerciseShiftHours.value;
    shift.low += ex.low;
    shift.central += ex.central;
    shift.high += ex.high;
    factors.push({ kind: 'exercise', minutes: input.exerciseMinutes });
  }

  if (input.personal) {
    shift.low += input.personal.hours;
    shift.central += input.personal.hours;
    shift.high += input.personal.hours;
    factors.push({ kind: 'personal', ...input.personal });
  }

  // Rise factors: sex, body fat and the person-to-person spread in level scale the rise above the fed baseline.
  const female = k.femaleRiseFactor.value;
  let sexFactor: Range = { low: 1, central: 1, high: 1 };
  if (input.sex === 'female') {
    sexFactor = female;
    factors.push({ kind: 'female' });
  } else if (input.sex === undefined) {
    sexFactor = { low: 1, central: 1, high: Math.max(female.central, female.high) };
    factors.push({ kind: 'sexUnknown' });
  }
  const obese = k.obeseRiseFactor.value;
  let bmiFactor: Range = { low: 1, central: 1, high: 1 };
  if (input.bmi === undefined) {
    bmiFactor = blend({ low: Math.min(obese.low, obese.central), central: 1, high: 1 }, bmiFade(hours));
    factors.push({ kind: 'bmiUnknown' });
  } else if (bmiWeight(input.bmi) > 0) {
    bmiFactor = blend(blend(obese, bmiWeight(input.bmi)), bmiFade(hours));
    factors.push({ kind: 'bmi', bmi: input.bmi });
  }
  const cv = k.personLevelCv.value;
  const rise = scaleRange(scaleRange(sexFactor, bmiFactor), { low: 1 - cv, central: 1, high: 1 + cv });

  const at = (h: number, f: number) => BASE() + (curveAt(Math.max(0, hours + h)) - BASE()) * f;
  const bhb: Range = { low: at(shift.low, rise.low), central: at(shift.central, rise.central), high: at(shift.high, rise.high) };
  return { hours, bhb, phase: phaseOf(bhb), factors };
}

/** Hours earlier (negative: later) that put the central estimate on one blood reading; null when that needs more than the allowed shift. */
export function shiftForReading(input: KetosisInput, mmol: number): number | null {
  const max = k.personal.value.maxShiftHours;
  const at = (s: number) => estimateKetosis({ ...input, personal: { hours: s, readings: 0 } }).bhb.central;
  if (mmol < at(-max) || mmol > at(max)) return null;
  let lo = -max;
  let hi = max;
  // The estimate rises with the shift, so halve the interval until it is well under an hour.
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < mmol) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The user's own timing from blood readings taken during fasts: the median of the per-reading
 * shifts, once there are enough of them. Readings above the meters' reliable range are left out.
 */
export function personalShift(readings: ReadonlyArray<{ input: KetosisInput; mmol: number }>): PersonalShift | null {
  const shifts = readings
    .filter((r) => r.mmol <= k.meterMaxMmol.value)
    .map((r) => shiftForReading({ ...r.input, personal: undefined }, r.mmol))
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b);
  if (shifts.length < k.personal.value.minReadings) return null;
  const mid = Math.floor(shifts.length / 2);
  const median = shifts.length % 2 ? shifts[mid]! : (shifts[mid - 1]! + shifts[mid]!) / 2;
  return { hours: median, readings: shifts.length };
}
