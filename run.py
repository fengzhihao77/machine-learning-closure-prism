"""Launch the approved interface around the unchanged scientific engine.

Use one application process. Outputs live in a separate runtime directory;
the protected model bundle is only read through compatibility symlinks.
"""
import importlib
import io
import logging
import math
import os
from pathlib import Path
import posixpath
import re
import secrets
import shutil
import sys
import tempfile
import threading
import time
import traceback
from contextlib import contextmanager


ROOT = Path(__file__).resolve().parent
_app = None

RUN_TOKEN = re.compile(r'^[A-Za-z0-9_-]{43}$')
RUN_PREDICT_PATH = re.compile(r'^/api/runs/[A-Za-z0-9_-]{43}/predict$')
OUTPUT_FILES = ('g_r.png', 'h_k.png', 'w_k.png', 'c_k.png', 's_k.png', 'pred_data.txt')


class KeepAliveWSGI:
    """Keep a long prediction response active without changing the engine.

    Prediction POSTs use a worker. Short responses retain their original
    status, headers, and body. A long response commits HTTP 200 for transport
    heartbeats, so its eventual success must still be checked in the returned
    HTML. A late failure is replaced with HTML that cannot pass that check.
    One worker may run at a time; disconnecting does not cancel its calculation.
    """

    _heartbeat = b'<!-- ML Closure connection heartbeat.' + b' ' * 2048 + b' -->\n'
    _failure = (b'<!doctype html><html><body><p>The calculation could not be '
                b'completed. Check the live terminal before trying again.'
                b'</p></body></html>')

    def __init__(self, application, interval=10.0, max_request_bytes=65536,
                 max_response_bytes=2 * 1024 * 1024):
        self.application = application
        self.interval = float(interval)
        if not math.isfinite(self.interval) or self.interval <= 0:
            raise ValueError('The heartbeat interval must be positive and finite.')
        if (not isinstance(max_request_bytes, int) or not isinstance(max_response_bytes, int)
                or max_request_bytes <= 0 or max_response_bytes <= 0):
            raise ValueError('Request and response limits must be positive.')
        self.max_request_bytes = int(max_request_bytes)
        self.max_response_bytes = int(max_response_bytes)
        self._admission = threading.Lock()

    @staticmethod
    def _reply(start_response, status, body):
        start_response(status, [('Content-Type', 'text/html; charset=utf-8'),
                                ('Content-Length', str(len(body))),
                                ('Cache-Control', 'no-store'),
                                ('Referrer-Policy', 'no-referrer')])
        return [body]

    def _read_input(self, environ):
        """Copy the small form body before a worker can outlive its socket."""
        length = environ.get('CONTENT_LENGTH', '')
        source = environ.get('wsgi.input')
        if length:
            length = int(length)
            if length < 0:
                raise ValueError('Negative request size.')
            if length > self.max_request_bytes:
                raise OverflowError('Request body is too large.')
            chunks = []
            remaining = length
            while remaining:
                chunk = source.read(remaining)
                if not isinstance(chunk, bytes) or not chunk or len(chunk) > remaining:
                    raise ValueError('Incomplete request body.')
                chunks.append(chunk)
                remaining -= len(chunk)
            return b''.join(chunks)
        if environ.get('wsgi.input_terminated'):
            body = source.read(self.max_request_bytes + 1)
            if not isinstance(body, bytes):
                raise ValueError('Invalid request body.')
            if len(body) > self.max_request_bytes:
                raise OverflowError('Request body is too large.')
            return body
        return b''

    @staticmethod
    def _log_exception(environ):
        try:
            traceback.print_exc(file=environ.get('wsgi.errors', sys.stderr))
        except Exception:
            # A closed client error stream must not prevent worker cleanup.
            pass

    def _work(self, environ, state):
        response = None
        buffer = io.BytesIO()
        input_stream = environ['wsgi.input']

        def write(data):
            if state['status'] is None:
                raise RuntimeError('WSGI output preceded start_response.')
            if not isinstance(data, bytes):
                raise TypeError('WSGI response chunks must be bytes.')
            if buffer.tell() + len(data) > self.max_response_bytes:
                raise RuntimeError('Prediction response exceeded its size limit.')
            buffer.write(data)

        def capture_start_response(status, headers, exc_info=None):
            if exc_info is not None:
                try:
                    # The original body has not been transmitted; discard any
                    # buffered partial success when the app replaces it.
                    buffer.seek(0)
                    buffer.truncate()
                finally:
                    exc_info = None
            elif state['status'] is not None:
                raise RuntimeError('WSGI start_response was called twice.')
            if (not isinstance(status, str) or len(status) < 5
                    or not status[:3].isdigit() or status[3] != ' '
                    or '\r' in status or '\n' in status):
                raise ValueError('Invalid WSGI response status.')
            headers = list(headers)
            if any(not isinstance(name, str) or not isinstance(value, str)
                   or '\r' in name or '\n' in name or '\r' in value or '\n' in value
                   for name, value in headers):
                raise ValueError('Invalid WSGI response headers.')
            state['status'], state['headers'] = status, headers
            return write

        try:
            # Flask establishes and tears down its own contexts in this worker.
            # Consume and close the iterable here too, including close callbacks.
            response = self.application(environ, capture_start_response)
            for chunk in response:
                write(chunk)
            if state['status'] is None:
                raise RuntimeError('WSGI application did not start a response.')
        except BaseException:
            state['failed'] = True
            self._log_exception(environ)
        finally:
            try:
                if response is not None and hasattr(response, 'close'):
                    response.close()
            except BaseException:
                state['failed'] = True
                self._log_exception(environ)
            finally:
                if not state['abandoned'].is_set() and not state['failed']:
                    state['body'] = buffer.getvalue()
                buffer.close()
                input_stream.close()
                self._admission.release()
                state['ready'].set()

    def _stream(self, state):
        try:
            while not state['ready'].is_set():
                yield self._heartbeat
                state['ready'].wait(self.interval)
            headers = {name.lower(): value for name, value in state['headers']}
            html = headers.get('content-type', '').lower().startswith('text/html')
            encoded = headers.get('content-encoding', '').lower() not in ('', 'identity')
            if (state['failed'] or not state['status'].startswith('200 ')
                    or not html or encoded):
                yield self._failure
            else:
                yield state['body']
        finally:
            # The calculation owns admission until its worker finishes, even
            # when the browser or reverse proxy closes this iterable early.
            state['abandoned'].set()
            state['body'] = b''

    def __call__(self, environ, start_response):
        path = environ.get('PATH_INFO', '')
        if (environ.get('REQUEST_METHOD') != 'POST'
                or not (path == '/predict' or RUN_PREDICT_PATH.fullmatch(path))):
            return self.application(environ, start_response)
        try:
            body = self._read_input(environ)
        except OverflowError:
            return self._reply(start_response, '413 Payload Too Large', b'Request body is too large.')
        except (OSError, TypeError, ValueError, AttributeError):
            return self._reply(start_response, '400 Bad Request', b'The request body could not be read.')
        if not self._admission.acquire(blocking=False):
            return self._reply(start_response, '409 Conflict',
                               b'Another calculation is running. Wait for it to finish before retrying.')
        worker_environ = environ.copy()
        worker_environ['wsgi.input'] = io.BytesIO(body)
        worker_environ['CONTENT_LENGTH'] = str(len(body))
        worker_environ['wsgi.multithread'] = True
        state = {'ready': threading.Event(), 'abandoned': threading.Event(),
                 'status': None, 'headers': [], 'body': b'', 'failed': False}
        worker = threading.Thread(target=self._work, args=(worker_environ, state),
                                  name='ml-closure-prediction', daemon=True)
        try:
            worker.start()
        except BaseException:
            worker_environ['wsgi.input'].close()
            self._admission.release()
            self._log_exception(environ)
            return self._reply(start_response, '500 Internal Server Error', self._failure)
        if state['ready'].wait(self.interval):
            if state['failed']:
                return self._reply(start_response, '500 Internal Server Error', self._failure)
            start_response(state['status'], state['headers'])
            return [state['body']]
        try:
            start_response('200 OK', [('Content-Type', 'text/html; charset=utf-8'),
                                      ('Cache-Control', 'no-store, no-transform'),
                                      ('Referrer-Policy', 'no-referrer'),
                                      ('X-Accel-Buffering', 'no')])
        except BaseException:
            state['abandoned'].set()
            raise
        return self._stream(state)


