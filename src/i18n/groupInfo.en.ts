/**
 * One-page explanations of the nutrient groups (vitamins, minerals, protein, fats, carbohydrates):
 * what the group is, which ones the body makes, where they come from. General education, short.
 * Summaries of the sources in `GROUP_INFO_SOURCES`; the numbers on the pages are computed from BLS
 * and model/ (see src/features/info/GroupInfoSheet.tsx), none are written here.
 */
import type { InfoSource } from './nutrientInfo.en';

export const groupInfoEn = {
  'ginfo.open': 'About {group}',
  'ginfo.sources': 'Sources',
  'ginfo.mostlyFrom': 'Mostly from',
  'ginfo.store': 'Store',
  'ginfo.storeNone': '–',
  'ginfo.vegan': 'On a vegan diet',

  // ── Protein ──
  'ginfo.protein.intro':
    'Protein is built from 20 different amino acids. Digestion splits the protein you eat into amino acids, and the body builds its own proteins from them: muscle, enzymes, hormones such as insulin, antibodies, haemoglobin. It also makes other substances from them, such as serotonin and histamine. So what counts is not only how much protein you eat, but whether it brings enough of each amino acid the body cannot make.',
  'ginfo.protein.classes': 'Which ones the body can make',
  'ginfo.protein.essential': 'Essential',
  'ginfo.protein.essentialWhy': 'The body cannot make them, so they must come from food.',
  'ginfo.protein.essentialList': 'histidine, isoleucine, leucine, lysine, methionine, phenylalanine, threonine, tryptophan, valine',
  'ginfo.protein.conditional': 'Conditionally essential',
  'ginfo.protein.conditionalWhy': 'The body makes them, but sometimes not enough: for example in liver disease, in newborns, or with an inherited condition such as PKU.',
  'ginfo.protein.conditionalList': 'arginine, cysteine, glutamine, glycine, proline, tyrosine',
  'ginfo.protein.dispensable': 'Non-essential',
  'ginfo.protein.dispensableWhy': 'The body makes enough of them from other amino acids and nitrogen.',
  'ginfo.protein.dispensableList': 'alanine, asparagine, aspartic acid, glutamic acid, serine',
  'ginfo.protein.histidineNote': 'ToFoo tracks the nine essential ones. WHO counts histidine as essential for adults too; DGE lists it as essential for infants.',
  'ginfo.protein.roles': 'What the essential ones do',
  'ginfo.protein.plantAnimal': 'Plant and animal protein',
  'ginfo.protein.tableIntro':
    'Every protein food contains all nine, but in different proportions. The table shows how much of the need for each one a gram of protein covers, as a typical value for each kind of food. Below 100% (↓), that kind of protein on its own has less of this amino acid per gram than the body needs.',
  'ginfo.protein.colGrains': 'Grains',
  'ginfo.protein.colLegumes': 'Legumes',
  'ginfo.protein.colNuts': 'Nuts, seeds',
  'ginfo.protein.colAnimal': 'Animal',
  'ginfo.protein.below': 'below need',
  'ginfo.protein.tableNote':
    'Typical value = median over BLS 4.0 foods with at least 3 g protein per 100 g ({grains} grain, {legumes} legume, {nuts} nut and seed, {animal} animal foods). Need = WHO adult requirement pattern, mg per g protein. Many BLS amino acid values are calculated from typical patterns rather than measured.',
  'ginfo.protein.combine':
    'Grains are low in lysine and legumes have just about enough methionine + cysteine, so the two make up for each other: lentils with rice, or pea soup with bread. Animal protein usually brings all nine in sufficient amounts. Amino acids from plant protein are also somewhat less available to the body; cooking and sprouting change this, and tannins in grains and legumes lower it.',
  'ginfo.protein.vegan': 'DGE counts protein among the nutrients to watch.',

  'aaRole.HIS': 'Counted as essential for adults, though this was long debated: a shortage shows only after weeks without it.',
  'aaRole.ILE':
    'One of the three branched-chain amino acids (with leucine and valine), which the body breaks down along the same pathway. Its need is estimated from that of leucine.',
  'aaRole.LEU': 'A branched-chain amino acid, like isoleucine and valine. Of the nine, it is the one needed in the largest amount.',
  'aaRole.LYS': 'The one most likely to run short in grain-based meals: cereal protein, especially wheat, has little of it.',
  'aaRole.SAA':
    'Methionine and cysteine contain sulphur. The body makes cysteine from methionine, so the need is set for both together. Methionine also hands on methyl groups in many reactions. Legume protein has only just enough.',
  'aaRole.AAA':
    'The body makes tyrosine from phenylalanine, so the need is set for both together. Tyrosine is the starting point for thyroid hormones, adrenaline, noradrenaline and the skin pigment melanin.',
  'aaRole.THR':
    'The protein the gut loses into the large bowel every day contains more threonine than any other amino acid, which keeps its need relatively high. Grains have little of it.',
  'aaRole.TRP':
    'Needed in the smallest amount. The body makes serotonin from it, and niacin (vitamin B3), so tryptophan can partly stand in for niacin from food. Maize protein has little of it.',
  'aaRole.VAL': 'A branched-chain amino acid, like leucine and isoleucine. Its need is estimated from that of leucine.',

  // ── Fats ──
  'ginfo.fat.intro':
    'Fat gives more than twice as much energy per gram as carbohydrates or protein. It carries the fat-soluble vitamins A, D, E and K and flavours, and supplies the essential fatty acids. Fats are made of fatty acids, which differ in chain length and in how saturated they are.',
  'ginfo.fat.kinds': 'Kinds of fatty acids',
  'ginfo.fat.sat':
    'Saturated: mostly from animal foods (butter, cheese, fatty meat), also coconut and palm fat. The body makes them itself. Eating fewer of them and more unsaturated fats instead can lower the risk of heart disease.',
  'ginfo.fat.mono': 'Monounsaturated: plenty in olive and rapeseed oil, nuts and avocado. The body can make them too.',
  'ginfo.fat.poly': 'Polyunsaturated: linoleic acid (omega-6) and alpha-linolenic acid (omega-3) cannot be made by the body and must come from food: plant oils, nuts, seeds.',
  'ginfo.fat.epadha': 'EPA and DHA: long-chain omega-3 fatty acids from oily fish and algae. The body makes only small amounts of them from alpha-linolenic acid.',
  'ginfo.fat.table': 'What common fats are made of',
  'ginfo.fat.tableIntro': 'Share of each kind in the food’s fatty acids, from BLS 4.0:',
  'ginfo.fat.colSat': 'Sat.',
  'ginfo.fat.colMono': 'Mono',
  'ginfo.fat.colPoly': 'Poly',
  'ginfo.fat.colN3': 'of which omega-3',
  'ginfo.fat.after':
    'Butter and coconut oil are mostly saturated, olive and rapeseed oil mostly monounsaturated, sunflower and linseed oil and walnuts mostly polyunsaturated. The plant omega-3 comes with linseed and rapeseed oil and walnuts; EPA and DHA come with fish such as salmon.',
  'ginfo.fat.vegan': 'DGE counts the long-chain omega-3 fatty acids (EPA, DHA) among the nutrients to watch.',

  // ── Carbohydrates ──
  'ginfo.carbs.intro':
    'Carbohydrates are the body’s preferred fuel, and they matter for feeling full and for blood sugar. They come as single sugars (such as glucose), double sugars (such as lactose and table sugar) and long chains (such as starch). The body can store a little as a reserve; more than it needs is turned into fat.',
  'ginfo.carbs.where': 'Where they come from',
  'ginfo.carbs.whereText':
    'Almost entirely from plant foods: grains, potatoes, legumes, fruit and vegetables. The main exception is lactose, the sugar in milk. Whole grains, vegetables, fruit, legumes and potatoes also bring vitamins, minerals, fibre and other plant substances. Sugary foods and drinks are usually low in nutrients, keep you full only briefly and raise the risk of tooth decay.',
  'ginfo.carbs.fibre': 'Fibre',
  'ginfo.carbs.fibreText':
    'Fibre is the part of plant foods the gut can hardly digest. It changes how fast food moves through the gut, adds bulk to stool, keeps you full and feeds gut bacteria. More fibre is linked to less heart disease, type 2 diabetes, obesity, high blood pressure, bowel and breast cancer. Rich in fibre: legumes, nuts and seeds, whole grains, vegetables and fruit. There is no fibre in animal foods.',
  'ginfo.carbs.sugarNote':
    'ToFoo shows total sugars from BLS, which includes the natural sugar in fruit and milk. The WHO and DGE limits are for free (added) sugars, which BLS does not list separately.',

  // ── Vitamins ──
  'ginfo.vitamins.intro':
    'Vitamins are substances the body needs in small amounts for many processes but cannot make itself, or not enough. DGE sets reference values for 13 of them, in two kinds:',
  'ginfo.vitamins.fat':
    'Fat-soluble: A, D, E and K. They are absorbed together with fat from the meal; ToFoo counts less of them for meals with almost no fat (below about {g} g).',
  'ginfo.vitamins.water': 'Water-soluble: the B vitamins (B1, B2, niacin, B5, B6, biotin, folate, B12) and vitamin C.',
  'ginfo.vitamins.stores': 'The body keeps a store of some of them. ToFoo tracks these as stores: {list}. The others it tracks as an average over recent days.',
  'ginfo.vitamins.made': 'Some the body makes itself',
  'ginfo.vitamins.madeD': 'Vitamin D: made in the skin from sunlight, which for most people provides most of it. ToFoo estimates it from your time outdoors.',
  'ginfo.vitamins.madeNiacin': 'Niacin: made from the amino acid tryptophan. BLS counts this in its niacin values (niacin equivalents).',
  'ginfo.vitamins.madeA': 'Vitamin A: made from beta-carotene in orange and green plant foods.',
  'ginfo.vitamins.table': 'Where they come from',
  'ginfo.storeNote': 'Store = how long a full body store would last with nothing eaten, from ToFoo’s model; – = tracked as a recent average.',
  'ginfo.vitamins.cooking': 'Cooking',
  'ginfo.vitamins.cookingText':
    'Heat and cooking water destroy or wash out part of some vitamins. When you log a raw ingredient as boiled, ToFoo keeps typically {list} (median of the USDA retention factors).',
  'ginfo.vitamins.vegan': 'Vitamin B12 must come from a supplement. Vitamin D, riboflavin (B2) and possibly vitamin A also need attention.',

  // ── Minerals ──
  'ginfo.minerals.intro': 'Minerals are chemical elements. The body cannot make any of them; they come from food, drinking water and salt. DGE sorts them into two kinds:',
  'ginfo.minerals.major': 'Major minerals: sodium, chloride, potassium, calcium, phosphorus and magnesium, needed in amounts of hundreds of milligrams or more a day.',
  'ginfo.minerals.trace':
    'Trace elements: iron, zinc, iodine, copper, manganese, fluoride, chromium and molybdenum (and selenium, which BLS has no data for), needed in milligrams or micrograms.',
  'ginfo.minerals.absorption': 'How much you absorb depends on the meal',
  'ginfo.minerals.absHeme': 'Iron from meat and fish (haem iron) is absorbed much better than iron from plant foods.',
  'ginfo.minerals.absHelp': 'Vitamin C and meat or fish in the same meal help the body take up plant iron.',
  'ginfo.minerals.absHinder': 'Tea, coffee, calcium (also from dairy) and phytate in whole grains and legumes lower it. Phytate also binds zinc.',
  'ginfo.minerals.absModel': 'ToFoo applies these effects meal by meal when it estimates the iron you absorbed.',
  'ginfo.minerals.table': 'Where they come from',
  'ginfo.minerals.salt':
    'Most sodium and chloride comes from salt, much of it already in bread, cheese, sausages and ready meals. In Germany, iodised salt is a main source of iodine; DGE counts iodine as a nutrient to watch for everyone in Germany, whatever they eat.',
  'ginfo.minerals.vegan': 'Iodine, calcium, iron, zinc and selenium need attention.',

  // Where each vitamin and mineral mostly comes from (summaries of the per-nutrient sources).
  'ginfo.from.VITAA': 'Animal foods (retinol: liver, dairy, eggs) and plants (beta-carotene: carrots, greens)',
  'ginfo.from.VITD': 'Your own skin in sunlight; food: oily fish, eggs, some mushrooms',
  'ginfo.from.VITE': 'Plants: vegetable oils, nuts, seeds',
  'ginfo.from.VITK': 'Mostly plants: green leafy vegetables; also fermented foods',
  'ginfo.from.THIA': 'Both: whole grains, pork, legumes',
  'ginfo.from.RIBF': 'Both: milk, eggs, meat, whole grains',
  'ginfo.from.NIAEQ': 'Both: meat, fish, grains; also made from tryptophan',
  'ginfo.from.PANTAC': 'Almost all foods',
  'ginfo.from.VITB6': 'Both: fish, poultry, potatoes, bananas, whole grains',
  'ginfo.from.BIOT': 'Both: eggs, nuts, legumes, liver',
  'ginfo.from.FOL': 'Mostly plants: leafy greens, legumes, whole grains',
  'ginfo.from.VITB12': 'Animal foods only (or fortified foods and supplements)',
  'ginfo.from.VITC': 'Plants: fruit and vegetables',
  'ginfo.from.NA': 'Salt, mostly already in bread, cheese, sausages, ready meals',
  'ginfo.from.CLD': 'Salt',
  'ginfo.from.K': 'Mostly plants: vegetables, fruit, potatoes, legumes, nuts',
  'ginfo.from.CA': 'Both: dairy, calcium-rich mineral water, greens, tofu, almonds',
  'ginfo.from.MG': 'Mostly plants: whole grains, nuts, seeds, legumes, greens',
  'ginfo.from.P': 'Both: almost all protein foods',
  'ginfo.from.FE': 'Both: meat (absorbed best), legumes, whole grains, greens',
  'ginfo.from.ZN': 'Both: meat, seafood, cheese (absorbed best), whole grains, legumes, seeds',
  'ginfo.from.ID': 'Iodised salt, fish, dairy',
  'ginfo.from.CU': 'Mostly plants: nuts, seeds, whole grains, legumes; also offal',
  'ginfo.from.MN': 'Plants: whole grains, nuts, legumes, tea',
  'ginfo.from.FD': 'Fluoridated salt, tea, some mineral waters, toothpaste',
  'ginfo.from.CR': 'Both: meat, whole grains, some fruit and vegetables',
  'ginfo.from.MO': 'Mostly plants: legumes, grains, nuts',
} as const;

