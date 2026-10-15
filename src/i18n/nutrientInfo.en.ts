/**
 * What each nutrient does and what too little / too much means (general education, short).
 * Summaries of the sources in `NUTRIENT_INFO_SOURCES`; no numbers here (those live in model/).
 * Essential amino acids share one text (key EAA).
 */
export const nutrientInfoEn = {
  'info.ENERCC.role': 'Energy from food fuels everything the body does, from breathing and keeping warm to moving.',
  'info.ENERCC.low': 'Over time: weight loss, tiredness, loss of muscle, and less room for the other nutrients you need.',
  'info.ENERCC.high': 'Over time: weight gain, which raises the risk of type 2 diabetes, heart disease and other conditions.',

  'info.PROT625.role': 'Protein supplies the amino acids for muscles, organs, enzymes, hormones and antibodies, which are constantly rebuilt.',
  'info.PROT625.low': 'Loss of muscle and strength, slower healing, weaker immune defence.',
  'info.PROT625.high': 'Intakes up to about twice the reference are considered safe for healthy adults; much more brings no extra benefit.',

  'info.EAA.role': 'An essential amino acid: a protein building block the body cannot make, so it must come from food. Animal foods and soy, or combinations like grains with legumes, provide all of them.',
  'info.EAA.low': 'Missing any one of them limits how much protein the body can build, even if total protein looks enough.',
  'info.EAA.high': 'No problems are known from food; very high doses from isolated supplements are not recommended.',

  'info.FAT.role': 'Fat is a dense energy source, carries the fat-soluble vitamins A, D, E and K, and supplies essential fatty acids.',
  'info.FAT.low': 'Very little fat makes it hard to absorb vitamins A, D, E and K and to get enough essential fatty acids.',
  'info.FAT.high': 'A high share of energy from fat makes it easy to eat more energy than needed; the type of fat matters more than the amount.',

  'info.FASAT.role': 'Saturated fats (mainly in butter, fatty meat, cheese, coconut and palm fat) are an energy source but not essential.',
  'info.FASAT.low': 'No need for a minimum: the body makes them itself.',
  'info.FASAT.high': 'Raises LDL cholesterol and with it the risk of heart disease; replacing them with unsaturated fats helps.',

  'info.F18:2CN6.role': 'Linoleic acid, the main omega-6 fatty acid, is essential: needed for cell membranes and skin, and as a starting point for signalling molecules.',
  'info.F18:2CN6.low': 'Deficiency is rare: dry, scaly skin and poor wound healing.',
  'info.F18:2CN6.high': 'Common in vegetable oils; no harm known at usual intakes.',

  'info.F18:3CN3.role': 'Alpha-linolenic acid (ALA) is the essential plant omega-3 fatty acid (linseed, rapeseed oil, walnuts). The body turns a small part of it into EPA and DHA.',
  'info.F18:3CN3.low': 'Deficiency is rare: skin problems and, in theory, less EPA and DHA.',
  'info.F18:3CN3.high': 'No harm known from food.',

  'info.EPADHA.role': 'EPA and DHA are long-chain omega-3 fatty acids, mainly from oily fish and algae. DHA is part of the brain and retina; both support heart health.',
  'info.EPADHA.low': 'Low intake is linked to a higher risk of heart disease. The body makes only small amounts from ALA.',
  'info.EPADHA.high': 'From food, no harm is known; high-dose supplements can thin the blood.',

  'info.CHO.role': 'Carbohydrates (starch and sugars) are the main fuel for the brain and for hard muscle work.',
  'info.CHO.low': 'Very low intakes make the body break down fat and protein for energy; possible tiredness and less endurance.',
  'info.CHO.high': 'Mostly a question of type: whole grains, legumes and fruit are better than sugar and refined starch.',

  'info.SUGAR.role': 'Sugars occur naturally in fruit and milk and are added to many foods. They are quick energy, not essential.',
  'info.SUGAR.low': 'No minimum needed.',
  'info.SUGAR.high': 'Much added (free) sugar is linked to tooth decay and weight gain.',

  'info.FIBT.role': 'Fibre (from whole grains, legumes, vegetables, fruit, nuts) keeps digestion regular, feeds gut bacteria and keeps you full longer.',
  'info.FIBT.low': 'Constipation; linked to a higher risk of bowel cancer, heart disease and type 2 diabetes.',
  'info.FIBT.high': 'A sudden increase can cause bloating; raise it gradually and drink enough.',

  'info.VITAA.role': 'Vitamin A keeps eyesight working in dim light, and supports skin, mucous membranes and the immune system. Found as retinol in animal foods and as beta-carotene in orange and green vegetables.',
  'info.VITAA.low': 'Night blindness, dry eyes, more infections.',
  'info.VITAA.high': 'Large amounts of preformed vitamin A (liver, supplements) can harm the liver and bones and is dangerous in pregnancy. Beta-carotene from plants does not cause this.',

  'info.VITD.role': 'Vitamin D helps absorb calcium and keeps bones and muscles strong. Most of it is made in the skin from sunlight; few foods (oily fish, eggs, some mushrooms) contain much.',
  'info.VITD.low': 'Weaker bones (osteomalacia, osteoporosis), muscle weakness. Common in winter at German latitudes.',
  'info.VITD.high': 'Only possible with high-dose supplements: too much calcium in the blood, kidney damage. The sun does not cause this.',

  'info.VITE.role': 'Vitamin E is an antioxidant that protects fats in cell membranes from damage. Found in vegetable oils, nuts and seeds.',
  'info.VITE.low': 'Deficiency is rare (mostly with fat malabsorption): nerve and muscle problems.',
  'info.VITE.high': 'From food, no harm; very high supplement doses can increase bleeding.',

  'info.VITK.role': 'Vitamin K is needed for blood clotting and for proteins in bone. Found in green leafy vegetables and some fermented foods.',
  'info.VITK.low': 'Bleeding and bruising easily; deficiency in adults is rare.',
  'info.VITK.high': 'No harm known from food. Important with blood thinners like warfarin: keep intake steady and ask your doctor.',

  'info.THIA.role': 'Vitamin B1 (thiamine) helps turn carbohydrates into energy and keeps nerves and the heart working. Found in whole grains, pork, legumes.',
  'info.THIA.low': 'Tiredness, irritability, nerve problems; severe deficiency (beriberi) affects the heart and nerves. Heavy drinking raises the risk.',
  'info.THIA.high': 'No harm known; extra is passed in urine.',

  'info.RIBF.role': 'Vitamin B2 (riboflavin) is part of the enzymes that release energy from food and helps recycle other B vitamins. Found in milk, eggs, meat, whole grains.',
  'info.RIBF.low': 'Cracks at the corners of the mouth, sore tongue, skin problems.',
  'info.RIBF.high': 'No harm known; extra is passed in urine.',

  'info.NIAEQ.role': 'Niacin (B3) is needed for energy metabolism in every cell. The body also makes it from the amino acid tryptophan.',
  'info.NIAEQ.low': 'Severe deficiency (pellagra): skin rash in sunlight, diarrhoea, confusion. Rare with a varied diet.',
  'info.NIAEQ.high': 'From food, no harm; high-dose supplements cause flushing and can harm the liver.',

  'info.PANTAC.role': 'Pantothenic acid (B5) is part of coenzyme A, central to energy metabolism and making fats. Found in almost all foods.',
  'info.PANTAC.low': 'Deficiency is very rare: tingling, burning feet, tiredness.',
  'info.PANTAC.high': 'No harm known.',

  'info.VITB6.role': 'Vitamin B6 is needed for protein metabolism, making neurotransmitters and red blood cells. Found in fish, poultry, potatoes, bananas, whole grains.',
  'info.VITB6.low': 'Anaemia, skin inflammation, confusion, weaker immune defence.',
  'info.VITB6.high': 'Long-term high doses from supplements can damage nerves (numbness, tingling). Food alone does not.',

  'info.BIOT.role': 'Biotin (B7) helps enzymes that process fats, carbohydrates and amino acids. Found in eggs, nuts, legumes, liver.',
  'info.BIOT.low': 'Deficiency is rare: hair loss, skin rash, brittle nails. Many raw egg whites can block biotin.',
  'info.BIOT.high': 'No harm known, but high-dose supplements can falsify some lab tests (e.g. thyroid, heart).',

  'info.FOL.role': 'Folate (B9) is needed for making DNA and new cells, including red blood cells. Very important before and in early pregnancy. Found in leafy greens, legumes, whole grains.',
  'info.FOL.low': 'Anaemia, tiredness; in pregnancy a higher risk of neural tube defects in the baby.',
  'info.FOL.high': 'From food, no harm. High doses of synthetic folic acid can hide a vitamin B12 deficiency.',

  'info.VITB12.role': 'Vitamin B12 keeps nerves healthy and is needed to make red blood cells and DNA. Found almost only in animal foods; vegans need a supplement.',
  'info.VITB12.low': 'Anaemia, tiredness, tingling and numbness, memory problems. Nerve damage can become permanent, and stores can hide a low intake for years.',
  'info.VITB12.high': 'No harm known; absorption is limited.',

  'info.VITC.role': 'Vitamin C is an antioxidant, needed for collagen (skin, blood vessels, wound healing) and for the immune system. It also helps absorb iron from plant foods.',
  'info.VITC.low': 'Tiredness, bleeding gums, slow wound healing; severe deficiency is scurvy.',
  'info.VITC.high': 'Large supplement doses can cause diarrhoea; food does not.',

  'info.NA.role': 'Sodium (mostly from salt) controls fluid balance and blood pressure and is needed for nerves and muscles.',
  'info.NA.low': 'Rare (heavy sweating, illness): headache, nausea, cramps.',
  'info.NA.high': 'Raises blood pressure and with it the risk of stroke and heart disease. Most salt comes from bread, cheese, sausages and ready meals.',

  'info.CLD.role': 'Chloride works with sodium to keep fluid balance and is part of stomach acid. It comes mainly from salt.',
  'info.CLD.low': 'Rare (vomiting, heavy sweating).',
  'info.CLD.high': 'Usually comes with too much salt; see sodium.',

  'info.K.role': 'Potassium keeps nerves, muscles and heart rhythm working and helps lower blood pressure. Found in vegetables, fruit, potatoes, legumes, nuts.',
  'info.K.low': 'Muscle weakness, cramps, heart rhythm problems; low intake is linked to higher blood pressure.',
  'info.K.high': 'From food, a problem only with kidney disease or certain medicines; then ask your doctor.',

  'info.CA.role': 'Calcium builds bones and teeth and is needed for muscles, nerves and blood clotting. Found in dairy, calcium-rich mineral water, greens, tofu, almonds.',
  'info.CA.low': 'Over years, the body takes calcium from the bones, raising the risk of osteoporosis.',
  'info.CA.high': 'Very high intakes, mostly from supplements, can cause kidney stones and constipation.',

  'info.MG.role': 'Magnesium takes part in hundreds of enzyme reactions, in energy, muscles, nerves and bones. Found in whole grains, nuts, seeds, legumes, greens.',
  'info.MG.low': 'Muscle cramps, tiredness, heart rhythm problems.',
  'info.MG.high': 'From food, no harm; supplements in high doses cause diarrhoea.',

  'info.P.role': 'Phosphorus builds bones and teeth with calcium and is part of DNA and of the energy carrier ATP. Found in almost all protein foods.',
  'info.P.low': 'Rare: weakness, bone pain.',
  'info.P.high': 'A concern mainly with kidney disease; phosphate additives in processed foods add a lot.',

  'info.FE.role': 'Iron carries oxygen in the blood (haemoglobin) and muscles. Found in meat, legumes, whole grains, greens; iron from plants is absorbed less well, more with vitamin C, less with tea and coffee.',
  'info.FE.low': 'Iron-deficiency anaemia with tiredness, pale skin, shortness of breath, feeling cold. Common in women with periods.',
  'info.FE.high': 'From food, the body limits absorption. Supplements can cause stomach upset; high doses are dangerous, especially for children.',

  'info.ZN.role': 'Zinc is needed for the immune system, wound healing, growth, taste and smell, and many enzymes. Found in meat, seafood, cheese, whole grains, legumes, seeds.',
  'info.ZN.low': 'More infections, slow wound healing, hair loss, loss of taste. Phytate in whole grains and legumes lowers absorption.',
  'info.ZN.high': 'High supplement doses over time lower copper and can weaken immunity.',

  'info.ID.role': 'Iodine is needed for thyroid hormones, which control metabolism, and for brain development in the unborn child. Main sources in Germany: iodised salt, fish, dairy.',
  'info.ID.low': 'Enlarged thyroid (goitre), underactive thyroid with tiredness and weight gain; in pregnancy, harm to the baby\'s development.',
  'info.ID.high': 'Large amounts (seaweed, supplements) can also upset the thyroid.',

  'info.CU.role': 'Copper helps enzymes that make energy, connective tissue and red blood cells, and helps use iron. Found in nuts, seeds, whole grains, legumes, offal.',
  'info.CU.low': 'Deficiency is rare: anaemia, low white blood cells; can follow very high zinc supplement doses.',
  'info.CU.high': 'From food, no harm; high supplement doses can harm the liver.',

  'info.MN.role': 'Manganese is part of enzymes for bone formation, metabolism and antioxidant defence. Found in whole grains, nuts, legumes, tea.',
  'info.MN.low': 'Deficiency is very rare in people.',
  'info.MN.high': 'From food, no harm known; high exposure (mostly inhaled at work, or contaminated water) can affect the nerves.',

  'info.FD.role': 'Fluoride strengthens tooth enamel and protects against tooth decay. Sources: fluoridated salt, toothpaste, tea, some mineral waters.',
  'info.FD.low': 'More tooth decay.',
  'info.FD.high': 'In childhood, it causes white spots on teeth (fluorosis); very high amounts over years affect bones.',

  'info.CR.role': 'Chromium is thought to help insulin work. Whether it is essential at all is debated.',
  'info.CR.low': 'Clear deficiency is not known in people eating normally.',
  'info.CR.high': 'From food, no harm known.',

  'info.MO.role': 'Molybdenum is part of enzymes that break down certain amino acids and toxins. Found in legumes, grains, nuts.',
  'info.MO.low': 'Deficiency is not known with a normal diet.',
  'info.MO.high': 'From food, no harm known; very high amounts may interfere with copper.',
} as const;

