// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const DSP = require('../js/dsp.js');
const IO = require('../js/io.js');
globalThis.DSP = DSP;
const EXPR = require('../js/expr.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);
const sine = (f, fs, n, amp = 1) => Float64Array.from({ length: n }, (_, i) => amp * Math.sin(2 * Math.PI * f * i / fs));

test('radix-2 and Bluestein FFT agree with a direct DFT', () => {
  for (const n of [8, 12, 31, 64]) {
    const x = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.7) + 0.3 * Math.cos(i * 2.1));
    const { re, im } = DSP.rfft(x);
    for (let k = 0; k < n; k++) {
      let r = 0, q = 0;
      for (let j = 0; j < n; j++) { r += x[j] * Math.cos(2 * Math.PI * k * j / n); q -= x[j] * Math.sin(2 * Math.PI * k * j / n); }
      near(re[k], r, 1e-9, `n=${n} re[${k}]`); near(im[k], q, 1e-9, `n=${n} im[${k}]`);
    }
    const back = DSP.ifftReal(re, im);
    for (let j = 0; j < n; j++) near(back[j], x[j], 1e-9);
  }
});

test('magnitude spectrum reads sinusoid peak amplitude for every window', () => {
  const fs = 1000, n = 1000, x = sine(100, fs, n, 2.5);
  for (const w of DSP.WINDOWS) {
    const sp = DSP.spectrum(x, fs, { type: 'Magnitude', window: w, dB: false });
    const k = Math.round(100 / sp.df);
    const tol = w === 'Rectangle' || w === 'Flat top' ? 0.02 : 0.12; // bin-centred tone: scalloping-free for all
    near(sp.y[k], 2.5, 2.5 * tol, w);
  }
});

test('power spectrum sums to mean-square and PSD integrates to variance', () => {
  const fs = 2048, x = sine(256, fs, 2048, 3);
  const pw = DSP.spectrum(x, fs, { type: 'Power spectrum', window: 'Hann', dB: false });
  const k = Math.round(256 / pw.df);
  near(pw.y[k - 1] + pw.y[k] + pw.y[k + 1], 4.5 * 1.5, 0.05, 'Hann spreads tone power 1.5x over 3 bins');
  const psd = DSP.spectrum(x, fs, { type: 'Power spectral density (PSD)', window: 'Hann', dB: false });
  let s = 0; for (const v of psd.y) s += v * psd.df;
  near(s, 4.5, 0.05, 'PSD integral = variance');
});

test('dB scale and Welch averaging', () => {
  const fs = 1000, x = sine(125, fs, 4000, 1);
  const sp = DSP.spectrum(x, fs, { type: 'Magnitude', window: 'Flat top', dB: true, averageSegments: true, segmentCount: 6, segmentOverlap: 50 });
  assert.equal(sp.segments, 6);
  const peak = Math.max(...sp.y);
  near(peak, 0, 0.1, 'unit sine = 0 dB');
});

test('FFT and IIR filters attenuate the stop band', () => {
  const fs = 8000, n = 8000, x = new Float64Array(n);
  const a = sine(200, fs, n), b = sine(2000, fs, n);
  for (let i = 0; i < n; i++) x[i] = a[i] + b[i];
  const amp = (y, f) => { const sp = DSP.spectrum(y.subarray(1000, 7000), fs, { type: 'Magnitude', window: 'Flat top', dB: false }); return sp.y[Math.round(f / sp.df)]; };
  const lp = DSP.fftFilter(x, fs, 'lowpass', 600, 0, 50);
  near(amp(lp, 200), 1, 0.02); assert.ok(amp(lp, 2000) < 0.01);
  const hp = DSP.iirFilter(x, fs, 'highpass', 6, 800).y;
  near(amp(hp, 2000), 1, 0.03); assert.ok(amp(hp, 200) < 0.01, 'IIR HP stop band');
  const bs = DSP.iirFilter(x, fs, 'bandpass', 4, 1500, 2500).y;
  assert.ok(amp(bs, 200) < 0.02 && amp(bs, 2000) > 0.9);
});

test('harmonic analysis: THD of a known waveform', () => {
  const fs = 48000, n = 48000, x = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t = i / fs; x[i] = Math.sin(2 * Math.PI * 1000 * t) + 0.1 * Math.sin(2 * Math.PI * 2000 * t) + 0.05 * Math.sin(2 * Math.PI * 3000 * t); }
  const h = DSP.harmonicAnalysis(x, fs);
  near(h.f1, 1000, 1); near(h.thd, Math.sqrt(0.01 + 0.0025) * 100, 0.3);
  // only 5 periods, non-integer bin frequency: the least-squares fit must still resolve the harmonics
  const short = x.subarray(0, 247);
  const hs = DSP.harmonicAnalysis(short, fs);
  near(hs.f1, 1000, 0.5); near(hs.thd, Math.sqrt(0.01 + 0.0025) * 100, 0.2); near(hs.amplitude, 1, 0.005);
});