const who2007: InfoSource = {
  label: 'WHO/FAO/UNU (2007): Protein and amino acid requirements in human nutrition, WHO Technical Report Series 935 (sections 2, 6 and 8)',
  url: 'https://iris.who.int/handle/10665/43411',
};
const dgeProteinFaq: InfoSource = {
  label: 'DGE: Fragen und Antworten zu Protein und unentbehrlichen Aminosäuren',
  url: 'https://www.dge.de/gesunde-ernaehrung/faq/ausgewaehlte-fragen-und-antworten-zu-protein-und-unentbehrlichen-aminosaeuren/',
};
const dgeVegan: InfoSource = {
  label: 'DGE (2024): Neubewertung der DGE-Position zu veganer Ernährung, Ernährungs Umschau 71(7): 60–84',
  url: 'https://www.dge.de/wissenschaft/stellungnahmen-und-positionspapiere/positionen/neubewertung-der-position-zu-veganer-ernaehrung/',
};
const dgeOverview: InfoSource = { label: 'DGE/ÖGE reference values: overview by nutrient group', url: 'https://www.dge.de/wissenschaft/referenzwerte/' };
const dge = (path: string, name: string): InfoSource => ({ label: `DGE reference values: ${name}`, url: `https://www.dge.de/wissenschaft/referenzwerte/${path}/` });
const bls: InfoSource = { label: 'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS) 4.0', url: 'https://doi.org/10.25826/Data20251217-134202-0' };
const statPearls: InfoSource = {
  label: 'Lopez MJ, Mohiuddin SS: Biochemistry, Essential Amino Acids. StatPearls (2024)',
  url: 'https://www.ncbi.nlm.nih.gov/books/NBK557845/',
};
const ods = (sheet: string, name: string): InfoSource => ({
  label: `NIH Office of Dietary Supplements: ${name} fact sheet`,
  url: `https://ods.od.nih.gov/factsheets/${sheet}-HealthProfessional/`,
});
const usdaRetention: InfoSource = {
  label: 'USDA (2007): Table of Nutrient Retention Factors, Release 6',
  url: 'https://www.ars.usda.gov/ARSUserFiles/80400525/Data/retn/retn06.txt',
};

