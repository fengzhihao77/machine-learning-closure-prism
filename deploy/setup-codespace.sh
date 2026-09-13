#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$(uname -m)" != "x86_64" ]]; then
  echo "This Codespaces setup targets Linux x86_64." >&2
  exit 1
fi
python3.9 -c 'import sys; assert sys.version_info[:3] == (3,9,23), sys.version'
env_dir="${ML_CLOSURE_ENV_DIR:-${HOME}/.venvs/ml-closure-py39}"
python3.9 -m venv "${env_dir}"
"${env_dir}/bin/python" -m pip install --no-cache-dir -r "${project_dir}/requirements.txt" -c "${project_dir}/deploy/constraints-reference-common.txt"
"${env_dir}/bin/python" -m pip install --no-cache-dir --no-deps -r "${project_dir}/deploy/requirements-web.txt"
"${env_dir}/bin/python" -m pip check

# Chrome for Testing publishes matching browser/driver assets. These files are
# installation tools outside the scientific engine and outside the repository.
sudo apt-get update
sudo apt-get install -y --no-install-recommends libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libasound2t64 libcups2t64 libpango-1.0-0 libcairo2 fonts-liberation openssh-server
"${env_dir}/bin/python" "${project_dir}/deploy/install-browser.py"
# Selenium 4.12 discovers stable Chrome at this canonical Linux path.
# Preserve any unrelated installation rather than replacing it.
browser_dir="${ML_CLOSURE_BROWSER_DIR:-${HOME}/.local/ml-closure-browser}"
chrome_target="$(readlink -f -- "${browser_dir}/chrome-linux64/chrome")"
if [[ -e /usr/bin/google-chrome || -L /usr/bin/google-chrome ]]; then
  if [[ "$(readlink -f -- /usr/bin/google-chrome)" != "${chrome_target}" ]]; then
    echo "An unrelated /usr/bin/google-chrome already exists; it was not changed." >&2
    exit 1
  fi
else
  sudo ln -s -- "${chrome_target}" /usr/bin/google-chrome
fi
echo "Setup complete. Start with: bash deploy/start-codespace.sh"
echo "Keep forwarded port 7860 private; stop the codespace when finished."
