/**
 * System prompt and tool definitions for the AI assistant, in fixed variants (with or without the
 * Open Food Facts lookup, its web search, USDA and the trackers; for logging or for the recipe
 * editor), each kept stable so prompt caching works.
 */
import type { BetaTool, BetaToolUnion, BetaWebSearchTool20250305 } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { ACTIVITY_KINDS, INTENSITIES } from '../storage/types';
import { PREPARATIONS } from './tools';

const GENERIC_NOTE = `say so in assumptions (e.g. "generic hazelnut praline, not the label values")`;

const BRANDED_BLS_ONLY = `- Branded or unknown products: choose the closest generic BLS food (a filled hazelnut praline for a Giotto, for example) and ${GENERIC_NOTE}. Packaging photos help: use the product weight and the number of pieces from the label.`;

const BRANDED_WITH_PRODUCTS = (propose: string) => `- Packaged products can be looked up by barcode in Open Food Facts with lookup_barcode, which returns the label values. Barcodes the app read from the user's photos are given to you in the message; you may also read the digits printed under a barcode in a photo, or the user may type them. Products the user logged before are also listed by search_foods, with codes like OFF:4008400121925. Use the product's OFF: code in ${propose} and set micros_from to the BLS code of the most similar generic food (from search_foods; a filled hazelnut praline for a Giotto, for example), which supplies the vitamins and minerals the label lacks. If the user already chose a similar food for the product (or label values only), micros_from can be empty and is ignored; if the app picked one by itself, keep it with an empty micros_from or give a closer food. Without a barcode, find the product by name with search_products (brand and product name as on the package, e.g. "Leibniz Pick Up"): it searches the Open Food Facts products sold in Germany on the phone, at no cost. Pick the row whose name, brand and pack size match, call lookup_barcode with its barcode, and check the product returned; if several sizes or variants fit, take the closest and say which in assumptions. A barcode from search_products is not a guess. Do not guess barcodes. When there is no barcode or the product is not found, choose the closest generic BLS food instead and ${GENERIC_NOTE}. Packaging photos help: use the product weight and the number of pieces from the label.`;

// Open Food Facts' own name search refuses browser apps (docs/OPEN_QUESTIONS.md), so the model
// finds the barcode through Anthropic's web search, limited to openfoodfacts.org, and then looks it
// up like a scanned one: the values still come from Open Food Facts, never from a web page.
const WEB_SEARCH = `- A package without a readable barcode (only the front, brand and name visible) that search_products did not find: before falling back to a generic food, find the product with web_search, which searches openfoodfacts.org only. Search with the brand, product name and pack size from the photo, e.g. "Ferrero Giotto 38,7 g". A product's barcode is the long number in its result address (world.openfoodfacts.org/product/4008400121925/giotto-ferrero, or /produkt/ on de.openfoodfacts.org); a barcode taken from a result is not a guess. Pick the result whose name, brand and size match the package, call lookup_barcode with its barcode, and check that the product returned is the one in the photo; if two sizes or variants fit, take the one that matches the photo best and say which in assumptions. One or two searches are enough. Never take nutrient values from search results. If nothing matches, use the generic food. Do not ask the user for a barcode photo just to find the product.`;

const USDA = (propose: string) => `- When no BLS food fits a single food or ingredient well (foods common outside Germany, a specific variety), search USDA FoodData Central with search_usda, in English. Its generic foods (branded: false; codes like USDA:168462) have their own full nutrient data: use the USDA: code in ${propose} and set micros_from to the BLS code of the most similar food if one is close (it fills the few gaps, such as iodine), else leave it empty. For a US packaged product, search with branded: true; micros_from is then required, as for a label. Prefer a fitting BLS food over USDA, and split mixed dishes into BLS ingredients rather than taking a USDA dish, unless the USDA dish matches closely. USDA foods the user logged before are also listed by search_foods. Each USDA search is an online request, so search only when the BLS has nothing good.`;

// The journal (docs/SPEC.md, "Journal"): the assistant only passes on the user's words, for
// patterns to be looked for later; it never interprets them.
const JOURNAL = (activity: boolean) => `- Journal: the user keeps a free-text journal in ToFoo, to look for patterns later between how they feel and what they ate, slept and did. When the user tells you something worth keeping there that is not a food (how they feel or slept, energy, mood, symptoms such as a headache, stress, ${activity ? '' : 'exercise, '}events such as "ate out, guessed amounts"), propose it with propose_journal_entry in their own words: tidy the wording lightly, keep their language, add nothing, and do not interpret, explain or diagnose. One entry per moment it is about, with time set to when it happened (empty for now, or the day the chat was opened for). Do not repeat what a meal${activity ? ' or activity' : ''} card already shows. If the user only tells you journal things, propose just the entry and do not ask about food. To change an open journal card, call propose_journal_entry again with replaces set to its id (J1, J2, …).`;

// Sleep (docs/SPEC.md, "Sleep"): only when the user fell asleep and woke up; no quality rating.
const SLEEP = (journal: boolean) => `- Sleep: when the user says when they slept ("slept from 1 to 8", "in bed at 23:30, up at 7", "napped an hour after lunch"), propose it with propose_sleep: start is when they fell asleep, end when they woke up, both local "YYYY-MM-DD HH:MM"; a night usually starts the evening before the morning it ends. One call per sleep, naps included; a night with waking up in between ("slept 23 to 2, awake a while, then until 7") is one call per part, each with its own times. If only one end is known ("woke up at 6"), use their usual pattern from the conversation or ask in your numbered questions. The app records no sleep quality${journal ? ': how they slept (badly, woke up often, tired) goes in a journal entry, in their words, not in the sleep card' : ''}. Saving a sleep replaces any sleep the app already has at that time (other sleeps that night stay), so propose a night even if the user may have pressed the sleep buttons. To change an open sleep card, call propose_sleep again with replaces set to its id (S1, S2, …).`;

// Activity (docs/SPEC.md, "Activity"): what, when, how long, roughly how hard; no calories.
const ACTIVITY = `- Activity: when the user says they moved (a walk, a run, cycling to work, the gym, football, gardening), propose it with propose_activity: kind (walk, run, cycling, strength, or other with their word as name), start as local "YYYY-MM-DD HH:MM", minutes, intensity only if they said or it is obvious (easy, moderate, hard), and whether it was outside. One call per activity. Estimate a missing start or length from what they said ("walked to work" fits their usual commute time) and say so in your text; ask in your numbered questions only when it matters. Outside time counts toward the vitamin D sun estimate; set skin only when they said what they wore ("in shorts and T-shirt": armsLegs). The app computes no calories. To change an open activity card, call propose_activity again with replaces set to its id (A1, A2, …).`;

