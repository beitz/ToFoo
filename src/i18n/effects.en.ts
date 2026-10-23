import { infoId, type InfoSource } from './nutrientInfo.en';

/**
 * What a nutrient's current level can mean, for the line at the top of its page and the summary on
 * Insights (owner's ask, 2026-10-23: "when something is too high or too low, a one-liner at the top
 * that says what effect this might have, expandable, with sources").
 *
 * Per nutrient (info key, see `infoId`) and direction:
 * - `low` / `high`: the one line, a short effect a reader can take in at a glance;
 * - `lowMore` / `highMore` (optional): what else is worth knowing (how sure, who is at risk);
 * - `lowHelp` / `highHelp`: what helps, in foods and habits.
 * A direction without a `low` / `high` text has no effect worth mentioning (e.g. no known deficiency of
 * molybdenum): the app then says nothing about it at the top, and the summary lists it as "no known
 * effect". General education summarised from the sources in `EFFECT_SOURCES` and `NUTRIENT_INFO_SOURCES`;
 * no numbers here (those live in model/).
 */
export const effectsEn = {
  'effect.ENERCC.low': 'Over weeks: weight loss, tiredness and loss of muscle.',
  'effect.ENERCC.lowMore': 'Eating too little also leaves less room for the protein, vitamins and minerals you need.',
  'effect.ENERCC.lowHelp': 'If you don’t mean to lose weight, add a meal or a snack, or more energy-dense foods: nuts, oils, whole-grain bread, dairy.',

  'effect.PROT625.low': 'Over time: loss of muscle and strength, slower healing, weaker immune defence.',
  'effect.PROT625.lowHelp': 'Add a protein food to each meal: legumes, dairy, eggs, fish, meat, tofu. Plant proteins become more complete when mixed, for example grains with legumes.',

  'effect.EAA.low': 'Limits how much protein your body can build, even if total protein looks enough.',
  'effect.EAA.lowHelp': 'More protein overall, or mix sources: grains are low in lysine and legumes in methionine, so eating both fills each other’s gap. Animal foods and soy have all of them.',

  'effect.F18:2CN6.low': 'Rarely a real problem; a long shortage shows as dry, scaly skin and poor wound healing.',
  'effect.F18:2CN6.lowHelp': 'Vegetable oils (sunflower, rapeseed, soy), nuts and seeds.',

  'effect.F18:3CN3.low': 'Less of the plant omega-3, from which the body also makes a little EPA and DHA.',
  'effect.F18:3CN3.lowHelp': 'Rapeseed or linseed oil for cooking and salads, walnuts, ground linseed.',

  'effect.EPADHA.low': 'Low intake is linked to a higher risk of heart disease.',
  'effect.EPADHA.lowMore': 'The body makes only small amounts from plant omega-3, so food is the main source.',
  'effect.EPADHA.lowSize1': 'Trials with over 100,000 people: extra EPA and DHA made little or no difference to deaths overall. It may slightly lower deaths from heart disease: about {people} people had to take it for one to be spared.',
  'effect.EPADHA.lowHelp': 'Oily fish such as herring, mackerel or salmon once or twice a week; algae oil is the plant source.',

  'effect.FIBT.low': 'Linked to constipation and a higher risk of heart disease, type 2 diabetes and bowel cancer.',
  'effect.FIBT.lowSize1': 'Long-term studies: people eating the most fibre had {lowerRange} fewer deaths, heart disease, strokes, type 2 diabetes and bowel cancer than those eating the least; the benefit was greatest at about {from}–{to} g a day.',
  'effect.FIBT.lowHelp': 'Whole-grain bread, pasta and rice instead of white; legumes a few times a week; vegetables, fruit and nuts every day. Raise it step by step and drink enough.',

  'effect.VITAA.low': 'A long shortage: poor sight in dim light, dry eyes, more infections.',
  'effect.VITAA.lowHelp': 'Orange and dark green vegetables (carrots, sweet potato, spinach, kale) with a little fat, plus dairy and eggs. Liver is very rich: a small portion goes a long way.',

  'effect.VITD.low': 'Over time: weaker bones and muscles. Common in winter at German latitudes.',
  'effect.VITD.lowMore': 'Most vitamin D is made in the skin from sunlight, so food alone rarely fills this store. Only a blood test shows your real level.',
  'effect.VITD.lowHelp': 'From spring to autumn, time outside around midday with arms and face uncovered. Oily fish and eggs give some. If a blood test shows a low level, a supplement is the usual way to fill it; ask your doctor.',

  'effect.VITE.low': 'A real shortage is rare and mostly comes with fat malabsorption: nerve and muscle problems.',
  'effect.VITE.lowHelp': 'Vegetable oils (wheat germ, sunflower, rapeseed), nuts and seeds.',

  'effect.VITK.low': 'Shortage is rare in adults: bleeding and bruising easily.',
  'effect.VITK.lowHelp': 'Green leafy vegetables (spinach, kale, broccoli, lettuce) and herbs. If you take blood thinners, change how much you eat only with your doctor.',

  'effect.THIA.low': 'Tiredness, irritability, nerve problems; heavy drinking raises the risk.',
  'effect.THIA.lowHelp': 'Whole grains, oats, legumes, pork, sunflower seeds. Much of it goes into cooking water, so steam, or use the water.',

  'effect.RIBF.low': 'Cracks at the corners of the mouth, sore tongue, skin problems.',
  'effect.RIBF.lowHelp': 'Milk and dairy, eggs, meat, fish, whole grains, mushrooms, almonds.',

  'effect.NIAEQ.low': 'Rare with a varied diet; a severe shortage brings skin rash in sunlight, diarrhoea and confusion.',
  'effect.NIAEQ.lowHelp': 'Meat, fish, peanuts, whole grains, legumes. Protein helps too: the body makes niacin from tryptophan.',

  'effect.PANTAC.low': 'A shortage is very rare: tingling, burning feet, tiredness.',
  'effect.PANTAC.lowHelp': 'It is in almost all foods; whole grains, legumes, eggs, meat, mushrooms and avocado have the most.',

  'effect.VITB6.low': 'Anaemia, skin inflammation, confusion, weaker immune defence.',
  'effect.VITB6.lowHelp': 'Fish, poultry, potatoes, legumes, bananas, nuts, whole grains.',

  'effect.BIOT.low': 'A shortage is rare: hair loss, skin rash, brittle nails.',
  'effect.BIOT.lowHelp': 'Eggs (cooked: raw egg white blocks biotin), nuts, oats, legumes, mushrooms.',

  'effect.FOL.low': 'Anaemia and tiredness; before and in early pregnancy, a higher risk of birth defects.',
  'effect.FOL.lowHelp': 'Leafy greens, legumes, broccoli, whole grains, oranges. Heat and storage destroy folate, so eat some raw or briefly cooked. Women who may become pregnant need folic acid tablets on top.',

  'effect.VITB12.low': 'Anaemia, tiredness, tingling and memory problems; nerve damage can become permanent.',
  'effect.VITB12.lowMore': 'The store lasts years, so a low intake can stay hidden for a long time. A blood test shows where you really are.',
  'effect.VITB12.lowHelp': 'Only animal foods (meat, fish, eggs, dairy) contain useful amounts; vegans need a supplement.',

  'effect.VITC.low': 'Tiredness, bleeding gums, slow wound healing; scurvy if severe.',
  'effect.VITC.lowSize1': 'Scurvy appears after about {months} months with no vitamin C at all, and treatment cures it in about {days} days. Lasting low levels short of scurvy may raise the risk of heart disease, cancer and cataract; that is less certain.',
  'effect.VITC.lowHelp': 'Peppers, citrus fruit, berries, kiwi, broccoli, cabbage, potatoes. Heat and storage destroy it, so fresh and raw count most.',

  'effect.NA.low': 'Usually not a real shortage: salt added while cooking or at the table counts only if you log it.',
  'effect.NA.lowMore': 'A real shortage comes with heavy sweating, vomiting or illness: headache, nausea, cramps.',
  'effect.NA.lowHelp': 'Log the salt you add, or read this line as a gap in the log rather than in your diet.',

  'effect.CLD.low': 'Usually not a real shortage: chloride comes with salt, which counts only if you log it.',
  'effect.CLD.lowHelp': 'Log the salt you add, or read this line as a gap in the log rather than in your diet.',

  'effect.K.low': 'Linked to higher blood pressure; a real shortage causes muscle weakness and cramps.',
  'effect.K.lowSize1': 'Long-term studies: people eating more potassium had {fewer} fewer strokes (likely {fewerRange}). In trials, more potassium lowered blood pressure by about {mmHg} mmHg in people with high blood pressure.',
  'effect.K.lowHelp': 'Vegetables, fruit, potatoes, legumes, nuts. Some goes into cooking water.',

  'effect.CA.low': 'Over years the body takes calcium from the bones, raising the risk of osteoporosis.',
  'effect.CA.lowSize1': 'In {none} of {studies} long-term studies, how much calcium people ate from food was not linked to broken bones. It does not tell what a severe shortage over many years does.',
  'effect.CA.lowHelp': 'Milk, yoghurt, cheese; calcium-rich mineral water; kale, broccoli, tofu made with calcium, almonds.',

  'effect.MG.low': 'Muscle cramps, tiredness, heart rhythm problems.',
  'effect.MG.lowHelp': 'Whole grains, nuts, seeds, legumes, green vegetables; some mineral waters have a lot.',

  'effect.P.low': 'Rare: weakness and bone pain.',
  'effect.P.lowHelp': 'It is in almost all protein foods: dairy, meat, fish, legumes, whole grains.',

  'effect.FE.low': 'Iron-deficiency anaemia: tiredness, pale skin, shortness of breath, feeling cold.',
  'effect.FE.lowMore': 'The store covers months, so it moves slowly; a ferritin blood test shows where it really is.',
  'effect.FE.lowHelp': 'Meat, legumes, whole grains, seeds, greens. Vitamin C in the same meal helps take up iron from plants; coffee and tea with the meal lower it.',

  'effect.ZN.low': 'More infections, slow wound healing, hair loss, loss of taste.',
  'effect.ZN.lowHelp': 'Meat, seafood, cheese, whole grains, legumes, seeds, nuts. Soaking, sprouting and sourdough lower the phytate that blocks zinc.',

  'effect.ID.low': 'Enlarged or underactive thyroid, with tiredness and weight gain.',
  'effect.ID.lowMore': 'Iodised salt is the main source in Germany, and salt you add counts only if you log it.',
  'effect.ID.lowHelp': 'Use iodised salt at home, eat sea fish once or twice a week, and dairy.',
  'effect.SE.low': 'Weaker defence against cell damage and infections; thyroid hormones work less well.',
  'effect.SE.lowMore': 'BLS has no selenium, so ToFoo estimates it from the UK food table (CoFID): treat it as rough.',
  'effect.SE.lowHelp': 'Fish, seafood, eggs, meat and offal; lentils and mushrooms. A Brazil nut adds a lot (DGE advises at most two a day).',

  'effect.CU.low': 'Rare: anaemia and low white blood cells; can follow high doses of zinc supplements.',
  'effect.CU.lowHelp': 'Nuts, seeds, whole grains, legumes, cocoa.',

  'effect.FD.low': 'More tooth decay.',
  'effect.FD.lowMore': 'Toothpaste is not counted here, and it is the main protection.',
  'effect.FD.lowHelp': 'Fluoride toothpaste; fluoridated salt and some mineral waters add to it.',

  'effect.FASAT.high': 'Raises LDL cholesterol and with it the risk of heart disease.',
  'effect.FASAT.highMore': 'The benefit comes from replacing it with unsaturated fats (vegetable oils, nuts, fish) or whole grains, not with sugar or white flour.',
  'effect.FASAT.highSize1': 'Trials of two years or more: people who ate less saturated fat had {fewer} fewer heart and circulation events such as heart attacks and strokes (likely {fewerRange}). About {people} people had to cut it for {years} years for one of them to be spared one; deaths overall did not clearly change.',
  'effect.FASAT.highHelp': 'Rapeseed or olive oil instead of butter, lard or coconut fat; leaner meat and less sausage, cheese and cream; nuts instead of pastries and chocolate.',

  'effect.VITAA.high': 'Over time preformed vitamin A can harm the liver and bones, and an unborn baby.',
  'effect.VITAA.highHelp': 'It comes from liver, liver sausage, cod liver oil and supplements. Beta-carotene from vegetables does not count here.',

  'effect.VITD.high': 'Over time: too much calcium in the blood and kidney damage.',
  'effect.VITD.highHelp': 'This comes from supplements or fortified foods, never from the sun. Check the dose with your doctor.',

  'effect.VITE.high': 'Can raise the risk of bleeding.',
  'effect.VITE.highHelp': 'Usually from supplements; check the dose.',

  'effect.VITB6.high': 'Long-term high doses can damage nerves: numbness and tingling.',
  'effect.VITB6.highHelp': 'Usually from supplements or fortified drinks; check the dose.',

  'effect.FOL.high': 'Synthetic folic acid in high doses can hide a vitamin B12 shortage.',
  'effect.FOL.highHelp': 'It comes from supplements and fortified foods; folate in ordinary food does not count here.',

  'effect.NA.high': 'Raises blood pressure and with it the risk of stroke and heart disease.',
  'effect.NA.highSize1': 'Studies following people for {fromYears} to {toYears} years: those eating more salt had {more} more strokes (likely {moreRange}).',
  'effect.NA.highSize2': 'Trials: about {less} g less salt a day lowered blood pressure by about {mmHg} mmHg (likely {mmHgRange}) within weeks, more in people with high blood pressure.',
  'effect.NA.highHelp': 'Most salt comes from bread, cheese, sausage, ready meals and snacks. Season with herbs and spices, salt less at the table, pick lower-salt versions.',

  'effect.CA.high': 'Kidney stones and constipation are possible.',
  'effect.CA.highHelp': 'Usually from supplements on top of dairy; check the dose.',

  'effect.MG.high': 'Magnesium from supplements causes diarrhoea in high doses.',
  'effect.MG.highHelp': 'Lower the supplement dose; magnesium in ordinary food does not count here.',

  'effect.FE.high': 'Stomach upset, and over time too much iron in the body.',
  'effect.FE.highHelp': 'Usually from supplements; take them only after a ferritin test and with your doctor.',

  'effect.ZN.high': 'Over time it lowers copper and can weaken immune defence.',
  'effect.ZN.highHelp': 'Usually from supplements; check the dose.',

  'effect.ID.high': 'Can upset the thyroid.',
  'effect.ID.highHelp': 'Usually from seaweed or supplements; dried seaweed can hold very much.',
  'effect.SE.high': 'Over time, brittle hair and nails, garlic breath, skin rash and tiredness.',
  'effect.SE.highHelp': 'Usually from supplements or many Brazil nuts; check the dose.',

  'effect.CU.high': 'High doses over time can harm the liver.',
  'effect.CU.highHelp': 'Usually from supplements; check the dose.',

  'effect.FD.high': 'Very high amounts over years affect the bones.',
  'effect.FD.highHelp': 'Black tea and some mineral waters can hold a lot; fluoridated salt adds more.',

  'effect.MO.high': 'Very high amounts may get in the way of copper.',
  'effect.MO.highHelp': 'Usually from supplements; check the dose.',
} as const;

const who = (isbn: string, title: string): InfoSource => ({ label: `WHO: ${title}`, url: `https://www.who.int/publications/i/item/${isbn}` });

/**
 * Sources for a direction on top of the nutrient's own (`NUTRIENT_INFO_SOURCES`) and, above an upper
 * limit, the limit's source from model/reference-values.ts. Keyed `<info key>.<low|high>`; only good
 * sources (WHO, DGE, EFSA, NIH ODS), checked 2026-10-23.
 */
export const EFFECT_SOURCES: Record<string, InfoSource[]> = {
  'FASAT.high': [who('9789240073630', 'Saturated fatty acid and trans-fatty acid intake for adults and children, guideline (2023)')],
  'NA.high': [who('9789241504836', 'Sodium intake for adults and children, guideline (2012)')],
  'FIBT.low': [who('9789240073593', 'Carbohydrate intake for adults and children, guideline (2023)')],
  'K.low': [who('9789241504829', 'Potassium intake for adults and children, guideline (2012)')],
};

/** Whether a nutrient has an effect worth mentioning in this direction (a one-line text above). */
export function hasEffectText(id: string, direction: 'low' | 'high'): boolean {
  return `effect.${infoId(id)}.${direction}` in effectsEn;
}
