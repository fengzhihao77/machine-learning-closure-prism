# Machine Learning Closure for PRISM

A local web application for a trained machine learning closure for polymer reference interaction site model (PRISM) integral equation theory. Supply chain length, interaction strength, and number density to calculate correlation functions and a structure factor.

**Candidate version: v1.1.0-rc.1 — private candidate.** The [repository](https://github.com/fengzhihao77/machine-learning-closure-prism) is private and requires access. No public release or hosted demo is available yet. Three original prediction baselines and three browser runs through the redesigned frontend matched exactly. Final presentation review and a replay of saved real output also passed.

This candidate preserves the existing scientific engine and trained artifacts. Its package metadata version is `1.1.0rc1`; the historical `1.0.5` header inside the engine remains unchanged. See [CHANGELOG.md](CHANGELOG.md) for provenance.

`rc.1` means **release candidate 1**: a version prepared for review before the planned stable `v1.1.0` release. The interface spells out that status.

## Repository history

This is the original `PRISM_Deep_Closure` repository, renamed while preserving GitHub repository ID `596750311` and its creation record: **February 2, 2023, 21:16:54 UTC**. The candidate commit preserves all eight original 2023 commits as ancestors.

[Browse the complete main-branch history](https://github.com/fengzhihao77/machine-learning-closure-prism/commits/main/), [open the first commit from February 2, 2023](https://github.com/fengzhihao77/machine-learning-closure-prism/commit/59f0511fe413a3d8a57b81a535feaf9b40b7c005), or [browse the original snapshot](https://github.com/fengzhihao77/machine-learning-closure-prism/tree/59f0511fe413a3d8a57b81a535feaf9b40b7c005). These links require repository access while it is private.

The current files show recent commit dates because they were imported for this candidate. A file's history covers that file path; the repository history includes the older scripts and filenames too. Obsolete scripts were removed from the current tree, and their earlier versions remain in the preserved commits.

## Local setup

Use **Python 3.9.23**. On **macOS ARM64**, install the tested [requirements-macos-arm64.lock.txt](requirements-macos-arm64.lock.txt), which records all 105 installed distributions, including the exact original dependency pins. The unchanged [requirements.txt](requirements.txt) remains the direct dependency specification. The candidate is run from its source directory; `pyproject.toml` supplies project metadata and does not define a supported `pip install .` package.

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
python ML_closure.py
```

Open the local URL printed by Flask, normally [http://127.0.0.1:5000](http://127.0.0.1:5000). Keep the directory layout intact: the engine loads its models and saves results using paths relative to the working directory.

Use one prediction at a time. Each calculation overwrites the same result filenames, so this version is intended for a single local user and is not prepared for concurrent public requests.

To show real terminal output in the interface's **Calculation log** window, launch with output capture instead of the plain Python command above:

```bash
python -u ML_closure.py 2>&1 | tee static/pred_results/terminal.log
```

The existing Flask static route serves this generated log; no scientific code or route is modified. The popup reads actual stdout/stderr while open and hides its own log-viewer HTTP requests. It displays output from the whole local process, which may include previous calculations. Without this optional capture, it clearly shows browser events instead. Terminal logs and generated predictions are ignored by Git. Keep this single-user local configuration private.

## Regression checks

Three state points were selected before execution with Python's `random.Random(20260913)`: independent draws of integer `N` in [20, 100], uniform `epsilon` in [0, 0.5], and uniform `rho` in [0.2, 0.8], with the latter two rounded to three decimals.

| Case | N | epsilon | rho | Original complete check time (s) |
| --- | --- | --- | --- | --- |
| 1 | 32 | 0.311 | 0.671 | 74.62 |
| 2 | 49 | 0.407 | 0.701 | 65.30 |
| 3 | 67 | 0.188 | 0.399 | 24.21 |

All three original cases completed successfully, with all five ensemble folds converged and finite 2,048 × 7 exported arrays. After the latest frontend revision, these same three states were submitted through the actual browser interface again. All **43,008 numeric values** matched the frozen references exactly, and all **15 original engine PNGs** matched byte-for-byte and pixel-for-pixel. Ordered form inputs, retained values, completed data downloads, original-plot access, and the new SVGs' source samples/current-view downloads were checked. Actual engine terminal messages appeared before each calculation completed. The combined numerical/source/browser audit passed **304 of 304 checks**.

Independent saved-data tests passed **525/525** checks of the paper-style renderer, including every source sample and plotted coordinate. Fixture-based interface checks passed **56/56**; these cover the UI without claiming additional model runs. After the real calculations, a one-line log-window close guard fixed a rapid reopen race and passed **21/21** focused terminal-viewer checks. It does not change the request, numerical output, or plot-rendering code.

Scientific source and model hashes remain unchanged, as do all 32 files in the original author reference app. This evidence covers the listed regression cases and presentation checks in the recorded environment. See [VALIDATION.md](VALIDATION.md) for details. Saved output fixtures and detailed logs remain in the local review archive.

## Inputs and results

| Input | Meaning | Existing interface guidance |
| --- | --- | --- |
| `N` | Chain length | Whole numbers, 20–100 |
| `epsilon` | Interaction-strength parameter, ε | 0.0–0.5 |
| `rho` | Number-density parameter, ρ | 0.2–0.8 |

Use the model's reduced conventions. These ranges reproduce the existing interface guidance; they do not establish a new applicability domain or guarantee convergence. The interaction parameter scales the potential, rather than attraction alone.

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

The default **Paper style** view draws these exact samples in the browser, following manuscript Figures 3–5: boxed axes, inward ticks, and a red ML curve. It applies no smoothing, resampling, or unit conversion. The state point appears in the figure toolbar, and the current view downloads as SVG with source-data provenance. **Original engine** displays and downloads the unchanged PNG. The c(k) paper view shows the mean only because per-fold uncertainty is absent from the numerical table; the original PNG retains its uncertainty band. The complete numerical download remains unchanged.

Three selectable animations illustrate self-consistency, correlation exchange, or activity. They can be previewed before a run and do not represent measured iteration counts, residuals, or completion percentages. Manuscript Figures 1 and 2 are displayed as exact copies, with full-resolution viewing.

## Development and provenance

Scientific code and artifacts are author-controlled: `ML_closure.py`, `QHO.py`, `scalers_and_models/`, and `ML_w_k_predictor/` must remain byte-identical. Frontend changes are confined to `templates/index.html` and presentation assets under `static/`.

[SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json) records the imported files' original checksums and observed filesystem timestamps. It describes the pre-redesign snapshot; changed documentation or frontend files will naturally have different current checksums. Filesystem timestamps are not proof of authorship dates or historical Git commits.

For a reproducible issue, include the input triplet, candidate version, operating system, dependency inventory, and traceback. Internal slides and generated outputs are excluded from the release tree.

## Citation and license

Software author: **Zhihao Feng**, as identified in the original engine header. Machine-readable software citation metadata is provided in [CITATION.cff](CITATION.cff).

Related manuscript: Zhihao Feng, Christian T. Randolph, Tyler B. Martin, and Thomas E. Gartner III, *A Machine Learning Closure for Polymer Integral Equation Theory*. [arXiv:2509.11030](https://arxiv.org/abs/2509.11030) (2025), version 3, July 30, 2026. [DOI:10.48550/arXiv.2509.11030](https://doi.org/10.48550/arXiv.2509.11030) identifies the preprint. Journal publication details will be added when confirmed.

License selection is pending author approval. This candidate does not yet declare an open-source license.
