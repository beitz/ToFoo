/**
 * Physiological model parameters: absorption, body stores, retention, sun synthesis, uncertainty.
 *
 * Rule: every number has a source and a confidence. Values with `confidence: 'assumption'` have no
 * good source yet and are listed in docs/OPEN_QUESTIONS.md. Model code in src/model/ must not
 * contain physiological numbers; it reads them from here and from reference-values.ts.
 *
 * Ranges: `low` is the pessimistic end (less absorbed, more lost) and `high` the optimistic end,
 * so the low / central / high model runs give a range for the user's status.
 *
 * Verification: see the note in reference-values.ts. Values marked "verify" were not checked against
 * the primary source during the first build session.
 */
import type {
  Cited,
  NutrientParams,
  Preparation,
  Range,
  RetentionClass,
  Storage,
  StorageModel,
  Valued,
} from '../src/model/paramTypes';

const r = (low: number, central: number, high: number): Range => ({ low, central, high });

const RATIO_NEUTRAL =
  'Ratio-neutral: the DGE value is an intake that already assumes typical absorption, so intake and requirement are both multiplied by this fraction and the status does not depend on it. Used only to show absorbed amounts.';
const NOT_SEPARATE = 'Absorption not modelled separately (1.0); the status compares intake with the DGE intake value.';

const fixed = (value: number, source: string, confidence: Cited['confidence'], note?: string, range?: [number, number]): NutrientParams => ({
  typicalAbsorption: { value, source, confidence, note: note ? `${note} ${RATIO_NEUTRAL}` : RATIO_NEUTRAL, ...(range ? { range } : {}) },
  rule: { type: 'fixed' },
});
const one = (): NutrientParams => ({
  typicalAbsorption: { value: 1, source: 'Modelling convention', confidence: 'high', note: NOT_SEPARATE },
  rule: { type: 'fixed' },
});

// ── Absorption per nutrient ─────────────────────────────────────────────────────

