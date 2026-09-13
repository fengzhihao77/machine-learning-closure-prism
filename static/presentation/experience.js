/* Presentation controls only: conceptual animations, navigation, diagram viewing, and factual browser events. */
(() => {
  'use strict';
  const app = document.querySelector('[data-ml-app]');
  const byId = (id) => document.getElementById(id);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // A single conceptual view; it is never driven by measured solver residuals.
  const loopGraphic = `<svg class="concept-graphic loop-graphic" viewBox="0 0 520 230" aria-hidden="true"><defs><marker id="loop-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="m1 1 5 2.5L1 6"/></marker></defs><g class="concept-links" marker-end="url(#loop-arrow)"><path d="M218 58h80"/><path d="M398 91v43"/><path d="M300 172h-80"/><path d="M118 138V95"/></g><g class="concept-node loop-node" style="--step:0"><rect x="22" y="24" width="196" height="66" rx="5"/><text x="120" y="52">Trial correlations</text><text class="concept-math" x="120" y="77">h(k)</text></g><g class="concept-node loop-node" style="--step:1"><rect x="300" y="24" width="196" height="66" rx="5"/><text x="398" y="52">ML closure</text><text class="concept-math" x="398" y="77">c(k)</text></g><g class="concept-node loop-node" style="--step:2"><rect x="300" y="139" width="196" height="66" rx="5"/><text x="398" y="167">PRISM relation</text><text class="concept-math" x="398" y="192">h(k), γ(k)</text></g><g class="concept-node loop-node" style="--step:3"><rect x="22" y="139" width="196" height="66" rx="5"/><text x="120" y="167">Update correlations</text><text class="concept-math" x="120" y="192">next iteration</text></g></svg>`;
  for (const id of ['calculation-visual', 'animation-preview-visual']) {
    const target = byId(id);
    if (target) {
      target.dataset.animation = 'loop';
      target.innerHTML = loopGraphic.replaceAll('loop-arrow', `loop-arrow-${id}`);
    }
  }
  if (byId('animation-preview-title')) byId('animation-preview-title').textContent = 'Self-consistency loop';
  if (byId('animation-preview-description')) byId('animation-preview-description').textContent = 'The closure and the PRISM relation are applied repeatedly to update the correlations.';

  function wireDialog(dialogId, openId, closeId) {
    const dialog = byId(dialogId);
    if (!dialog) return;
    if (byId(openId)) byId(openId).addEventListener('click', () => { if (!dialog.open) dialog.showModal(); });
    if (byId(closeId)) byId(closeId).addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }
  wireDialog('animation-dialog', 'preview-convergence', 'close-animation');
  wireDialog('log-dialog', 'open-log', 'close-log');
  // These events describe what the browser actually observed, never inferred solver iterations.
  let eventSource = 'browser';
  const events = [];
  function appendEvent(message, timestamp = new Date().toISOString()) {
    if (!byId('log-output')) return;
    events.push({ timestamp, message: String(message) });
    const output = byId('log-output');
    output.textContent = events.map((entry) => `${entry.timestamp}  ${entry.message}`).join('\n');
    output.scrollTop = output.scrollHeight;
  }
  function updateEventSource(label, note, source = 'browser') {
    eventSource = source;
    if (byId('log-source-label')) byId('log-source-label').textContent = label;
    if (byId('log-source-note')) byId('log-source-note').textContent = note;
  }
  window.MLClosureLogView = Object.freeze({
    append: (entry) => appendEvent(entry.message, entry.timestamp),
    setSource: updateEventSource,
    clear: () => { events.length = 0; if (byId('log-output')) byId('log-output').textContent = ''; }
  });
  let lastState = null;
  function observeState() {
    if (!app) return;
    const state = app.dataset.state;
    const calculating = state === 'calculating';
    const busy = calculating || state === 'retrieving';
    if (byId('preview-convergence')) byId('preview-convergence').disabled = busy;
    if (byId('calculation-visual')) byId('calculation-visual').classList.toggle('animation-paused', !calculating);
    if (byId('conceptual-note')) byId('conceptual-note').textContent = state === 'retrieving' ? 'The calculation returned. Saved output files are being retrieved.' : 'Conceptual animation; its timing is independent of the solver.';
    if (state === lastState) return;
    lastState = state;
    if (eventSource !== 'browser') return;
    const messages = {
      ready: 'Interface ready. No calculation has been submitted in this page.',
      calculating: `Calculation request submitted. ${byId('run-parameters')?.textContent || ''}`,
      retrieving: 'The application returned a completion response. Retrieving result files.',
      complete: 'All result files were retrieved and validated by the interface.',
      failed: `Request or output retrieval failed. ${byId('error-detail')?.textContent || ''}`
    };
    if (messages[state]) appendEvent(messages[state]);
  }
  if (app) new MutationObserver(observeState).observe(app, { attributes: true, attributeFilter: ['data-state'] });
  updateEventSource('Browser events', 'These entries report requests and downloads observed by this page. They do not contain the Python solver’s terminal output.');
  observeState();

  // Keep native details/summary semantics, including Enter and Space activation.
  // The open attribute remains set during closing so its content can animate.
  const folds = new Map();
  function enhanceDetails(details) {
    if (folds.has(details)) return folds.get(details);
    const summary = details.querySelector(':scope > summary');
    if (!summary) return null;
    const state = { details, summary, desired: details.open, animation: null, resolve: null, promise: null };
    folds.set(details, state);
    function settle(completed = true) {
      if (state.animation) {
        state.animation.onfinish = null;
        state.animation.cancel();
        state.animation = null;
      }
      details.open = state.desired;
      details.style.removeProperty('height');
      details.style.removeProperty('overflow');
      delete details.dataset.foldAnimating;
      details.dataset.foldState = state.desired ? 'open' : 'closed';
      summary.removeAttribute('aria-expanded');
      if (state.resolve) state.resolve(completed);
      state.resolve = null;
      state.promise = null;
    }
    function targetHeight() {
      const previous = details.style.height;
      details.style.height = 'auto';
      const expanded = details.getBoundingClientRect().height;
      details.style.height = previous;
      if (state.desired) return expanded;
      const box = getComputedStyle(details);
      const head = getComputedStyle(summary);
      return summary.getBoundingClientRect().height +
        ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((n, key) => n + (parseFloat(box[key]) || 0), 0) +
        (parseFloat(head.marginTop) || 0) + (parseFloat(head.marginBottom) || 0);
    }
    function animate(open, resizing = false) {
      const desired = Boolean(open);
      if (!resizing && state.animation && state.desired === desired) return state.promise;
      if (!state.animation && details.open === desired) {
        state.desired = desired;
        return Promise.resolve(true);
      }
      const from = details.getBoundingClientRect().height;
      if (state.animation) {
        state.animation.onfinish = null;
        state.animation.cancel();
        state.animation = null;
      }
      if (!resizing && state.resolve) state.resolve(false);
      state.desired = desired;
      if (!resizing || !state.promise) state.promise = new Promise((resolve) => { state.resolve = resolve; });
      const promise = state.promise;
      if (!desired && details.contains(document.activeElement) && !summary.contains(document.activeElement)) summary.focus({ preventScroll: true });
      details.open = true;
      details.style.height = `${from}px`;
      details.style.overflow = 'hidden';
      details.dataset.foldState = desired ? 'open' : 'closed';
      summary.setAttribute('aria-expanded', String(desired));
      const to = targetHeight();
      if (reducedMotion.matches || !details.animate || Math.abs(to - from) < 1) {
        settle();
        return promise;
      }
      details.dataset.foldAnimating = desired ? 'opening' : 'closing';
      state.animation = details.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: 360, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'forwards'
      });
      state.animation.onfinish = () => settle();
      return promise;
    }
    state.setOpen = animate;
    state.settle = settle;
    summary.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.target.closest('a,button,input,select,textarea')) return;
      event.preventDefault();
      animate(!state.desired);
    });
    details.addEventListener('toggle', () => {
      if (!state.animation) {
        state.desired = details.open;
        details.dataset.foldState = details.open ? 'open' : 'closed';
      }
    });
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => {
        if (state.animation) animate(state.desired, true);
      });
      // Observe intrinsic contents, not the animated outer box, to avoid feedback.
      for (const child of details.children) observer.observe(child);
    }
    return state;
  }
  for (const details of document.querySelectorAll('details')) enhanceDetails(details);
  window.MLClosureDetails = Object.freeze({
    setOpen: (target, open) => {
      const details = typeof target === 'string' ? byId(target) : target;
      if (!details || details.tagName !== 'DETAILS') return Promise.resolve(false);
      return enhanceDetails(details)?.setOpen(open) || Promise.resolve(false);
    }
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) for (const state of folds.values()) if (state.animation) state.settle();
  });

  // A deliberate, slower anchor transition; ordinary scrolling stays under the user's control.
  let scrollFrame = null;
  let navigationEpoch = 0;
  function stopScroll() { navigationEpoch += 1; if (scrollFrame !== null) cancelAnimationFrame(scrollFrame); scrollFrame = null; }
  ['wheel', 'touchstart', 'pointerdown'].forEach((type) => window.addEventListener(type, stopScroll, { passive: true }));
  window.addEventListener('keydown', (event) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', 'Tab'].includes(event.key)) stopScroll(); });
  document.documentElement.classList.add('enhanced-navigation');
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.classList.contains('skip-link')) return;
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      stopScroll();
      const intent = navigationEpoch;
      if (link.hash === '#method') await window.MLClosureDetails.setOpen('method-details', true);
      if (intent !== navigationEpoch) return;
      const start = window.scrollY;
      const header = document.querySelector('.site-header').getBoundingClientRect().height;
      const desired = link.hash === '#top' ? 0 : target.getBoundingClientRect().top + start - header - 22;
      const end = Math.max(0, Math.min(desired, document.documentElement.scrollHeight - window.innerHeight));
      const distance = end - start;
      function finish() {
        history.pushState(null, '', link.hash);
        const previous = target.getAttribute('tabindex');
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        target.addEventListener('blur', () => { if (previous === null) target.removeAttribute('tabindex'); else target.setAttribute('tabindex', previous); }, { once: true });
        scrollFrame = null;
      }
      if (reducedMotion.matches || Math.abs(distance) < 2) { window.scrollTo(0, end); finish(); return; }
      const duration = Math.min(1500, 950 + Math.abs(distance) * .12);
      let began = null;
      function frame(time) {
        if (began === null) began = time;
        const progress = Math.min((time - began) / duration, 1);
        const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
        window.scrollTo(0, start + distance * eased);
        if (progress < 1) scrollFrame = requestAnimationFrame(frame); else finish();
      }
      scrollFrame = requestAnimationFrame(frame);
    });
  });
})();
