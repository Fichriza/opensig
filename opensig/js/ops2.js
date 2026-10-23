/* OpenSig additional operations: wavelets, cepstrum, tacho/orders, 3D tools, filter curves & banks, more instruments. */
(function (root) {
  'use strict';
  const { DSP, OPS, INSTRUMENTS, PLOT } = root;
  const sig1 = (y, x0, dx, xUnit, yUnit, extra) => Object.assign({ y, x0, dx, xUnit, yUnit }, extra || {});
  const like = (d, y, extra) => sig1(y, d.x0, d.dx, d.xUnit, d.yUnit, Object.assign({ t0abs: d.t0abs }, extra || {}));
  const fsOf = d => 1 / d.dx;
  const needU = d => { if (!d || !d.y || d.x) throw new Error('This tool needs a uniformly sampled signal window as parent'); return d; };
  const need3D = d => { if (!d || !d.sg) throw new Error('This tool needs a 3D window (spectrogram / time FFT) as parent'); return d; };
  const fmt = v => PLOT.fmt(v, Math.abs(v) / 1000 || 1);

  /* ---------- Filter curves (custom FFT filters, spectral weighting) ---------- */
  // curve: {name, type:'dB'|'coef'|'mag', f:[], v:[]}. Stored per user in localStorage and inside workspaces.
  const FILTERS = {
    builtin: {
      'A-weighting': { name: 'A-weighting', type: 'dB', fn: f => DSP.aWeightDb(f) },
      'C-weighting': { name: 'C-weighting', type: 'dB', fn: f => DSP.cWeightDb(f) }
    },
    user: {},
    load() { try { this.user = JSON.parse(localStorage.getItem('opensig.filters') || '{}'); } catch (e) { this.user = {}; } },
    save() { try { localStorage.setItem('opensig.filters', JSON.stringify(this.user)); } catch (e) { /* storage unavailable */ } },
    names() { return Object.keys(this.builtin).concat(Object.keys(this.user)); },
    get(name) { return this.builtin[name] || this.user[name] || null; },
    value(c, f) {
      if (c.fn) return c.fn(f);
      const F = c.f, V = c.v; if (!F.length) return c.type === 'coef' ? 1 : 0;
      if (f <= F[0]) return V[0]; if (f >= F[F.length - 1]) return V[V.length - 1];
      let lo = 0, hi = F.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (F[m] > f) hi = m; else lo = m; }
      return V[lo] + (V[hi] - V[lo]) * (f - F[lo]) / (F[hi] - F[lo]);
    },
    // linear amplitude gain for 'dB' and 'coef' curves
    gainFn(name) {
      const c = this.get(name); if (!c || c.type === 'mag') return null;
      return f => c.type === 'dB' ? Math.pow(10, this.value(c, f) / 20) : Math.max(0, this.value(c, f));
    },
    // .flt filter curve format: "Type=DB_ADD|…", "########", then "freq<TAB>value" lines
    parseFlt(text, name) {
      const lines = text.split(/\r?\n/); let type = 'dB', i = 0;
      for (; i < lines.length; i++) {
        const l = lines[i].trim();
        if (/^type=/i.test(l)) { const t = l.split('=')[1].toUpperCase(); type = /DB/.test(t) ? 'dB' : /MAG|SUB/.test(t) ? 'mag' : 'coef'; }
        if (/^#+$/.test(l)) { i++; break; }
        if (/^[-\d.]/.test(l)) break;
      }
      const f = [], v = [];
      for (; i < lines.length; i++) { const p = lines[i].trim().split(/[\s;,]+/).map(Number); if (p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) { f.push(p[0]); v.push(p[1]); } }
      if (f.length < 2) throw new Error('No frequency/value pairs found in filter file');
      return { name, type, f, v };
    }
  };
  FILTERS.load();
  // Filter banks (".flb": one "from;to" band per line)
  const BANKS = {
    'Octave (10 bands)': [[22, 44], [44, 88], [88, 177], [177, 355], [355, 710], [710, 1420], [1420, 2840], [2840, 5680], [5680, 11360], [11360, 22720]],
    parse(text) {
      const b = text.split(/\r?\n/).map(l => l.trim().split(/[;,\s]+/).map(Number)).filter(p => p.length >= 2 && isFinite(p[0]) && isFinite(p[1]) && p[1] > p[0]);
      if (!b.length) throw new Error('No "from;to" band lines found');
      return b.map(p => [p[0], p[1]]);
    }
  };
  root.FILTERS = FILTERS; root.BANKS = BANKS;

  // FFT filter with custom curve (extends the original FFT filter op).
  const baseFftFilter = OPS.fftfilter.compute;
  OPS.fftfilter.compute = function (w, [d], p) {
    if (p.type !== 'custom') return baseFftFilter(w, [d], p);
    needU(d);
    const c = FILTERS.get(p.curve); if (!c) throw new Error('Filter curve "' + p.curve + '" not found');
    const n = d.y.length, N = DSP.nextPow2(n * 2), re = new Float64Array(N), im = new Float64Array(N), fs = fsOf(d), m = DSP.mean(d.y);
    for (let i = 0; i < n; i++) re[i] = d.y[i] - m;
    DSP.fft(re, im, false);
    for (let k = 0; k <= N / 2; k++) {
      const f = k * fs / N; let g;
      if (c.type === 'mag') { const mag = Math.hypot(re[k], im[k]) * 2 / n, sub = Math.max(0, mag - FILTERS.value(c, f)); g = mag > 0 ? sub / mag : 0; }
      else g = c.type === 'dB' ? Math.pow(10, FILTERS.value(c, f) / 20) : Math.max(0, FILTERS.value(c, f));
      re[k] *= g; im[k] *= g; if (k > 0 && k < N / 2) { re[N - k] *= g; im[N - k] *= g; }
    }
    DSP.fft(re, im, true);
    const out = new Float64Array(n); for (let i = 0; i < n; i++) out[i] = re[i] / N + (FILTERS.value(c, 0) !== 0 || c.type !== 'dB' ? m : 0);
    return like(d, out);
  };
  const baseFftLabel = OPS.fftfilter.label;
  OPS.fftfilter.label = p => p.type === 'custom' ? 'FFT filter: curve "' + p.curve + '"' : baseFftLabel(p);
  // Spectral analysis "custom filtering"
  const baseFft = OPS.fft.compute;
  OPS.fft.compute = function (w, inputs, p, ctx) {
    if (!p.customFilter && (p.weighting === 'A' || p.weighting === 'C')) p = Object.assign({}, p, { customFilter: p.weighting + '-weighting', weighting: null });
    if (p.customFilter && /^[ac]-weighting(\.flt)?$/i.test(p.customFilter)) p = Object.assign({}, p, { customFilter: p.customFilter[0].toUpperCase() + '-weighting' });
    if (p.customFilter) { const g = FILTERS.gainFn(p.customFilter); if (!g) throw new Error('Custom filter "' + p.customFilter + '" not found or not usable for spectra'); return baseFft(w, inputs, Object.assign({}, p, { gainFn: g }), ctx); }
    return baseFft(w, inputs, p, ctx);
  };

  /* ---------- New operations ---------- */
  Object.assign(OPS, {
    cepstrum: {
      label: () => 'Cepstrum', kind: '1d', input: 'visible',
      compute(w, [d]) { needU(d); if (d.y.length < 16) throw new Error('Visible part too short'); return sig1(DSP.cepstrum(d.y, fsOf(d)), 0, d.dx, 'quefrency ' + (d.xUnit || ''), ''); }
    },
    wavedenoise: {
      label: p => `Wavelet denoised (${p.wavelet}, ${p.levels} levels, ${p.rule}/${p.mode})`, kind: '1d', input: 'full',
      compute(w, [d], p) { needU(d); const r = DSP.waveletDenoise(d.y, p.wavelet, p.levels, p.rule, p.mode); return like(d, Float64Array.from(r.y), { note: `noise σ ≈ ${fmt(r.sigma)}, ${r.levels} levels` }); }
    },
    envmax: { label: () => 'Envelope (local max)', kind: '1d', input: 'full', compute: (w, [d]) => like(needU(d), DSP.envelopeLocalMax(d.y)) },
    zerocross: {
      label: () => 'Zero-crossings', kind: '1d', input: 'full', style: 'hist',
      compute(w, [d]) { needU(d); const r = DSP.zeroCrossings(d.y); return like(d, r.y, { yUnit: '', note: r.count + ' zero-crossings' }); }
    },
    tacho: {
      label: p => p.asRpm ? 'Speed (RPM) from tacho' : 'Speed (Hz) from tacho', kind: '1d', input: 'full',
      compute(w, [d], p) { needU(d); return like(d, DSP.tachoToRpm(d.y, fsOf(d), p.rotationsPerPulse, p.asRpm), { yUnit: p.asRpm ? 'RPM' : 'Hz' }); }
    },
    cwt: {
      label: p => `Continuous wavelet transform (Morlet ω0=${p.w0})`, kind: '3d', input: 'visible',
      compute(w, [d], p) {
        needU(d);
        const fs = fsOf(d), fMax = Math.min(p.fMax || fs / 4, fs / 2), fMin = Math.max(p.fMin || fs / 200, 1e-6);
        if (d.y.length > 1 << 20) throw new Error('Visible part too long for CWT (max 1M samples); zoom in first');
        const sg = DSP.cwt(d.y, fs, fMin, fMax, p.nFreq, p.w0, 1200);
        for (const r of sg.rows) r.t += d.x0;
        let lo = Infinity, hi = -Infinity; for (const r of sg.rows) for (const v of r.v) { if (v > hi) hi = v; if (v < lo) lo = v; }
        return { sg, fMin, fMax, t0: d.x0, t1: d.x0 + d.y.length * d.dx, zAuto: [Math.max(lo, hi - 80), hi], xUnit: 's', yUnit: 'Hz' };
      }
    },
    filterbank: {
      label: p => 'Filter bank plot' + (p.name ? ' – ' + p.name : '') + (p.weighting ? ' (' + p.weighting + ')' : ''), kind: '1d', input: 'visible', style: 'hist-bottom', logX: true,
      compute(w, [d], p) {
        needU(d);
        const sp = DSP.spectrum(d.y, fsOf(d), { type: 'Power spectrum', window: 'Hann', dB: false });
        let pw = sp.bandPow;
        if (p.weighting) { const wf = p.weighting === 'A' ? DSP.aWeightDb : DSP.cWeightDb; pw = pw.map((v, k) => k ? v * Math.pow(10, wf(k * sp.df) / 10) : v); }
        const xs = [], ys = [], bands = [];
        for (const [lo, hi] of p.bands) {
          let s = 0; for (let k = Math.max(1, Math.ceil(lo / sp.df)); k <= Math.min(pw.length - 1, Math.floor(hi / sp.df)); k++) s += pw[k];
          xs.push(Math.sqrt(lo * hi)); ys.push(10 * Math.log10(Math.max(s, 1e-30)));
          bands.push({ lo, hi, label: fmt(Math.sqrt(lo * hi)) });
        }
        return sig1(Float64Array.from(ys), 0, 0, 'Hz', 'dB', { x: Float64Array.from(xs), bands });
      }
    },
    sum3d: {
      label: p => `Level ${p.f1}–${p.f2} Hz over time`, kind: '1d', input: 'full',
      compute(w, [d], p) {
        need3D(d); const sg = d.sg, f0 = sg.f0 || 0;
        const k0 = Math.max(0, Math.round((p.f1 - f0) / sg.df)), k1 = Math.min(sg.bins - 1, Math.round((p.f2 - f0) / sg.df));
        if (k1 < k0) throw new Error('Frequency range outside the 3D data');
        const ys = sg.rows.map(r => { let s = 0; for (let k = k0; k <= k1; k++) s += Math.pow(10, r.v[k] / 10); return 10 * Math.log10(Math.max(s, 1e-30)); });
        return sig1(Float64Array.from(ys), 0, 0, 's', 'dB', { x: Float64Array.from(sg.rows, r => r.t) });
      }
    },
    tfftstats: {
      label: p => `Time FFT statistics: ${p.stat} over ${fmt(p.t1)}–${fmt(p.t2)} s`, kind: '1d', input: 'full',
      compute(w, [d], p) {
        need3D(d); const sg = d.sg, rows = sg.rows.filter(r => r.t >= p.t1 && r.t <= p.t2);
        if (!rows.length) throw new Error('No segments inside the time range');
        const y = new Float64Array(sg.bins);
        for (let k = 0; k < sg.bins; k++) {
          const vals = rows.map(r => r.v[k]);
          // reduce, not Math.max(...vals): a long recording has more segments than a call takes arguments
          if (p.stat === 'max') y[k] = vals.reduce((a, v) => Math.max(a, v), -Infinity); else if (p.stat === 'min') y[k] = vals.reduce((a, v) => Math.min(a, v), Infinity);
          else if (p.stat === 'std') { const m = DSP.mean(vals); y[k] = Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length); }
          else y[k] = 10 * Math.log10(vals.reduce((a, v) => a + Math.pow(10, v / 10), 0) / vals.length); // energy mean
        }
        return sig1(y, sg.f0 || 0, sg.df, 'Hz', 'dB', { note: rows.length + ' segments' });
      }
    },
    track3d: {
      label: p => `Max tracking ${p.f1}–${p.f2} Hz`, kind: '1d', input: 'full',
      compute(w, [d], p) {
        need3D(d); const sg = d.sg, f0 = sg.f0 || 0;
        const k0 = Math.max(0, Math.round((p.f1 - f0) / sg.df)), k1 = Math.min(sg.bins - 1, Math.round((p.f2 - f0) / sg.df));
        const ys = sg.rows.map(r => { let b = k0; for (let k = k0; k <= k1; k++) if (r.v[k] > r.v[b]) b = k; return f0 + DSP.interpPeak(r.v, b).pos * sg.df; });
        return sig1(Float64Array.from(ys), 0, 0, 's', 'Hz', { x: Float64Array.from(sg.rows, r => r.t) });
      }
    },
    filter3d: {
      label: p => `3D filter: ${p.f1}–${p.f2} Hz, ${fmt(p.t1)}–${fmt(p.t2)} s, ${p.db > 0 ? '+' : ''}${p.db} dB`, kind: '3d', input: 'full',
      compute(w, [d], p) {
        need3D(d); const sg = d.sg, f0 = sg.f0 || 0;
        const rows = sg.rows.map(r => {
          if (r.t < p.t1 || r.t > p.t2) return r;
          const v = Float32Array.from(r.v);
          for (let k = 0; k < v.length; k++) { const f = f0 + k * sg.df; if (f >= p.f1 && f <= p.f2) v[k] += p.db; }
          return { t: r.t, v };
        });
        return Object.assign({}, d, { sg: Object.assign({}, sg, { rows }) });
      }
    },
    align: {
      label: () => 'Align signals (delay measurement)', kind: 'display', input: 'full', multi: true,
      compute(w, parents) {
        const ds = parents.filter(d => d && d.y && !d.x);
        if (ds.length < 2) throw new Error('Needs at least two signal windows as parents');
        const lines = ['*** Detected delays (relative to W' + w.parents[0] + '):', ''];
        w.state.delays = [0];
        ds.slice(1).forEach((d, i) => {
          const del = DSP.findDelay(ds[0].y, d.y); w.state.delays.push(del);
          lines.push(`W${w.parents[i + 1]}: ${del} samples (${fmt(del * d.dx)} ${d.xUnit || ''})`);
        });
        lines.push('', 'Use the window menu "Align parent signals" to create aligned copies.');
        return { text: lines.join('\n') };
      }
    },
    report: {
      label: () => 'Signal report', kind: 'display', input: 'visible',
      compute(w, [d]) { needU(d); const m = root.SIGMETRICS.compute(d); w.state.metrics = m; return { text: root.SIGMETRICS.toText(m) }; }
    }
  });

  /* ---------- More instruments ---------- */
  const xOf = (d, i) => d.x ? d.x[i] : d.x0 + i * d.dx;
  const linAmp = d => { // linear amplitude spectrum of a spectrum window (undo dB) or of a time signal
    if (d.xUnit === 'Hz') {
      const db = /dB/.test(d.yUnit || ''), pw = /²|Power/.test(d.yUnit || '');
      return { y: Float64Array.from(d.y, v => db ? Math.pow(10, v / (pw ? 10 : 20)) : v), df: d.dx, f0: d.x0 };
    }
    const sp = DSP.spectrum(d.y, 1 / d.dx, { type: 'Magnitude', window: 'Hann', dB: false });
    return { y: sp.y, df: sp.df, f0: 0 };
  };
  Object.assign(INSTRUMENTS, {
    'Shannon entropy': { compute: d => ({ value: DSP.shannonEntropy(d.y) }), unit: () => 'bits' },
    'Fractal dimension': { compute: d => ({ value: DSP.higuchiFD(d.y, 10) }) },
    'Average peak distance': { compute: (d, a, win) => ({ value: DSP.peakDistance(OPS.peaksFor(d, null, win)) }), unit: d => d.xUnit || '' },
    'Damping factor': {
      compute: d => {
        const a = linAmp(d), r = DSP.dampingFromSpectrum(a.y, a.df, a.f0);
        return { value: r.zeta, text: `f = ${fmt(r.fPeak)} Hz · Δf(−3 dB) = ${fmt(r.bandwidth)} Hz · Q = ${fmt(r.Q)}`, marker: { x: r.fPeak, y: d.y[Math.round((r.fPeak - a.f0) / a.df)] } };
      }
    }
  });
  for (let h = 2; h <= 10; h++) {
    INSTRUMENTS[`Amplitude at ${h}x max. frequency`] = {
      compute: d => {
        const a = linAmp(d); let k1 = 1; for (let k = 2; k < a.y.length; k++) if (a.y[k] > a.y[k1]) k1 = k;
        const f1 = a.f0 + DSP.interpPeak(a.y, k1).pos * a.df, kh = Math.round((f1 * h - a.f0) / a.df);
        let best = kh; for (let j = kh - 2; j <= kh + 2; j++) if (j > 0 && j < a.y.length && a.y[j] > (a.y[best] ?? -Infinity)) best = j;
        if (!(best > 0 && best < a.y.length)) return { value: NaN };
        return { value: d.xUnit === 'Hz' ? d.y[best] : a.y[best], marker: d.xUnit === 'Hz' ? { x: xOf(d, best), y: d.y[best] } : undefined };
      }, unit: d => d.xUnit === 'Hz' ? d.yUnit || '' : d.yUnit || ''
    };
  }

  /* ---------- Signal metrics (signal report, AI report, -savesignalmetrics) ---------- */
  root.SIGMETRICS = {
    compute(d) {
      const fs = 1 / d.dx, y = d.y, s = DSP.stats(y), m = {};
      m.duration = { value: y.length * d.dx, unit: d.xUnit, description: 'Length of the analysed signal part' };
      m.sample_rate = { value: fs, unit: 'Hz', description: 'Sampling rate' };
      m.samples = { value: y.length, description: 'Number of samples' };
      Object.assign(m, {
        min: { value: s.min, description: 'Minimum value' }, max: { value: s.max, description: 'Maximum value' },
        peak_to_peak: { value: s.max - s.min, description: 'Difference between maximum and minimum' },
        mean: { value: s.mean, description: 'Arithmetic mean (DC level)' }, median: { value: DSP.quantile(y, 0.5), description: 'Median value' },
        quantile_05: { value: DSP.quantile(y, 0.05), description: '5% quantile' }, quantile_95: { value: DSP.quantile(y, 0.95), description: '95% quantile' },
        rms: { value: s.rms, description: 'Root mean square' }, std: { value: s.std, description: 'Standard deviation' },
        skewness: { value: s.skewness, description: 'Asymmetry of the amplitude distribution (0 = symmetric)' },
        kurtosis: { value: s.kurtosis, description: 'Excess kurtosis (0 = Gaussian; > 0 peaky/impulsive)' },
        crest_factor: { value: s.rms ? Math.max(Math.abs(s.max), Math.abs(s.min)) / s.rms : 0, description: 'Peak divided by RMS' },
        zero_crossing_rate: { value: DSP.zeroCrossingRate(y, fs), unit: 'Hz', description: 'Mean-level crossings per second' },
        shannon_entropy: { value: DSP.shannonEntropy(y), unit: 'bits', description: 'Amplitude distribution entropy' },
        fractal_dimension: { value: DSP.higuchiFD(y, 10), description: 'Higuchi fractal dimension (1 = smooth, 2 = noise-like)' }
      });
      if (y.length >= 64) {
        const sp = DSP.spectrum(y, fs, { type: 'Power spectrum', window: 'Hann', dB: false }), sm = DSP.spectralMeasures(sp.bandPow, sp.df);
        Object.assign(m, {
          dominant_frequency: { value: sm.dominant, unit: 'Hz', description: 'Frequency of the spectral maximum' },
          spectral_centroid: { value: sm.centroid, unit: 'Hz', description: 'Power-weighted mean frequency' },
          mean_frequency: { value: sm.meanFreq, unit: 'Hz', description: 'Amplitude-weighted mean frequency' },
          median_frequency: { value: sm.medianFreq, unit: 'Hz', description: 'Frequency dividing spectral power in half' },
          spectral_flatness: { value: sm.flatness, description: '0 = tonal, 1 = white-noise-like' }
        });
        try {
          const h = DSP.harmonicAnalysis(y, fs);
          Object.assign(m, { fundamental: { value: h.f1, unit: 'Hz', description: 'Fitted fundamental frequency' },
            thd: { value: h.thd, unit: '%', description: 'Total harmonic distortion (harmonics 2–10)' }, thd_n: { value: h.thdn, unit: '%', description: 'THD plus noise' },
            snr: { value: h.snr, unit: 'dB', description: 'Fundamental power over residual noise' } });
          h.harmonics.slice(1, 5).forEach((a, i) => { m['harmonic_' + (i + 2) + 'x'] = { value: h.harmonics[0] ? a / h.harmonics[0] : 0, description: `Amplitude of harmonic ${i + 2} relative to the fundamental` }; });
        } catch (e) { /* not tonal */ }
        const bands = DSP.octaveBands(sp.bandPow, sp.df, 1, fs / 2);
        m.octave_bands = { value: bands.map(b => ({ center_hz: +b.fc.toPrecision(4), level_db: +b.level.toFixed(2) })), description: 'Octave band levels (dB re 1 unit²)' };
      }
      // over-time behaviour: 20 segments
      const seg = Math.floor(y.length / 20);
      if (seg >= 16) {
        const rows = [];
        for (let i = 0; i < 20; i++) { const st = DSP.stats(y.subarray(i * seg, (i + 1) * seg)); rows.push({ t: +((d.x0 + (i + 0.5) * seg * d.dx).toPrecision(6)), rms: +st.rms.toPrecision(5), std: +st.std.toPrecision(5), crest: +(st.rms ? Math.max(Math.abs(st.max), Math.abs(st.min)) / st.rms : 0).toPrecision(4), kurtosis: +st.kurtosis.toPrecision(4) }); }
        m.over_time = { value: rows, description: 'RMS, standard deviation, crest factor and kurtosis in 20 consecutive segments' };
      }
      return m;
    },
    toText(m) {
      const out = [];
      for (const [k, v] of Object.entries(m)) {
        if (Array.isArray(v.value)) {
          out.push('', k.replace(/_/g, ' ') + ':');
          for (const r of v.value) out.push('  ' + Object.entries(r).map(([a, b]) => `${a} ${b}`).join('   '));
        } else out.push(`${k.replace(/_/g, ' ').padEnd(22)} ${typeof v.value === 'number' ? Number(v.value.toPrecision(7)) : v.value} ${v.unit || ''}`);
      }
      return out.join('\n');
    }
  };
})(window);
