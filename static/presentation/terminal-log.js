/* Read the existing process capture. Raw output stays in the popup; model outcomes
 * use a pre-POST byte boundary and complete, freshly appended engine messages.
 */
(() => {
  'use strict';
  const app = document.querySelector('[data-ml-app]');
  const dialog = document.getElementById('log-dialog');
  const output = document.getElementById('log-output');
  const view = window.MLClosureLogView;
  const modelLog = window.MLClosureModelLog;
  if (!app || !dialog || !output || !view || !app.dataset.terminalLogSrc) return;
  const url = new URL(app.dataset.terminalLogSrc, location.href);
  if (url.origin !== location.origin) return;
  let timer = null;
  let controller = null;
  let terminalActive = false;
  let epoch = 0;
  let sequence = 0;
  let pageActive = true;
  let run = null;
  let preflightController = null;
  let finalTimer = null;
  const busy = () => ['calculating', 'retrieving'].includes(app.dataset.state);
  const tracking = () => Boolean(run?.tracker && !run.tracker.snapshot().rejected && ['running', 'finishing'].includes(run.phase));
  const wanted = () => pageActive && (dialog.open || tracking());
  let wasBusy = busy();
  const escapedPath = url.pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ownRequest = new RegExp(`"(?:GET|HEAD) ${escapedPath}(?:\\?| |/)`);
  const emptyModels = () => ({ loaded: [], converged: [], failed: [], pending: [0, 1, 2, 3, 4], anchored: false, rejected: '' });

  function snapshot() {
    const status = run?.tracker?.snapshot() || emptyModels();
    const source = !run || run.phase === 'preparing' || (run.tracker && !status.rejected && !run.captureError) ? 'current-run-python' : 'unavailable';
    let note = 'Model outcomes come only from complete messages in the current run’s Python capture.';
    if (!run) note = 'No calculation has been submitted in this page.';
    else if (run.phase === 'preparing') note = 'Taking a terminal snapshot before submitting the calculation.';
    else if (status.rejected) note = status.rejected;
    else if (!run.tracker) note = 'A terminal snapshot could not be taken before submission. This calculation can continue, but per-model convergence cannot be attributed safely.';
    else if (run.captureError) note = status.anchored ? 'The current-run capture is unavailable or delayed. Previously observed outcomes remain; other models are unconfirmed.' : 'The current-run capture is unavailable or delayed. Per-model convergence is unconfirmed.';
    else if (!status.anchored) note = run.phase === 'complete' ? 'No fresh loading sequence was captured for this run. Per-model convergence is unconfirmed.' : 'Waiting for this run’s fresh Scaler_0 loading message. Loading is not convergence.';
    else if (run.phase === 'complete' && status.pending.length) note = 'The final capture does not contain every model outcome. Unobserved models remain unconfirmed.';
    else if (run.phase === 'complete') note = 'Final per-model outcomes observed in this run’s Python capture.';
    return {
      runId: run?.id || null, phase: run?.phase || 'idle', source,
      loaded: [...status.loaded], converged: [...status.converged], failed: [...status.failed], pending: [...status.pending],
      convergedCount: status.converged.length, observedCount: status.converged.length + status.failed.length,
      anchored: status.anchored, note
    };
  }
  function emit() { modelLog?.render(snapshot()); }
  function stop() {
    epoch += 1;
    clearTimeout(timer);
    timer = null;
    if (controller) controller.abort();
    controller = null;
  }
  function setState(state) {
    if (!dialog.open) return;
    dialog.dataset.terminalState = state;
    output.dataset.terminalState = state;
  }
  function visibleLines(text) {
    const plain = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r\n?/g, '\n');
    return plain.split('\n').filter((line) => !ownRequest.test(line));
  }
  function writeCapture(bytes) {
    if (!dialog.open) return;
    const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 48;
    if (!terminalActive) view.clear();
    terminalActive = true;
    setState('live');
    const lines = visibleLines(new TextDecoder().decode(bytes));
    const tail = (lines.length > 500 ? '[Showing the latest 500 terminal lines]\n' : '') + lines.slice(-500).join('\n');
    view.setSource('Local Python terminal · live', 'Actual stdout and stderr from this local server process; earlier calculations may also appear. Log-viewer HTTP requests are hidden.', 'terminal');
    output.textContent = tail || 'Waiting for the process to write terminal output…';
    if (atBottom) output.scrollTop = output.scrollHeight;
    output.dataset.terminalAvailable = 'true';
    output.dataset.capturedAt = new Date().toISOString();
  }
  function connecting() {
    if (!dialog.open) return;
    setState(terminalActive ? 'reconnecting' : 'connecting');
    if (terminalActive) view.setSource('Local Python terminal · reconnecting', 'Reading this local process’s captured output. The last capture remains below; earlier calculations may also appear.', 'terminal');
    else view.setSource('Connecting to Python terminal', 'Waiting for captured process output. Browser events remain below until the connection succeeds.', 'browser');
  }
  function captureError(error) {
    if (!dialog.open) return;
    if (error.status === 404) {
      setState('unavailable');
      if (!terminalActive) view.setSource('Browser events · terminal unavailable', 'Terminal capture is not enabled for this local server. These entries show browser requests and downloads, not Python output. Retrying while this popup is open.', 'browser');
      else view.setSource('Local Python terminal · unavailable', 'The log file is currently unavailable. The last captured output remains below; retrying while this popup is open.', 'terminal');
    } else {
      setState('reconnecting');
      if (terminalActive) view.setSource('Local Python terminal · reconnecting', 'The log connection is delayed. Displayed output may be stale; this does not indicate whether the calculation has stopped. Retrying while this popup is open.', 'terminal');
      else view.setSource('Browser events · terminal connection delayed', 'Terminal output could not be retrieved. These entries show browser activity; the calculation may still be running. Retrying while this popup is open.', 'browser');
    }
  }
  async function readCapture(requestController, timeoutMs) {
    let timeout;
    let onAbort;
    const cancelled = new Promise((_, reject) => {
      onAbort = () => reject(new DOMException('Capture request cancelled.', 'AbortError'));
      requestController.signal.addEventListener('abort', onAbort, { once: true });
      timeout = setTimeout(() => requestController.abort(), timeoutMs);
    });
    try {
      return await Promise.race([cancelled, (async () => {
        const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: requestController.signal });
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
        if ((response.headers.get('content-type') || '').includes('text/html')) throw new Error('The log URL returned an HTML page.');
        return new Uint8Array(await response.arrayBuffer());
      })()]);
    } finally {
      clearTimeout(timeout);
      requestController.signal.removeEventListener('abort', onAbort);
    }
  }
  function finish(target) {
    if (run !== target || target.phase !== 'finishing') return;
    clearTimeout(finalTimer);
    finalTimer = null;
    target.phase = 'complete';
    stop();
    emit();
    const resolve = target.resolve;
    target.resolve = null;
    if (resolve) resolve(snapshot());
    if (wanted()) { connecting(); poll(epoch); }
  }
  async function poll(currentEpoch) {
    const current = () => currentEpoch === epoch && wanted();
    if (!current()) return;
    const target = tracking() ? run : null;
    const requestController = new AbortController();
    controller = requestController;
    let nextDelay = tracking() ? 750 : busy() ? 1000 : 1200;
    try {
      const bytes = await readCapture(requestController, 5000);
      if (!current()) return;
      if (target && run === target && ['running', 'finishing'].includes(target.phase)) {
        target.captureError = false;
        const state = target.tracker.ingest(bytes);
        emit();
        if (target.phase === 'finishing' && (state.rejected || state.converged.length + state.failed.length === 5)) {
          writeCapture(bytes);
          finish(target);
          return;
        }
      }
      writeCapture(bytes);
    } catch (error) {
      if (!current()) return;
      if (target && run === target) { target.captureError = true; emit(); }
      captureError(error);
      if (error.status === 404) nextDelay = tracking() ? 750 : busy() ? 1500 : 5000;
    } finally {
      if (controller === requestController) controller = null;
      if (current()) timer = setTimeout(() => poll(currentEpoch), nextDelay);
    }
  }
  function restart() {
    stop();
    if (wanted() && run?.phase !== 'preparing') { connecting(); poll(epoch); }
  }
  function reset() {
    stop();
    clearTimeout(finalTimer);
    finalTimer = null;
    if (preflightController) preflightController.abort();
    preflightController = null;
    if (run?.resolve) run.resolve({ ...snapshot(), phase: 'cancelled' });
    run = null;
    emit();
    if (wanted()) { connecting(); poll(epoch); }
  }
  async function prepare() {
    reset();
    stop();
    const target = { id: ++sequence, phase: 'preparing', tracker: null, captureError: false, resolve: null };
    run = target;
    emit();
    const requestController = new AbortController();
    preflightController = requestController;
    try {
      const bytes = await readCapture(requestController, 1800);
      if (run === target && modelLog) target.tracker = modelLog.createTracker(bytes);
    } catch (_) { /* Missing capture must never prevent the calculation. */ }
    finally {
      if (preflightController === requestController) preflightController = null;
      if (run === target) { target.phase = 'prepared'; emit(); restart(); }
    }
    return Object.freeze({ runId: target.id });
  }
  function begin(token) {
    if (!run || token?.runId !== run.id || run.phase !== 'prepared') return false;
    run.phase = 'running';
    emit();
    restart();
    return true;
  }
  function complete(token) {
    if (!run || token?.runId !== run.id) return Promise.resolve(null);
    if (run.phase === 'complete') return Promise.resolve(snapshot());
    if (run.phase === 'finishing') return run.completion;
    if (run.phase !== 'running') return Promise.resolve(null);
    run.phase = 'finishing';
    const target = run;
    target.completion = new Promise((resolve) => { target.resolve = resolve; });
    emit();
    if (!target.tracker || target.tracker.snapshot().rejected) finish(target);
    else {
      // The HTTP response can precede the capture's last flushed line. Keep a
      // bounded final window, regardless of the response's generic success text.
      finalTimer = setTimeout(() => finish(target), 3000);
      restart();
    }
    return target.completion;
  }
  window.MLClosureModelStatus = Object.freeze({ prepare, begin, complete, reset, snapshot });
  new MutationObserver(() => {
    const running = busy();
    if (running !== wasBusy && wanted()) restart();
    wasBusy = running;
  }).observe(app, { attributes: true, attributeFilter: ['data-state'] });
  new MutationObserver(restart).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  // A queued close event from an earlier opening cannot cancel a newer poll.
  dialog.addEventListener('close', () => { if (!dialog.open) restart(); });
  window.addEventListener('pagehide', () => { pageActive = false; stop(); });
  window.addEventListener('pageshow', () => { pageActive = true; if (wanted()) restart(); });
  if (wanted()) restart();
})();
