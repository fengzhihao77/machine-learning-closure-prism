"""Install a matching official Chrome for Testing pair for a private Codespace."""
from pathlib import Path
import json
import os
import platform
import subprocess
import tempfile
import urllib.request
import zipfile

VERSION = "153.0.8010.36"
if platform.system() != "Linux" or platform.machine() != "x86_64":
    raise SystemExit("The Codespaces browser package targets Linux x86_64.")
root = Path(os.environ.get("ML_CLOSURE_BROWSER_DIR", str(Path.home() / ".local/ml-closure-browser")))
root.mkdir(parents=True, exist_ok=True)
for component in ("chrome", "chromedriver"):
    url = f"https://storage.googleapis.com/chrome-for-testing-public/{VERSION}/linux64/{component}-linux64.zip"
    executable = root / f"{component}-linux64" / component
    if not executable.exists():
        with tempfile.NamedTemporaryFile(suffix=".zip") as archive:
            urllib.request.urlretrieve(url, archive.name)
            with zipfile.ZipFile(archive.name) as package:
                for member in package.infolist():
                    destination = (root / member.filename).resolve()
                    if root.resolve() not in destination.parents:
                        raise ValueError("Unexpected browser archive path")
                package.extractall(root)
                for member in package.infolist():
                    path = root / member.filename
                    mode = member.external_attr >> 16
                    if path.is_file() and mode:
                        path.chmod(mode & 0o777)
    executable.chmod(0o755)
    reported = subprocess.check_output([str(executable), "--version"], text=True).strip()
    if VERSION not in reported:
        raise RuntimeError(f"Installed {component} has an unexpected version: {reported}")
binary_dir = root / "bin"
binary_dir.mkdir(exist_ok=True)
for name, target in {
    "google-chrome": root / "chrome-linux64/chrome",
    "chromedriver": root / "chromedriver-linux64/chromedriver",
}.items():
    link = binary_dir / name
    if link.is_symlink() or link.exists():
        if link.resolve() != target.resolve():
            raise RuntimeError(f"Unexpected existing browser command: {link}")
    else:
        link.symlink_to(target)
(root / "installation.json").write_text(json.dumps({"version": VERSION, "platform": "linux64"}, indent=2) + "\n")
print(f"Installed Chrome and ChromeDriver {VERSION} in {root}")
