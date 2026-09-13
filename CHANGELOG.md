# Changelog

## 1.1.0-rc.1 — 2026-09-13 (private candidate)

- Prepared the current application in the renamed private `machine-learning-closure-prism` repository, retaining its February 2, 2023 creation date and existing Git history.
- Added source setup guidance, project and citation metadata, contribution boundaries, and a record of imported file checksums and filesystem timestamps.
- Excluded obsolete development files, internal slides, caches, and generated predictions from the current release tree. Legacy commits remain in the private repository history.
- Preserved all scientific source, model weights, scalers, and the intramolecular predictor. The original dependency pins remain unchanged.
- Added the tested macOS ARM64 dependency lock and documented the baseline runtime settings. Three original state-point checks passed before frontend edits; each produced finite 2,048 × 7 data with all five folds converged.
- Rebuilt the presentation layer with responsive layout, labeled inputs, calculation state, plot tabs, and verified data/figure downloads while preserving the original backend contract.
- Repeated the same three cases through the redesigned browser interface: all 43,008 numeric values and all 15 PNG files matched the original outputs exactly. The combined regression audit passed 304/304 checks; completed browser downloads were checked separately. See `VALIDATION.md`.
- Documented the existing saved-scaler/runtime scikit-learn version warning without modifying the scalers or original dependency pins.
- Corrected the initial illustration's captions and accessible text while preserving its image. The final frontend passed 30/30 mocked/native checks and a saved-real-output replay verifying the numeric download and all five displayed plot bytes; that final replay did not rerun the model.

Python metadata uses `1.1.0rc1`; the private candidate tag is `v1.1.0-rc.1`. This candidate does not establish a public release or expand the model's scientific accuracy claims.

## Earlier development

The author dates the beginning of development to late 2020; alpha and beta work preceded this candidate. Those stages were not formal GitHub releases.

The preserved engine header records `1.0.0` on June 7, 2023; `1.0.1` on July 13; `1.0.2` on July 20; `1.0.3` on August 30; `1.0.4` on September 4; and `1.0.5` on September 14, 2023. These are source-header records, not reconstructed release tags. The imported files also have later observed modification times, recorded separately in `SOURCE_PROVENANCE.json`.
