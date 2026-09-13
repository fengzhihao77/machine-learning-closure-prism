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
python3 - "${project_dir}" "${state_dir}" <<'PY'
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request

project, state = map(Path, sys.argv[1:])
port = int(os.environ.get("PORT", "7860"))
pid_file = state / "server.pid"
log_file = state / "server.log"
expected_script = str(project / "run.py")


def owned_process(pid):
    """An existing PID must still be this user's Python launcher."""
    try:
        process = Path("/proc") / str(pid)
        arguments = (process / "cmdline").read_bytes().split(b"\0")
        executable = Path(os.readlink(process / "exe")).name
        return (process.stat().st_uid == os.getuid()
                and expected_script.encode() in arguments
                and executable.startswith("python"))
    except (OSError, ValueError):
        return False


def listeners():
    """Find kernel LISTEN socket inodes, without trusting an HTTP response."""
    found = set()
    for table in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            rows = Path(table).read_text().splitlines()[1:]
        except FileNotFoundError:
            continue
        for row in rows:
            fields = row.split()
            if fields[3] == "0A" and int(fields[1].rsplit(":", 1)[1], 16) == port:
                found.add(fields[9])
    return found


def process_sockets(pid):
    found = set()
    try:
        descriptors = list((Path("/proc") / str(pid) / "fd").iterdir())
    except OSError:
        return found
    for descriptor in descriptors:
        try:
            target = os.readlink(descriptor)
        except OSError:
            continue
        if target.startswith("socket:[") and target.endswith("]"):
            found.add(target[8:-1])
    return found


def fail(message):
    raise SystemExit(message)


try:
    saved_pid = int(pid_file.read_text().strip())
except (OSError, ValueError):
    saved_pid = None
pid = saved_pid if saved_pid and saved_pid > 0 and owned_process(saved_pid) else None
child = None
if pid is None:
    # Do not kill an unrelated process whose PID was reused after a resume.
    # Refuse an occupied port before clearing stale state or launching anything.
    if listeners():
        fail(f"Port {port} is already in use by another process; ML Closure was not started.")
    try:
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(("0.0.0.0", port))
    except OSError as error:
        fail(f"Port {port} is unavailable; ML Closure was not started: {error}")
    pid_file.unlink(missing_ok=True)
    with log_file.open("ab") as log:
        child = subprocess.Popen(
            ["bash", str(project / "deploy" / "start-codespace.sh")],
            stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
            start_new_session=True, close_fds=True,
        )
    pid = child.pid
    pid_file.write_text(f"{pid}\n")

deadline = time.monotonic() + 90
while time.monotonic() < deadline:
    if child is not None and child.poll() is not None:
        fail(f"ML Closure stopped during startup; inspect {log_file}")
    if child is None and not owned_process(pid):
        fail(f"The saved ML Closure process stopped; inspect {log_file}")
    listening = listeners()
    sockets = process_sockets(pid)
    if listening - sockets:
        fail(f"Port {port} belongs to another process; no ready status was reported.")
    if listening and listening <= sockets and owned_process(pid):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2) as response:
                healthy = response.status == 200
            # Recheck ownership after HTTP in case the process exited meanwhile.
            current = listeners()
            if healthy and owned_process(pid) and current and current <= process_sockets(pid):
                print(f"ML Closure is ready on forwarded port {port}.")
                break
        except (OSError, ValueError):
            pass
    time.sleep(1)
else:
    fail(f"Startup health check timed out; inspect {log_file}")
PY
