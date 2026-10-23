/**
 * The nutrients the model tracks, with display names and their place in the visibility tree.
 * Ids are BLS component codes, plus three derived ids (SAA, AAA, EPADHA). Selenium (SE) is not in
 * BLS 4.0; its values are estimated from the UK table CoFID at build time (scripts/selenium.ts).
 */

export interface NutrientDef {
  id: string;
  name: string;
  /** Short name for gauges. */
  short: string;
  unit: string;
  /** Path in the visibility tree, e.g. ['macro', 'protein', 'eaa']. Group ids are in NUTRIENT_GROUPS. */
  path: string[];
  /** Decimals when showing amounts in this unit. */
  decimals: number;
}

export const NUTRIENT_GROUPS: Record<string, string> = {
  macro: 'Energy and macronutrients',
  protein: 'Protein',
  eaa: 'Essential amino acids',
  fat: 'Fat',
  fattyAcids: 'Fatty acids',
  carbs: 'Carbohydrates',
  vitamins: 'Vitamins',
  fatSoluble: 'Fat-soluble vitamins',
  waterSoluble: 'Water-soluble vitamins',
  minerals: 'Minerals',
  major: 'Major minerals',
  trace: 'Trace elements',
};

const n = (id: string, name: string, short: string, unit: string, path: string[], decimals = 0): NutrientDef => ({
  id,
  name,
  short,
  unit,
  path,
  decimals,
});

export const NUTRIENTS: NutrientDef[] = [
  n('ENERCC', 'Energy', 'Energy', 'kcal', ['macro']),
  n('PROT625', 'Protein', 'Protein', 'g', ['macro', 'protein'], 1),
  n('HIS', 'Histidine', 'Histidine', 'g', ['macro', 'protein', 'eaa'], 2),
  n('ILE', 'Isoleucine', 'Isoleucine', 'g', ['macro', 'protein', 'eaa'], 2),
  n('LEU', 'Leucine', 'Leucine', 'g', ['macro', 'protein', 'eaa'], 2),
  n('LYS', 'Lysine', 'Lysine', 'g', ['macro', 'protein', 'eaa'], 2),
  n('SAA', 'Methionine + cysteine', 'Met + Cys', 'g', ['macro', 'protein', 'eaa'], 2),
  n('AAA', 'Phenylalanine + tyrosine', 'Phe + Tyr', 'g', ['macro', 'protein', 'eaa'], 2),
  n('THR', 'Threonine', 'Threonine', 'g', ['macro', 'protein', 'eaa'], 2),
  n('TRP', 'Tryptophan', 'Tryptophan', 'g', ['macro', 'protein', 'eaa'], 2),
  n('VAL', 'Valine', 'Valine', 'g', ['macro', 'protein', 'eaa'], 2),
  n('FAT', 'Fat', 'Fat', 'g', ['macro', 'fat'], 1),
  n('FASAT', 'Saturated fat', 'Sat. fat', 'g', ['macro', 'fat', 'fattyAcids'], 1),
  n('F18:2CN6', 'Linoleic acid (omega-6)', 'Omega-6 LA', 'g', ['macro', 'fat', 'fattyAcids'], 1),
  n('F18:3CN3', 'Alpha-linolenic acid (omega-3)', 'Omega-3 ALA', 'g', ['macro', 'fat', 'fattyAcids'], 2),
  n('EPADHA', 'EPA + DHA (omega-3)', 'EPA + DHA', 'g', ['macro', 'fat', 'fattyAcids'], 2),
  n('CHO', 'Carbohydrates', 'Carbs', 'g', ['macro', 'carbs']),
  n('SUGAR', 'Sugars (total)', 'Sugars', 'g', ['macro', 'carbs']),
  n('FIBT', 'Fibre', 'Fibre', 'g', ['macro', 'carbs'], 1),
  n('VITAA', 'Vitamin A', 'Vit A', 'µg', ['vitamins', 'fatSoluble']),
  n('VITD', 'Vitamin D', 'Vit D', 'µg', ['vitamins', 'fatSoluble'], 1),
  n('VITE', 'Vitamin E', 'Vit E', 'mg', ['vitamins', 'fatSoluble'], 1),
  n('VITK', 'Vitamin K', 'Vit K', 'µg', ['vitamins', 'fatSoluble']),
  n('THIA', 'Vitamin B1 (thiamine)', 'B1', 'mg', ['vitamins', 'waterSoluble'], 2),
  n('RIBF', 'Vitamin B2 (riboflavin)', 'B2', 'mg', ['vitamins', 'waterSoluble'], 2),
  n('NIAEQ', 'Niacin (B3)', 'Niacin', 'mg', ['vitamins', 'waterSoluble'], 1),
  n('PANTAC', 'Pantothenic acid (B5)', 'B5', 'mg', ['vitamins', 'waterSoluble'], 1),
  n('VITB6', 'Vitamin B6', 'B6', 'µg', ['vitamins', 'waterSoluble']),
  n('BIOT', 'Biotin (B7)', 'Biotin', 'µg', ['vitamins', 'waterSoluble']),
  n('FOL', 'Folate (B9)', 'Folate', 'µg', ['vitamins', 'waterSoluble']),
  n('VITB12', 'Vitamin B12', 'B12', 'µg', ['vitamins', 'waterSoluble'], 1),
  n('VITC', 'Vitamin C', 'Vit C', 'mg', ['vitamins', 'waterSoluble']),
  n('NA', 'Sodium', 'Sodium', 'mg', ['minerals', 'major']),
  n('CLD', 'Chloride', 'Chloride', 'mg', ['minerals', 'major']),
  n('K', 'Potassium', 'Potassium', 'mg', ['minerals', 'major']),
  n('CA', 'Calcium', 'Calcium', 'mg', ['minerals', 'major']),
  n('MG', 'Magnesium', 'Magnesium', 'mg', ['minerals', 'major']),
  n('P', 'Phosphorus', 'Phosphorus', 'mg', ['minerals', 'major']),
  n('FE', 'Iron', 'Iron', 'mg', ['minerals', 'trace'], 1),
  n('ZN', 'Zinc', 'Zinc', 'mg', ['minerals', 'trace'], 1),
  n('ID', 'Iodine', 'Iodine', 'µg', ['minerals', 'trace']),
  n('SE', 'Selenium', 'Selenium', 'µg', ['minerals', 'trace']),
  n('CU', 'Copper', 'Copper', 'µg', ['minerals', 'trace']),
  n('MN', 'Manganese', 'Manganese', 'µg', ['minerals', 'trace']),
  n('FD', 'Fluoride', 'Fluoride', 'µg', ['minerals', 'trace']),
  n('CR', 'Chromium', 'Chromium', 'µg', ['minerals', 'trace'], 1),
  n('MO', 'Molybdenum', 'Molybdenum', 'µg', ['minerals', 'trace']),
];

export const NUTRIENT_BY_ID: ReadonlyMap<string, NutrientDef> = new Map(NUTRIENTS.map((d) => [d.id, d]));
export const MODEL_NUTRIENT_IDS: readonly string[] = NUTRIENTS.map((d) => d.id);

/** Derived nutrients: sums of BLS components. A sum is null if any part is missing. */
export const DERIVED: Record<string, readonly string[]> = {
  SAA: ['MET', 'CYSTE'],
  AAA: ['PHE', 'TYR'],
  EPADHA: ['F20:5CN3', 'F22:6CN3'],
};

/** Nutrients whose intake is tracked only to check upper limits (preformed vitamin A, folic acid). */
export const UL_BASIS_IDS = ['RETOL', 'FOLAC'] as const;
