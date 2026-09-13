/* Read an optional generated log through the existing Flask static-file route.
 * No new route, solver instrumentation, or inferred progress is used here.
 */
(() => {
  'use strict';
  const app = document.querySelector('[data-ml-app]');
  const dialog = document.getElementById('log-dialog');
  const output = document.getElementById('log-output');
  const inline = document.getElementById('inline-terminal');
  const inlineOutput = document.getElementById('inline-terminal-output');
  const inlineSource = document.getElementById('inline-terminal-source');
  const inlineNote = document.getElementById('inline-terminal-note');
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
  const wanted = () => pageActive && (busy() || dialog.open);
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
  function visibleLines(text) {
    const plain = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r\n?/g, '\n');
    // Hide only the log viewer's own HTTP access noise. Original log bytes on disk
    // stay intact. All displayed calculation messages originate in the process.
    return plain.split('\n').filter((line) => !ownRequest.test(line));
  }
  function tail(lines, count) {
    return (lines.length > count ? `[Showing the latest ${count} terminal lines]\n` : '') + lines.slice(-count).join('\n');
  }
  function setInline(state, label, note, placeholder) {
    if (inline) inline.dataset.terminalState = state;
    if (inlineSource) inlineSource.textContent = label;
    if (inlineNote) inlineNote.textContent = note;
    if (inlineOutput && !active && placeholder) inlineOutput.textContent = placeholder;
  }
  function writeOutput(target, text, capturedAt) {
    if (!target) return;
    const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 48;
    if (target.textContent !== text) target.textContent = text;
    if (atBottom) target.scrollTop = target.scrollHeight;
    target.dataset.terminalAvailable = 'true';
    target.dataset.capturedAt = capturedAt;
  }
  function connecting() {
    setInline('connecting', 'Connecting to Python terminal',
      'Reading this local process’s captured output. Earlier calculations may also appear.',
      'Waiting for captured process output…');
  }
  async function poll(currentEpoch, finalRead = false) {
    const current = () => pageActive && currentEpoch === epoch && (wanted() || finalRead);
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
        if (!active) view.setSource('Browser events', 'Terminal capture is not enabled for this local server. These entries show browser requests and downloads, not Python terminal output.', 'browser');
        else view.setSource('Local Python terminal · unavailable', 'The log file is currently unavailable. The last captured output remains below.', 'terminal');
        setInline('unavailable', active ? 'Python terminal · unavailable' : 'Terminal capture unavailable',
          active ? `The last captured output remains below. ${wanted() ? 'Retrying the log connection.' : 'Open Live terminal to retry.'}` : 'Real process output is not available from this local server yet.',
          wanted() ? 'No terminal messages have been received. Retrying capture…' : 'No terminal messages have been received. Open Live terminal to retry.');
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if ((response.headers.get('content-type') || '').includes('text/html')) throw new Error('The log URL returned an HTML page.');
      const text = await response.text();
      if (!current()) return;
      if (!active) view.clear();
      active = true;
      const lines = visibleLines(text);
      const capturedAt = new Date().toISOString();
      const note = 'Actual stdout and stderr from this local server process; earlier calculations may also appear. Log-viewer HTTP requests are hidden.';
      view.setSource(wanted() ? 'Local Python terminal · live' : 'Local Python terminal · captured', note, 'terminal');
      setInline(busy() ? 'live' : 'captured', busy() ? 'Python terminal · live' : 'Python terminal · captured', note);
      writeOutput(output, tail(lines, 500) || 'Waiting for the process to write terminal output…', capturedAt);
      writeOutput(inlineOutput, tail(lines, 60) || 'Waiting for the process to write terminal output…', capturedAt);
    } catch (error) {
      if (!current()) return;
      if (active) view.setSource(wanted() ? 'Local Python terminal · reconnecting' : 'Local Python terminal · unavailable', 'The log connection is delayed. Displayed output may be stale; this does not indicate whether the calculation has stopped.', 'terminal');
      else view.setSource('Browser events', 'Terminal output could not be retrieved. These entries show browser activity; the calculation may still be running.', 'browser');
      setInline(wanted() ? 'reconnecting' : 'unavailable', active ? `Python terminal · ${wanted() ? 'reconnecting' : 'unavailable'}` : 'Terminal connection delayed',
        active ? `Displayed output may be stale. ${wanted() ? 'This does not indicate whether the calculation has stopped.' : 'Open Live terminal to retry.'}` : 'Real terminal output could not be retrieved. The calculation may still be running.',
        wanted() ? 'Waiting for the connection to captured process output…' : 'No terminal messages have been received. Open Live terminal to retry.');
    } finally {
      clearTimeout(timeout);
      if (controller === requestController) controller = null;
      if (wanted() && currentEpoch === epoch) timer = setTimeout(() => poll(currentEpoch), nextDelay);
    }
  }
  function restart(finalRead = false) {
    stop();
    if (wanted() || (pageActive && finalRead)) poll(epoch, finalRead);
  }
  new MutationObserver(() => {
    const running = busy();
    if (running && !wasBusy) { connecting(); restart(); }
    else if (!running && wasBusy) restart(true);
    wasBusy = running;
  }).observe(app, { attributes: true, attributeFilter: ['data-state'] });
  document.getElementById('open-log')?.addEventListener('click', () => restart());
  // A queued close event from an earlier opening must not cancel the new poll.
  // Closing the modal also must not stop the feed beneath an active calculation.
  dialog.addEventListener('close', () => { if (!dialog.open && !busy()) stop(); });
  window.addEventListener('pagehide', () => { pageActive = false; stop(); });
  window.addEventListener('pageshow', () => { pageActive = true; if (wanted()) restart(); });
  if (wanted()) { connecting(); restart(); }
})();
