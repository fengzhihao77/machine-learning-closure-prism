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
import sys
import tempfile
import threading
import traceback


ROOT = Path(__file__).resolve().parent
_app = None
_log_stream = None


class KeepAliveWSGI:
    """Keep a long prediction response active without changing the engine.

    Only POST /predict uses a worker. Short responses retain their original
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
                                ('Cache-Control', 'no-store')])
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
        if environ.get('REQUEST_METHOD') != 'POST' or environ.get('PATH_INFO') != '/predict':
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
                                      ('X-Accel-Buffering', 'no')])
        except BaseException:
            state['abandoned'].set()
            raise
        return self._stream(state)


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

    app.wsgi_app = KeepAliveWSGI(app.wsgi_app)
    app.config['ML_CLOSURE_RUNTIME_DIR'] = str(runtime)
    app.extensions['ml_closure_runtime'] = {'directory': runtime, 'output_dir': output, 'engine': engine}
    _app = app
    print('ML Closure runtime: {}'.format(runtime), flush=True)
    return app


if __name__ == '__main__':
    application = create_app()
    application.run(host=os.environ.get('HOST', '127.0.0.1'), port=int(os.environ.get('PORT', '5000')),
                    debug=False, use_reloader=False, threaded=True)