export const nutrientParams: Record<string, NutrientParams> = {
  ENERCC: one(),
  PROT625: one(),
  FAT: one(),
  CHO: one(),
  SUGAR: one(),
  FIBT: one(),
  FASAT: one(),
  'F18:2CN6': one(),
  'F18:3CN3': one(),
  EPADHA: one(),
  HIS: one(),
  ILE: one(),
  LEU: one(),
  LYS: one(),
  SAA: one(),
  AAA: one(),
  THR: one(),
  TRP: one(),
  VAL: one(),

  VITAA: {
    ...fixed(0.75, 'EFSA NDA Panel (2015): DRVs for vitamin A — preformed retinol is absorbed at 70–90 %', 'medium', 'Provitamin A conversion is already in the RAE unit. Verify.', [0.7, 0.9]),
    fatSoluble: true,
  },
  VITD: {
    ...fixed(0.8, 'EFSA NDA Panel (2016): DRVs for vitamin D — dietary vitamin D is well absorbed (~80 %)', 'low', 'Verify.', [0.55, 0.99]),
    fatSoluble: true,
  },
  VITE: {
    ...fixed(0.5, 'EFSA NDA Panel (2015): DRVs for vitamin E — absorption of α-tocopherol varies widely (~20–80 %)', 'low', 'Verify.', [0.2, 0.8]),
    fatSoluble: true,
  },
  VITK: {
    ...fixed(0.5, 'EFSA NDA Panel (2017): DRVs for vitamin K — phylloquinone absorption ranges from ~5–15 % (vegetables) to ~80 % (oils, supplements)', 'low', 'Verify.', [0.1, 0.8]),
    fatSoluble: true,
  },
  THIA: one(),
  RIBF: one(),
  NIAEQ: one(),
  PANTAC: one(),
  VITB6: one(),
  BIOT: one(),
  FOL: fixed(0.5, 'EFSA NDA Panel (2014): DRVs for folate — bioavailability of food folate ~50 % (basis of the DFE unit)', 'medium', undefined, [0.3, 0.8]),
  VITB12: {
    typicalAbsorption: {
      value: 0.5,
      source: 'IOM (1998) Dietary Reference Intakes: B vitamins, ch. 9 — about 50 % of B12 from food is absorbed at usual intakes',
      confidence: 'medium',
      note: 'Used to derive the absorbed requirement (4 µg × 0.5 = 2 µg/day). Verify.',
    },
    rule: {
      type: 'saturable',
      activeFraction: {
        value: r(0.4, 0.5, 0.6),
        source: 'IOM (1998), ch. 9; NIH ODS Vitamin B12 fact sheet (about 50–56 % of a ~1 µg dose)',
        confidence: 'medium',
      },
      activeCapPerMeal: {
        value: r(1.5, 2.0, 2.5),
        source: 'SCF (2000): Opinion on the tolerable upper intake level of vitamin B12 — ileal receptors saturate at ~1.5–2.5 µg per meal',
        url: 'https://ec.europa.eu/food/fs/sc/scf/out80d_en.pdf',
        confidence: 'high',
        note: 'Verified (search).',
      },
      passiveFraction: {
        value: r(0.01, 0.01, 0.02),
        source: 'SCF (2000) — about 1 % absorbed by passive diffusion, independent of intrinsic factor',
        url: 'https://ec.europa.eu/food/fs/sc/scf/out80d_en.pdf',
        confidence: 'high',
        note: 'Verified (search). Matters for high-dose supplements.',
      },
    },
  },
  VITC: {
    typicalAbsorption: {
      value: 0.85,
      source: 'Levine M et al. (1996) PNAS 93:3704–9; NIH ODS Vitamin C — 70–90 % absorbed at usual intakes',
      confidence: 'medium',
      range: [0.7, 0.9],
    },
    rule: {
      type: 'doseTable',
      points: {
        value: [
          [0, 0.9],
          [200, 0.9],
          [500, 0.73],
          [1250, 0.49],
          [3000, 0.3],
        ],
        source: 'Levine M et al. (1996) PNAS 93:3704–9: bioavailability complete up to 200 mg, ~73 % at 500 mg, ~49 % at 1250 mg',
        url: 'https://doi.org/10.1073/pnas.93.8.3704',
        confidence: 'medium',
        note: 'Central fraction at ≤200 mg set to 0.9 (usual-intake range). The 3000 mg point is an extrapolation (assumption).',
      },
      scale: { value: r(0.85, 1, 1.1), source: 'Spread around the central curve', confidence: 'assumption' },
    },
  },
  NA: fixed(0.95, 'EFSA NDA Panel (2019): DRVs for sodium — sodium is almost completely absorbed', 'medium', undefined, [0.9, 0.99]),
  CLD: fixed(0.95, 'EFSA NDA Panel (2019): DRVs for chloride — almost completely absorbed', 'medium'),
  K: fixed(0.9, 'EFSA NDA Panel (2016): DRVs for potassium — about 90 % absorbed', 'medium'),
  CA: {
    typicalAbsorption: {
      value: 0.3,
      source: 'EFSA NDA Panel (2015): DRVs for calcium — net absorption ~25–35 % at usual intakes',
      confidence: 'medium',
      range: [0.25, 0.35],
    },
    rule: {
      type: 'doseLog',
      a: 0.889,
      b: 0.0964,
      min: 0.1,
      max: 0.6,
      source: 'Heaney RP, Weaver CM, Fitzsimmons ML (1990): Influence of calcium load on absorption fraction. J Bone Miner Res 5:1135–8 (fraction = 0.889 − 0.0964·ln(load mg))',
      confidence: 'low',
      note: 'Coefficients recalled from the paper; could not be confirmed in this session. Verify.',
      scale: { value: r(0.85, 1, 1.15), source: 'Spread around the central curve', confidence: 'assumption' },
    },
  },
  MG: fixed(0.35, 'EFSA NDA Panel (2015): DRVs for magnesium — ~30–40 % absorbed', 'medium', undefined, [0.25, 0.5]),
  P: fixed(0.6, 'EFSA NDA Panel (2015): DRVs for phosphorus — ~55–70 % absorbed', 'medium', undefined, [0.55, 0.7]),
  FE: {
    typicalAbsorption: {
      value: 0.1,
      source: 'Derived: physiological requirement / recommended intake (EFSA 2015 losses vs DGE 2024 intake)',
      confidence: 'medium',
      note: 'Not used for iron: iron has an explicit physiological requirement and its own meal rule.',
    },
    rule: { type: 'iron' },
  },
  ZN: fixed(0.3, 'EFSA NDA Panel (2014): DRVs for zinc — fractional absorption ~30 %, lower with phytate', 'medium', 'Phytate is handled by the DGE phytate-dependent reference value.', [0.2, 0.4]),
  ID: fixed(0.92, 'EFSA NDA Panel (2014): DRVs for iodine — iodide is absorbed almost completely (>90 %)', 'high'),
  CU: fixed(0.5, 'EFSA NDA Panel (2015): DRVs for copper — ~50 % absorbed (range 30–70 %)', 'medium'),
  MN: fixed(0.05, 'EFSA NDA Panel (2013): DRVs for manganese — ~3–5 % absorbed', 'medium'),
  FD: fixed(0.8, 'EFSA NDA Panel (2013): DRVs for fluoride — ~80 % absorbed from food', 'medium'),
  CR: fixed(0.01, 'EFSA NDA Panel (2014): chromium — ~0.4–2.5 % absorbed', 'low'),
  MO: fixed(0.85, 'EFSA NDA Panel (2013): DRVs for molybdenum — highly absorbed (~85 %)', 'medium'),
};