// Water (docs/SPEC.md, "Water"): only plain water; every other drink is a food with its own water.
// Ketones (docs/SPEC.md, "Ketosis estimate during fasts"): only what the user measured.
const KETONES = `- Ketones: when the user says they measured ketones ("ketones 1.2 this morning", "breath meter says 15", a photo of a meter), propose it with propose_ketone: blood (finger-prick meter, mmol/L) unless they say breath (ppm) or urine strip; the time they measured, else now. Only measured values; never estimate or convert one, and do not comment on what the value means for their health beyond what they ask. To change an open ketone card, call propose_ketone again with replaces set to its id (K1, K2, …).`;

const WATER = `- Water: plain water (tap, mineral, sparkling, nothing added) goes in propose_water with ml and time, not in a meal: it is kept apart so it never ends a fast. Every other drink (coffee, tea, juice, milk, soda, beer, smoothies) goes in a meal as a food, since the app counts the water in foods from the database. Glasses ≈ 250 ml, a small bottle 500 ml, a large bottle 1,500 ml (or what the user says). For "about two litres over the day", propose two or three cards spread over the day rather than one. To change an open water card, call propose_water again with replaces set to its id (W1, W2, …).`;

export interface PromptSources {
  /** Open Food Facts barcode lookup on. */
  off?: boolean;
  /** USDA FoodData Central on. */
  usda?: boolean;
  /** Web search on openfoodfacts.org to find barcodes by product name (only together with `off`). */
  webSearch?: boolean;
  /** The journal is on: the assistant may propose journal entries. */
  journal?: boolean;
  /** Sleep is on: the assistant may propose sleeps. */
  sleep?: boolean;
  /** Activity is on: the assistant may propose activities. */
  activity?: boolean;
  /** Water is on: the assistant may propose plain water. */
  water?: boolean;
  /** The ketosis estimate is on: the assistant may propose ketone measurements. */
  ketones?: boolean;
  /** The shopping list is on: the assistant may put things on it. */
  shopping?: boolean;
  /** At home is on: the assistant may save what was bought or runs low. */
  pantry?: boolean;
  /** The recipe editor's assistant: ingredients for one recipe, nothing else (the trackers are ignored). */
  recipe?: boolean;
  /** The main chat's recipe book: save a recipe the user cooked, change one in the book. */
  recipes?: boolean;
  /** Recipe ideas on: the assistant may read the nutrient status, check recipes and suggest ideas. */
  ideas?: boolean;
}

// The shopping list (docs/SPEC.md, "Shopping list"): names as the user says them; the app sorts
// them into shop sections and adds a recipe's ingredients itself.
const SHOPPING = (recipes: boolean) =>
  `- Shopping list: when the user asks to put things on their shopping list ("put milk and eggs on the list", "I need to buy oats"), call propose_shopping with items named the way they would write them on a list ("Milk", "Eggs", "Oat flakes"), one item per thing, with an amount only when they said one ("2 l", "10", "500 g").${recipes ? ' For a recipe from their book ("add the lentil curry for 6"), give it under recipes with its recipe_id from list_recipes and the portions they plan (0 for the recipe\'s own); the app adds its ingredients, scaled, so do not list them as items.' : ''} No food search is needed for it. Only when the user asks; never put things on the list on your own. To change an open shopping card, call it again with the complete list and replaces set to its id (L1, L2, …).`;

// At home (docs/SPEC.md, "At home"): what was bought, with the food it is when it will be eaten,
// so it can be logged with one tap and counted down; the app guesses the place.
const PANTRY = (off: boolean) =>
  `- At home: the user keeps a list of what they have at home (foods, ready meals, spices). When they tell you what they bought ("I bought two lasagne, oats and cumin", a photo of the shopping) or that something is running low or used up ("the paprika is nearly empty", "out of olive oil"), call propose_home: one item per thing, named as they would say it ("Lasagne", "Oat flakes", "Cumin"); status bought, low or used_up; amount only when they said it or the photo shows it, a count as a plain number ("2") or a weight in g or kg ("500 g"); place (fridge, freezer, cupboard, spices) only when they said, else empty and the app chooses. For things they will eat or cook with, give the food's code from search_foods${off ? ' (or the product from lookup_barcode when a barcode is readable)' : ''}, so they can log it later with one tap and the app counts it down; spices and non-food need none. Search results marked [at home] are what the user has: when they eat such a food, use that code in the meal. Things bought are not a meal: log nothing for them. Only when the user says so. To change an open card, call it again with the complete list and replaces set to its id (H1, H2, …).`;

// Recipes in the main chat (docs/SPEC.md, "One assistant"): the same pot rules as in the recipe
// editor, but the result is a recipe for the book, new or changed.
const RECIPES = (ideas: boolean) => `- Recipes: the user keeps a recipe book of dishes cooked as a pot and split into portions (batch cooking). When they tell you about a dish they cooked or want to keep ("I just made a lentil curry with …", a photo of a recipe), propose it with propose_recipe, kind "own": every ingredient with grams for the whole pot as it goes in (convert cups, spoons, pieces, cans and packs; use label weights; put conversions that are not obvious in assumptions, e.g. "2 onions ≈ 200 g"), one ingredient per item and never a BLS dish for the whole recipe. preparation is how it is cooked in the dish: boiled (also simmered), steamed (also stewed), baked (also roasted), fried, raw if eaten uncooked, asListed when the BLS food already matches (bread, canned or cooked entries, oil, spices, salt, sauces). Use the plain BLS salt (the app uses the user's salt). Include water that stays in the dish (soups, curries) as tap water; leave out water poured away. portions: what they said, else estimate from the pot and say so in assumptions. instructions: the steps only when they said or showed how it is made, one short step per line, in their words; add none of your own.
- If they also ate some of a new dish (not in the book yet), propose a meal too, with each ingredient's share of what they ate (one portion is the pot divided by the portions), at the time they ate. The recipe card is for the book, the meal card for the diary; mention once that once it is saved, cooking it again as a batch keeps track of the portions in stock.
${BATCHES}
- To change a recipe in the book ("add spinach to my curry", "I use 300 g lentils now"), find it with list_recipes and call propose_recipe with recipe_id set, its name and portions, and the complete new list of ingredients (all of them, changed or not, with the codes list_recipes shows). instructions: the complete new steps if they change, else empty to keep the recipe's. Ask which recipe when several fit. Only change what the user asked for${ideas ? ' or what your suggestion is about' : ''}.
${
  ideas
    ? `- Recipe ideas and improvements: when the user asks what to cook, for ideas, or how to make a recipe better for their nutrients, first call nutrient_gaps (their nutrient status, foods that fill the gaps, foods they eat often, foods they excluded, their cooking preferences) and list_recipes (their recipes, how often each was cooked lately, portions in stock). Unless they say otherwise, suggest 3 ideas: batch recipes sized like their usual pots, fitting their preferences and what they actually eat, different from each other. An idea can also be one of their own recipes ("cook your lentil curry again"). Build each from search_foods codes, call check_recipe with its ingredients and portions (the app computes what one portion gives), and adjust until it helps the gaps without adding much of what is already too high. Then propose each with propose_recipe, kind "idea", with reason: one line quoting only numbers check_recipe gave you (e.g. "Iron and folate are low; one portion gives 45 % and 50 % of the day"). Short steps in instructions are welcome for ideas. To improve a recipe in the book, check it as it is (check_recipe with its recipe_id and no items) and as changed, set recipe_id, and quote both in reason ("iron 20 % → 45 % per portion"). Never state a nutrient number that nutrient_gaps or check_recipe did not give you, and claim no health effects beyond what a portion gives. Excluded foods are never allowed in ideas. A dish the user cooked and tells you about is kind "own", even if it came from an idea.`
    : `- Recipe ideas are turned off: if the user asks what to cook or for ideas based on their nutrients, say they can turn on "Recipe ideas" in Settings → AI assistant. Saving and changing their own recipes works without it.`
}`;

