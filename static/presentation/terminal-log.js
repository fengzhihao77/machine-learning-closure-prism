/* Read an optional generated log through the existing Flask static-file route.
 * No new route, solver instrumentation, or inferred progress is used here.
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

  function stop() {
    epoch += 1;
    clearTimeout(timer);
    timer = null;
    if (controller) controller.abort();
    controller = null;
  }
  function visibleText(text) {
    const plain = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r\n?/g, '\n');
    // Hide only the log viewer's own HTTP access noise. Original log bytes on disk
    // stay intact. All displayed calculation messages originate in the process.
    const lines = plain.split('\n').filter((line) => !/"(?:GET|HEAD) \/static\/pred_results\/terminal\.log(?:\?| |\/)/.test(line));
    return (lines.length > 500 ? '[Showing the latest 500 terminal lines]\n' : '') + lines.slice(-500).join('\n');
  }
  async function poll(currentEpoch) {
    if (!dialog.open || currentEpoch !== epoch) return;
    const requestController = new AbortController();
    controller = requestController;
    const timeout = setTimeout(() => requestController.abort(), 5000);
    let nextDelay = 1200;
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: requestController.signal });
      if (currentEpoch !== epoch || !dialog.open) return;
      if (response.status === 404) {
        nextDelay = 5000;
        if (!active) view.setSource('Browser events', 'Terminal capture is not enabled for this local server. These entries show browser requests and downloads, not Python terminal output.', 'browser');
        else view.setSource('Local Python terminal · unavailable', 'The log file is currently unavailable. The last captured output remains below.', 'terminal');
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if ((response.headers.get('content-type') || '').includes('text/html')) throw new Error('The log URL returned an HTML page.');
      const text = await response.text();
      if (currentEpoch !== epoch || !dialog.open) return;
      const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 48;
      if (!active) view.clear();
      active = true;
      view.setSource('Local Python terminal · live', 'Actual stdout and stderr from this local server process; earlier calculations may also appear. Log-viewer HTTP requests are hidden.', 'terminal');
      output.textContent = visibleText(text) || 'Waiting for the process to write terminal output…';
      if (atBottom) output.scrollTop = output.scrollHeight;
      output.dataset.terminalAvailable = 'true';
      output.dataset.capturedAt = new Date().toISOString();
    } catch (error) {
      if (currentEpoch !== epoch || !dialog.open) return;
      if (active) view.setSource('Local Python terminal · reconnecting', 'The log connection is delayed. Displayed output may be stale; this does not indicate whether the calculation has stopped.', 'terminal');
      else view.setSource('Browser events', 'Terminal output could not be retrieved. These entries show browser activity; the calculation may still be running.', 'browser');
    } finally {
      clearTimeout(timeout);
      if (controller === requestController) controller = null;
      if (dialog.open && currentEpoch === epoch) timer = setTimeout(() => poll(currentEpoch), nextDelay);
    }
  }
  document.getElementById('open-log')?.addEventListener('click', () => { stop(); poll(epoch); });
  dialog.addEventListener('close', () => { if (!dialog.open) stop(); });
  window.addEventListener('pagehide', stop);
})();