// ── Body stores: tank vs rolling average ────────────────────────────────────────

/**
 * Tanks: long stores (weeks to years). Rolling: stored for days or not at all.
 * The tank / rolling split is a proposal (docs/OPEN_QUESTIONS.md) for the user to confirm.
 */
export const storage: Record<string, StorageModel> = {
  VITB12: {
    kind: 'tank',
    capacity: {
      value: r(2000, 3000, 5000),
      source: 'IOM (1998) DRI B vitamins, ch. 9; EFSA NDA (2015) DRVs for cobalamin — total body store ~2–5 mg in adults, half in the liver',
      confidence: 'medium',
      note: 'µg at 70 kg. At ~2 µg/day absorbed requirement, a full store lasts several years, matching the slow onset of deficiency. Verify.',
    },
  },
  VITAA: {
    kind: 'tank',
    capacity: {
      value: r(37_000, 187_000, 560_000),
      source:
        'Olson JA (1987) Am J Clin Nutr 45:704–16; IOM (2001) DRI vitamin A: adequate liver store ≥ 20 µg retinol/g liver, liver ≈ 2.4 % of body weight, liver holds ~90 % of body vitamin A',
      confidence: 'assumption',
      note: 'µg RAE at 70 kg. Low = 20 µg/g liver (minimum adequate), central = 100 µg/g, high = 300 µg/g (upper normal). The central concentration is an assumption.',
    },
  },
  VITD: {
    kind: 'tankDays',
    capacityDays: {
      value: r(30, 60, 120),
      source: 'Jones G (2008) Am J Clin Nutr 88:582S–6S: plasma 25(OH)D half-life ~2–3 weeks; additional storage in adipose tissue',
      confidence: 'assumption',
      note: 'Capacity expressed as days of the absorbed requirement. Chosen so that summer stores carry into autumn but not through winter.',
    },
  },
  FE: {
    kind: 'tank',
    capacity: {
      value: r(300, 1000, 1500),
      bySex: { male: r(500, 1000, 1500), female: r(100, 300, 500) },
      source: 'IOM (2001) DRI micronutrients, ch. 9 (iron): storage iron (ferritin, hemosiderin) ~1 g in men, ~0.3 g in women',
      confidence: 'medium',
      note: 'mg of storage iron (functional iron in haemoglobin is not counted). Reference weight 70 kg men, 60 kg women. Verify.',
    },
  },
  FOL: {
    kind: 'tank',
    capacity: {
      value: r(15_000, 22_000, 30_000),
      source: 'NIH ODS Folate fact sheet: total body folate ~15–30 mg, about half in the liver',
      confidence: 'medium',
      note: 'µg at 70 kg. With ~150 µg/day absorbed requirement a full store lasts ~4–5 months, in line with the onset of folate deficiency after ~4 months (Herbert 1962). Verify.',
    },
  },
  ID: {
    kind: 'tank',
    capacity: {
      value: r(10_000, 15_000, 20_000),
      source: 'NIH ODS Iodine fact sheet: body of a healthy adult contains 15–20 mg iodine, 70–80 % in the thyroid',
      confidence: 'medium',
      note: 'µg at 70 kg. Verify.',
    },
  },

  // Rolling averages. 'short' = default 7 days, 'long' = default 14 days (both set in Settings).
  ENERCC: { kind: 'rolling', window: 'short' },
  PROT625: { kind: 'rolling', window: 'short' },
  FAT: { kind: 'rolling', window: 'short' },
  CHO: { kind: 'rolling', window: 'short' },
  SUGAR: { kind: 'rolling', window: 'short' },
  FIBT: { kind: 'rolling', window: 'short' },
  FASAT: { kind: 'rolling', window: 'short' },
  'F18:2CN6': { kind: 'rolling', window: 'long' },
  'F18:3CN3': { kind: 'rolling', window: 'long' },
  EPADHA: { kind: 'rolling', window: 'long' },
  HIS: { kind: 'rolling', window: 'short' },
  ILE: { kind: 'rolling', window: 'short' },
  LEU: { kind: 'rolling', window: 'short' },
  LYS: { kind: 'rolling', window: 'short' },
  SAA: { kind: 'rolling', window: 'short' },
  AAA: { kind: 'rolling', window: 'short' },
  THR: { kind: 'rolling', window: 'short' },
  TRP: { kind: 'rolling', window: 'short' },
  VAL: { kind: 'rolling', window: 'short' },
  VITE: { kind: 'rolling', window: 'long' },
  VITK: { kind: 'rolling', window: 'long' },
  THIA: { kind: 'rolling', window: 'short' },
  RIBF: { kind: 'rolling', window: 'short' },
  NIAEQ: { kind: 'rolling', window: 'short' },
  PANTAC: { kind: 'rolling', window: 'short' },
  VITB6: { kind: 'rolling', window: 'short' },
  BIOT: { kind: 'rolling', window: 'short' },
  VITC: { kind: 'rolling', window: 'long' },
  NA: { kind: 'rolling', window: 'short' },
  CLD: { kind: 'rolling', window: 'short' },
  K: { kind: 'rolling', window: 'short' },
  CA: { kind: 'rolling', window: 'long' },
  MG: { kind: 'rolling', window: 'long' },
  P: { kind: 'rolling', window: 'long' },
  ZN: { kind: 'rolling', window: 'long' },
  CU: { kind: 'rolling', window: 'long' },
  MN: { kind: 'rolling', window: 'long' },
  FD: { kind: 'rolling', window: 'long' },
  CR: { kind: 'rolling', window: 'long' },
  MO: { kind: 'rolling', window: 'long' },
};

