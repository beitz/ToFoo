/**
 * "From too little to too much" at the bottom of every nutrient page (owner's ask, 2026-10-26: "show me
 * in much more detail and with correct sources what effect this might have if it's a little low, very
 * low, extremely low, extremely high"). A ladder of steps per nutrient; this file holds the sourced part
 * of each step, the texts are `ladder.<info key>.<step>…` in src/i18n/ladder.en.ts.
 *
 * Steps, from the top:
 * - `farOver`: amounts at which the source reports clear harm, usually from supplements;
 * - `over`: over the upper limit, safe level or guide the app already uses (the amount comes from
 *   model/reference-values.ts); without one, what is known about high intakes;
 * - "enough" and "a bit low": the app's own status lines (no data here, they are the same for all);
 * - `low`: under the "low" status line, lasting: what a moderate shortage does before disease shows;
 * - `none`: a long, near-total lack, the deficiency disease. Its amount only where a source names one.
 * A step with no entry here falls back to the general texts, so no step is invented to fill the ladder.
 *
 * Read 2026-10-26 from the Linus Pauling Institute's Micronutrient Information Center (reviewed articles
 * with references; the NIH ODS fact sheets the app cites elsewhere refuse requests from the build
 * machine) and the systematic reviews already in model/effects.ts. Severity uses the scale in
 * model/effects.ts (`severityScale`): how bad the outcome is, not how likely.
 */
import type { Cited } from '../src/model/paramTypes';
import type { EffectSeverity } from './effects';

export type LadderStepKind = 'none' | 'low' | 'over' | 'farOver';

/** How long until it shows, on the days, weeks, months, years strip. */
export type Onset = 'days' | 'weeks' | 'months' | 'years';

/** Whether it goes away once intake is back to normal. */
export type GoesAway = 'yes' | 'slowly' | 'partly' | 'no';

/** Where it shows: one icon each (texts in `ladder.<key>.<step>.signs`, in the same order). */
export type BodySign =
  | 'tired'
  | 'blood'
  | 'bleeding'
  | 'bones'
  | 'joints'
  | 'muscles'
  | 'nerves'
  | 'brain'
  | 'head'
  | 'skin'
  | 'hair'
  | 'mouth'
  | 'teeth'
  | 'eyes'
  | 'immune'
  | 'heart'
  | 'pressure'
  | 'gut'
  | 'kidneys'
  | 'liver'
  | 'thyroid'
  | 'pregnancy'
  | 'weight';

export interface LadderStep extends Cited {
  /** How bad it gets; absent where no harm is known. */
  severity?: EffectSeverity;
  onset?: Onset;
  goesAway?: GoesAway;
  signs?: BodySign[];
  /**
   * Intake per day in the nutrient's BLS unit: under it for `none`, over it for `farOver`. Only where the
   * source names an amount.
   */
  amount?: number;
  /** The amount (or the harm) comes from supplements or one form of the nutrient, not from food. */
  fromSupplements?: boolean;
  /** Further sources for the same step. */
  also?: Array<{ source: string; url: string }>;
}

const lpi = (path: string, name: string) => ({
  source: `Linus Pauling Institute, Micronutrient Information Center: ${name}`,
  url: `https://lpi.oregonstate.edu/mic/${path}`,
});
const dge = (path: string, name: string) => ({ source: `DGE reference values: ${name}`, url: `https://www.dge.de/wissenschaft/referenzwerte/${path}/` });
const FAIN = { source: 'Fain O (2004): Vitamin C deficiency. Rev Med Interne 25:872–880', url: 'https://pubmed.ncbi.nlm.nih.gov/15582167/' };
const HOOPER = { source: 'Hooper L et al. (2020): Reduction in saturated fat intake for cardiovascular disease. Cochrane Database Syst Rev 8:CD011737', url: 'https://pubmed.ncbi.nlm.nih.gov/32827219/' };
const STRAZZULLO = { source: 'Strazzullo P et al. (2009): Salt intake, stroke, and cardiovascular disease. BMJ 339:b4567', url: 'https://pubmed.ncbi.nlm.nih.gov/19934192/' };
const HE = { source: 'He FJ, Li J, MacGregor GA (2013): Effect of longer term modest salt reduction on blood pressure. BMJ 346:f1325', url: 'https://pubmed.ncbi.nlm.nih.gov/23558162/' };
const REYNOLDS = { source: 'Reynolds A et al. (2019): Carbohydrate quality and human health. Lancet 393:434–445', url: 'https://pubmed.ncbi.nlm.nih.gov/30638909/' };
const ABURTO = { source: 'Aburto NJ et al. (2013): Effect of increased potassium intake on cardiovascular risk factors and disease. BMJ 346:f1378', url: 'https://pubmed.ncbi.nlm.nih.gov/23558164/' };
const ABDELHAMID = { source: 'Abdelhamid AS et al. (2020): Omega-3 fatty acids for the primary and secondary prevention of cardiovascular disease. Cochrane Database Syst Rev 3:CD003177', url: 'https://pubmed.ncbi.nlm.nih.gov/32114706/' };
const BOLLAND = { source: 'Bolland MJ et al. (2015): Calcium intake and risk of fracture: systematic review. BMJ 351:h4580', url: 'https://pubmed.ncbi.nlm.nih.gov/26420387/' };