test('SNR of a sine in known noise', () => {
  const fs = 8000, n = 8000, x = sine(440, fs, n, 1), rng = (() => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  let pn = 0;
  for (let i = 0; i < n; i++) { const v = (rng() - 0.5) * 0.02; x[i] += v; pn += v * v; }
  const expected = 10 * Math.log10(0.5 / (pn / n));
  near(DSP.harmonicAnalysis(x, fs).snr, expected, 0.3);
});

test('statistics and instrument measures', () => {
  const x = sine(50, 1000, 1000, 2);
  const s = DSP.stats(x);
  near(s.rms, Math.SQRT2, 1e-3); near(s.mean, 0, 1e-9); near(s.max, 2, 1e-3);
  near(DSP.zeroCrossingRate(x, 1000), 100, 1);
  const sp = DSP.spectrum(x, 1000, { type: 'Power spectrum', dB: false });
  near(DSP.spectralMeasures(sp.linPow, sp.df).dominant, 50, 0.5);
  near(DSP.quantile(Float64Array.from([1, 2, 3, 4, 5]), 0.5), 3, 1e-12);
});

test('resample, envelope, autocorrelation, octave bands', () => {
  const x = sine(10, 1000, 1000);
  const r = DSP.resample(x, 1000, 500); assert.equal(r.length, 500);
  near(DSP.stats(r.subarray(50, 450)).rms, Math.SQRT1_2, 0.01);
  const env = DSP.hilbertEnvelope(sine(100, 1000, 1000, 3)); near(env[500], 3, 0.01);
  const ac = DSP.autocorrelation(x); near(ac[0], 1, 1e-9); assert.ok(ac[100] > 0.8);
  const sp = DSP.spectrum(sine(1000, 48000, 48000), 48000, { type: 'Power spectrum', dB: false });
  const bands = DSP.octaveBands(sp.bandPow, sp.df, 3, 24000);
  const top = bands.reduce((a, b) => b.level > a.level ? b : a);
  near(top.fc, 1000, 1); near(top.level, 10 * Math.log10(0.5), 0.2);
  near(DSP.aWeightDb(1000), 0, 0.05); near(DSP.aWeightDb(100), -19.1, 0.1); near(DSP.cWeightDb(1000), 0, 0.05);
});

test('generator produces requested waveform and range', () => {
  const y = DSP.generate({ type: 'Square', sampleRate: 1000, seconds: 1, frequency: 5, minAmp: 0, maxAmp: 4 });
  assert.equal(y.length, 1000); near(Math.min(...y), 0, 1e-12); near(Math.max(...y), 4, 1e-12);
  for (const t of DSP.GENERATOR_TYPES) { const g = DSP.generate({ type: t, sampleRate: 1000, seconds: 0.5, frequency: 10 }); assert.ok(g.every(Number.isFinite), t); }
});

test('WAV round trip and CSV parsing', () => {
  const ch = [Float32Array.from([0, 0.5, -0.5, 1]), Float32Array.from([1, 0, 0, -1])];
  const w = IO.parseWav(IO.encodeWav(ch, 22050, 'float32'));
  assert.equal(w.sampleRate, 22050); assert.deepEqual(Array.from(w.channels[1]), [1, 0, 0, -1]);
  const w16 = IO.parseWav(IO.encodeWav(ch, 8000, 'int16')); near(w16.channels[0][1], 16384, 1);
  const c = IO.parseCsv('time;a;b\n0;1;2\n0.5;3;4\n1;5;6', { timeColumn: true });
  assert.equal(c.separator, ';'); near(c.sampleRate, 2, 1e-9); assert.equal(c.columns[0].name, 'a'); assert.deepEqual(Array.from(c.columns[1].data), [2, 4, 6]);
  const raw = IO.parseRaw(IO.encodeRaw(Float32Array.from([-3, 7]), '16-bit signed'), '16-bit signed'); assert.deepEqual(Array.from(raw), [-3, 7]);
});

test('CSV with more rows than a function call takes arguments (500 000 rows)', () => {
  const n = 500000, lines = new Array(n);
  for (let i = 0; i < n; i++) lines[i] = i + ',' + (i % 7);
  lines[n - 1] += ',9'; // one longer row: the column count is that of the longest row
  const c = IO.parseCsv(lines.join('\n'));
  assert.equal(c.columns.length, 3); assert.equal(c.columns[0].data.length, n);
  assert.equal(c.columns[0].data[n - 1], n - 1); assert.equal(c.columns[1].data[n - 2], (n - 2) % 7);
  assert.equal(c.columns[2].data[0], 0); assert.equal(c.columns[2].data[n - 1], 9);
});

test('signal calculator expressions', () => {
  const W = { 1: { y: Float64Array.from([1, 2, 3]), x0: 0, dx: 1 }, 2: { y: Float64Array.from([4, 5, 6, 7]), x0: 0, dx: 1 } };
  const run = s => EXPR.evaluate(EXPR.parse(s), n => W[n]);
  assert.deepEqual(Array.from(run('W1 + 2*W2').y), [9, 12, 15]);
  assert.deepEqual(Array.from(run('-W1^2').y), [-1, -4, -9]);
  assert.deepEqual(Array.from(run('abs(W1 - W2)').y), [3, 3, 3]);
  assert.equal(run('2^3^2'), 512);
  assert.deepEqual([...EXPR.refs(EXPR.parse('sin(W3)*W1+W3'))].sort(), [1, 3]);
  assert.throws(() => run('W1 +'), /end of expression/);
  assert.throws(() => run('foo(W1)'), /Unknown function/);
});

test('wavelet filters are orthonormal and the DWT reconstructs perfectly', () => {
  for (const [name, h] of Object.entries(DSP.WAVELETS)) {
    near(h.reduce((s, v) => s + v * v, 0), 1, 1e-9, name + ' energy');
    near(h.reduce((s, v) => s + v, 0), Math.SQRT2, 1e-9, name + ' sum');
    const x = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.37) + (i % 7) * 0.1);
    const { a, details } = DSP.dwt(x, name, 3);
    const y = DSP.idwt(a, details, name);
    for (let i = 0; i < x.length; i++) near(y[i], x[i], 1e-9, name + ' PR');
  }
});