export const storageNotes: Cited = {
  source: 'Modelling choice (docs/SPEC.md "Two kinds of nutrient")',
  confidence: 'assumption',
  note:
    'Zinc is a rolling average because the body has no mobilisable zinc store (EFSA 2014). Vitamin C (body pool ~1.5 g, weeks) and vitamin E/K use the long window. Window lengths per nutrient are a proposal.',
};

/** Reference body weights for scaling tank capacities. */
export const referenceWeightKg: Valued<{ male: number; female: number; unknown: number }> = {
  value: { male: 70, female: 60, unknown: 70 },
  source: 'Modelling convention: capacities above are quoted for a 70 kg adult (iron: 70 kg men, 60 kg women)',
  confidence: 'high',
};

// ── Iron (rule type "iron") ─────────────────────────────────────────────────────

export const iron = {
  /** BLS main groups whose iron is partly heme and which count as "meat, fish, poultry" (MFP). */
  mfpGroups: {
    value: ['T', 'U', 'V', 'W'] as readonly string[],
    source: 'BLS food groups (data/README.md): fish, meat, poultry/offal, sausages',
    confidence: 'high',
  } satisfies Valued<readonly string[]>,
  hemeShareOfMfpIron: {
    value: r(0.3, 0.4, 0.5),
    source: 'Monsen ER et al. (1978) Am J Clin Nutr 31:134–41: ~40 % of iron in meat, fish and poultry is heme',
    confidence: 'medium',
    note: 'Later work shows 30–70 % depending on food. Composite dishes (BLS X/Y) are treated as non-heme only.',
  } satisfies Valued<Range>,
  hemeAbsorption: {
    value: r(0.15, 0.25, 0.35),
    source: 'Hallberg L (1981) / EFSA NDA (2015) DRVs for iron: heme iron absorption ~15–35 %, typically ~25 %',
    confidence: 'medium',
  } satisfies Valued<Range>,
  nonheme: {
    value: { base: 3, coefficient: 8.93, max: 8 },
    source:
      'Monsen ER, Balintfy JL (1982) J Am Diet Assoc 80:307–11: non-heme absorption (%) = 3 + 8.93·ln((EF + 100)/100), max 8 %, where EF = mg vitamin C + g meat/fish/poultry in the meal',
    url: 'https://pubmed.ncbi.nlm.nih.gov/7061776/',
    confidence: 'medium',
    note: 'Assumes moderate iron stores (500 mg); people with low stores absorb more. Formula recalled; verify.',
  } satisfies Valued<{ base: number; coefficient: number; max: number }>,
  nonhemeScale: {
    value: r(0.8, 1, 1.25),
    source: 'Spread around the Monsen curve',
    confidence: 'assumption',
  } satisfies Valued<Range>,
  tea: {
    value: r(0.3, 0.4, 0.6),
    source: 'Hurrell RF, Reddy M, Cook JD (1999) Br J Nutr 81:289–95: black tea reduced non-heme iron absorption by ~60–90 %',
    confidence: 'medium',
    note: 'Multiplier on non-heme absorption when tea is part of the meal. Herbal and fruit teas are not counted.',
  } satisfies Valued<Range>,
  coffee: {
    value: r(0.4, 0.6, 0.8),
    source: 'Morck TA, Lynch SR, Cook JD (1983) Am J Clin Nutr 37:416–20: a cup of coffee reduced iron absorption by ~40 %',
    confidence: 'medium',
  } satisfies Valued<Range>,
  calcium: {
    value: { fromMg: 40, fullMg: 300, factor: r(0.4, 0.5, 0.7) },
    source: 'Hallberg L et al. (1991) Am J Clin Nutr 53:112–9: calcium inhibits heme and non-heme iron absorption dose-dependently, ~50–60 % at ~300 mg per meal',
    confidence: 'low',
    note: 'Linear ramp from no effect at 40 mg to the full factor at 300 mg per meal is a simplification (assumption).',
  } satisfies Valued<{ fromMg: number; fullMg: number; factor: Range }>,
  phytate: {
    value: { groups: ['H', 'C', 'B'] as readonly string[], fullGrams: 100, factor: r(0.25, 0.5, 0.75) },
    source: 'Hallberg L, Brune M, Rossander L (1989) Am J Clin Nutr 49:140–4: small amounts of phytate strongly inhibit non-heme iron absorption',
    confidence: 'assumption',
    note: 'BLS has no phytate. Phytate is estimated from grams of legumes, nuts, seeds (H), cereals (C) and bread (B) in the meal; full effect from 100 g. Refined grains are over-counted.',
  },
  /** Drinks detected by English BLS name as tea / coffee (meal modifiers). */
  teaPattern: { value: '\\btea\\b', source: 'Food-name match', confidence: 'high' } satisfies Valued<string>,
  teaExcludePattern: { value: 'herbal|fruit|peppermint|camomile|chamomile|rooibos|mint', source: 'Food-name match', confidence: 'high' } satisfies Valued<string>,
  coffeePattern: { value: '\\b(coffee|espresso|cappuccino|latte macchiato|mocha)\\b', source: 'Food-name match', confidence: 'high' } satisfies Valued<string>,
};

