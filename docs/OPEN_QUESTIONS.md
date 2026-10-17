# Open questions

Questions and assumptions that need an answer or a better source. Each model value in `model/*.ts` marked `confidence: 'assumption'` has an entry here. Tick an item when it is resolved, and note the decision in `docs/SPEC.md` if it changes behaviour.

## Decided

- [x] **UI framework:** React (2026-10-15). The bundled data dominates download size, so Svelte's smaller runtime wouldn't matter much.
- [x] **Heme/non-heme iron and phytate in BLS 4.0:** neither is present. Both are estimated from the food group.
- [x] **Selenium:** BLS 4.0 has no selenium. Not tracked in v1; revisit with the USDA lookup in v3 (DGE: 70 µg men, 60 µg women).
- [x] **Food names:** English is the primary display and search language; German is searchable too and shown second.
- [x] **Code licence:** none; reuse welcome with credit to the repo (README).
- [x] **Retention factors:** USDA Table of Nutrient Retention Factors, Release 6 (2007), percentiles per cooking method computed from the data file (`model/parameters.ts`). BLS cooked entries are preferred where they exist.
- [x] **Vitamin D synthesis model:** clear-sky UV index from solar elevation (Madronich 2007) × minutes × exposed skin, relative to the minimal erythema dose, yield per MED from Holick (2004), with a "vitamin D winter" ramp by solar elevation. Several factors are assumptions (below).

## For the user to decide (proposals in place)

- [ ] **Tank vs rolling average.** Proposed tanks: B12, vitamin A, vitamin D, iron, folate, iodine. Zinc is a rolling average (no mobilisable store). Everything else is rolling: 7-day window for energy, macronutrients, amino acids, B vitamins, sodium, potassium; 14-day window for vitamins C/E/K, calcium, magnesium, phosphorus, trace elements, essential fatty acids.
- [ ] **Default visible nutrients:** all (as in the spec). Chromium has weak evidence and might be hidden by default.
- [ ] **Status thresholds:** tanks low < 20 %, getting low < 40 %; rolling averages and slow-store balances low < 70 %, getting low < 90 % of the requirement.
- [ ] **Day status:** a past day with at least one entry counts as "logged" unless marked "partly logged". Today counts only once something is logged or it is marked fasted.

## Source check (2026-10-15)

With full internet access, the values were compared with the primary sources: the DGE reference value pages (all nutrients, 3rd edition 2025, plus erratum 1/2026), the EFSA UL overview (version 11, Aug 2025), PubMed abstracts of the cited studies, the IOM Dietary Reference Intakes (full text) and the USDA retention data file.

Resolved:

