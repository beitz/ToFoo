# ToFoo exchange format

One versioned JSON format for backups, shared recipes (QR codes, v2) and pasted log entries (Claude helper, v2). Every import path uses the same parser and validator (`src/exchange/`).

- Machine-readable: [`exchange-format.schema.json`](exchange-format.schema.json) (JSON Schema, generated from `src/exchange/schema.ts` with `npm run schema`; a test keeps it in sync).
- Current version: **1**.

## Rules

- Top level: `"format": "tofoo"`, `"formatVersion": 1`, and `"type"`: `"backup"`, `"recipe"` or `"logEntry"`.
- Foods are **referenced, never copied**: `{ "source": "BLS", "version": "4.0", "code": "H700000" }`. Only manual ingredients carry their own nutrient values (`per100g`) and a confidence.
- Packaged products from Open Food Facts are referenced by barcode: `{ "source": "OFF", "code": "8000500319475" }`. Open Food Facts has no versions, so a backup also carries the product as it was fetched (`data.products`).
- Foods from USDA FoodData Central are referenced by FoodData Central id: `{ "source": "USDA", "code": "170392" }`. A new USDA release gives changed foods new ids; the backup also carries the food as fetched (`data.products`).
- Nutrient amounts use **BLS component codes and BLS units** (e.g. `"VITC"` in mg, `"VITB12"` in µg, `"VITB6"` in µg). See `data/README.md`.
- **Unknown fields are ignored**, so newer files with extra fields still import in older apps. A file with a *higher* `formatVersion` than the app knows is refused with a message to update the app.
- **Import always shows a preview and asks for confirmation.** Invalid input gives a clear error (field path + problem) and nothing is imported.
- Confidence: `A` measured (database values, weighed amounts), `B` standard (estimated amount or generic dish), `C` estimate (from a description or photo).
- Preparation: `asListed` (default: the BLS entry as it is, e.g. already cooked), `raw`, `boiled`, `steamed`, `baked`, `fried`.

## `type: "backup"`

Everything personal, as stored on the device. Written by Settings → Backup → Export, and by the app itself for automatic backups (same format); restored by Import or by Restore on an automatic backup (replaces all data after a preview).

```json
{
  "format": "tofoo",
  "formatVersion": 1,
  "type": "backup",
  "exportedAt": "2026-10-15T18:00:00.000Z",
  "app": { "version": "0.1.0" },
  "data": {
    "profile": { "id": "profile", "schemaVersion": 1, "…": "…" },
    "settings": { "id": "settings", "schemaVersion": 1, "…": "…" },
    "recipes": [], "batches": [], "log": [], "customFoods": [],
    "dayStatus": [], "fasts": [], "sunEntries": [], "products": [], "journal": [], "sleep": [], "activities": [], "water": [], "shopping": [], "pantry": [], "ketones": [],
    "portionSizes": [{ "food": "C133000", "sizes": [{ "label": "My bowl", "grams": 60 }] }]
  }
}
```