// ── Fat-soluble vitamins ────────────────────────────────────────────────────────

export const fatSoluble = {
  thresholdFatG: {
    value: r(10, 5, 3),
    source:
      'Roodenburg AJC et al. (2000) Am J Clin Nutr 71:1187–93: 3 g fat per meal sufficient for α-/β-carotene absorption; Dawson-Hughes B et al. (2015) J Acad Nutr Diet 115:225–30: vitamin D3 absorbed ~32 % better with a fat-containing meal',
    confidence: 'assumption',
    note: 'Meal fat below which absorption is reduced (low run uses the higher threshold).',
  } satisfies Valued<Range>,
  minFactor: {
    value: r(0.5, 0.7, 0.85),
    source: 'Dawson-Hughes et al. (2015): ~25 % lower absorption without fat (1/1.32 ≈ 0.76)',
    confidence: 'assumption',
    note: 'Factor at 0 g fat; rises linearly to 1 at the threshold.',
  } satisfies Valued<Range>,
};

// ── Cooking and storage losses ──────────────────────────────────────────────────

export const retentionClassOf: Record<string, RetentionClass> = {
  VITC: 'vitC',
  FOL: 'folate',
  FOLAC: 'folate',
  THIA: 'thiamin',
  RIBF: 'riboflavin',
  NIAEQ: 'niacin',
  NIA: 'niacin',
  VITB6: 'b6',
  VITB12: 'b12',
  VITAA: 'vitA',
  VITA: 'vitA',
  RETOL: 'vitA',
  CARTB: 'vitA',
  VITD: 'vitD',
  VITE: 'vitE',
  VITK: 'vitK',
  PANTAC: 'pantothenic',
  BIOT: 'biotin',
  NA: 'minerals',
  CLD: 'minerals',
  K: 'minerals',
  CA: 'minerals',
  MG: 'minerals',
  P: 'minerals',
  FE: 'minerals',
  ZN: 'minerals',
  ID: 'minerals',
  CU: 'minerals',
  MN: 'minerals',
  FD: 'minerals',
  CR: 'minerals',
  MO: 'minerals',
};