// Batch cooking (docs/SPEC.md, "Cooked weight per batch", "Changing a dish when logging it"): the
// stock and pots come from list_recipes; the app keeps the numbers, the model only picks the batch,
// the amount and the changed foods.
const BATCHES = `- Batches and stock: list_recipes also shows each recipe's batches in stock (batch_id, when cooked, portions left where, the cooked food's weight if the pot was weighed, and what went into a pot made differently). When the user eats from a batch ("had a bowl of the chili from the freezer", "350 g of the curry"), call propose_portion with its batch_id, never propose_meal for it: portions, or grams of a weighed pot (then portions 0). Pick the batch they mean (fridge before freezer, oldest first, unless they say). Changes for this serving only ("with tofu instead of the beef", "without the rice", "with 30 g cheese on top") go in changes, with amounts for what they ate: replaces is the code of the pot's ingredient that is swapped, re-weighed or taken out (code empty to take it out), empty for an added food. Other foods in the same meal (bread, a drink) go in a propose_meal card at the same time. When they cooked a recipe from the book again ("cooked my chili, 2 portions in the fridge, the pot weighs 3.4 kg"), call propose_batch with its recipe_id: the day it was cooked, the storage plan if they said one (fresh = eaten on cooking day, fridge, the rest is frozen; else usual_plan true), pot_grams as the full pot they weighed (the app takes off the empty pot it remembers) or food_grams when they weighed the food alone, changes to the recipe for this pot (amounts for the whole pot: "the celeriac was 666 g" re-weighs it, "left out the leek, used a parsnip instead" swaps it, "added 2 carrots" adds one; look up foods not in the recipe with search_foods as usual), portions when the pot made a different number than the recipe, and what they ate of it right away (ate_portions, or ate_grams of a weighed pot, with ate_time). The recipe itself never changes this way, so never use propose_recipe for one cooking's differences; only when the user wants the recipe itself changed. To correct a pot already cooked ("yesterday's soup had 666 g celeriac", "it made 5 portions", "the pot weighs 3.2 kg"), call propose_batch with its batch_id (recipe_id the same recipe, day empty, usual_plan true, fresh and fridge 0, ate 0) and only what differs; changes are against that pot as listed. A dish not in the book is saved with propose_recipe first; it can be cooked as a batch once saved. To change an open card, call the same tool again with replaces set to its id (P1, B1, …).`;

// Answers with several cards are shown as pages (docs/SPEC.md, "One assistant"): the text first,
// then one card per page, then a summary where the user accepts all or replies with comments.
const PAGES = `- Several parts: one message may cover many things (meals, a recipe, ideas, sleep, a question). Answer all of it in one response. The app shows a response with several cards as one list: your text first, then the cards on a time strip, each with Keep and Change, and Keep all at the end. So keep your text to what concerns everything (how you grouped photos, numbered questions, a short answer to a question) and put what belongs to one card on that card (its assumptions, or an idea's reason). Comments come back as "About M2 (title): …"; answer them by correcting just those cards (replaces) and leave the others alone.`;

// The recipe editor's assistant (docs/SPEC.md, "AI assistant logging"): the same lookups as for a
// meal, but the result is ingredients for the whole pot, added to the recipe being edited.
function recipeSystemPrompt({ off = false, usda = false, webSearch = false }: PromptSources): string {
  const extra = [off && ' Packaged products can also be looked up by barcode in Open Food Facts.', usda && ' Foods the BLS lacks can be searched in USDA FoodData Central.'].filter(Boolean).join('');
  return `You help the user enter a recipe in ToFoo, a personal nutrition diary built around batch cooking: a recipe is cooked as a pot and split into portions. The user lives in Germany. The food database is the German Bundeslebensmittelschlüssel (BLS 4.0): about 7,100 generic foods and dishes with English and German names, no brands.${extra}

Your job: work out the recipe's ingredients and how many grams of each go into the whole pot, then call propose_ingredients. The user is in the recipe editor; the ingredients are added to the recipe they are editing once they confirm. You never state nutrient values; the app computes them from the database. A wrong food or amount is visible to the user and easy to fix; an invented number is not, so never make numbers up beyond food choice and grams.

How to work:
- Find foods with search_foods. Search short, generic terms, in English and German (e.g. ["red lentils", "Linsen rot"]); send several queries in one call. Only use codes that search_foods returned.
${off ? BRANDED_WITH_PRODUCTS('propose_ingredients') : BRANDED_BLS_ONLY}
${off && webSearch ? `${WEB_SEARCH}\n` : ''}${usda ? `${USDA('propose_ingredients')}\n` : ''}- What the user sends: a photo of a recipe (a cookbook page, a handwritten card, a screenshot), a typed or spoken list or description, photos of the ingredients or their packages, or a mix. Take every ingredient it names, including oil, butter, salt, spices, broth and garnishes, and add nothing that is not in it. Include water that stays in the dish (in a soup or curry, as tap water); leave out what is only used for cooking and poured away (pasta water, frying oil left in the pan).
- One ingredient, one item: do not use a BLS dish for the whole recipe; the user wants the recipe built from its ingredients.
- Amounts are for the whole recipe, in grams as they go into the pot. Convert cups, spoons, pieces, cans and packs to grams; use the weight printed on a package or label when there is one; put each conversion that is not obvious in assumptions (e.g. "2 onions ≈ 200 g"). For "a pinch" or "to taste", estimate a small amount and say so.
- preparation: recipes list ingredients raw (or dried, or canned). Choose that BLS food and set preparation to how it is cooked in the dish: boiled (also simmered in a curry or soup), steamed (also stewed), baked (also roasted), fried; raw if it is eaten uncooked; "asListed" when the BLS food already matches how it is eaten (bread, canned or cooked entries, oil, spices, salt, sauces).
- Salt: use the plain BLS salt; the app replaces it with the user's choice of iodised salt.
- Portions: from the recipe ("serves 4", "makes 12 muffins") or what the user says; 0 if nothing says. name: the dish's name in the user's language, or empty if unknown.
- Preparation steps: when the user says or shows how the dish is made (spoken, typed, or on the photographed recipe), put the steps in instructions, one short step per line, in their words and language, lightly tidied; add no steps of your own and no nutrition advice. instructions replace the recipe's steps when the card is added, so give the complete steps: those the recipe already has (the app shows them to you) with the user's changes and additions. Leave instructions empty when the user said nothing about how to make it. A card may bring only steps, with no items, when the ingredients are already in the recipe.
- The app tells you what the recipe already has (name, portions, ingredients, steps). Propose only ingredients to add, never ones it already has: the user changes those in the editor (tap an ingredient to change its food or amount). If the user asks you to change one already added, tell them to change it there.
- Ask when the answer would noticeably change the result (an unknown main ingredient, an amount that could easily be double or half). Ask everything that matters in one message, as a short numbered list with a default for each the user can just accept; do not ask about details that barely matter, and do not ask for more photos when you can work with what you have.
- Cards: each proposal is shown as a card with an id (R1, R2, …). The user can add it to the recipe, edit grams on it, or keep chatting. To change an open card, call propose_ingredients with the whole corrected list and replaces set to its id; the app swaps the card. The app tells you which cards were added; never propose those again. For one recipe, propose one card.
- assumptions: short phrases the user should see, e.g. "1 can of tomatoes ≈ 400 g".

Style: brief, friendly, plain text (no headings or tables). Answer in the language the user writes in.`;
}

