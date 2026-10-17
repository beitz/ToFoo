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

Everything personal, as stored on the device. Written by Settings → Backup → Export; restored by Import (replaces all data after a preview).

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
    "dayStatus": [], "fasts": [], "sunEntries": [], "products": [], "journal": [], "sleep": [], "activities": []
  }
}
```

Each record has a `schemaVersion`; older records are migrated on import. `products` may be missing in backups from before the Open Food Facts lookup, `journal` in backups from before the journal, `sleep` in backups from before sleep, and `activities` in backups from before activities; each then counts as empty.

Journal entries (`data.journal[]`): `id`, `schemaVersion`, `time` (epoch ms the entry is about), `day` (the local `YYYY-MM-DD` of `time`) and `text` (what the user wrote, plain text).

Sleep (`data.sleep[]`): `id`, `schemaVersion`, `start` (epoch ms the user fell asleep), `end` (epoch ms they woke up; missing while they are asleep) and `day` (the local `YYYY-MM-DD` the sleep ended, or started while it is going: a night belongs to the morning after it). No quality rating.

Activities (`data.activities[]`): `id`, `schemaVersion`, `kind` (`walk`, `run`, `cycling`, `strength` or `other`), optional `name` (the user's own word, e.g. "Football"), `time` (epoch ms it started), `day` (local `YYYY-MM-DD` it started), `minutes`, optional `intensity` (`easy`, `moderate` or `hard`), `outside` (boolean) and `sunSkin` (uncovered skin, same values as the sun routine's `skin`; present only when the activity counts toward the vitamin D sun estimate).

Products (`data.products[]`) are foods from online databases as fetched: Open Food Facts products (data licence ODbL) and USDA FoodData Central foods (public domain). Fields: `id` (`OFF:<barcode>` or `USDA:<fdcId>`), `source` (`"OFF"` or `"USDA"`), `code` (barcode or FoodData Central id), `usdaType` (USDA only: `Foundation`, `SR Legacy`, `Survey (FNDDS)` or `Branded`), `name`, optional `brand`, `quantity`, `serving` (`{ label, grams }`), `per100` (values per 100 g, or per 100 ml if `perMl`, by BLS component code in BLS units: label values, or the USDA database values for USDA generic foods; a nutrient without a value is absent, not 0), `categories`, optional `lastModified`, `fetchedAt`, and optional `match` (`{ version, code }`: the BLS food whose values fill in what the source lacks).

Log entries (`data.log[]`) have `id`, `time` (epoch ms), `day` (local `YYYY-MM-DD`), `confidence`, `label` and a `kind`:

| kind | fields |
| --- | --- |
| `food` | `ref` (food reference), `grams`, `preparation` |
| `portion` | `batchId`, `storage` (`fresh` / `fridge` / `freezer`), `portions` |
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
