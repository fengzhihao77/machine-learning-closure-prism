/* Presentation controls only: conceptual animations, navigation, diagram viewing, and factual browser events. */
(() => {
  'use strict';
  const app = document.querySelector('[data-ml-app]');
  const byId = (id) => document.getElementById(id);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const views = {
    loop: {
      title: 'Self-consistency loop',
      description: 'The closure and the PRISM relation are applied repeatedly to update the correlations.',
      graphic: `<svg class="concept-graphic loop-graphic" viewBox="0 0 520 230" aria-hidden="true"><defs><marker id="loop-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="m1 1 5 2.5L1 6"/></marker></defs><g class="concept-links" marker-end="url(#loop-arrow)"><path d="M218 58h80"/><path d="M398 91v43"/><path d="M300 172h-80"/><path d="M118 138V95"/></g><g class="concept-node loop-node" style="--step:0"><rect x="22" y="24" width="196" height="66" rx="5"/><text x="120" y="52">Trial correlations</text><text class="concept-math" x="120" y="77">h(k)</text></g><g class="concept-node loop-node" style="--step:1"><rect x="300" y="24" width="196" height="66" rx="5"/><text x="398" y="52">ML closure</text><text class="concept-math" x="398" y="77">c(k)</text></g><g class="concept-node loop-node" style="--step:2"><rect x="300" y="139" width="196" height="66" rx="5"/><text x="398" y="167">PRISM relation</text><text class="concept-math" x="398" y="192">h(k), γ(k)</text></g><g class="concept-node loop-node" style="--step:3"><rect x="22" y="139" width="196" height="66" rx="5"/><text x="120" y="167">Update correlations</text><text class="concept-math" x="120" y="192">next iteration</text></g></svg>`
    },
    exchange: {
      title: 'Correlation exchange',
      description: 'Intramolecular and direct correlations enter PRISM; intermolecular and indirect correlations connect the next update.',
      graphic: `<svg class="concept-graphic exchange-graphic" viewBox="0 0 520 230" aria-hidden="true"><g class="exchange-links"><path d="M105 64h74q20 0 20 20v22h45"/><path d="M105 174h74q20 0 20-20v-22h45"/><path d="M328 119h50"/></g><g class="concept-node"><rect x="22" y="34" width="88" height="61" rx="5"/><text class="concept-math" x="66" y="72">ω(k)</text><rect x="22" y="144" width="88" height="61" rx="5"/><text class="concept-math" x="66" y="182">c(k)</text><rect x="244" y="82" width="84" height="74" rx="5"/><text x="286" y="125">PRISM</text><rect x="378" y="87" width="112" height="64" rx="5"/><text class="concept-math" x="434" y="126">h(k)</text></g><text class="exchange-note" x="356" y="216">γ(k) = h(k) − c(k)</text></svg>`
    },
    pulse: {
      title: 'Activity pulse',
      description: 'A quiet activity indicator with constant timing, independent of the residual or the number of iterations.',
      graphic: `<div class="activity-graphic" aria-hidden="true"><div class="activity-equation"><span>γ(k)</span><span>=</span><span>h(k)</span><span>−</span><span>c(k)</span></div><div class="activity-lines"><span></span><span></span><span></span><span></span><span></span></div></div>`
    }
  };
  const picker = byId('convergence-animation');
  function renderAnimation() {
    const selected = picker && picker.value in views ? picker.value : 'loop';
    const view = views[selected];
    for (const id of ['calculation-visual', 'animation-preview-visual']) {
      const target = byId(id);
      if (target) { target.dataset.animation = selected; target.innerHTML = view.graphic.replaceAll('loop-arrow', `loop-arrow-${id}`); }
    }
    if (byId('animation-preview-title')) byId('animation-preview-title').textContent = view.title;
    if (byId('animation-preview-description')) byId('animation-preview-description').textContent = view.description;
  }
  if (picker) picker.addEventListener('change', renderAnimation);
  renderAnimation();

  function wireDialog(dialogId, openId, closeId) {
    const dialog = byId(dialogId);
    if (!dialog) return;
    if (byId(openId)) byId(openId).addEventListener('click', () => dialog.showModal());
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
    if (byId('inline-terminal')) byId('inline-terminal').hidden = state === 'ready';
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

  // A deliberate, slower anchor transition; ordinary scrolling stays under the user's control.
  let scrollFrame = null;
  function stopScroll() { if (scrollFrame !== null) cancelAnimationFrame(scrollFrame); scrollFrame = null; }
  ['wheel', 'touchstart', 'pointerdown'].forEach((type) => window.addEventListener(type, stopScroll, { passive: true }));
  window.addEventListener('keydown', (event) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', 'Tab'].includes(event.key)) stopScroll(); });
  document.documentElement.classList.add('enhanced-navigation');
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.classList.contains('skip-link')) return;
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      if (link.hash === '#method' && byId('method-details')) byId('method-details').open = true;
      stopScroll();
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
