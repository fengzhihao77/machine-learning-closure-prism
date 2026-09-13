# Machine Learning Closure for PRISM

An interactive Predictor for polymer structure using a machine learning closure for PRISM integral equation theory.

**[Open the local Predictor](http://127.0.0.1:5000)** after starting the application below.

**Version: 1.0.6-rc.1**

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

Other platforms can start from `requirements.txt` and require separate compatibility checks. The application runs from source. Keep `ml_closure_models/` intact; generated results and logs use a separate temporary directory. Run one prediction at a time.

## Citation

[A Machine Learning Closure for Polymer Integral Equation Theory](https://arxiv.org/abs/2509.11030), by Zhihao Feng, Christian T. Randolph, Tyler B. Martin, and Thomas E. Gartner III. Software citation: [CITATION.cff](CITATION.cff).

## History

Created **February 2, 2023**, with the original history preserved. [Commit history](https://github.com/fengzhihao77/machine-learning-closure-prism/commits/main/) · [Changelog](CHANGELOG.md).

The repository is private; a software license has not yet been selected.
