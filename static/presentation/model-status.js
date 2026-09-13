/* Interpret only complete, newly appended engine messages after a pre-POST byte snapshot.
 * This does not instrument the engine or treat a response/loading message as convergence.
 */
(() => {
  'use strict';
  const ids = [0, 1, 2, 3, 4];
  const stripANSI = (text) => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  function createTracker(baseline) {
    let previous = new Uint8Array(baseline);
    let cursor = previous.length;
    let discardPartial = cursor > 0 && previous[cursor - 1] !== 10;
    let anchored = false;
    let rejected = '';
    let scalers = 0;
    let loaded = 0;
    const outcomes = new Map();
    function reject(reason) {
      rejected = reason;
      outcomes.clear();
      loaded = 0;
      return snapshot();
    }
    function snapshot() {
      return {
        anchored, rejected, baselineBytes: baseline.length, capturedBytes: previous.length,
        loaded: ids.filter((id) => id < loaded),
        converged: ids.filter((id) => outcomes.get(id) === 'converged'),
        failed: ids.filter((id) => outcomes.get(id) === 'failed'),
        pending: ids.filter((id) => !outcomes.has(id))
      };
    }
    function line(text) {
      const clean = stripANSI(text).trim();
      const scaler = /^Scaler_([0-4]) was loaded successfully!$/.exec(clean);
      const model = /^Model_([0-4]) was loaded successfully!$/.exec(clean);
      const outcome = /^Model_([0-4]) (converged successfully|failed to converged)$/.exec(clean);
      if (scaler?.[1] === '0') {
        if (anchored) return reject('A second calculation appeared in the capture. Current-run attribution is unavailable.');
        anchored = true;
        scalers = 1;
        return;
      }
      if (!anchored) {
        // Old trailing outcomes, including a late previous run, cannot seed this run.
        return;
      }
      if (scaler) {
        if (Number(scaler[1]) !== scalers || loaded) return reject('The loading sequence is ambiguous. Current-run attribution is unavailable.');
        scalers += 1;
      }
      if (model) {
        if (scalers !== 5 || Number(model[1]) !== loaded) return reject('The loading sequence is ambiguous. Current-run attribution is unavailable.');
        loaded += 1;
      }
      if (outcome) {
        if (loaded !== 5) return reject('A model outcome appeared without the complete fresh loading sequence.');
        const id = Number(outcome[1]);
        const value = outcome[2] === 'converged successfully' ? 'converged' : 'failed';
        if (outcomes.has(id) && outcomes.get(id) !== value) return reject('Conflicting outcomes appeared for one model. Current-run attribution is unavailable.');
        // Repeated identical messages are idempotent; no model counts twice.
        if (!outcomes.has(id) && id !== outcomes.size) return reject('The model outcome sequence is incomplete or ambiguous.');
        outcomes.set(id, value);
      }
    }
    function ingest(bytes) {
      if (rejected) return snapshot();
      if (bytes.length < previous.length) return reject('The terminal capture was truncated or rotated. Current-run attribution is unavailable.');
      for (let index = 0; index < previous.length; index += 1) {
        if (bytes[index] !== previous[index]) return reject('The terminal capture was replaced or changed. Current-run attribution is unavailable.');
      }
      let end = cursor;
      for (let index = cursor; index < bytes.length; index += 1) {
        if (bytes[index] !== 10) continue;
        if (discardPartial) discardPartial = false;
        else line(new TextDecoder().decode(bytes.subarray(end, index)));
        end = index + 1;
        if (rejected) break;
      }
      cursor = end;
      previous = new Uint8Array(bytes);
      return snapshot();
    }
    return Object.freeze({ ingest, snapshot, reject });
  }
  let lastRendered = '';
  function render(detail) {
    const signature = JSON.stringify(detail);
    if (lastRendered === signature) return;
    lastRendered = signature;
    window.dispatchEvent(new CustomEvent('mlclosure:modelstatus', { detail }));
  }
  window.MLClosureModelLog = Object.freeze({ createTracker, render });
})();