- [x] All DGE adult values now match the DGE tables, including energy for every age group and the derivation years.
- [x] **Iron for women:** 16 mg while menstruating, 14 mg after menopause (lower bioavailability), 11 mg without periods for other reasons. New optional profile question "Periods"; default by age (under 51: periods). Postmenopausal absorbed need modelled as 0.95 × 14/11 ≈ 1.21 mg.
- [x] **Fluoride:** DGE 2024 guide values for total intake, 3.5 mg (men) / 3.0 mg (women), replace the EFSA AI.
- [x] **Copper:** DGE 1.0–1.5 mg for everyone (not split by sex); lower end used. **Molybdenum:** DGE 50–100 µg; lower end used. **Chromium:** DGE still lists 30–100 µg.
- [x] **EFSA upper levels:** vitamin A 3000 µg (preformed), B6 12 mg, D 100 µg, E 300 mg, folic acid 1000 µg, calcium 2500 mg, zinc 25 mg, copper 5 mg, iodine 600 µg, molybdenum 0.6 mg, magnesium 250 mg (supplements), iron 40 mg and manganese 8 mg (safe levels) all confirmed.
- [x] **Calcium curve (Heaney 1990):** consistent with the abstract (64 % at 15 mg, 28.6 % at 500 mg); study range 15–500 mg.
- [x] **B12:** stores 2–3 mg (was 3 mg central, up to 5), per-meal cap 1.5 µg (was 2 µg), 50 % assumed absorption, ~1 % passive (IOM 1998).
- [x] **Folate store** 12–28 mg (IOM); **vitamin A** liver ratio 0.03 (was 0.024), total:liver 1.1, 0.5 %/day loss (IOM); **iron store** ≈ 1 g in men (IOM).
- [x] **Iron modifiers:** tea much stronger than assumed (black tea −79–94 %, herbal teas and cocoa too; central factor now 0.3, was 0.4); coffee −39 % to −72 %; calcium −50–60 % at ≥ 165–300 mg; phytate −18 % to −82 % by dose. Only drinks (BLS groups N, M) count.
- [x] **Fat-soluble vitamins:** 3 g fat per meal is enough (Roodenburg 2000; was 5 g); without fat ≈ 0.76 (Dawson-Hughes 2015: +32 %, CI 11–52 %).
- [x] **Retention factors** recomputed from the USDA data file as 10th/50th/90th percentiles (e.g. boiled: vitamin C 80 %, thiamin 60 %, B6 65 %); reheating 95 % for vitamin C, folate, thiamin.
- [x] **Vitamin D winter:** synthesis now starts at 35° solar elevation (was 25°), matching Webb (1988): none October–March at 52°N.
- [x] **Vitamin C:** complete absorption up to 200 mg (Levine 1996), so the typical fraction is 1.0.
- [x] **Vitamin E absorption:** 75 % from a usual diet (EFSA 2015, Section 2.3.1; full text checked, was 50 %).
- [x] **Tea/coffee timing** (2026-10-15): drinks are logged on their own and act on meals around them: full effect from 30 min before the meal, tea halved at 1 h after (Ahmad Fuzi 2017), coffee full at 1 h after and none at 1 h before (Morck 1983), none from 2 h after.
- [x] **Iron status adaptation** (2026-10-15): non-heme absorption × 2.8 at serum ferritin 15 µg/L, × 1.55 at 30, × 1.2 at 45, × 1 from 60 (Dainty 2014, Table 2; Hallberg 1997). Tank level converted to ferritin at 8 mg per µg/L.

Still open:

- [ ] **Fluoride conflict:** EFSA's 2025 safe level (3.3 mg/day, all sources) is below the DGE guide value for men (3.5 mg). With food data only (no drinking water, no toothpaste), intake from BLS foods will normally stay well below both.
- [x] **Checked from texts supplied by the owner (2026-10-15):** EPA + DHA AI 250 mg (EFSA 2010), iron losses 0.95 / 1.34 mg (EFSA 2015), vitamin D absorption 80 % (EFSA 2016), vitamin E absorption 75 % (EFSA 2015), iodine body store 15–20 mg (NIH).
- [ ] **Not reachable for re-checking** (paper bodies, not abstracts): the vitamin C points at 500 / 1250 mg (Levine 1996), the Monsen formula and the Holick MED yield.
- [ ] **Salt 6 g and saturated fat 10 %:** from DGE position papers, not the reference value tables; not re-checked.
- [ ] **No USDA retention factors** for vitamins D, E, K, pantothenic acid and biotin: no cooking loss is modelled for them.

## Model assumptions (no good source yet)

