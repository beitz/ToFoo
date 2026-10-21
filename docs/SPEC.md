# ToFoo — Project Specification

Oct 14, 2026 · @Tobias Beitz

## Overview and goals

ToFoo is a personal nutrition app that tracks every nutrient the data allows (macronutrients, vitamins, minerals, essential amino acids, essential fatty acids) and estimates how full the body's stores are, so the user can plan the next batch-cooked dish to fill the gaps. It is built for one user first: someone who cooks one batch, freezes portions, usually eats one meal a day (OMAD) but not always, and wants to understand what the food actually does. Alongside food it can keep a journal, sleep and activity (optional), so the assistant can look for patterns between how the user feels and what they ate, slept and did.

What makes it different from existing trackers:

- **Body stores, not just daily intake.** Long-storage nutrients are modelled as tanks that fill and drain; short-storage nutrients as rolling averages.
- **Absorption is modelled.** Per-meal saturation, food combinations (e.g. iron), and fat in the meal all affect what actually counts.
- **Built around batch cooking.** Recipes, portions, storage (fresh, fridge, freezer) and freezer stock are first-class, so logging a meal is one tap.
- **Honest about uncertainty.** Every value carries a confidence level, and estimates show as ranges, not false precision.

Guiding principles:

1. **Simple on the surface, deep underneath.** Everything needed day to day fits on one screen; detail is one tap away.
2. **Every number has a source.** Food data from BLS/USDA; every physiological parameter cited in one parameter file, never invented in code.
3. **Approximation over nothing, but labelled as such.**
4. **Features are modular and switchable.** Forecasts, notifications and other extras can be turned on and off.
5. **Foundation first, then iterate.** v1 is small, but the data model already supports later versions.
6. **Transparent on request.** Anyone who wants to can see how each number is calculated, where its data comes from and what the research says, one tap away and never in the way (see "How it works: transparency and sources").

Out of scope: pregnancy, medical conditions, medication interactions, and any form of medical advice.

## Platform and tech stack

ToFoo is an installable progressive web app (PWA), hosted on GitHub Pages from the repo `beitz/ToFoo`, used primarily on an Android phone in Chrome. No server, no accounts, no tracking.

| Area | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) | Type safety for the nutrient model |
| Build | Vite | Fast, simple, static output for Pages |
| UI | React (decided 2026-10-15) | Mature ecosystem for charts and PWA |
| Local storage | IndexedDB (e.g. via Dexie) | Reliable on-device storage for logs |
| Offline / install | Service worker + web manifest (e.g. vite-plugin-pwa) | Works offline in the kitchen, home-screen icon |
| Tests | Vitest | The model math must be unit-tested |
| Deploy | GitHub Actions → GitHub Pages | Push to main = new version live |
| UI language | English (translation layer ready for German and others) | Food names: English first, German second (BLS 4.0 has both) |

Design targets: mobile-first (phone width), touch-friendly, light and dark mode. A desktop layout and multi-device sync are explicitly later (v4); the architecture should not block them, e.g. keep storage behind a repository layer so a sync backend can be added later.

## Data sources and pipeline

The BLS 4.0 is the primary food database, bundled with the app; Open Food Facts covers packaged products by barcode; USDA FoodData Central is searched online by name for foods the BLS lacks; manual entry covers everything else.

| Source | Role | Access | Version |
| --- | --- | --- | --- |
| BLS 4.0 (Max Rubner-Institut) | Primary: \~7,140 foods incl. composite dishes, 138 nutrients | Bundled in the app, offline | v1 |
| Manual entry | Special products, label values, supplements | User input | v1 |
| USDA FoodData Central | Foods missing in BLS: generic foods with full nutrient data, US packaged products with label values | Opt-in online search by name (sends only the search words), shared demo key or a free own key; fetched foods saved locally and in backups | Built 2026-10-17 |
| Open Food Facts | Packaged products by barcode: label values, the rest borrowed from the nearest BLS food | Opt-in online lookup (sends only the barcode); fetched products saved locally and in backups | Built 2026-10-16 (barcode only) |

**BLS pipeline** (a build-time script, not runtime):

1. Raw zip `BLS_4_0_2025_DE.zip` lives in `data/raw/`. Claude Code first inspects its actual format and documents it in `data/README.md`.
2. A script converts it to compact JSON (e.g. `public/data/bls-4.0.json`): food code, German name, food group, and the nutrients the app uses, with units.
3. Missing values stay explicitly missing (`null`), never zero. The UI shows when a food lacks data for a nutrient.
4. The output records its BLS version. Every recipe ingredient stores `source + version + code`, so a future BLS update can be migrated with a mapping instead of silently changing old recipes.

