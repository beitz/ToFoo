# Open questions

Questions and assumptions that need an answer or a better source. Each model value in `model/*.ts` marked `confidence: 'assumption'` has an entry here. Tick an item when it is resolved, and note the decision in `docs/SPEC.md` if it changes behaviour.

## Decided

- [x] **UI framework:** React (2026-10-15). The bundled data dominates download size, so Svelte's smaller runtime wouldn't matter much.
- [x] **Heme/non-heme iron and phytate in BLS 4.0:** neither is present. Both are estimated from the food group.
- [x] **Selenium:** BLS 4.0 has no selenium. Not tracked in v1; revisit with the USDA lookup in v3.
- [x] **Food names:** English is the primary display and search language; German is searchable too and shown second.
- [x] **Code licence:** none; reuse welcome with credit to the repo (README).
- [x] **Retention factors:** USDA Table of Nutrient Retention Factors, Release 6 (2007), as class averages (`model/parameters.ts`). BLS cooked entries are preferred where they exist.
- [x] **Vitamin D synthesis model:** clear-sky UV index from solar elevation (Madronich 2007) × minutes × exposed skin, relative to the minimal erythema dose, yield per MED from Holick (2004), with a "vitamin D winter" ramp by solar elevation. Several factors are assumptions (below).

## For the user to decide (proposals in place)

- [ ] **Tank vs rolling average.** Proposed tanks: B12, vitamin A, vitamin D, iron, folate, iodine. Zinc is a rolling average (no mobilisable store). Everything else is rolling: 7-day window for energy, macronutrients, amino acids, B vitamins, sodium, potassium; 14-day window for vitamins C/E/K, calcium, magnesium, phosphorus, trace elements, essential fatty acids.
- [ ] **Default visible nutrients:** all (as in the spec). Chromium has weak evidence and might be hidden by default.
- [ ] **Status thresholds:** tanks low < 20 %, getting low < 40 %; rolling averages low < 70 %, getting low < 90 % of the requirement.
- [ ] **Day status:** a past day with at least one entry counts as "logged" unless marked "partly logged". Today counts only once something is logged or it is marked fasted.

## Values to verify against primary sources

During the first build session the build environment could not open dge.de, efsa.europa.eu or ods.od.nih.gov directly (network policy), so values were checked through web search results where possible. Everything marked "Verify" in `model/reference-values.ts` and `model/parameters.ts` still needs a check against the original table. Most important:

- [ ] DGE values for thiamin, riboflavin, niacin, vitamin K, pantothenic acid, biotin, folate, vitamin C, sodium, chloride, potassium, calcium, copper, protein, fibre, linoleic / α-linolenic acid, and the energy guide values outside the 25–50 age group.
- [ ] Iron for women: the 2024 DGE values are 14–16 mg while menstruating and 11 mg without. Modelled as 16 mg under 51 and 11 mg from 51. A profile question ("Do you menstruate?") would be more accurate.
- [ ] Fluoride: DGE revised it in 2024 (guide value for total intake); the exact adult values could not be confirmed, so EFSA's adequate intake is used. EFSA's 2025 fluoride UL update is also unconfirmed.
- [ ] Chromium: does DGE still list a value? EFSA (2014) found no adequate intake.
- [ ] EFSA 2024 upper levels: vitamin A (3000 µg preformed, retained?), iron (safe level 40 mg?), vitamin B6 (12 or 12.5 mg?).
- [ ] Calcium absorption curve: Heaney et al. (1990) coefficients (0.889 − 0.0964·ln load) were recalled, not confirmed.
- [ ] Non-heme iron formula: Monsen & Balintfy (1982), recalled, not confirmed.

## Model assumptions (no good source yet)

- [ ] **Vitamin A tank size:** central liver concentration of 100 µg/g (range 20–300 µg/g).
- [ ] **Vitamin D tank size:** 60 days of the absorbed requirement (range 30–120).
- [ ] **Fat threshold for fat-soluble vitamins:** 5 g fat per meal (range 3–10 g), and absorption at 0 g fat = 70 % (range 50–85 %).
- [ ] **Iron: phytate estimate** from grams of legumes/nuts/seeds, cereals and bread in the meal (full effect from 100 g, factor 0.5). **Calcium inhibition** as a linear ramp from 40 to 300 mg per meal.
- [ ] **Storage losses** for fridge and freezer-reheated portions (rough class averages).
- [ ] **Vitamin D sun:** real-world factor 0.45 (clouds, body geometry), elevation ramp 25°–45°, MED 300 J/m², default routine 15 min/day at noon, face and hands.
- [ ] **Uncertainty widths:** amounts ±5 % (A), ±25 % (B), ±50 % (C); BLS values ±0–30 % by provenance.
- [ ] **"Average" starting level** = tanks 60 % full.
- [ ] **Vitamin C** absorption at 3000 mg (extrapolated beyond Levine 1996).

## Later versions

- [ ] QR size: confirm a typical recipe fits a comfortably scannable code (v2).