export interface InfoSource {
  label: string;
  url: string;
}

const ods = (sheet: string, name: string): InfoSource => ({
  label: `NIH Office of Dietary Supplements: ${name} fact sheet for health professionals`,
  url: `https://ods.od.nih.gov/factsheets/${sheet}-HealthProfessional/`,
});
const efsaDrv: InfoSource = { label: 'EFSA: Dietary Reference Values for nutrients, summary report (2017)', url: 'https://doi.org/10.2903/sp.efsa.2017.e15121' };
const dge = (path: string, name: string): InfoSource => ({ label: `DGE reference values: ${name}`, url: `https://www.dge.de/wissenschaft/referenzwerte/${path}/` });

/** Where the summaries above come from, per nutrient (EAA = essential amino acids). */
export const NUTRIENT_INFO_SOURCES: Record<string, InfoSource> = {
  ENERCC: dge('energie', 'Energie'),
  PROT625: dge('protein', 'Protein'),
  EAA: efsaDrv,
  FAT: dge('fett-essenzielle-fettsaeuren', 'Fett'),
  FASAT: dge('fett-essenzielle-fettsaeuren', 'Fett'),
  'F18:2CN6': dge('fett-essenzielle-fettsaeuren', 'Fett'),
  'F18:3CN3': ods('Omega3FattyAcids', 'Omega-3 fatty acids'),
  EPADHA: ods('Omega3FattyAcids', 'Omega-3 fatty acids'),
  CHO: dge('kohlenhydrate', 'Kohlenhydrate'),
  SUGAR: dge('kohlenhydrate', 'Kohlenhydrate'),
  FIBT: dge('ballaststoffe', 'Ballaststoffe'),
  VITAA: ods('VitaminA', 'Vitamin A'),
  VITD: ods('VitaminD', 'Vitamin D'),
  VITE: ods('VitaminE', 'Vitamin E'),
  VITK: ods('VitaminK', 'Vitamin K'),
  THIA: ods('Thiamin', 'Thiamin'),
  RIBF: ods('Riboflavin', 'Riboflavin'),
  NIAEQ: ods('Niacin', 'Niacin'),
  PANTAC: ods('PantothenicAcid', 'Pantothenic acid'),
  VITB6: ods('VitaminB6', 'Vitamin B6'),
  BIOT: ods('Biotin', 'Biotin'),
  FOL: ods('Folate', 'Folate'),
  VITB12: ods('VitaminB12', 'Vitamin B12'),
  VITC: ods('VitaminC', 'Vitamin C'),
  NA: dge('natrium', 'Natrium'),
  CLD: dge('chlorid', 'Chlorid'),
  K: ods('Potassium', 'Potassium'),
  CA: ods('Calcium', 'Calcium'),
  MG: ods('Magnesium', 'Magnesium'),
  P: ods('Phosphorus', 'Phosphorus'),
  FE: ods('Iron', 'Iron'),
  ZN: ods('Zinc', 'Zinc'),
  ID: ods('Iodine', 'Iodine'),
  CU: ods('Copper', 'Copper'),
  MN: ods('Manganese', 'Manganese'),
  FD: ods('Fluoride', 'Fluoride'),
  CR: ods('Chromium', 'Chromium'),
  MO: ods('Molybdenum', 'Molybdenum'),
};

/** Info key for a nutrient id (essential amino acids share one text). */
export const EAA_IDS = new Set(['HIS', 'ILE', 'LEU', 'LYS', 'SAA', 'AAA', 'THR', 'TRP', 'VAL']);
export function infoId(id: string): string {
  return EAA_IDS.has(id) ? 'EAA' : id;
}