test('wavelet denoising lowers the noise', () => {
  const fs = 1000, n = 4096, clean = sine(5, fs, n, 1), x = new Float64Array(n);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let i = 0; i < n; i++) x[i] = clean[i] + rnd() * 0.6;
  const err = y => Math.sqrt(y.reduce((a, v, i) => a + (v - clean[i]) ** 2, 0) / n);
  const d = DSP.waveletDenoise(x, 'Daubechies4', 5, 'Universal', 'Soft').y;
  assert.equal(d.length, n); assert.ok(err(d) < err(x) / 2, `denoised ${err(d)} vs noisy ${err(x)}`);
});

test('cepstrum finds the period of a harmonic series', () => {
  const fs = 8000, n = 8192, x = new Float64Array(n);
  for (let h = 1; h <= 20; h++) { const s = sine(200 * h, fs, n, 1 / h); for (let i = 0; i < n; i++) x[i] += s[i]; }
  const c = DSP.cepstrum(x, fs);
  let best = 20; for (let i = 20; i < c.length / 2; i++) if (c[i] > c[best]) best = i;
  near(best / fs, 1 / 200, 2 / fs);
});

test('CWT peaks at the tone frequency with the tone amplitude', () => {
  const fs = 1000, x = sine(50, fs, 2000, 2);
  const r = DSP.cwt(x, fs, 10, 100, 91, 6, 200);
  const row = r.rows[100].v; let best = 0; for (let k = 1; k < row.length; k++) if (row[k] > row[best]) best = k;
  near(r.f0 + best * r.df, 50, 1.5); near(Math.pow(10, row[best] / 20), 2, 0.1);
});

test('tacho to RPM, delay finding, order resampling', () => {
  const fs = 10000, n = 20000, x = new Float64Array(n);
  let ph = 0; for (let i = 0; i < n; i++) { const f = 20 + 10 * i / n; ph += f / fs; x[i] = Math.sin(2 * Math.PI * ph); }
  const rpm = DSP.tachoToRpm(x, fs, 1, true);
  near(rpm[n / 2], (20 + 5) * 60, 3);
  const a = sine(7, 1000, 1000).map((v, i) => v + (i % 13) * 0.01), b = DSP.shiftSignal(a, -25);
  assert.equal(DSP.findDelay(a, b), 25);
  const ord = DSP.toOrderDomain(x, fs, rpm, 32);
  const sp = DSP.spectrum(ord.subarray(64, ord.length - 64), 32, { type: 'Magnitude', dB: false, window: 'Hann' });
  let k = 1; for (let i = 2; i < sp.y.length; i++) if (sp.y[i] > sp.y[k]) k = i;
  near(k * sp.df, 1, 0.05, 'order 1 peak');
});

test('entropy, fractal dimension, damping', () => {
  near(DSP.shannonEntropy(new Float64Array(100).fill(3)), 0, 1e-12);
  const u = Float64Array.from({ length: 10000 }, (_, i) => (i * 0.6180339887) % 1);
  assert.ok(DSP.shannonEntropy(u) > 3.9);
  near(DSP.higuchiFD(Float64Array.from({ length: 1000 }, (_, i) => i)), 1, 0.02);
  // resonance with zeta = 0.05 at 100 Hz
  const df = 0.1, f = Float64Array.from({ length: 3000 }, (_, i) => i * df), z = 0.05;
  const y = f.map(v => 1 / Math.sqrt((1 - (v / 100) ** 2) ** 2 + (2 * z * v / 100) ** 2));
  near(DSP.dampingFromSpectrum(y, df).zeta, z, 0.003);
});

test('calculator: complex FFT round trip and order functions', () => {
  const x = Float64Array.from({ length: 256 }, (_, i) => Math.sin(i * 0.3) + 0.5 * Math.cos(i * 1.1));
  const W = { 1: { y: x, x0: 0, dx: 0.001 } };
  const run = s => EXPR.evaluate(EXPR.parse(s), n => W[n]);
  const back = run('ifft(cfft(W1))');
  for (let i = 0; i < x.length; i++) near(back.y[i], x[i], 1e-9);
  near(back.dx, 0.001, 1e-12);
  const s = sine(50, 1000, 1000, 2); W[2] = { y: s, x0: 0, dx: 0.001 };
  near(Math.max(...run('cfft(W2)').y), 2, 1e-6);
  assert.equal(run('delay(W2, W2)'), 0);
});

test('classic axis ticks: the smallest one-digit step, at most 10 intervals', () => {
  const PLOT = require('../js/plot.js');
  const step = (lo, hi) => { const t = PLOT.classicTicks(lo, hi, 10); return +(t[1] - t[0]).toPrecision(6); };
  assert.equal(step(0.0001061, 2.0034799), 0.3); // 0.2 would give 10.02 intervals (measured in the reference program)
  assert.equal(step(-15.43, 14.24), 3);          // signal window of the reference screenshot
  assert.equal(step(0.0116, 2.929), 0.3);
  assert.equal(step(0.00167, 25), 3);
  assert.equal(step(0, 630), 70);
});

