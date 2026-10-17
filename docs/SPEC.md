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

- **Tank nutrients** (store for weeks to years, e.g. B12, vitamin A, vitamin D, iron, likely folate, zinc, iodine): a level in absorbed units, filled by meals, drained by the daily absorbed requirement, capped by a capacity scaled by body weight.
- **Rolling-average nutrients** (stored for days or not at all, e.g. vitamin C, most B vitamins, potassium, magnesium, macronutrients, fibre, essential amino acids, essential fatty acids): average absorbed intake over a configurable window (default 7 and 14 days) against the requirement.
- **Slow stores are shown by their daily balance** (decided 2026-10-17): a store holding more than ~100 days of the absorbed need (iron, B12, vitamin A, folate, iodine; vitamin D at ~2 months stays a tank) barely moves within weeks, and its fill level mostly reflects the starting guess. Home and the status show the 14-day balance instead: absorbed (at moderate iron stores for iron) against the need, like a rolling average, so the log answers "does my diet cover this?". A food log cannot see how full such a store is, so the nutrient screen shows no fill percentage for it, only whether the store is gaining or shrinking (absorbed vs need). **Blood tests** (decided 2026-10-17): the user can enter a lab value on the nutrient screen; the latest one sets the store on its day, after which the store follows the log and the nutrient is shown as a tank again (fill level, trend, time out of the low zone). Only markers with a sourced conversion to a store amount are offered: so far ferritin for iron (8 mg storage iron per µg/L). Lab results are part of the profile and of backups. A food log cannot see a store's real level, so when a slow store's balance has been in the low zone for six weeks in a row (with something logged in each window), Home and the nutrient screen suggest checking it: a ferritin, vitamin B12 or folate blood test where one exists, otherwise a doctor.
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

- **Empty**: safest for someone who suspects poor intake. Slow stores (iron, B12, vitamin A, folate, iodine) don't use the starting level for display: they show their daily balance until a blood test is entered (see "Two kinds of nutrient"). For a tank, the nutrient screen says whether a store is filling or going down at the recent rate and, when it is low but filling, roughly how long until it leaves the low zone, and that the low reading comes from the empty start. A store with anything in it never reads "0 % full" (it shows "<1 %").
- **Average**: realistic for a typical diet; may be too optimistic.
- **Custom per nutrient**: for users with an idea of their status.
- **From blood test** (v3): most accurate, recalibrates tanks to measured values.

### Uncertainty

Every calculation runs three times: low, central and high parameter sets (absorption, retention, data confidence). The UI shows the central value with a range. The range widens with estimated food entries and, when "Fill in unlogged days" is on, with "not logged" days.

### Forecast (optional feature)

From recent average intake, estimate when each tank crosses into "low" or "too full". Switchable in settings.

## Recipes, batches and freezer stock

A recipe is entered once; each time it is cooked becomes a batch with a storage plan, and eating a portion is one tap that also updates freezer stock.

**Recipe**: name, ingredients (`source + version + code`, grams, preparation method), number of portions, optional notes and tags. Ingredient search is fast and fuzzy over the English and German BLS names (English weighted higher), with recently used ingredients first. Salt uses the profile default (iodised or not) unless overridden. Grams accept decimals, since the user weighs precisely.

**Batch**: one cooking of a recipe, with date and a storage plan. The default plan is remembered per recipe and per user, matching the usual workflow:

| Portion | Storage | Default |
| --- | --- | --- |
| 1 | Eaten fresh on cooking day | Yes |
| 1 | Fridge, eaten next day | Yes |
| Rest | Freezer, reheated later | Yes |

This split is the global default, but any split is possible: each recipe can store its own default plan (e.g. "all in the fridge, keeps a week", or "cook fresh each day" with no stored portions), and each batch can still be adjusted when it is cooked (e.g. 2 in the fridge). Each storage type maps to retention factors in the nutrient model.