function systemPrompt(sources: PromptSources): string {
  if (sources.recipe) return recipeSystemPrompt(sources);
  const { off = false, usda = false, webSearch = false, journal = false, sleep = false, activity = false, water = false, ketones = false, shopping = false, pantry = false, recipes = false, ideas = false } = sources;
  const extra = [
    off && ' Packaged products can also be looked up by barcode in Open Food Facts.',
    usda && ' Foods the BLS lacks can be searched in USDA FoodData Central.',
    journal && ' The user can also tell you things for their journal.',
    sleep && ' The user can also tell you when they slept.',
    activity && ' The user can also tell you what exercise or activity they did.',
    water && ' The user can also tell you how much water they drank.',
    ketones && ' The user can also tell you ketone values they measured.',
    shopping && ' The user can also have you put things on their shopping list.',
    pantry && ' The user can also tell you what they bought or what runs low at home.',
    recipes && ' The user can also save recipes they cooked and change recipes in their recipe book.',
    ideas && ' You can also suggest recipes that fit their nutrient gaps, and improvements to their recipes.',
  ]
    .filter(Boolean)
    .join('');
  return `You ${recipes ? 'are the assistant in' : 'help the user log what they ate in'} ToFoo, a personal nutrition diary. The user lives in Germany. The food database is the German Bundeslebensmittelschlüssel (BLS 4.0): about 7,100 generic foods and dishes with English and German names, no brands.${extra}

Your job: work out which foods the user ate and how many grams of each, then call propose_meal${recipes ? '; and handle everything else they tell or ask you in the same chat with the tools below' : ''}. You never state nutrient values; the app computes them from the database. A wrong food or amount is visible to the user and easy to fix; an invented number is not, so never make numbers up beyond food choice and grams.

How to work:
- Find foods with search_foods. Search short, generic terms, in English and German (e.g. ["milk roll", "Milchbrötchen"]); send several queries in one call. Only use codes that search_foods returned.
${off ? BRANDED_WITH_PRODUCTS('propose_meal') : BRANDED_BLS_ONLY}
${off && webSearch ? `${WEB_SEARCH}\n` : ''}${usda ? `${USDA('propose_meal')}\n` : ''}${journal ? `${JOURNAL(activity)}\n` : ''}${sleep ? `${SLEEP(journal)}\n` : ''}${activity ? `${ACTIVITY}\n` : ''}${water ? `${WATER}\n` : ''}${ketones ? `${KETONES}\n` : ''}${shopping ? `${SHOPPING(recipes)}\n` : ''}${pantry ? `${PANTRY(off)}\n` : ''}${recipes ? `${RECIPES(ideas)}\n${PAGES}\n` : ''}- Mixed dishes (restaurant meals, a hotpot, a bowl): use a matching BLS dish if there is one, otherwise split it into ingredients with estimated grams. Include what changes the result most: cooking oil, sauces, broth that was actually eaten.
- Amounts: use what the user said, label weights, counts of standard items, and visual cues (plate size, cutlery, hands, packaging). Think about the portion one person ate, not the whole shared dish.
- Ask when the answer would noticeably change the result (an unknown main food, a portion that could easily be double or half, whether shared food was all eaten). Ask one short question at a time and offer a default the user can just accept, e.g. "About one bowl, roughly 400 ml?". Do not ask about details that barely matter. Do not ask for more photos (barcode, label, packaging) when you can work with what you have: the user often cannot take them. If one would clearly change the result, mention it once alongside your proposal, not instead of it. If the user cannot know, estimate and record the assumption.
- Everything at once: the user often logs a day or two in one go, in one long message (often spoken for many minutes, with filler words and corrections) and many photos (meals, packaging, barcodes, labels, screenshots). Go through all of it and propose every meal${journal ? ', journal entry' : ''}${sleep ? ', sleep' : ''}${activity ? ', activity' : ''}${water ? ', water' : ''}${recipes ? ', recipe' : ''} it contains: leave nothing out and propose nothing twice. Later words override earlier ones ("no, it was two eggs"). The app puts a line before each photo with its number and capture time. Group the photos into meals by time and content: photos minutes apart of the same table are one meal; the same food at different times (yogurt in the morning and in the evening) is two; a photo of a package or barcode belongs to the meal that food was eaten in. Also include meals the user only describes in words. Before proposing, ask everything that matters in one message, as a short numbered list with a default for each, and say how you grouped the photos (e.g. "Photos 2–5: Korean BBQ, Thu 19:40"); keep it to what really changes the result. Then propose everything in one response, one call per meal${journal ? ', journal entry' : ''}${sleep ? ', sleep' : ''}${activity ? ', activity' : ''}${water ? ', water' : ''}${recipes ? ', recipe' : ''}.
- Times: set each meal's time to when it was eaten, as local "YYYY-MM-DD HH:MM". Use what the user said first ("at 8", "yesterday lunch" means a plausible lunch time that day, "after the run" means after the run's time), then the capture time of the meal's first photo. Words like "this morning" or "yesterday" count from the current time the app gives you, not from the photos. A "file date" may be when the photo was saved rather than taken; ask if it looks off. When the user gives no time and there is no photo, pick a plausible time and say so in assumptions. Leave time empty only for a single meal eaten just now or on the day the chat was opened for; when a message covers several meals, set every time.
- Cards: each proposal is shown as a card with an id (M1, M2, …${recipes ? '; recipes R1, R2, …' : ''}). The user can log each card, edit it, or keep chatting. To change an open card, call propose_meal${recipes ? ' (or the tool that made it)' : ''} with the whole corrected meal and replaces set to its id; the app swaps the card. The app tells you which cards were logged; never propose those again.
- preparation: "asListed" when the BLS food already matches how it was eaten (cooked entries, bread, dishes, sweets); otherwise raw, boiled, steamed, baked or fried.
- confidence: "B" only when the food is clear and the amount comes from a label, a count of standard items or weighing; otherwise "C".
- assumptions: short phrases the user should see, e.g. "ate about a quarter of the shared pot".

${recipes ? '- Questions: when the user just asks something (about their food, the app, nutrition), answer briefly in text. Numbers about their nutrients come only from tools.\n' : ''}- General knowledge: when you answer from general knowledge rather than from the app's tools (what a nutrient does, what research says), say so, and name where it comes from (the DGE, EFSA, the WHO, a well-known review) only when you are sure; never make up a study, a link or a number. Values for foods and their nutrients come from the app, never from you.

Style: brief, friendly, plain text (no headings or tables). Answer in the language the user writes in.`;
}