test('graph style number formats for tick labels', () => {
  const PLOT = require('../js/plot.js');
  assert.equal(PLOT.fmtTick(1.5, 10, { mode: 'fixed', digits: 2 }), '1.50');
  assert.equal(PLOT.fmtTick(1250, 1e4, { mode: 'sci', digits: 2 }), '1.25e+3');
  assert.equal(PLOT.fmtTick(1250, 1e4, { mode: 'eng', digits: 2 }), '1.25k');
  assert.equal(PLOT.fmtTick(0.0005, 1e-3, { mode: 'eng', digits: 1 }), '500µ');
  assert.equal(PLOT.fmtTick(0, 1, { mode: 'eng', digits: 1 }), '0');
  assert.equal(PLOT.fmtTick(0.3, 3, null), '0.3');
});

// Peak detection methods besides the threshold detector. Reference values: scipy.signal (test/fixtures/
// make_peaks_scipy.py writes peaks_scipy.json).
const PEAKS_SCIPY = require('./fixtures/peaks_scipy.json');

test('prominence method matches scipy.signal.find_peaks (peaks, prominences, widths)', () => {
  for (const c of PEAKS_SCIPY.find_peaks) {
    const r = DSP.findPeaks(PEAKS_SCIPY.signals[c.signal], c.args), what = `${c.signal} ${JSON.stringify(c.args)}`;
    assert.deepEqual(r.peaks, c.peaks, what);
    if (c.prominences) c.prominences.forEach((v, i) => near(r.prominences[i], v, 1e-9, what + ' prominence'));
    if (c.widths) c.widths.forEach((v, i) => near(r.widths[i], v, 1e-9, what + ' width'));
  }
});

test('wavelet method matches scipy.signal.find_peaks_cwt', () => {
  for (const c of PEAKS_SCIPY.cwt) {
    const r = DSP.cwtPeaks(Float64Array.from(PEAKS_SCIPY.signals[c.signal]), DSP.peakWidthsRange(c.widths[0], c.widths[1]), c.min_snr);
    assert.deepEqual(r, c.peaks, `${c.signal} widths ${c.widths} snr ${c.min_snr}`);
  }
});

test('local maxima: flat tops count once at their middle, the ends never', () => {
  assert.deepEqual(DSP.localMaxima([3, 1, 2, 2, 2, 1, 0, 5, 5, 4, 9]), [3, 7]);
  assert.deepEqual(DSP.localMaxima([1, 2, 2]), []);            // a plateau running into the end is not a peak
  assert.deepEqual(DSP.topPeaks([0, 5, 0, 3, 0, 4, 0, 1, 0], 2, 1), [1, 5]);
  assert.deepEqual(DSP.topPeaks([0, 5, 0, 3, 0, 4, 0, 1, 0], 2, 5), [1, 7]); // 4 at index 5 is too close to 5
});

test('slope, moving z-score and refinement', () => {
  // two Gaussian bumps on noise-free data: the slope method finds their tops
  const y = Float64Array.from({ length: 400 }, (_, i) => Math.exp(-0.5 * ((i - 100) / 8) ** 2) + 0.6 * Math.exp(-0.5 * ((i - 290) / 12) ** 2));
  assert.deepEqual(DSP.slopePeaks(y, 5, 0, 0.1), [100, 290]);
  assert.deepEqual(DSP.slopePeaks(y, 5, 0, 0.7), [100]);       // minimum height
  // z-score: a flat signal with alternating noise, one spike up and one down
  const z = Float64Array.from({ length: 200 }, (_, i) => (i % 2 ? 0.1 : -0.1) + (i >= 120 && i < 124 ? 5 + i - 120 : 0) - (i === 160 ? 4 : 0));
  const r = DSP.zscorePeaks(z, 20, 3.5, 0);
  assert.deepEqual(r.peaks, [123]);
  assert.deepEqual(r.valleys, [160]);
  // parabolic refinement is exact on a parabola, Gaussian on a Gaussian
  const par = Float64Array.from({ length: 9 }, (_, i) => 7 - (i - 4.3) ** 2), p = DSP.refinePeak(par, 4, 'parabolic');
  near(p.pos, 4.3, 1e-12); near(p.val, 7, 1e-12);
  const gau = Float64Array.from({ length: 21 }, (_, i) => 3 * Math.exp(-0.5 * ((i - 10.37) / 2) ** 2)), g = DSP.refinePeak(gau, 10, 'gaussian');
  near(g.pos, 10.37, 1e-9); near(g.val, 3, 1e-9);
  const v = DSP.refinePeak(Float64Array.from(par, x => -x), 4, 'parabolic', true);
  near(v.pos, 4.3, 1e-12); near(v.val, -7, 1e-12);
});