class _BoundedLog:
    """Append a bounded prefix; truncation never invents a model outcome."""

    _notice = b'\n[Terminal capture reached its size limit.]\n'

    def __init__(self, path, limit):
        self.stream = Path(path).open('ab', buffering=0)
        self.remaining = limit
        self.truncated = False

    def write(self, text):
        if self.truncated:
            return
        # Restrict encoding work too if an unexpected caller writes a huge string.
        data = text[:self.remaining + 1].encode('utf-8', errors='replace')
        available = max(0, self.remaining - len(self._notice))
        if len(data) <= available and len(text) <= self.remaining:
            self.stream.write(data)
            self.remaining -= len(data)
        else:
            self.stream.write(data[:available])
            notice = self._notice[:max(0, self.remaining - available)]
            self.stream.write(notice)
            self.remaining = 0
            self.truncated = True

    def flush(self):
        self.stream.flush()

    def close(self):
        self.stream.close()


class _TerminalTee:
    """Route a job thread to its own log; leave other threads on the console."""

    def __init__(self, original, router):
        self.original, self.router = original, router

    def write(self, text):
        sink = getattr(self.router.local, 'sink', None)
        if sink is None:
            return self.original.write(text)
        sink.write(text)
        return len(text)

    def flush(self):
        sink = getattr(self.router.local, 'sink', None)
        (sink if sink is not None else self.original).flush()

    def __getattr__(self, name):
        return getattr(self.original, name)


