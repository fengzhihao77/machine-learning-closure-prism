# Machine Learning Closure for PRISM

A local web application for a trained machine learning closure for polymer reference interaction site model (PRISM) integral equation theory. Supply chain length, interaction strength, and number density to calculate correlation functions and a structure factor.

**Software version: v1.0.6 — private.** The [repository](https://github.com/fengzhihao77/machine-learning-closure-prism) is private and requires access. No public release or hosted demo is available yet.

This version preserves the existing scientific engine and trained artifacts. Its package and software citation metadata use `1.0.6`; the historical `1.0.5` header inside the engine remains unchanged. See [CHANGELOG.md](CHANGELOG.md) for provenance.

The author selected `v1.0.6` as the current software version. Earlier preparation labels and the existing historical tag remain recorded in the changelog; the version choice does not create a new tag or a public release.

## Repository history

This is the original `PRISM_Deep_Closure` repository, renamed while preserving GitHub repository ID `596750311` and its creation record: **February 2, 2023, 21:16:54 UTC**. The main-branch history preserves all eight original 2023 commits as ancestors.

[Browse the complete main-branch history](https://github.com/fengzhihao77/machine-learning-closure-prism/commits/main/), [open the first commit from February 2, 2023](https://github.com/fengzhihao77/machine-learning-closure-prism/commit/59f0511fe413a3d8a57b81a535feaf9b40b7c005), or [browse the original snapshot](https://github.com/fengzhihao77/machine-learning-closure-prism/tree/59f0511fe413a3d8a57b81a535feaf9b40b7c005). These links require repository access while it is private.

The current files show recent commit dates because of their import and presentation revisions during release preparation. A file's history covers that file path; the repository history includes the older scripts and filenames too. Obsolete scripts were removed from the current tree, and their earlier versions remain in the preserved commits.

## Local setup

Use **Python 3.9.23**. On **macOS ARM64**, install the tested [requirements-macos-arm64.lock.txt](requirements-macos-arm64.lock.txt), which records all 105 installed distributions, including the exact original dependency pins. The unchanged [requirements.txt](requirements.txt) remains the direct dependency specification. The application runs from its source directory; `pyproject.toml` supplies project metadata and does not define a supported `pip install .` package.

With [uv](https://docs.astral.sh/uv/getting-started/installation/) installed, start inside this checkout:

```bash
uv python install 3.9.23
uv venv --python 3.9.23 .venv
source .venv/bin/activate
uv pip install -r requirements-macos-arm64.lock.txt
```

This environment passed dependency imports, PNG export, and the three baseline predictions on macOS 26.4 ARM64. Other operating systems and architectures remain unverified. For a port to another platform, use the original `requirements.txt` instead of the macOS-specific lock and verify that environment separately.

Loading the preserved scalers emits an existing scikit-learn version warning: their saved metadata records 1.1.2, while the original requirements specify 1.3.0. Both the artifacts and dependency pins remain unchanged. The regression checks below used that same environment; see [VALIDATION.md](VALIDATION.md) for the compatibility observation and test scope.

PNG generation also needs a browser and driver. The baseline used **Google Chrome 152.0.7977.83** and **ChromeDriver 152.0.7977.82**. Install compatible versions and put the `chromedriver` executable on your `PATH`; the Python requirements do not install the browser. Check `chromedriver --version` before starting the app.

The following environment settings reproduce the baseline launch configuration. They control the runtime and are separate from the three physical inputs entered in the app. Set them before starting Python, from the directory containing `ML_closure.py`:

```bash
mkdir -p static/pred_results
export OMP_NUM_THREADS=1
export OPENBLAS_NUM_THREADS=1
export VECLIB_MAXIMUM_THREADS=1
export TF_NUM_INTRAOP_THREADS=1
export TF_NUM_INTEROP_THREADS=1
export PYTHONHASHSEED=20260913
export PYTHONDONTWRITEBYTECODE=1
export TF_CPP_MIN_LOG_LEVEL=2
python -u ML_closure.py 2>&1 | tee static/pred_results/terminal.log
```

Open the local URL printed by Flask, normally [http://127.0.0.1:5000](http://127.0.0.1:5000). Keep the directory layout intact: the engine loads its models and saves results using paths relative to the working directory.

Use one prediction at a time. Each calculation overwrites the same result filenames, so this version is intended for a single local user and is not prepared for concurrent public requests.

The launch command captures real stdout/stderr while keeping it visible in the launching terminal. **Live terminal** opens a popup showing up to 500 captured lines. It can be opened during calculation to inspect actual engine messages; closing it stops the viewer polling. Terminal output is shown in this popup, with no inline feed.

The existing Flask static route serves the generated log; no scientific code or route is modified. The viewer hides its own log requests and labels capture or connection failures explicitly. Output belongs to the whole local process and may include previous calculations. Existing engine messages report loading, model convergence, and exports; the disabled iteration-residual print statement is not enabled by this frontend. Running `python ML_closure.py` without capture leaves the popup clearly labeled as browser events. Terminal logs and generated predictions are ignored by Git. Keep this single-user local configuration private.

## Regression checks

The latest **v1.0.6** interface refinement passed its three-state browser/model regression and focused presentation checks on September 13, 2026.

Three state points were selected before execution with Python's `random.Random(20260913)`: independent draws of integer `N` in [20, 100], uniform `epsilon` in [0, 0.5], and uniform `rho` in [0.2, 0.8], with the latter two rounded to three decimals.

| Case | N | epsilon | rho | Original complete check (s) | Current browser check (s) |
| --- | --- | --- | --- | --- | --- |
| 1 | 32 | 0.311 | 0.671 | 74.62 | 65.19 |
| 2 | 49 | 0.407 | 0.701 | 65.30 | 66.19 |
| 3 | 67 | 0.188 | 0.399 | 24.21 | 26.45 |

These are observed wall times for the complete checks, not a performance benchmark or evidence of a speed improvement.

All three cases completed with all five ensemble folds converged and finite 2,048 × 7 exported arrays. All **43,008 numeric values** matched the frozen references exactly, with zero maximum absolute difference. All **15 original engine PNGs** matched byte-for-byte and pixel-for-pixel. Ordered inputs, retained values, completed numeric downloads, all 15 SVG source/sample records and current-figure downloads, and the original c(k) uncertainty download were checked. Genuine engine messages appeared in the manually opened terminal popup before every calculation completed. The combined numerical/source/browser audit passed **310/310 checks**.

Focused interface checks passed **28/28**, and terminal-popup lifecycle checks passed **24/24**. Desktop and phone renderings were visually inspected. Disclosure resize and reduced-motion checks passed **3/3**. The unchanged paper-style renderer retains its earlier **525/525** independent saved-data checks, including every source sample and plotted coordinate; those checks do not claim additional model runs.

Preservation checks passed: all 702 files in the recorded author-owned inventory remained unchanged during this round. The protected scientific files and original requirements, selected PNG/TGA sources, exact copied PNG, and frozen reference archive were preserved. The frozen 19-file frontend matched the checkout, all three runtime copies, and the local preview. This evidence covers the three listed regression cases in the recorded environment, not new scientific accuracy or concurrent-hosting claims. See [VALIDATION.md](VALIDATION.md) for current and historical results, environment, and scope. Saved outputs and detailed audit records remain in the local review archive.

## Inputs and results

| Input | Meaning | Existing interface guidance |
| --- | --- | --- |
| `N` | Number of monomers per chain | Integers, 20–100 |
| `epsilon` | Interaction well depth, ε, in kBT | 0.0–0.5 |
| `rho` | Monomer number density, ρ, in σ⁻³ | 0.2–0.8 |

Inputs use Lennard–Jones reduced units with bead diameter σ and the study's fixed reduced temperature T*=1. The reduced density is physical monomer number density multiplied by σ³. An interaction input of ε = 0 selects purely repulsive WCA interactions. These ranges reproduce the existing interface guidance; they do not establish a new applicability domain or guarantee convergence. No input-unit conversion is applied by the frontend.

Successful calculations write five PNG plots and `pred_data.txt` under `static/pred_results/`. The data file contains 2,048 rows for the web defaults and seven columns:

| Column | Quantity |
| --- | --- |
| `r_range` | Radial samples |
| `g_r` | Pair correlation g(r) |
| `k_range` | Reciprocal-space samples |
| `h_k` | Intermolecular total correlation h(k) |
| `w_k` | Intramolecular correlation ω(k) |
| `c_k` | Direct correlation c(k) |
| `s_k` | Structure factor s(k) |

Numeric rows are whitespace-delimited even though the comment header contains commas. Load them with `numpy.loadtxt`, not a comma-delimited CSV reader. The `w_k` field denotes PRISM ω(k), distinct from the QHO frequency w in the manuscript. Save results elsewhere before starting another calculation.

The standard scientific view draws these exact samples in the browser, following manuscript Figures 3–5: boxed axes, inward ticks, and a red ML curve. It applies no smoothing, resampling, or unit conversion. The state point appears in the figure toolbar, and the current figure downloads as SVG with source-data provenance. The c(k) view shows the mean only because per-fold uncertainty is absent from the numerical table. The data-details panel provides a separate download of the original c(k) PNG with its uncertainty band. The engine continues to export all five original PNGs, and the complete numerical download remains unchanged.

A single self-consistency-loop animation accompanies calculation. It is conceptual and does not represent measured iteration counts, residuals, or completion percentages. The initial polymer illustration is an exact copy of the author-selected `val_3.png` rendering, not a calculated correlation plot. Manuscript-derived inline vector diagrams explain the architecture and PRISM workflow; the author’s original figures remain unchanged. The interface starts in dark mode when no preference is saved, respects a saved light-mode choice, and expands its detail sections smoothly.

The introductory comparison names the Percus–Yevick (PY), hypernetted-chain (HNC), and Modified Verlet (MV) atomic closures for the systems studied. These comparisons have different benchmark sets; the wording does not imply a universal ranking or expand the model’s scientific validation.

## Development and provenance

Scientific code and artifacts are author-controlled: `ML_closure.py`, `QHO.py`, `scalers_and_models/`, and `ML_w_k_predictor/` must remain byte-identical. Frontend changes are confined to `templates/index.html` and presentation assets under `static/`.

[SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json) records the imported files' original checksums and observed filesystem timestamps. It describes the pre-redesign snapshot; changed documentation or frontend files will naturally have different current checksums. Filesystem timestamps are not proof of authorship dates or historical Git commits.

For a reproducible issue, include the input triplet, software version, operating system, dependency inventory, and traceback. Internal slides and generated outputs are excluded from the release tree.

## Citation and license

Software author: **Zhihao Feng**, as identified in the original engine header. Machine-readable software citation metadata is provided in [CITATION.cff](CITATION.cff).

Related manuscript: Zhihao Feng, Christian T. Randolph, Tyler B. Martin, and Thomas E. Gartner III, *A Machine Learning Closure for Polymer Integral Equation Theory*. [arXiv:2509.11030](https://arxiv.org/abs/2509.11030) (2025), version 3, July 30, 2026. [DOI:10.48550/arXiv.2509.11030](https://doi.org/10.48550/arXiv.2509.11030) identifies the preprint. Journal publication details will be added when confirmed.

License selection is pending author approval. This software does not yet declare an open-source license.