test('detectPeaks: threshold is the reference detector, other methods work on the visible part and find valleys', () => {
  const y = Float64Array.from({ length: 300 }, (_, i) => Math.sin(i / 10));
  const s = Object.assign(DSP.defaultPeakSettings(y), { negative: true });
  assert.deepEqual(DSP.detectPeaks(y, s, 20, 250).idx, DSP.svPeaks(y, s, 20, 250));
  const r = DSP.detectPeaks(y, { method: 'prominence', prom: 0.5, distance: 1, negative: true }, 20, 250); // 236: prominence 0.87 inside 20…250
  const want = [];                                           // maxima at 10·(π/2 + 2πk), minima at 10·(3π/2 + 2πk)
  for (let k = 0; k < 5; k++) for (const c of [Math.PI / 2, 3 * Math.PI / 2]) { const i = Math.round(10 * (c + 2 * Math.PI * k)); if (i > 20 && i < 250) want.push(i); }
  assert.deepEqual(r.idx, want.sort((a, b) => a - b));
  r.idx.forEach((i, k) => assert.equal(r.neg[k], y[i] < 0));
  assert.deepEqual(DSP.detectPeaks(y, { method: 'topn', count: 2, distance: 1 }, 0, 299).idx.length, 2);
});

test('quickselect quantile equals the sorted quantile', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 300; t++) {
    const n = 1 + Math.floor(rnd() * 60), a = Float64Array.from({ length: n }, () => Math.round(rnd() * 8) - 4), q = rnd();
    assert.equal(DSP.selectQuantile(Float64Array.from(a), q), DSP.quantile(a, q));
  }
});

// Geometry node (geomath.js): FDD / ODS shapes, UFF geometry files, generators
const GM = require('../js/geomath.js');
function twoModeData(phi1, phi2, f1 = 12, f2 = 31, fs = 256, N = 8192) {
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  const reson = f => { const w = 2 * Math.PI * f / fs, r = Math.exp(-0.02 * w), a1 = 2 * r * Math.cos(w), a2 = -r * r, y = new Float64Array(N); let y1 = 0, y2 = 0; for (let i = 0; i < N; i++) { const v = rnd() + a1 * y1 + a2 * y2; y[i] = v; y2 = y1; y1 = v; } return y; };
  const q1 = reson(f1), q2 = reson(f2);
  return phi1.map((_, k) => Float64Array.from({ length: N }, (_, i) => phi1[k] * q1[i] + phi2[k] * q2[i] + 0.05 * rnd()));
}
const real = a => ({ re: Float64Array.from(a), im: new Float64Array(a.length) });

test('FDD finds the resonances and their mode shapes; ODS is relative to the reference channel', () => {
  const p1 = [0.3, 0.7, 1], p2 = [0.8, 0.4, -1], S = GM.csdMatrix(twoModeData(p1, p2), 8), df = 256 / S.L;
  const sv = GM.fdd(S, 3);
  assert.deepEqual(GM.peaks(sv[0], 10, 3).map(b => b * df), [12, 31]);
  assert.ok(sv[0][Math.round(12 / df)] > 100 * sv[1][Math.round(12 / df)], 'one dominant singular value at a mode');
  const m1 = GM.modeShape(S, Math.round(12 / df)), m2 = GM.modeShape(S, Math.round(31 / df));
  assert.ok(GM.mac(m1, real(p1)) > 0.999); assert.ok(GM.mac(m2, real(p2)) > 0.999);
  assert.ok(GM.mac(m1, real(p2)) < 0.5);
  near(Math.max(...m1.re.map(Math.abs)), 1, 1e-12);                       // normalised, largest component real
  const ods = GM.odsShape(S, Math.round(12 / df), 2);
  [0, 1].forEach(k => near(ods.re[k] / ods.re[2], p1[k] / p1[2], 0.01));
});

test('UFF geometry: datasets 15, 2411, 82 (with pen lifts) and 2412 elements, and a write / read round trip', () => {
  const text = [
    '    -1', '    15',
    '         1         0         0        11  0.00000E+00  0.00000E+00  0.00000E+00',
    '         2         0         0        11  1.00000E+00  0.00000E+00  0.00000E+00',
    '         3         0         0        11  1.00000E+00  1.00000E+00  0.00000E+00',
    '         4         0         0        11  0.00000E+00  1.00000E+00  0.00000E+00',
    '    -1',
    '    -1', '  2411',
    '         5         1         1        11', '   5.0000000000000000D-01   5.0000000000000000D-01   2.0000000000000000D+00',
    '    -1',
    '    -1', '    82',
    '         1         6         8', 'outline', '         1         2         3         0         4         1',
    '    -1',
    '    -1', '  2412',
    '         1        91         1         1         7         3', '         1         2         5',
    '         2        94         1         1         7         4', '         1         2         3         4',
    '         3        21         1         1         7         2', '         0         1         1', '         3         5',
    '    -1',
    '    -1', '   164', 'units', '    -1'].join('\n');
  const { geometry: g, skipped } = GM.parseUFF(text);
  assert.deepEqual(g.nodes.map(n => n.id), [1, 2, 3, 4, 5]);
  assert.deepEqual([g.nodes[4].x, g.nodes[4].z], [0.5, 2]);
  assert.deepEqual(g.lines, [[1, 2], [2, 3], [4, 1], [3, 5]]);           // the 0 lifts the pen between 3 and 4
  assert.deepEqual(g.surfaces, [[1, 2, 5], [1, 2, 3, 4]]);
  assert.deepEqual(skipped, ['dataset 164']);
  const back = GM.parseUFF(GM.writeUFF(g)).geometry;
  assert.deepEqual(back, g);
});