class _JobLogRouter:
    def __init__(self, enabled=True):
        self.local = threading.local()
        self.enabled = enabled
        if enabled:
            sys.stdout = _TerminalTee(sys.stdout, self)
            sys.stderr = _TerminalTee(sys.stderr, self)

    @contextmanager
    def capture(self, path, limit):
        log = _BoundedLog(path, limit)
        previous = getattr(self.local, 'sink', None)
        self.local.sink = log
        try:
            yield
        finally:
            self.local.sink = previous
            log.close()


class RunRegistry:
    """Own bounded generated job directories, independent of scientific files."""

    def __init__(self, root, ttl_seconds=3600, max_jobs=32,
                 max_log_bytes=1048576, max_output_bytes=8388608):
        if not math.isfinite(ttl_seconds) or ttl_seconds <= 0:
            raise ValueError('Job retention must be positive and finite.')
        if any(not isinstance(value, int) or value <= 0
               for value in (max_jobs, max_log_bytes, max_output_bytes)):
            raise ValueError('Job resource limits must be positive integers.')
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.ttl_seconds = ttl_seconds
        self.max_jobs = max_jobs
        self.max_log_bytes = max_log_bytes
        self.max_output_bytes = max_output_bytes
        self.jobs = {}
        self.lock = threading.RLock()
        self.compute_lock = threading.Lock()

    def _expire_locked(self):
        now = time.monotonic()
        for token, job in list(self.jobs.items()):
            if job['state'] != 'running' and job['expires_at'] <= now:
                directory = job['directory']
                # Only remove directories allocated by this registry instance.
                if directory.parent != self.root or directory.name != token:
                    raise RuntimeError('Invalid generated job directory.')
                if directory.is_symlink():
                    directory.unlink()
                elif directory.exists():
                    shutil.rmtree(directory)
                del self.jobs[token]

    def allocate(self):
        with self.lock:
            self._expire_locked()
            if len(self.jobs) >= self.max_jobs:
                raise OverflowError('The result store is full. Please try again later.')
            while True:
                token = secrets.token_urlsafe(32)
                directory = self.root / token
                try:
                    directory.mkdir(mode=0o700)
                    break
                except FileExistsError:
                    continue
            log_path = directory / 'terminal.log'
            try:
                log_path.touch(mode=0o600, exist_ok=False)
            except BaseException:
                directory.rmdir()
                raise
            job = {'token': token, 'directory': directory, 'log_path': log_path,
                   'state': 'created',
                   'expires_at': time.monotonic() + min(self.ttl_seconds, 120)}
            self.jobs[token] = job
            return job

    def get(self, token):
        if not RUN_TOKEN.fullmatch(token):
            return None
        with self.lock:
            self._expire_locked()
            return self.jobs.get(token)

    def claim(self, token):
        with self.lock:
            job = self.get(token)
            if job is None or job['state'] != 'created':
                return None
            job['state'] = 'running'
            return job

    def finish(self, job, succeeded):
        with self.lock:
            job['state'] = 'complete' if succeeded else 'failed'
            job['expires_at'] = time.monotonic() + self.ttl_seconds

    def snapshot(self, job, output):
        pending = job['directory'] / 'pending'
        pending.mkdir(mode=0o700)
        total = 0
        try:
            for filename in OUTPUT_FILES:
                source = Path(output) / filename
                if source.is_symlink() or not source.is_file() or source.stat().st_size == 0:
                    raise RuntimeError('The calculation did not produce every result file.')
                target = pending / filename
                with source.open('rb') as reader, target.open('xb') as writer:
                    while True:
                        chunk = reader.read(65536)
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > self.max_output_bytes:
                            raise RuntimeError('The result files exceeded their size limit.')
                        writer.write(chunk)
                target.chmod(0o400)
            pending.replace(job['directory'] / 'files')
        except BaseException:
            if pending.exists():
                shutil.rmtree(pending)
            raise


