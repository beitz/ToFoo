# ToFoo — Project Specification

Oct 14, 2026 · @Tobias Beitz

## Overview and goals

ToFoo is a personal nutrition app that tracks every nutrient the data allows (macronutrients, vitamins, minerals, essential amino acids, essential fatty acids) and estimates how full the body's stores are, so the user can plan the next batch-cooked dish to fill the gaps. It is built for one user first: someone who cooks one batch, freezes portions, usually eats one meal a day (OMAD) but not always, and wants to understand what the food actually does.

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

The BLS 4.0 is the primary food database, bundled with the app; USDA is fetched on demand as a backup; manual entry covers everything else.

| Source | Role | Access | Version |
| --- | --- | --- | --- |
| BLS 4.0 (Max Rubner-Institut) | Primary: \~7,140 foods incl. composite dishes, 138 nutrients | Bundled in the app, offline | v1 |
| Manual entry | Special products, label values, supplements | User input | v1 |
| USDA FoodData Central | Backup for foods missing in BLS | Online API with free key; fetched values saved locally | v3 |
| Open Food Facts | Barcode → product identification (macros only; map to nearest BLS entry for micros) | Online API | v3 |

**BLS pipeline** (a build-time script, not runtime):

1. Raw zip `BLS_4_0_2025_DE.zip` lives in `data/raw/`. Claude Code first inspects its actual format and documents it in `data/README.md`.
2. A script converts it to compact JSON (e.g. `public/data/bls-4.0.json`): food code, German name, food group, and the nutrients the app uses, with units.
3. Missing values stay explicitly missing (`null`), never zero. The UI shows when a food lacks data for a nutrient.
4. The output records its BLS version. Every recipe ingredient stores `source + version + code`, so a future BLS update can be migrated with a mapping instead of silently changing old recipes.

