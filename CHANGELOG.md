# Changelog

## 1.0.6 — 2026-09-13 (current software version; private preparation)

### Latest interface refinement

- Replaced the initial illustration with an exact copy of the author-selected `val_3.png` polymer rendering, preserving the source image.
- Simplified calculation feedback to one conceptual self-consistency-loop animation and a popup-only live terminal viewer. Actual process capture still uses the existing static route; no scientific code or backend route changed.
- Added smooth disclosures and dark mode by default while respecting a saved light-mode preference.
- Extended the study-scoped hero comparison to PY, HNC, and Modified Verlet and clarified Lennard–Jones reduced input units.
- Kept software version `1.0.6`, scientific files, result data, and original plotting unchanged. The same three browser/model cases passed 310/310 checks: all 43,008 numeric values and 15 original PNGs exactly matched the frozen baselines, and real process output appeared in the manually opened popup before each run completed.
- Passed 28/28 focused interface checks and 24/24 popup lifecycle checks. Disclosure resize and reduced-motion checks passed 3/3. All 702 recorded author-owned files remained unchanged this round; protected application files, selected source images, copied PNG, frozen reference archive, and 19 frozen frontend files passed preservation checks. Earlier results below remain historical records.

### Preceding version and diagram-label revision

- Adopted the author's selected software version `1.0.6` for current project metadata, software citation, documentation, and interface. This supersedes the earlier `1.1.0rc1` preparation label.
- Preserved the scientific source and trained artifacts, including the engine's historical `1.0.5` header and original dependency specification.
- Retained the existing repository, its 2023 creation record, original commits, and historical `v1.1.0-rc.1` tag. No `v1.0.6` tag, replacement tag, package publication, or public release is created by this version change.
- Verified the current version, single preprint link, and diagram-label spacing: 36/36 focused checks passed, including 168 text-to-box measurements across two themes and four viewports.
- Repeated the same three actual browser/model runs: all 43,008 numeric values and all 15 original PNGs matched the frozen baselines exactly. SVG samples/downloads, the original c(k) uncertainty download, and real inline terminal output were verified; the combined audit passed 304/304 checks. Application preservation checks passed. Earlier results below remain records of the revisions actually checked.

## Earlier private frontend refinements — 2026-09-13

- Added manuscript Figures 1 and 2 as exact image copies with full-resolution viewing, a QHO-inspired presentation mark, preprint links, and three selectable conceptual animations. Their timing does not represent solver progress.
- Added paper-style SVG plots using every exported sample without smoothing, resampling, or unit conversion. SVG provenance records the source-data hash and all sample pairs. The original engine PNGs remain available; c(k) shows only the mean because its source table contains no fold uncertainty.
- Added an optional live terminal view of captured process stdout/stderr through the existing Flask static-file route. It uses plaintext, identifies unavailable or stale output, and falls back to clearly labeled browser events. No Python source or backend route changed.
- Repeated the same three actual browser/model regressions: all 43,008 numeric values had zero maximum difference, and all 15 original PNGs remained identical in bytes and pixels. The combined audit passed 304/304 checks. Real terminal output was observed before completion in all three runs.
- Passed 525 independent saved-data SVG checks and 56 mocked UI checks. After the full runs, a terminal-dialog close/reopen race was fixed and verified by 21 focused browser checks without rerunning the model. See [VALIDATION.md](VALIDATION.md) for the sequence and scope.

These refinements followed the historical `v1.1.0-rc.1` tag. The tag remains at its original commit; no replacement tag or public release is implied.

## 1.1.0-rc.1 — 2026-09-13 (historical private candidate)

- Prepared the current application in the renamed private `machine-learning-closure-prism` repository, retaining its February 2, 2023 creation date and existing Git history.
- Added source setup guidance, project and citation metadata, contribution boundaries, and a record of imported file checksums and filesystem timestamps.
- Excluded obsolete development files, internal slides, caches, and generated predictions from the current release tree. Legacy commits remain in the private repository history.
- Preserved all scientific source, model weights, scalers, and the intramolecular predictor. The original dependency pins remain unchanged.
- Added the tested macOS ARM64 dependency lock and documented the baseline runtime settings. Three original state-point checks passed before frontend edits; each produced finite 2,048 × 7 data with all five folds converged.
- Rebuilt the presentation layer with responsive layout, labeled inputs, calculation state, plot tabs, and verified data/figure downloads while preserving the original backend contract.
- Repeated the same three cases through the redesigned browser interface: all 43,008 numeric values and all 15 PNG files matched the original outputs exactly. The combined regression audit passed 304/304 checks; completed browser downloads were checked separately. See `VALIDATION.md`.
- Documented the existing saved-scaler/runtime scikit-learn version warning without modifying the scalers or original dependency pins.
- Corrected the initial illustration's captions and accessible text while preserving its image. The final frontend passed 30/30 mocked/native checks and a saved-real-output replay verifying the numeric download and all five displayed plot bytes; that final replay did not rerun the model.

Python metadata at this stage used `1.1.0rc1`; its historical private candidate tag remains `v1.1.0-rc.1`. This preparation stage did not establish a public release or expand the model's scientific accuracy claims.

## Earlier development

The author dates the beginning of development to late 2020; alpha and beta work preceded this release preparation. Those stages were not formal GitHub releases.

The preserved engine header records `1.0.0` on June 7, 2023; `1.0.1` on July 13; `1.0.2` on July 20; `1.0.3` on August 30; `1.0.4` on September 4; and `1.0.5` on September 14, 2023. These are source-header records, not reconstructed release tags. The imported files also have later observed modification times, recorded separately in `SOURCE_PROVENANCE.json`.