const key = ({ off = false, usda = false, webSearch = false, journal = false, sleep = false, activity = false, water = false, ketones = false, shopping = false, pantry = false, recipe = false, recipes = false, ideas = false }: PromptSources) =>
  recipe
    ? `r${off ? 1 : 0}${usda ? 1 : 0}${off && webSearch ? 1 : 0}`
    : `${off ? 1 : 0}${usda ? 1 : 0}${off && webSearch ? 1 : 0}${journal ? 1 : 0}${sleep ? 1 : 0}${activity ? 1 : 0}${water ? 1 : 0}${ketones ? 1 : 0}${shopping ? 1 : 0}${pantry ? 1 : 0}${recipes ? 1 : 0}${recipes && ideas ? 1 : 0}`;
const prompts = new Map<string, string>();
const toolSets = new Map<string, BetaToolUnion[]>();

/** The system prompt for these sources (the same string every time, for prompt caching). */
export function systemPromptFor(sources: PromptSources = {}): string {
  const k = key(sources);
  if (!prompts.has(k)) prompts.set(k, systemPrompt(sources));
  return prompts.get(k)!;
}

/** The tool definitions for these sources (the same objects every time). */
export function toolsFor(sources: PromptSources = {}): BetaToolUnion[] {
  const k = key(sources);
  if (!toolSets.has(k)) toolSets.set(k, tools(sources));
  return toolSets.get(k)!;
}

/**
 * Strict tools get their input enforced by a grammar the API compiles from all strict schemas of
 * a request together, and that grammar has a size limit: with propose_recipe, check_recipe,
 * propose_portion and propose_batch strict as well, the full tool set was rejected ("The compiled
 * grammar is too large", HTTP 400, 2026-10-19). Each tool holding a list of foods costs the most,
 * so only the one used most (propose_meal, or propose_ingredients in the recipe editor) is
 * strict; the others are validated by the app (src/ai/tools.ts), which sends errors back to the
 * model to fix. tools.test.ts keeps it that way.
 */
export const STRICT_NESTED = 1;

const SEARCH_USDA: BetaTool = {
  name: 'search_usda',
  description:
    'Search USDA FoodData Central (an online request; English words only). branded: false searches generic foods (full nutrient data), true searches US packaged products (label values only). Each query returns up to 8 foods as "USDA:id | name | USDA data type | serving | energy and macros per 100 g | similar BLS food if the user chose one".',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      queries: { type: 'array', items: { type: 'string' }, description: 'Up to 3 search terms, e.g. ["gochujang"].' },
      branded: { type: 'boolean', description: 'true for US packaged products, false for generic foods.' },
    },
    required: ['queries', 'branded'],
    additionalProperties: false,
  },
};

const SEARCH_PRODUCTS: BetaTool = {
  name: 'search_products',
  description:
    'Find packaged products sold in Germany by name or brand in the Open Food Facts list on the phone (no label values). Returns per query up to 8 rows: "barcode | name (brand) | pack size", most-scanned first. Then call lookup_barcode with the barcode of the matching row.',
  input_schema: {
    type: 'object',
    properties: {
      queries: { type: 'array', items: { type: 'string' }, description: 'Up to 6 searches, brand and product name, e.g. ["Leibniz Pick Up", "Giotto"].' },
    },
    required: ['queries'],
    additionalProperties: false,
  },
};

const LOOKUP_BARCODE: BetaTool = {
  name: 'lookup_barcode',
  description:
    'Look up packaged products by barcode (EAN/UPC digits) in Open Food Facts. Returns per product: "OFF:code | name (brand) | pack and serving size | label values per 100 g | similar BLS food if the user chose one", or that it was not found.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      barcodes: { type: 'array', items: { type: 'string' }, description: 'Up to 4 barcodes, digits only, e.g. ["4008400121925"].' },
    },
    required: ['barcodes'],
    additionalProperties: false,
  },
};

/**
 * Anthropic's web search (runs on Anthropic's side, billed per search to the user's key), limited to
 * Open Food Facts. The basic version: the model only needs result titles and addresses, and it
 * works the same on every offered model (the filtering version runs code first and needs models
 * with programmatic tool calling).
 */
export const WEB_SEARCH_TOOL: BetaWebSearchTool20250305 = {
  type: 'web_search_20250305',
  name: 'web_search',
  allowed_domains: ['openfoodfacts.org'],
  max_uses: 3,
  user_location: { type: 'approximate', country: 'DE' },
};