**Licence and attribution.** BLS is CC BY 4.0. The app has an About / Data sources page and the README has a line, both containing: Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 — Deutsche Nährstoffdatenbank. Karlsruhe. DOI: [10.25826/Data20251217-134202-0](https://doi.org/10.25826/Data20251217-134202-0), a link to [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and a note that the data was converted and abridged.

## User profile and reference values

Daily needs come from the DGE (D-A-CH) reference values, looked up by age group and sex and adjusted by body weight and activity where the science supports it. No field is required: the app works immediately with sensible defaults, and asks for details gently over time.

Profile inputs, grouped (all optional, all editable in settings):

| Group | Input | Default if not given | Used for |
| --- | --- | --- | --- |
| Body | Birth year (age computed automatically) | Adult age group (25–51) | DGE age group |
| Body | Sex | Not set: the safer value per nutrient (higher need, lower upper limit) | DGE reference values |
| Body | Body weight (kg), with history | 70 kg | Protein need, store capacity |
| Body | Height | Not used until set | Reserved for energy estimates |
| Body | Activity level (low / medium / high) | Medium | Energy, a few B vitamins |
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

## Nutrient model

Each meal's nutrients pass through cooking/storage losses and absorption, and land in a tank (long-storage nutrients) or a rolling average (short-storage nutrients), which is compared with the user's absorbed daily requirement.

### Two kinds of nutrient

- **Tank nutrients** (store for weeks to years, e.g. B12, vitamin A, vitamin D, iron, likely folate, zinc, iodine): a level in absorbed units, filled by meals, drained by the daily absorbed requirement, capped by a capacity scaled by body weight.
- **Rolling-average nutrients** (stored for days or not at all, e.g. vitamin C, most B vitamins, potassium, magnesium, macronutrients, fibre, essential amino acids, essential fatty acids): average absorbed intake over a configurable window (default 7 and 14 days) against the requirement.
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

- **Empty**: safest for someone who suspects poor intake; may show alarm for a while.
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

**Freezer stock**: the app tracks remaining portions per batch, with cook date. Logging a portion from the dashboard ("Linsencurry · 3 left") removes it and applies the right storage losses. Manual corrections are allowed (portion thrown away, given away).

**Recipe preview** (v2): before cooking, show how eating this batch for a week would move each tank.

**Freezer overview** (v3): a view of everything in the freezer and fridge, with age per batch. Each recipe can store how long it keeps per storage type (fridge, freezer), also carried in the QR code, so the overview can flag portions to eat soon.

## Logging and confidence

Every log entry carries a confidence level, and every day has an explicit status, so the model knows the difference between "ate nothing" and "forgot to log".

**Ways to log**, fastest first:

1. Tap a freezer-stock portion on the dashboard.
2. Pick a single BLS food or composite dish (e.g. a salami pizza) and an amount; portion helpers ("1 pizza", "1 plate") with editable gram defaults.
3. Manual entry: free name plus whatever nutrients are known (from a label, a supplement).
4. Tell the AI assistant what you ate, by photo, text or both (optional, see below).
5. Paste an entry in the ToFoo exchange format (e.g. produced by the Claude helper, see below).
6. Later: barcode and label photo (v3).

**Time of entry**: a new entry assumes the meal was just finished, so the timestamp defaults to now. Date and time stay one tap away for logging after the fact. Any eating pattern is supported; OMAD is the optimised path, not a requirement.

**Confidence levels**:

| Level | Meaning | Example |
| --- | --- | --- |
| A · Measured | Database values, weighed amounts | Own recipe from BLS, grams weighed |
| B · Standard | Database values, estimated amount or generic dish | BLS salami pizza at work |
| C · Estimate | Approximation from description, photo or guess | Claude helper estimate, restaurant meal |

Confidence is shown as a small marker on entries and widens the uncertainty range in the model.

**Day status**: logged (complete), partly logged, fasted (nothing eaten), or not logged. Fasting is one tap: "Fasting since…" marks today and every following day as fasted until the next logged meal ends the fast, so multi-day water fasts need no daily input. During a fast the tanks drain as modelled. By default the log is taken as complete: a past day without entries counts as nothing eaten, so stores drain and averages drop (owner's decision, 2026-10-16: no assumed intake unless asked for). The optional "Fill in unlogged days" toggle (off by default) instead treats them as unknown: they are filled with recent intake (or the requirement when nothing is known yet), do not drain stores to zero, and widen the range. Rolling gauges with no known day in their window show "–" rather than a number. A past day with at least one entry counts as logged unless marked "partly logged"; drinks and supplements do not end a fast. The dashboard nudges gently when yesterday has no status (switchable).

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
2. Branded product databases (Open Food Facts via barcode or name, v3), with micronutrients borrowed from the nearest BLS food.
3. USDA FoodData Central (v3).
4. Built from ingredients: a dish not in any database (Korean hotpot at a restaurant) becomes several BLS ingredients with estimated grams.
5. Nearest-match guess: the closest BLS food, clearly marked.

**The core rule**: the AI only chooses foods and estimates amounts; it never supplies nutrient values. Every nutrient number still comes from a database (BLS in the first version), so an AI mistake shows up as a wrong portion or a wrong food, which the user sees and can fix on the confirm card, never as an invented vitamin value. This keeps rule "Every number has a source" intact.

**Confidence**: entries from the assistant are logged as C · Estimate by default; the assistant may suggest B when the food is certain and the amount comes from a label or a standard portion. Assumptions the assistant made ("assumed one bowl of broth") are shown on the confirm card.

**Why one model, not several voting**: models share the same blind spots (portion size, hidden fat), so several models tend to agree and be wrong together; a fourth model to break ties has no ground truth either. Restricting the AI to database foods, asking when unsure, and a quick human check catch more errors for a quarter of the cost.

**Technical shape**:

- The app talks to the Claude API directly from the browser with the user's own key (static app, no server). The key is stored only on the device (IndexedDB), never in backups or the repo.
- The model works through tools the app provides: `search_foods` (searches the bundled BLS locally and returns codes, names and macros per 100 g), and `propose_meal` (food codes, grams, preparation, assumptions). Questions to the user are plain chat messages. The app checks every proposed code exists in BLS and every amount is plausible before showing the card; otherwise it sends the error back to the model.
- Photos are scaled down on the phone before sending (long side ≤ 1568 px), which keeps cost and upload time low.
- Model is selectable in the assistant settings (default the most capable; cheaper ones for lower cost). A meal costs roughly 5–15 cents with the default model and under a cent with the cheapest (estimate; check real usage in the Anthropic console).
- The conversation is not stored; only the confirmed log entries are.
- **Usage and cost**: every API answer reports its token counts (input, output, cache reads and writes, per model when a fallback answered). The app multiplies them by Anthropic's list prices (a dated table in `src/ai/pricing.ts`) and shows the running cost of the current chat and its last message under the conversation, plus today / last 30 days / all time in the assistant settings. Only token counts per day and model are stored (on the device, not in backups), so a price fix re-prices the past. It is an estimate: the exact bill is in the Anthropic console, which a normal API key cannot read.

**Privacy**: the feature is off until the user turns it on and enters a key. The settings screen says plainly that photos and messages go to Anthropic. Nothing is sent when the feature is off.

**Later steps**: Open Food Facts lookup (by barcode in a photo or by brand name) and USDA as extra assistant tools (v3); remembering corrections ("my bowl is 350 g") as portion helpers.

**Bulk photo import** (later version, idea 2026-10-16): take a photo of everything eaten during the day, then log it all at once when there is time. The user picks many photos in one go; the app reads each photo's capture time from its EXIF data (`DateTimeOriginal`), groups photos taken close together into one meal, and runs each meal through the normal assistant flow, logged at that date and time. Each meal gets its own confirm card, so nothing is logged unchecked. When a photo has no capture time (some apps and pickers strip EXIF), the app falls back to the file date and shows that time as editable on the card.

## Exchange format, QR codes and the Claude helper

One versioned JSON format ("ToFoo exchange format") is used for QR codes, pasted entries, and backups, so every import path shares one parser and one validator.

**Format rules**:

- Top-level `format: "tofoo"`, `formatVersion`, and `type` (`recipe`, `logEntry`, `backup`).
- Recipes reference ingredients as `source + version + code + grams + preparation`, never copied nutrient values. Manual ingredients carry their own nutrient values and confidence.
- A JSON Schema file in the repo (`docs/exchange-format.schema.json`) plus a human-readable description (`docs/exchange-format.md`).
- Import always shows a preview and asks for confirmation; invalid input gives a clear error, never a silent partial import.

**QR codes on printed recipes** (v2): the QR encodes a link to the app with the recipe compressed into the URL fragment, e.g. `https://beitz.github.io/ToFoo/#import=<compressed recipe>`. Scanning with the normal phone camera opens the app and shows "Import Linsencurry, 6 portions?". The fragment is never sent to a server. The app has an "Export as QR" action per recipe (SVG and PNG, for the A4 recipe sheets). Claude Code verifies that a typical recipe (15–20 ingredients) stays within a comfortably scannable QR size.

**Sharing full recipes by QR**: viable within limits. A QR code holds at most about 3 KB, and printed codes scan reliably only well below that. Ingredients as codes plus grams are tiny; instruction text is what takes the space. So the payload is tiered: the data block (name, portions, ingredients, storage plan, shelf life) is always included; the instructions are added, compressed, when the result stays under a size budget (target about 1 KB); otherwise they are left out and the QR notes that the steps are on the printed sheet. Because ToFoo is a public web app, anyone can scan the code and open the recipe, with or without using ToFoo for tracking. The app reads only the fields it needs and ignores unknown ones, so the format can grow.

**Claude helper** (v2): instead of an AI API inside the app, a Claude Project (in claude.ai) holds the exchange-format description and instructions. The user posts photos, labels or a description of an unplanned meal; Claude returns a `logEntry` in the exchange format with confidence C, preferring BLS codes where a match exists. The user pastes it into the app. It remains the no-API-key alternative to the in-app AI assistant (above). Claude Code writes the project instructions file (`docs/claude-helper-instructions.md`) once the format is stable.

## Dashboard and UX

The home screen answers "how am I doing, and what do I eat next?" at a glance, with logging one tap away; everything deeper sits behind a tap (progressive disclosure).

**Home screen, top to bottom**:

1. **Today**: day status, a large "Log meal" button, and a "Fasting" button; freezer-stock chips for one-tap logging once batches exist.
2. **Nutrient gauges** (the main content): energy and macronutrients first in one row, then one gauge per visible nutrient, sorted by urgency (low and too-high first). Two layouts, switchable on the dashboard: compact (default; a dense two-column list with a thin bar per nutrient) and detailed (cards). Each gauge shows level, range and a status colour: fine / getting low / low / too high. Tank and rolling-average nutrients are visually distinct but look related.
3. **Foods that fill your gaps**: one horizontal row of single foods from the BLS, ranked by how many urgent gaps they close at once without pushing anything over its upper limit, respecting food exclusions. Tap a food for its nutrient profile.
4. **Best next batch** (once the recipe book has recipes): the same ranking applied to the user's own recipes. Hidden while the book is empty.

**Tap a gauge** to expand: history chart, forecast (if on), contributing foods, the wiki summary, a short explanation (what the nutrient does, what too little and too much mean, with source), and good sources from the BLS (varied: one food per BLS subgroup and main name word, e.g. one liver, one mushroom). "All foods, ranked" opens the full list: per portion or per 100 g, filter by name and food group, optional "one per kind of food", exclusions applied.

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

Settings also hold the profile, starting-level choice, salt defaults, meal window, rolling-average window, and backup options. Features are implemented behind one feature-flag module so new ones get a toggle by default.

**Nutrient visibility page**: all nutrients in a collapsible tree, e.g. Macronutrients › Protein › Essential amino acids › Lysine, or Minerals › Trace elements › Iodine. Every level has a show/hide switch: all, a group, a subgroup, or a single nutrient. Hiding affects display only; hidden nutrients are still modelled and still trigger "too high" warnings if that setting is on.

**Gamification** has its own on/off switch and per-element switches (see Motivation).

## Data storage, backup and privacy

All personal data stays on the phone in IndexedDB; a one-tap export file is the backup, and nothing personal ever goes into the public repo.

- **Storage**: recipes, batches, freezer stock, log, profile, settings in IndexedDB, behind a repository layer (so sync can be added in v4). Request persistent storage from the browser so Android does not clear it.
- **Schema versioning**: every stored record has a schema version; migrations run on app start and are unit-tested.
- **Backup**: "Export everything" writes one JSON file in the exchange format (`type: backup`) via the Android share sheet or download. "Import backup" restores it with a preview. Optional reminder when the last backup is older than N days (default 14).
- **Model is recomputable**: tank levels are derived from the log and parameters, not stored as truth, so a parameter update or bug fix recalculates history correctly. Cache results for speed.
- **Privacy**: no analytics, no third-party requests in v1 except loading the app itself. Later online features (USDA, Open Food Facts) are clearly marked and send only the search term or barcode. The AI assistant is opt-in, and sends the photos and messages of an assistant conversation (plus the matching BLS search results) to Anthropic, and nothing else.
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

- [ ] AI assistant logging: chat with photos and text, BLS foods, confirm card, user's own API key
- [ ] QR export/import for recipes; exchange-format paste import
- [ ] Claude helper project instructions
- [ ] Nutrient wiki; gamification basics (logging chain, achievements, fill animations, nutrient codex)
- [ ] Forecasts, "best next batch" ranking, recipe preview

**v3 — More data**

- [ ] USDA FoodData Central lookup
- [ ] Barcode (Open Food Facts) and label-photo reading, also as assistant tools
- [ ] Bulk photo import: many photos at once, each meal logged at its photo's capture time
- [ ] Blood-test calibration; freezer overview with shelf life per recipe
- [ ] Optional location-history import for sun exposure

**v4 — Beyond the phone**

- [ ] Desktop layout
- [ ] Multi-device sync

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
