# ToFoo

Tobi Food — a personal nutrition tracker that models your body's nutrient stores, built around batch cooking.

- App: https://beitz.github.io/ToFoo/ (installable PWA, works offline, all data stays on your device)
- Specification: [docs/SPEC.md](docs/SPEC.md) · Conventions: [CLAUDE.md](CLAUDE.md) · Open questions: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)

## Development

```sh
npm install
npm run data   # convert the bundled BLS zip to JSON
npm run dev
npm test
```

## Data sources

Food data: Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 — Deutsche Nährstoffdatenbank. Karlsruhe. DOI: [10.25826/Data20251217-134202-0](https://doi.org/10.25826/Data20251217-134202-0). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The data was converted to a compact format and abridged for this app.

## Reuse

There is no formal licence. You're welcome to reuse the code; please credit this repository ([github.com/beitz/ToFoo](https://github.com/beitz/ToFoo)). ToFoo is general education, not medical advice.