**Cooked weight per batch** (decided 2026-10-16): the usual workflow is one large pot divided into portions, and every pot comes out slightly different. So each batch can record the weight of the cooked food (pot weighed full minus the empty pot's weight, which the app remembers), and portions can then be logged by grams ("350 g of the curry") as well as by portion. A batch without a cooked weight works as today, by portion.

**Changing a dish when logging it** (decided 2026-10-16): a logged portion of a recipe can differ from the recipe, e.g. this time 150 g tofu instead of 200 g beef. When logging, "Change ingredients" lets the user swap, remove, add or re-weigh ingredients for that entry only; the recipe and the batch stay as they are. The entry stores the changes, so the history stays recomputable. Changes can also apply to a whole batch when it is cooked ("this pot had tofu").

**Swap preview in the recipe editor** (decided 2026-10-16): while editing a recipe, show how a change moves the user's gaps, e.g. "adding 100 g spinach: iron gap 40 % → 65 % covered". This is the recipe preview (below) made live inside the editor, where the decision happens.

**Later, for other workflows** (feature review 2026-10-16, not needed by the owner now): duplicate a recipe to make a variant; scale a recipe when cooking a batch (e.g. 8 portions instead of 6, without editing the recipe); a shopping list for the next batch from the recipe's ingredients, with tick-offs and the Android share sheet. Shopping list first, scaling last.

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

- **Repeat a past meal**: "Log again" on a meal in the diary, or a tap under "Recent meals" on the log screen (the last three different meals with two or more items), logs it again now, with all its items, as an editable copy. Items keep their spacing (a tea half an hour after the meal stays half an hour after it, since timing matters for iron), with the last item at the current time. Recipe portions come from the batch's current stock; a batch that has run out is skipped and named in the message. One undo removes the whole copy.
- **Favourite foods**: pin BLS foods, packaged products and saved items used all the time (oats, a certain bread) with "Add to favourites" on the amount sheet, so they stay at the top of the log screen instead of dropping out of "Recent". Stored in the settings (and so in backups).
- **Home-screen shortcuts**: long-press the app icon for "Log meal" and "Start fast" (web manifest `shortcuts`). "Start fast" starts a fast today, with undo, and opens Home.

**Water** (decided 2026-10-16): drinks can be logged as water amounts with one tap (e.g. +250 ml), and the water in foods counts too (BLS has water content per food). Shown as an amount-only or rolling gauge against a DGE guide value for water; the reference value still needs to be taken from the DGE tables with a source.

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
- Model is selectable in the assistant settings (default the most capable; cheaper ones for lower cost). A meal costs roughly 5–15 cents with the default model and under a cent with the cheapest (estimate; check real usage in the Anthropic console).
- The conversation is not stored; only the confirmed log entries are.
- **Usage and cost**: every API answer reports its token counts (input, output, cache reads and writes, per model when a fallback answered) and its web searches. The app multiplies them by Anthropic's list prices (a dated table in `src/ai/pricing.ts`) and shows the running cost of the current chat and its last message under the conversation, plus today / last 30 days / all time in the assistant settings. Only token counts per day and model are stored (on the device, not in backups), so a price fix re-prices the past. It is an estimate: the exact bill is in the Anthropic console, which a normal API key cannot read.

**Privacy**: the feature is off until the user turns it on and enters a key. The settings screen says plainly that photos and messages go to Anthropic. Nothing is sent when the feature is off.

**Later steps**: Open Food Facts by brand name on the log screen once a browser-usable search exists (the assistant already finds products by name through web search); remembering corrections ("my bowl is 350 g") as portion helpers.

**Bulk photo import** (built 2026-10-17): take photos of what you eat, then log a day or two at once when there is time. In the same assistant chat, the user picks many photos (up to 20 per message) and adds a note, including meals with no photo ("pasta on Wednesday evening"). The app reads each photo's capture time on the phone from its EXIF data (`DateTimeOriginal`, with the time-zone offset when present) before scaling it down, sorts the photos oldest first and gives the assistant a line per photo with its number and time. When a photo has no capture time (some pickers and messaging apps strip EXIF), the app uses the file date and says so, or marks the time unknown when the file date is just the moment of picking; the thumbnails show which (≈ file date, – unknown). The assistant groups photos into meals by time and content (rather than a fixed time gap: yogurt in the morning and in the evening is two meals, ten BBQ photos are one), asks all its open questions in one numbered message with defaults, then proposes every meal at once. Each meal gets its own confirm card (numbered M1, M2, …) with the time it proposed, editable; each is logged on its own, and a correction replaces just its card. Each message also tells the assistant the current time, the day the chat was opened for, and which cards are logged.

**Voice input** (built 2026-10-17, opt-in setting "Voice input"): a microphone button in the assistant chat, for talking instead of typing, including while looking through the chosen photos in a full-screen viewer (tap a thumbnail; swipe or arrows to move, the mic stays at hand). The recording goes to OpenAI's transcription API (`gpt-4o-transcribe`) with the user's own OpenAI key, kept on the phone like the Anthropic key and out of backups; the text lands in the chat box to check and edit before sending. Why OpenAI: the Claude API takes no audio, the phone keyboard's dictation was unreliable for the owner (mishearing, no punctuation, often not starting), and on-device Whisper in the browser means a large download, slow transcription on a phone and weaker mixed German/English. Cost: about $0.006 per minute of speech. Nothing is sent until the user taps the microphone; recordings are not stored.

## Journal, sleep and activity

Food alone does not explain how the user feels, so a few low-friction records sit next to the food log, in one place, to look for patterns across all of them (owner's request, 2026-10-17). Each is an optional module with its own toggle, and none of them takes over Home: the food log and the gauges stay the main screen. Each can be logged by tapping and by telling the assistant ("slept from 1 to 8, walked 40 min to work, headache since noon"), which proposes the entries on a confirm card, as it does for meals. Logging stays a few seconds: no required fields, sensible defaults, times default to now.

**Journal** (decided 2026-10-17, replaces day notes): write anything at any time ("ate out, guessed amounts", "tired all afternoon", "headache since noon"), as many entries a day as wanted, each with its own time (now, editable). Plain text, no tags or categories to pick; the assistant reads the words later. Voice input works here as in the assistant chat. Entries appear in the diary at their time between meals, and are included in backups and the CSV export. This reverses the 2026-10-16 note "no symptom tracking or correlations": correlations are now wanted, done by Insights below. Maybe later: an optional one-tap "how do you feel" score (1–5) with an entry, which gives Insights a number to compare instead of only words.

**Sleep** (decided 2026-10-17): one record per night, when the user went to sleep and woke up; no sleep quality (owner's decision). Ways to log, fastest first:

1. "Going to sleep" and "I'm up" buttons, also as home-screen shortcuts (long-press the app icon), one tap each, with undo.
2. A morning question on Home when the app is first opened after waking: "Slept 23:40 to 07:10?", prefilled from the buttons or from the usual times; one tap to confirm, or adjust.
3. The assistant or the diary, for nights logged after the fact.

Automatic detection (face-down phone, being at home at night) is not possible in a web app: Chrome stops a page's motion sensors and location as soon as it is not on screen, so it would need the app open with the screen on all night. If automatic sleep times are wanted later, they come from Android itself (sleep sessions recorded by the phone's bedtime or sleep detection, a watch, or another app, in Health Connect) through the phone health data import (Later).

**Activity** (decided 2026-10-17): a simple log of what (walk, run, cycling, strength, other, or free text), when, how long, and roughly how hard (easy / moderate / hard). An activity marked "outside" can count toward the vitamin D sun estimate for that day, unless it is already part of the outdoor routine, so a walk is logged once for both. No steps (a web app cannot count them in the background), no GPS tracks, no social features. Energy burned is not estimated now; that belongs to the later energy in and out feature and needs a sourced table of activity energy costs. Can grow later, for example steps and workouts from Health Connect.

**Insights** (decided 2026-10-17, built last, once there are a few weeks of data): "Look for patterns" asks the assistant to compare the journal with food, nutrients, sleep, activity and day statuses over a chosen period, or to answer a question ("why am I tired on Mondays?"). Same rule as for meals: the AI chooses what to compare, the app computes the numbers. The model gets tools to read journal entries and to query the data (for example, days whose journal mentions a headache against the other days: sleep length, caffeine, a food the day before), and every number in its answer comes from those tools. Delayed effects (the day before, the last week) are part of what it compares. Answers are possible patterns with their counts ("headache on 4 of the 6 days after less than 6 h sleep, 3 of 25 otherwise"), never causes or medical advice: with one person and a few weeks of data many apparent patterns are chance, so each answer says how many days it rests on. The result is a chat, so the user can dig deeper ("show me those days") or stop at the summary. Runs only when asked, with the user's Anthropic key; it sends the journal text and the summaries the model asks for to Anthropic, which the setting says plainly.

## Exchange format, QR codes and the Claude helper

One versioned JSON format ("ToFoo exchange format") is used for QR codes, pasted entries, and backups, so every import path shares one parser and one validator.

**Format rules**:

- Top-level `format: "tofoo"`, `formatVersion`, and `type` (`recipe`, `logEntry`, `backup`).
- Recipes reference ingredients as `source + version + code + grams + preparation`, never copied nutrient values. Manual ingredients carry their own nutrient values and confidence.
- A JSON Schema file in the repo (`docs/exchange-format.schema.json`) plus a human-readable description (`docs/exchange-format.md`).
- Import always shows a preview and asks for confirmation; invalid input gives a clear error, never a silent partial import.

**QR codes on printed recipes** (v2): the QR encodes a link to the app with the recipe compressed into the URL fragment, e.g. `https://beitz.github.io/ToFoo/#import=<compressed recipe>`. Scanning with the normal phone camera opens the app and shows "Import Linsencurry, 6 portions?". The fragment is never sent to a server. The app has an "Export as QR" action per recipe (SVG and PNG, for the A4 recipe sheets). Claude Code verifies that a typical recipe (15–20 ingredients) stays within a comfortably scannable QR size.

**Sharing full recipes by QR**: viable within limits. A QR code holds at most about 3 KB, and printed codes scan reliably only well below that. Ingredients as codes plus grams are tiny; instruction text is what takes the space. So the payload is tiered: the data block (name, portions, ingredients, storage plan, shelf life) is always included; the instructions are added, compressed, when the result stays under a size budget (target about 1 KB); otherwise they are left out and the QR notes that the steps are on the printed sheet. Because ToFoo is a public web app, anyone can scan the code and open the recipe, with or without using ToFoo for tracking. The app reads only the fields it needs and ignores unknown ones, so the format can grow.

**Claude helper** (v2): instead of an AI API inside the app, a Claude Project (in claude.ai) holds the exchange-format description and instructions. The user posts photos, labels or a description of an unplanned meal; Claude returns a `logEntry` in the exchange format with confidence C, preferring BLS codes where a match exists. The user pastes it into the app. Because there is no standard recipe format on the web, importing a recipe from a website also goes through the helper (and the in-app assistant): paste the recipe text or link, get a `recipe` in the exchange format back, matched to BLS codes. It remains the no-API-key alternative to the in-app AI assistant (above). Claude Code writes the project instructions file (`docs/claude-helper-instructions.md`) once the format is stable.

## Dashboard and UX

The home screen answers "how am I doing, and what do I eat next?" at a glance, with logging one tap away; everything deeper sits behind a tap (progressive disclosure).

**Home screen, top to bottom**:

1. **Today** (compact since 2026-10-17): the header shows the date and how many entries were logged today. A round **+** button bottom right opens Log meal; a smaller moon button above it starts a fast (or ends the running one, with undo). A running fast shows as one line under the header. Freezer-stock chips for one-tap logging sit under the header once batches exist.
2. **Nutrient gauges** (the main content): energy and macronutrients first in one row, then one gauge per visible nutrient, sorted by urgency (low and too-high first). **One line per nutrient** (decided 2026-10-17, replaces the compact/detailed switch): status icon, name, a bar, the value and trend arrows. The bar shows the uncertainty range as a shaded band (solid up to the low scenario, shaded to the high one, a marker at the central value) when "Uncertainty ranges" is on, and a mark at 100 % of the need or of the upper limit; for stores the bar end is full. **Trend arrows**: how the shown value moved over the last 7 days, the same rule for every nutrient (each value already runs on its own timescale, its average window or its store). ↑ / ↓ count from how soon, at that rate, the value reaches the next status line: three within a week, two within a month, one slower or when no line lies ahead; → when it moves less than 2 points a week. Arrows are green when heading to a better status, amber when heading to a worse one, grey otherwise; the direction is always in the shape. The nutrient page states the trend in words. A small ⓘ button next to the heading shows how to read the bar, the words and the arrows on demand. **Readable at a glance** (decided 2026-10-17): the ⓘ next to the heading says how to read the numbers (plain percent = share of the daily need, on average lately; "full" = a store's fill level; "of max" = share of an upper limit), and limit gauges say "of max". **Grouping switch**: by status (default; collapsible headings "Too much – eat less of these", "Low – eat more of these", "A bit low", "Enough", the last collapsed by default), by type (vitamins, minerals, protein and amino acids, fats, carbohydrates; each heading counts what needs attention, e.g. "6 low · 2 getting low") or none (one list sorted by urgency). Open and closed headings are remembered.
3. **Foods that fill your gaps**: one horizontal row of single foods from the BLS, ranked by how many urgent gaps they close at once without pushing anything over its upper limit, respecting food exclusions. Tap a food for its nutrient profile.
4. **Best next batch** (once the recipe book has recipes): the same ranking applied to the user's own recipes. Hidden while the book is empty.

**Tap a gauge** to expand: history chart, forecast (if on), contributing foods, the wiki summary, a short explanation (what the nutrient does, what too little and too much mean, with source), and good sources from the BLS (varied: one food per BLS subgroup and main name word, e.g. one liver, one mushroom). "All foods, ranked" opens the full list: per portion or per 100 g, filter by name and food group, optional "one per kind of food", exclusions applied.

**Reviewing the past** (decided 2026-10-16, needed; the owner named this as what makes ToFoo feel lacking next to other apps):

- **Day and range breakdown** (built 2026-10-16): the full nutrient breakdown for one day, a week, a month or a chosen date range ("how was September?"), using the same gauges and percentages. It shows what was logged, nothing filled in: the average per day over the days that count in the model (logged and fasted days, and days without entries unless "Fill in unlogged days" is on; partly logged, filled-in and left-out days are not counted and are shown separately). Percentages are the absorbed amount against the absorbed need, as on Home, and intake against the limit for limits; nutrients with stores show the daily average here, not a fill level. The diary links to the day view and the calendar to the month. The stores view stays the main one on Home.
- **Trends and weekly look-back**: weekly averages and charts across nutrients, not only one nutrient's history. This is the "weekly recap card" (see Motivation), shipped on its own, without the rest of gamification.
- **Calendar of day statuses** (built 2026-10-16): a month view, Monday first, with logged / partly / fasted / not logged (and filled in / left out, when used) per day (icon and label, not colour alone) and the count per status; tap a day to open it in the diary, which links back to the calendar. Unlogged days matter for the model, so finding and fixing them fast is worth more here than in other apps.
- **Fasting timer** (nice to have): "fasted 31 h" on Home, from the last meal's time. Information only, no rewards for longer fasts.

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

## Motivation and gamification

A light layer of rewards makes regular use feel good, rewarding logging, cooking, variety and nutrients in range, never eating less.

- **Logging chain**: counts days with any status, so fasting days count the same as eating days. One grace day per week keeps a single forgotten day from breaking it. A broken chain shows no guilt message, only the new start and the personal best.
- **Achievements**, e.g. first recipe, first batch, ten recipes; first time a tank reaches the green zone; all gauges green for a day, then a week; all essential amino acids covered in a day; a new ingredient tried; ten different food groups in a week; first backup saved.
- **Levels**: experience points from consistent logging, new recipes and gaps closed; a level number and a cosmetic title, nothing more.
- **Nutrient codex**: each nutrient's wiki entry starts greyed out and "unlocks" the first time it reaches the green zone. Collecting doubles as learning.
- **Satisfying feedback**: gauges animate as they fill after a log, a short burst when a gauge turns green, haptic tap on Android. Respects the system's reduced-motion setting.
- **Weekly recap card**: which gaps closed, which tank improved most, one suggestion for the next batch.

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
| Journal | On | Free-text entries at any time, in the diary |
| Sleep | Off | Sleep and wake times: buttons, shortcuts, morning question |
| Activity | Off | Simple activity log; outdoor activity feeds the sun estimate |
| Insights | Off | With the assistant on: look for patterns across journal, food, sleep and activity (sends the journal text to Anthropic) |

Settings also hold the profile, starting-level choice, salt defaults, meal window, rolling-average window, and backup options. Features are implemented behind one feature-flag module so new ones get a toggle by default.

**Nutrient visibility page**: all nutrients in a collapsible tree, e.g. Macronutrients › Protein › Essential amino acids › Lysine, or Minerals › Trace elements › Iodine. Every level has a show/hide switch: all, a group, a subgroup, or a single nutrient. Hiding affects display only; hidden nutrients are still modelled and still trigger "too high" warnings if that setting is on.

**Gamification** has its own on/off switch and per-element switches (see Motivation).

## Data storage, backup and privacy

All personal data stays on the phone in IndexedDB; a one-tap export file is the backup, and nothing personal ever goes into the public repo.

- **Storage**: recipes, batches, freezer stock, log, journal, sleep and activity, profile, settings in IndexedDB, behind a repository layer (so sync can be added in v4). Request persistent storage from the browser so Android does not clear it.
- **Schema versioning**: every stored record has a schema version; migrations run on app start and are unit-tested.
- **Backup**: "Export everything" writes one JSON file in the exchange format (`type: backup`) via the Android share sheet or download. "Import backup" restores it with a preview. Optional reminder when the last backup is older than N days (default 14).
- **Model is recomputable**: tank levels are derived from the log and parameters, not stored as truth, so a parameter update or bug fix recalculates history correctly. Cache results for speed.
- **Privacy**: no analytics, no third-party requests in v1 except loading the app itself. Online features are opt-in and clearly marked: the Open Food Facts lookup sends only the barcode; USDA FoodData Central only the search words. The AI assistant is opt-in, and sends the photos and messages of an assistant conversation (plus the matching BLS search results) to Anthropic, and nothing else; its product web searches run at Anthropic, limited to openfoodfacts.org. Insights (opt-in) send journal entries and data summaries to Anthropic only when the user asks for an analysis.
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

- [ ] Cooked weight per batch, log portions by grams
- [ ] Change a dish's ingredients when logging it; swap preview in the recipe editor
- [x] Repeat a past meal; favourite foods; home-screen shortcuts (built 2026-10-16)
- [x] Day and range nutrient breakdown; calendar of day statuses (built 2026-10-16)
- [x] Edit a logged entry, including replacing its food by search or barcode (built 2026-10-17)
- [ ] Trends and weekly look-back
- [ ] Water
- [ ] Nice to have: fasting timer; "eat soon" flag for fridge portions (needs a shelf-life source)

**Journal, sleep and activity** (owner's request 2026-10-17), in this order:

- [ ] Journal: free-text entries at any time, in the diary, also through the assistant and voice (replaces day notes)
- [ ] Sleep: "Going to sleep" / "I'm up" buttons and shortcuts, morning question, assistant
- [ ] Activity: simple log (what, when, how long, how hard, outside); outdoor time feeds the sun estimate
- [ ] Insights: the assistant looks for patterns across journal, food, sleep and activity, numbers computed by the app

**Later, no version yet**:

- [ ] Shopping list for the next batch; duplicate a recipe; scale a recipe when cooking (last)
- [ ] CSV export
- [ ] Phone health data (Health Connect), low priority; the route to automatic sleep times and steps
- [ ] Energy in and out (calorie balance; the personal energy target exists since 2026-10-17, activity energy not yet): would be nice in one app since it overlaps with nutrient tracking, but the focus stays on nutrients, not weight loss or gain. Only if it can be added cleanly, as an optional feature that keeps the gamification guardrails (no rewards for eating less).
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
