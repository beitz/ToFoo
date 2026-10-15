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

- **No selenium.** BLS 4.0 has no selenium column. Not tracked in v1 (see `docs/OPEN_QUESTIONS.md`).
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