def install_run_api(app, output_dir, jobs_dir, *, capture_output=True,
                    ttl_seconds=3600, max_jobs=32, max_log_bytes=1048576,
                    max_output_bytes=8388608):
    """Expose isolated, single-use runs around the unchanged predict function."""
    from flask import abort, jsonify, request, send_file

    original_predict = app.view_functions['predict']
    original_static = app.view_functions.get('static')
    output = Path(output_dir).resolve()
    registry = RunRegistry(jobs_dir, ttl_seconds, max_jobs, max_log_bytes, max_output_bytes)
    router = _JobLogRouter(capture_output)
    app.config['MAX_CONTENT_LENGTH'] = 65536

    def clear_shared_outputs():
        for filename in OUTPUT_FILES:
            path = output / filename
            if path.is_symlink() or path.exists():
                if path.is_dir() and not path.is_symlink():
                    raise RuntimeError('An unexpected directory occupies a result filename.')
                path.unlink()

    @app.before_request
    def block_shared_routes():
        path = posixpath.normpath(request.path.replace('\\', '/'))
        if path == '/predict' or path == '/static/pred_results' or path.startswith('/static/pred_results/'):
            abort(404)

    if original_static is not None:
        def presentation_static(filename):
            if '\\' in filename or '..' in filename.split('/'):
                abort(404)
            normalized = posixpath.normpath(filename.replace('\\', '/'))
            if not normalized.startswith(('presentation/', 'css_script/')):
                abort(404)
            return original_static(filename=filename)
        app.view_functions['static'] = presentation_static

    @app.after_request
    def private_run_headers(response):
        response.headers['Referrer-Policy'] = 'no-referrer'
        if request.path.startswith('/api/runs'):
            response.headers['Cache-Control'] = 'no-store, max-age=0'
        return response

    @app.route('/api/runs', methods=['POST'])
    def allocate_run():
        if request.get_data(cache=False):
            return jsonify(error='Run allocation does not accept a request body.'), 400
        if registry.compute_lock.locked():
            return jsonify(error='Another calculation is running. Please try again shortly.'), 409
        try:
            job = registry.allocate()
        except OverflowError as error:
            return jsonify(error=str(error)), 429
        prefix = '/api/runs/' + job['token']
        return jsonify(predict_url=prefix + '/predict', output_base=prefix + '/files/',
                       log_url=prefix + '/terminal.log'), 201

    @app.route('/api/runs/<token>/predict', methods=['POST'])
    def predict_run(token):
        if registry.get(token) is None:
            abort(404)
        if not registry.compute_lock.acquire(blocking=False):
            return jsonify(error='Another calculation is running. Please try again shortly.'), 409
        job = None
        succeeded = False
        try:
            job = registry.claim(token)
            if job is None:
                return jsonify(error='This run has already been submitted. Start a new run.'), 409
            pairs = list(request.form.items(multi=True))
            if [key for key, _ in pairs] != ['N', 'epsilon', 'rho'] or request.files:
                return jsonify(error='Provide exactly N, epsilon, and rho in that order.'), 400
            try:
                n, epsilon, rho = (float(value) for _, value in pairs)
            except (TypeError, ValueError, OverflowError):
                return jsonify(error='State-point values must be finite numbers.'), 400
            if (not all(math.isfinite(value) for value in (n, epsilon, rho))
                    or not n.is_integer() or not 20 <= n <= 100
                    or not 0 <= epsilon <= 0.5 or not 0.2 <= rho <= 0.8):
                return jsonify(error='Use integer N from 20 to 100, epsilon from 0 to 0.5, and rho from 0.2 to 0.8.'), 400
            with router.capture(job['log_path'], registry.max_log_bytes):
                try:
                    clear_shared_outputs()
                    # The original view reads the original ordered form in this
                    # very same Flask request context; no scientific code changes.
                    response = None
                    try:
                        response = app.make_response(original_predict())
                        body = response.get_data()
                    finally:
                        if response is not None:
                            # Complete generator cleanup and response callbacks
                            # while this job still owns capture and admission.
                            response.close()
                    if response.status_code != 200 or b'data-server-success="true"' not in body:
                        raise RuntimeError('The engine did not confirm a completed calculation.')
                    completed = app.response_class(body, status=response.status,
                                                   headers=response.headers)
                    registry.snapshot(job, output)
                    succeeded = True
                    return completed
                except Exception:
                    traceback.print_exc(file=sys.stderr)
                    try:
                        clear_shared_outputs()
                    except Exception:
                        traceback.print_exc(file=sys.stderr)
                    return jsonify(error='The calculation could not be completed. Check this run\'s terminal.'), 500
        finally:
            if job is not None:
                registry.finish(job, succeeded)
            registry.compute_lock.release()

    @app.route('/api/runs/<token>/terminal.log', methods=['GET'])
    def run_terminal(token):
        with registry.lock:
            job = registry.get(token)
            if job is None:
                abort(404)
            return app.response_class(job['log_path'].read_bytes(), mimetype='text/plain')

    @app.route('/api/runs/<token>/files/<path:filename>', methods=['GET'])
    def run_file(token, filename):
        if filename not in OUTPUT_FILES:
            abort(404)
        with registry.lock:
            job = registry.get(token)
            if job is None:
                abort(404)
            if job['state'] != 'complete':
                return jsonify(error='This run has no completed result files.'), 409
            path = job['directory'] / 'files' / filename
            return send_file(path, mimetype='image/png' if filename.endswith('.png') else 'text/plain',
                             conditional=False, etag=False, max_age=0, download_name=filename)

    app.extensions['ml_closure_runs'] = registry
    return registry