const EFA = lpi('other-nutrients/essential-fatty-acids', 'Essential fatty acids');

/** The steps per info key (see `infoId`). */
export const ladder: Record<string, Partial<Record<LadderStepKind, LadderStep>>> = {
  ENERCC: {
    low: { ...dge('energie', 'Energie'), confidence: 'high', severity: 'moderate', onset: 'weeks', goesAway: 'yes', signs: ['weight', 'tired', 'muscles'], note: 'Energy below what the body uses is made up from fat and muscle; the existing effect text says the same.' },
    over: { ...dge('energie', 'Energie'), confidence: 'high', severity: 'moderate', onset: 'years', goesAway: 'slowly', signs: ['weight', 'heart'], note: 'Lasting energy surplus → weight gain; overweight raises the risk of type 2 diabetes and cardiovascular disease (DGE).' },
  },
  PROT625: {
    low: { ...dge('protein', 'Protein'), confidence: 'medium', severity: 'moderate', onset: 'months', goesAway: 'yes', signs: ['muscles', 'skin', 'immune'], note: 'As in the existing effect text: loss of muscle and strength, slower healing, weaker immune defence.' },
    over: { ...dge('protein', 'Protein'), confidence: 'medium', note: 'DGE: up to about twice the reference considered safe for healthy adults; no upper limit set.' },
  },
  EAA: {
    low: { source: 'EFSA: Dietary Reference Values for nutrients, summary report (2017)', url: 'https://doi.org/10.2903/sp.efsa.2017.e15121', confidence: 'medium', severity: 'moderate', onset: 'months', signs: ['muscles'], note: 'The scarcest essential amino acid limits how much protein the body can build.' },
  },
  FASAT: {
    over: { ...HOOPER, confidence: 'medium', severity: 'serious', onset: 'years', goesAway: 'slowly', signs: ['heart'], also: [dge('fett-essenzielle-fettsaeuren', 'Fett')], note: 'Cutting saturated fat lowered combined cardiovascular events by 17 % (RR 0.83, 0.70–0.98) over at least 24 months; greater reductions gave greater benefit.' },
  },
  'F18:2CN6': {
    none: { ...EFA, confidence: 'medium', severity: 'mild', onset: 'weeks', goesAway: 'yes', signs: ['skin', 'immune'], note: 'LPI: clinical signs of essential fatty acid deficiency are a dry scaly rash, decreased growth in children, more infections and poor wound healing; seen with fat-free IV feeding (biochemical signs within 7–10 days), chronic fat malabsorption, cystic fibrosis.' },
  },
  'F18:3CN3': {
    none: { ...EFA, confidence: 'medium', severity: 'mild', onset: 'weeks', goesAway: 'yes', signs: ['skin', 'immune'], note: 'Same essential fatty acid deficiency signs as linoleic acid (LPI).' },
  },
  EPADHA: {
    low: { ...ABDELHAMID, confidence: 'medium', severity: 'moderate', onset: 'years', signs: ['heart'], note: 'Trials of extra EPA/DHA: all-cause mortality RR 0.97 (0.93–1.01); coronary deaths RR 0.90 (0.81–1.00), low certainty. Low intake is linked to more heart disease in observational studies.' },
    over: { ...lpi('other-nutrients/essential-fatty-acids', 'Essential fatty acids'), confidence: 'medium', severity: 'mild', signs: ['bleeding'], fromSupplements: true, note: 'LPI: high EPA + DHA intakes prolong bleeding times; long bleeding times and more haemorrhagic stroke in Greenland Inuit with very high intakes; fish oil with anticoagulant drugs needs monitoring.' },
  },
  FIBT: {
    low: { ...REYNOLDS, confidence: 'medium', severity: 'serious', onset: 'years', signs: ['gut', 'heart'], also: [lpi('other-nutrients/fiber', 'Fiber')], note: 'Highest vs lowest fibre intake: 15–30 % lower mortality, heart disease, stroke, type 2 diabetes, colorectal cancer; LPI: fibre normalises stool and prevents constipation.' },
    over: { ...lpi('other-nutrients/fiber', 'Fiber'), confidence: 'medium', severity: 'mild', onset: 'days', goesAway: 'yes', signs: ['gut'], note: 'LPI: gas and bloating with supplementation of isolated fibres; no upper limit.' },
  },

  VITAA: {
    none: { ...lpi('vitamins/vitamin-A', 'Vitamin A'), confidence: 'high', severity: 'serious', onset: 'months', goesAway: 'partly', signs: ['eyes', 'eyes', 'immune'], note: 'LPI: earliest symptom night blindness; then Bitot’s spots, xerophthalmia, corneal ulcers, scarring and blindness; even mild deficiency raises infections. At risk: fat malabsorption (pancreas, bile, Crohn’s, coeliac). Night blindness reverses with vitamin A, corneal scarring does not.' },
    low: { ...lpi('vitamins/vitamin-A', 'Vitamin A'), confidence: 'medium', severity: 'mild', signs: ['eyes'], note: 'LPI: in severe deficiency the body stores are depleted; the store in the liver drains before signs show. Earliest sign: impaired dark adaptation.' },
    over: { ...lpi('vitamins/vitamin-A', 'Vitamin A'), confidence: 'medium', severity: 'serious', onset: 'years', signs: ['pregnancy', 'bones', 'liver'], note: 'LPI: excess preformed vitamin A in early pregnancy causes birth defects; long-term intakes over 1,500 µg RAE/day associated with lower bone density in some studies. Carotenes from plants do not count (EFSA UL is for retinol).' },
    farOver: { ...lpi('vitamins/vitamin-A', 'Vitamin A'), confidence: 'medium', severity: 'serious', onset: 'months', goesAway: 'partly', amount: 8000, signs: ['head', 'skin', 'joints', 'liver'], note: 'LPI: "signs of toxicity are associated with long-term consumption of vitamin A in excess of 10 times the RDA (8,000–10,000 μg RAE/day)": headache, dry itchy skin, desquamation, enlarged liver and spleen, anaemia, bone and joint pain; severe: liver damage, haemorrhage, coma.' },
  },
  VITD: {
    none: { ...lpi('vitamins/vitamin-D', 'Vitamin D'), confidence: 'high', severity: 'moderate', onset: 'months', goesAway: 'slowly', signs: ['bones', 'muscles'], note: 'LPI: without vitamin D, calcium absorption cannot meet needs; PTH mobilises calcium from bone. Severe deficiency: osteomalacia (soft bones, bone pain) in adults, rickets in children, muscle weakness and pain. Risk: little UVB (latitude, season), covered skin, sunscreen, dark skin.' },
    low: { ...lpi('vitamins/vitamin-D', 'Vitamin D'), confidence: 'medium', severity: 'moderate', onset: 'years', signs: ['bones', 'muscles'], note: 'LPI: long-term insufficiency may contribute to osteoporosis in the elderly; loss of muscle strength contributes to falls and fractures.' },
    over: { ...lpi('vitamins/vitamin-D', 'Vitamin D'), confidence: 'medium', severity: 'mild', note: 'LPI: toxicity very unlikely in healthy people below 10,000 IU (250 µg)/day; the upper limit is set conservatively. Never from sun.' },
    farOver: { ...lpi('vitamins/vitamin-D', 'Vitamin D'), confidence: 'medium', severity: 'serious', onset: 'months', goesAway: 'partly', amount: 1250, fromSupplements: true, signs: ['gut', 'kidneys', 'heart'], also: [lpi('minerals/calcium', 'Calcium')], note: 'LPI: hypercalcaemia observed after daily doses greater than 50,000 IU (1,250 µg); can cause bone loss, kidney stones and calcification of heart and kidneys. Calcium article: mild hypercalcaemia brings appetite loss, nausea, vomiting, constipation, tiredness, frequent urination.' },
  },
  VITE: {
    none: { ...lpi('vitamins/vitamin-E', 'Vitamin E'), confidence: 'medium', severity: 'moderate', onset: 'years', goesAway: 'partly', signs: ['nerves', 'muscles', 'eyes'], note: 'LPI: severe deficiency gives ataxia, peripheral neuropathy, myopathy, retinopathy; rarely from low intake, seen with fat malabsorption or genetic defects; adults with malabsorption may not show neurologic symptoms for 10–20 years; not reported in healthy people on low-E diets.' },
    low: { ...lpi('vitamins/vitamin-E', 'Vitamin E'), confidence: 'low', note: 'LPI: marginal intake may be common; "it is not yet known whether marginal vitamin E deficiency increases the risk of chronic disease".' },
    over: { ...lpi('vitamins/vitamin-E', 'Vitamin E'), confidence: 'medium', severity: 'moderate', signs: ['bleeding'], fromSupplements: true, note: 'LPI: most worrisome effect of high-dose supplements is impaired blood clotting; trend towards more haemorrhagic stroke in trials.' },
  },
  VITK: {
    none: { ...lpi('vitamins/vitamin-K', 'Vitamin K'), confidence: 'high', severity: 'moderate', signs: ['bleeding', 'bleeding'], note: 'LPI: overt deficiency impairs clotting: easy bruising, nosebleeds, bleeding gums, blood in urine or stool, heavy periods. Uncommon in healthy adults; at risk: vitamin K antagonists, liver disease, fat malabsorption; newborns.' },
    over: { ...lpi('vitamins/vitamin-K', 'Vitamin K'), confidence: 'high', note: 'LPI: no known toxicity of high doses of K1 or K2 from food or supplements; with vitamin K antagonist drugs, intake changes affect the drug.' },
  },
  THIA: {
    none: { ...lpi('vitamins/thiamin', 'Thiamin'), confidence: 'high', severity: 'serious', goesAway: 'partly', signs: ['nerves', 'heart', 'brain'], note: 'LPI: beriberi. Dry: neuropathy, burning feet, weakness in legs and arms. Wet: fast heart rate, enlarged heart, swelling, heart failure. Cerebral: Wernicke-Korsakoff (eye movements, gait, memory loss), mostly with alcohol abuse; eye symptoms improve promptly with thiamin, memory and coordination may not.' },
    over: { ...lpi('vitamins/thiamin', 'Thiamin'), confidence: 'high', note: 'LPI: no well-established toxic effects from food or long-term oral supplements up to 200 mg/day; no UL.' },
  },
  RIBF: {
    none: { ...lpi('vitamins/riboflavin', 'Riboflavin'), confidence: 'high', severity: 'mild', goesAway: 'yes', signs: ['mouth', 'skin', 'blood'], note: 'LPI: sore throat, red swollen mouth lining, cracks at lips and mouth corners, magenta tongue, seborrhoeic dermatitis, normocytic anaemia; rarely alone, usually with other water-soluble vitamin shortages.' },
    low: { ...lpi('vitamins/riboflavin', 'Riboflavin'), confidence: 'medium', severity: 'mild', note: 'LPI: subclinical low status may be widespread and goes undetected; may reduce conversion of B6 to its active form and of tryptophan to niacin.' },
    over: { ...lpi('vitamins/riboflavin', 'Riboflavin'), confidence: 'high', note: 'LPI: no toxic effects known; high doses make urine bright yellow (harmless); no UL.' },
  },
  NIAEQ: {
    none: { ...lpi('vitamins/niacin', 'Niacin'), confidence: 'high', severity: 'serious', goesAway: 'yes', signs: ['skin', 'gut', 'brain'], note: 'LPI: pellagra, the three Ds: sun-sensitive dermatitis, diarrhoea, dementia. Risk: diets high in maize and low in animal protein, alcoholism, malabsorption, some drugs. Bound niacin in maize released by alkaline (lime) treatment.' },
    farOver: { ...lpi('vitamins/niacin', 'Niacin'), confidence: 'medium', severity: 'serious', onset: 'months', amount: 750, fromSupplements: true, signs: ['skin', 'liver'], note: 'LPI: nicotinic acid causes flushing, itching, rash, nausea; liver damage at intakes as low as 750 mg/day; severe hepatitis mostly at 3–9 g/day for months or years. Nicotinic acid supplements, not niacin in food.' },
  },
  PANTAC: {
    none: { ...lpi('vitamins/pantothenic-acid', 'Pantothenic acid'), confidence: 'medium', severity: 'mild', goesAway: 'yes', signs: ['nerves', 'head', 'tired'], note: 'LPI: very rare, only in severe malnutrition: numbness and burning, tingling feet (WWII prisoners), headache, fatigue, insomnia, gut problems; relieved by pantothenic acid.' },
    farOver: { ...lpi('vitamins/pantothenic-acid', 'Pantothenic acid'), confidence: 'medium', severity: 'mild', onset: 'days', goesAway: 'yes', amount: 10000, fromSupplements: true, signs: ['gut'], note: 'LPI: not known to be toxic; only diarrhoea at 10–20 g/day of calcium D-pantothenate.' },
  },
  VITB6: {
    none: { ...lpi('vitamins/vitamin-B6', 'Vitamin B6'), confidence: 'medium', severity: 'moderate', goesAway: 'yes', signs: ['brain', 'mouth'], note: 'LPI: severe deficiency uncommon (alcoholics most at risk): irritability, depression, confusion, inflamed tongue, mouth sores, cracks at the mouth corners; seizures in infants.' },
    over: { ...lpi('vitamins/vitamin-B6', 'Vitamin B6'), confidence: 'medium', severity: 'moderate', onset: 'years', fromSupplements: true, signs: ['nerves'], note: 'LPI: adverse effects only from supplements (pyridoxine), never food; upper limits are set to prevent sensory neuropathy.' },
    farOver: { ...lpi('vitamins/vitamin-B6', 'Vitamin B6'), confidence: 'medium', severity: 'serious', onset: 'months', goesAway: 'partly', amount: 1_000_000, fromSupplements: true, signs: ['nerves', 'nerves'], note: 'LPI: sensory ataxic neuropathy "typically develops at doses of pyridoxine in excess of 1,000 mg per day"; a few cases below 500 mg/day over months to years; can be irreversible; pain and numbness of the extremities, difficulty walking.' },
  },
  BIOT: {
    none: { ...lpi('vitamins/biotin', 'Biotin'), confidence: 'medium', severity: 'mild', onset: 'months', goesAway: 'yes', signs: ['hair', 'skin', 'brain', 'nerves'], note: 'LPI: overt deficiency very rare: long raw egg white (many weeks to years), IV feeding without biotin. Hair loss, scaly red rash around eyes, nose, mouth; depression, lethargy, numbness and tingling.' },
    over: { ...lpi('vitamins/biotin', 'Biotin'), confidence: 'medium', note: 'LPI: not known to be toxic; up to 5 mg/day for two years without adverse effects; no UL.' },
  },
  FOL: {
    none: { ...lpi('vitamins/folate', 'Folate'), confidence: 'high', severity: 'moderate', onset: 'months', goesAway: 'yes', signs: ['blood', 'tired'], note: 'LPI: megaloblastic anaemia, reversible with folic acid; red blood cells live about four months, so it can take months to develop; fatigue, weakness, shortness of breath.' },
    low: { ...lpi('vitamins/folate', 'Folate'), confidence: 'high', severity: 'moderate', signs: ['pregnancy'], note: 'Before and in early pregnancy, low folate raises the risk of neural tube defects (existing effect text; LPI Disease Prevention).' },
    over: { ...lpi('vitamins/folate', 'Folate'), confidence: 'medium', severity: 'moderate', fromSupplements: true, signs: ['nerves'], note: 'LPI: no adverse effects from food folate; concern is synthetic folic acid masking B12 deficiency (anaemia corrected, nerve damage progresses), mostly at 5 mg and above; UL 1 mg folic acid.' },
  },
  VITB12: {
    none: { ...lpi('vitamins/vitamin-B12', 'Vitamin B12'), confidence: 'high', severity: 'serious', onset: 'years', goesAway: 'partly', signs: ['blood', 'nerves', 'brain', 'mouth'], note: 'LPI: megaloblastic anaemia; numbness and tingling of hands and feet, difficulty walking, memory loss, disorientation, depression, dementia; neurologic symptoms may not reverse if present long; tongue soreness. Body stores can exceed 2,500 µg with slow turnover. At risk: over 60 with atrophic gastritis (10–30 %), little animal food.' },
    low: { ...lpi('vitamins/vitamin-B12', 'Vitamin B12'), confidence: 'medium', severity: 'mild', note: 'LPI: mild deficiency may have no symptoms while homocysteine or MMA rise; the store lasts years.' },
    over: { ...lpi('vitamins/vitamin-B12', 'Vitamin B12'), confidence: 'high', note: 'LPI: no toxic effects from food or supplements in healthy people; 2 mg/day orally used without side effects; no UL.' },
  },
  VITC: {
    none: { ...lpi('vitamins/vitamin-C', 'Vitamin C'), confidence: 'high', severity: 'serious', onset: 'months', goesAway: 'yes', amount: 10, signs: ['bleeding', 'skin', 'teeth', 'joints'], also: [FAIN], note: 'LPI: scurvy "can be prevented by as little as 10 mg of vitamin C daily"; symptoms subcutaneous bleeding, poor wound closure, easy bruising, hair and tooth loss, joint pain and swelling, from weakened collagen; potentially fatal. Fain 2004: after about 3 months without vitamin C; treatment cures in about 15 days.' },
    low: { ...lpi('vitamins/vitamin-C', 'Vitamin C'), confidence: 'medium', severity: 'moderate', onset: 'weeks', signs: ['tired', 'heart'], note: 'LPI: early symptoms like fatigue may come from less carnitine; prospective cohorts: higher vitamin C status associated with lower risk of hypertension, coronary heart disease and stroke.' },
    farOver: { ...lpi('vitamins/vitamin-C', 'Vitamin C'), confidence: 'medium', severity: 'mild', onset: 'days', goesAway: 'yes', amount: 2000, fromSupplements: true, signs: ['gut', 'kidneys'], note: 'LPI: US upper level of 2 g/day set to avoid diarrhoea and gastrointestinal disturbances; no evidence of toxicity up to 10 g/day; people prone to kidney stones may avoid ≥1 g/day supplements. EFSA set no UL.' },
  },

  NA: {
    none: { ...lpi('minerals/sodium', 'Sodium'), confidence: 'medium', severity: 'moderate', onset: 'days', goesAway: 'yes', signs: ['head', 'gut', 'muscles', 'brain'], note: 'LPI: low intake rarely causes hyponatraemia (kidneys compensate); it comes from losses (vomiting, diarrhoea, heavy sweating, diuretics) or too much water in endurance events. Symptoms: headache, nausea, vomiting, muscle cramps, fatigue, disorientation, fainting.' },
    over: { ...STRAZZULLO, confidence: 'medium', severity: 'serious', onset: 'years', goesAway: 'slowly', signs: ['pressure', 'heart'], also: [HE], note: 'Higher salt: stroke RR 1.23 (1.06–1.43) over 3.5–19 years; trials of ≥4 weeks: 4.4 g less salt lowered systolic pressure by 4.18 mmHg.' },
  },
  K: {
    none: { ...lpi('minerals/potassium', 'Potassium'), confidence: 'high', severity: 'serious', onset: 'days', goesAway: 'yes', signs: ['tired', 'muscles', 'gut', 'heart'], note: 'LPI: hypokalaemia mostly from losses (vomiting, diarrhoea, diuretics, laxatives); low dietary potassium alone does not generally cause it. Fatigue, muscle weakness and cramps, intestinal paralysis (bloating, constipation); severe: paralysis, fatal arrhythmias.' },
    low: { ...ABURTO, confidence: 'medium', severity: 'moderate', onset: 'years', signs: ['pressure', 'heart'], note: 'Higher potassium: stroke RR 0.76 (0.66–0.89); systolic −3.49 mmHg in people with hypertension.' },
    over: { ...lpi('minerals/potassium', 'Potassium'), confidence: 'medium', severity: 'mild', note: 'LPI: hyperkalaemia occurs when intake exceeds what the kidneys can remove: kidney failure, potassium-sparing diuretics. With healthy kidneys the excess is excreted. No UL.' },
    farOver: { ...lpi('minerals/potassium', 'Potassium'), confidence: 'medium', severity: 'serious', onset: 'days', amount: 18000, fromSupplements: true, signs: ['heart', 'muscles'], note: 'LPI: "Oral doses of potassium >18 g taken at one time in individuals not accustomed to high intakes may lead to severe hyperkalemia, even in those with normal kidney function"; tingling, weakness, paralysis, arrhythmia, cardiac arrest.' },
  },
  CA: {
    none: { ...lpi('minerals/calcium', 'Calcium'), confidence: 'medium', severity: 'moderate', onset: 'years', signs: ['bones'], note: 'LPI: low blood calcium is rarely from diet (the skeleton buffers it); chronically low intake prevents optimal peak bone mass and may speed bone loss and osteoporosis.' },
    low: { ...BOLLAND, confidence: 'medium', severity: 'mild', note: '14 of 22 cohort studies found no link between dietary calcium and fractures; no trial evidence that more calcium from food prevents fractures.' },
    over: { ...lpi('minerals/calcium', 'Calcium'), confidence: 'medium', severity: 'moderate', fromSupplements: true, signs: ['gut'], note: 'LPI: hypercalcaemia not linked to calcium in food; supplements 0.6–2 g/day for 2–5 years raised gastrointestinal events (constipation, cramping, bloating, pain, diarrhoea); large supplement doses with antacids: calcium-alkali syndrome (1.5–16.5 g/day).' },
  },
  MG: {
    none: { ...lpi('minerals/magnesium', 'Magnesium'), confidence: 'medium', severity: 'moderate', goesAway: 'yes', signs: ['muscles', 'brain', 'gut'], note: 'LPI: rare in healthy people on a balanced diet; risk with gut disorders, diabetes, diuretics, alcoholism, older age. Severe: low calcium and potassium, tremor, muscle spasms, tetany, appetite loss, nausea, vomiting, personality changes.' },
    over: { ...lpi('minerals/magnesium', 'Magnesium'), confidence: 'high', severity: 'mild', onset: 'days', goesAway: 'yes', fromSupplements: true, signs: ['gut'], note: 'LPI: no adverse effects from magnesium in food; supplements: diarrhoea first; impaired kidney function raises the risk of toxicity (low blood pressure, confusion, arrhythmia). The EFSA UL applies to supplements only.' },
  },
  P: {
    none: { ...lpi('minerals/phosphorus', 'Phosphorus'), confidence: 'medium', severity: 'moderate', signs: ['muscles', 'bones', 'nerves', 'blood'], note: 'LPI: dietary deficiency usually only in near-total starvation or refeeding; appetite loss, anaemia, muscle weakness, bone pain, osteomalacia, numbness and tingling, infections; severe can be life threatening.' },
    over: { ...lpi('minerals/phosphorus', 'Phosphorus'), confidence: 'medium', severity: 'mild', signs: ['kidneys'], note: 'LPI: high blood phosphate mostly with chronic kidney disease, where even recommended intakes can be too much.' },
  },
  FE: {
    none: { ...lpi('minerals/iron', 'Iron'), confidence: 'high', severity: 'moderate', onset: 'months', goesAway: 'slowly', signs: ['tired', 'heart', 'blood'], note: 'LPI: iron-deficiency anaemia, the most common deficiency worldwide: fatigue, rapid heart rate, palpitations, rapid breathing on exertion, lower work capacity.' },
    low: { ...lpi('minerals/iron', 'Iron'), confidence: 'high', severity: 'mild', signs: ['blood'], note: 'LPI levels: storage depletion (no limit on function), then early functional deficiency (red cell production impaired), then anaemia.' },
    over: { ...lpi('minerals/iron', 'Iron'), confidence: 'medium', severity: 'mild', fromSupplements: true, signs: ['gut'], note: 'LPI: therapeutic iron supplements cause gut irritation, nausea, vomiting, diarrhoea or constipation; the US UL is set to prevent gastrointestinal distress.' },
    farOver: { ...lpi('minerals/iron', 'Iron'), confidence: 'high', severity: 'serious', onset: 'days', fromSupplements: true, signs: ['gut', 'liver'], note: 'LPI: accidental overdose of iron products is the single largest cause of poisoning deaths in children under six; acute toxicity from 20–60 mg/kg body weight. Dose per kg, so no amount per day.' },
  },
  ZN: {
    none: { ...lpi('minerals/zinc', 'Zinc'), confidence: 'medium', severity: 'moderate', goesAway: 'yes', signs: ['skin', 'gut', 'immune', 'mouth'], note: 'LPI: severe deficiency (mostly inherited, malabsorption, burns): slowed growth, rashes, severe diarrhoea, immune deficiency, poor wound healing, appetite and taste loss, night blindness.' },
    low: { ...lpi('minerals/zinc', 'Zinc'), confidence: 'medium', severity: 'moderate', signs: ['immune'], note: 'LPI: milder deficiency common worldwide; increases susceptibility to infections (children); no sensitive marker.' },
    over: { ...lpi('minerals/zinc', 'Zinc'), confidence: 'medium', severity: 'moderate', onset: 'weeks', goesAway: 'yes', signs: ['blood'], note: 'LPI: main consequence of long-term excess is copper deficiency; 60 mg/day (50 mg supplemental) for up to 10 weeks gave signs of copper deficiency. EFSA UL also based on copper status.' },
    farOver: { ...lpi('minerals/zinc', 'Zinc'), confidence: 'medium', severity: 'mild', onset: 'days', goesAway: 'yes', amount: 50, fromSupplements: true, signs: ['gut'], note: 'LPI: milder gastrointestinal distress at 50–150 mg/day supplemental zinc; single doses of 225–450 mg usually induce vomiting.' },
  },
  ID: {
    none: { ...lpi('minerals/iodine', 'Iodine'), confidence: 'high', severity: 'serious', onset: 'months', goesAway: 'partly', signs: ['thyroid', 'tired', 'weight', 'pregnancy'], note: 'LPI: most common preventable cause of brain damage worldwide; goitre, hypothyroidism (adults: fatigue, weight gain, cold intolerance, constipation); maternal hypothyroidism: miscarriage, stillbirth, preterm birth; intellectual impairment in the child.' },
    low: { ...lpi('minerals/iodine', 'Iodine'), confidence: 'medium', severity: 'moderate', signs: ['thyroid'], note: 'LPI: chronic deficiency lowers thyroid iodine well below 1 mg; mild-to-moderate deficiency still a public health concern in at least 21 countries.' },
    over: { ...lpi('minerals/iodine', 'Iodine'), confidence: 'medium', severity: 'moderate', signs: ['thyroid'], note: 'LPI: in iodine-sufficient people excess raises TSH (hypothyroidism, goitre); in people deficient for years, iodine can trigger hyperthyroidism (weight loss, fast pulse), dangerous with heart disease.' },
    farOver: { ...lpi('minerals/iodine', 'Iodine'), confidence: 'medium', severity: 'moderate', amount: 1700, signs: ['thyroid'], note: 'LPI: in iodine-sufficient adults, elevated TSH at chronic intakes ≥1,700 µg/day; seaweed contributes much in traditional Asian meals; acute poisoning only with grams.' },
  },
  SE: {
    none: { ...lpi('minerals/selenium', 'Selenium'), confidence: 'medium', severity: 'moderate', onset: 'years', goesAway: 'partly', signs: ['heart', 'muscles'], note: 'LPI: isolated deficiency rarely causes obvious illness; long IV feeding without selenium: muscle weakness, wasting, cardiomyopathy; Keshan disease (fatal cardiomyopathy) with very low intakes in China; selenium prevents but does not reverse heart damage.' },
    over: { ...lpi('minerals/selenium', 'Selenium'), confidence: 'medium', severity: 'moderate', onset: 'months', signs: ['hair'], note: 'Upper limits are set to prevent hair and nail brittleness and early signs of chronic toxicity (LPI on the US UL; EFSA 2023 likewise).' },
    farOver: { ...lpi('minerals/selenium', 'Selenium'), confidence: 'medium', severity: 'serious', onset: 'months', goesAway: 'slowly', amount: 850, signs: ['hair', 'skin', 'gut', 'nerves'], note: 'LPI: selenosis: hair and nail brittleness and loss, gut disturbances, rashes, garlic breath, fatigue, irritability, neurological disorders; in a Chinese area toxic effects grew more frequent at blood levels matching 850 µg/day.' },
  },
  CU: {
    none: { ...lpi('minerals/copper', 'Copper'), confidence: 'medium', severity: 'moderate', goesAway: 'yes', signs: ['blood', 'immune', 'bones'], note: 'LPI: frank dietary deficiency uncommon; anaemia that does not respond to iron, neutropenia (more infections), osteoporosis in low-birth-weight infants; high zinc intake causes it.' },
    over: { ...lpi('minerals/copper', 'Copper'), confidence: 'medium', severity: 'moderate', onset: 'years', signs: ['liver'], note: 'LPI: concern is liver damage from long-term exposure; up to 10 mg/day without liver damage in healthy people, but 7.8 mg/day for 147 days loaded excess copper. EFSA UL 5 mg.' },
    farOver: { ...lpi('minerals/copper', 'Copper'), confidence: 'medium', severity: 'serious', onset: 'days', signs: ['gut', 'liver', 'kidneys'], note: 'LPI: acute poisoning from beverages stored in copper containers or contaminated water: abdominal pain, nausea, vomiting, diarrhoea; severe liver damage, kidney failure. No amount per day given.' },
  },
  MN: {
    over: { ...lpi('minerals/manganese', 'Manganese'), confidence: 'medium', severity: 'mild', signs: ['nerves'], note: 'LPI: toxicity mainly from inhaled manganese dust (welders, miners): Parkinson-like manganism over months to years; ingested manganese is processed by the liver first. EFSA set a safe level, not a UL.' },
  },
  FD: {
    low: { ...lpi('minerals/fluoride', 'Fluoride'), confidence: 'high', severity: 'mild', onset: 'years', signs: ['teeth'], note: 'LPI: the only clear effect of inadequate fluoride is more tooth decay; 40–60 % less decay with optimal water fluoride before fluoride toothpaste.' },
    over: { ...lpi('minerals/fluoride', 'Fluoride'), confidence: 'medium', severity: 'mild', onset: 'years', goesAway: 'no', signs: ['teeth', 'bones'], note: 'LPI: dental fluorosis (enamel mottling) while teeth form in childhood; long excessive intake changes bone structure (skeletal fluorosis, early stage only on x-ray).' },
    farOver: { ...lpi('minerals/fluoride', 'Fluoride'), confidence: 'medium', severity: 'serious', onset: 'years', goesAway: 'no', amount: 10000, signs: ['bones', 'joints'], note: 'LPI: crippling skeletal fluorosis "may occur only when fluoride intake exceeds 10 mg/day for at least 10 years": calcified ligaments, immobility, muscle wasting.' },
  },
  CR: {
    over: { ...lpi('minerals/chromium', 'Chromium'), confidence: 'medium', note: 'LPI: little evidence that chromium(III) from food or supplements is toxic; no UL. Chromium(VI) (industrial dust) is a carcinogen.' },
  },
  MO: {
    over: { ...lpi('minerals/molybdenum', 'Molybdenum'), confidence: 'medium', severity: 'mild', note: 'LPI: little evidence of harm in healthy people; the UL is from rat studies with a large safety factor; 22–1,490 µg/day for 24 days without serious effects.' },
    farOver: { ...lpi('minerals/molybdenum', 'Molybdenum'), confidence: 'low', severity: 'mild', amount: 10000, signs: ['joints'], note: 'LPI: gout-like symptoms reported in an Armenian population eating 10–15 mg molybdenum a day; one population, observational.' },
  },
};
