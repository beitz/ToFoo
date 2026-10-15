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
 * Checked 2026-10-15 against primary sources where they were reachable: PubMed abstracts, the IOM
 * Dietary Reference Intakes (National Academies Press, full text), the USDA retention table (full data
 * file) and EFSA abstracts. The full EFSA opinions (EFSA Journal) were not reachable from the build
 * environment; values that rest only on them say "not re-checked".
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
    ...fixed(0.75, 'IOM (2001) DRI Vitamin A, ch. 4: "The efficiency of absorption of preformed vitamin A is generally high, in the range of 70 to 90 percent"', 'high', 'Provitamin A conversion is already in the RAE unit. Checked (IOM full text).', [0.7, 0.9]),
    fatSoluble: true,
  },
  VITD: {
    ...fixed(0.8, 'EFSA NDA Panel (2016): DRVs for vitamin D — dietary vitamin D is well absorbed (~80 %)', 'low', 'Not re-checked (EFSA opinion not reachable).', [0.55, 0.99]),
    fatSoluble: true,
  },
  VITE: {
    ...fixed(0.5, 'EFSA NDA Panel (2015): DRVs for vitamin E — absorption of α-tocopherol varies widely (~20–80 %)', 'low', 'Not re-checked (EFSA opinion not reachable).', [0.2, 0.8]),
    fatSoluble: true,
  },
  VITK: {
    ...fixed(0.5, 'EFSA NDA Panel (2017): DRVs for vitamin K — "it is not possible to estimate precisely an average absorption of phylloquinone, menaquinones, and thus vitamin K from the diet"', 'assumption', 'Placeholder: EFSA gives no average absorption (checked, full text). Only affects the absorbed amount shown, not the status.', [0.1, 0.8]),
    fatSoluble: true,
  },
  THIA: one(),
  RIBF: one(),
  NIAEQ: one(),
  PANTAC: one(),
  VITB6: one(),
  BIOT: one(),
  FOL: fixed(0.5, 'IOM (1998) DRI B vitamins, ch. 8: dietary folate equivalents adjust for the "nearly 50 percent lower bioavailability of food folate compared with that of folic acid"', 'medium', 'Checked (IOM full text). Used to derive the absorbed requirement for the folate tank.', [0.3, 0.8]),
  VITB12: {
    typicalAbsorption: {
      value: 0.5,
      source: 'IOM (1998) DRI B vitamins, ch. 9: "An assumed absorption of 50 percent is included in the recommended intake"',
      url: 'https://doi.org/10.17226/6015',
      confidence: 'high',
      note: 'Used to derive the absorbed requirement (4 µg × 0.5 = 2 µg/day). Checked (IOM full text).',
    },
    rule: {
      type: 'saturable',
      activeFraction: {
        value: r(0.4, 0.5, 0.6),
        source: 'IOM (1998) DRI B vitamins, ch. 9 (Adams et al. 1971): "nearly 50 percent was retained at a 1-µg dose, 20 percent at a 5-µg dose, and just over 5 percent at a 25-µg dose"',
        url: 'https://doi.org/10.17226/6015',
        confidence: 'high',
        note: 'Checked (IOM full text).',
      },
      activeCapPerMeal: {
        value: r(1.0, 1.5, 2.5),
        source:
          'IOM (1998) ch. 9: "a B12 content of 1.5 to 2.5 µg/meal saturates ileal receptors" (Scott 1997); absorbed amounts of ~1.0 µg from 5 µg and ~1.3 µg from 25 µg (Adams 1971); SCF (2000) likewise 1.5–2.5 µg',
        url: 'https://doi.org/10.17226/6015',
        confidence: 'high',
        note: 'Central 1.5 µg fits both the saturation range and the measured dose series. A second dose 4–6 h later is absorbed as well as the first (Heyssel 1966, via IOM), which supports saturation per meal. Checked (IOM full text).',
      },
      passiveFraction: {
        value: r(0.01, 0.01, 0.02),
        source: 'IOM (1998) ch. 9: "up to approximately 1 percent of the dose may be absorbed by mass action even in the absence of intrinsic factor"; SCF (2000) likewise ~1 %',
        url: 'https://doi.org/10.17226/6015',
        confidence: 'high',
        note: 'Checked (IOM full text). Matters for high-dose supplements.',
      },
    },
  },
  VITC: {
    typicalAbsorption: {
      value: 1,
      source: 'Levine M et al. (1996) PNAS 93:3704–9: "Bioavailability was complete for 200 mg of vitamin C as a single dose"',
      url: 'https://doi.org/10.1073/pnas.93.8.3704',
      confidence: 'medium',
      range: [0.7, 1],
      note: 'Checked (abstract). Older estimates give 70–90 % at usual intakes (lower end of the range).',
    },
    rule: {
      type: 'doseTable',
      points: {
        value: [
          [0, 1],
          [200, 1],
          [500, 0.73],
          [1250, 0.49],
          [3000, 0.3],
        ],
        source: 'Levine M et al. (1996) PNAS 93:3704–9: bioavailability complete for 200 mg; "At single doses of 500 mg and higher, bioavailability declined"',
        url: 'https://doi.org/10.1073/pnas.93.8.3704',
        confidence: 'medium',
        note: 'Abstract checked (complete ≤200 mg, decline from 500 mg). The 73 % (500 mg) and 49 % (1250 mg) points are from the paper body and were not re-checked; the 3000 mg point is an extrapolation (assumption).',
      },
      scale: { value: r(0.75, 1, 1), source: 'Spread around the central curve; low end covers the older 70–90 % estimates', confidence: 'assumption' },
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
      url: 'https://doi.org/10.1002/jbmr.5650051107',
      confidence: 'medium',
      note: 'Abstract checked: absorption "highly inversely correlated with the logarithm of load", 64.0 % at the lowest load (15 mg) and 28.6 % at 500 mg; the formula gives 63 % and 29 %. Coefficients themselves are from the paper body (not re-checked). The study covered 15–500 mg per meal; larger loads are extrapolated.',
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
  ID: fixed(0.92, 'EFSA NDA Panel (2014): DRVs for iodine — "an absorption efficiency for iodine of 92 %"', 'high', 'Checked (abstract).'),
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
      value: r(2000, 2500, 3000),
      source:
        'IOM (1998) DRI B vitamins, ch. 9: "Estimates of the average total-body B12 pool in adults range from 0.6 to 3.9 mg, but most estimates are between 2 and 3 mg"; liver takes up ~50 %',
      url: 'https://doi.org/10.17226/6015',
      confidence: 'high',
      note: 'µg at 70 kg. IOM also reports losses of 0.1–0.2 % of the pool per day and deficiency 2–5 years after total gastrectomy, consistent with a store lasting years. Checked (IOM full text).',
    },
  },
  VITAA: {
    kind: 'tank',
    capacity: {
      value: r(46_000, 231_000, 693_000),
      source:
        'IOM (2001) DRI Vitamin A, ch. 4: minimal acceptable liver reserve 20 µg retinol/g; liver weight:body weight 1:33 (0.03); total body:liver reserves 10:9 (1.1); ~0.5 % of body stores lost per day; storage efficiency ~40–50 %',
      url: 'https://doi.org/10.17226/10026',
      confidence: 'assumption',
      note: 'µg RAE at 70 kg = liver µg/g × 0.03 × 70,000 g × 1.1. Low = 20 µg/g (IOM minimum), central = 100 µg/g, high = 300 µg/g. IOM factors checked (full text); the central and high liver concentrations are assumptions.',
    },
  },
  VITD: {
    kind: 'tankDays',
    capacityDays: {
      value: r(30, 60, 120),
      source: 'Jones G (2008) Am J Clin Nutr 88:582S–6S: vitamin D in adipose tissue has a half-life of ~2 months; 25(OH)D3 ~15 days',
      url: 'https://doi.org/10.1093/ajcn/88.2.582S',
      confidence: 'low',
      note: 'Capacity expressed as days of the absorbed requirement; central 60 days ≈ the ~2-month half-life (abstract checked). Mapping a half-life to a tank size is a simplification.',
    },
  },
  FE: {
    kind: 'tank',
    capacity: {
      value: r(300, 1000, 1500),
      bySex: { male: r(500, 1000, 1500), female: r(100, 300, 500) },
      source:
        'IOM (2001) DRI micronutrients, ch. 9: a 75-kg man contains ~4 g iron, of which a "readily mobilizable iron store contains another 25 percent" (≈1 g); menstruating women have a smaller store; 1 µg/L serum ferritin ≈ 8 mg storage iron (Bothwell 1979)',
      url: 'https://doi.org/10.17226/10026',
      confidence: 'medium',
      note: 'mg of storage iron (haemoglobin iron not counted). Men ~1 g checked (IOM full text); the ~0.3 g for women follows from typical ferritin values of women (~35–40 µg/L × 8 mg) and was not checked against a single source. The ferritin rule allows calibrating from a blood test (v3).',
    },
  },
  FOL: {
    kind: 'tank',
    capacity: {
      value: r(12_000, 22_000, 28_000),
      source: 'IOM (1998) DRI B vitamins, ch. 8: "the estimated total body folate store would be 12 to 28 mg"; ~22 mg from autopsy liver concentrations (Hoppner & Lampi 1980)',
      url: 'https://doi.org/10.17226/6015',
      confidence: 'medium',
      note: 'µg at 70 kg. With ~150 µg/day absorbed requirement a full store lasts ~4–5 months. Checked (IOM full text).',
    },
  },
  ID: {
    kind: 'tank',
    capacity: {
      value: r(10_000, 15_000, 20_000),
      source: 'NIH ODS Iodine fact sheet: body of a healthy adult contains 15–20 mg iodine, 70–80 % in the thyroid',
      confidence: 'medium',
      note: 'µg at 70 kg. Not re-checked (the NIH site blocked automated access); EFSA (2014, abstract) confirms "large iodine stores" with adequate status.',
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
    source: 'Monsen ER, Balintfy JL (1982) J Am Diet Assoc 80:307–11: "approximately 60 percent of the iron in meat, fish, and poultry" is non-heme (i.e. ~40 % heme)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/7061776/',
    confidence: 'high',
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
    note: 'Assumes moderate iron stores (500 mg); people with low stores absorb more. The abstract confirms the model (enhancement by ascorbic acid and meat/fish/poultry); the formula itself is from the paper body and was not re-checked.',
  } satisfies Valued<{ base: number; coefficient: number; max: number }>,
  nonhemeScale: {
    value: r(0.8, 1, 1.25),
    source: 'Spread around the Monsen curve',
    confidence: 'assumption',
  } satisfies Valued<Range>,
  tea: {
    value: r(0.1, 0.3, 0.4),
    source:
      'Hurrell RF, Reddy M, Cook JD (1999) Br J Nutr 81:289–95: with a bread meal, inhibition by black tea 79–94 %, peppermint tea 84 %, cocoa 71 %, camomile 47 %; Morck TA et al. (1983): tea −64 % with a hamburger meal',
    url: 'https://pubmed.ncbi.nlm.nih.gov/10999016/',
    confidence: 'medium',
    note: 'Multiplier on non-heme absorption when tea (incl. herbal teas) or cocoa is part of the meal. Central 0.3 lies between the bread-meal and hamburger-meal results. Milk does not change the effect (Hurrell). Abstracts checked.',
  } satisfies Valued<Range>,
  coffee: {
    value: r(0.3, 0.6, 0.7),
    source:
      'Morck TA, Lynch SR, Cook JD (1983) Am J Clin Nutr 37:416–20: a cup of coffee reduced iron absorption from a hamburger meal by 39 %, from a semipurified meal from 5.88 % to 1.64 % (−72 %); no effect 1 h before the meal, full effect 1 h after',
    url: 'https://pubmed.ncbi.nlm.nih.gov/6402915/',
    confidence: 'high',
    note: 'Abstract checked. The timing result supports counting drinks within the meal window.',
  } satisfies Valued<Range>,
  calcium: {
    value: { fromMg: 40, fullMg: 300, factor: r(0.4, 0.45, 0.5) },
    source:
      'Hallberg L et al. (1991) Am J Clin Nutr 53:112–9: doses of 40–600 mg Ca studied; inhibition "clearly dose related up to 300 mg"; absorption reduced by 50–60 % at 300–600 mg; 165 mg Ca as milk or cheese also reduced it by 50–60 %; heme iron affected too',
    url: 'https://pubmed.ncbi.nlm.nih.gov/1984335/',
    confidence: 'medium',
    note: 'Abstract checked. The linear ramp from 40 to 300 mg is a simplification; with dairy the full effect may come earlier (165 mg).',
  } satisfies Valued<{ fromMg: number; fullMg: number; factor: Range }>,
  phytate: {
    value: { groups: ['H', 'C', 'B'] as readonly string[], fullGrams: 100, factor: r(0.2, 0.35, 0.6) },
    source:
      'Hallberg L, Brune M, Rossander L (1989) Am J Clin Nutr 49:140–4: phytate inhibited iron absorption by 18 % at 2 mg, 64 % at 25 mg and 82 % at 250 mg phytate-phosphorus; ascorbic acid counteracted it',
    url: 'https://pubmed.ncbi.nlm.nih.gov/2911999/',
    confidence: 'assumption',
    note: 'Dose-response checked (abstract). BLS has no phytate, so the amount is estimated from grams of legumes, nuts, seeds (H), cereals (C) and bread (B) in the meal, full effect from 100 g; refined grains are over-counted, hence a milder central factor than the study.',
  },
  /** Drinks detected by English BLS name as tea / coffee (meal modifiers). */
  teaPattern: { value: '\\b(tea|cocoa|hot chocolate)\\b', source: 'Food-name match (black, green and herbal teas and cocoa all inhibit, Hurrell 1999)', confidence: 'high' } satisfies Valued<string>,
  teaExcludePattern: { value: 'fruit|rooibos', source: 'Food-name match: fruit and rooibos teas were not studied', confidence: 'assumption' } satisfies Valued<string>,
  coffeePattern: { value: '\\b(coffee|espresso|cappuccino|latte macchiato|mocha)\\b', source: 'Food-name match', confidence: 'high' } satisfies Valued<string>,
  coffeeExcludePattern: { value: 'coffee cream|substitute|chicory|yogurt', source: 'Food-name match: not coffee drinks, or not studied', confidence: 'assumption' } satisfies Valued<string>,
  /** Only drinks count as tea / coffee / cocoa (not biscuits, cakes or cocoa butter). */
  drinkGroups: { value: ['N', 'M'] as readonly string[], source: 'BLS groups: non-alcoholic beverages (N), milk drinks (M)', confidence: 'high' } satisfies Valued<readonly string[]>,
};