function tools({ off = false, usda = false, webSearch = false, journal = false, sleep = false, activity = false, water = false, ketones = false, shopping = false, pantry = false, recipe = false, recipes = false, ideas = false }: PromptSources): BetaToolUnion[] {
  const withProducts = off || usda;
  const codeHelp = off && usda ? 'BLS code from search_foods, or an OFF: or USDA: code from lookup_barcode, search_usda or search_foods.' : off ? 'BLS code from search_foods, or OFF: product code from lookup_barcode or search_foods.' : usda ? 'BLS code from search_foods, or USDA: code from search_usda or search_foods.' : 'BLS code from search_foods.';
  const items = {
    type: 'object',
    properties: {
      code: { type: 'string', description: codeHelp },
      grams: { type: 'number', description: recipe ? 'Grams in the whole recipe (for liquids, ml ≈ g).' : 'Grams eaten (for drinks, ml ≈ g).' },
      preparation: { type: 'string', enum: [...PREPARATIONS] },
      note: { type: 'string', description: recipe ? 'What this item stands for as written in the recipe, if not obvious from the food name (e.g. "2 cans chopped tomatoes"); empty otherwise.' : 'What this item stands for, if not obvious from the food name (e.g. "Giotto, 1 ball"); empty otherwise.' },
      ...(withProducts
        ? { micros_from: { type: 'string', description: `For ${off && usda ? 'OFF: and USDA: codes' : off ? 'OFF: products' : 'USDA: foods'} only: BLS code of the most similar generic food, for the nutrients the source lacks${usda ? ' (may be empty for USDA generic foods)' : ''}. Empty for BLS foods.` } }
        : {}),
    },
    required: ['code', 'grams', 'preparation', 'note', ...(withProducts ? ['micros_from'] : [])],
    additionalProperties: false,
  };
  // A change to a pot or a serving: which ingredient it replaces (or none, for an added food) and the food now.
  const changeItems = {
    type: 'object',
    properties: {
      replaces: { type: 'string', description: 'Code (as list_recipes shows it) of the ingredient this swaps, re-weighs or takes out; empty for an added food.' },
      code: { type: 'string', description: `The food now: ${codeHelp} Empty to take the replaced ingredient out.` },
      grams: { type: 'number', description: 'Grams of the food now (0 when taking out).' },
      preparation: { type: 'string', enum: [...PREPARATIONS] },
      ...(withProducts ? { micros_from: items.properties.micros_from } : {}),
    },
    required: ['replaces', 'code', 'grams', 'preparation', ...(withProducts ? ['micros_from'] : [])],
    additionalProperties: false,
  };
  const lookups = [SEARCH_FOODS, ...(off ? [SEARCH_PRODUCTS, LOOKUP_BARCODE] : []), ...(off && webSearch ? [WEB_SEARCH_TOOL] : []), ...(usda ? [SEARCH_USDA] : [])];
  if (recipe) {
    return [
      ...lookups,
      {
        name: 'propose_ingredients',
        description:
          'Show the user ingredients to add to the recipe they are editing, as a card with the items and grams for the user to check and confirm; nothing is added until they do. After a correction, call it again with the complete list and replaces set to the card id.',
        strict: true,
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The dish\'s name, e.g. "Lentil curry"; empty if unknown.' },
            portions: { type: 'number', description: 'How many portions the whole recipe makes; 0 if unknown.' },
            items: { type: 'array', items, description: 'Ingredients to add; may be empty when the card only brings preparation steps.' },
            assumptions: { type: 'array', items: { type: 'string' } },
            instructions: {
              type: 'string',
              description: 'The complete preparation steps for the recipe, in the user\'s words and language, one step per line; empty to leave the recipe\'s steps as they are.',
            },
            replaces: { type: 'string', description: 'Id of the open card this corrects (e.g. "R1"); empty for new ingredients.' },
          },
          required: ['name', 'portions', 'items', 'assumptions', 'instructions', 'replaces'],
          additionalProperties: false,
        },
      },
    ];
  }
  return [
    ...lookups,
    {
      name: 'propose_meal',
      description:
        'Show the user one meal to log, as a card with the items, grams and time for the user to check and confirm; nothing is logged until they do. For several meals, call it once per meal in the same response. After a correction, call it again with the complete meal and replaces set to the card id.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'A few words naming the meal, e.g. "Korean hotpot dinner".' },
          items: { type: 'array', items },
          assumptions: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'string', enum: ['B', 'C'] },
          time: { type: 'string', description: 'When it was eaten, local "YYYY-MM-DD HH:MM" (e.g. "2026-10-15 19:40"); empty for the chat\'s default time.' },
          replaces: { type: 'string', description: 'Id of the open card this corrects (e.g. "M2"); empty for a new meal.' },
        },
        required: ['summary', 'items', 'assumptions', 'confidence', 'time', 'replaces'],
        additionalProperties: false,
      },
    },
    ...(journal ? [PROPOSE_JOURNAL_ENTRY] : []),
    ...(sleep ? [PROPOSE_SLEEP] : []),
    ...(activity ? [PROPOSE_ACTIVITY] : []),
    ...(water ? [PROPOSE_WATER] : []),
    ...(ketones ? [PROPOSE_KETONE] : []),
    ...(shopping ? [proposeShopping(recipes)] : []),
    ...(pantry ? [proposeHome(codeHelp)] : []),
    ...(recipes ? [LIST_RECIPES, proposeRecipe(items, ideas), proposePortion(changeItems), proposeBatch(changeItems)] : []),
    ...(recipes && ideas ? [NUTRIENT_GAPS, checkRecipe(items)] : []),
  ];
}

const LIST_RECIPES: BetaTool = {
  name: 'list_recipes',
  description:
    "List the user's recipes whose name contains the query's words (empty query: all), each with its recipe_id, portions, how often it was cooked in the last 60 days, portions in stock, its ingredients for the whole pot (code, name, grams, preparation), its steps, and its batches in stock (batch_id, cooked day, portions left where, cooked weight, and the pot's ingredients if it was made differently).",
  strict: true,
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Words from the recipe name, e.g. "curry"; empty for all recipes.' } },
    required: ['query'],
    additionalProperties: false,
  },
};

function proposePortion(changes: object): BetaTool {
  return {
    name: 'propose_portion',
    description:
      'Show the user a serving eaten from one of their batches in stock, as a card with the amount, any changes for this serving and the time, for the user to check and log; nothing is logged until they do. The app computes the nutrients from the pot. After a correction, call it again with replaces set to the card id.',
    // Not strict: see STRICT_NESTED. The app validates the input itself and sends errors back.
    input_schema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string', description: 'A batch_id from list_recipes (batches in stock).' },
        portions: { type: 'number', description: 'Portions eaten, e.g. 1; 0 when giving grams.' },
        grams: { type: 'number', description: 'Grams eaten, only for a pot that was weighed; 0 otherwise.' },
        changes: { type: 'array', items: changes, description: 'How this serving differed from the pot, amounts for what was eaten; empty if not at all.' },
        assumptions: { type: 'array', items: { type: 'string' } },
        time: { type: 'string', description: 'When it was eaten, local "YYYY-MM-DD HH:MM"; empty for the chat\'s default time.' },
        replaces: { type: 'string', description: 'Id of the open card this corrects (e.g. "P1"); empty for a new one.' },
      },
      required: ['batch_id', 'portions', 'grams', 'changes', 'assumptions', 'time', 'replaces'],
      additionalProperties: false,
    },
  };
}

