/**
 * Protein quality on the protein and amino acid pages (owner's ask, 2026-11-20: which nutrients belong to
 * protein and more about it, deeper the more you tap). Summaries of the sources listed in
 * src/features/nutrient/ProteinQuality.tsx; every number is a {placeholder} filled from model/proteinQuality.ts,
 * the WHO pattern or BLS, none is written here.
 */
export const proteinEn = {
  'pq.title': 'Protein quality',
  'pq.grid': 'The 9 essential amino acids · share of need',
  'pq.gridCell': '{name}: {pct} of need',
  'pq.lowest': 'Lowest lately: {name}, {pct} of need',
  'pq.noData': 'No amino acid values in what you logged yet.',

  'pq.row.short': 'In short: what matters',
  'pq.row.digest': 'How much the gut takes up',
  'pq.row.scores': 'Quality scores: PDCAAS and DIAAS',
  'pq.row.mix': 'Mixing plant proteins',
  'pq.row.leucine': 'Leucine and building muscle',
  'pq.sources': 'Sources',

  'pq.info.what':
    'Protein is made of 20 amino acids. The body makes most of them itself, but 9 must come from food: the essential amino acids. How much of each a protein brings decides how useful it is.',
  'pq.info.tiles':
    'Each tile is that amino acid’s average over recent days against the WHO adult need per kg of body weight, as on its own page; the mark shows its status. Tap one to open it.',
  'pq.info.pairs': 'Methionine and cysteine count together, as do phenylalanine and tyrosine: the body makes the second of each pair from the first.',
  'pq.info.data': 'Many BLS amino acid values are calculated from typical patterns rather than measured, so a single amino acid is less certain than the protein total.',

  'pq.short.enough': 'Enough protein in total comes first. A better protein cannot make up for too little.',
  'pq.short.animal': 'Eggs, milk, meat and fish bring all nine essential amino acids in good amounts, and the gut takes up {low}–{high}% of their protein.',
  'pq.short.plant':
    'Plant protein is taken up a little less ({low}–{high}% for beans, peas and whole grains), and each kind runs short of one amino acid in particular: grains of lysine, legumes of methionine.',
  'pq.short.mix': 'Grains and legumes make up for each other, and not only in the same meal: a mix over the day is enough.',
  'pq.short.soy': 'Soy needs no partner: in tofu, even the lowest amino acid is at {pct} of what the body needs per gram of protein.',
  'pq.short.muscle':
    'For building muscle, spread the protein over the day: about {g} g a meal for you, every {hMin} to {hMax} hours. For health in general, the day’s total is what the recommendation is about.',

  'pq.digest.lead': 'Not all the protein you eat reaches the blood. Of eggs, milk, meat and fish the gut takes up {aLow}–{aHigh}%, of beans, peas and whole grains {pLow}–{pHigh}%.',
  'pq.digest.table': 'Taken up, measured in people',
  'pq.digest.colFood': 'Food',
  'pq.digest.colPct': 'Taken up',
  'pq.digest.why':
    'Plants give less because their protein sits in fibre-rich cell walls, and they carry substances that slow digestion. Phytate in grains and legumes lowers it by up to {phytate}%. Tannins, and the trypsin inhibitors in soy and beans, lower it more where there is a lot of them (up to {tannins} and {trypsin}% in animal studies).',
  'pq.digest.cooking': 'Heating and sprouting change the protein and how much of it is taken up. Very strong heating in some processed foods can bind lysine so the body cannot use it.',
  'pq.digest.tofoo': 'ToFoo counts protein as eaten and compares it with the recommendation as it is; it does not take off what is not taken up.',

  'pq.dig.egg': 'Egg',
  'pq.dig.wheatRefined': 'White wheat flour',
  'pq.dig.milk': 'Milk, cheese',
  'pq.dig.soyIsolate': 'Soy protein isolate',
  'pq.dig.peanutButter': 'Peanut butter',
  'pq.dig.meatFish': 'Meat, fish',
  'pq.dig.peas': 'Peas, dried',
  'pq.dig.rice': 'Rice, white',
  'pq.dig.oatmeal': 'Oatmeal',
  'pq.dig.wheatWhole': 'Whole wheat',
  'pq.dig.soyFlour': 'Soy flour',
  'pq.dig.maize': 'Maize',
  'pq.dig.beans': 'Beans, dried',

  'pq.scores.lead': 'A quality score asks two things of a protein: per gram, does it bring each essential amino acid in the amount the body needs, and how much of it is taken up?',
  'pq.scores.pdcaas':
    'PDCAAS (FAO/WHO, since 1991): the amino acid that is shortest per gram of protein, as a share of the need, times the share taken up. It stops at 1.0, so egg, milk and soy isolate all score 1.0.',
  'pq.scores.table': 'Worked out from BLS and WHO',
  'pq.scores.colLowest': 'Lowest',
  'pq.scores.colPdcaas': 'PDCAAS',
  'pq.scores.note': 'Lowest = the amino acid with the least per gram of protein, against the WHO 2007 adult pattern; taken up = the closest row of the table in “How much the gut takes up”.',
  'pq.scores.diaas':
    'DIAAS (FAO, 2013) is the newer score: it uses how much of each amino acid is taken up by the end of the small intestine, and it is not capped, so a protein that can make up for others shows it. FAO counts {excellent} or more as excellent, {good} to {goodTop} as good, and below {good} as too low for a protein claim.',
  'pq.scores.diaasExamples': 'FAO’s examples for adults: whole milk powder {milk}; {wheat} g wheat with {peas} g peas and {milkPowder} g milk powder {mix}, with lysine lowest.',
  'pq.scores.diaasWhy': 'The digestion data DIAAS needs exists for few foods, so ToFoo cannot work it out for yours.',
  'pq.scores.adjust': 'WHO’s use for a score: for a diet that scores below 1, the protein needed is the recommendation divided by the score.',

  'pq.mix.lead': 'Grains are short of lysine, legumes of methionine and cysteine. Eaten together, each fills the other’s gap.',
  'pq.mix.example': 'Worked out from BLS',
  'pq.mix.part': '{grams} g {food}',
  'pq.mix.together': 'Both together',
  'pq.mix.lowestOf': 'lowest {name}',
  'pq.mix.note': 'Share = the lowest amino acid per gram of protein, against the WHO 2007 adult pattern.',
  'pq.mix.when': 'They don’t need to be in the same meal: a reasonable mix over the day covers it. Mixing within one meal matters most when protein is low overall.',
  'pq.mix.digestion': 'Mixing fixes the balance of amino acids, not the digestion: beans and whole grains are still taken up a little less than eggs or milk.',
  'pq.mix.pairs': 'Classic pairs: lentils with rice, pea soup with bread, rice and beans, couscous with chickpeas.',
  'pq.mix.kinds': 'By kind of food',

  'pq.leu.lead': 'Leucine is a building block and also a signal: after a meal it helps switch on the building of muscle protein.',
  'pq.leu.meal':
    'For people who train, the sports nutrition society ISSN advises {gMin}–{gMax} g protein a meal (about {gPerKg} g per kg: {mine} g for you), with {leuMin}–{leuMax} g leucine, every {hMin} to {hMax} hours.',
  'pq.leu.threshold': 'About {g} g of leucine in a meal has been proposed as the point where muscle building peaks.',
  'pq.leu.table': 'Leucine by kind of food (BLS)',
  'pq.leu.colKind': 'Protein from',
  'pq.leu.colPer100': 'Leucine per 100 g protein',
  'pq.leu.colFor': 'Protein for {g} g leucine',
  'pq.leu.plant': 'Plant protein has only a little less leucine than animal protein: {plant} versus {animal} g per 100 g protein on average in a review of USDA data. Maize is unusually rich in it.',
  'pq.leu.health': 'These amounts are about building muscle. DGE’s recommendation for health is about the day’s total.',
} as const;