- [ ] **Vitamin A tank size:** central liver concentration of 100 µg/g (range 20–300 µg/g; 20 µg/g is the IOM minimum).
- [ ] **Vitamin D tank size:** 60 days of the absorbed requirement (≈ the ~2-month half-life of stored vitamin D, Jones 2008).
- [ ] **Iron storage in women:** ~300 mg, from typical ferritin values × 8 mg per µg/L (IOM rule); no single source checked.
- [ ] **Fat effect on vitamins A, E, K:** measured for vitamin D3 only (Dawson-Hughes 2015); no data below 3 g fat.
- [ ] **Iron: phytate estimate** from grams of legumes/nuts/seeds, cereals and bread in the meal (full effect from 100 g, factor 0.35). **Calcium inhibition** as a linear ramp from 40 to 300 mg per meal. Fruit and rooibos teas are not counted as inhibitors (not studied).
- [ ] **Freezer storage loss** of cooked dishes on top of reheating (central 5 % for vitamin C, folate, thiamin).
- [ ] **Vitamin D sun:** real-world factor 0.45 (clouds, body geometry), width of the elevation ramp (central 35°–45°; low 38°–48°, high 25°–40°, so early/late routines show a range instead of a flat 0), MED 300 J/m², default routine 15 min/day at noon, face and hands.
- [ ] **Tea/coffee timing:** full effect from 30 min before the meal and no effect from 2 h after are assumptions (only the 1-h points are measured).
- [ ] **Iron adaptation:** measured for total dietary iron, applied to non-heme only; heme absorption is not adapted. The low scenario (half the effect) is an assumption.
- [ ] **Uncertainty widths:** amounts ±5 % (A), ±25 % (B), ±50 % (C); BLS values ±0–30 % by provenance.
- [ ] **"Average" starting level** = tanks 60 % full.
- [ ] **Slow-store cut-off:** stores holding ≥ 100 days of the absorbed need are headlined by their 14-day balance, not their fill level (iron, B12, vitamin A, folate, iodine; not vitamin D).
- [ ] **Vitamin C** absorption at 3000 mg (extrapolated beyond Levine 1996).
- [ ] **Vitamin K typical absorption** (0.5): EFSA says an average cannot be estimated; only affects the absorbed amount shown.

## Engineering