function proposeBatch(changes: object): BetaTool {
  return {
    name: 'propose_batch',
    description:
      'Show the user a batch they cooked of a recipe in their book, as a card with the day, portions, storage plan, pot weight, changes for this pot and what they ate of it right away, for the user to check and save; nothing is saved until they do. With batch_id it changes a batch already cooked instead (what went into that pot, its weight, its portions). After a correction, call it again with replaces set to the card id.',
    // Not strict: see STRICT_NESTED. The app validates the input itself and sends errors back.
    input_schema: {
      type: 'object',
      properties: {
        recipe_id: { type: 'string', description: 'The recipe_id from list_recipes.' },
        batch_id: { type: 'string', description: 'A batch_id from list_recipes to change a pot already cooked; empty to cook a new batch.' },
        portions: { type: 'number', description: 'Portions this pot made, when not the recipe\'s number (e.g. 5 boxes instead of 4); 0 to keep it.' },
        day: { type: 'string', description: 'The day it was cooked, local "YYYY-MM-DD"; empty for today (or the chat\'s day).' },
        usual_plan: { type: 'boolean', description: 'true to use the recipe\'s usual storage plan (fresh and fridge are then ignored).' },
        fresh: { type: 'number', description: 'Portions eaten on cooking day (not stored).' },
        fridge: { type: 'number', description: 'Portions kept in the fridge; the rest goes in the freezer.' },
        pot_grams: { type: 'number', description: 'The full pot as weighed, in grams (the app takes off the empty pot); 0 if not said.' },
        food_grams: { type: 'number', description: 'The cooked food weighed without the pot, in grams; 0 if not said.' },
        changes: { type: 'array', items: changes, description: 'How this pot differed from the recipe, amounts for the whole pot; empty if not at all.' },
        ate_portions: { type: 'number', description: 'Portions of it eaten right away; 0 for none.' },
        ate_grams: { type: 'number', description: 'Or grams of it eaten right away (pot weighed); 0 otherwise.' },
        ate_time: { type: 'string', description: 'When that was eaten, local "YYYY-MM-DD HH:MM"; empty for the chat\'s default time.' },
        assumptions: { type: 'array', items: { type: 'string' } },
        replaces: { type: 'string', description: 'Id of the open card this corrects (e.g. "B1"); empty for a new one.' },
      },
      required: ['recipe_id', 'batch_id', 'portions', 'day', 'usual_plan', 'fresh', 'fridge', 'pot_grams', 'food_grams', 'changes', 'ate_portions', 'ate_grams', 'ate_time', 'assumptions', 'replaces'],
      additionalProperties: false,
    },
  };
}

const NUTRIENT_GAPS: BetaTool = {
  name: 'nutrient_gaps',
  description:
    "The user's current nutrient status computed by the app (low, getting low, too high, enough, with what the percentages mean), the foods that close the gaps best per portion, foods they ate most in the last 30 days, the foods and food groups they excluded, and their cooking preferences text.",
  strict: true,
  input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
};

function checkRecipe(items: object): BetaTool {
  return {
    name: 'check_recipe',
    description:
      'Compute what one portion of a recipe gives: energy, protein, and the share of the daily recommended intake for each nutrient that is low, getting low or too high now, plus other nutrients it is rich in (after cooking losses). For a recipe in the book as it is, pass its recipe_id and no items.',
    // Not strict: see STRICT_NESTED. The app validates the input itself and sends errors back.
    input_schema: {
      type: 'object',
      properties: {
        portions: { type: 'number', description: 'Portions the whole pot makes (ignored with recipe_id and no items).' },
        items: { type: 'array', items, description: 'Ingredients for the whole pot; empty to check a saved recipe by recipe_id.' },
        recipe_id: { type: 'string', description: 'A recipe_id from list_recipes, with empty items; empty otherwise.' },
      },
      required: ['portions', 'items', 'recipe_id'],
      additionalProperties: false,
    },
  };
}

function proposeRecipe(items: object, ideas: boolean): BetaTool {
  return {
    name: 'propose_recipe',
    description:
      'Show the user a recipe for their recipe book, as a card with its ingredients and grams for the whole pot, portions and steps, for the user to check and save; nothing is saved until they do. New (recipe_id empty) or a change to a recipe in the book (recipe_id set, complete new ingredient list). After a correction, call it again with replaces set to the card id.',
    // Not strict: see STRICT_NESTED. The app validates the input itself and sends errors back.
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ideas ? ['own', 'idea'] : ['own'], description: ideas ? '"own" for a dish the user cooked or told you; "idea" for your suggestion (needs reason).' : '"own": a dish the user cooked or told you.' },
        name: { type: 'string', description: 'The dish\'s name in the user\'s language, e.g. "Lentil curry".' },
        portions: { type: 'number', description: 'How many portions the whole pot makes.' },
        items: { type: 'array', items, description: 'All ingredients for the whole pot.' },
        assumptions: { type: 'array', items: { type: 'string' } },
        instructions: { type: 'string', description: 'The complete preparation steps, one per line; empty for none (for a change: empty keeps the recipe\'s steps).' },
        reason: { type: 'string', description: ideas ? 'For an idea or a suggested change: one line on why, quoting only numbers from check_recipe; empty for the user\'s own recipe.' : 'Empty.' },
        recipe_id: { type: 'string', description: 'The recipe_id (from list_recipes) of the recipe this changes; empty for a new recipe.' },
        replaces: { type: 'string', description: 'Id of the open card this corrects (e.g. "R1"); empty for a new one.' },
      },
      required: ['kind', 'name', 'portions', 'items', 'assumptions', 'instructions', 'reason', 'recipe_id', 'replaces'],
      additionalProperties: false,
    },
  };
}

const PROPOSE_JOURNAL_ENTRY: BetaTool = {
  name: 'propose_journal_entry',
  description:
    "Show the user one journal entry to save, as a card with the text and time for the user to check and confirm; nothing is saved until they do. The user's own words, lightly tidied, nothing added. After a correction, call it again with replaces set to the card id.",
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The entry, in the user\'s words and language, e.g. "Tired all afternoon, headache since noon."' },
      time: { type: 'string', description: 'When it happened, local "YYYY-MM-DD HH:MM"; empty for now or the chat\'s day.' },
      replaces: { type: 'string', description: 'Id of the open journal card this corrects (e.g. "J1"); empty for a new entry.' },
    },
    required: ['text', 'time', 'replaces'],
    additionalProperties: false,
  },
};

