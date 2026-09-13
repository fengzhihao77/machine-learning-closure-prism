"""Launch the approved interface around the unchanged scientific engine.

Use one application process. Outputs live in a separate runtime directory;
the protected model bundle is only read through compatibility symlinks.
"""
import importlib
import logging
import os
from pathlib import Path
import sys
import tempfile
import threading


ROOT = Path(__file__).resolve().parent
_app = None
_log_stream = None


class _TerminalTee:
    """Copy real Python stdout/stderr to the local viewer and original terminal."""

    def __init__(self, original, capture, lock):
        self.original, self.capture, self.lock = original, capture, lock

    def write(self, text):
        with self.lock:
            self.original.write(text)
            self.capture.write(text)
            self.capture.flush()
        return len(text)

    def flush(self):
        with self.lock:
            self.original.flush()
            self.capture.flush()

    def __getattr__(self, name):
        return getattr(self.original, name)


def create_app(runtime_dir=None, capture_output=True):
    """Return the original Flask app configured for this directory layout.

    Call once per process. ``runtime_dir`` (or ML_CLOSURE_RUNTIME_DIR) must be
    empty; by default a new temporary directory is created. The process stays
    in that directory because the original engine resolves files from cwd.
    Set capture_output=False when a process supervisor already captures logs.
    """
    global _app, _log_stream
    if _app is not None:
        if runtime_dir and Path(runtime_dir).resolve() != Path(_app.config['ML_CLOSURE_RUNTIME_DIR']):
            raise RuntimeError('Use a separate process for a different runtime directory.')
        return _app

    bundle = ROOT / 'ml_closure_models'
    requested = runtime_dir or os.environ.get('ML_CLOSURE_RUNTIME_DIR')
    runtime = Path(requested).expanduser().resolve() if requested else Path(tempfile.mkdtemp(prefix='ml-closure-'))
    if runtime == ROOT or ROOT in runtime.parents:
        raise ValueError('Choose a runtime directory outside the source project.')
    runtime.mkdir(parents=True, exist_ok=True)
    if any(runtime.iterdir()):
        raise ValueError('The runtime directory must be empty to preserve previous outputs.')
    output = runtime / 'static' / 'pred_results'
    output.mkdir(parents=True)
    (runtime / 'scalers_and_models').symlink_to(bundle / 'scalers_and_weights', target_is_directory=True)
    (runtime / 'ML_w_k_predictor').symlink_to(bundle / 'ML_w_k_predictor', target_is_directory=True)
    for asset_dir in ('css_script', 'presentation'):
        (runtime / 'static' / asset_dir).symlink_to(ROOT / 'static' / asset_dir, target_is_directory=True)

    if capture_output:
        _log_stream = (output / 'terminal.log').open('a', encoding='utf-8', buffering=1)
        lock = threading.RLock()
        sys.stdout = _TerminalTee(sys.stdout, _log_stream, lock)
        sys.stderr = _TerminalTee(sys.stderr, _log_stream, lock)
    # Static polling should not continuously append its own access requests.
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(bundle))
    for name in ('ML_closure', 'QHO'):
        loaded = sys.modules.get(name)
        if loaded and Path(loaded.__file__).resolve().parent != bundle:
            raise RuntimeError('A different scientific engine is already imported; start a fresh process.')
    os.chdir(runtime)
    engine = importlib.import_module('ML_closure')
    app = engine.app
    app.template_folder = str(ROOT / 'templates')
    app.static_folder = str(runtime / 'static')
    from jinja2 import FileSystemLoader
    app.jinja_loader = FileSystemLoader(app.template_folder)

    # The original engine uses fixed output names. Prevent overlapping POSTs
    # while allowing the browser to fetch static assets and terminal updates.
    from flask import g, request
    prediction_lock = threading.Lock()

    @app.before_request
    def reserve_prediction():
        if request.method == 'POST' and request.path == '/predict':
            if not prediction_lock.acquire(blocking=False):
                return 'Another calculation is running. Wait for it to finish before retrying.', 409
            g.ml_closure_prediction_lock = True

    @app.teardown_request
    def release_prediction(_error):
        if g.pop('ml_closure_prediction_lock', False):
            prediction_lock.release()

    app.config['ML_CLOSURE_RUNTIME_DIR'] = str(runtime)
    app.extensions['ml_closure_runtime'] = {'directory': runtime, 'output_dir': output, 'engine': engine}
    _app = app
    print('ML Closure runtime: {}'.format(runtime), flush=True)
    return app


if __name__ == '__main__':
    application = create_app()
    application.run(host=os.environ.get('HOST', '127.0.0.1'), port=int(os.environ.get('PORT', '5000')),
                    debug=False, use_reloader=False, threaded=True)
