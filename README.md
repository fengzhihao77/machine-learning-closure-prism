# Machine Learning Closure for PRISM

An open-source, interactive Predictor for polymer structure using a machine learning closure for PRISM integral equation theory.

## [Run the Predictor online](https://mybinder.org/v2/gh/fengzhihao77/machine-learning-closure-prism/dc077983e02724e0e1c1f8450bb5124244086e26?urlpath=predictor%2F)

**Version: 1.0.6-rc.1** · [MIT license](LICENSE).

Binder opens a free, temporary Predictor session for you, with no installation or GitHub sign-in. Startup can take a few minutes. Enter a state point and run one calculation at a time; keep the tab open while it runs.

Download results promptly: they expire after one hour, and Binder sessions shut down when idle or when their resource allowance is exhausted. Open the launch link again for a new session. Binder uses community compute rather than the maintainer’s GitHub quota. If Binder is busy, retry later, [create your own Codespace](https://codespaces.new/fengzhihao77/machine-learning-closure-prism), or run locally below.

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

Numerical results can vary across operating systems and processors. Use the recorded macOS environment above when reproducing its reference outputs.

## Citation

[Paper](https://arxiv.org/abs/2509.11030) · [Software citation](CITATION.cff).

## History

Development history dates to **February 2023**. [Commit history](https://github.com/fengzhihao77/machine-learning-closure-prism/commits/main/) · [Changelog](CHANGELOG.md).

Released under the [MIT license](LICENSE).
