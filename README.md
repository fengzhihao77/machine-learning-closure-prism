# Machine Learning Closure for PRISM

A local web application for a trained machine learning closure for polymer reference interaction site model (PRISM) integral equation theory. Supply chain length, interaction strength, and number density to calculate correlation functions and a structure factor.

**Candidate version: v1.1.0-rc.1 — private candidate.** The [repository](https://github.com/fengzhihao77/machine-learning-closure-prism) is private and requires access. No public release or hosted demo is available yet. Three original prediction baselines and three browser runs through the redesigned frontend matched exactly. Final presentation review and a replay of saved real output also passed.

This candidate preserves the existing scientific engine and trained artifacts. Its package metadata version is `1.1.0rc1`; the historical `1.0.5` header inside the engine remains unchanged. See [CHANGELOG.md](CHANGELOG.md) for provenance.

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

## Regression checks

Three state points were selected before execution with Python's `random.Random(20260913)`: independent draws of integer `N` in [20, 100], uniform `epsilon` in [0, 0.5], and uniform `rho` in [0.2, 0.8], with the latter two rounded to three decimals.

| Case | N | epsilon | rho | Original complete check time (s) |
| --- | --- | --- | --- | --- |
| 1 | 32 | 0.311 | 0.671 | 74.62 |
| 2 | 49 | 0.407 | 0.701 | 65.30 |
| 3 | 67 | 0.188 | 0.399 | 24.21 |

All three original cases completed successfully, with all five ensemble folds converged and finite 2,048 × 7 exported arrays. After the redesign, the same three state points were submitted through the actual browser interface. All **43,008 numeric values** matched exactly, and all **15 PNGs** matched byte-for-byte and pixel-for-pixel. Ordered form inputs, retained values, completed downloads, and displayed plot bytes were checked. The combined audit passed **304 of 304 checks**.

Scientific source and model hashes remained unchanged, as did all 32 files in the original author reference app. After an illustration-label wording correction, the final frontend passed 30/30 mocked/native UI checks and a separate replay using saved real case-1 output. That replay verified the download and five displayed plots without running the model again. This evidence covers the listed regression cases and final presentation checks in the recorded environment. See [VALIDATION.md](VALIDATION.md) for details. Saved output fixtures and detailed logs remain in the local review archive.

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

## Development and provenance

Scientific code and artifacts are author-controlled: `ML_closure.py`, `QHO.py`, `scalers_and_models/`, and `ML_w_k_predictor/` must remain byte-identical. Frontend changes are confined to `templates/index.html` and presentation assets under `static/`.

[SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json) records the imported files' original checksums and observed filesystem timestamps. It describes the pre-redesign snapshot; changed documentation or frontend files will naturally have different current checksums. Filesystem timestamps are not proof of authorship dates or historical Git commits.

For a reproducible issue, include the input triplet, candidate version, operating system, dependency inventory, and traceback. Internal slides and generated outputs are excluded from the release tree.

## Citation and license

Software author: **Zhihao Feng**, as identified in the original engine header. Machine-readable software citation metadata is provided in [CITATION.cff](CITATION.cff).

Related manuscript: Zhihao Feng, Christian T. Randolph, Tyler B. Martin, and Thomas E. Gartner III, *A Machine Learning Closure for Polymer Integral Equation Theory*. Publication details and DOI will be added when confirmed.

License selection is pending author approval. This candidate does not yet declare an open-source license.
