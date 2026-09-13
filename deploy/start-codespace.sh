#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
env_dir="${ML_CLOSURE_ENV_DIR:-${HOME}/.venvs/ml-closure-py39}"
browser_dir="${ML_CLOSURE_BROWSER_DIR:-${HOME}/.local/ml-closure-browser}"
export PATH="${browser_dir}/bin:${PATH}"
export HOST="${HOST:-0.0.0.0}" PORT="${PORT:-7860}"
export ML_CLOSURE_SERVER=waitress
export BOKEH_IN_DOCKER=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1
export TF_NUM_INTRAOP_THREADS=1 TF_NUM_INTEROP_THREADS=1 TF_CPP_MIN_LOG_LEVEL=2
"${env_dir}/bin/python" -c 'import sys; assert sys.version_info[:3] == (3,9,23), sys.version'
exec "${env_dir}/bin/python" "${project_dir}/run.py"
