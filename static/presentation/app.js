/* Frontend only. The protected Flask routes and scientific computation are unchanged. */
(() => {
  'use strict';

  const app = document.querySelector('[data-ml-app]');
  if (!app) return;
  const byId = (id) => document.getElementById(id);
  const form = byId('prediction-form');
  const submit = byId('run-prediction');
  const image = byId('prediction-image');
  const tabs = [...app.querySelectorAll('[data-plot]')];
  const dataLink = byId('download-data');
  const figureLink = byId('download-figure');
  const uncertaintyLink = byId('download-original-ck');
  const dialog = byId('figure-dialog');
  const fields = ['N', 'epsilon', 'rho'];
  const plots = {
    g_r: { symbol: 'g(r)', title: 'Radial distribution function', description: 'The radial distribution function describes pair structure in real space.' },
    h_k: { symbol: 'h(k)', title: 'Intermolecular correlation function', description: 'The intermolecular correlation function describes correlations between different molecules in reciprocal space.' },
    w_k: { symbol: 'ω(k)', title: 'Intramolecular correlation function', description: 'The intramolecular correlation function describes structure within a polymer chain in reciprocal space.' },
    c_k: { symbol: 'c(k)', title: 'Direct correlation function', description: 'The direct correlation function enters the PRISM relation connecting molecular correlations.' },
    s_k: { symbol: 's(k)', title: 'Structure factor', description: 'The structure factor describes the collective structure in reciprocal space.' }
  };
  let outputURLs = {};
  let selectedPlot = 'g_r';
  let paperPlots = null;
  let plotStyle = 'paper';
  let renderWarning = '';
  let submitted = null;
  let started = 0;
  let timer = null;
  let busy = false;
  let activeModelRun = null;
  let modelStatus = null;
  let completedRows = null;

  function convergenceText() {
    if (!modelStatus) return 'Model convergence status unavailable.';
    const count = modelStatus.converged.length;
    const failed = modelStatus.failed.length;
    const pending = modelStatus.pending.length;
    const final = modelStatus.phase === 'complete';
    const unavailable = modelStatus.source === 'unavailable' || (final && !modelStatus.anchored);
    if (unavailable && !modelStatus.observedCount) return 'Model convergence status unavailable.';
    if (!modelStatus.anchored) return 'Waiting for model outcomes.';
    let text = `${count}/5 models converged`;
    if (failed) text += `; ${failed} did not converge`;
    if (pending && (final || unavailable)) text += `; ${pending} unconfirmed`;
    return text + '.';
  }
  function renderModelStatus() {
    const state = app.dataset.state;
    const section = byId('model-run-summary');
    section.hidden = !modelStatus || state === 'ready';
    if (modelStatus) {
      const progress = byId('model-progress');
      const fill = byId('model-progress-fill');
      const observed = modelStatus.observedCount;
      const unavailable = modelStatus.source === 'unavailable' || (modelStatus.phase === 'complete' && !modelStatus.anchored);
      const unknown = unavailable && observed === 0;
      // Only captured outcomes advance this track; loading and elapsed time never do.
      // A new run starts empty without animating backward from the previous run.
      if (section.dataset.runId !== String(modelStatus.runId)) {
        fill.style.transition = 'none';
        fill.style.width = '0%';
        void fill.offsetWidth;
        fill.style.removeProperty('transition');
      }
      section.dataset.runId = String(modelStatus.runId);
      progress.dataset.unknown = String(unknown);
      if (unknown) progress.removeAttribute('aria-valuenow');
      else progress.setAttribute('aria-valuenow', String(observed));
      fill.style.width = `${observed * 20}%`;
      const remaining = modelStatus.pending.length;
      const finalOrUnavailable = unavailable || modelStatus.phase === 'complete';
      const outcomeText = `${observed} of 5 model outcomes reported`;
      byId('model-progress-count').textContent = unknown ? 'Model outcomes unavailable' : outcomeText;
      progress.setAttribute('aria-valuetext', `${unknown ? 'Model outcomes unavailable' : outcomeText}; ${modelStatus.converged.length} converged; ${modelStatus.failed.length} did not converge; ${remaining} ${finalOrUnavailable ? 'unconfirmed' : 'awaiting an outcome'}.`);
      section.dataset.convergedCount = String(modelStatus.converged.length);
      section.dataset.observedCount = String(observed);
      section.dataset.source = modelStatus.source;
      section.dataset.phase = modelStatus.phase;
      const list = byId('model-status-list');
      const unconfirmed = modelStatus.source === 'unavailable' || modelStatus.phase === 'complete';
      const segments = [];
      const items = [0, 1, 2, 3, 4].map((id) => {
        const item = document.createElement('li');
        const outcome = modelStatus.converged.includes(id) ? 'converged' : modelStatus.failed.includes(id) ? 'failed' : unconfirmed ? 'unconfirmed' : 'pending';
        item.dataset.model = String(id);
        item.dataset.state = outcome;
        const segment = document.createElement('span');
        segment.dataset.progressModel = String(id);
        segment.dataset.state = outcome;
        segment.style.left = `${id * 20}%`;
        segments.push(segment);
        const identity = document.createElement('strong');
        identity.textContent = `Model ${id}`;
        const label = document.createElement('span');
        label.textContent = { converged: 'Converged', failed: 'Failed', unconfirmed: 'Unknown', pending: 'Pending' }[outcome];
        item.title = `Model ${id}: ` + { converged: 'converged', failed: 'did not converge', unconfirmed: 'outcome unconfirmed', pending: 'awaiting result' }[outcome];
        item.append(identity, label);
        return item;
      });
      list.replaceChildren(...items);
      byId('model-progress-outcomes').replaceChildren(...segments);
      byId('model-status-note').textContent = modelStatus.note;
    }
    const convergence = convergenceText();
    if (state === 'complete') byId('status-message').textContent = `Calculation complete. ${convergence} ${completedRows.toLocaleString('en-US')} rows of numerical data are ready to download.`;
    else if (state === 'calculating') byId('status-message').textContent = `Calculating. ${convergence}`;
    else if (state === 'retrieving') byId('status-message').textContent = `Retrieving result files. ${convergence}`;
    else if (state === 'failed') byId('status-message').textContent = `No result is available from this attempt. ${convergence}`;
  }
  window.addEventListener('mlclosure:modelstatus', (event) => {
    if (!activeModelRun || event.detail.runId !== activeModelRun.runId) return;
    modelStatus = event.detail;
    renderModelStatus();
  });

  function storageRead(key) {
    try { return JSON.parse(sessionStorage.getItem(key)); } catch (_) { return null; }
  }
  function storageWrite(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Storage is optional. */ }
  }
  function inputValues() {
    return Object.fromEntries(fields.map((name) => [name, form.elements.namedItem(name).value]));
  }
  function parameterText(values) {
    return values ? `N = ${values.N} · ε = ${values.epsilon} · ρ = ${values.rho}` : 'Calculated state point';
  }
  function filenamePrefix() {
    return submitted ? `ml-closure_N${submitted.N}_epsilon${submitted.epsilon}_rho${submitted.rho}` : 'ml-closure';
  }
  function setLink(anchor, url, filename) {
    anchor.setAttribute('aria-disabled', url ? 'false' : 'true');
    anchor.tabIndex = url ? 0 : -1;
    if (url) {
      anchor.href = url;
      anchor.download = filename;
    } else {
      anchor.removeAttribute('href');
      anchor.removeAttribute('download');
    }
  }
  function updateStyleControls() {
    app.dataset.plotStyle = plotStyle;
  }
  function setPlot(key) {
    if (!(key in plots)) return;
    if (!outputURLs[key] && key !== 'g_r') return;
    selectedPlot = key;
    const detail = plots[key];
    const hasOutput = Boolean(outputURLs[key]);
    const paper = hasOutput && plotStyle === 'paper' ? paperPlots?.plots[key] : null;
    tabs.forEach((tab) => {
      const active = tab.dataset.plot === key;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    byId('plot-panel').setAttribute('aria-labelledby', `tab-${key}`);
    byId('quantity-symbol').textContent = hasOutput ? detail.symbol : '→';
    byId('quantity-description').textContent = hasOutput ? detail.description : 'The self-consistency loop connects the ML closure with the PRISM relation. Run a state point to explore its correlation functions.';
    image.hidden = !hasOutput;
    byId('calculation-view').hidden = hasOutput;
    app.dataset.hasOutput = String(hasOutput);
    if (hasOutput) image.src = paper?.url || outputURLs[key];
    else image.removeAttribute('src');
    image.dataset.displayStyle = hasOutput ? (paper ? 'paper' : 'original') : 'none';
    image.alt = hasOutput ? `${detail.title} ${detail.symbol}, ${parameterText(submitted)}${paper && key === 'c_k' ? '. Mean curve; original engine export includes ensemble uncertainty.' : ''}` : '';
    byId('expand-figure').disabled = busy || !hasOutput;
    setLink(figureLink, paper?.url || outputURLs[key], `${filenamePrefix()}_${key}${paper ? '_paper' : ''}.${paper ? paper.extension : 'png'}`);
    byId('figure-metadata').textContent = hasOutput ? parameterText(submitted) : '';
    const styleNote = byId('plot-style-note');
    styleNote.hidden = !hasOutput;
    styleNote.textContent = renderWarning || (paper && key === 'c_k' ? 'Mean curve · original export includes ensemble uncertainty.' : paper ? 'Paper style renders the exported numerical samples.' : key === 'c_k' ? 'Original engine export, including the ensemble uncertainty band.' : 'Original PNG exported by the engine.');
    if (hasOutput) byId('figure-context').textContent = paper ? 'Paper-style plot' : 'Original engine plot';
    updateStyleControls();
    if (hasOutput) window.dispatchEvent(new CustomEvent('mlclosure:plotchange', { detail: { quantity: key, style: paper ? 'paper' : 'original', imageURL: image.src, sourceHash: paperPlots?.sourceHash || null } }));
  }
  function clearOutputs() {
    Object.values(outputURLs).forEach((url) => URL.revokeObjectURL(url));
    if (paperPlots) paperPlots.dispose();
    paperPlots = null;
    outputURLs = {};
    renderWarning = '';
    app.dataset.sourceHash = '';
    setLink(dataLink, null);
    setLink(figureLink, null);
    setLink(uncertaintyLink, null);
    setPlot('g_r');
  }
  function setBusy(value) {
    busy = value;
    updateStyleControls();
    submit.disabled = value;
    fields.forEach((name) => { form.elements.namedItem(name).readOnly = value; });
    tabs.forEach((tab) => { tab.disabled = value || (!outputURLs[tab.dataset.plot] && tab.dataset.plot !== 'g_r'); });
    byId('expand-figure').disabled = value || !outputURLs[selectedPlot];
    byId('calculation-overlay').hidden = !value;
    byId('plot-panel').setAttribute('aria-busy', String(value));
    submit.querySelector('.run-label').textContent = value ? 'Calculation in progress' : 'Run calculation';
  }
  function updateTime() {
    const seconds = Math.floor((performance.now() - started) / 1000);
    byId('elapsed-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function startTime() {
    started = performance.now();
    clearInterval(timer);
    updateTime();
    timer = setInterval(updateTime, 1000);
  }
  function stopTime() {
    clearInterval(timer);
    timer = null;
  }
  function clearError() {
    byId('prediction-error').hidden = true;
    fields.forEach((name) => form.elements.namedItem(name).removeAttribute('aria-invalid'));
  }
  function fail(message, title = 'The calculation could not be completed.') {
    stopTime();
    clearOutputs();
    setBusy(false);
    app.dataset.state = 'failed';
    byId('result-badge').textContent = 'Run unsuccessful';
    byId('figure-context').textContent = 'Self-consistency loop · no result from this attempt';
    byId('run-parameters').textContent = submitted ? `Attempted: ${parameterText(submitted)}` : 'No completed calculation';
    byId('status-message').textContent = 'No result is available from this attempt.';
    byId('error-title').textContent = title;
    byId('error-detail').textContent = message;
    byId('prediction-error').hidden = false;
    renderModelStatus();
  }

  function validateData(text) {
    const lines = text.trim().split(/\r?\n/);
    const expected = ['r_range', 'g_r', 'k_range', 'h_k', 'w_k', 'c_k', 's_k'];
    if (!lines[0]?.startsWith('#') || lines[0].slice(1).split(',').map((x) => x.trim()).join(',') !== expected.join(',')) {
      throw new Error('The numeric output has an unexpected header. No download has been enabled.');
    }
    const rows = lines.slice(1).filter((line) => line.trim());
    if (rows.length !== 2048 || rows.some((line) => {
      const cells = line.trim().split(/\s+/);
      return cells.length !== 7 || cells.some((cell) => !Number.isFinite(Number(cell)));
    })) {
      throw new Error('The numeric output is incomplete or contains non-finite values. No download has been enabled.');
    }
    return rows.length;
  }
  async function retrieveOutputs() {
    app.dataset.state = 'retrieving';
    byId('result-badge').textContent = 'Retrieving results';
    byId('working-title').textContent = 'Preparing your results';
    byId('working-description').textContent = 'Retrieving the five figures and numerical data.';
    byId('status-message').textContent = 'The calculation returned. Retrieving all result files…';
    renderModelStatus();
    const keys = [...Object.keys(plots), 'data'];
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const blobs = await Promise.all(keys.map(async (key) => {
      const filename = key === 'data' ? 'pred_data.txt' : `${key}.png`;
      const url = new URL(app.dataset.outputBase + filename, location.href);
      url.searchParams.set('run', token);
      const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`The calculation returned, but ${filename} could not be retrieved (HTTP ${response.status}). Check the local application's output before running again.`);
      const blob = await response.blob();
      if (key !== 'data') {
        const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
        const signature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (bytes.length !== 8 || signature.some((byte, i) => bytes[i] !== byte)) throw new Error(`The ${filename} output is not a valid PNG image. No result has been displayed.`);
      }
      return blob;
    }));
    const dataText = await blobs[keys.indexOf('data')].text();
    const rows = validateData(dataText);
    const nextURLs = Object.fromEntries(keys.map((key, index) => [key, URL.createObjectURL(blobs[index])]));
    try {
      await Promise.all(Object.keys(plots).map((key) => new Promise((resolve, reject) => {
        const probe = new Image();
        probe.onload = () => resolve();
        probe.onerror = () => reject(new Error(`The ${key}.png image could not be displayed. No result has been enabled.`));
        probe.src = nextURLs[key];
      })));
    } catch (error) {
      Object.values(nextURLs).forEach((url) => URL.revokeObjectURL(url));
      throw error;
    }
    let nextPaperPlots = null;
    let nextRenderWarning = '';
    try {
      if (!window.MLScientificPlots?.render) throw new Error('Paper-style renderer is unavailable.');
      nextPaperPlots = await window.MLScientificPlots.render(dataText);
      await Promise.all(Object.keys(plots).map((key) => new Promise((resolve, reject) => {
        const probe = new Image();
        probe.onload = resolve;
        probe.onerror = () => reject(new Error('Paper-style image could not be displayed.'));
        probe.src = nextPaperPlots.plots[key].url;
      })));
    } catch (_) {
      if (nextPaperPlots) nextPaperPlots.dispose();
      nextPaperPlots = null;
      nextRenderWarning = 'Paper-style plotting is unavailable. Original engine figures are shown.';
    }
    clearOutputs();
    outputURLs = nextURLs;
    paperPlots = nextPaperPlots;
    renderWarning = nextRenderWarning;
    plotStyle = paperPlots ? 'paper' : 'original';
    app.dataset.sourceHash = paperPlots?.sourceHash || '';
    setPlot('g_r');
    setLink(dataLink, outputURLs.data, `${filenamePrefix()}_data.txt`);
    setLink(uncertaintyLink, outputURLs.c_k, `${filenamePrefix()}_c_k_with_uncertainty.png`);
    stopTime();
    setBusy(false);
    byId('result-badge').textContent = 'Calculation complete';
    byId('run-parameters').textContent = parameterText(submitted);
    completedRows = rows;
    // The completion hook is set last, once every output blob and visible control is ready.
    app.dataset.state = 'complete';
    renderModelStatus();
  }

  form.addEventListener('invalid', (event) => {
    event.target.setAttribute('aria-invalid', 'true');
    byId('error-title').textContent = 'Check your state point.';
    byId('error-detail').textContent = 'Use an integer chain length from 20 to 100, an interaction strength from 0 to 0.5, and a number density from 0.2 to 0.8.';
    byId('prediction-error').hidden = false;
  }, true);
  fields.forEach((name) => {
    form.elements.namedItem(name).addEventListener('input', (event) => {
      event.target.removeAttribute('aria-invalid');
      if (fields.every((key) => form.elements.namedItem(key).validity.valid)) byId('prediction-error').hidden = true;
    });
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    clearError();
    const values = inputValues();
    if (!form.reportValidity() || fields.some((name) => !Number.isFinite(Number(values[name]))) || !Number.isInteger(Number(values.N))) return;
    // The original backend reads form.values() positionally. Do not add fields or reorder them.
    const body = new URLSearchParams(fields.map((name) => [name, values[name]]));
    submitted = values;
    storageWrite('ml-closure-inputs', values);
    clearOutputs();
    activeModelRun = null;
    modelStatus = null;
    completedRows = null;
    setBusy(true);
    app.dataset.state = 'preparing';
    byId('model-run-summary').hidden = true;
    byId('result-badge').textContent = 'Preparing';
    byId('working-title').textContent = 'Preparing your calculation';
    byId('working-description').textContent = 'Connecting to the local application.';
    byId('elapsed-time').textContent = '00:00';
    byId('status-message').textContent = 'Preparing the calculation…';
    const statusAPI = window.MLClosureModelStatus;
    if (statusAPI) {
      try {
        activeModelRun = await statusAPI.prepare();
        modelStatus = statusAPI.snapshot();
      } catch (_) { /* Optional terminal capture must not block the solver. */ }
    }
    app.dataset.state = 'calculating';
    startTime();
    byId('result-badge').textContent = 'Calculating';
    byId('working-title').textContent = 'Calculating your state point';
    byId('working-description').textContent = 'The closure is solving. Results will appear here.';
    byId('figure-context').textContent = 'A new calculation is in progress';
    byId('figure-metadata').textContent = parameterText(submitted);
    byId('run-parameters').textContent = `Submitted: ${parameterText(submitted)}`;
    byId('status-message').textContent = 'Calculating. Keep this tab open; this can take a few minutes.';
    renderModelStatus();
    try {
      let response, responseText;
      try {
        if (activeModelRun) statusAPI.begin(activeModelRun);
        response = await fetch(form.action, { method: 'POST', body, credentials: 'same-origin' });
        // Streaming headers can arrive while the solver is still running.
        // Keep current-run model tracking active until the response body ends.
        responseText = await response.text();
      } catch (_) {
        throw new Error('The connection to the local application was interrupted. The calculation may still be running. Check the application before submitting again.');
      } finally {
        if (activeModelRun) statusAPI.complete(activeModelRun).catch(() => {});
      }
      if (!response.ok) throw new Error(`The application returned HTTP ${response.status}. This state point may not have converged, or the local application encountered an error. Check its output before trying another calculation.`);
      const returnedHTML = new DOMParser().parseFromString(responseText, 'text/html');
      if (!returnedHTML.querySelector('[data-ml-app][data-server-success="true"]')) throw new Error('The application did not confirm a completed calculation. No previous output has been used for this attempt.');
      await retrieveOutputs();
    } catch (error) {
      fail(error.message || 'The result files could not be retrieved. Check the local application before trying again.');
    }
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setPlot(tab.dataset.plot));
    tab.addEventListener('keydown', (event) => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      if (!tabs[next].disabled) { tabs[next].focus(); setPlot(tabs[next].dataset.plot); }
    });
  });
  [dataLink, figureLink].forEach((anchor) => anchor.addEventListener('click', (event) => {
    if (anchor.getAttribute('aria-disabled') === 'true') event.preventDefault();
  }));
  byId('expand-figure').addEventListener('click', () => {
    if (busy || !outputURLs[selectedPlot]) return;
    byId('expanded-image').src = image.src;
    byId('expanded-image').alt = image.alt;
    byId('dialog-title').textContent = `${plots[selectedPlot].title} · ${plots[selectedPlot].symbol}`;
    byId('expanded-caption').textContent = parameterText(submitted);
    dialog.showModal();
  });
  byId('close-figure').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  const themeToggle = byId('theme-toggle');
  function updateThemeLabel() {
    const dark = document.documentElement.dataset.theme === 'dark';
    themeToggle.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
    themeToggle.title = themeToggle.getAttribute('aria-label');
    document.querySelector('meta[name="theme-color"]').content = dark ? '#000000' : '#f5f2ea';
  }
  themeToggle.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('ml-closure-theme', theme); } catch (_) { /* Optional preference. */ }
    updateThemeLabel();
  });
  updateThemeLabel();
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    document.querySelectorAll('.method-step, .citation-section').forEach((element) => { element.classList.add('reveal'); observer.observe(element); });
    document.documentElement.classList.add('motion-enabled');
  }

  if (app.dataset.serverSuccess === 'true') {
    // Native POST fallback: server-returned values are authoritative, never browser storage.
    submitted = inputValues();
    setBusy(true);
    startTime();
    retrieveOutputs().catch((error) => fail(error.message));
  } else {
    const saved = storageRead('ml-closure-inputs');
    if (saved && typeof saved === 'object') fields.forEach((name) => {
      const field = form.elements.namedItem(name);
      if (!field.value && typeof saved[name] === 'string') field.value = saved[name];
    });
    clearOutputs();
    setBusy(false);
    app.dataset.state = 'ready';
  }
})();