- [ ] **Model speed:** the whole history is recomputed after each change (≈0.2 s per year of heavy logging on a desktop CPU). If it feels slow on the phone, move the model into a Web Worker and/or cache daily totals.
- [ ] **Search ranking** is tuned by feel (English first, plain foods before dishes, recent foods boosted). Refine after real use.
- [x] **"Good sources" lists** are now varied: one variant per BLS base food and per main name word (one liver, not ten). Dried herbs and spices still rank high per 100 g; a curated "cheap and simple" list comes with the wiki (v2).
- [x] **Black screen on navigation (Android Chrome 155, 2026-10-15):** `useEffect(() => window.scrollTo(0, 0))` returned scrollTo's result; newer Chrome returns a Promise there, React called it as the effect cleanup on the next screen change and the app unmounted. Found with the device diagnostics log (Settings → Diagnostics); fixed, and a test now rejects effects that return a plain expression.
- [ ] **Nutrient explanations** (`src/i18n/nutrientInfo.en.ts`): short general summaries; the NIH fact sheets they cite block automated access, so the wording was not compared line by line. Check against the sources.
- [ ] **AI assistant accuracy and cost:** the prompt and tools are untested on real meals. Try it on typical cases (a branded sweet, a bakery item, a restaurant dish shared from a pot), check how often the proposed grams need fixing and what a meal really costs per model (Settings → AI assistant → Usage and cost; compare once with the Anthropic console), then tune the prompt or the default model.
- [x] **AI assistant and branded foods:** with the Open Food Facts lookup on, the assistant can look products up by barcode (`lookup_barcode`; barcodes in photos are read on the phone). Without a barcode it still maps to the nearest generic BLS food.
- [ ] **Open Food Facts name search:** not usable from a browser app (checked 2026-10-16 in Chromium): the full-text service `search.openfoodfacts.org` rejects every cross-origin request ("Disallowed CORS origin"), and the legacy `/cgi/search.pl` and `/api/v2/search` answer 503 ("not available to anonymous users"). Product lookup by barcode (`/api/v3/product/<code>`) works with CORS. So on the log screen products are found by barcode first and by name only once saved on the phone. The AI assistant works around it since 2026-10-17: Anthropic's web search (server-side, limited to openfoodfacts.org) finds the product page, and its barcode goes through the normal lookup. Unverified against the live API so far: how well the search engine indexes Open Food Facts product pages for German products. Revisit if Open Food Facts opens its search to browsers; alternatives would be a bundled list of German products (large) or a small proxy (conflicts with "no server").
- [ ] **Open Food Facts anonymous access** (checked 2026-10-17): product reads by barcode (`/api/v3/product`) work anonymously from the browser with CORS, limited to 15 per minute per IP (the app stays under it). Search pages and the search API already answer 503 to anonymous users at busy times ("not available to anonymous users; registered users are not subject to request limits"). If Open Food Facts ever does the same for product reads, barcode lookups fail (the assistant falls back to generic BLS foods; products already logged stay on the phone). Options then: an optional Open Food Facts login in the settings, or the downloadable data dump for German products.
- [ ] **Open Food Facts data quality:** values are crowd-sourced. ToFoo drops impossible values (more than 100 g of a nutrient or more than 900 kcal per 100 g) and leaves vitamin A and folate out (labels mix units). EU "carbohydrate" on labels is available carbohydrate like BLS `CHO`; non-EU labels may include fibre.
- [ ] **USDA FoodData Central mapping** (built 2026-10-17): USDA nutrient numbers map to BLS ids in `src/foods/usda.ts`. Choices to check: available carbohydrate = USDA "by difference" − fibre (unknown for generic foods without measured fibre); BLS folate equivalents taken as USDA natural food folate, or USDA DFE for fortified foods (DFE counts folic acid × 1.7; the factor behind BLS folate equivalents was not checked, so fortified foods may differ slightly); USDA niacin is preformed niacin, not niacin equivalents, so the niacin gauge uses the similar BLS food or stays missing; linoleic acid and ALA use the totals (618, 619) when the cis isomers are missing. USDA values get the BLS provenance "taken from another database" (±15 %). Selenium is now available from USDA but still not tracked (no BLS values).
- [ ] **USDA API limits:** the shared `DEMO_KEY` allows 30 requests an hour and 50 a day per IP address (api.data.gov); a free personal key 1,000 an hour. Searches run only on a tap on the log screen and at most 3 per assistant tool call. The API's search result format was taken from its documentation and the SR Legacy download; check against a live response (the shared demo key was used up from the build machine on 2026-10-17).
- [ ] **Micronutrients borrowed from a similar BLS food** are per 100 g, not scaled to the product's own fat or sugar content; their uncertainty uses the BLS "taken over" provenance (±30 %). Check whether that is wide enough for very different products.

## Later versions

- [ ] **Shelf life per storage type** (fridge, freezer) for the "eat soon" flag and the freezer overview: find a citable food-safety source (e.g. BfR, USDA FSIS cold storage chart). Feature review 2026-10-16.
- [ ] **Water reference value:** take the DGE guide value for total water (drinks + food) with its source before adding the water gauge. Feature review 2026-10-16.
- [ ] **Insights and chance patterns:** with one person, a few weeks of data and many things to compare, some patterns will appear by chance. Decide before building Insights how the app guards against that: a minimum number of days per comparison, always showing the counts, and maybe a simple check computed by the app (for example, how often a pattern this strong shows up with the days shuffled). 2026-10-17.
- [ ] **Activity energy cost:** if energy burned is ever estimated, take the values from a sourced table (e.g. the Adult Compendium of Physical Activities, 2024 update) into `model/`, with ranges; not before the energy in and out feature. 2026-10-17.
- [ ] **Health Connect export:** check whether Android's Health Connect export file can be read in the browser, and which data it holds (sleep sessions, steps, exercise), as the route to automatic sleep times and steps without a native app. 2026-10-17.

- [ ] QR size: confirm a typical recipe fits a comfortably scannable code (v2).
