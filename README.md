# ToFoo

Tobi Food — a personal nutrition tracker that models your body's nutrient stores, built around batch cooking.

- App: https://beitz.github.io/ToFoo/ (installable PWA, works offline, all data stays on your device)
- Specification: [docs/SPEC.md](docs/SPEC.md) · Conventions: [CLAUDE.md](CLAUDE.md) · Open questions: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)

## Install on the phone

1. Open https://beitz.github.io/ToFoo/ in Chrome on Android.
2. Menu (⋮) → **Install app** (or "Add to home screen").
3. It works offline from then on. Export a backup now and then (Settings → Backup).

Deployment: every push to `main` runs the tests and publishes to GitHub Pages (repository Settings → Pages → Source: **GitHub Actions** must be set once).

## Development

```sh
npm install
npm run data   # convert the bundled BLS zip to JSON
npm run dev
npm test
```

## Data sources

Food data: Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 — Deutsche Nährstoffdatenbank. Karlsruhe. DOI: [10.25826/Data20251217-134202-0](https://doi.org/10.25826/Data20251217-134202-0). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The data was converted to a compact format and abridged for this app.

Selenium (not in BLS): estimated from Public Health England (2021): McCance and Widdowson's The Composition of Foods Integrated Dataset 2021. Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

## Reuse

There is no formal licence. You're welcome to reuse the code; please credit this repository ([github.com/beitz/ToFoo](https://github.com/beitz/ToFoo)). ToFoo is general education, not medical advice.
