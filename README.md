# Machine Learning Closure for PRISM

An open-source, interactive Predictor for polymer structure using a machine learning closure for PRISM integral equation theory.

## [Run the Predictor online](https://potential-acorn-w6qgjrw66vx37v7-7860.app.github.dev)

**Version: 1.0.6-rc.1** · [MIT license](LICENSE).

Open the shared Predictor, enter a state point, and run a calculation. No installation or GitHub sign-in is required. The demo accepts one calculation at a time; if it is busy, try again shortly. Download your results promptly. They expire after one hour and are cleared if the server restarts.

The demo runs within the maintainer’s free Codespaces allowance and is available while its server is running. If it is offline, [create your own Codespace](https://codespaces.new/fengzhihao77/machine-learning-closure-prism) using your own GitHub allowance, or run locally below.

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

Development history dates to **February 2023**. [Commit history](https://github.com/fengzhihao77/machine-learning-closure-prism/commits/main/) · [Changelog](CHANGELOG.md).

Released under the [MIT license](LICENSE).