**Open Food Facts** (decided 2026-10-16). An opt-in feature ("Open Food Facts lookup", off by default). On the log screen a barcode button opens the camera (the browser's barcode reader, Chrome on Android) or takes a typed number; the product is looked up on this phone first, then at Open Food Facts. A product is a food made of two parts: the label values (energy, macros, salt, and any vitamins or minerals on the label) and, for everything else, the values of the most similar BLS food, which the user picks once per product (suggested from the product's categories) or the assistant proposes. Label values always win. In the model, label values carry the BLS provenance "label" and borrowed ones "taken over from a similar food", so their uncertainty follows the BLS rules; without a chosen BLS food the rest stays missing. Logged products are stored on the phone (and in backups) as fetched, so history stays the same when Open Food Facts edits a product, and they are found by name in the normal search afterwards without a request. Name search at Open Food Facts is not possible from a browser app today (see docs/OPEN_QUESTIONS.md), so on the log screen a product is first found by its barcode; the AI assistant can find it by name through web search (below). Open Food Facts allows 15 product reads per minute per IP address and may block addresses that go over, so the app spaces lookups beyond that out instead of sending them (only a large photo batch gets near it), and a product already looked up in an assistant chat is not fetched again. When a lookup fails, the app shows the exact cause (HTTP status, address and the server's own message), the assistant is told to pass it on word for word, and it is kept in the diagnostics log. Data licence: ODbL, credited on the About page.

**USDA FoodData Central** (decided 2026-10-17). An opt-in feature ("USDA FoodData Central", off by default, Settings → USDA FoodData Central). On the log screen, a search with words typed offers "Search USDA for …" below the BLS results; it runs only on that tap, since each search is an online request that sends only the search words. The API works from the browser (CORS open) and needs an api.data.gov key: the shared demo key works for a few dozen searches a day, and the user can store a free own key on the phone (not in backups). Results come in two kinds, treated differently:
- *Generic foods* (Foundation, SR Legacy, Survey (FNDDS)): analysed or recipe-calculated values for most vitamins and minerals, used as they are, with the BLS provenance "taken from another database" (D), as BLS marks its own USDA-derived values. A similar BLS food can be chosen to fill the gaps (often iodine; niacin equivalents), optional; USDA values always win.
- *Branded foods* (US packaged products): label values only, which work like Open Food Facts products: label values win, the rest comes from the similar BLS food.
USDA nutrient numbers are mapped to BLS ids and units in `src/foods/usda.ts` (choices in docs/OPEN_QUESTIONS.md). Logged USDA foods are stored like products (`USDA:<fdcId>`) and found by name in the normal search afterwards without a request. Data: public domain (CC0), credited on the About page.

**Licence and attribution.** BLS is CC BY 4.0. The app has an About / Data sources page and the README has a line, both containing: Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 — Deutsche Nährstoffdatenbank. Karlsruhe. DOI: [10.25826/Data20251217-134202-0](https://doi.org/10.25826/Data20251217-134202-0), a link to [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and a note that the data was converted and abridged.

## User profile and reference values

Daily needs come from the DGE (D-A-CH) reference values, looked up by age group and sex and adjusted by body weight and activity where the science supports it. No field is required: the app works immediately with sensible defaults, and asks for details gently over time.

Profile inputs, grouped (all optional, all editable in settings):

| Group | Input | Default if not given | Used for |
| --- | --- | --- | --- |
| Body | Birth year (age computed automatically) | Adult age group (25–51) | DGE age group |
| Body | Sex | Not set: the safer value per nutrient (higher need, lower upper limit) | DGE reference values |
| Body | Body weight (kg), with history | 70 kg | Protein need, store capacity |
| Body | Height | Not used until set | Not used yet (the DGE energy equation does not need it) |
| Body | Activity level (low / medium / high) | Medium | Energy, a few B vitamins |
| Body | Own energy target (kcal/day) | Not set: estimated (below) | Energy gauge and amounts given as a share of energy |
| Body | Periods (women): yes / after menopause / no, other reason | By age: periods under 51 | Iron reference value (DGE 2024) |
| Sun and vitamin D | Location latitude | 51° N (central Germany) | Sun strength by season |
| Sun and vitamin D | Outdoor routine | Little time outdoors | Vitamin D synthesis |
| Sun and vitamin D | Usually exposed skin | Face and hands | Vitamin D synthesis |
| Kitchen defaults | Salt: iodised yes/no, fluoridated yes/no | Iodised, not fluoridated | Default for salt in all recipes, overridable per recipe |
| Food preferences | Excluded foods or food groups (allergies, dislikes, diets such as vegetarian) | None | Filtering suggestions only |

**Low-friction onboarding**: first launch asks at most one optional screen (starting levels) and goes straight to the dashboard. Afterwards the app asks one question at a time when it would improve accuracy ("Add your weight for more accurate tanks"). Values based on defaults are marked, so the user sees which inputs would sharpen the picture. Exclusions only filter suggestions; the app makes no allergy-safety claims.

Rules for reference values:

- Stored in one data file (`model/reference-values.*`) with the DGE source cited per nutrient and the date they were taken.
- Three values per nutrient where available: recommended intake, the physiological (absorbed) requirement used for tank depletion, and the tolerable upper intake level (EFSA UL where DGE gives none).
- If DGE gives only an estimate ("Schätzwert"), store it with a lower confidence flag.
- Pregnancy, lactation and medical conditions are out of scope.

**Energy target** (decided 2026-10-17). The DGE energy guide values are the table for normal-weight people at the DGE reference body weights (men 25–50 at medium activity: 2,700 kcal). DGE derives them as resting energy expenditure × physical activity level (PAL), with the resting-energy equation of Müller et al. (2004) from weight, sex and age; DGE says individual values need adjusting and that body weight is the deciding check. So once birth year and weight are set, the app uses that same method with the person's own age and weight (PAL 1.4 / 1.6 / 1.8 for low / medium / high activity), shown to the nearest 10 kcal; before that it uses the table. The user can also set an own target in kcal (for example from a dietitian, or a planned surplus or deficit); it is marked as user-set and replaces the estimate everywhere, including the amounts DGE gives as a share of energy (saturated fat, linoleic and alpha-linolenic acid). Activity from the activity log is not added yet. The energy gauge keeps the guardrails: no rewards for eating less.

## Nutrient model

Each meal's nutrients pass through cooking/storage losses and absorption, and land in a tank (long-storage nutrients) or a rolling average (short-storage nutrients), which is compared with the user's absorbed daily requirement.

### Two kinds of nutrient

- **Tank nutrients** (B12, vitamin A, vitamin D, iron, folate, iodine). A full store covers the need for, at 70 kg with nothing eaten: B12 about 3.4 years (2.7–4.1), iron about 2.9 years for men (1.4–4.3) and 7 months for women (2.5 months–1 year), vitamin A about 1 year (2.5 months–3 years, wide because liver stores vary a lot), folate about 5 months (2.5–6), iodine about 3.5 months (2.5–5), vitamin D about 2 months (1–4). The nutrient page shows this for the user's own weight and sex (sourced capacity range ÷ absorbed need). For B12 and vitamin A the body loses a share of the store per day (IOM), so a real store runs down more slowly as it shrinks. Each is a level in absorbed units, filled by meals, drained by the daily absorbed requirement, capped by a capacity scaled by body weight.
- **Rolling-average nutrients** (stored for days or not at all, e.g. vitamin C, most B vitamins, potassium, magnesium, macronutrients, fibre, essential amino acids, essential fatty acids): average absorbed intake over a configurable window (default 7 and 14 days) against the requirement.
- **Lines for averages, tank cards for stores** (decided 2026-10-20 with Tobias, after two same-day steps: the fill level on Home, then averages on Home with a separate Stores screen): a 14-day average reads as "deep red" for iron after a poor fortnight even though a full store lasts months, so the six store nutrients (iron, B12, vitamin A, folate, iodine, vitamin D) are not lines on Home. They are a **Stores** block of small cards, 3 per row at phone width: name, a tank that fills from the bottom (uncertainty as a shaded band), "% full", arrows for the net flow (↑ filling, ↓ draining, → holding, or "empty" when the store is empty and intake is below need; more arrows when its fill status changes sooner) and "lasts …" (how long the store would cover the need with nothing eaten, from the middle of the sourced capacity range). Colour and status icon follow the fill level only. A **⚠** marks a store that is low or getting low and not filling; a low store that is filling (an empty start on a diet that covers the need) gets none, so an Empty start doesn't warn for years. An ⓘ next to "Stores" explains the cards. Every **line** on Home is the share of the daily need absorbed on average over the nutrient's window (7 or 14 days), so lines and cards never share a meaning. Today counts once it is over, so a half-logged day doesn't pull averages down; the store level is also as of the last finished day. The 14-day average of a store nutrient (absorbed, at moderate stores for iron, plus sun for vitamin D) is on its nutrient page, first, above a Store card (fill level, filling or draining in amounts, how long a full store lasts, for slow stores that the level mostly reflects the starting choice until a blood test, for iron what the same food gives at normal stores, the fill history); it also drives the filling / draining arrows. Only these six are stores: every other nutrient is kept for days or not at all, so its average is the whole picture, and a new store needs a sourced capacity first. Stores holding more than ~100 days of need (iron, B12, vitamin A, folate, iodine) are "slow": their level mostly reflects the starting level until a blood test. **Blood tests** (decided 2026-10-17): the user can enter a lab value on the nutrient screen; the latest one sets the store on its day, after which the store follows the log from a real value instead of the starting level. Only markers with a sourced conversion to a store amount are offered: so far ferritin for iron (8 mg storage iron per µg/L). Lab results are part of the profile and of backups. A food log cannot see a store's real level, so when a slow store's balance has been in the low zone for six weeks in a row (with something logged in each window), Home and the nutrient screen suggest checking it: a ferritin, vitamin B12 or folate blood test where one exists, otherwise a doctor.
- Which nutrient is which, its capacity and its window live in the parameter file, each with a cited source. Claude Code researches these; it never invents them.

**Scope: everything the data allows.** The model covers every nutrient the BLS provides with usable data: energy and macronutrients (protein, fat, carbohydrates, sugar, fibre), vitamins, minerals and trace elements, the essential amino acids, and essential fatty acids (omega-3 and omega-6). Which ones appear on the dashboard is a display choice (see settings), not a model limit.

**Protein quality.** Total protein is not enough: the body cannot make the nine essential amino acids, and many plant foods are low in one or two of them (e.g. lysine in grains, methionine in legumes). Each essential amino acid is therefore a rolling-average nutrient of its own. The body pools amino acids over the day, so foods complement each other across a day's eating, not only within one meal. The detail view for protein shows the weakest essential amino acid (the "limiting" one).

### Units: everything in absorbed amounts

Official intake recommendations already assume typical absorption. To avoid counting losses twice, the model runs in absorbed units: intake × absorption goes in, the physiological requirement comes out. Where DGE gives no physiological requirement, derive it as recommended intake × the typical absorption fraction from the parameter file, and flag it.

### Absorption rules (per meal)

A meal is all entries within a configurable window (default 2 hours), so OMAD counts as one absorption event per day, and any other pattern (several meals, snacks, random logging) works the same way. Rule types, chosen per nutrient in the parameter file:

1. **Fixed fraction**: absorbed = intake × f.
2. **Saturable per meal**: a capped active route plus a small passive fraction (B12 is the key case).
3. **Dose-dependent**: fraction falls as the dose rises (vitamin C, calcium).
4. **Iron, with modifiers**: heme vs non-heme split (estimated from food group if BLS has no split); non-heme absorption raised by vitamin C and meat/fish in the meal, lowered by calcium, tea/coffee and phytate-rich foods (phytate estimated from food group). Tea and coffee count by timing: full effect from 30 minutes before to the start of the meal, tea halved 1 hour after, none from 2 hours after (coffee still full at 1 hour). Non-heme absorption also rises when the iron tank is low (by serum ferritin, Dainty 2014), so stores refill faster from low levels.
5. **Fat-soluble vitamins (A, D, E, K, carotenoids)**: absorption reduced when the meal's fat is below a threshold. The app also shows meal fat, so low-oil cooking becomes visible.

### Cooking and storage losses

Retention factors per nutrient and preparation (raw, boiled, baked, fried, fridge storage, frozen + reheated) reduce intake before absorption. Prefer BLS cooked entries where they exist; otherwise apply published retention factors (e.g. USDA retention tables). Applied per portion according to how it was stored (see recipes).

### Upper limits

Each tank has a "too full" zone, and rolling intake is checked against the UL. Over-UL is shown as clearly as "low", because filling up can overshoot (vitamin A, D, iron, zinc, iodine).

### Vitamin D from sunlight

A simple synthesis estimate added to the vitamin D tank, from latitude, date (season), time spent outdoors, time of day and exposed skin (face/hands, arms, more). Input in v1 is a manual outdoor routine (e.g. "workdays: 2 × 25 min walk, early morning and afternoon") plus optional one-off entries ("2 h outside today"). In autumn and winter at German latitudes the estimate should be near zero, and the wiki explains why. Importing location history (e.g. a Google Maps Timeline export) is a later option.

### Starting levels

The user chooses at setup (changeable later, with a one-line pro/con each):

- **Empty**: safest for someone who suspects poor intake. Slow stores (iron, B12, vitamin A, folate, iodine) then read low on their Home cards for months to years, until they fill or a blood test is entered (see "Two kinds of nutrient"); the lines are unaffected, since they show averages. For a tank, the nutrient screen says whether a store is filling or going down at the recent rate and, when it is low but filling, roughly how long until it leaves the low zone, and that the low reading comes from the empty start. A store with anything in it never reads "0 % full" (it shows "<1 %").
- **Average**: realistic for a typical diet; may be too optimistic.
- **Custom per nutrient**: for users with an idea of their status.
- **From blood test** (v3): most accurate, recalibrates tanks to measured values.

### Uncertainty

Every calculation runs three times: low, central and high parameter sets (absorption, retention, data confidence). The UI shows the central value with a range. The range widens with estimated food entries and, when "Fill in unlogged days" is on, with "not logged" days.

### Forecast (optional feature)

From recent average intake, estimate when each tank crosses into "low" or "too full". Switchable in settings.

## Recipes, batches and freezer stock

A recipe is entered once; each time it is cooked becomes a batch with a storage plan, and eating a portion is one tap that also updates freezer stock.

**Recipe**: name, ingredients (`source + version + code`, grams, preparation method), number of portions, optional preparation steps (free text, one step per line), notes and tags. Ingredient search is fast and fuzzy over the English and German BLS names (English weighted higher), with recently used ingredients first. Salt uses the profile default (iodised or not) unless overridden. Grams accept decimals, since the user weighs precisely.

**Adding ingredients** (built 2026-10-18, owner's ask: the same sources as logging a meal): the ingredient search finds BLS foods, products saved on the phone (Open Food Facts, USDA) and, with those features on, USDA foods on a tap and packaged products by barcode scan. A product opens a small sheet with its label values, the grams in the recipe and the BLS food that supplies its missing vitamins and minerals, as on the log screen; the ingredient then refers to the product (`OFF` or `USDA` + code), never to copied values. With the AI assistant on, "Photo or describe the recipe" opens the assistant inside the editor (see AI assistant logging): it proposes ingredients with grams for the whole pot, and the user checks them on a card before they are added. Saved items and manual entries are not ingredients, since they are servings with fixed nutrients rather than a food in grams.

**Changing an ingredient** (built 2026-10-18, owner's ask): tapping an ingredient, in the editor or on the assistant's card before it is added, opens the same sheet: change the food (BLS, saved products, USDA, barcode scan, as "Change food" on a logged entry; a product starts with the old food as the source of its missing micronutrients), the grams and the preparation, or delete it. Nutrient values themselves are never edited: they come from the chosen food, so a better value means choosing a better source (e.g. the scanned product instead of an assumed generic food). Each ingredient carries a small label naming its source, so guesses stand out: "BLS · generic" (an average German food, also what the assistant picks when no exact product is known), "Barcode · Open Food Facts" (a packaged product), "USDA · generic" or "USDA · product". The phone's back gesture closes the open sheet (any sheet in the app, and the photo viewer) rather than leaving the page.

**Batch**: one cooking of a recipe, with date and a storage plan. The default plan is remembered per recipe and per user, matching the usual workflow:

| Portion | Storage | Default |
| --- | --- | --- |
| 1 | Eaten fresh on cooking day | Yes |
| 1 | Fridge, eaten next day | Yes |
| Rest | Freezer, reheated later | Yes |

This split is the global default, but any split is possible: each recipe can store its own default plan (e.g. "all in the fridge, keeps a week", or "cook fresh each day" with no stored portions), and each batch can still be adjusted when it is cooked (e.g. 2 in the fridge). Each storage type maps to retention factors in the nutrient model.

**Cooked weight per batch** (decided 2026-10-16): the usual workflow is one large pot divided into portions, and every pot comes out slightly different. So each batch can record the weight of the cooked food (pot weighed full minus the empty pot's weight, which the app remembers), and portions can then be logged by grams ("350 g of the curry") as well as by portion. A batch without a cooked weight works as today, by portion.

Built 2026-10-18: "Weigh the pot (optional)" when cooking a batch, and later under Recipes → In stock → "Weigh the pot" / "This pot" or a batch on the recipe page: "Pot with food" minus "Empty pot" gives the cooked food and the grams per portion. The empty pot's weight is remembered per recipe and as the general default (a recipe usually goes in the same pot). With a weighed pot, logging from stock offers Portions or Grams; by grams it starts at the pot's average portion and also says how many portions it takes from stock (the nearest whole number, at least one; editable, 0 for a taste straight from the pot). Nutrients follow the grams: 350 g of a 2,100 g pot is 1/6 of every ingredient. Changing a batch's weight later changes the servings already logged from it by grams. On the log screen a stock chip now opens this sheet (amount, storage, "Change ingredients", time) and adds the serving to "This meal"; the chips on Home still log one portion with one tap.

**Changing a dish when logging it** (decided 2026-10-16): a logged portion of a recipe can differ from the recipe, e.g. this time 150 g tofu instead of 200 g beef. When logging, "Change ingredients" lets the user swap, remove, add or re-weigh ingredients for that entry only; the recipe and the batch stay as they are. The entry stores the changes, so the history stays recomputable. Changes can also apply to a whole batch when it is cooked ("this pot had tofu").

Built 2026-10-18: "Change ingredients" when logging from stock and when editing a logged portion in the diary shows the serving's ingredients in the amounts eaten (the pot's grams × the share eaten); each can be swapped for another food (BLS, saved products, USDA, barcode, as in the recipe editor), re-weighed, given another preparation, taken out (and put back) or added to, with "new", "was 200 g" and "Taken out" marks against the pot. The entry stores its own complete ingredient list in grams for the whole pot, so it scales when the amount is changed later and stays recomputable even if the pot is changed afterwards. For a whole pot, "Change ingredients for this pot" when cooking, or "What went into this pot" on a cooked batch, changes the batch's copy of the recipe and keeps the recipe's own list beside it to show what differed; this counts for every portion of that pot, including ones already eaten. The recipe itself never changes.

The assistant can do both (with the recipe book in the main chat): `list_recipes` also lists each recipe's batches in stock (batch_id, cooked day, portions left where, the cooked weight and a pot's own ingredients) and the remembered empty pot. `propose_portion` makes a P card (a serving from stock by portions or by grams of a weighed pot, with changes for that serving in the amounts eaten), checked against the stock left; `propose_batch` makes a B card (a recipe cooked again: day, storage plan or the usual one, the full pot or the food's own weight, changes for this pot, and what was eaten of it right away, logged with the batch). Both cards use the same fields as the screens above, and the app computes every number from the pot.

**Swap preview in the recipe editor** (decided 2026-10-16): while editing a recipe, show how a change moves the user's gaps, e.g. "adding 100 g spinach: iron gap 40 % → 65 % covered". This is the recipe preview (below) made live inside the editor, where the decision happens.

Built 2026-10-19: every edit in the recipe editor (adding, taking out, re-weighing or swapping an ingredient, another preparation, the portions, the salt, the assistant's additions) shows what it does to one portion, eaten fresh after cooking losses, before the recipe is saved. A line under the ingredient being changed names the biggest moves ("Per portion: Iron 40 % → 65 % ↑ · Folate 28 % → 41 % ↑"); a card under the ingredient list says the change in words ("Adding 100 g Spinach", "400 g Beef → 300 g Tofu", "Portions: 4 → 6"), the energy before → after, and the nutrients that move with the user's status now (Low, Getting low, Too high as a badge), six at first, "Show all" for every nutrient that moves by a whole percent. For a saved recipe the card can also compare with the saved recipe ("Saved recipe"), for all changes together. The ingredient sheet shows the same line while a food is being swapped or re-weighed, before "Save". Further edits of the same ingredient count as one change, so typing 1, 0, 0 reads as 0 → 100 g. Percentages are shares of the daily reference intake (of the limit for limit-only nutrients), as on the recipe page, never absorbed amounts. Order: gaps' moves count double, getting low and too high one and a half; for a nutrient to get enough of, what a portion gives beyond a whole day does not count (187 % → 110 % is no loss worth listing first). These weights only order the list. The app computes every number from the database values (`src/logic/swapPreview.ts`).

**Shopping list** (owner's request 2026-10-19: simple, usable offline in the shop). Built 2026-10-19, route `#/shopping`, optional feature (on by default):

- Everything is on the phone (IndexedDB, `shopping` table, database v9), so the list works without a connection; it is in backups.
- Add by typing one line ("milk 2 l", "500 g oats", "6 eggs"): an amount in g or kg becomes grams, any other amount stays as typed. While typing, things bought before come first ("Bought before"), then up to three foods from the BLS.
- "Add a recipe's ingredients" (on the list, and "Add to shopping list" on every recipe): choose the recipe and the portions to cook; amounts scale with the portions; everything is ticked except salt (most kitchens have it); tap water is left out. Each line says which recipes it is for.
- The same thing stays one line: the same food, or the same name when typed, adds up the grams, joins typed amounts ("2 l" + "1 l" = "3 l", otherwise "2 l + 1 pack") and the recipe names. Something already in the basket gets a new line.
- Sorted by shop section (fruit and vegetables, bread, dairy and eggs, meat and fish, grains/pasta/pulses/nuts, oils/spices/sweets, drinks, ready meals, other). A food from the database or a recipe goes by its BLS main group (eggs apart from pasta, butter and margarine with dairy; a product by its paired BLS food). A typed name goes by a short list of common shopping words in English and German, else by the BLS foods that name every typed word (composite dishes ignored), else "Other". The section can be changed per line, and a name bought before keeps its section.
- Tap a line to put it in the basket (ticked, struck through, moved to "In the basket"); tap again to take it back. "Clear" takes the basket off the list (undo). Cleared lines are kept as the list's memory for suggestions, one per name, at most 300.
- The pen on a line changes its name, amount and section, or removes it (undo).
- The share button sends what is still to buy as plain text (Android share sheet, else copied).
- The screen stays on while the list is open (Screen Wake Lock, where the browser allows it).
- The assistant (with the list on): "put milk and eggs on the list", "add the lentil curry for 6" makes an L card with the things named and the recipe's ingredients scaled, each tickable, added to the list on confirm ("Log all" included). Names as the user says them; the app sorts them. Not strict (see the grammar-size limit).
- A quick action on Home shows how many things are still to buy; a cart button on the Recipes page opens the list.

**At home** (owner's request 2026-10-21: log what was bought, mostly ready meals but also ingredients and spices, so it is quick to log when eaten, with an overview of what is at home and what runs out, for shopping). Built 2026-10-21, route `#/athome`, optional feature (on by default); this is option (c) of the earlier "At home" idea: favourites stay the quick list on the log screen, this is the full picture.

- What is stored is only what the user said: each thing with a name, optionally the food it is (BLS, a product or a saved item), where it is kept (fridge, freezer, cupboard, spices and herbs), how much there was when it was bought or counted (pieces, grams, another amount as typed such as "1 l", or none: "have it"), and whether the user marked it running low or used up (`pantry` table, database v10 with a backup before the upgrade; `data.pantry` in backups).
- What is left is worked out, not stored: from the time the amount was set, every log entry of that food takes one piece off (a saved item: its servings) or its grams, and every pot cooked with it takes one piece or the grams that went in. Editing or deleting a meal moves the amount back. Things counted in pieces are meant for packs eaten whole (ready meals, yogurts, cans); loose foods are better counted in grams. A thing whose count reaches zero is used up.
- Add by typing ("lasagne 2", "500 g oats", "2 cans tomatoes", "cumin"; a plain number or packs, cans and jars are pieces), by picking a suggestion (things at home, saved products, BLS foods, which links the food), or by scanning a barcode (Open Food Facts on). The same thing adds to what is left. Where it is kept is guessed: "frozen" in the name, a spice as the last word, then the BLS group (spices R, dairy, meat, fish, vegetables and dishes in the fridge, the rest in the cupboard).
- The screen lists cooked batches in stock first, then things by place, with "2 left", "350 g" or the typed amount, "Running low" and "Used up" in words; used-up things sit at the bottom until bought again or removed. Tapping one changes its status, amount (counted again from now), place, food and name.
- Running low or used up, marked by the user (or told to the assistant), puts it on the shopping list in the same step, with one undo. Things eaten up and not on the list show on the shopping list page under "Low or used up at home", one tap or "Add all" each.
- After shopping, "Put away" next to the basket (or on At home) puts the basket into At home in one go: food is ticked, other things (toilet paper) start unticked, a place can be changed per line; the basket is cleared either way.
- The log screen's In stock section becomes "At home": cooked batches, then the foods at home that are not used up and not spices, one tap to log. A product's amount sheet offers "Whole pack" when the label gives the pack size.
- The assistant proposes At home cards (H1, H2, …, not strict) for things bought ("bought two lasagne and cumin", a photo of the shopping), running low or used up, with the food's code when it will be eaten; search_foods marks foods at home with "[at home]" so a meal uses the exact product the user has.
- Not built: shelf life ("eat soon"), ideas from what is at home, amounts in litres counted down.

**Later, for other workflows** (feature review 2026-10-16, not needed by the owner now): duplicate a recipe to make a variant; scale a recipe when cooking a batch (e.g. 8 portions instead of 6, without editing the recipe). Scaling last.

**Freezer stock**: the app tracks remaining portions per batch, with cook date. Logging a portion from the dashboard ("Linsencurry · 3 left") removes it and applies the right storage losses. Manual corrections are allowed (portion thrown away, given away).

**Recipe preview** (v2): before cooking, show how eating this batch for a week would move each tank.

**Freezer overview** (v3): a view of everything in the freezer and fridge, with age per batch. Each recipe can store how long it keeps per storage type (fridge, freezer), also carried in the QR code, so the overview can flag portions to eat soon. A simple "eat soon" flag on stock chips for old fridge portions can come before the full overview. Shelf-life times are food-safety values and need a source like the physiological numbers (open question: which source).

## Logging and confidence

Every log entry carries a confidence level, and every day has an explicit status, so the model knows the difference between "ate nothing" and "forgot to log".

**Ways to log**, fastest first:

1. Tap a freezer-stock portion on the dashboard.
2. Pick a single BLS food or composite dish (e.g. a salami pizza) and an amount; portion helpers ("1 pizza", "1 plate") with editable gram defaults.
3. Manual entry: free name plus whatever nutrients are known (from a label, a supplement).
4. Tell the AI assistant what you ate, by photo, text or both (optional, see below).
5. Paste an entry in the ToFoo exchange format (e.g. produced by the Claude helper, see below).
6. Scan a packaged product's barcode (Open Food Facts, optional). Later: label photo (v3).

**Time of entry**: a new entry assumes the meal was just finished, so the timestamp defaults to now. Date and time stay one tap away for logging after the fact. Any eating pattern is supported; OMAD is the optimised path, not a requirement.

**Editing an entry** (built 2026-10-17): tap an entry in the diary (or in "This meal" while logging, or "Edit in diary" on a logged assistant card) to change its amount, preparation, confidence and time, or delete it with undo. A food, a saved item or a manual entry can also be replaced by another food: "Change food" searches the BLS and saved products, USDA on a tap, or scans a barcode, for example when a meal logged as a generic dish turns out to be a known packaged product. The entry keeps its id, time and confidence; the amount carries over (servings × serving weight for a saved item; a manual entry asks for grams). A packaged product picked this way starts with the old entry's BLS food as the source of its missing vitamins and minerals, unless the product already has one; the user can change it as on the log screen. One undo restores the old entry. Recipe portions and drinks keep their own fields (portions and storage; tea or coffee) and are not replaced.

**Confidence levels**:

| Level | Meaning | Example |
| --- | --- | --- |
| A · Measured | Database values, weighed amounts | Own recipe from BLS, grams weighed |
| B · Standard | Database values, estimated amount or generic dish | BLS salami pizza at work |
| C · Estimate | Approximation from description, photo or guess | Claude helper estimate, restaurant meal |

Confidence is shown as a small marker on entries and widens the uncertainty range in the model.

**Day status**: logged (complete), partly logged, fasted (nothing eaten), or not logged. Fasting is one tap: "Fasting since…" marks today and every following day as fasted until the next logged meal ends the fast, so multi-day water fasts need no daily input. During a fast the tanks drain as modelled. By default the log is taken as complete: a past day without entries counts as nothing eaten, so stores drain and averages drop (owner's decision, 2026-10-16: no assumed intake unless asked for). The optional "Fill in unlogged days" toggle (off by default) instead treats them as unknown: they are filled with recent intake (or the requirement when nothing is known yet), do not drain stores to zero, and widen the range. Each day can override that setting in the diary (owner's request, 2026-10-17): **Fill in** treats that one day as filled in from recent intake, as the toggle would; **Leave out** removes the day from every average and review, as if it were not in the diary (for a day nobody remembers). Stores can't skip a day, so on a left-out day they run on filled-in intake, with the wider range; rolling averages, limits and reviews average over the remaining days instead. Filled-in and left-out days never feed later imputation. Rolling gauges with no known day in their window show "–" rather than a number. A past day with at least one entry counts as logged unless marked "partly logged"; drinks and supplements do not end a fast. The dashboard nudges gently when yesterday has no status (switchable).

**Faster repeat logging** (decided 2026-10-16, needed):

- **Repeat a past meal**: "Log again" on a meal in the diary, or a tap under "Recent meals" on the log screen (the last five different meals with two or more items), logs it again now, with all its items, as an editable copy. Items keep their spacing (a tea half an hour after the meal stays half an hour after it, since timing matters for iron), with the last item at the current time. Recipe portions come from the batch's current stock; when that batch has run out, the newest batch of the same recipe with portions left is used; if none has any left, the item is skipped and named in the message. One undo removes the whole copy.
- **Favourite foods**: pin BLS foods, packaged products and saved items used all the time (oats, a certain bread) with "Add to favourites" on the amount sheet, so they stay at the top of the log screen instead of dropping out of "Recent". Stored in the settings (and so in backups).
- **Pinning from any list** (2026-10-18): every food, saved item and saved product row (log screen, search results, "Change food", recipe ingredient search) has a star at its end that pins or unpins it directly. "Change food" lists favourite foods and products first.
- **Favourite meals** (2026-10-18): the star next to a recent meal, or "Save meal as favourite" under "This meal" while logging, pins a whole meal with its amounts and item spacing; one tap logs it again, like a recent meal. Tapping a filled star unpins it (with undo). Stored in the settings (and so in backups); same items in the same amounts count as the same meal.
- **Log screen sections** (2026-10-18): with nothing searched, the log screen shows Favourites (meals, then foods; always shown, with a hint while empty), In stock (cooked and frozen dishes), Recent meals, Recent foods, Drinks and other entries, Saved items, Packaged products. Favourites and In stock come first because they are what is at home. Each heading is a tap target that folds its section; open/closed is remembered per section in the settings.
- **Home-screen shortcuts**: long-press the app icon for "Log meal", "Start fast" and "Write in journal" (web manifest `shortcuts`). "Start fast" starts a fast today, with undo, and opens Home.

**Water** (decided 2026-10-16): drinks can be logged as water amounts with one tap (e.g. +250 ml), and the water in foods counts too (BLS has water content per food). Shown as an amount-only or rolling gauge against a DGE guide value for water.

Built 2026-10-17 (optional module "Water", off by default): plain water (tap, mineral, sparkling, nothing added) is stored apart from the food log (`data.water` in backups), so it never ends a fast or makes a day count as eaten. Every other drink is logged as a food, and its water comes from the BLS like the water in solid food. A water card on Home (today) and in the diary (any day) shows plain water + water in food and other drinks against the DGE guide value for the user's age group: drinks + solid food, 2,360 / 2,270 / 1,970 / 1,990 ml for 19–24 / 25–50 / 51–64 / 65+ (DGE Richtwerte, derived 2000, not split by sex; oxidation water is part of the DGE total but is not logged, so it is left out on both sides). "+ 250 ml" adds a glass now; tapping the card adds another amount; the log screen has a Water button too. The assistant proposes water cards (W1, W2, …) for plain water and puts other drinks in meals. Items without a water value (some products, manual entries, tea and coffee marks without an amount) are counted and shown, and the total then reads "≥". Water taken up in cooking by foods logged raw is not counted (docs/OPEN_QUESTIONS.md). The guide value assumes average energy needs and climate; DGE says more is needed with heat, high energy turnover or illness.

**Journal** (replaces the day notes decided 2026-10-16): free-text entries at any time, see "Journal, sleep and activity".

**Supplements** are loggable items with their own nutrient values (manual entry, confidence A when taken from the label). Drinks such as coffee and tea are logged on their own when drunk (time defaults to now, editable); the model applies them to meals around them by timing.

## AI assistant logging

Logging should feel like telling a friend what you ate, not operating a database: snap a photo or type "a Giotto from the office", answer a question or two, check the result, done. The assistant is optional, off by default, and uses the user's own API key.

**Flow**:

1. On the log screen, "Tell the assistant" opens a chat. The user sends photos (the plate, the packaging, the menu) and/or text, in English or German.
2. The assistant identifies the foods and estimates amounts. When it is unsure in a way that matters (portion size, what is hidden in a sauce, which variant), it asks one short question at a time instead of guessing silently. It does not ask about things that barely change the result.
3. It proposes the meal as a list of items with grams. The app shows a confirm card: each item with name, grams (editable) and a remove button, plus the meal time. Nothing is logged until the user taps "Log".
4. The user can keep chatting instead ("it was two balls, not one") and the assistant revises its proposal.

**Where the numbers come from** (source ladder, most concrete first):

1. BLS food matching the item (e.g. "Milchbrötchen").
2. Branded product databases: Open Food Facts by barcode (when the lookup is on), with micronutrients borrowed from the nearest BLS food.
3. USDA FoodData Central (when on): single foods and ingredients the BLS lacks; generic foods carry their own micronutrients, US products borrow them from the nearest BLS food.
4. Built from ingredients: a dish not in any database (Korean hotpot at a restaurant) becomes several BLS ingredients with estimated grams. The assistant prefers this over a loosely matching USDA dish.
5. Nearest-match guess: the closest BLS food, clearly marked.

**The core rule**: the AI only chooses foods and estimates amounts; it never supplies nutrient values. Every nutrient number still comes from a database (BLS in the first version), so an AI mistake shows up as a wrong portion or a wrong food, which the user sees and can fix on the confirm card, never as an invented vitamin value. This keeps rule "Every number has a source" intact.

**Confidence**: entries from the assistant are logged as C · Estimate by default; the assistant may suggest B when the food is certain and the amount comes from a label or a standard portion. Assumptions the assistant made ("assumed one bowl of broth") are shown on the confirm card.

**Why one model, not several voting**: models share the same blind spots (portion size, hidden fat), so several models tend to agree and be wrong together; a fourth model to break ties has no ground truth either. Restricting the AI to database foods, asking when unsure, and a quick human check catch more errors for a quarter of the cost.

**Technical shape**:

- The app talks to the Claude API directly from the browser with the user's own key (static app, no server). The key is stored only on the device (IndexedDB), never in backups or the repo.
- The model works through tools the app provides: `search_foods` (searches the bundled BLS locally and returns codes, names and macros per 100 g; with the Open Food Facts lookup on, also products saved on the phone), `lookup_barcode` (only with the lookup on: Open Food Facts by barcode, returning label values), `search_usda` (only with USDA on: up to 3 English queries per call, generic foods or US products), `web_search` (only with the lookup and "Find products by name" on; see below), and `propose_meal` (one meal: food or product codes, grams, preparation, assumptions, the time it was eaten, and which open card it replaces; for a product also the most similar BLS food, unless the user already chose one, which wins; optional for USDA generic foods). Several calls in one answer show several cards; if any of them is invalid, none is shown and the assistant is asked to fix and resend all. The app reads barcodes in the user's photos on the phone and passes the numbers to the model as text. Questions to the user are plain chat messages. The app checks every proposed code exists in BLS and every amount is plausible before showing the card; otherwise it sends the error back to the model.
- **Packaged products from a front-of-pack photo** (decided 2026-10-17): with the Open Food Facts lookup on, the assistant also gets Anthropic's web search tool (a server tool: Anthropic runs the search, so the app makes no extra request), limited to openfoodfacts.org, at most 3 searches per request, results localized to Germany. When a photo shows a package but no readable barcode, the model searches by brand, name and pack size, reads the barcode from the address of the matching Open Food Facts page, and calls `lookup_barcode` with it, so the values still come from Open Food Facts and never from a web page. Nothing matches → the closest generic BLS food, said so in the assumptions. The model should not ask for a barcode or label photo just to find the product, and asks for another photo only alongside a proposal, since the user often cannot take it. Setting "Find products by name" (on by default; only active with the lookup) turns it off. Cost: USD 10 per 1,000 searches plus the result tokens, counted in the usage display. If the user's Anthropic organization has web search turned off, the chat says how to turn it on or turn the setting off.
- Photos are scaled down on the phone before sending (long side ≤ 1568 px), which keeps cost and upload time low.
- **Photos leave the chat once handled** (2026-10-18): every request resends the whole chat. Prompt caching bills repeats at about 1/20 of the input price, but only for 5 minutes, so a reply after a longer break pays for every photo again. Once every card proposed from a photo message is saved (or replaced by a correction), the app replaces its photos with "[photo removed]" and a note before the next request; the photo labels (number, time) stay. Recipe ideas don't count, as they are not made from photos. If the assistant needs a removed photo, it asks for it again.
- **Why one call, not a sorter plus separate calls per task** (owner's question 2026-10-18): the photos would have to go to the sorting call and to the task call, so they would be paid for twice; repeats within one answer are already cheap through caching; most of the cost is the model's own output, which splitting does not reduce; and splitting loses links between tasks ("cooked a curry, ate a bowl" is a recipe card and a meal card). The big levers are the model choice (Sonnet about half of Opus, Haiku about 1/40) and dropping handled photos.
- Model is selectable in the assistant settings (default the most capable; cheaper ones for lower cost). A meal costs roughly 5–15 cents with the default model and under a cent with the cheapest (estimate; check real usage in the Anthropic console).
- **Saved chats** (built 2026-10-18, owner's ask: share a chat for debugging and as examples): every assistant chat (meal logging, the recipe editor, Insights) is kept on the phone as it goes: the messages exactly as sent to and received from the API (tool calls, tool results, thinking text, the app's notes), the system prompt and tools of the latest request, the features that were on, token counts, and a list of what the user saw and did (their messages and photo labels, proposal cards with their foods and grams, what each saved card logged after the user's edits, undos, errors with the API's own message). Photos are stored apart from the messages and written once. Settings → AI assistant → Saved chats lists them (kind, date, first words, counts, size) with Share and Delete (undo), and "Share this chat" sits under every open chat. Sharing writes one JSON file (`format: tofoo-chat`) via the share sheet or a download, with the diagnostics log since the chat started; photos are left out unless "Include photos" is ticked, and API keys are never in it (they are not part of the chat). Saved chats are not in backups and stay until deleted. Setting "Save assistant chats" (on by default) turns it off.
- **Reopening a saved chat** (built 2026-10-20, owner's ask after a back press lost a meal chat from view): a meal chat can be opened again and carried on where it was left: the messages, photos, cards with what was already saved, and the cards still open, so a meal not yet logged can still be logged (the user's unsaved edits on a card are not kept). Three ways in: "Continue last chat" under the intro of a new, empty chat (the latest meal chat, with its first words, time and how many cards are still open); "Open" on each meal chat in Settings → AI assistant → Saved chats; and leaving a chat with cards still open (the back gesture or a link) shows "Chat closed. Cards still open: n." with Undo, which reopens it. Route `#/assistant/chat/<id>`. Each turn saves the rest of the conversation state with the chat (tool results owed to the model, card numbers, photo turns, products looked up), so it continues exactly; chats saved before this get it rebuilt from their messages and events. Cards come back from their saved summaries: foods by BLS code, products from the phone or from those looked up in the chat; a card whose product is neither is left out and named, so the user can ask for it again, never guessed. Recipe-editor chats and Insights are not reopened here (their cards belong to the recipe editor, Insights has none). Photo numbers in saved chats follow the photos' labels, so they stay right after earlier photos were taken out of the chat to save cost.
- **Errors** (2026-10-19, owner's ask: a bare "Something went wrong" told him nothing): a failed request shows what the user can do (key not accepted, too many requests, service busy, no connection, web search off, request turned down, the answer broke off, or a fault in the app itself) and under it the exact cause: HTTP status, the API's error type and its own message, or the app's error. Errors that arrive in the middle of a streamed answer have no HTTP status and are sorted by their error type (an overload mid-answer reads as "busy", not as an unknown error). Every failure, including refusals and over-long answers, goes into the diagnostics log as `ai.error` with where it happened (assistant, recipe, insights, photo), the model and the detail. "Share this chat" shows after a failed first message too, so that chat can be sent. If the browser refuses the share sheet (anything but the user cancelling), the file is downloaded instead and the refusal goes into the diagnostics log as `share.failed`; an export that still fails shows its cause in the message.
- **Strict tools** (2026-10-19): the API compiles all strict tool schemas of a request into one grammar with a size limit; with every option on, the main chat's tools were rejected ("The compiled grammar is too large"). Only one tool that holds a list of foods is strict (`propose_meal` in the main chat, `propose_ingredients` in the recipe editor), plus the small tools; `propose_recipe`, `check_recipe`, `propose_portion` and `propose_batch` are not strict and the app validates their input (empty lists and zero amounts may be left out) and sends errors back to the model. A test keeps it that way for new tools.
- **Usage and cost**: every API answer reports its token counts (input, output, cache reads and writes, per model when a fallback answered) and its web searches. The app multiplies them by Anthropic's list prices (a dated table in `src/ai/pricing.ts`) and shows the running cost of the current chat and its last message under the conversation, plus today / last 30 days / all time in the assistant settings. Only token counts per day and model are stored (on the device, not in backups), so a price fix re-prices the past. It is an estimate: the exact bill is in the Anthropic console, which a normal API key cannot read.

**Privacy**: the feature is off until the user turns it on and enters a key. The settings screen says plainly that photos and messages go to Anthropic. Nothing is sent when the feature is off.

**Later steps**: Open Food Facts by brand name on the log screen once a browser-usable search exists (the assistant already finds products by name through web search); remembering corrections ("my bowl is 350 g") as portion helpers.

**In the recipe editor** (built 2026-10-18): the same chat, opened from "Photo or describe the recipe", fills in a recipe instead of logging a meal. The user sends a photo of a recipe (cookbook page, card, screenshot), photos of ingredients or packages, or a typed or spoken list. The assistant has the same lookups (BLS, saved products, barcodes, product web search, USDA) and one proposal tool, `propose_ingredients` (name, portions, items with grams for the whole pot and preparation, assumptions, and the preparation steps when the user says or shows how the dish is made, in their words; a card may bring only steps), shown as cards R1, R2, …; it cannot propose meals, journal entries, sleep, activities or water there. Each message tells it what the recipe already has, and it proposes only what to add. "Add to recipe" adds the items (products are saved on the phone, as when logging) with one undo; the recipe's name and portions are filled in only where the user has not set them (portions only while the recipe has no ingredients yet). Steps on a card replace the recipe's steps: the assistant is shown the current steps and proposes the complete text, which the user can edit on the card. One ingredient may weigh up to 10 kg (a sanity limit for a pot, against unit slips). The editor's state stays as it was while the chat is open, the phone's back gesture returns to the form, and the chat stays there when reopened. Nothing is saved until the user saves the recipe.

**Bulk photo import** (built 2026-10-17): take photos of what you eat, then log a day or two at once when there is time. In the same assistant chat, the user picks many photos (up to 50 per message, as many per chat as fit in one request of 32 MB) and adds a note, including meals with no photo ("pasta on Wednesday evening"). The app reads each photo's capture time on the phone from its EXIF data (`DateTimeOriginal`, with the time-zone offset when present) before scaling it down, sorts the photos oldest first and gives the assistant a line per photo with its number and time. When a photo has no capture time (some pickers and messaging apps strip EXIF), the app uses the file date and says so, or marks the time unknown when the file date is just the moment of picking; the thumbnails show which (≈ file date, – unknown). The assistant groups photos into meals by time and content (rather than a fixed time gap: yogurt in the morning and in the evening is two meals, ten BBQ photos are one), asks all its open questions in one numbered message with defaults, then proposes every meal at once. Each meal gets its own confirm card (numbered M1, M2, …) with the time it proposed, editable; each is logged on its own, and a correction replaces just its card. Each message also tells the assistant the current time, the day the chat was opened for, and which cards are logged.

**Voice input** (built 2026-10-17, opt-in setting "Voice input"): a microphone button in the assistant chat, for talking instead of typing, including while looking through the chosen photos in a full-screen viewer (tap a thumbnail; swipe or arrows to move, the mic stays at hand). The recording goes to OpenAI's transcription API (`gpt-4o-transcribe`) with the user's own OpenAI key, kept on the phone like the Anthropic key and out of backups; the text lands in the chat box to check and edit before sending. Why OpenAI: the Claude API takes no audio, the phone keyboard's dictation was unreliable for the owner (mishearing, no punctuation, often not starting), and on-device Whisper in the browser means a large download, slow transcription on a phone and weaker mixed German/English. Cost: about $0.006 per minute of speech. Nothing is sent until the user taps the microphone; recordings are not stored.

**Everything at once** (owner's goal, 2026-10-17): open the app every day or two, talk for as long as needed and add photos of anything (meals, packaging, barcodes), and the assistant turns the whole dump into the right entries: meals as cards at their own times, journal entries in the user's words, sleep (see "Sleep"), activities (see "Activity") and plain water (see "Water"); other drinks are foods in meals. Built so far (2026-10-17):

- Long recordings are recorded in parts (2 to 4 minutes each, cut at a pause in speech) and each part is typed up while the user keeps talking; later parts get the end of the text so far as context. Reason: `gpt-4o-transcribe` writes at most 2,000 tokens per request, so a single recording longer than about 8–9 minutes came back cut off without an error. A part that fails is retried twice; if it still fails, the parts after it wait (so the text never comes out of order) and the user can try again or drop that part. Sending waits until all parts are in.
- The assistant is told when the text was dictated (expect misheard food names and spoken corrections), to go through the whole message and propose everything in it, and to give every item its own time: what the user said first, then photo times, counting "this morning" or "yesterday" from the current time.
- Answers are streamed, so one answer can carry many cards; up to 20 tool rounds per message.
- "Log all" under the cards saves every open card as shown (with the user's edits), with one undo; cards with a missing amount stay open, and the message says so.

**One assistant** (owner's ask 2026-10-18, built 2026-10-18): the assistant becomes the one place to tell or ask anything, opened from its own button on Home right above Log meal (the log screen's "Photo or describe it" opens the same chat for that day). In one chat the user can log meals, journal entries, sleep, activities and water, save a dish they cooked as a recipe, change a recipe in the book, and (with Recipe ideas on) ask what to cook or how to make a recipe better. The tools and cards are the existing ones plus the recipe tools below; the recipe editor's own assistant (ingredients for the recipe being edited) stays as it was.

- **Recipes in the chat**: `list_recipes` (the user's recipes with recipe_id, portions, how often cooked in the last 60 days, portions in stock, ingredients with codes and grams, steps) and `propose_recipe` (kind "own" for a dish the user cooked or told, "idea" for a suggestion; name, portions, all ingredients for the whole pot, assumptions, steps, a reason line, and `recipe_id` to change a recipe in the book with its complete new ingredient list). Shown as R cards: name and portions editable, ingredients tappable as in the editor (food, grams, preparation), steps editable. A change card marks what is new, what changed amount ("was 200 g") and what is taken out, and "Update recipe" replaces the recipe's ingredients (and steps, if the card has new ones) with undo; batches already cooked keep their own copy, so the past does not change. A new recipe is saved with "Save to recipes", with undo, and links to its page, where it can be cooked as a batch. "I cooked a curry and had a bowl" becomes a recipe card and a meal card (the bowl's share of each ingredient).
- **Answers in pages**: an answer with two or more cards opens as pages over the chat (owner's design): the assistant's text first, with the list of what follows, then one page per card in the order the assistant proposed them, each with its own accept button (Log meal, Save, Save to recipes, …), then a summary page that lists every card with its state (Saved / Open) and the user's comments, with "Accept all" (one undo) and "Reply". Previous and Next move between pages; accepting a card moves on. Every page has a comment box at the bottom (the microphone fills it while the pages are open); Reply sends all comments as one message, each marked "About M2 (title): …", and the assistant corrects just those cards. Back (button or the phone's gesture) returns to the chat, where the answer shows as a short bubble with its cards and "Show n pages". Answers with one card stay in the chat as before.
- Up to 30 tool rounds per message (ideas add a check per idea).

## Journal, sleep and activity

Food alone does not explain how the user feels, so a few low-friction records sit next to the food log, in one place, to look for patterns across all of them (owner's request, 2026-10-17). Each is an optional module with its own toggle, and none of them takes over Home: the food log and the gauges stay the main screen. Each can be logged by tapping and by telling the assistant ("slept from 1 to 8, walked 40 min to work, headache since noon"), which proposes the entries on a confirm card, as it does for meals. Logging stays a few seconds: no required fields, sensible defaults, times default to now.

**Journal** (decided 2026-10-17, replaces day notes; built 2026-10-17): write anything at any time ("ate out, guessed amounts", "tired all afternoon", "headache since noon"), as many entries a day as wanted, each with its own time (now, editable). Plain text, no tags or categories to pick; the assistant reads the words later. Voice input works here as in the assistant chat (with a journal hint for the speech model instead of the food one). Entries appear in the diary at their time between meals (entries with no meal between them share one card); tap one to edit or delete it, with undo. Ways to write, fastest first: the pen button on Home or the "Write in journal" home-screen shortcut (both open the journal page, ready to type, with all entries below, newest first); "Journal entry" in the diary, for any day; or telling the assistant, which proposes the entry in the user's own words on a card (J1, J2, …) to check and save, next to any meal cards, without interpreting it. Entries are stored on the phone and included in backups (`data.journal`), and later in the CSV export. This reverses the 2026-10-16 note "no symptom tracking or correlations": correlations are now wanted, done by Insights below. Maybe later: an optional one-tap "how do you feel" score (1–5) with an entry, which gives Insights a number to compare instead of only words.

**Sleep** (decided 2026-10-17): one record per night, when the user went to sleep and woke up; no sleep quality (owner's decision). Ways to log, fastest first:

1. "Going to sleep" and "I'm up" buttons, also as home-screen shortcuts (long-press the app icon), one tap each, with undo.
2. A morning question on Home when the app is first opened after waking: "Slept 23:40 to 07:10?", prefilled from the buttons or from the usual times; one tap to confirm, or adjust.
3. The assistant or the diary, for nights logged after the fact.

Built 2026-10-17 (optional module "Sleep", off by default): a sleep is stored with when the user fell asleep and woke up (`data.sleep` in backups), and belongs to the day it ended. The bed button sits in the button stack on Home from 18:00 to 4:00 and whenever a sleep is going (it then reads "I'm up", with a sun icon); one home-screen shortcut, "Sleep or wake up", does either, so the shortcuts stay at the four Android shows. The morning question shows on Home from 4:00 to 14:00 when last night is not logged yet: "Slept 23:40 – 07:10 · 7 h 30 min?", taken from the buttons or else the median bed and wake times of the last two weeks of nights (sleeps of 3 hours or more; 23:00 to 07:00 before there are any), with Yes, Change and Not now. A sleep still going after 3 hours shows "Asleep since 23:40. Up now?" at any time of day, so a forgotten "I'm up" is easy to fix. In the diary a sleep sits in the timeline where it ended; tap to edit or delete, with undo. The assistant proposes sleep cards (S1, S2, …) from what the user says, with both times to check; how they slept goes in a journal entry, not the sleep card. Saving a sleep replaces any sleep it overlaps (a sleep still going counts as lasting up to 20 hours), so a night told to the assistant after pressing the buttons is not counted twice; one undo puts the old one back.

Automatic detection (face-down phone, being at home at night) is not possible in a web app: Chrome stops a page's motion sensors and location as soon as it is not on screen, so it would need the app open with the screen on all night. If automatic sleep times are wanted later, they come from Android itself (sleep sessions recorded by the phone's bedtime or sleep detection, a watch, or another app, in Health Connect) through the phone health data import (Later).

**Activity** (decided 2026-10-17): a simple log of what (walk, run, cycling, strength, other, or free text), when, how long, and roughly how hard (easy / moderate / hard). An activity marked "outside" can count toward the vitamin D sun estimate for that day, unless it is already part of the outdoor routine, so a walk is logged once for both. No steps (a web app cannot count them in the background), no GPS tracks, no social features. Energy burned is not estimated now; that belongs to the later energy in and out feature and needs a sourced table of activity energy costs. Can grow later, for example steps and workouts from Health Connect.

Built 2026-10-17 (optional module "Activity", off by default): an activity is stored with kind, an optional own name, start time, minutes, intensity and whether it was outside (`data.activities` in backups). It is added or edited in the diary ("+ Activity"), where it sits in the timeline at its start time, or proposed by the assistant as an activity card (A1, A2, …) that the user checks, changes or saves; "Log all" includes it. An outside activity has a switch "Counts toward vitamin D from the sun" (on by default, with face and hands uncovered unless the user picks otherwise or told the assistant what they wore); while on, its minutes from its start time go into the sun estimate for that day exactly like an extra "Time outside" entry, and it is listed under "Time outside" in the diary. The user turns it off when the time is already in the outdoor routine. The assistant sends exercise to activity cards rather than the journal while Activity is on. No calories, steps or heart rate.

**Insights** (decided 2026-10-17, built last, once there are a few weeks of data): "Look for patterns" asks the assistant to compare the journal with food, nutrients, sleep, activity and day statuses over a chosen period, or to answer a question ("why am I tired on Mondays?"). Same rule as for meals: the AI chooses what to compare, the app computes the numbers. The model gets tools to read journal entries and to query the data (for example, days whose journal mentions a headache against the other days: sleep length, caffeine, a food the day before), and every number in its answer comes from those tools. Delayed effects (the day before, the last week) are part of what it compares. Answers are possible patterns with their counts ("headache on 4 of the 6 days after less than 6 h sleep, 3 of 25 otherwise"), never causes or medical advice: with one person and a few weeks of data many apparent patterns are chance, so each answer says how many days it rests on. The result is a chat, so the user can dig deeper ("show me those days") or stop at the summary. Runs only when asked, with the user's Anthropic key; it sends the journal text and the summaries the model asks for to Anthropic, which the setting says plainly.

Built 2026-10-18 (optional module "Insights", off by default, needs the AI assistant): "Patterns" in the diary (and "Look for patterns" on the journal page) opens a chat at `#/insights`. Before anything is sent, the user picks a period (2 weeks, 4 weeks, 3 months (default), all) and sees what it rests on: days with food logged completely, journal entries, nights of sleep, days with activity and water, with a plain note when that is thin. "Look for patterns" or a typed (or spoken) question starts it; follow-up questions continue the chat, which stays open while the user looks at days in the diary. The model has four tools, all computed by the app from the stored data (`src/logic/insights.ts`): `read_journal` (entries of a period, optionally by words), `count_days` (on how many days with the group conditions the outcome held, against the other days), `compare_measures` (average, median and range of measures on group days against the others, or over the whole period) and `day_details` (everything logged on some days). Conditions are journal words, food words (English and German BLS names, dish names), a measure against a number, weekday or food-log status; each can look at another day (offset: the day before, the day after) or several days (span: any of them, or a measure's average), or be negated, so delayed effects can be compared. Measures per day: every tracked nutrient as eaten (after cooking and storage losses, not absorbed), alcohol, number of meals, first and last meal time, sleep length, bedtime and wake time (a night belongs to the day it ended), naps, activity minutes (all, moderate or hard, outside), plain water, water from drinks and food, journal entries. Unknown stays unknown: food values only count on days whose food log is complete (logged or fasted, and over), a tracker only from its first record on, and days that cannot be told are left out and counted, never taken as zero or "no". Each count comes with a chance check (Fisher exact test for counts, a permutation test for averages): how often a split at least this uneven turns up by chance alone; under 5 % reads "a possible pattern", 5 to 20 % "at most a hint", above that "could easily be chance". Under each answer, "Numbers from the app" lists every comparison the model ran in plain words with the app's own counts, averages and chance checks, and the days behind a count as chips that open the diary, so a number in the answer can be checked against its source. Trackers turned off in the settings stay out of the analysis. Errors are shown with the API's own message.

## AI recipe ideas

"What should I cook next?" answered by the assistant, with ideas that fit the user's gaps, habits and preferences, each with one line on why it is suggested (owner's idea, 2026-10-17; comes after Insights in the build order). Optional, off by default, needs the AI assistant and the user's own Anthropic key.

**Built 2026-10-18, inside the one assistant** (see "One assistant" under AI assistant logging) rather than as its own button: the user asks in the chat ("what should I cook this week?", "ideas for my iron", "make my curry better for folate"). With "Recipe ideas" on (Settings → AI assistant, with the "Cooking preferences" text), the model gets two more tools: `nutrient_gaps` (the status per nutrient as on Home with what each percentage means, the gap-filling food ranking, the foods eaten most in the last 30 days, the excluded foods and food groups, the preferences text; one tool for what the spec below lists as "what the model sees" and `rank_foods`) and `check_recipe` (ingredients and portions, or a saved recipe by id, in; per portion after cooking losses: kcal, protein, and the share of the day's recommended intake for every nutrient that is low, getting low or too high now, plus what else it is rich in). Ideas are `propose_recipe` cards of kind "idea" with the reason line; the app rejects an idea with an excluded food, an unknown code or no reason. Every R card shows the app's own numbers for one portion under the ingredients ("For your gaps: Iron 45 %, Folate 50 %"; for a change, before → after), computed live from the card as edited, so a reason that does not match is visible. Default 3 ideas, batch recipes sized like the user's pots. Not built yet: "Another idea" and "Not for me" buttons (the user asks in the chat instead), ideas on the Home screen, the freezer/fridge stock beyond portions per recipe.

**Flow**:

1. "Recipe ideas" on Home (next to "Foods that fill your gaps") or in the recipe book asks for a few ideas (default 3). Nothing is sent until the user taps it; the app never asks the model in the background.
2. Each idea is a card: name, the one-line reason ("Iron and folate have been low for two weeks; one portion covers about half of both"), portions, ingredients with grams, short steps, and the app's own numbers for one portion (what it covers of the current gaps, and anything it pushes towards a limit).
3. On a card: "Save to recipes" (it becomes a normal recipe, ready to cook as a batch), "Another idea", or keep chatting ("no oven", "faster", "with what's in the photo of my fridge"), and the assistant revises it, as it does for meals.

**Same core rule as for meals**: the AI chooses dishes, ingredients and grams; it never supplies nutrient values. Ingredients must be BLS codes (or saved products and USDA foods, as in logging), checked by the app before a card is shown. The app computes each portion's nutrients from the database, with the usual retention factors for how it is cooked and stored, and shows them on the card. The reason line is grounded the same way: the model gets the numbers from a tool and may only quote them, and the app shows the coverage it computed itself next to the line, so a reason that does not match the numbers is visible. It does not claim health effects beyond "covers X % of your need".

**What the model sees** (only when asked): current status per nutrient (low, getting low, enough, too much, with percentages), the recipes in the book and how often each was cooked lately, recent meals (to suggest what the user actually eats, with some variety), freezer and fridge stock, the food exclusions, and the preferences text. Tools:

- `search_foods` and the other food-search tools of the assistant.
- `rank_foods`: the app's existing "foods that fill your gaps" ranking, so ideas start from foods that really close the gaps instead of the model's memory of nutrition tables.
- `check_recipe`: ingredients and grams in, the app's per-portion nutrients, gap coverage and limit warnings out; the model calls it before proposing and adjusts the recipe until it does what the reason line says.
- `propose_recipe`: one idea for a card (name, reason, portions, ingredients, steps, which gaps it targets). The app rejects an idea that contains an excluded food or a code that does not exist, and sends the error back.

**Preferences**: a free-text field "Cooking preferences" in the assistant settings, written by the user and sent with every request for ideas: diet, likes and dislikes, kitchen equipment, how much time and effort, budget, where they shop, the usual batch size ("one big pot, 6 portions, most of it frozen"). Food exclusions in the profile stay the hard filter, checked by the app; the text is guidance for the model, which can miss it, so it is not an allergy safeguard (the app makes no allergy-safety claims). Maybe later: "Not for me" on a card adds a short note to the preferences, so the same kind of idea does not come back.

**Fits batch cooking**: by default ideas are batch recipes sized to the usual pot and storage plan, and the computed numbers include the losses of that plan (freezer portions). An idea can also be one of the user's own recipes ("cook your lentil curry again: it covers your iron gap"), which overlaps the planned "best next batch" ranking; that ranking then becomes a tool of the model rather than a separate feature.

**Relation to "Foods that fill your gaps"**: proposed to keep the row, smaller, under the ideas: it works without a key, offline and at no cost, it is the ranking the model uses as a tool, and it is the only suggestion when the assistant is off. Open question for the owner: drop it once ideas exist, if it adds nothing.

**Expansions, later**: improve an existing recipe ("add 100 g spinach to the curry: iron 40 % → 65 % of need"), which is the planned swap preview offered by the assistant; a snack or single side to close a gap today; ideas from a photo of the fridge or a shopping receipt; a shopping list from a saved idea (with the planned shopping list); a few ideas for the week as the weekly recap's "one suggestion for the next batch".

**Cost and privacy**: one request for three ideas costs roughly as much as a logged meal (a few cents with the default model, shown in the usage display). It sends the nutrient statuses, recipe and recent food names, stock and the preferences text to Anthropic, only when the user asks, which the setting says plainly.

## Ketosis estimate during fasts

During a fast, show how far the body has probably moved toward ketosis, as a phase and a range taken from fasting studies, never as one precise number (owner's request, 2026-10-18). Built 2026-10-21: the estimate, the Home line and the fast page; measured values are next. Only for fasts started in the app, not for daily meal gaps such as one meal a day: there the gap (about 22–23 h) sits right at the 0.5 mmol/L line, so the estimate would mostly say "around the line" (owner's decision, 2026-10-21; insulin and autophagy are not estimated at all, see the write-up in the project files, "insulin-ketosis-autophagy.md"). Optional module "Ketosis estimate", off by default, used only while a fast runs. It is information, not a target: the guardrails under "Motivation and gamification" apply, so there are no rewards, streaks or "better" colours for deeper ketosis or longer fasts.

**What the studies show.** The marker is blood β-hydroxybutyrate (BHB), the main ketone body, in mmol/L. Means from studies of healthy adults on water-only fasts:

| Time since the last meal | BHB, mmol/L | Source |
| --- | --- | --- |
| Fed and overnight | 0.1–0.25 (daily swing) | Puchalska & Crawford 2017, review |
| 12–36 h | The "metabolic switch" from glycogen to fat; when it comes depends on how full the liver's glycogen store was and on exercise during the fast | Anton et al. 2018, review |
| about 14 h | 0.4 | Cahill et al. 1966 (6 men of normal weight) |
| 17.5 h with exercise, 21 h without | Mean time to reach 0.5 | Deru et al. 2021 (20 adults, 36-h fasts, finger-prick meter every 2 h) |
| 24 h | about 1 | Puchalska & Crawford 2017 |
| 30 h | Men 0.9, women 1.7 | Haymond et al. 1982 (10 men, 10 women) |
| about 38 / 62 / 86 / 110 / 134 / 158 h | 1.6 / 2.2 / 2.9 / 3.1 / 3.6 / 4.2 | Cahill et al. 1966 (same 6 men; morning samples. The hours are worked out from the study schedule: last meal at supper, samples at 8 a.m.) |
| Day 3 / 10 / 17 / 24–38 | 1.2 / 4.3 / 5.1 / 5.8–5.9 (levels off after about 3 weeks) | Owen et al. 1969 (11 people with obesity) |

These are group means; individuals vary a lot around them, and the studies are small, partly old and used different assays.

**What moves the curve.** The direction of each factor is well supported. How big the effect is comes from single small studies, so the sizes go into `model/parameters.ts` with low/central/high values and a confidence note:

- **Carbohydrate in the last meal.** After a low-carb, high-fat shake, older overweight adults reached 0.5 mmol/L at about 12 h on average. After a high-carb shake with the same energy, they did not reach it within 24 h (Gipson et al. 2025, 24 adults). A high-fat day before a fasting day also raised breath acetone (Prabhakar et al. 2015). The app knows the carbohydrate of the last meal and of the days before from the log.
- **Carbohydrate during the fast.** A high-carb shake at hour 24 of a 38-h fast cut BHB sharply, and a high-fat shake less so: the water-only fast had 135 % and 70 % more BHB (Deru et al. 2024). In the app any logged food ends the fast, so this matters only for drinks and supplements, which do not end it.
- **Exercise early in the fast.** A treadmill session at the start brought 0.5 mmol/L about 3.6 h earlier (17.5 vs 21.1 h; the uncertainty interval runs from 2.1 h later to 10.9 h earlier), and BHB over the 36 h was 43 % higher (Deru et al. 2021). This is taken from the Activity log: moderate or hard minutes since the last meal.
- **Sex.** Women's ketones rise sooner and higher (Haymond et al. 1982: 1.7 vs 0.9 at 30 h; Merimee et al. 1978: faster rise in women over 72-h fasts). This is taken from the profile.
- **Body fat.** Ketosis develops more slowly with obesity (Göschke & Lauffenburger 1975: 14 people of normal weight vs 26 with obesity; Prabhakar et al. 2015: lower BMI, more acetone). The Owen people with obesity were at 1.2 on day 3, while Cahill's men of normal weight were at about 2.2 at a similar time. BMI from the profile's weight and height serves as the proxy.
- Not used: age (only children differ clearly; Haymond et al. 1982 measured 3.7 at 30 h), and exogenous ketones and MCT oil (not modelled).

**Estimate.** A pure function in `src/model/ketosis.ts`; its curve and factors live in `model/parameters.ts` (`ketosis`) with sources, ranges and confidence. Nothing it computes is stored.

1. Hours since the last meal (`src/logic/fasting.ts`): the latest food (not a drink or supplement) logged before the fast's first day, at most a day before it; else the start of the fast's first day, shown as "at least".
2. A reference curve by hour, for adults of normal weight, through the means above (Puchalska 2017 for fed and overnight, Deru 2021 for 0.5 mmol/L at 21 h, Haymond 1982 men at 30 h, Cahill 1966 up to 158 h), then Owen 1969 for long fasts. Cahill's 0.4 at 14 h and Puchalska's "about 1" at 24 h disagree with the larger, more recent measurements and are not used as curve points.
3. Timing factors move the curve in hours: the last meal's carbohydrate (share of its energy at 4 kcal/g: full shift of about 7 h earlier at 5 % or less, none at 55 % or more, linear between; the two shakes in Gipson 2025 had 4.4 % and 56.8 %; the 7 h is read off the curve from that study's 12- and 24-h values), and 30 minutes or more of moderate or hard activity since the last meal (Deru 2021: 3.57 h earlier, interval 2.11 h later to 10.87 h earlier). Level factors scale the rise above the fed baseline: women × 1–2 (Haymond 1982: (1.7 − 0.1) / (0.9 − 0.1)), BMI 30 or more × 0.52–1 (Owen 1969 vs Cahill 1966), linear from BMI 25, faded out between 158 and 240 h where the curve itself comes from people with obesity. Unknown carbohydrate, sex or BMI widen the band instead.
4. The band adds how much people differ: ± 1 SD in timing (2.95 h, Deru 2021) and ± 56 % in level (SD / mean at 24 h, Gipson 2025). Each factor's range widens it further; the band takes the lowest and highest result of all of them together.
5. The output is a phase and a range. The phases are display choices around the 0.5 mmol/L line that studies use for "nutritional ketosis" (Deru 2021, Gipson 2025): *no ketosis yet* (even the top of the band below 0.5), *ketosis maybe starting* (only the band reaches 0.5), *light ketosis likely* (0.5–1.5), *moderate* (1.5–3), *deep* (above 3, only in long fasts). They are named in words, not shown by colour alone. Ranges are rounded to one decimal, never below 0.1, and "about" is always shown.

**Measured values** (optional; they make the estimate personal):

- "Add a measurement" on the fast page, or telling the assistant ("ketones 1.2 this morning"), which proposes a ketone card (K1, K2, …) to check and save, like the other trackers. Each record holds a time, a type and a value. It is stored as user-entered data with a `schemaVersion`, included in backups (`data.ketones`) and in the backup read-back check.
- **Blood BHB** (finger-prick meter, mmol/L) is the most reliable home method. A common meter agrees with laboratory LC-MS/MS from 0 to 3 mmol/L (slope 1.20). Above 3 its readings scatter, so the app shows such values as "> 3" (Janssen et al. 2010).
- **Breath acetone** (ppm) depends on the device. It follows blood ketones roughly linearly up to about 4 mmol/L (Göschke & Lauffenburger 1975), but diet, exercise and breathing affect it (Anderson 2015). It is shown as measured and not converted.
- **Urine strips** detect only acetoacetate and only roughly (Laffel 1999). The strip's level is shown as read and not converted.
- On the fast page, measurements appear as dots on the curve. The latest one is shown with its age ("1.4 mmol/L, measured 3 h ago"); the estimate never overrides it. With blood measurements from several fasts, the app works out the user's own shift against the reference curve ("you reach 0.5 about 4 h earlier than the study average, from 6 measurements") and uses it in later estimates. Breath and urine values are not used for this, because there is no sourced conversion to blood values.
- Measured ketones become a measure in Insights.

**Where it shows.** The running-fast line on Home shows the hours since the last meal ("Fasting 31 h", or "2 d 5 h" from 48 h on) whenever a fast runs, and with the module on also the phase ("Fasting 31 h · light ketosis likely"). The range stays off Home so the line fits one row at 360 px. This covers the "fasting timer" nice to have under "Dashboard and UX". Tapping the line opens the fast page (`#/fasting`):

- the hours and when the last meal was;
- the phase and "Blood ketones (BHB) now: about 0.7–1.5 mmol/L";
- the curve over hours since the last meal (at least 48 h, and half a day beyond now), with the estimated band, the phase lines and a "now" mark; measurements will appear as dots on it;
- what moved the estimate, in words with the source ("Last meal had 4 % of its energy from carbohydrate: earlier (Gipson et al. 2025)"), plus how much people differ;
- a reading guide behind ⓘ that explains BHB, the phases, how uncertain the estimate is and the safety note, and lists every number used with its source, confidence and note, generated from `model/parameters.ts`.

Not built yet: past fasts with their length and measurements.

**Safety.**


- The setting says the estimate is not meant for people with diabetes treated with insulin or SGLT2 inhibitors, or during pregnancy, and that their ketone values belong with their doctor. In these groups ketoacidosis can develop with normal blood sugar, and for people on SGLT2 inhibitors prolonged fasting and very-low-carbohydrate diets are listed risk factors (Umpierrez et al. 2024, ADA/EASD consensus; there, diabetic ketoacidosis needs diabetes, BHB ≥ 3.0 mmol/L and acidosis together).
- A measured blood value above what water-only fasts reach in healthy people (about 6 mmol/L after weeks, Owen et al. 1969; the exact line is open) gets a plain note. It suggests measuring again, and getting medical help if there is nausea, vomiting, belly pain or fast breathing. No other alerts.

**Sources** (all checked 2026-10-18 at least as the abstract; Cahill 1966 and Owen 1969 tables read in full):

- Anderson JC. Measuring breath acetone for monitoring fat loss: review. Obesity 2015;23:2327–34. doi:10.1002/oby.21242
- Anton SD et al. Flipping the metabolic switch: understanding and applying the health benefits of fasting. Obesity 2018;26:254–68. doi:10.1002/oby.22065
- Cahill GF Jr et al. Hormone-fuel interrelationships during fasting. J Clin Invest 1966;45:1751–69 (Table III). doi:10.1172/JCI105481
- Deru LS et al. The effects of exercise on β-hydroxybutyrate concentrations over a 36-h fast: a randomized crossover study. Med Sci Sports Exerc 2021;53:1987–98. doi:10.1249/MSS.0000000000002655
- Deru LS et al. The effects of a high-carbohydrate versus a high-fat shake on biomarkers of metabolism and glycemic control when used to interrupt a 38-h fast. Nutrients 2024;16:164. doi:10.3390/nu16010164
- Gipson EZ et al. The effects of initiating a 24-hour fast with a low versus a high carbohydrate shake on glycemic control in older adults. Nutr Metab 2025;22:32. doi:10.1186/s12986-025-00920-5
- Göschke H, Lauffenburger T. Breath acetone and ketonemia in normal- and overweight subjects during total fasting. Res Exp Med 1975;165:233–44. doi:10.1007/BF01971383
- Haymond MW et al. Differences in circulating gluconeogenic substrates during short-term fasting in men, women, and children. Metabolism 1982;31:33–42. doi:10.1016/0026-0495(82)90024-5
- Janssen MJ et al. Accuracy of the Precision point-of-care ketone test examined by LC-MS/MS in the same fingerstick sample. Clin Chem Lab Med 2010;48:1781–4. doi:10.1515/CCLM.2010.351
- Laffel L. Ketone bodies: a review of physiology, pathophysiology and application of monitoring to diabetes. Diabetes Metab Res Rev 1999;15:412–26
- Merimee TJ, Misbin RI, Pulkkinen AJ. Sex variations in free fatty acids and ketones during fasting: evidence for a role of glucagon. J Clin Endocrinol Metab 1978;46:414–9. doi:10.1210/jcem-46-3-414
- Owen OE et al. Liver and kidney metabolism during prolonged starvation. J Clin Invest 1969;48:574–83 (Table II). doi:10.1172/JCI106016
- Prabhakar A et al. Acetone as biomarker for ketosis buildup capability: a study in healthy individuals under combined high fat and starvation diets. Nutr J 2015;14:41. doi:10.1186/s12937-015-0028-x
- Puchalska P, Crawford PA. Multi-dimensional roles of ketone bodies in fuel metabolism, signaling, and therapeutics. Cell Metab 2017;25:262–84. doi:10.1016/j.cmet.2016.12.022
- Umpierrez GE et al. Hyperglycemic crises in adults with diabetes: a consensus report. Diabetes Care 2024;47:1257–75. doi:10.2337/dci24-0032

## Exchange format, QR codes and the Claude helper

One versioned JSON format ("ToFoo exchange format") is used for QR codes, pasted entries, and backups, so every import path shares one parser and one validator.

**Format rules**:

- Top-level `format: "tofoo"`, `formatVersion`, and `type` (`recipe`, `logEntry`, `backup`).
- Recipes reference ingredients as `source + version + code + grams + preparation`, never copied nutrient values. Manual ingredients carry their own nutrient values and confidence.
- A JSON Schema file in the repo (`docs/exchange-format.schema.json`) plus a human-readable description (`docs/exchange-format.md`).
- Import always shows a preview and asks for confirmation; invalid input gives a clear error, never a silent partial import.
- Every backup is read back right after export, exactly as a restore would read it; if that fails, the backup page shows the exact problem (and the diagnostics log keeps it), so an unrestorable backup is noticed at once. A type check (`src/exchange/coverage.ts`) fails the build when a stored field is missing from the backup schema, which would otherwise drop it silently on restore.

**QR codes on printed recipes** (v2): the QR encodes a link to the app with the recipe compressed into the URL fragment, e.g. `https://beitz.github.io/ToFoo/#import=<compressed recipe>`. Scanning with the normal phone camera opens the app and shows "Import Linsencurry, 6 portions?". The fragment is never sent to a server. The app has an "Export as QR" action per recipe (SVG and PNG, for the A4 recipe sheets). Claude Code verifies that a typical recipe (15–20 ingredients) stays within a comfortably scannable QR size.

**Sharing full recipes by QR**: viable within limits. A QR code holds at most about 3 KB, and printed codes scan reliably only well below that. Ingredients as codes plus grams are tiny; instruction text is what takes the space. So the payload is tiered: the data block (name, portions, ingredients, storage plan, shelf life) is always included; the instructions are added, compressed, when the result stays under a size budget (target about 1 KB); otherwise they are left out and the QR notes that the steps are on the printed sheet. Because ToFoo is a public web app, anyone can scan the code and open the recipe, with or without using ToFoo for tracking. The app reads only the fields it needs and ignores unknown ones, so the format can grow.

**Claude helper** (v2): instead of an AI API inside the app, a Claude Project (in claude.ai) holds the exchange-format description and instructions. The user posts photos, labels or a description of an unplanned meal; Claude returns a `logEntry` in the exchange format with confidence C, preferring BLS codes where a match exists. The user pastes it into the app. Because there is no standard recipe format on the web, importing a recipe from a website also goes through the helper (and the in-app assistant): paste the recipe text or link, get a `recipe` in the exchange format back, matched to BLS codes. It remains the no-API-key alternative to the in-app AI assistant (above). Claude Code writes the project instructions file (`docs/claude-helper-instructions.md`) once the format is stable.

## Dashboard and UX

The home screen answers "how am I doing, and what do I eat next?" at a glance, with logging one tap away; everything deeper sits behind a tap (progressive disclosure).

**Home screen, top to bottom**:

1. **Today** (compact since 2026-10-17): the header shows the date and how many entries were logged today. A round button bottom right holds the quick actions (since 2026-10-18, to save space and leave room for more): closed it shows a grid icon, with the assistant's own button right above it (since 2026-10-18, owner's ask: the assistant is one tap away); the first tap turns it into **+** and fans out the other actions above them, each with its name (Write in journal, Log activity, Going to sleep / I'm up, Start or End fast; trackers only when turned on, the bed one in the evening or while asleep); a second tap on + opens Log meal. Tapping outside, or the phone's back gesture, closes it. The fast action starts a fast (or ends the running one, with undo). A running fast shows as one line under the header. Freezer-stock chips for one-tap logging sit under the header once batches exist.
2. **Nutrient gauges** (the main content): energy and macronutrients first in one row, then one gauge per visible nutrient, sorted by urgency (low and too-high first). **One line per nutrient** (decided 2026-10-17, replaces the compact/detailed switch): status icon, name, a bar, the value and trend arrows. The bar shows the uncertainty range as a shaded band (solid up to the low scenario, shaded to the high one, a marker at the central value) when "Uncertainty ranges" is on, and a mark at 100 % of the need or of the upper limit. Every line is an average share of the need (or of a limit); the six body stores are tank cards above the lines instead (see "Two kinds of nutrient"). **Trend arrows**: how the shown average moved over the last 7 days, the same rule for every nutrient on Home. ↑ / ↓ count from how soon, at that rate, the value reaches the next status line: three within a week, two within a month, one slower or when no line lies ahead; → when it moves less than 2 points a week. Arrows are green when heading to a better status, amber when heading to a worse one, grey otherwise; the direction is always in the shape. The nutrient page states the trend in words. A small ⓘ button next to the heading shows how to read the bar, the words and the arrows on demand. **Readable at a glance** (decided 2026-10-17): the ⓘ next to the heading says how to read the numbers (plain percent = share of the daily need, on average lately; "of max" = share of an upper limit), and an ⓘ next to "Stores" explains the tank cards, and limit gauges say "of max". **Grouping switch**: by status (default; collapsible headings "Too much – eat less of these", "Low – eat more of these", "A bit low", "Enough", the last collapsed by default), by type (vitamins, minerals, protein and amino acids, fats, carbohydrates; each heading counts what needs attention, e.g. "6 low · 2 getting low") or none (one list sorted by urgency). Open and closed headings are remembered.
3. **Foods that fill your gaps**: one horizontal row of single foods from the BLS, ranked by how many urgent gaps they close at once without pushing anything over its upper limit, respecting food exclusions. Tap a food for its nutrient profile.
4. **Best next batch** (once the recipe book has recipes): the same ranking applied to the user's own recipes. Hidden while the book is empty.
5. **Recipe ideas** (with the assistant and Recipe ideas on): asked for in the assistant chat since 2026-10-18 rather than with a button here; see AI recipe ideas.

**Tap a gauge** to expand: history chart, forecast (if on), contributing foods, the wiki summary, a short explanation (what the nutrient does, what too little and too much mean, with source), and good sources from the BLS (varied: one food per BLS subgroup and main name word, e.g. one liver, one mushroom). "All foods, ranked" opens the full list: per portion or per 100 g, filter by name and food group, optional "one per kind of food", exclusions applied.

**Reviewing the past** (decided 2026-10-16, needed; the owner named this as what makes ToFoo feel lacking next to other apps):

- **Day and range breakdown** (built 2026-10-16): the full nutrient breakdown for one day, a week, a month or a chosen date range ("how was September?"), using the same gauges and percentages. It shows what was logged, nothing filled in: the average per day over the days that count in the model (logged and fasted days, and days without entries unless "Fill in unlogged days" is on; partly logged, filled-in and left-out days are not counted and are shown separately). Percentages are the absorbed amount against the absorbed need, as on Home, and intake against the limit for limits; nutrients with stores show the daily average here, not a fill level. The diary links to the day view and the calendar to the month. The stores view stays the main one on Home.
- **Trends and weekly look-back** (built 2026-10-19; owner's pick): weekly averages and charts across nutrients, not only one nutrient's history. This is the "weekly recap card" (see Motivation), shipped on its own, without the rest of gamification. One screen per calendar week (Monday to Sunday, as the calendar), opened from the diary ("Week") and from the Review screen ("Week by week"); it opens on the current week, or on last week on a Monday, when the current one has no finished day. Today counts once it is over, so a half-eaten day never reads as a gap. From top to bottom:
  - **The seven days** with their day status (icon and label), each opening the diary.
  - **Since the week before**: nutrients that are enough again (low or getting low the week before), that are now low, and that are over their limit (the first four names and "and N more"); the biggest rise and fall in share of the need, as "82 % → 96 %", ranked on values capped at 100 % of the need (above the need, more closes no gap); and **one suggestion for the next batch**: the recipe from the book whose portion covers most of the week's gaps (low counts double, as in "Foods that fill your gaps", pushed down when it adds over 20 % of the day of something already too high), with what one portion gives; without a recipe that helps, three foods from "Foods that fill your gaps" for the week. Without a logged day the week before, it says so instead of comparing.
  - **Nutrients at enough** per week over the last 8 weeks: one bar per week with the count written on it; tap a week to open it.
  - **Every visible nutrient** sorted by urgency: status icon, name, 8 small bars (one per week, the shown week highlighted, a dashed line at the need) and the week's value, as on the Review screen (absorbed against the need; "of max" for limits; amounts for nutrients without a reference value). Tap for the nutrient page.
  - **Sleep, activity and more**, for trackers that are on and have data in these weeks: sleep per night, fell asleep, woke up, activity, moderate or hard, outside, plain water per day, water from drinks and food per day, first and last meal, alcohol per day, journal entries; each with the week before and 8 small bars (none for clock times). Activity and journal entries are totals for the week, the rest are averages over the days with a value; a week without any value shows "–", never zero.
  - "All numbers for this week" opens the Review screen for the same week.
- **Nutrients of one meal** (built 2026-10-21; owner's ask: "what was actually in that snack, and how much of my day did it cover?"): the nutrient page shows which meals gave one nutrient; this is the other way round. "Nutrients" at the bottom of each meal in the diary (with the meal's energy) opens the meal: its items with amount and energy, then energy and macros at a glance, the three nutrients it covers most of the day for, and every visible nutrient with its amount, a bar (full = the whole day) and its share of the day, grouped by type as on the food page (with the group ⓘ) or sorted by biggest share. Tap an item, or "What's in it" on the entry's edit sheet, for the same view of one entry; a recipe portion lists its ingredients, and each ingredient opens the same view for its part of the portion. Shares mean what they mean on Home and in the day review, so a day's meals add up to the day: absorbed against the absorbed need (absorption depends on the whole meal, so the meal's absorbed amount is split over its items by their share of the intake, as on the nutrient page), intake against the limit for limits ("of max"), amounts only for nutrients without a reference value. Amounts are after cooking losses. "≥" when some food has no data for a nutrient, "–" when none has. **Per 100 g first** (owner's ask, 2026-10-21: one gummy bear's share of the day is near zero everywhere): the meal and item pages open on "Per 100 g" whenever the weight is known: energy per 100 g with what was eaten ("you had 22 g: 75 kcal"), one bar and a line of what 100 g is made of (carbs with sugar, protein, fat, fibre, water and the rest), the nutrients 100 g is richest in, and every nutrient per 100 g with its share of the daily reference intake, as on the food page (intake, not absorbed; limits "of max"). "Your day" switches to the shares of the day after absorption described above. The weight is the grams logged; for a portion, its share of the weighed pot, else the raw ingredients (said so, with a hint to weigh the pot); for a saved item, its serving weight; manual entries have none, so they show "Your day" only. Nutrients no food in it has data for (amino acids on a label that only gives protein) are hidden behind "Show N without data". **Source** (owner's ask, transparency): one folded line under an item's title, "Source: Open Food Facts label + BLS", opens to the source with links: the Open Food Facts or USDA page (barcode or FDC id, when it was fetched), which nutrients came from the label, and the similar BLS food that gave the rest (or that none was chosen, so the rest has no data); for a BLS food its code, German name, the food page with each value's provenance and the BLS dataset; for a portion its recipe; saved items and manual entries say the values are the user's own. **The serving first** (owner's ask, 2026-10-21, after "Per 100 g first"): the pages now open on what was eaten ("22 g", or "Eaten" without a known weight): amounts eaten, energy with its share of the daily energy, the make-up bar, and each nutrient's share of the daily reference intake, as on a label or the recipe page. "Per 100 g" (with a known weight) and "Your day" stay as the other two choices. **Source letters**: every nutrient row has small letters for where its value comes from: B the BLS, O Open Food Facts, U USDA, E entered by the user (saved item or by hand); a product's values borrowed from its similar BLS food count as B, a recipe portion's as its ingredients', and a meal shows every source that gave a value. The folded "Source" line at the top stays. Routes `#/meal/<entry id>` (the diary's meal holding that entry) and `#/entry/<entry id>[/<ingredient>]`; logic in `src/logic/mealNutrients.ts`.
- **Calendar of day statuses** (built 2026-10-16): a month view, Monday first, with logged / partly / fasted / not logged (and filled in / left out, when used) per day (icon and label, not colour alone) and the count per status; tap a day to open it in the diary, which links back to the calendar. Unlogged days matter for the model, so finding and fixing them fast is worth more here than in other apps.
- **Fasting timer** (built 2026-10-21): "Fasting 31 h" on Home, from the last meal's time. Information only, no rewards for longer fasts. Part of the ketosis estimate (see "Ketosis estimate during fasts"), which adds the likely phase to the same line.

**UX principles**:

- One primary action per screen; the log button reachable with the thumb.
- Status is never shown by colour alone: icons or labels too.
- Plain-language labels first, units and numbers on demand.
- Undo instead of confirmation dialogs for everyday actions.
- Fast: the app opens to a usable dashboard in under a second after the first load.
- Calm by default: no streaks, no guilt messages, notifications off unless enabled.
- Accessible: good contrast, scalable text, large touch targets, dark mode.

## Nutrient wiki

Each nutrient has a short, sourced page that explains why it matters, what realistically happens when it runs low or too high, and which cheap, simple foods supply it.

Per nutrient (one Markdown file in `content/wiki/`):

- **What it does**: 2–3 sentences.
- **When it runs low**: realistic, typical effects and roughly how long stores last; no alarmism.
- **Too much**: the upper limit and what overdoing it looks like.
- **How the app models it**: tank or rolling average, absorption rule, notes such as "sun, not food, is the main source".
- **Good, cheap, simple sources**: a short curated list, plus a list computed live from the BLS (richest per 100 g and per typical portion).
- **Sources**: links, e.g. NIH Office of Dietary Supplements fact sheets, DGE, EFSA.

Content is drafted once from reputable sources, cited, and reviewed by the user; it is static content in the repo, not generated at runtime. It is general education, not medical advice, and says so once on the wiki's front page.

**Group pages** (decided 2026-10-18): each nutrient group (protein and amino acids, fats, carbohydrates, vitamins, minerals) has a one-page explanation in a pop-up, opened from a small ⓘ next to the group's heading on Home ("By type"), on the food page (the nutrient table is split into the same groups) and from "About …" on each nutrient's "What it does" card. It says what the group is, which ones the body can make, where they come from (animal, plant or both) and what changes absorption, with sources listed at the end. Comparisons are computed, not written: the amino acid make-up of grain, legume, nut and animal protein (median per g protein over BLS foods, as % of the WHO 2007 adult requirement pattern, ↓ below 100 %), the fatty acid shares of common fats (BLS), store durations and cooking losses (from `model/`). Each essential amino acid also has a one-line role, shown on the group page and its nutrient page. Texts: `src/i18n/groupInfo.en.ts`.

## How it works: transparency and sources

Owner's request (2026-10-20, not built yet): trust comes from being able to look underneath. A user who wants to dig deeper can see how every number is calculated, where its data comes from and what the research says, including how exact it can be. Nothing of this is shown by default: the everyday screens stay as they are, and the detail opens only when the user asks for it, from where they would expect it.

**Where it opens** (a small ⓘ or "How is this calculated?" link next to the number, never a block of text):

- Home: a line, a store card, the energy gauge.
- The nutrient page (next to "How ToFoo models it"), the food page's nutrient table, a meal or day in the diary, the weekly look-back.
- Assistant cards: where each food's values came from (BLS, Open Food Facts, USDA, built from ingredients, or an estimate).
- Settings → About: the full reference, readable front to back.

**What it shows**, in layers, plain words first and details folded:

1. **One-paragraph answer**: what the number means and how it is worked out, e.g. "the share of your daily need you absorbed on average over the last 7 finished days".
2. **The calculation for this number**: each entry that contributed, from amount eaten → after cooking and storage losses → absorbed, the sum, the need it is compared with, and the result, with the low and high run next to the central one. Missing values are listed as missing, not hidden.
3. **Where the data comes from**: per food, the database, version and code (e.g. BLS 4.0 C131000) and the BLS provenance of the value (analysed, calculated, taken from another table, estimated).
4. **What the research says**: every parameter used (absorption, retention, store size, requirement, upper limit, sun) with its source, link, low/central/high range and confidence (high, medium, low, assumption), and the open question when it is an assumption.
5. **How exact this can be**: per nutrient, how far a food log can be trusted (good, rough, or a blind spot the log cannot see, such as iodine from bakery salt, vitamin D from sun, selenium missing from the BLS, iron and B12 status), what drives the error, and which blood test helps where one exists. Based on the accuracy review of 2026-10-20; its proposals are still with the owner, so this layer explains and does not change any status.

**Rules for the content**:

- Generated from the same data the model uses (`model/*.ts`, the BLS provenance codes, the log), so the explanation can never disagree with the number. Only the prose is written by hand, with sources, like the nutrient wiki.
- Honest about limits: say what is an assumption, what is unknown and what the app cannot see.
- Works offline; all text through `t()`; links to sources open outside the app only when tapped.
- Builds on what exists: "How ToFoo models it" on the nutrient page, "How exact is this?" on entries, the group info pop-ups, About and data sources, and the planned nutrient wiki (which explains what a nutrient does; this explains how the app calculates it). They should end up as one consistent place per nutrient rather than more scattered pop-ups.

## Motivation and gamification

A light layer of rewards makes regular use feel good, rewarding logging, cooking, variety and nutrients in range, never eating less.

- **Logging chain**: counts days with any status, so fasting days count the same as eating days. One grace day per week keeps a single forgotten day from breaking it. A broken chain shows no guilt message, only the new start and the personal best.
- **Achievements**, e.g. first recipe, first batch, ten recipes; first time a tank reaches the green zone; all gauges green for a day, then a week; all essential amino acids covered in a day; a new ingredient tried; ten different food groups in a week; first backup saved.
- **Levels**: experience points from consistent logging, new recipes and gaps closed; a level number and a cosmetic title, nothing more.
- **Nutrient codex**: each nutrient's wiki entry starts greyed out and "unlocks" the first time it reaches the green zone. Collecting doubles as learning.
- **Satisfying feedback**: gauges animate as they fill after a log, a short burst when a gauge turns green, haptic tap on Android. Respects the system's reduced-motion setting.
- **Weekly recap card**: which gaps closed, which tank improved most, one suggestion for the next batch. Built on its own as the weekly look-back (see "Reviewing the past").

Guardrails: no rewards for fewer calories, longer fasts, weight change or overshooting a nutrient; no countdowns, loss threats or nagging notifications; every element can be switched off.

## Settings and feature toggles

Optional features are modules with an on/off switch, so the app can be tuned between calm and detailed without code changes.

| Toggle | Default | Effect |
| --- | --- | --- |
| Forecasts | On | "Runs low in \~6 weeks" on gauges |
| Notifications | Off | Reminders: log yesterday, tank getting low, backup due |
| Uncertainty ranges | On | Show ranges, or central value only |
| Absorption modelling | On | Off = raw intake (for comparison) |
| Cooking/storage losses | On | Off = no retention factors |
| Vitamin D from sun | On | Include synthesis estimate |
| "Best next batch" suggestion | On (v2) | Recipe ranking on the dashboard |
| Visible nutrients | All | Opens the nutrient visibility page |
| Advanced numbers | Off | Show units, parameter values, sources inline |
| AI assistant | Off | Log meals by chatting with photos and text (needs your API key) |
| Open Food Facts lookup | Off | Log packaged products by barcode (sends only the barcode) |
| USDA FoodData Central | Off | Search the US food database by name (sends only the search words) |
| Find products by name | On | With the assistant and Open Food Facts on: find a product from a front-of-pack photo via web search on openfoodfacts.org (through Anthropic) |
| Journal | On | Free-text entries at any time: pen button on Home, diary, assistant |
| Sleep | Off | Sleep and wake times: buttons, shortcuts, morning question |
| Activity | Off | Simple activity log; outdoor activity feeds the sun estimate |
| Water | Off | Plain water with one tap or via the assistant, plus water in foods, against the DGE guide value |
| Shopping list | On | A list to take shopping, offline: by hand, from a recipe's ingredients for N portions, or through the assistant |
| At home | On | What was bought and is at home, by place; one-tap logging, amounts counted down from the log, running low → shopping list |
| Save assistant chats | On | Keep each assistant chat on the phone to share as a file (not in backups) |
| Automatic backups | On | A full backup on the phone once a day and before a restore or a storage upgrade; switched in Settings → Backup |
| Backup reminder | On | A note on Home when the last saved backup file is older than N days; switched in Settings → Backup |
| Insights | Off | With the assistant on: look for patterns across journal, food, sleep and activity (sends the journal text to Anthropic) |
| Recipe ideas | Off | With the assistant on: recipe suggestions and improvements for your gaps and preferences, asked for in the assistant chat (sends nutrient statuses, recipe and food names, excluded foods and your preferences text to Anthropic when you ask) |
| Ketosis estimate | Off | During a fast: how far toward ketosis you probably are, from fasting studies, as a phase and a range; optional measured ketone values |

Settings also hold the profile, starting-level choice, salt defaults, meal window, rolling-average window, and backup options. Features are implemented behind one feature-flag module so new ones get a toggle by default.

**Nutrient visibility page**: all nutrients in a collapsible tree, e.g. Macronutrients › Protein › Essential amino acids › Lysine, or Minerals › Trace elements › Iodine. Every level has a show/hide switch: all, a group, a subgroup, or a single nutrient. Hiding affects display only; hidden nutrients are still modelled and still trigger "too high" warnings if that setting is on.

**Gamification** has its own on/off switch and per-element switches (see Motivation).

## Data storage, backup and privacy

All personal data stays on the phone in IndexedDB; a one-tap export file is the backup, and nothing personal ever goes into the public repo.

- **Storage**: recipes, batches, freezer stock, log, journal, sleep and activity, the shopping list, profile, settings in IndexedDB, behind a repository layer (so sync can be added in v4). Request persistent storage from the browser so Android does not clear it.
- **Schema versioning**: every stored record has a schema version; migrations run on app start and are unit-tested.
- **Saved assistant chats** are kept in IndexedDB too, but are not part of backups: they are logs for checking what the assistant did, and with photos they can be large (see AI assistant logging).
- **Backup**: "Export everything" writes one JSON file in the exchange format (`type: backup`) via the Android share sheet or download. "Import backup" restores it with a preview. Saved portion sizes ("My bowl", 60 g) are part of backups since 2026-10-18; restoring an older backup without them keeps the sizes on the phone.
- **Automatic backups** (owner's request 2026-10-18, built 2026-10-18): Settings → Backup is the one place for everything about backups: export and import, automatic backups, and the reminder (its on/off switch and "remind me after N days without a backup file" moved there from the general settings). Optional module "Automatic backups", on by default.
  - Once a day (a few seconds after the app opens, or when it comes back to the foreground on a new day), right before a restore (in the same database transaction), and before an app update changes how data is stored (inside the database upgrade itself, so the copy is of the data as it was; one copy per update), the app saves a full backup by itself, in the same format as "Export everything". Nothing is saved before there is any data. It keeps the 5 newest (the number can be changed on the page); older ones are deleted. Each copy is read back like a restore right after start-up, and a copy that fails shows the problem in the list (and in the diagnostics log). Copies live in their own table and are not part of backups.
  - Settings → Backup lists them, newest first, with date, time, why it was saved (daily, before a restore, before an app update), size and counts (log entries, recipes, journal entries…), each with "Restore" (same preview and undo as an imported file) and "Save as file" (share sheet or download).
  - Limit said on the page: these copies are kept inside the app's own storage on the phone, so they protect against mistakes, a broken import or a faulty app update, but not against clearing Chrome's data for the app, uninstalling it or losing the phone. A saved file (or, later, an opt-in copy somewhere else, see docs/OPEN_QUESTIONS.md) is still needed for that, so only a saved file resets the reminder ("Save as file" on an automatic copy counts, as of that copy's day).
  - Reminder: it has its own card on Home above the one-at-a-time questions (yesterday, blood-test hints, profile), so they no longer hide it; it stays until a backup file is saved or "Later" is tapped (hides it for 3 days). The Backup page always shows when the last file was saved and the newest automatic backup.
- **Model is recomputable**: tank levels are derived from the log and parameters, not stored as truth, so a parameter update or bug fix recalculates history correctly. Cache results for speed.
- **Privacy**: no analytics, no third-party requests in v1 except loading the app itself. Online features are opt-in and clearly marked: the Open Food Facts lookup sends only the barcode; USDA FoodData Central only the search words. The AI assistant is opt-in, and sends the photos and messages of an assistant conversation (plus the matching BLS search results) to Anthropic, and nothing else; its product web searches run at Anthropic, limited to openfoodfacts.org. Insights (opt-in) send journal entries and data summaries to Anthropic only when the user asks for an analysis. Recipe ideas (opt-in) send nutrient statuses, recipe and recent food names, stock and the preferences text to Anthropic only when the user asks for ideas.
- **CSV export** (later, nice to have): daily intake per nutrient and the diary as CSV, for analysis in Excel. The JSON backup remains the backup.
- **Phone health data** (later, low priority): the phone already tracks things like weight, activity, steps and (with bedtime or sleep detection, or a watch) sleep, but a PWA in Chrome cannot read Health Connect. Options to look at: importing a Health Connect / Google Fit export file, or a small native companion.
- **Secrets**: any future API key is entered in the app and stored only on the device, never in the repo.

## Roadmap

v1 is the smallest app that is useful every day; each later version adds to the same data model without rewrites. Each version ends when the user has used it for real and is happy with it.

**v1 — Daily use** (built 2026-10-15; done once used for real)

- [x] BLS pipeline and bundled data, attribution page
- [x] Profile, DGE reference values, parameter file with sources
- [x] Recipes, batches with storage plans, freezer stock
- [x] Logging: freezer portion, BLS food or dish, manual entry; day status; supplements
- [x] Nutrient model: tanks, rolling averages, absorption rules, retention, upper limits, starting levels, uncertainty ranges
- [x] Vitamin D sun estimate (manual outdoor routine)
- [x] Dashboard with gauges, detail view, "foods that fill your gaps" row, fasting mode
- [x] Settings, feature toggles, nutrient visibility page, food exclusions, low-friction onboarding
- [x] Export/import backup; installable PWA; deploy to GitHub Pages

**v2 — Planning**

- [x] AI assistant logging: chat with photos and text, BLS foods, confirm card, user's own API key (built 2026-10-16, first real tests passed)
- [ ] QR export/import for recipes; exchange-format paste import
- [ ] Claude helper project instructions
- [ ] Nutrient wiki; gamification basics (logging chain, achievements, fill animations, nutrient codex)
- [ ] Forecasts, "best next batch" ranking, recipe preview

**v3 — More data**

- [x] USDA FoodData Central search by name, also as an assistant tool (built 2026-10-17)
- [x] Barcode (Open Food Facts), also as an assistant tool (built 2026-10-16)
- [x] Packaged product from a front-of-pack photo in the assistant, via web search on openfoodfacts.org (built 2026-10-17)
- [ ] Label-photo reading; Open Food Facts name search on the log screen (blocked: no browser-usable search API)
- [x] Bulk photo import: many photos at once, each meal logged at its photo's capture time (built 2026-10-17)
- [ ] Blood-test calibration; freezer overview with shelf life per recipe
- [ ] Optional location-history import for sun exposure

**v4 — Beyond the phone**

- [ ] Desktop layout
- [ ] Multi-device sync

**Feature review 2026-10-16** (comparison with Cronometer, MyFitnessPal, Yazio, Paprika and others; owner's decisions). Needed, in no fixed order yet:

- [x] Cooked weight per batch, log portions by grams (built 2026-10-18)
- [x] Change a dish's ingredients when logging it, or for a whole pot (built 2026-10-18)
- [x] Swap preview in the recipe editor: what each change does to one portion, before saving (built 2026-10-19)
- [x] Repeat a past meal; favourite foods; home-screen shortcuts (built 2026-10-16)
- [x] Day and range nutrient breakdown; calendar of day statuses (built 2026-10-16)
- [x] Edit a logged entry, including replacing its food by search or barcode (built 2026-10-17)
- [x] Trends and weekly look-back: a screen per week with the recap, 8-week bars per nutrient and tracker, and a next-batch suggestion (built 2026-10-19)
- [x] Water: plain water with one tap or through the assistant, water in foods from the BLS, against the DGE guide value (built 2026-10-17)
- [ ] Nice to have: "eat soon" flag for fridge portions (needs a shelf-life source)

**Journal, sleep and activity** (owner's request 2026-10-17), in this order:

- [x] Journal: free-text entries at any time, in the diary, also through the assistant and voice (replaces day notes) (built 2026-10-17)
- [x] Sleep: "Going to sleep" / "I'm up" button and shortcut, morning question, diary, assistant (built 2026-10-17)
- [x] Activity: simple log (what, when, how long, how hard, outside); outdoor time feeds the sun estimate (built 2026-10-17)
- [x] Insights: the assistant looks for patterns across journal, food, sleep, activity and water, numbers computed by the app (built 2026-10-18)

**AI recipe ideas** (owner's idea 2026-10-17; built after Insights, owner's decision):

- [x] One assistant from Home for everything, answers with several cards as pages with comments, accept per page and a summary (built 2026-10-18)
- [x] Recipe ideas from the assistant: cards with a reason line and the app's own portion numbers, save to recipes; cooking preferences text; exclusions as a hard filter; improve an existing recipe (built 2026-10-18)
- [ ] Later: a snack for today, ideas from a fridge photo, a shopping list from an idea, "Not for me" adding to the preferences, Insights questions in the same chat

**Later, no version yet**:

- [x] Shopping list: by hand, from a recipe for N portions, through the assistant; offline, sorted by shop section, tick off and clear (owner's request 2026-10-19, built 2026-10-19)
- [ ] Duplicate a recipe; scale a recipe when cooking (last)
- [ ] CSV export
- [x] Automatic backups: up to 5 kept on the phone, listed in Settings → Backup with restore and "Save as file"; the reminder moves there (owner's request 2026-10-18, built 2026-10-18, see "Data storage, backup and privacy")
- [x] "At home": what was bought, by fridge, freezer, cupboard and spices; one-tap logging, amounts counted down from the log, running low onto the shopping list, put the basket away, assistant cards (owner's idea 2026-10-18, decided and built 2026-10-21, see "At home")
- [x] Ketosis estimate during fasts (built 2026-10-21, measured values still open; owner's request 2026-10-18): optional; phase and BHB range by hours since the last meal from fasting studies, shifted by carbohydrate in the last meal, early exercise, sex and BMI; optional measured blood, breath or urine values, also through the assistant; see "Ketosis estimate during fasts"
- [ ] Phone health data (Health Connect), low priority; the route to automatic sleep times and steps
- [ ] Energy in and out (calorie balance; the personal energy target exists since 2026-10-17, activity energy not yet): would be nice in one app since it overlaps with nutrient tracking, but the focus stays on nutrients, not weight loss or gain. Only if it can be added cleanly, as an optional feature that keeps the gamification guardrails (no rewards for eating less).
- [ ] **Research: how long the body copes without each nutrient** (owner's question 2026-10-20, parked; research first, no app change decided). Per nutrient, from studies: how long body stores or pools last with no intake (e.g. vitamin C depletion studies, thiamine), what shows first and how gradually (no hard cutoff), and how often a check makes sense (e.g. ferritin for iron). Could later feed the nutrient pages, the "lasts" figures beyond the six stores, and when Home should warn; every number needs a source in `model/` before it is used.
- [ ] **How it works: transparency and sources** (owner's request 2026-10-20): "How is this calculated?" from every number, with the calculation, data origin, sources and how exact it can be, hidden until asked for; see "How it works: transparency and sources".
- [ ] Keep in mind, not needed now: user-set target per nutrient (e.g. from a doctor), clearly marked as user-set. The DGE-derived targets stay as they are.

**Not planned**: social features, community recipes, coaching, ads (one user, privacy, calm by default).

## Working agreements for Claude Code

Claude Code builds v1 in small, reviewable steps, never invents physiological numbers, and keeps this spec and an open-questions list up to date.

1. **First session**: read this spec (saved in the repo as `docs/SPEC.md`), inspect the BLS zip, then propose a short v1 plan and folder structure before writing much code. Create `CLAUDE.md` with project conventions.
2. **Numbers need sources**: every physiological parameter (absorption, capacity, retention, requirements, ULs, sun synthesis) lives in the parameter/reference files with a citation, a value range (low/central/high) and a confidence note. If no good source is found, mark it as an assumption and add it to `docs/OPEN_QUESTIONS.md`; never hard-code a guess silently.
3. **Model is pure and tested**: the nutrient model is plain functions with no UI or storage, covered by unit tests, including the double-counting rule and saturation for B12.
4. **Small steps**: one feature per branch or pull request, with a short description of what changed and how to try it on the phone.
5. **Keep the user in the loop** on choices that change behaviour (framework, which nutrients are tanks, default parameter values): propose, explain briefly, let the user decide.
6. **Mobile-first checks**: every UI change is checked at phone width before it is called done.
7. **Docs stay current**: update `docs/SPEC.md` when a decision changes, and keep the exchange-format docs in sync with the code.

## Open questions

None of these block starting v1; they get answered while building. The living list with all assumptions and values to verify is docs/OPEN_QUESTIONS.md.

- [x] UI framework: React.
- [ ] Exact list of tank vs rolling-average nutrients, and which nutrients appear on the dashboard by default. *Proposal in place (see docs/OPEN_QUESTIONS.md); all nutrients visible by default.*
- [x] Does BLS 4.0 split heme and non-heme iron, and does it contain phytate? *No to both: estimated from the food group.* BLS 4.0 also has no selenium (not tracked in v1).
- [ ] Fat threshold per meal for fat-soluble vitamin absorption: find a citable value. *5 g used as an assumption (Roodenburg 2000: 3 g enough for carotenes).*
- [x] Retention factors: USDA Table of Nutrient Retention Factors, Release 6, as class averages.
- [x] Vitamin D synthesis model: clear-sky UV index from solar elevation (Madronich 2007), MED-based yield (Holick 2004), elevation ramp for the "vitamin D winter" (Webb 1988). Several factors are assumptions.
- [ ] QR size: confirm a typical recipe fits a comfortably scannable code; otherwise shorten the payload format.
