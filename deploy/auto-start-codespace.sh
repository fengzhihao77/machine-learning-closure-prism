#!/usr/bin/env bash
# One server per running Codespace; no keepalive or scheduled restart.
set -euo pipefail
if [[ "${CODESPACES:-false}" != "true" ]]; then
  exit 0
fi
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${HOME}/.cache/ml-closure-preview"
mkdir -p "${state_dir}"
exec 9>"${state_dir}/startup.lock"
flock 9
server_pid=""
if [[ -f "${state_dir}/server.pid" ]]; then
  read -r server_pid < "${state_dir}/server.pid"
  if [[ "${server_pid}" =~ ^[0-9]+$ ]] && kill -0 "${server_pid}" 2>/dev/null; then
    if ! tr '\0' '\n' < "/proc/${server_pid}/cmdline" | grep -Fxq -- "${project_dir}/run.py"; then
      echo "The saved PID belongs to another process; inspect ${state_dir}/server.pid before starting." >&2
      exit 1
    fi
  else
    server_pid=""
  fi
fi
if [[ -z "${server_pid}" ]]; then
  nohup bash "${project_dir}/deploy/start-codespace.sh" >>"${state_dir}/server.log" 2>&1 < /dev/null 9>&- &
  server_pid=$!
  echo "${server_pid}" > "${state_dir}/server.pid"
fi
for attempt in {1..90}; do
  if ! kill -0 "${server_pid}" 2>/dev/null; then
    echo "ML Closure stopped during startup; inspect ${state_dir}/server.log" >&2
    exit 1
  fi
  if curl --fail --silent --max-time 2 --output /dev/null "http://127.0.0.1:${PORT:-7860}/"; then
    echo "ML Closure is ready on private forwarded port ${PORT:-7860}."
    exit 0
  fi
  sleep 1
done
echo "Startup health check timed out; inspect ${state_dir}/server.log" >&2
exit 1