test('geometry generators, merging, and unmeasured nodes moving with their neighbours', () => {
  const grid = GM.grid({ nx: 3, ny: 2, dx: 1, dy: 2, plane: 'XZ', start: 10 });
  assert.equal(grid.nodes.length, 6); assert.equal(grid.lines.length, 7); assert.equal(grid.surfaces.length, 2);
  assert.deepEqual(grid.nodes[4], { id: 14, x: 1, y: 0, z: 2 });
  const box = GM.box({ lx: 2, ly: 1, lz: 1 }), cyl = GM.cylinder({ n: 8, r: 1, levels: 3, h: 2 }), beam = GM.beam({ n: 4, length: 3, axis: 'Y' });
  assert.deepEqual([box.nodes.length, box.lines.length, box.surfaces.length], [8, 12, 6]);
  assert.deepEqual([cyl.nodes.length, cyl.lines.length, cyl.surfaces.length], [24, 40, 16]);
  assert.deepEqual(beam.nodes[3], { id: 4, x: 0, y: 3, z: 0 });
  const m = GM.merge(box, GM.beam({ n: 2, length: 1, start: 8 }));         // node 8 replaced, 9 added
  assert.equal(m.nodes.length, 9);
  // a 3-node chain: ends measured (0 and 2 mm in Z), the middle node follows its neighbours
  const chain = GM.beam({ n: 3, length: 2 }), disp = new Map([[1, [0, 0, 0]], [3, [0, 0, 2]]]), meas = new Map([[1, [true, true, true]], [3, [true, true, true]]]);
  GM.fillUnmeasured(chain, disp, meas);
  assert.deepEqual(disp.get(2), [0, 0, 1]);
});

test('drawing objects: truncated cone, circle and rectangle outline, moved to an origin', () => {
  const cone = GM.cone({ n: 4, r1: 2, r2: 1, levels: 2, h: 3, axis: 'Z' });
  assert.equal(cone.nodes.length, 8); assert.equal(cone.lines.length, 12); assert.equal(cone.surfaces.length, 4);
  assert.deepEqual([cone.nodes[1].x, cone.nodes[1].y, cone.nodes[1].z], [0, 2, 0]);   // exactly 0, not 1.2e-16
  assert.deepEqual([cone.nodes[4].x, cone.nodes[4].y, cone.nodes[4].z], [1, 0, 3]);
  const circle = GM.translate(GM.circle({ n: 4, r: 1, axis: 'X', start: 7 }), 0, 0, 5);
  assert.deepEqual(circle.nodes.map(n => [n.id, n.x, n.y, n.z]), [[7, 0, 1, 5], [8, 0, 0, 6], [9, 0, -1, 5], [10, 0, 0, 4]]);
  assert.deepEqual(circle.lines, [[7, 8], [8, 9], [9, 10], [10, 7]]); assert.equal(circle.surfaces.length, 0);
  const out = GM.outline({ lx: 2, ly: 1, nx: 3, ny: 2 });
  assert.deepEqual(out.nodes.map(n => `${n.x},${n.y}`), ['0,0', '1,0', '2,0', '2,1', '1,1', '0,1']);
  assert.deepEqual(out.lines[out.lines.length - 1], [6, 1]);                         // closed
});

test('renumbering nodes keeps lines, surfaces and DOFs attached', () => {
  const g = GM.grid({ nx: 2, ny: 2, dx: 1, dy: 1 });                                   // 1 (0,0) 2 (1,0) 3 (0,1) 4 (1,1)
  const r = GM.renumber(g, [{ win: 5, node: 4, dir: '+Z' }], { start: 100, step: 10, order: 'x' });
  assert.deepEqual(r.geo.nodes.map(n => `${n.id}@${n.x},${n.y}`), ['100@0,0', '110@0,1', '120@1,0', '130@1,1']);
  assert.deepEqual(r.geo.surfaces, [[100, 120, 130, 110]]);
  assert.equal(r.dofs[0].node, 130); assert.equal(r.map.get(2), 120);
});

test('cylindrical sensor directions and automatic DOF assignment', () => {
  const cyl = { x: 0, y: 0, z: 0, axis: 'Z' }, near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-12);
  assert.ok(near(GM.dirVector('+R', { x: 0, y: 2, z: 1 }, cyl), [0, 1, 0]));
  assert.ok(near(GM.dirVector('+T', { x: 0, y: 2, z: 1 }, cyl), [-1, 0, 0]));        // counter-clockwise about +Z
  assert.ok(near(GM.dirVector('-A', { x: 0, y: 2, z: 1 }, cyl), [0, 0, -1]));
  assert.deepEqual(GM.dirVector('+R', { x: 3, y: 0, z: 1 }, { x: 0, y: 0, z: 1, axis: 'X' }), [0, 0, 0]);   // on the axis: no radial direction
  assert.ok(near(GM.dirVector('+T', { x: 3, y: 0, z: 2 }, { x: 0, y: 0, z: 1, axis: 'X' }), [0, -1, 0]));  // X × Z = −Y
  assert.ok(near(GM.dirVector('-Y', { x: 0, y: 0, z: 0 }, null), [0, -1, 0]));
  const g = GM.beam({ n: 4, length: 3 });
  const a = GM.autoAssign(g, [11, 12, 13, 14, 15], { dirs: ['+Y', '+Z'], start: 2, exclude: [3] });
  assert.deepEqual(a.map(d => `${d.win}:${d.node}${d.dir}`), ['11:2+Y', '12:2+Z', '13:4+Y', '14:4+Z', '15:null+Y']);
});

