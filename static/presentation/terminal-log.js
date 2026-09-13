/* Read optional process capture through the existing Flask static-file route.
 * This popup never creates a route, instruments the solver, or infers progress.
 */
(() => {
  'use strict';
  const app = document.querySelector('[data-ml-app]');
  const dialog = document.getElementById('log-dialog');
  const output = document.getElementById('log-output');
  const view = window.MLClosureLogView;
  if (!app || !dialog || !output || !view || !app.dataset.terminalLogSrc) return;
  const url = new URL(app.dataset.terminalLogSrc, location.href);
  if (url.origin !== location.origin) return;
  let timer = null;
  let controller = null;
  let active = false;
  let epoch = 0;
  let pageActive = true;
  const busy = () => ['calculating', 'retrieving'].includes(app.dataset.state);
  // The process writes its capture independently. Read it only while requested.
  const wanted = () => pageActive && dialog.open;
  let wasBusy = busy();
  const escapedPath = url.pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ownRequest = new RegExp(`"(?:GET|HEAD) ${escapedPath}(?:\\?| |/)`);

  function stop() {
    epoch += 1;
    clearTimeout(timer);
    timer = null;
    if (controller) controller.abort();
    controller = null;
  }
  function setState(state) {
    dialog.dataset.terminalState = state;
    output.dataset.terminalState = state;
  }
  function visibleLines(text) {
    const plain = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r\n?/g, '\n');
    // Suppress only the viewer's own access noise; original disk bytes are intact.
    return plain.split('\n').filter((line) => !ownRequest.test(line));
  }
  function writeOutput(text, capturedAt) {
    const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 48;
    if (output.textContent !== text) output.textContent = text;
    if (atBottom) output.scrollTop = output.scrollHeight;
    output.dataset.terminalAvailable = 'true';
    output.dataset.capturedAt = capturedAt;
  }
  function connecting() {
    setState(active ? 'reconnecting' : 'connecting');
    if (active) view.setSource('Local Python terminal · reconnecting', 'Reading this local process’s captured output. The last capture remains below; earlier calculations may also appear.', 'terminal');
    else view.setSource('Connecting to Python terminal', 'Waiting for captured process output. Browser events remain below until the connection succeeds.', 'browser');
  }
  async function poll(currentEpoch) {
    const current = () => currentEpoch === epoch && wanted();
    if (!current()) return;
    const requestController = new AbortController();
    controller = requestController;
    const timeout = setTimeout(() => requestController.abort(), 5000);
    let nextDelay = busy() ? 1000 : 1200;
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: requestController.signal });
      if (!current()) return;
      if (response.status === 404) {
        nextDelay = busy() ? 1500 : 5000;
        setState('unavailable');
        if (!active) view.setSource('Browser events · terminal unavailable', 'Terminal capture is not enabled for this local server. These entries show browser requests and downloads, not Python output. Retrying while this popup is open.', 'browser');
        else view.setSource('Local Python terminal · unavailable', 'The log file is currently unavailable. The last captured output remains below; retrying while this popup is open.', 'terminal');
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if ((response.headers.get('content-type') || '').includes('text/html')) throw new Error('The log URL returned an HTML page.');
      const text = await response.text();
      if (!current()) return;
      if (!active) view.clear();
      active = true;
      setState('live');
      const lines = visibleLines(text);
      const tail = (lines.length > 500 ? '[Showing the latest 500 terminal lines]\n' : '') + lines.slice(-500).join('\n');
      view.setSource('Local Python terminal · live', 'Actual stdout and stderr from this local server process; earlier calculations may also appear. Log-viewer HTTP requests are hidden.', 'terminal');
      writeOutput(tail || 'Waiting for the process to write terminal output…', new Date().toISOString());
    } catch (error) {
      if (!current()) return;
      setState('reconnecting');
      if (active) view.setSource('Local Python terminal · reconnecting', 'The log connection is delayed. Displayed output may be stale; this does not indicate whether the calculation has stopped. Retrying while this popup is open.', 'terminal');
      else view.setSource('Browser events · terminal connection delayed', 'Terminal output could not be retrieved. These entries show browser activity; the calculation may still be running. Retrying while this popup is open.', 'browser');
    } finally {
      clearTimeout(timeout);
      if (controller === requestController) controller = null;
      if (current()) timer = setTimeout(() => poll(currentEpoch), nextDelay);
    }
  }
  function restart() {
    stop();
    if (wanted()) { connecting(); poll(epoch); }
  }
  new MutationObserver(() => {
    const running = busy();
    if (running !== wasBusy && wanted()) restart();
    wasBusy = running;
  }).observe(app, { attributes: true, attributeFilter: ['data-state'] });
  // Observe native dialog state, including keyboard/programmatic openings.
  new MutationObserver(() => { if (wanted()) restart(); else stop(); })
    .observe(dialog, { attributes: true, attributeFilter: ['open'] });
  // A queued close event from an earlier opening must not cancel a newer poll.
  dialog.addEventListener('close', () => { if (!dialog.open) stop(); });
  window.addEventListener('pagehide', () => { pageActive = false; stop(); });
  window.addEventListener('pageshow', () => { pageActive = true; if (wanted()) restart(); });
  if (wanted()) restart();
})();