// ── Fat-soluble vitamins ────────────────────────────────────────────────────────

export const fatSoluble = {
  thresholdFatG: {
    value: r(5, 3, 1),
    source:
      'Roodenburg AJC et al. (2000) Am J Clin Nutr 71:1187–93: 3 g vs 36 g fat with the meal did not change the response to vitamin E or α-/β-carotene ("Optimal uptake … requires a limited amount of fat"); lutein esters needed more',
    url: 'https://pubmed.ncbi.nlm.nih.gov/10799382/',
    confidence: 'medium',
    note: 'Meal fat below which absorption is reduced (low run uses the higher threshold). Abstract checked; no data below 3 g.',
  } satisfies Valued<Range>,
  minFactor: {
    value: r(0.66, 0.76, 0.9),
    source:
      'Dawson-Hughes B et al. (2015) J Acad Nutr Diet 115:225–30: peak plasma vitamin D3 32 % (95 % CI 11–52 %) higher with a fat-containing than with a fat-free meal → fat-free ≈ 1/1.32 = 0.76 (0.66–0.90)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/25441954/',
    confidence: 'medium',
    note: 'Factor at 0 g fat; rises linearly to 1 at the threshold. Measured for vitamin D3; applied to A, E and K as well (assumption). Abstract checked.',
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

const USDA_RF6 = 'USDA (2007): USDA Table of Nutrient Retention Factors, Release 6';

/** Retention when a raw BLS ingredient is cooked. Missing classes = 1 (no loss). */
export const preparationRetention: Valued<Record<Preparation, RetentionTable>> = {
  value: {
    asListed: {},
    raw: {},
    // Low / central / high = 10th / 50th / 90th percentile of all USDA factors for that cooking
    // method and nutrient (n = number of food categories), rounded to 5 %.
    boiled: {
      vitC: r(0.65, 0.8, 0.85), // n = 74
      folate: r(0.55, 0.7, 0.8),
      thiamin: r(0.4, 0.6, 0.9),
      riboflavin: r(0.75, 0.9, 1),
      niacin: r(0.55, 0.9, 0.95),
      b6: r(0.5, 0.65, 0.95),
      b12: r(0.6, 0.75, 1),
      vitA: r(0.75, 0.8, 0.95),
      minerals: r(0.65, 0.95, 1), // Ca, Fe, Mg, P, K, Zn, Cu; n = 518
    },
    steamed: {
      vitC: r(0.7, 0.8, 0.8), // n = 6 (steamed and stewed categories)
      folate: r(0.5, 0.75, 0.8),
      thiamin: r(0.8, 0.9, 0.95),
      riboflavin: r(0.9, 0.95, 0.95),
      niacin: r(0.9, 0.9, 0.95),
      b6: r(0.9, 0.9, 0.95),
      b12: r(0.9, 1, 1),
      vitA: r(0.75, 0.9, 0.9),
      minerals: r(0.9, 1, 1),
    },
    baked: {
      vitC: r(0.8, 0.8, 0.85), // n = 35 (baked and roasted)
      folate: r(0.6, 0.8, 0.95),
      thiamin: r(0.55, 0.8, 0.95),
      riboflavin: r(0.85, 0.95, 1),
      niacin: r(0.75, 0.95, 1),
      b6: r(0.5, 0.9, 0.95),
      b12: r(0.65, 0.9, 1),
      vitA: r(0.75, 0.9, 1),
      minerals: r(0.8, 1, 1),
    },
    fried: {
      vitC: r(0.7, 0.8, 0.85), // n = 58 (fried, broiled, sautéed)
      folate: r(0.55, 0.8, 0.9),
      thiamin: r(0.65, 0.8, 0.9),
      riboflavin: r(0.8, 0.95, 1),
      niacin: r(0.8, 0.9, 1),
      b6: r(0.6, 0.9, 0.95),
      b12: r(0.75, 0.9, 1),
      vitA: r(0.75, 0.85, 0.95),
      minerals: r(0.8, 1, 1),
    },
  },
  source: USDA_RF6,
  url: 'https://www.ars.usda.gov/ARSUserFiles/80400525/Data/retn/retn06.txt',
  confidence: 'medium',
  note: 'Computed on 2026-10-15 from the USDA data file (6,994 factors): 10th/50th/90th percentiles across food categories per method. USDA has no factors for vitamins D, E, K, pantothenic acid and biotin, so no loss is modelled for them (see docs/OPEN_QUESTIONS.md). Prefer BLS cooked entries ("gekocht", "gedünstet", …) where they exist; these factors are for raw ingredients cooked at home.',
};

/** Extra losses by how a cooked portion was stored before eating. */
export const storageRetention: Valued<Record<Storage, RetentionTable>> = {
  value: {
    fresh: {},
    // Reheating: USDA "reheated" categories (n = 28): vitamin C, folate, thiamin 95 %, B6 98–100 %, others 100 %.
    fridge: {
      vitC: r(0.85, 0.95, 0.95),
      folate: r(0.85, 0.95, 0.95),
      thiamin: r(0.9, 0.95, 0.95),
    },
    // Freezer: reheating as above × an assumed small loss during frozen storage (central 0.95).
    freezer: {
      vitC: r(0.75, 0.9, 0.95),
      folate: r(0.75, 0.9, 0.95),
      thiamin: r(0.85, 0.9, 0.95),
      b6: r(0.9, 0.95, 1),
    },
  },
  source: `${USDA_RF6} — "reheated" factors; loss during frozen storage of cooked dishes: assumption`,
  url: 'https://www.ars.usda.gov/ARSUserFiles/80400525/Data/retn/retn06.txt',
  confidence: 'low',
  note: 'Fridge = one day chilled and reheated; freezer = frozen, thawed and reheated. Reheating factors computed from the USDA file; the extra freezer loss and the low ends of the ranges are assumptions.',
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
    source: 'Madronich S (2007) Photochem Photobiol 83:1537–8: clear-sky UV index ≈ 12.5·μ₀^2.42·(Ω/300)^−1.23 (μ₀ = cosine of the solar zenith angle, Ω = ozone column in Dobson units)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/18028230/',
    confidence: 'high',
    note: 'Abstract checked: accurate to 10 % for zenith angles 0–60° and 200–400 DU. Ozone fixed at 300 DU (factor 1).',
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
    url: 'https://pubmed.ncbi.nlm.nih.gov/15585788/',
    confidence: 'medium',
    note: 'The MED yield is from the paper body (not re-checked). The abstract recommends "5–10 min of exposure of the arms and legs or the hands, arms, and face, 2 or 3 times per week"; the model gives ~15 µg/day for that in a German June, close to the DGE 20 µg.',
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
    value: { zero: 35, full: 45 },
    source:
      'Webb AR, Kline L, Holick MF (1988) J Clin Endocrinol Metab 67:373–8: no previtamin D3 on cloudless days in Boston (42.2°N) November–February and in Edmonton (52°N) October–March',
    url: 'https://pubmed.ncbi.nlm.nih.gov/2839537/',
    confidence: 'low',
    note: 'Vitamin-D effectiveness of UV relative to erythemal UV, ramped from 0 at 35° to 1 at 45° solar elevation. Derived from Webb\'s months: the mid-month noon sun was ≤ 35.6° when no synthesis occurred and ≥ 39.3° when it did (abstract checked). The width of the ramp is an assumption.',
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
