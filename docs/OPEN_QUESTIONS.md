# Open questions

Questions and assumptions that need an answer or a better source. Each model assumption in `model/*.ts` marked `confidence: 'assumption'` has an entry here. Tick an item when it is resolved and note the decision in `docs/SPEC.md` if it changes behaviour.

## Decided

- [x] **UI framework:** React (decided 2026-10-15). The bundled data dominates download size, so Svelte's smaller runtime wouldn't matter much.
- [x] **Heme/non-heme iron and phytate in BLS 4.0:** neither is present. Both are estimated from the food group.
- [x] **Selenium:** BLS 4.0 has no selenium. Not tracked in v1; revisit with the USDA lookup in v3.
- [x] **Food names:** English is the primary display and search language; German is searchable too and shown second.
- [x] **Code licence:** none; reuse welcome with credit to the repo (README).

## Open

- [ ] QR size: confirm a typical recipe fits a comfortably scannable code (v2).
