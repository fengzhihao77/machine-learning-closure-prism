# Machine Learning Closure for PRISM

An open-source, interactive Predictor for polymer structure using a machine learning closure for PRISM integral equation theory.

## [Run the Predictor online](https://codespaces.new/fengzhihao77/machine-learning-closure-prism)

**Version: 1.0.6-rc.1** · [MIT license](LICENSE).

Sign in to GitHub and create your own Codespace using the link above. After setup, the Predictor opens on forwarded port 7860. Each Codespace uses its owner's compute and storage allowance; included free usage depends on your account and remaining quota. You can also run locally below.

The maintainer's existing [preview](https://ml-closure-predictor-g9v7w4g9jvq3pgg7-7860.app.github.dev) and [resume link](https://ml-closure-predictor-g9v7w4g9jvq3pgg7.github.dev) remain private to the maintainer. That preview stops after 10 idle minutes and expires after 7 inactive days; the public repository is preserved.

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

Created **February 2, 2023**. [Commit history](https://github.com/fengzhihao77/machine-learning-closure-prism/commits/main/) · [Changelog](CHANGELOG.md).

Released under the [MIT license](LICENSE).
