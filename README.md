# Machine Learning Closure for PRISM

An interactive Predictor for polymer structure using a machine learning closure for PRISM integral equation theory.

## [Open the Predictor](https://ml-closure-predictor-g9v7w4g9jvq3pgg7-7860.app.github.dev)

**Version: 1.0.6-rc.1** · Private, on-demand Codespaces preview.

This preview is accessible to its Codespace owner. The owner can [resume the Codespace](https://ml-closure-predictor-g9v7w4g9jvq3pgg7.github.dev) when stopped; other users with repository access can [create their own Codespace](https://codespaces.new/fengzhihao77/machine-learning-closure-prism). This preview is configured to stop after 10 idle minutes and delete its Codespace after 7 inactive days; the GitHub repository is preserved. Included free usage depends on your account and remaining quota.

## Run locally

Use Python **3.9.23**, Google Chrome, and a compatible ChromeDriver on `PATH`. On macOS ARM64, install the recorded environment with [uv](https://docs.astral.sh/uv/getting-started/installation/):

```bash
git clone https://github.com/fengzhihao77/machine-learning-closure-prism.git
cd machine-learning-closure-prism
uv python install 3.9.23
uv venv --python 3.9.23 .venv
source .venv/bin/activate
uv pip install -r requirements-macos-arm64.lock.txt
python run.py
```

Open [localhost:5000](http://127.0.0.1:5000) after launch. Other platforms can start from `requirements.txt` and require separate compatibility checks. Keep `ml_closure_models/` intact and run one prediction at a time.

The Codespaces build completed three reference state-point checks. Numerical results can differ slightly from the macOS reference environment.

## Citation

[Paper](https://arxiv.org/abs/2509.11030) · [Software citation](CITATION.cff).

## History

Created **February 2, 2023**, with the original history preserved. [Commit history](https://github.com/fengzhihao77/machine-learning-closure-prism/commits/main/) · [Changelog](CHANGELOG.md).

The repository is private; a software license has not yet been selected.
