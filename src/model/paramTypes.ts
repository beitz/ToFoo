/**
 * Types for the parameter and reference-value files in `model/`.
 * Every number that describes physiology carries a source and a confidence.
 */

/** How much we trust a value. `assumption` = no good source; listed in docs/OPEN_QUESTIONS.md. */
export type Confidence = 'high' | 'medium' | 'low' | 'assumption';

export interface Cited {
  /** Short citation, e.g. "DGE/ÖGE Referenzwerte, Vitamin B12 (2019)". */
  source: string;
  /** Optional URL or DOI. */
  url?: string;
  confidence: Confidence;
  /** Why this value, caveats, or what still needs checking. */
  note?: string;
}

/** A value with an uncertainty range, used for the low / central / high model runs. */
export interface Range {
  low: number;
  central: number;
  high: number;
}

export type Scenario = 'low' | 'central' | 'high';
export const SCENARIOS: readonly Scenario[] = ['low', 'central', 'high'];

export type Sex = 'male' | 'female';
/** DGE adult age groups. Under-19s are out of scope (the 19–24 values are used, with a notice). */
export type AgeGroup = '19-24' | '25-50' | '51-64' | '65+';
export const AGE_GROUPS: readonly AgeGroup[] = ['19-24', '25-50', '51-64', '65+'];

/** Values per age group in the order of AGE_GROUPS. */
export type ByAge = readonly [number, number, number, number];

export type ActivityLevel = 'low' | 'medium' | 'high';
export type PhytateIntake = 'low' | 'medium' | 'high';
/** For the iron reference value (DGE 2024). */
export type Menstruation = 'menstruating' | 'postmenopausal' | 'none';

/** How the daily reference amount is expressed. All amounts are in the nutrient's BLS unit. */
export type AmountSpec =
  | { type: 'bySexAge'; male: ByAge; female: ByAge }
  /** Per kg body weight per day. */
  | { type: 'perKg'; male: ByAge; female: ByAge }
  /** Percentage of the energy reference value, converted with `kcalPerUnit`. */
  | { type: 'energyPercent'; percent: number; kcalPerUnit: number }
  /** Energy guide values by activity level (DGE PAL 1.4 / 1.6 / 1.8). */
  | { type: 'energy'; male: Record<ActivityLevel, ByAge>; female: Record<ActivityLevel, ByAge> }
  /** Zinc: depends on dietary phytate (DGE 2019). */
  | { type: 'byPhytate'; male: Record<PhytateIntake, number>; female: Record<PhytateIntake, number> }
  /** Iron: women depend on menstruation (DGE 2024). */
  | { type: 'iron'; male: number; female: Record<Menstruation, number> };

/** DGE terminology: Empfehlung (recommended), Schätzwert (estimate), Richtwert (guide value). */
export type ReferenceKind = 'recommended' | 'estimate' | 'guide';

export interface UpperLimit extends Cited {
  /** Amount per day in the BLS unit of `basis`. */
  value: number;
  /** Nutrient whose intake is checked (e.g. preformed retinol "RETOL" for vitamin A, synthetic "FOLAC" for folate). */
  basis: string;
  /** "supplements": only counts intake from supplements and manual entries marked as supplements. */
  scope: 'all' | 'supplements';
  /** EFSA "safe level of intake" rather than a formal UL. */
  safeLevel?: boolean;
}

export interface ReferenceValue extends Cited {
  nutrient: string;
  kind: ReferenceKind;
  amount: AmountSpec;
  /** Year of the DGE revision the value comes from. */
  year?: number;
  /**
   * The physiological (absorbed) requirement. If absent it is derived as amount × typical
   * absorption from parameters.ts, and flagged as derived.
   */
  physiological?: AmountSpec & Cited;
  /** Only an upper guide (e.g. saturated fat): there is no "low", only "too high". */
  limitOnly?: boolean;
  upperLimit?: UpperLimit;
}

/** Nutrients that are only shown as amounts (no requirement, no status). */
export interface InfoOnly {
  nutrient: string;
  note: string;
}

// ── Physiological parameters (model/parameters.ts) ─────────────────────────────

export interface Valued<T> extends Cited {
  value: T;
}

/** Per-meal absorption rule, chosen per nutrient. */
export type AbsorptionRule =
  | { type: 'fixed' }
  /** B12: a capped active route (intrinsic factor) plus a small passive fraction. */
  | {
      type: 'saturable';
      activeFraction: Valued<Range>;
      activeCapPerMeal: Valued<Range>;
      passiveFraction: Valued<Range>;
    }
  /** Fraction falls as the dose per meal rises; points are [dose, fraction], interpolated on log(dose). */
  | { type: 'doseTable'; points: Valued<ReadonlyArray<readonly [number, number]>>; scale: Valued<Range> }
  /** Fraction = a − b·ln(dose), clamped (Heaney-type load curve). */
  | { type: 'doseLog'; a: number; b: number; min: number; max: number; scale: Valued<Range> } & Cited
  /** Iron: heme / non-heme with enhancers and inhibitors (parameters in `iron`). */
  | { type: 'iron' };

export interface NutrientParams {
  /** Typical absorbed fraction at usual intakes, used to derive the physiological requirement. */
  typicalAbsorption: Valued<number> & { range?: [number, number] };
  rule: AbsorptionRule;
  /** Fat-soluble: absorption reduced in low-fat meals (parameters in `fatSoluble`). */
  fatSoluble?: boolean;
}

export type StorageModel =
  | {
      kind: 'tank';
      /** Capacity at the reference body weight, in the nutrient's unit (absorbed). Scaled linearly by weight. */
      capacity: Valued<Range> & { bySex?: { male: Range; female: Range } };
    }
  | { kind: 'tankDays'; capacityDays: Valued<Range> }
  /**
   * Averaged over a window of days. 'short' and 'long' are set in Settings; 'slow' is for nutrients the
   * body evens out over weeks to months, with the research behind it in `basis`.
   */
  | { kind: 'rolling'; window: 'short' | 'long' }
  | { kind: 'rolling'; window: 'slow'; basis: Cited };

export type Preparation = 'asListed' | 'raw' | 'boiled' | 'steamed' | 'baked' | 'fried';
export type Storage = 'fresh' | 'fridge' | 'freezer';

export type RetentionClass =
  | 'vitC'
  | 'folate'
  | 'thiamin'
  | 'riboflavin'
  | 'niacin'
  | 'b6'
  | 'b12'
  | 'vitA'
  | 'vitD'
  | 'vitE'
  | 'vitK'
  | 'pantothenic'
  | 'biotin'
  | 'minerals'
  | 'stable';