Each record has a `schemaVersion`; older records are migrated on import. `products` may be missing in backups from before the Open Food Facts lookup, `journal` in backups from before the journal, `sleep` in backups from before sleep, `activities` in backups from before activities, `water` in backups from before water, `shopping` in backups from before the shopping list, `pantry` in backups from before the At home list, and `ketones` in backups from before ketone measurements; each then counts as empty. `portionSizes` (portion sizes the user saved per food, by the food code they were saved under) is missing in backups from before 2026-10-18; restoring such a backup leaves the portion sizes on the device as they are. A size with `"piece": true` is the weight of one piece of that food (at most one per food, since 2026-10-23); a food log entry (and a favourite meal's food item) logged as a count of pieces has `pieces`, the count, beside `grams`, which is what counts.

Journal entries (`data.journal[]`): `id`, `schemaVersion`, `time` (epoch ms the entry is about), `day` (the local `YYYY-MM-DD` of `time`) and `text` (what the user wrote, plain text).

Sleep (`data.sleep[]`): `id`, `schemaVersion`, `start` (epoch ms the user fell asleep), `end` (epoch ms they woke up; missing while they are asleep) and `day` (the local `YYYY-MM-DD` the sleep ended, or started while it is going: a night belongs to the morning after it). No quality rating.

Activities (`data.activities[]`): `id`, `schemaVersion`, `kind` (`walk`, `run`, `cycling`, `strength` or `other`), optional `name` (the user's own word, e.g. "Football"), `time` (epoch ms it started), `day` (local `YYYY-MM-DD` it started), `minutes`, optional `intensity` (`easy`, `moderate` or `hard`), `outside` (boolean) and `sunSkin` (uncovered skin, same values as the sun routine's `skin`; present only when the activity counts toward the vitamin D sun estimate).

Water (`data.water[]`): `id`, `schemaVersion`, `time` (epoch ms it was drunk), `day` (local `YYYY-MM-DD` of `time`) and `ml`. Plain water only; other drinks are log entries with a food.

Shopping list (`data.shopping[]`): `id`, `schemaVersion`, `name`, optional `ref` (the food, as in log entries, when it was picked from the database or came from a recipe), `section` (`produce`, `bakery`, `dairy`, `meat`, `dry`, `pantry`, `drinks`, `ready` or `other`), optional `grams`, optional `amount` (any other amount as typed, e.g. "2 l"), optional `recipes` (names of the recipes it is for), `addedAt` (epoch ms), optional `checkedAt` (epoch ms it was put in the basket) and optional `clearedAt` (epoch ms "Clear" took it off the list; such lines are kept as suggestions).

At home (`data.pantry[]`): `id`, `schemaVersion`, `name`, optional `ref` (the food, as in log entries), `place` (`fridge`, `freezer`, `cupboard` or `spices`), optional `pieces`, optional `grams`, optional `amount` (any other amount as typed, e.g. "1 l", shown but not counted down), `since` (epoch ms the amount was set: bought or counted), optional `status` (`low` or `out`, as the user marked it) and `addedAt` (epoch ms). Only the amount at `since` is stored: what is left is worked out from the log and cooked batches from `since` on (one piece per log entry of the food or pot cooked with it, grams as logged or cooked).

Ketone measurements (`data.ketones[]`): `id`, `schemaVersion`, `time` (epoch ms it was measured), `day` (local `YYYY-MM-DD` of `time`), `type` (`blood`, `breath` or `urine`) and `value` in that method's unit: blood β-hydroxybutyrate in mmol/L (finger-prick meter), breath acetone in ppm (device-specific), urine acetoacetate in mmol/L as the strip reads. Values are never converted between methods.

Products (`data.products[]`) are foods from online databases as fetched: Open Food Facts products (data licence ODbL) and USDA FoodData Central foods (public domain). Fields: `id` (`OFF:<barcode>` or `USDA:<fdcId>`), `source` (`"OFF"` or `"USDA"`), `code` (barcode or FoodData Central id), `usdaType` (USDA only: `Foundation`, `SR Legacy`, `Survey (FNDDS)` or `Branded`), `name`, optional `brand`, `quantity`, `serving` (`{ label, grams }`), `per100` (values per 100 g, or per 100 ml if `perMl`, by BLS component code in BLS units: label values, or the USDA database values for USDA generic foods; a nutrient without a value is absent, not 0), `categories`, optional `lastModified`, `fetchedAt`, optional `match` (`{ version, code, auto? }`: the BLS food whose values fill in what the source lacks; `auto: true` when the app picked it and the user has not checked it), and optional `labelOnly` (`true`: the user chose no similar food, so only the source's values count).

Batches (`data.batches[]`) carry a copy of the recipe as cooked (`recipe`: name, portions, ingredients, optional salt), `cookedDay`, `cookedAt`, `plan`, `remaining` and `corrections`; since 2026-10-18 also optional `cookedGrams` (the cooked food's weight without the pot) and `recipeIngredients` (the recipe's own ingredients, present only when this pot was made differently; `recipe.ingredients` is what went in). Recipes and settings may carry `potGrams`, the empty pot's weight last weighed. Since 2026-10-22 settings may carry `pots` (empty pots remembered by name: `id`, `name`, `grams`) and recipes `potId` (the named pot the recipe was last cooked in).

Log entries (`data.log[]`) have `id`, `time` (epoch ms), `day` (local `YYYY-MM-DD`), `confidence`, `label` and a `kind`:

| kind | fields |
| --- | --- |
| `food` | `ref` (food reference), `grams`, `preparation` |
| `portion` | `batchId`, `storage` (`fresh` / `fridge` / `freezer`), `portions` (taken from stock; may be 0 for some eaten by weight), optional `grams` (eaten of the batch's `cookedGrams`; then it sets the nutrients), optional `ingredients` (this serving's ingredients when it differed from the pot, in grams for the whole pot) |
| `custom` | `customFoodId`, `servings` |
| `manual` | `nutrients` (absolute amounts), `isSupplement` |
| `drink` | `drink`: `tea` or `coffee` (meal modifier for iron absorption) |

## `type: "recipe"` (v2: QR codes)

```json
{
  "format": "tofoo",
  "formatVersion": 1,
  "type": "recipe",
  "recipe": {
    "name": "Linsencurry",
    "portions": 6,
    "ingredients": [
      { "source": "BLS", "version": "4.0", "code": "H700000", "grams": 400, "preparation": "boiled" },
      { "source": "BLS", "version": "4.0", "code": "R114000", "grams": 8, "isSalt": true },
      { "source": "manual", "name": "Curry paste (label)", "grams": 50, "per100g": { "ENERCC": 120, "NA": 1800 }, "confidence": "A" }
    ],
    "storagePlan": { "fresh": 1, "fridge": 1, "freezer": null },
    "shelfLifeDays": { "fridge": 3, "freezer": 90 },
    "instructions": "…",
    "tags": ["vegan"]
  }
}
```

`storagePlan.freezer: null` means "the rest". `isSalt: true` marks salt, which the importing user's salt preference (iodised / fluoridated) replaces.

## `type: "logEntry"` (v2: Claude helper)

```json
{
  "format": "tofoo",
  "formatVersion": 1,
  "type": "logEntry",
  "entries": [
    {
      "name": "Restaurant: Pizza Salami",
      "time": "2026-10-15T13:10:00+02:00",
      "confidence": "C",
      "items": [{ "source": "BLS", "version": "4.0", "code": "X…", "grams": 350 }],
      "drinks": ["coffee"]
    }
  ]
}
```

`time` defaults to now; `confidence` defaults to `C`.