type RetentionTable = Partial<Record<RetentionClass, Range>>;

const USDA_RF6 =
  'USDA (2007): USDA Table of Nutrient Retention Factors, Release 6 — approximate class averages across foods (not per food)';

/** Retention when a raw BLS ingredient is cooked. Missing classes = 1 (no loss). */
export const preparationRetention: Valued<Record<Preparation, RetentionTable>> = {
  value: {
    asListed: {},
    raw: {},
    boiled: {
      vitC: r(0.45, 0.6, 0.75),
      folate: r(0.5, 0.7, 0.85),
      thiamin: r(0.7, 0.8, 0.9),
      riboflavin: r(0.75, 0.85, 0.95),
      niacin: r(0.7, 0.8, 0.9),
      b6: r(0.7, 0.8, 0.9),
      b12: r(0.75, 0.85, 0.95),
      vitA: r(0.8, 0.9, 1),
      vitE: r(0.85, 0.95, 1),
      vitK: r(0.85, 0.95, 1),
      pantothenic: r(0.7, 0.8, 0.9),
      biotin: r(0.75, 0.85, 0.95),
      minerals: r(0.8, 0.9, 0.97),
    },
    steamed: {
      vitC: r(0.65, 0.8, 0.9),
      folate: r(0.7, 0.85, 0.95),
      thiamin: r(0.8, 0.9, 0.95),
      riboflavin: r(0.85, 0.95, 1),
      niacin: r(0.8, 0.9, 0.95),
      b6: r(0.8, 0.9, 0.95),
      b12: r(0.8, 0.9, 0.95),
      vitA: r(0.85, 0.95, 1),
      pantothenic: r(0.8, 0.9, 0.95),
      minerals: r(0.9, 0.97, 1),
    },
    baked: {
      vitC: r(0.55, 0.7, 0.85),
      folate: r(0.6, 0.75, 0.9),
      thiamin: r(0.6, 0.75, 0.85),
      riboflavin: r(0.8, 0.9, 1),
      niacin: r(0.75, 0.85, 0.95),
      b6: r(0.6, 0.75, 0.85),
      b12: r(0.75, 0.85, 0.95),
      vitA: r(0.8, 0.9, 1),
      vitE: r(0.75, 0.85, 0.95),
      pantothenic: r(0.7, 0.8, 0.9),
    },
    fried: {
      vitC: r(0.55, 0.7, 0.85),
      folate: r(0.55, 0.7, 0.85),
      thiamin: r(0.7, 0.8, 0.9),
      riboflavin: r(0.8, 0.9, 1),
      niacin: r(0.75, 0.85, 0.95),
      b6: r(0.7, 0.8, 0.9),
      b12: r(0.75, 0.85, 0.95),
      vitA: r(0.75, 0.85, 0.95),
      vitE: r(0.7, 0.8, 0.9),
      pantothenic: r(0.7, 0.8, 0.9),
    },
  },
  source: USDA_RF6,
  url: 'https://www.ars.usda.gov/ARSUserFiles/80400525/Data/retn/retn06.pdf',
  confidence: 'low',
  note: 'Prefer BLS cooked entries ("gekocht", "gedünstet", …) where they exist; these factors are for raw ingredients cooked at home. Verify per nutrient class.',
};