test('bridge deck example: FDD finds the four modes of the simulated ambient vibration', () => {
  const d = GM.bridgeDeck();
  assert.equal(d.geometry.nodes.length, 18); assert.equal(d.geometry.surfaces.length, 8);
  assert.equal(d.sensors.length, 10); assert.deepEqual(d.sensors.filter(s => s.ref).map(s => s.node), [3, 13]);   // x = 10 m
  assert.ok(d.sensors.every(s => d.geometry.nodes.some(n => n.id === s.node)));
  const S = GM.csdMatrix(d.signals, 16), df = d.fs / S.L, sv = GM.fdd(S, 3), pk = GM.peaks(sv[0], 10, 3);
  assert.equal(pk.length, 4);
  d.modes.forEach((m, k) => {
    assert.ok(Math.abs(pk[k] * df - m.f) < 2 * df, `${m.name}: ${pk[k] * df} Hz`);
    const real = { re: Float64Array.from(m.shape), im: new Float64Array(m.shape.length) };
    assert.ok(GM.mac(GM.modeShape(S, pk[k]), real) > 0.99, m.name);
  });
});

test('OpenSig geometry file (.osgeo): round trip, sensor layout, and damaged entries skipped', () => {
  const geo = Object.assign(GM.cylinder({ n: 4, r: 1, levels: 2, h: 1 }), { cyl: { axis: 'Z', x: 0, y: 0, z: 0 } });
  const sensors = [{ channel: 'Acc 1', node: 5, dir: '+R', ref: true }, { channel: 'Acc 2', node: 6, dir: '-Z', ref: false }];
  const text = GM.writeGeometryFile(geo, { name: 'Tank', sensors });
  const r = GM.parseGeometryFile(text);
  assert.deepEqual(r.geometry.nodes, geo.nodes); assert.deepEqual(r.geometry.lines, geo.lines); assert.deepEqual(r.geometry.surfaces, geo.surfaces);
  assert.deepEqual(r.cyl, geo.cyl); assert.deepEqual(r.sensors, sensors.map(x => Object.assign({ setup: 1 }, x))); assert.equal(r.name, 'Tank'); assert.deepEqual(r.skipped, []);
  assert.match(text, /\n    \{"id":1,"x":1,"y":0,"z":0\},\n/);                                   // one node per line
  const bad = GM.parseGeometryFile(JSON.stringify({ nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 'a', y: 0, z: 0 }, { id: 3, x: 1, y: 0, z: 0 }],
    lines: [[1, 3], [1, 2]], surfaces: [[1, 3]], sensors: [{ channel: 'A', node: 9, dir: '+Z' }, { channel: 'B', node: 1, dir: 'up' }] }));
  assert.deepEqual(bad.geometry.nodes.map(n => n.id), [1, 3]); assert.deepEqual(bad.geometry.lines, [[1, 3]]); assert.equal(bad.geometry.surfaces.length, 0);
  assert.deepEqual(bad.sensors, [{ channel: 'A', node: null, dir: '+Z', ref: false, setup: 1 }]); assert.equal(bad.skipped.length, 4);
  const two = GM.parseGeometryFile(GM.writeGeometryFile(geo, { sensors: [{ channel: 'B', node: 5, dir: '+R', ref: true, setup: 2 }] }));
  assert.equal(two.sensors[0].setup, 2);                                              // roving tests: the setup is kept
  assert.throws(() => GM.parseGeometryFile('not json'), /not JSON/);
  assert.throws(() => GM.parseGeometryFile('{"a":1}'), /no "nodes" list/);
});

test('node names: kept by renumbering and by the .osgeo file, ignored when blank', () => {
  const g = GM.beam({ n: 3, length: 2 }); g.nodes[0].name = 'Abutment west'; g.nodes[2].name = 'Abutment east';
  const r = GM.renumber(g, [], { start: 10, step: 10, order: 'number' });
  assert.deepEqual(r.geo.nodes.map(n => `${n.id}:${n.name || ''}`), ['10:Abutment west', '20:', '30:Abutment east']);
  const back = GM.parseGeometryFile(GM.writeGeometryFile(r.geo));
  assert.deepEqual(back.geometry.nodes.map(n => n.name), ['Abutment west', undefined, 'Abutment east']);
  const blank = GM.parseGeometryFile('{"nodes":[{"id":1,"x":0,"y":0,"z":0,"name":"  "}]}');
  assert.equal('name' in blank.geometry.nodes[0], false);
});

test('Enhanced FDD: natural frequency and damping of the simulated bridge deck', () => {
  const d = GM.bridgeDeck({ seconds: 1200 }), S = GM.csdMatrix(d.signals, 8), df = d.fs / S.L;
  const found = d.modes.map(m => GM.efdd(S, m.f / df, d.fs, { search: 3 }));
  found.forEach((e, k) => {
    const m = d.modes[k];
    assert.ok(Math.abs(e.f - m.f) < 0.05, `${m.name}: ${e.f} Hz`);
    assert.ok(Math.abs(e.zeta - m.zeta) < 0.004, `${m.name}: damping ${(e.zeta * 100).toFixed(2)} % (true ${m.zeta * 100} %)`);
    assert.ok(e.r2 > 0.95 && e.n >= 3, `${m.name}: fit`);
    assert.ok(GM.mac(e.shape, { re: Float64Array.from(m.shape), im: new Float64Array(m.shape.length) }) > 0.99);
  });
  const M = GM.macMatrix(found.map(e => e.shape));
  M.forEach((row, i) => row.forEach((x, j) => { if (i === j) assert.ok(Math.abs(x - 1) < 1e-9); else { assert.ok(x < 0.05); assert.ok(Math.abs(x - M[j][i]) < 1e-12); } }));
  const c = GM.hannCorr(1024);                                                        // the window correction
  assert.equal(c[0], 1); assert.ok(c[100] < 1 && c[512] < c[100] && c[512] > 0);
});

