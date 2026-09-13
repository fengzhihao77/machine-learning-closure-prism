/* Presentation only: draw the exported samples, without changing the solver or data. */
(() => {
  'use strict';
  const columns = ['r_range', 'g_r', 'k_range', 'h_k', 'w_k', 'c_k', 's_k'];
  const definitions = {
    g_r: { x: 0, y: 1, xLabel: 'r', yLabel: 'g(r)', baseline: 1 },
    h_k: { x: 2, y: 3, xLabel: 'k', yLabel: 'h(k)', baseline: 0 },
    w_k: { x: 2, y: 4, xLabel: 'k', yLabel: 'ω(k)', baseline: 1 },
    c_k: { x: 2, y: 5, xLabel: 'k', yLabel: 'c(k)', baseline: 0 },
    s_k: { x: 2, y: 6, xLabel: 'k', yLabel: 's(k)', baseline: 1 }
  };
  const escapeXML = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const clean = (value) => Object.is(value, -0) ? 0 : value;
  const format = (value) => {
    value = clean(value);
    return Math.abs(value) >= 1e5 || (value !== 0 && Math.abs(value) < 1e-3)
      ? value.toExponential(1).replace('e+', 'e') : String(Number(value.toPrecision(8)));
  };

  function parse(text) {
    const lines = text.trim().split(/\r?\n/);
    if (!lines[0]?.startsWith('#') || lines.shift().slice(1).split(',').map((s) => s.trim()).join(',') !== columns.join(',')) {
      throw new Error('The paper-style plot needs the original seven-column output header.');
    }
    const rows = lines.filter((line) => line.trim()).map((line) => line.trim().split(/\s+/).map(Number));
    if (rows.length !== 2048 || rows.some((row) => row.length !== 7 || row.some((value) => !Number.isFinite(value)))) {
      throw new Error('The paper-style plot needs 2,048 complete, finite rows.');
    }
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] <= rows[i - 1][0] || rows[i][2] <= rows[i - 1][2]) throw new Error('The exported coordinate samples must be strictly increasing.');
    }
    return rows;
  }

  function axisLimits(values, baseline) {
    let lo = Math.min(...values, baseline), hi = Math.max(...values, baseline);
    const nonnegative = lo >= 0;
    const span = hi - lo || Math.max(Math.abs(lo), 1);
    lo -= span * 0.025;
    if (nonnegative) lo = Math.max(0, lo);
    hi += span * 0.045;
    const power = 10 ** Math.floor(Math.log10((hi - lo) / 5));
    if (![lo, hi, power].every(Number.isFinite) || power <= 0 || hi <= lo) {
      throw new Error('This numeric range cannot be displayed safely in the paper-style view. Use the original export.');
    }
    const candidates = [0.5, 1, 2, 2.5, 5, 10, 20].map((n) => n * power);
    const ranked = candidates.map((step) => {
      const lower = Math.floor(lo / step) * step, upper = Math.ceil(hi / step) * step;
      const intervals = Math.round((upper - lower) / step);
      return { lo: lower, hi: upper, step, score: Math.abs(intervals - 5) + (intervals < 4 ? 3 : 0) };
    }).sort((a, b) => a.score - b.score);
    return ranked[0];
  }

  function makeSVG(rows, key, sourceHash) {
    const def = definitions[key];
    // Match the existing app's visible range. Samples outside the axes are clipped,
    // not discarded from the source data or replaced with interpolated values.
    const xlim = [0, 10];
    const visible = rows.filter((row) => row[def.x] >= xlim[0] && row[def.x] <= xlim[1]);
    if (!visible.length) throw new Error('No exported coordinate samples lie in the displayed range.');
    const y = axisLimits(visible.map((row) => row[def.y]), def.baseline);
    const left = 104, top = 28, size = 600, right = left + size, bottom = top + size;
    const px = (value) => left + (value - xlim[0]) / (xlim[1] - xlim[0]) * size;
    const py = (value) => bottom - (value - y.lo) / (y.hi - y.lo) * size;
    const coordinate = (value) => {
      if (!Number.isFinite(value)) throw new Error('A display coordinate exceeded the supported range. Use the original export.');
      return Number(value.toFixed(7));
    };
    const metadata = {
      schema: 'ml-closure-paper-plot-v1', quantity: key, sourceSHA256: sourceHash,
      columns, xColumn: columns[def.x], yColumn: columns[def.y], rowCount: rows.length,
      xLimits: xlim, yLimits: [y.lo, y.hi], axisBox: { left, top, width: size, height: size },
      rendering: 'Straight segments joining every exported sample; no smoothing, resampling, or unit conversion.',
      uncertainty: key === 'c_k' ? 'Mean only. Per-fold uncertainty is not in pred_data.txt; see original engine PNG.' : 'Not added.',
      samples: rows.map((row) => [row[def.x], row[def.y]])
    };
    const parts = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="744" height="718" viewBox="0 0 744 718" role="img" aria-labelledby="plot-title plot-description">',
      `<title id="plot-title">${escapeXML(def.yLabel)} — ML closure</title>`,
      `<desc id="plot-description">${escapeXML(metadata.rendering + ' ' + metadata.uncertainty)}</desc>`,
      `<metadata id="ml-closure-provenance">${escapeXML(JSON.stringify(metadata))}</metadata>`,
      '<rect width="744" height="718" fill="#fff"/>',
      `<defs><clipPath id="axes-clip"><rect x="${left}" y="${top}" width="${size}" height="${size}"/></clipPath></defs>`,
      '<g font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#101010">'
    ];
    // The paper uses enclosed axes, inward ticks, restrained reference lines, and
    // a red ML curve. Parameters belong to the surrounding figure toolbar.
    parts.push(`<path d="M${left},${py(def.baseline)}H${right}" stroke="#777" stroke-width="1.3" stroke-dasharray="5 4" fill="none" clip-path="url(#axes-clip)"/>`);
    const path = rows.map((row, i) => `${i ? 'L' : 'M'}${coordinate(px(row[def.x]))},${coordinate(py(row[def.y]))}`).join(' ');
    parts.push(`<path id="ml-curve" d="${path}" clip-path="url(#axes-clip)" fill="none" stroke="#ef171f" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>`);
    parts.push(`<rect x="${left}" y="${top}" width="${size}" height="${size}" fill="none" stroke="#101010" stroke-width="1.8"/>`);
    for (let i = 0; i <= 10; i++) {
      const x = px(i), length = i % 2 === 0 ? 13 : 7;
      parts.push(`<path d="M${x},${top}v${length}M${x},${bottom}v-${length}" stroke="#101010" stroke-width="1.5"/>`);
      if (i % 2 === 0) parts.push(`<text x="${x}" y="${bottom + 35}" text-anchor="middle">${i}</text>`);
    }
    const intervals = Math.round((y.hi - y.lo) / y.step);
    for (let i = 0; i <= intervals * 2; i++) {
      const value = y.lo + i * y.step / 2, yy = py(value), length = i % 2 === 0 ? 13 : 7;
      parts.push(`<path d="M${left},${yy}h${length}M${right},${yy}h-${length}" stroke="#101010" stroke-width="1.5"/>`);
      if (i % 2 === 0) parts.push(`<text x="${left - 15}" y="${yy}" dy=".34em" text-anchor="end">${format(value)}</text>`);
    }
    parts.push(`<text x="${left + size / 2}" y="${bottom + 76}" font-family="Times New Roman, Times, serif" font-size="34" font-style="italic" text-anchor="middle">${def.xLabel}</text>`);
    parts.push(`<text transform="translate(29 ${top + size / 2}) rotate(-90)" font-family="Times New Roman, Times, serif" font-size="34" font-style="italic" text-anchor="middle">${escapeXML(def.yLabel)}</text>`);
    parts.push('</g></svg>');
    return { svg: parts.join(''), metadata };
  }

  async function render(dataText) {
    const rows = parse(dataText);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataText));
    const sourceHash = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const plots = {};
    try {
      for (const key of Object.keys(definitions)) {
        const { svg, metadata } = makeSVG(rows, key, sourceHash);
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        plots[key] = { url: URL.createObjectURL(blob), mime: 'image/svg+xml', extension: 'svg', metadata };
      }
    } catch (error) {
      Object.values(plots).forEach((plot) => URL.revokeObjectURL(plot.url));
      throw error;
    }
    return { plots, rows: rows.length, sourceHash, dispose() { Object.values(plots).forEach((plot) => URL.revokeObjectURL(plot.url)); } };
  }

  window.MLScientificPlots = Object.freeze({ render });
})();
