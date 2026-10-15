# ToFoo — conventions for Claude Code

ToFoo is a personal nutrition PWA (see `docs/SPEC.md`, the source of truth for behaviour). One user, Android phone in Chrome, hosted on GitHub Pages at `https://beitz.github.io/ToFoo/`.

## Commands

```sh
npm install
npm run data        # data/raw/BLS zip → public/data/bls-4.0.json (needed before dev/test/build)
npm run dev         # local dev server
npm test            # Vitest
npm run typecheck   # tsc, strict
npm run build       # data + typecheck + vite build (dist/)
npm run schema      # regenerate docs/exchange-format.schema.json after changing src/exchange/schema.ts
```

CI (`.github/workflows/deploy.yml`) runs data → typecheck → test → build on every push (any branch); pushes to `main` also deploy to Pages.

## Layout

| Path | What |
| --- | --- |
| `data/raw/` | BLS 4.0 zip, never edited. Format documented in `data/README.md`. |
| `scripts/` | Build-time scripts (BLS conversion). |
| `model/` | **Data files with sources**: `reference-values.ts` (DGE/EFSA), `parameters.ts` (absorption, capacity, retention, sun). Every number has a citation, a low/central/high range and a confidence note. |
| `src/model/` | The nutrient model: **pure functions only** (no React, no IndexedDB, no `Date.now()`), fully unit-tested. |
| `src/foods/` | Loading the BLS JSON, food lookup, search. |
| `src/logic/` | Pure glue from stored data to model inputs (log → model entries, fasting days, sun per day). |
| `src/app/` | App shell: router, data context (`useData`: live queries + model), toasts with undo. |
| `src/lib/` | Small helpers (dates as local `YYYY-MM-DD` day keys, formatting, ids). |
| `src/storage/` | IndexedDB (Dexie) behind repository interfaces; schema versions and migrations. |
| `src/exchange/` | ToFoo exchange format (backup, recipe, logEntry): zod schema, parser, validator. |
| `src/features/<name>/` | UI per feature (home, log, recipes, settings, about…). |
| `src/ui/` | Shared UI components. |
| `src/i18n/` | UI strings. **All user-visible text goes through `t()`**; English is the default, keys in `en.ts`. |
| `docs/` | SPEC, OPEN_QUESTIONS, exchange format docs and JSON Schema. |

## Rules

1. **Never invent physiological numbers.** Absorption, capacities, retention, requirements, ULs and sun synthesis live only in `model/*.ts` with a source. No good source → mark `confidence: 'assumption'` and add an entry to `docs/OPEN_QUESTIONS.md`. No magic numbers in `src/model/`.
2. **Missing is not zero.** BLS `null` stays `null` through the pipeline; the UI shows when data is missing.
3. **Units:** the model uses BLS units per nutrient (e.g. vitamin B6 in µg, copper in µg). Reference values are stored in the same units.
4. **Absorbed units:** intake × absorption goes in, the physiological (absorbed) requirement comes out. Never compare absorbed amounts with recommended intakes.
5. **Ingredients are referenced, not copied:** `source + version + code` (e.g. `BLS`, `4.0`, `C131000`).
6. **Derived, not stored:** tank levels are recomputed from the log + parameters; only caches are stored.
7. **Storage records carry `schemaVersion`;** migrations are pure functions with tests.
8. **Feature toggles** go through `src/settings/features.ts`; new optional features get a toggle.
9. **UI:** mobile-first (check at 360–412 px width), touch targets ≥ 44 px, status never by colour alone, light and dark mode, undo instead of confirm for everyday actions, respect `prefers-reduced-motion`.
10. **Privacy:** no analytics, no third-party requests. Nothing personal in the repo.
11. Food names: English is the primary display and search language, German second (both from BLS).
12. Keep `docs/SPEC.md`, `docs/OPEN_QUESTIONS.md` and the exchange-format docs current when decisions change.

## Workflow

- Work on a branch and open a pull request into `main`. Once CI is green, merge it yourself; no need to wait for the owner's confirmation (owner's standing instruction, 2026-10-15).
- Merging to `main` deploys to GitHub Pages.

## Checking UI changes

Chromium is available for Playwright (`/opt/node22/lib/node_modules/playwright`). Run `npm run dev`, then screenshot pages at 390×844 in light and dark mode before calling a UI change done.

## Style

TypeScript strict (`noUncheckedIndexedAccess` on). React function components with hooks; no global state library. Plain CSS with tokens in `src/styles.css`. Small, readable modules; comments explain *why*.