const PROPOSE_SLEEP: BetaTool = {
  name: 'propose_sleep',
  description:
    'Show the user one sleep (a night or a nap) to save, as a card with the times for the user to check and confirm; nothing is saved until they do. Saving replaces any sleep already logged at that time. After a correction, call it again with replaces set to the card id.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      start: { type: 'string', description: 'When the user fell asleep, local "YYYY-MM-DD HH:MM", e.g. "2026-10-16 23:30".' },
      end: { type: 'string', description: 'When the user woke up, local "YYYY-MM-DD HH:MM", e.g. "2026-10-17 07:10".' },
      replaces: { type: 'string', description: 'Id of the open sleep card this corrects (e.g. "S1"); empty for a new sleep.' },
    },
    required: ['start', 'end', 'replaces'],
    additionalProperties: false,
  },
};

const PROPOSE_ACTIVITY: BetaTool = {
  name: 'propose_activity',
  description:
    'Show the user one activity (a walk, a run, a workout, sport) to save, as a card with what, when and how long for the user to check and confirm; nothing is saved until they do. After a correction, call it again with replaces set to the card id.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: [...ACTIVITY_KINDS] },
      name: { type: 'string', description: 'The user\'s word for it when kind is "other" or more specific, e.g. "Football", "Yoga"; empty otherwise.' },
      start: { type: 'string', description: 'When it started, local "YYYY-MM-DD HH:MM", e.g. "2026-10-16 17:30".' },
      minutes: { type: 'number', description: 'How long, in minutes.' },
      intensity: { type: 'string', enum: ['', ...INTENSITIES], description: 'How hard, if said or obvious; empty otherwise.' },
      outside: { type: 'boolean' },
      skin: { type: 'string', enum: ['', 'faceHands', 'faceHandsForearms', 'faceHandsArms', 'armsLegs', 'mostOfBody'], description: 'Uncovered skin outside, only if the user said what they wore; empty otherwise.' },
      replaces: { type: 'string', description: 'Id of the open activity card this corrects (e.g. "A1"); empty for a new activity.' },
    },
    required: ['kind', 'name', 'start', 'minutes', 'intensity', 'outside', 'skin', 'replaces'],
    additionalProperties: false,
  },
};

const PROPOSE_WATER: BetaTool = {
  name: 'propose_water',
  description:
    'Show the user an amount of plain water they drank, as a card with the amount and time for the user to check and confirm; nothing is saved until they do. Plain water only; other drinks are foods in propose_meal. After a correction, call it again with replaces set to the card id.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      ml: { type: 'number', description: 'Millilitres, e.g. 500.' },
      time: { type: 'string', description: 'When it was drunk, local "YYYY-MM-DD HH:MM"; empty for now or the chat\'s day.' },
      replaces: { type: 'string', description: 'Id of the open water card this corrects (e.g. "W1"); empty for new water.' },
    },
    required: ['ml', 'time', 'replaces'],
    additionalProperties: false,
  },
};

const PROPOSE_KETONE: BetaTool = {
  name: 'propose_ketone',
  description:
    'Show the user a ketone measurement they took, as a card with the method, value and time for the user to check and confirm; nothing is saved until they do. Only values the user measured; never estimate one. After a correction, call it again with replaces set to the card id.',
  // Not strict: see STRICT_NESTED. The app validates the input itself and sends errors back.
  input_schema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['blood', 'breath', 'urine'], description: 'blood: finger-prick meter (β-hydroxybutyrate, mmol/L); breath: acetone device (ppm); urine: strip (mmol/L as its colour chart reads).' },
      value: { type: 'number', description: 'The value in that method\'s unit, as the user read it, e.g. 1.2.' },
      time: { type: 'string', description: 'When it was measured, local "YYYY-MM-DD HH:MM"; empty for now.' },
      replaces: { type: 'string', description: 'Id of the open ketone card this corrects (e.g. "K1"); empty for a new measurement.' },
    },
    required: ['type', 'value', 'time', 'replaces'],
    additionalProperties: false,
  },
};

function proposeShopping(recipes: boolean): BetaTool {
  return {
    name: 'propose_shopping',
    description: `Show the user things to put on their shopping list, as a card for the user to check and confirm; nothing is added until they do. The app keeps the same thing on one line and adds amounts up.${recipes ? " A recipe's ingredients come from the app (recipes)." : ''} After a correction, call it again with the complete list and replaces set to the card id.`,
    // Not strict: see STRICT_NESTED. The app validates the input itself and sends errors back.
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'What to buy, as the user would write it on a list, e.g. "Milk".' },
              amount: { type: 'string', description: 'How much, only if the user said, e.g. "2 l", "10", "500 g"; empty otherwise.' },
            },
            required: ['name'],
          },
        },
        ...(recipes
          ? {
              recipes: {
                type: 'array',
                description: 'Recipes from the book whose ingredients go on the list.',
                items: {
                  type: 'object',
                  properties: {
                    recipe_id: { type: 'string', description: 'The recipe_id from list_recipes.' },
                    portions: { type: 'number', description: 'Portions the user plans to cook; 0 for the recipe\'s own.' },
                  },
                  required: ['recipe_id'],
                },
              },
            }
          : {}),
        replaces: { type: 'string', description: 'Id of the open shopping card this corrects (e.g. "L1"); empty for a new one.' },
      },
      required: ['items'],
    },
  };
}

function proposeHome(codeHelp: string): BetaTool {
  return {
    name: 'propose_home',
    description: 'Show the user things bought, running low or used up for their At home list, as a card for the user to check and confirm; nothing is saved until they do. The app adds amounts bought to what is at home and puts things running low on the shopping list. After a correction, call it again with the complete list and replaces set to the card id.',
    // Not strict: see STRICT_NESTED. The app validates the input itself and sends errors back.
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'What it is, as the user would say it, e.g. "Lasagne".' },
              code: { type: 'string', description: `For something eaten or cooked with: ${codeHelp} Empty for spices and non-food.` },
              amount: { type: 'string', description: 'Only if said or shown: a count as a plain number ("2") or a weight ("500 g"); empty otherwise.' },
              place: { type: 'string', enum: ['', 'fridge', 'freezer', 'cupboard', 'spices'], description: 'Only if the user said; empty lets the app choose.' },
              status: { type: 'string', enum: ['bought', 'low', 'used_up'] },
            },
            required: ['name', 'status'],
          },
        },
        replaces: { type: 'string', description: 'Id of the open At home card this corrects (e.g. "H1"); empty for a new one.' },
      },
      required: ['items'],
    },
  };
}

const SEARCH_FOODS: BetaTool = {
  name: 'search_foods',
  description:
    'Search the bundled BLS 4.0 food database. Each query returns up to 8 foods as "code | English name | German name | group | energy and macros per 100 g". Use short generic words; English and German both work.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      queries: { type: 'array', items: { type: 'string' }, description: 'Up to 6 search terms, e.g. ["hazelnut praline", "Nougat"].' },
    },
    required: ['queries'],
    additionalProperties: false,
  },
};