test('roving test: setups combined into full mode shapes through the reference sensors', () => {
  // the simulated deck measured with 6 sensors in 2 setups; the sensors at 10 m (nodes 3 and 13) stay in both
  const sets = [[3, 13, 2, 12, 4, 14], [3, 13, 5, 15, 6, 16]];
  const runs = sets.map((nodes, s) => { const d = GM.bridgeDeck({ seed: 101 + s, level: s ? 0.03 : 0.02 }); return { d, nodes, ys: nodes.map(n => d.signals[d.sensors.findIndex(q => q.node === n)]) }; });
  const Ss = runs.map(r => GM.csdMatrix(r.ys, 8)), dfs = Ss.map(S => 100 / S.L), all = runs[0].d.sensors;
  const comb = GM.combineSV(Ss.map(S => GM.fdd(S, 1)[0]), dfs, dfs[0], Ss[0].bins);
  assert.equal(comb.length, 3); assert.equal(GM.peaks(comb[0], 10, 3).length, 4);           // the 4 modes on the averaged curve
  for (const m of runs[0].d.modes) {
    const parts = Ss.map((S, s) => ({ keys: runs[s].nodes.map(n => n + '|+Z'), shape: GM.efdd(S, m.f / dfs[s], 100, { search: 3 }).shape }));
    const merged = GM.mergeShapes(parts);
    assert.equal(merged.keys.length, 10); assert.equal(merged.shared[1], 2); assert.ok(merged.refMac[1] > 0.99); assert.deepEqual(merged.unmerged, []);
    const truth = merged.keys.map(k => m.shape[all.findIndex(q => q.node === +k.split('|')[0])]);
    assert.ok(GM.mac({ re: merged.re, im: merged.im }, { re: Float64Array.from(truth), im: new Float64Array(truth.length) }) > 0.995, m.name);
  }
  // scale and phase: a setup turned by a complex factor comes back; a setup sharing nothing is reported
  const base = { re: [1, 2, 3], im: [0, 0, 0] }, turned = { re: [0, -4, -6], im: [2, 0, 0] };              // (2i)·[?, 2, 3] with a new DOF
  const m2 = GM.mergeShapes([{ keys: ['a', 'b', 'c'], shape: base }, { keys: ['d', 'b', 'c'], shape: { re: [turned.re[0], -4, -6].map(x => x), im: [turned.im[0], 0, 0] } }, { keys: ['z'], shape: { re: [1], im: [0] } }]);
  assert.deepEqual(m2.unmerged, [2]); assert.ok(Math.abs(m2.refMac[1] - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(m2.scale[1].re, m2.scale[1].im) - 0.5) < 1e-12);           // |α| = 1/2 to bring −4, −6 back to 2, 3
});

test('time FFT: zero padding refines the lines, averaging smooths over time', () => {
  const fs = 1000, x = Float64Array.from({ length: 8000 }, (_, i) => 0.8 * Math.sin(2 * Math.PI * 123.4 * i / fs) + 0.3 * Math.sin(i * 1.7 + Math.sin(i * 0.013) * 40));
  const a = DSP.spectrogram(x, fs, { segmentLength: 256, overlap: 50, window: 'Hann' }), b = DSP.spectrogram(x, fs, { segmentLength: 256, overlap: 50, window: 'Hann', pad: 4 });
  assert.equal(b.bins, 4 * (a.bins - 1) + 1); assert.ok(Math.abs(b.df * 4 - a.df) < 1e-12);
  const top = sg => { const r = sg.rows[10].v; let k = 0; for (let i = 1; i < r.length; i++) if (r[i] > r[k]) k = i; return { f: k * sg.df, db: r[k] }; };
  assert.ok(Math.abs(top(b).f - 123.4) < Math.abs(top(a).f - 123.4) + 1e-9, 'the padded peak lies closer to the tone');
  assert.ok(Math.abs(Math.pow(10, top(b).db / 20) - 0.8) < 0.05, 'the amplitude stays that of the tone: ' + Math.pow(10, top(b).db / 20));
  const c = DSP.spectrogram(x, fs, { segmentLength: 256, overlap: 50, window: 'Hann', average: 5 });
  assert.equal(c.rows.length, a.rows.length);
  const spread = sg => { const k = Math.round(300 / sg.df), v = sg.rows.map(r => r.v[k]), m = v.reduce((s, y) => s + y, 0) / v.length; return Math.sqrt(v.reduce((s, y) => s + (y - m) ** 2, 0) / v.length); };
  assert.ok(spread(c) < 0.6 * spread(a), `averaged rows scatter less over time: ${spread(c)} vs ${spread(a)}`);
});