def create_app(runtime_dir=None, capture_output=True):
    """Return the original Flask app configured for this directory layout.

    Call once per process. ``runtime_dir`` (or ML_CLOSURE_RUNTIME_DIR) must be
    empty; by default a new temporary directory is created. The process stays
    in that directory because the original engine resolves files from cwd.
    Set capture_output=False to disable per-run Python terminal capture.
    """
    global _app
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

    install_run_api(app, output, runtime / 'runs', capture_output=capture_output)
    app.wsgi_app = KeepAliveWSGI(app.wsgi_app)
    app.config['ML_CLOSURE_RUNTIME_DIR'] = str(runtime)
    app.extensions['ml_closure_runtime'] = {'directory': runtime, 'output_dir': output, 'engine': engine}
    _app = app
    print('ML Closure runtime: {}'.format(runtime), flush=True)
    return app


if __name__ == '__main__':
    application = create_app()
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', '5000'))
    server = os.environ.get('ML_CLOSURE_SERVER', 'flask')
    if server == 'waitress':
        from waitress import serve
        serve(application, host=host, port=port, threads=8, connection_limit=64,
              max_request_body_size=65536, expose_tracebacks=False)
    elif server == 'flask':
        application.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)
    else:
        raise ValueError('ML_CLOSURE_SERVER must be flask or waitress.')
