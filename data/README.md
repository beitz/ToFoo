# Data

## `raw/BLS_4_0_2025_DE.zip`

The Bundeslebensmittelschlüssel (BLS) 4.0, the German national nutrient database, as downloaded from the Max Rubner-Institut. Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 — Deutsche Nährstoffdatenbank. Karlsruhe. DOI: [10.25826/Data20251217-134202-0](https://doi.org/10.25826/Data20251217-134202-0)

The zip is the source of truth. It is never edited; `npm run data` converts it into `public/data/bls-4.0.json` (generated, not committed).

### Contents

| File | Size | What it is |
| --- | --- | --- |
| `BLS_4_0_2025_DE/BLS_4_0_Daten_2025_DE.xlsx` | 14 MB | The food data. One sheet, `BLS_4_0_Daten_2025_DE`, 7,140 foods × 418 columns. |
| `BLS_4_0_2025_DE/BLS_4_0_Components_DE_EN.xlsx` | 22 KB | The 138 nutrients ("components"): code, German and English name, unit, group, and the formula for calculated ones. |
| `BLS_4_0_2025_DE/BLS_4_0_Dokumentation_DE.pdf` | 470 KB | 24-page documentation (German): structure, nutrient groups, provenance categories, formulas, terms of use. |

### Data sheet layout

- Row 1 is the header. Each following row is one food.
- Column 1 `BLS Code`: 7 characters, e.g. `C131000`. The leading letter is the main food group (see below).
- Column 2 `Lebensmittelbezeichnung`: German name. Column 3 `Food name`: English name. Every food has both.
- Then, for each of the 138 nutrients, three columns:
  - `<CODE> <German name> [<unit>/100g]`: the value per 100 g edible portion.
  - `<CODE> Datenherkunft`: where the value comes from (see provenance).
  - `<CODE> Referenz`: literature or database reference, or `-`.
- Last column `Hinweis`: free-text notes (e.g. "Enthält Maltitol (1 g/100g)").

### Values

| Cell content | Meaning | Converted to |
| --- | --- | --- |
| a number | value per 100 g | the number |
| `-` | no value | `null` (missing, never zero) |
| `<LOD`, `<LOQ`, `<LOD or <LOQ` | below the limit of detection / quantification | `"t"` (trace) |
| `TR` | trace | `"t"` |
| `0` with provenance "Logische Null" | a real zero (e.g. B12 in plants) | `0` |

Counts in BLS 4.0: ~110,000 missing cells, ~5,700 trace/below-detection cells across all 138 nutrients. Some calculated nutrients (energy, available carbohydrate, sugar, salt) are always present.

### Provenance ("Datenherkunft")

| BLS category | Code in JSON | Meaning (from the documentation) |
| --- | --- | --- |
| Analyse | `A` | Lab analysis by MRI or accredited labs |
| Rezeptberechnung | `R` | Calculated from the recipe's ingredients incl. cooking changes |
| Formelberechnung | `F` | Calculated by formula from other components |
| Musterberechnung | `M` | Pattern calculation (amino acids, fatty acids, fibre fractions relative to the total) |
| Nährstoffdatenbank | `D` | Taken from another database (EuroFIR, USDA) |
| Reskalierung | `S` | Rescaled |
| Übernommener Wert | `U` | Taken over from a similar food |
| Logische Null | `Z` | Logically zero |
| Literatur | `L` | Scientific literature |
| Aggregation | `G` | Aggregated from several literature values |
| Spuren | `T` | Traces |
| Labelangabe | `B` | Product label |
| Logische Annahme | `N` | Logical assumption |
| (none, `-`) | `-` | No value |

### Food groups (leading letter of the code)

The documentation says the leading letter marks the main food group but does not list the groups. These labels were derived by inspecting the foods under each letter:

| Letter | Group | Foods |
| --- | --- | --- |
| B | Bread and rolls | 186 |
| C | Cereals and cereal products | 231 |
| D | Cakes, pastries and biscuits | 466 |
| E | Eggs, pasta and dumplings | 104 |
| F | Fruit and fruit products | 275 |
| G | Vegetables | 560 |
| H | Legumes, nuts, seeds and plant-based alternatives | 142 |
| K | Potatoes and mushrooms | 157 |
| M | Milk and dairy products | 279 |
| N | Non-alcoholic beverages (incl. coffee, tea) | 114 |
| P | Alcoholic beverages | 119 |
| Q | Fats and oils | 65 |
| R | Spices, salt, condiments and additives | 97 |
| S | Sweets, sugar and ice cream | 253 |
| T | Fish and seafood | 520 |
| U | Meat | 685 |
| V | Poultry, game and offal | 462 |
| W | Sausages and cold cuts | 375 |
| X | Composite dishes: soups, sauces, savoury dishes | 1,165 |
| Y | Composite dishes: meat dishes, desserts, compotes | 885 |

### Notable gaps (relevant to the nutrient model)

- **No selenium.** BLS 4.0 has no selenium column. ToFoo estimates it from the UK table CoFID (below).
- **No heme / non-heme iron split** and **no phytate**. Both are estimated from the food group.
- Cooked forms are often separate foods (e.g. "Grüne Bohnen gedünstet"); composite dishes (X, Y) are recipe calculations that already include cooking losses.
- Salt: `R111000` Speisesalz (plain), `R114000` Speisesalz jodiert, `R113000` Speisesalz jodiert mit Fluorid. There is no fluoridated, non-iodised salt.

## Generated: `public/data/bls-4.0.json`

Produced by `scripts/build-bls.ts`; type definition in `src/foods/blsTypes.ts`. About 3 MB (1 MB gzipped), cached by the service worker for offline use.

```jsonc
{
  "format": "tofoo-bls", "formatVersion": 1,
  "source": "BLS", "version": "4.0",
  "attribution": "…", "licence": "CC BY 4.0 (…)",
  "provenanceCodes": { "A": "Analyse", … },
  "groups": { "B": { "en": "Bread and rolls", "de": "Brot und Kleingebäck" }, … },
  "nutrients": [ { "id": "ENERCC", "nameEn": "Energy (kilocalorie)", "nameDe": "…", "unit": "kcal" }, … ],
  "foods": [
    // [code, German name, English name, values per 100 g aligned with nutrients, provenance codes (one char per nutrient)]
    ["C131000", "Hafer ganzes Korn, roh", "Oat whole grain, raw", [343, 11.45, …], "FLLDFF…"]
  ]
}
```

Only the nutrients listed in `KEPT_NUTRIENTS` in the script are included (63 of 138: energy, macronutrients, all vitamins and minerals, the main fatty acids, essential amino acids plus cysteine and tyrosine). Units are BLS units per 100 g (note: vitamin B6 is in **µg**, copper and manganese in **µg**).

A 64th column, `SE` (selenium, µg), is added from CoFID (next section), with provenance code `C` and an entry in `extraSources` (attribution and licence).

## `raw/CoFID_2021.xlsx`: selenium

McCance and Widdowson's The Composition of Foods Integrated Dataset 2021 (CoFID), the UK national food composition table, as downloaded from [gov.uk](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid) (file `McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx`, renamed). Never edited.

> Public Health England (2021): McCance and Widdowson's The Composition of Foods Integrated Dataset 2021. Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

**Why CoFID.** BLS 4.0 has no selenium. Of the open European tables, CoFID has selenium for about 2,000 foods and a licence that allows adapting the data (OGL v3.0, with attribution). The Dutch NEVO may only be used unchanged (RIVM copyright notice), so it can't be matched to BLS foods. NCCDB (used by Cronometer) is licensed and paid. UK soils, like German ones, are low in selenium, unlike much of North America, so a UK table fits better than USDA. EFSA's own selenium intake estimate for Germany (DRVs for selenium, 2014) also had to borrow 100 % of its German food values from other tables.

**Layout.** One sheet per nutrient group (`1.3 Proximates`, `1.4 Inorganics`, `1.5 Vitamins`, …); row 1 names, row 2 codes (`SE`, `PROT`, …), row 3 descriptions, then one food per row (`Food Code` like `16-001`, `Food Name`, `Group` like `JA`). Values per 100 g edible portion; `Tr` = trace (→ `"t"`), `N` = present but not measured (→ `null`). Copper and manganese in mg, vitamin B6 in mg (BLS: µg). Entries "weighed with bones/stones/skin" are as-bought weights and are never used.

**Method** (`scripts/selenium.ts`, run by `npm run data`):

1. For each BLS food, every CoFID food with a selenium value in a matching main group (fish only with fish, meat with meat, composite dishes with anything but drinks) is scored: how alike the two are in 22 nutrients both tables have (water, protein, fat, carbohydrate, fibre, 9 minerals, 8 B vitamins and vitamin C; mean absolute log ratio), minus a bonus for shared name words (the BLS food word first, preparation words count less).
2. The best one gives its selenium, scaled by the protein ratio (selenium sits in protein as selenomethionine and selenocysteine, EFSA 2014), or by dry matter when either food has under 1 g protein; the scale is kept within ×0.5…×2.
3. Pairs that are too unlike get nothing (`null`, shown as no data): 7 of 7,140 foods.

**How good is it?** Selenium can't be checked against BLS, so `npx tsx scripts/selenium-check.ts` predicts nutrients both tables have the same way, each left out of the comparison, and compares with the BLS value (all BLS foods with a value, 2026-10-23):

| Nutrient | Typical error (median) | 1 in 10 off by more than | Within ±25 % | Within ±50 % |
| --- | --- | --- | --- | --- |
| Zinc | ×1.19 | ×1.71 | 60 % | 82 % |
| Phosphorus | ×1.18 | ×1.71 | 61 % | 83 % |
| Magnesium | ×1.20 | ×1.74 | 58 % | 81 % |
| Potassium | ×1.24 | ×2.05 | 51 % | 74 % |
| Iron | ×1.33 | ×2.43 | 42 % | 62 % |
| Copper | ×1.38 | ×3.00 | 37 % | 59 % |

Zinc and phosphorus are the closest stand-ins (both follow protein, like selenium). On top of this method error, UK and German foods of the same kind can differ in selenium (soil, animal feed, where wheat comes from); that part is not measured. Spot checks: Brazil nut 300, tuna 83, pork kidney 148, cod 23, egg 24, beef 7, whole milk 1 µg/100 g, apple trace. Known weak spot: mushrooms (BLS and CoFID count mushroom protein differently, so the protein scale overstates them).

## `public/data/off-products-de-<date>-<hash>.tsv.gz`: packaged products by name

A list of the Open Food Facts products sold in Germany, for finding packaged products by name on the phone (docs/SPEC.md, "Find packaged products by name"). Open Food Facts' own name search does not answer browser apps (docs/OPEN_QUESTIONS.md). Licence: [ODbL](https://opendatacommons.org/licenses/odbl/1-0/), © Open Food Facts contributors, credited on the About page.

Unlike the BLS, this file is committed as built, not generated in CI: its source is Open Food Facts' Parquet export on Hugging Face ([openfoodfacts/product-database](https://huggingface.co/datasets/openfoodfacts/product-database), several GB, changes daily). Refresh it by hand now and then:

```sh
python3 -m venv /tmp/off && /tmp/off/bin/pip install duckdb
/tmp/off/bin/python scripts/off-products.py     # ~4 minutes; DuckDB reads only the needed columns over HTTP
```

It writes the dated file (removing the old one) and `src/foods/offIndexInfo.ts` (file name, date, count), which the app reads; the date and content hash in the name make the service worker fetch the new list.

- **Which products:** `countries_tags` contains `en:germany`, not obsolete, with an energy value per 100 g on the label (a product without label values cannot be logged), a barcode of 8–14 digits, and a name.
- **Order:** most-scanned first (`unique_scans_n`), then most complete. Search shows the first matches, so popular products lead.
- **Format:** gzip, UTF-8, one header line starting with `#`, then one product per line, tab-separated: barcode, name (German, else the product's main language, else English), brands (comma-separated, duplicates removed), quantity as printed.
- **No label values:** they are fetched by barcode when a product is picked, so they are always current and the file stays small.
