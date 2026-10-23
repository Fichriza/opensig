/* OpenSig operations: how each derived window computes its data from its parent window(s).
   input: 'visible' recomputes when the parent's zoom changes; 'full' only when the parent's data changes. */
(function (root) {
  'use strict';
  const { DSP } = root;

  const sig1 = (y, x0, dx, xUnit, yUnit, extra) => Object.assign({ y, x0, dx, xUnit, yUnit }, extra || {});
  const fsOf = d => 1 / d.dx;
  const like = (d, y, extra) => sig1(y, d.x0, d.dx, d.xUnit, d.yUnit, Object.assign({ t0abs: d.t0abs }, extra || {}));
  const need1D = d => { if (!d || !d.y) throw new Error('This tool needs a 1D signal window as parent'); return d; };
  const needUniform = d => { need1D(d); if (d.x) throw new Error('This tool needs a uniformly sampled signal'); return d; };

  const OPS = {
    fft: {
      // FFT window (see DSP.svSpectrum); parameters follow the Spectral analysis defaults dialog
      label: p => {
        const s = DSP.svSettings(p), lg = s.dB && /Mag|Power/.test(s.type);
        return 'FFT – ' + s.type + (lg ? (s.dBFS ? ' (dBFS)' : ' (dB)') : '') + (s.customFilter ? ', ' + s.customFilter : '') +
          (s.mode === 'segments' ? `, averaged ${s.segmentCount}×` : s.mode === 'last' ? `, last ${s.liveAverage} spectra` : '');
      },
      kind: '1d', input: 'visible',
      compute(win, [d], p) {
        needUniform(d);
        let x = d.y;
        if (x.length > (1 << 22)) x = x.subarray(x.length - (1 << 22));
        if (x.length < 4) throw new Error('Not enough samples in the visible part');
        const s = DSP.svSettings(p);
        if (p.gainFn) s.gainFn = p.gainFn;
        const sp = DSP.svSpectrum(x, fsOf(d), s, win.state);
        const lg = s.dB && /Mag|Power/.test(s.type), u = d.yUnit || '';
        const yUnit = s.type === 'Phase' ? 'deg' : lg ? (s.dBFS ? 'dBFS' : 'dB') : s.type.startsWith('Power spectral') ? (u || 'u') + '²/Hz' : s.type === 'Power spectrum' ? (u ? u + '²' : '') : u;
        const out = sig1(sp.y, sp.x0, sp.dx, sp.xUnit, yUnit, { spectrum: sp,
          fftInfo: `${sp.segLen} pts → ${sp.nfft}-pt FFT, Δf ${PLOT.fmt(sp.df, sp.df)} Hz${sp.segments > 1 ? ', ' + sp.segments + ' segments' : ''}${s.mode === 'last' && win.state.buf && win.state.buf.length < s.liveAverage ? `, collecting ${win.state.buf.length}/${s.liveAverage}` : ''}` });
        if (s.toFreq > 0) out.defaultView = { x0: s.fromFreq || 0, x1: s.toFreq };
        return out;
      }
    },
    spectrogram: {
      label: p => (p.mesh ? 'Time FFT' : 'Spectrogram') + ` (${p.segmentLength} pts, ${p.overlap}% overlap)`,
      kind: '3d', input: 'visible',
      compute(win, [d], p) {
        needUniform(d);
        const fs = fsOf(d), sg = DSP.spectrogram(d.y, fs, p);
        if (!sg.rows.length) throw new Error('Visible part is shorter than one FFT segment (' + p.segmentLength + ' samples)');
        for (const r of sg.rows) r.t += d.x0;
        let lo = Infinity, hi = -Infinity;
        for (const r of sg.rows) for (const v of r.v) { if (v > hi) hi = v; if (v < lo) lo = v; }
        return { sg, fMax: fs / 2, t0: d.x0, t1: d.x0 + d.y.length * d.dx, zAuto: [Math.max(lo, hi - 100), hi], xUnit: d.xUnit || 's', yUnit: 'Hz' };
      }
    },
    slice: {
      label: p => p.axis === 'x' ? `Spectrum at ${PLOT.fmt(p.at, p.at)} s` : `Level at ${PLOT.fmt(p.at, p.at)} Hz over time`,
      kind: '1d', input: 'full',
      compute(win, [d], p) {
        if (!d || !d.sg) throw new Error('Parent must be a 3D window');
        const rows = d.sg.rows;
        if (p.axis === 'x') {
          let best = rows[0]; for (const r of rows) if (Math.abs(r.t - p.at) < Math.abs(best.t - p.at)) best = r;
          return sig1(Float64Array.from(best.v), d.sg.f0 || 0, d.sg.df, 'Hz', 'dB');
        }
        const k = Math.max(0, Math.min(d.sg.bins - 1, Math.round((p.at - (d.sg.f0 || 0)) / d.sg.df)));
        return sig1(Float64Array.from(rows, r => r.v[k]), 0, 0, 's', 'dB', { x: Float64Array.from(rows, r => r.t) });
      }
    },
    fftfilter: {
      label: p => `FFT filter: ${p.type} ${p.type.startsWith('band') ? p.f1 + '–' + p.f2 : p.f1} Hz`,
      kind: '1d', input: 'full',
      compute(win, [d], p) { needUniform(d); return like(d, DSP.fftFilter(d.y, fsOf(d), p.type, p.f1, p.f2, p.slope, p.stopDb)); }
    },
    iirfilter: {
      label: p => `IIR Butterworth ${p.type}, order ${p.order}, ${p.type.startsWith('band') ? p.f1 + '–' + p.f2 : p.f1} Hz`,
      kind: '1d', input: 'full',
      compute(win, [d], p) { needUniform(d); return like(d, DSP.iirFilter(d.y, fsOf(d), p.type, p.order, p.f1, p.f2).y); }
    },
    movavg: { label: p => `Moving average (${p.len} pts, ${p.weighting})`, kind: '1d', input: 'full', compute: (w, [d], p) => like(need1D(d), DSP.movingAverage(d.y, p.len, p.weighting)) },
    detrend: { label: () => 'Linear trend removed', kind: '1d', input: 'full', compute: (w, [d]) => like(need1D(d), DSP.removeTrend(d.y)) },
    removedc: { label: () => 'DC offset removed', kind: '1d', input: 'full', compute: (w, [d]) => like(need1D(d), DSP.removeMean(d.y)) },
    removepeaks: { label: p => `Peaks > ${p.k}·σ removed`, kind: '1d', input: 'full', compute: (w, [d], p) => like(need1D(d), DSP.removePeaks(d.y, p.k)) },
    scale: {
      label: p => p.mode === 'range' ? `Scaled to ${p.a}…${p.b}` : `${p.a} + ${p.b}·x`, kind: '1d', input: 'full',
      compute: (w, [d], p) => like(need1D(d), DSP.scale(d.y, p.mode, p.a, p.b))
    },
    resample: {
      label: p => `Resampled to ${p.fs} Hz`, kind: '1d', input: 'full',
      compute(w, [d], p) { needUniform(d); const y = DSP.resample(d.y, fsOf(d), p.fs); return sig1(y, d.x0, 1 / p.fs, d.xUnit, d.yUnit); }
    },
    integral: { label: () => 'Integral curve', kind: '1d', input: 'full', compute: (w, [d]) => like(needUniform(d), DSP.integral(d.y, d.dx)) },
    differentiate: { label: () => 'Derivative', kind: '1d', input: 'full', compute: (w, [d]) => like(needUniform(d), DSP.differentiate(d.y, d.dx)) },
    sorted: { label: () => 'Sorted values', kind: '1d', input: 'visible', compute: (w, [d]) => sig1(Float64Array.from(need1D(d).y).sort(), 0, 1, 'index', d.yUnit) },
    autocorr: { label: () => 'Autocorrelation', kind: '1d', input: 'visible', compute: (w, [d]) => sig1(DSP.autocorrelation(needUniform(d).y), 0, d.dx, 'lag ' + (d.xUnit || ''), '') },
    envelope: { label: () => 'Envelope (Hilbert)', kind: '1d', input: 'full', compute: (w, [d]) => like(needUniform(d), DSP.hilbertEnvelope(d.y)) },
    instfreq: { label: () => 'Instantaneous frequency (Hilbert)', kind: '1d', input: 'full', compute: (w, [d]) => sig1(DSP.instantaneousFrequency(needUniform(d).y, fsOf(d)), d.x0, d.dx, d.xUnit, 'Hz') },
    histogram: {
      label: p => 'Probability distribution' + (p.bins ? ` (${p.bins} bins)` : ''), kind: '1d', input: 'visible', style: 'hist',
      compute(w, [d], p) { const h = DSP.histogram(need1D(d).y, p.bins); return sig1(h.counts, h.x0, h.dx, d.yUnit || 'value', 'probability'); }
    },
    peakhold: {
      label: p => p.min ? 'Min hold' : 'Peak hold', kind: '1d', input: 'visible', stateful: true,
      compute(win, [d], p) {
        need1D(d);
        const st = win.state;
        if (!st.y || st.y.length !== d.y.length) st.y = Float64Array.from(d.y);
        else for (let i = 0; i < d.y.length; i++) st.y[i] = p.min ? Math.min(st.y[i], d.y[i]) : Math.max(st.y[i], d.y[i]);
        return Object.assign({}, d, { y: Float64Array.from(st.y) });
      }
    },
    averager: {
      label: p => p.mode === 'exp' ? `Exponential average (${p.weight}% new)` : `Linear average`, kind: '1d', input: 'visible', stateful: true,
      compute(win, [d], p) {
        need1D(d);
        const st = win.state, toLin = v => p.logScale ? Math.pow(10, v / 10) : v, fromLin = v => p.logScale ? 10 * Math.log10(v) : v;
        if (!st.acc || st.acc.length !== d.y.length) { st.acc = Float64Array.from(d.y, toLin); st.n = 1; }
        else {
          st.n++;
          const a = p.mode === 'exp' ? p.weight / 100 : 1 / st.n;
          for (let i = 0; i < d.y.length; i++) st.acc[i] += (toLin(d.y[i]) - st.acc[i]) * a;
        }
        return Object.assign({}, d, { y: Float64Array.from(st.acc, fromLin), note: st.n + ' averages' });
      }
    },
    octave: {
      label: p => (p.fraction === 1 ? 'Octave' : '1/' + p.fraction + ' octave') + ' plot' + (p.weighting ? ' (' + p.weighting + '-weighted)' : ''),
      kind: '1d', input: 'visible', style: 'hist-bottom', logX: true,
      compute(win, [d], p) {
        needUniform(d);
        const sp = DSP.spectrum(d.y, fsOf(d), { type: 'Power spectrum', window: 'Hann', dB: false });
        const bands = DSP.octaveBands(sp.bandPow, sp.df, p.fraction, fsOf(d) / 2, p.weighting);
        if (!bands.length) throw new Error('Signal too short for octave analysis');
        return sig1(Float64Array.from(bands, b => b.level), 0, 0, 'Hz', 'dB', { x: Float64Array.from(bands, b => b.fc),
          bands: bands.map(b => ({ lo: b.lo, hi: b.hi, label: b.fc >= 1000 ? +(b.fc / 1000).toPrecision(3) + 'k' : String(+b.fc.toPrecision(3)) })) });
      }
    },
    srs: {
      label: p => `Shock response spectrum (Q=${p.Q})`, kind: '1d', input: 'visible', logX: true,
      compute(win, [d], p) {
        needUniform(d);
        const r = DSP.srs(d.y, fsOf(d), p.fMin, p.fMax, p.perOctave, p.Q, p.mode);
        if (!r.freqs.length) throw new Error('No frequencies in range');
        return sig1(Float64Array.from(r.vals), 0, 0, 'Hz', d.yUnit, { x: Float64Array.from(r.freqs) });
      }
    },
    overtime: {
      label: p => `${p.instrument} over time (${p.segLen} pts)`, kind: '1d', input: 'full',
      compute(win, [d], p) {
        needUniform(d);
        const I = INSTRUMENTS[p.instrument], len = Math.max(4, p.segLen), hop = Math.max(1, p.hop || len), xs = [], ys = [];
        for (let s = 0; s + len <= d.y.length; s += hop) {
          const seg = like(d, d.y.subarray(s, s + len), { x0: d.x0 + s * d.dx });
          xs.push(d.x0 + (s + len / 2) * d.dx); ys.push(I.compute(seg).value);
          if (xs.length > 20000) break;
        }
        if (!xs.length) throw new Error('Signal shorter than one segment');
        return sig1(Float64Array.from(ys), 0, 0, d.xUnit, I.unit ? I.unit(d) : d.yUnit, { x: Float64Array.from(xs) });
      }
    },
    peaks: {
      label: p => `Peak detection (> ${p.pos})`, kind: '1d', input: 'visible',
      compute(win, [d], p) {
        need1D(d);
        // windows from earlier OpenSig workspaces; peak detection is now a window setting (display.peaks)
        const idx = DSP.svPeaks(d.y, { pos: p.pos, neg: -Math.abs(p.neg), width: p.minWidth, negative: p.negative });
        const xOf = i => d.x ? d.x[i] : d.x0 + i * d.dx;
        return sig1(Float64Array.from(idx, i => d.y[i]), 0, 0, d.xUnit, d.yUnit, { x: Float64Array.from(idx, xOf), style: 'dots', note: idx.length + ' peaks' });
      }
    },
    extract: {
      label: p => `Part ${PLOT.fmt(p.from, p.to - p.from)}–${PLOT.fmt(p.to, p.to - p.from)}`, kind: '1d', input: 'full',
      compute(win, [d], p) {
        needUniform(d);
        const i0 = Math.max(0, Math.round((p.from - d.x0) / d.dx)), i1 = Math.min(d.y.length, Math.round((p.to - d.x0) / d.dx) + 1);
        if (i1 - i0 < 1) throw new Error('Range is outside the signal');
        return like(d, Float64Array.from(d.y.subarray(i0, i1)), { x0: d.x0 + i0 * d.dx });
      }
    },
    calc: {
      label: p => '= ' + p.expr, kind: '1d', input: 'full', multi: true,
      compute(win, parents, p, ctx) {
        const ast = EXPR.parse(p.expr);
        const r = EXPR.evaluate(ast, n => { const w = ctx.byNumber(n); return w && w.data && w.data.y ? w.data : null; });
        if (typeof r === 'number') return sig1(Float64Array.of(r), 0, 1, '', '', { note: 'scalar result ' + r });
        return { y: r.y, x0: r.x0 ?? 0, dx: r.dx || 1, xUnit: r.xUnit || '', yUnit: r.yUnit || '', x: r.x };
      }
    },
    instrument: {
      label: p => p.instrument + (p.arg != null ? ' (' + p.arg + ')' : ''), kind: 'instrument', input: 'visible',
      compute(win, [d], p) {
        const I = INSTRUMENTS[p.instrument]; if (!I) throw new Error('Unknown instrument');
        if (I.needs3D ? !d.sg : !d.y) throw new Error(I.needs3D ? 'Needs a 3D parent' : 'Needs a 1D parent');
        const r = I.compute(d, p.arg, win);
        const st = win.state; st.hist = st.hist || [];
        if (isFinite(r.value)) { st.hist.push(r.value); if (st.hist.length > 1000) st.hist.shift(); }
        return Object.assign({ unit: I.unit ? I.unit(d) : '' }, r);
      }
    }
  };

  /* ---------- Instruments (scalar measures of the parent's visible part) ---------- */
  const xOf = (d, i) => d.x ? d.x[i] : d.x0 + i * d.dx;
  const yU = d => d.yUnit || '', xU = d => d.xUnit || '';
  const isSpec = d => d.xUnit === 'Hz';
  // X positions of the peaks that the source window's peak detection finds in its visible part
  function peaksFor(d, thr, win) {
    const src = win && root.APP && root.APP.S.wins.get(win.parents[0]), pk = src && root.APP.peaksOf(src);
    if (pk) return pk.x;
    if (thr != null) return Array.from(DSP.svPeaks(d.y, { pos: +thr, width: 1 }), i => xOf(d, i)); // Peak count windows of earlier workspaces
    throw new Error('Turn on peak detection in the source window first (Signal tools ▸ Peak detection…)');
  }
  OPS.peaksFor = peaksFor;
  const linPowOf = d => {
    if (isSpec(d) && d.spectrum) return { p: d.spectrum.bandPow, df: d.spectrum.df };
    const sp = DSP.spectrum(d.y, 1 / d.dx, { type: 'Power spectrum', window: 'Hann', dB: false });
    return { p: sp.bandPow, df: sp.df };
  };
  const INSTRUMENTS = {
    'Value at': { arg: 'Position (x)', compute: (d, at) => { const i = d.x ? 0 : Math.max(0, Math.min(d.y.length - 1, Math.round((at - d.x0) / d.dx))); return { value: d.y[i], marker: { x: xOf(d, i), y: d.y[i] } }; }, unit: yU },
    'Mean': { compute: d => ({ value: DSP.stats(d.y).mean, hline: true }), unit: yU },
    'Sum': { compute: d => ({ value: DSP.stats(d.y).sum }), unit: yU },
    'Median value': { compute: d => ({ value: DSP.quantile(d.y, 0.5), hline: true }), unit: yU },
    'Quantile value': { arg: 'Quantile (0…1)', compute: (d, q) => ({ value: DSP.quantile(d.y, q ?? 0.9), hline: true }), unit: yU },
    'Standard deviation': { compute: d => ({ value: DSP.stats(d.y).std }), unit: yU },
    'Variance': { compute: d => ({ value: DSP.stats(d.y).variance }), unit: d => yU(d) ? yU(d) + '²' : '' },
    'Skewness': { compute: d => ({ value: DSP.stats(d.y).skewness }) },
    'Kurtosis': { compute: d => ({ value: DSP.stats(d.y).kurtosis }) },
    'RMS': { compute: d => ({ value: DSP.stats(d.y).rms, hline: true }), unit: yU },
    'RMS - normalized': { compute: d => ({ value: DSP.stats(DSP.removeMean(d.y)).rms }), unit: yU },
    'RMS of a frequency range': {
      arg: 'Range "from-to" Hz', compute: (d, arg) => {
        const [a, b] = String(arg || '0-1e9').split('-').map(Number), { p, df } = linPowOf(d);
        let s = 0; for (let k = 1; k < p.length; k++) { const f = k * df; if (f >= a && f <= b) s += p[k]; }
        return { value: Math.sqrt(s) };
      }, unit: yU
    },
    'Overall dB(A)': { compute: d => { const { p, df } = linPowOf(d); return { value: DSP.weightedLevel(p, df, 'A') }; }, unit: () => 'dB(A)' },
    'Overall dB(C)': { compute: d => { const { p, df } = linPowOf(d); return { value: DSP.weightedLevel(p, df, 'C') }; }, unit: () => 'dB(C)' },
    'Overall dB(Z)': { compute: d => { const { p, df } = linPowOf(d); return { value: DSP.weightedLevel(p, df, 'Z') }; }, unit: () => 'dB(Z)' },
    'Crest factor': { compute: d => { const s = DSP.stats(d.y); return { value: s.rms ? Math.max(Math.abs(s.max), Math.abs(s.min)) / s.rms : 0 }; } },
    'Integral': { compute: d => { const r = DSP.integral(d.y, d.dx || 1); return { value: r[r.length - 1] }; }, unit: d => yU(d) + '·' + xU(d) },
    'Signal-To-Noise Ratio (SNR)': { compute: d => ({ value: DSP.harmonicAnalysis(d.y, 1 / d.dx).snr }), unit: () => 'dB', timeOnly: true },
    'Total Harmonic Distortion (THD)': { compute: d => ({ value: DSP.harmonicAnalysis(d.y, 1 / d.dx).thd }), unit: () => '%', timeOnly: true },
    'THD + Noise': { compute: d => ({ value: DSP.harmonicAnalysis(d.y, 1 / d.dx).thdn }), unit: () => '%', timeOnly: true },
    'Mean frequency': { compute: d => { const { p, df } = linPowOf(d); return { value: DSP.spectralMeasures(p, df).meanFreq }; }, unit: () => 'Hz' },
    'Median frequency': { compute: d => { const { p, df } = linPowOf(d); return { value: DSP.spectralMeasures(p, df).medianFreq }; }, unit: () => 'Hz' },
    'Spectral centroid': { compute: d => { const { p, df } = linPowOf(d); return { value: DSP.spectralMeasures(p, df).centroid }; }, unit: () => 'Hz' },
    'Spectral flatness': { compute: d => { const { p, df } = linPowOf(d); return { value: DSP.spectralMeasures(p, df).flatness }; } },
    'Dominant frequency': { compute: d => { const { p, df } = linPowOf(d); return { value: DSP.spectralMeasures(p, df).dominant }; }, unit: () => 'Hz' },
    'Maximum': { compute: d => { const s = DSP.stats(d.y); return { value: s.max, marker: { x: xOf(d, s.imax), y: s.max } }; }, unit: yU },
    'Minimum': { compute: d => { const s = DSP.stats(d.y); return { value: s.min, marker: { x: xOf(d, s.imin), y: s.min } }; }, unit: yU },
    'Maximum position': { compute: d => { const s = DSP.stats(d.y); return { value: xOf(d, s.imax), marker: { x: xOf(d, s.imax), y: s.max } }; }, unit: xU },
    'Maximum position (interpolated)': {
      compute: d => { const s = DSP.stats(d.y), p = DSP.interpPeak(d.y, s.imax), x = d.x ? xOf(d, s.imax) : d.x0 + p.pos * d.dx; return { value: x, marker: { x, y: p.val } }; }, unit: xU
    },
    'Minimum position': { compute: d => { const s = DSP.stats(d.y); return { value: xOf(d, s.imin), marker: { x: xOf(d, s.imin), y: s.min } }; }, unit: xU },
    'Peak-To-Peak': { compute: d => { const s = DSP.stats(d.y); return { value: s.max - s.min }; }, unit: yU },
    'Zero-crossing rate': { compute: d => ({ value: DSP.zeroCrossingRate(d.y, 1 / d.dx) }), unit: d => '1/' + (xU(d) || 'x'), timeOnly: true },
    // counts the peaks found by the source window's peak detection (Signal tools ▸ Peak detection…)
    'Peak count': { compute: (d, thr, win) => ({ value: peaksFor(d, thr, win).length }) },
    'Fundamental frequency': { compute: d => ({ value: DSP.harmonicAnalysis(d.y, 1 / d.dx).f1 }), unit: () => 'Hz', timeOnly: true },
    'Const': { arg: 'Value', compute: (d, v) => ({ value: +(v ?? 0), hline: true }), unit: yU }
  };

  root.OPS = OPS; root.INSTRUMENTS = INSTRUMENTS;
})(window);