/** Extra losses by how a cooked portion was stored before eating. */
export const storageRetention: Valued<Record<Storage, RetentionTable>> = {
  value: {
    fresh: {},
    fridge: {
      vitC: r(0.8, 0.9, 0.97),
      folate: r(0.85, 0.95, 1),
    },
    freezer: {
      vitC: r(0.6, 0.75, 0.9),
      folate: r(0.7, 0.85, 0.95),
      thiamin: r(0.8, 0.9, 0.97),
      riboflavin: r(0.9, 0.97, 1),
      b6: r(0.85, 0.95, 1),
      vitA: r(0.85, 0.95, 1),
    },
  },
  source: 'USDA Retention Factors Release 6 (reheated items) and Rickman JC et al. (2007) J Sci Food Agric 87:930–44 — approximate',
  confidence: 'assumption',
  note: 'Fridge = one day chilled and reheated; freezer = frozen, thawed and reheated. Rough class averages.',
};

// ── Uncertainty ─────────────────────────────────────────────────────────────────

export const uncertainty = {
  /** Relative uncertainty of the amount, by entry confidence (A measured, B standard, C estimate). */
  amountByConfidence: {
    value: { A: 0.05, B: 0.25, C: 0.5 },
    source: 'Modelling choice',
    confidence: 'assumption',
    note: 'Weighed amounts ±5 %, estimated portions ±25 %, rough estimates ±50 %.',
  } satisfies Valued<Record<'A' | 'B' | 'C', number>>,
  /** Relative uncertainty of a BLS value by its provenance code (data/README.md). */
  dataByProvenance: {
    value: { A: 0.1, B: 0.1, F: 0.1, L: 0.15, G: 0.15, D: 0.15, R: 0.2, S: 0.2, M: 0.25, U: 0.3, N: 0.3, Z: 0, T: 0, '-': 0.3 } as Record<string, number>,
    source: 'Modelling choice based on the BLS provenance categories',
    confidence: 'assumption',
  } satisfies Valued<Record<string, number>>,
  maxRelative: { value: 0.9, source: 'Modelling choice', confidence: 'assumption' } satisfies Valued<number>,
  /** How many known days to average for imputing not-logged days (central run). */
  imputationLookbackDays: { value: 14, source: 'Modelling choice', confidence: 'assumption' } satisfies Valued<number>,
};

// ── Starting levels and status thresholds ──────────────────────────────────────

export const startingLevels = {
  averageFraction: {
    value: 0.6,
    source: 'Modelling choice',
    confidence: 'assumption',
    note: '"Average" start = tanks 60 % full (inside the "fine" zone). Realistic for a typical diet but not individual.',
  } satisfies Valued<number>,
};

