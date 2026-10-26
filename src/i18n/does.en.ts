/**
 * "What it does" on the nutrient page as tiles (owner's ask, 2026-10-26: less wall of text, more visual):
 * the summary in `info.<key>.role` (nutrientInfo.en.ts, same sources) split into short roles, one icon
 * each (icons in src/features/nutrient/WhatItDoes.tsx, in the same order).
 *
 * Per info key:
 * - `does.<key>.<n>`: a role, a few words;
 * - `does.<key>.foods` (optional): where it is found;
 * - `does.<key>.note` (optional): what the tiles can't say.
 */
export const doesEn = {
  'does.foods': 'Found in',
  'does.facts': 'Quick facts',
  'does.made': 'Body makes it',
  'does.made.no': 'No, only from food',
  'does.made.partly': 'Partly',
  'does.made.yes': 'Yes',
  'does.made.little': 'A little',
  'does.made.sun': 'In the skin, from sun',
  'does.made.gut': 'Gut bacteria, unclear',
  'does.made.PROT625': 'Partly: not the essential amino acids',
  'does.made.FASAT': 'Yes, from other food',
  'does.made.EPADHA': 'A little, from ALA',
  'does.made.NIAEQ': 'Some, from tryptophan',
  'does.uptake': 'Taken up',
  'does.uptake.all': 'nearly all',
  'does.uptake.about': 'about {pct}',
  'does.boiled': 'Kept when boiled',
  'does.factSources': 'Sources for the facts',

  'does.ENERCC.1': 'Fuels every cell',
  'does.ENERCC.2': 'Keeps you warm',
  'does.ENERCC.3': 'Powers movement',

  'does.PROT625.1': 'Muscles and organs',
  'does.PROT625.2': 'Enzymes and hormones',
  'does.PROT625.3': 'Antibodies',
  'does.PROT625.4': 'Rebuilt all the time',

  'does.EAA.1': 'A protein building block',
  'does.EAA.foods': 'Animal foods, soy, grains with legumes',

  'does.FAT.1': 'Dense energy',
  'does.FAT.2': 'Carries vitamins A, D, E, K',
  'does.FAT.3': 'Essential fatty acids',

  'does.FASAT.1': 'Energy',
  'does.FASAT.foods': 'Butter, fatty meat, cheese, coconut and palm fat',
  'does.FASAT.note': 'Not essential.',

  'does.F18:2CN6.1': 'Cell membranes',
  'does.F18:2CN6.2': 'Skin',
  'does.F18:2CN6.3': 'Raw material for signals',

  'does.F18:3CN3.1': 'The plant omega-3',
  'does.F18:3CN3.2': 'A little becomes EPA, DHA',
  'does.F18:3CN3.foods': 'Linseed, rapeseed oil, walnuts',

  'does.EPADHA.1': 'Part of the brain',
  'does.EPADHA.2': 'Part of the retina',
  'does.EPADHA.3': 'Heart health',
  'does.EPADHA.foods': 'Oily fish, algae',

  'does.CHO.1': 'Fuel for the brain',
  'does.CHO.2': 'Fuel for hard work',
  'does.CHO.foods': 'Starch and sugars',

  'does.SUGAR.1': 'Quick energy',
  'does.SUGAR.foods': 'Fruit and milk; added to many foods',
  'does.SUGAR.note': 'Not essential.',

  'does.FIBT.1': 'Regular digestion',
  'does.FIBT.2': 'Feeds gut bacteria',
  'does.FIBT.3': 'Keeps you full longer',
  'does.FIBT.foods': 'Whole grains, legumes, vegetables, fruit, nuts',

  'does.VITAA.1': 'Sight in dim light',
  'does.VITAA.2': 'Skin and mucous membranes',
  'does.VITAA.3': 'Immune system',
  'does.VITAA.foods': 'Animal foods (retinol); orange and green vegetables (beta-carotene)',

  'does.VITD.1': 'Calcium uptake for bones',
  'does.VITD.2': 'Strong muscles',
  'does.VITD.foods': 'Oily fish, eggs, some mushrooms; few foods have much',

  'does.VITE.1': 'Antioxidant',
  'does.VITE.2': 'Protects cell membranes',
  'does.VITE.foods': 'Vegetable oils, nuts, seeds',

  'does.VITK.1': 'Blood clotting',
  'does.VITK.2': 'Bone proteins',
  'does.VITK.foods': 'Green leafy vegetables, some fermented foods',

  'does.THIA.1': 'Energy from carbohydrates',
  'does.THIA.2': 'Nerves',
  'does.THIA.3': 'Heart',
  'does.THIA.foods': 'Whole grains, pork, legumes',

  'does.RIBF.1': 'Releases energy from food',
  'does.RIBF.2': 'Recycles other B vitamins',
  'does.RIBF.foods': 'Milk, eggs, meat, whole grains',

  'does.NIAEQ.1': 'Energy in every cell',

  'does.PANTAC.1': 'Energy metabolism',
  'does.PANTAC.2': 'Making fats',
  'does.PANTAC.foods': 'Almost all foods',

  'does.VITB6.1': 'Protein metabolism',
  'does.VITB6.2': 'Messengers in the brain',
  'does.VITB6.3': 'Red blood cells',
  'does.VITB6.foods': 'Fish, poultry, potatoes, bananas, whole grains',

  'does.BIOT.1': 'Processes fat, carbs, protein',
  'does.BIOT.foods': 'Eggs, nuts, legumes, liver',

  'does.FOL.1': 'DNA and new cells',
  'does.FOL.2': 'Red blood cells',
  'does.FOL.3': 'Before and in pregnancy',
  'does.FOL.foods': 'Leafy greens, legumes, whole grains',

  'does.VITB12.1': 'Healthy nerves',
  'does.VITB12.2': 'Red blood cells',
  'does.VITB12.3': 'DNA',
  'does.VITB12.foods': 'Almost only animal foods',
  'does.VITB12.note': 'Vegans need a supplement.',

  'does.VITC.1': 'Collagen: skin, vessels, wounds',
  'does.VITC.2': 'Immune system',
  'does.VITC.3': 'Antioxidant',
  'does.VITC.4': 'Iron uptake from plants',

  'does.NA.1': 'Fluid balance',
  'does.NA.2': 'Blood pressure',
  'does.NA.3': 'Nerves and muscles',
  'does.NA.foods': 'Mostly salt',

  'does.CLD.1': 'Fluid balance',
  'does.CLD.2': 'Stomach acid',
  'does.CLD.foods': 'Mainly salt',

  'does.K.1': 'Nerves and muscles',
  'does.K.2': 'Heart rhythm',
  'does.K.3': 'Lowers blood pressure',
  'does.K.foods': 'Vegetables, fruit, potatoes, legumes, nuts',

  'does.CA.1': 'Bones',
  'does.CA.2': 'Teeth',
  'does.CA.3': 'Muscles and nerves',
  'does.CA.4': 'Blood clotting',
  'does.CA.foods': 'Dairy, calcium-rich mineral water, greens, tofu, almonds',

  'does.MG.1': 'Hundreds of enzymes',
  'does.MG.2': 'Energy',
  'does.MG.3': 'Muscles and nerves',
  'does.MG.4': 'Bones',
  'does.MG.foods': 'Whole grains, nuts, seeds, legumes, greens',

  'does.P.1': 'Bones and teeth',
  'does.P.2': 'Part of DNA',
  'does.P.3': 'Energy carrier ATP',
  'does.P.foods': 'Almost all protein foods',

  'does.FE.1': 'Oxygen in the blood',
  'does.FE.2': 'Oxygen in muscles',
  'does.FE.foods': 'Meat, legumes, whole grains, greens',
  'does.FE.note': 'Iron from plants is taken up less well: more with vitamin C, less with tea and coffee.',

  'does.ZN.1': 'Immune system',
  'does.ZN.2': 'Wound healing',
  'does.ZN.3': 'Growth',
  'does.ZN.4': 'Taste and smell',
  'does.ZN.foods': 'Meat, seafood, cheese, whole grains, legumes, seeds',

  'does.ID.1': 'Thyroid hormones',
  'does.ID.2': 'Pace of metabolism',
  'does.ID.3': 'Brain of the unborn child',
  'does.ID.foods': 'Iodised salt, fish, dairy',

  'does.SE.1': 'Protects cells',
  'does.SE.2': 'Thyroid hormones',
  'does.SE.3': 'Immune system',
  'does.SE.foods': 'Fish, seafood, meat, offal, eggs; Brazil nuts very much',
  'does.SE.note': 'In plant foods it depends on the soil.',

  'does.CU.1': 'Energy',
  'does.CU.2': 'Connective tissue',
  'does.CU.3': 'Red blood cells, iron use',
  'does.CU.foods': 'Nuts, seeds, whole grains, legumes, offal',

  'does.MN.1': 'Bone formation',
  'does.MN.2': 'Metabolism',
  'does.MN.3': 'Antioxidant defence',
  'does.MN.foods': 'Whole grains, nuts, legumes, tea',

  'does.FD.1': 'Harder tooth enamel',
  'does.FD.2': 'Less tooth decay',
  'does.FD.foods': 'Fluoridated salt, toothpaste, tea, some mineral waters',

  'does.CR.1': 'May help insulin work',
  'does.CR.note': 'Whether it is essential at all is debated.',

  'does.MO.1': 'Breaks down some amino acids',
  'does.MO.2': 'Breaks down toxins',
  'does.MO.foods': 'Legumes, grains, nuts',
} as const;