/** Where each group page's text comes from. Per-nutrient sources are on each nutrient's page. */
export const GROUP_INFO_SOURCES: Record<string, InfoSource[]> = {
  protein: [who2007, dgeProteinFaq, dge('protein', 'Protein'), statPearls, dgeVegan, bls],
  fat: [dge('fett-essenzielle-fettsaeuren', 'Fett, essenzielle Fettsäuren'), ods('Omega3FattyAcids', 'Omega-3 fatty acids'), dgeVegan, bls],
  carbs: [dge('kohlenhydrate', 'Kohlenhydrate'), dge('ballaststoffe', 'Ballaststoffe'), dgeOverview],
  vitamins: [dgeOverview, ods('VitaminD', 'Vitamin D'), ods('Niacin', 'Niacin'), ods('VitaminA', 'Vitamin A'), usdaRetention, dgeVegan],
  minerals: [
    dgeOverview,
    ods('Iron', 'Iron'),
    ods('Zinc', 'Zinc'),
    {
      label: 'Hallberg L et al. (1989, 1991), Hurrell RF et al. (1999), Monsen ER et al. (1982): iron absorption studies (see “How it’s modelled” on the iron page)',
      url: 'https://pubmed.ncbi.nlm.nih.gov/2911999/',
    },
    dge('natrium', 'Natrium'),
    dgeVegan,
  ],
};