export const statusThresholds = {
  tank: {
    value: { low: 0.2, gettingLow: 0.4 },
    source: 'Modelling choice',
    confidence: 'assumption',
    note: 'Share of tank capacity.',
  } satisfies Valued<{ low: number; gettingLow: number }>,
  rolling: {
    value: { low: 0.7, gettingLow: 0.9 },
    source: 'Modelling choice: DGE recommended intakes are set ~20–30 % above the average requirement, so < 70 % of the reference suggests intake below most people’s need',
    confidence: 'assumption',
    note: 'Share of the (absorbed) requirement.',
  } satisfies Valued<{ low: number; gettingLow: number }>,
};

// ── Vitamin D from sunlight ─────────────────────────────────────────────────────

export const sun = {
  uvIndexClearSky: {
    value: { coefficient: 12.5, exponent: 2.42 },
    source: 'Madronich S (2007) Photochem Photobiol 83:1537–8: clear-sky UV index ≈ 12.5·μ₀^2.42 (μ₀ = cosine of the solar zenith angle)',
    confidence: 'medium',
  } satisfies Valued<{ coefficient: number; exponent: number }>,
  erythemalWm2PerUvi: {
    value: 0.025,
    source: 'WHO (2002) Global Solar UV Index: 1 UVI = 25 mW/m² erythemally weighted irradiance',
    confidence: 'high',
  } satisfies Valued<number>,
  medJm2: {
    value: r(350, 300, 250),
    source: 'Fitzpatrick skin type II ≈ 250 J/m², type III ≈ 350 J/m² (CIE minimal erythema dose)',
    confidence: 'assumption',
    note: 'Central: between type II and III (typical central European skin). The low run uses the higher MED (less synthesis per exposure).',
  } satisfies Valued<Range>,
  yieldPerFullBodyMedUg: {
    value: r(250, 400, 625),
    source: 'Holick MF (2004) Am J Clin Nutr 80:1678S–88S: 1 MED whole-body exposure ≈ 10,000–25,000 IU (250–625 µg) vitamin D3',
    confidence: 'medium',
  } satisfies Valued<Range>,
  maxMedPerDay: {
    value: 1,
    source: 'Holick MF (2004): previtamin D3 reaches a plateau; exposure beyond ~1 MED adds little',
    confidence: 'medium',
  } satisfies Valued<number>,
  realWorldFactor: {
    value: r(0.3, 0.45, 0.6),
    source: 'Assumption combining cloud cover in Germany and body geometry (upright body surfaces receive roughly half of horizontal UV)',
    confidence: 'assumption',
  } satisfies Valued<Range>,
  elevationRampDeg: {
    value: { zero: 25, full: 45 },
    source:
      'Webb AR, Kline L, Holick MF (1988) J Clin Endocrinol Metab 67:373–8 ("vitamin D winter": no synthesis at 52°N from November to February); shadow rule: little synthesis when the sun is below ~45°',
    confidence: 'assumption',
    note: 'Vitamin-D effectiveness of UV relative to erythemal UV, ramped from 0 at 25° to 1 at 45° solar elevation.',
  } satisfies Valued<{ zero: number; full: number }>,
  /** Share of body surface exposed (rule of nines, approximate). */
  skinFractions: {
    value: { faceHands: 0.08, faceHandsForearms: 0.15, faceHandsArms: 0.25, armsLegs: 0.45, mostOfBody: 0.8 },
    source: 'Wallace rule of nines (body surface area), approximate',
    confidence: 'medium',
  } satisfies Valued<Record<string, number>>,
  defaultLongitudeDeg: {
    value: 10,
    source: 'Central Germany; only used to place solar noon (≈ 12:20 CET)',
    confidence: 'high',
  } satisfies Valued<number>,
  defaultRoutine: {
    value: { minutesPerDay: 15, startHour: 12, skin: 'faceHands' as const },
    source: 'Default for "little time outdoors" (docs/SPEC.md)',
    confidence: 'assumption',
  },
};

/** Recommended exposure for comparison in the wiki / settings help. */
export const sunGuidance: Cited = {
  source:
    'RKI / BfR / DGE FAQ Vitamin D: from March to October, exposing face, hands and arms (about a quarter of the body) to the sun 2–3 times a week for half the time needed for sunburn (~12–25 min) is enough for sufficient vitamin D production',
  confidence: 'high',
};
