/* OpenSig DSP core — pure functions, no DOM. Works in browser (window.DSP) and Node (module.exports). */
(function (root) {
  'use strict';

  const TAU = 2 * Math.PI;
  const isPow2 = n => n > 0 && (n & (n - 1)) === 0;
  const nextPow2 = n => { let p = 1; while (p < n) p <<= 1; return p; };

  /* ---------- FFT ---------- */
  const twiddleCache = new Map();
  function twiddles(n) {
    let t = twiddleCache.get(n);
    if (!t) {
      t = { cos: new Float64Array(n / 2), sin: new Float64Array(n / 2) };
      for (let i = 0; i < n / 2; i++) { t.cos[i] = Math.cos(TAU * i / n); t.sin[i] = Math.sin(TAU * i / n); }
      twiddleCache.set(n, t);
      if (twiddleCache.size > 32) twiddleCache.delete(twiddleCache.keys().next().value);
    }
    return t;
  }

  // In-place iterative radix-2 FFT. inverse=true computes the unscaled inverse.
  function fftRadix2(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    const tw = twiddles(n), sgn = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wr = tw.cos[k * step], wi = sgn * tw.sin[k * step];
          const a = i + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }

  // Bluestein chirp-z for arbitrary lengths.
  function fftBluestein(re, im, inverse) {
    const n = re.length, m = nextPow2(2 * n - 1), sgn = inverse ? 1 : -1;
    const cr = new Float64Array(n), ci = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const a = Math.PI * ((k * k) % (2 * n)) / n;
      cr[k] = Math.cos(a); ci[k] = sgn * Math.sin(a);
    }
    const ar = new Float64Array(m), ai = new Float64Array(m), br = new Float64Array(m), bi = new Float64Array(m);
    for (let k = 0; k < n; k++) {
      ar[k] = re[k] * cr[k] - im[k] * ci[k];
      ai[k] = re[k] * ci[k] + im[k] * cr[k];
    }
    br[0] = cr[0]; bi[0] = -ci[0];
    for (let k = 1; k < n; k++) { br[k] = br[m - k] = cr[k]; bi[k] = bi[m - k] = -ci[k]; }
    fftRadix2(ar, ai, false); fftRadix2(br, bi, false);
    for (let k = 0; k < m; k++) {
      const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k];
      ar[k] = r; ai[k] = i;
    }
    fftRadix2(ar, ai, true);
    for (let k = 0; k < n; k++) {
      const r = ar[k] / m, i = ai[k] / m;
      re[k] = r * cr[k] - i * ci[k];
      im[k] = r * ci[k] + i * cr[k];
    }
  }

  function fft(re, im, inverse) {
    if (re.length <= 1) return;
    if (isPow2(re.length)) fftRadix2(re, im, inverse); else fftBluestein(re, im, inverse);
  }

  // Real input → complex spectrum (full length n). Returns {re, im}.
  function rfft(x, n) {
    n = n || x.length;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < Math.min(n, x.length); i++) re[i] = x[i];
    fft(re, im, false);
    return { re, im };
  }

  function ifftReal(re, im) {
    const r = Float64Array.from(re), i = Float64Array.from(im);
    fft(r, i, true);
    const n = r.length, out = new Float64Array(n);
    for (let k = 0; k < n; k++) out[k] = r[k] / n;
    return out;
  }

  /* ---------- Window functions (names match the original's spectral-defaults list) ---------- */
  const WINDOWS = ['Rectangle', 'Hann', 'Hamming', 'Blackman', 'Blackman-Harris', 'Nuttall', 'Flat top',
    'Triangle', 'Tukey (25%)', 'Tukey (50%)', 'Kaiser (b=2)', 'Kaiser (b=4)', 'Kaiser (b=8)', 'Gaussian', 'Exponential (damping)'];

  function besselI0(x) {
    let sum = 1, term = 1, k = 1;
    const q = x * x / 4;
    do { term *= q / (k * k); sum += term; k++; } while (term > sum * 1e-12 && k < 500);
    return sum;
  }

  function cosineSum(n, a) {
    const w = new Float64Array(n);
    if (n === 1) { w[0] = 1; return w; }
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let k = 0; k < a.length; k++) v += (k % 2 ? -1 : 1) * a[k] * Math.cos(TAU * k * i / (n - 1));
      w[i] = v;
    }
    return w;
  }

  function makeWindow(name, n) {
    switch (name) {
      case 'Hann': return cosineSum(n, [0.5, 0.5]);
      case 'Hamming': return cosineSum(n, [0.54, 0.46]);
      case 'Blackman': return cosineSum(n, [0.42, 0.5, 0.08]);
      case 'Blackman-Harris': return cosineSum(n, [0.35875, 0.48829, 0.14128, 0.01168]);
      case 'Nuttall': return cosineSum(n, [0.355768, 0.487396, 0.144232, 0.012604]);
      case 'Flat top': return cosineSum(n, [0.21557895, 0.41663158, 0.277263158, 0.083578947, 0.006947368]);
      case 'Triangle': {
        const w = new Float64Array(n);
        for (let i = 0; i < n; i++) w[i] = 1 - Math.abs((i - (n - 1) / 2) / (n / 2));
        return w;
      }
      case 'Tukey (25%)': case 'Tukey (50%)': {
        const r = name.includes('25') ? 0.25 : 0.5, w = new Float64Array(n), edge = r * (n - 1) / 2;
        for (let i = 0; i < n; i++) {
          const d = Math.min(i, n - 1 - i);
          w[i] = d >= edge ? 1 : 0.5 * (1 - Math.cos(Math.PI * d / edge));
        }
        return w;
      }
      case 'Kaiser (b=2)': case 'Kaiser (b=4)': case 'Kaiser (b=8)': {
        const b = +name.match(/b=(\d+)/)[1] * Math.PI / 2, w = new Float64Array(n), d = besselI0(b);
        for (let i = 0; i < n; i++) {
          const t = n > 1 ? 2 * i / (n - 1) - 1 : 0;
          w[i] = besselI0(b * Math.sqrt(Math.max(0, 1 - t * t))) / d;
        }
        return w;
      }
      case 'Gaussian': {
        const w = new Float64Array(n), s = 0.4 * (n - 1) / 2;
        for (let i = 0; i < n; i++) { const t = (i - (n - 1) / 2) / s; w[i] = Math.exp(-0.5 * t * t); }
        return w;
      }
      case 'Exponential (damping)': {
        const w = new Float64Array(n);
        for (let i = 0; i < n; i++) w[i] = Math.exp(-i / (n / 4));
        return w;
      }
      default: return new Float64Array(n).fill(1);
    }
  }

  /* ---------- Basic conditioning ---------- */
  function mean(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i]; return x.length ? s / x.length : 0; }

  function removeMean(x) { const m = mean(x), y = new Float64Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] - m; return y; }

  function removeTrend(x) {
    const n = x.length, y = new Float64Array(n);
    if (n < 2) { y.set(x); return y; }
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += x[i]; sxx += i * i; sxy += i * x[i]; }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
    for (let i = 0; i < n; i++) y[i] = x[i] - (a + b * i);
    return y;
  }

  /* ---------- Spectrum ---------- */
  const SPECTRUM_TYPES = ['Magnitude', 'Power spectrum', 'Power spectral density (PSD)', 'Phase', 'Real part', 'Imaginary part'];
  const ZERO_PADDING = ['None', 'Next power of 2', '2 x Next power of 2', '4 x Next power of 2', '8 x Next power of 2'];

  const defaultSpectrumSettings = () => ({
    type: 'Magnitude', window: 'Hann', dB: true, dBFS: false, fullScale: 1,
    subtractMean: true, removeTrend: false, zeroPadding: 'None',
    averageSegments: false, segmentCount: 8, segmentOverlap: 50,
    smooth: 0, fromFreq: 0, toFreq: 0
  });

  // One-sided spectrum of one segment. Returns per-bin {amp, pow, psd, phase, re, im} arrays (linear).
  function segmentSpectrum(seg, fs, s) {
    let x = Float64Array.from(seg);
    if (s.removeTrend) x = removeTrend(x); else if (s.subtractMean) x = removeMean(x);
    const n = x.length, w = makeWindow(s.window, n);
    let sw = 0, sw2 = 0;
    for (let i = 0; i < n; i++) { x[i] *= w[i]; sw += w[i]; sw2 += w[i] * w[i]; }
    const mult = { 'Next power of 2': 1, '2 x Next power of 2': 2, '4 x Next power of 2': 4, '8 x Next power of 2': 8 }[s.zeroPadding];
    const nfft = mult ? nextPow2(n) * mult : n;
    const { re, im } = rfft(x, nfft);
    const bins = Math.floor(nfft / 2) + 1;
    const out = { nfft, bins, amp: new Float64Array(bins), pow: new Float64Array(bins), psd: new Float64Array(bins),
      phase: new Float64Array(bins), re: new Float64Array(bins), im: new Float64Array(bins) };
    const ampScale = sw > 0 ? 1 / sw : 0, psdScale = sw2 > 0 ? 1 / (fs * sw2) : 0;
    for (let k = 0; k < bins; k++) {
      const edge = k === 0 || (nfft % 2 === 0 && k === bins - 1);
      const f = edge ? 1 : 2;
      const m2 = re[k] * re[k] + im[k] * im[k];
      out.amp[k] = f * Math.sqrt(m2) * ampScale;                 // peak amplitude of a sinusoid
      out.pow[k] = edge ? out.amp[k] * out.amp[k] : out.amp[k] * out.amp[k] / 2; // mean-square power
      out.psd[k] = f * m2 * psdScale;                            // units^2 / Hz
      out.phase[k] = Math.atan2(im[k], re[k]) * 180 / Math.PI;
      out.re[k] = f * re[k] * ampScale; out.im[k] = f * im[k] * ampScale;
    }
    return out;
  }

  function smoothArray(y, len) {
    if (len < 2) return y;
    const n = y.length, out = new Float64Array(n), h = Math.floor(len / 2);
    let acc = 0, cnt = 0, lo = 0, hi = -1;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - h), b = Math.min(n - 1, i + h);
      while (hi < b) { hi++; acc += y[hi]; cnt++; }
      while (lo < a) { acc -= y[lo]; lo++; cnt--; }
      out[i] = acc / cnt;
    }
    return out;
  }

  // Full spectrum with optional Welch averaging and A/C weighting (s.weighting). Returns {y (display values), df, linPow, nfft, segLen}.
  function spectrum(x, fs, s) {
    s = Object.assign(defaultSpectrumSettings(), s);
    let segs = [];
    if (s.averageSegments && s.segmentCount > 1 && x.length >= 4) {
      const k = s.segmentCount, ov = Math.min(95, Math.max(0, s.segmentOverlap)) / 100;
      const len = Math.max(2, Math.floor(x.length / (k - (k - 1) * ov)));
      const hop = Math.max(1, Math.floor(len * (1 - ov)));
      for (let start = 0; start + len <= x.length && segs.length < k; start += hop) segs.push(x.subarray(start, start + len));
      if (!segs.length) segs = [x];
    } else segs = [x];
    let acc = null;
    for (const seg of segs) {
      const sp = segmentSpectrum(seg, fs, s);
      if (!acc) acc = sp;
      else for (const key of ['amp', 'pow', 'psd', 're', 'im', 'phase']) for (let i = 0; i < acc.bins; i++) acc[key][i] += sp[key][i];
    }
    if (segs.length > 1) {
      for (const key of ['pow', 'psd', 're', 'im', 'phase']) for (let i = 0; i < acc.bins; i++) acc[key][i] /= segs.length;
      for (let i = 0; i < acc.bins; i++) acc.amp[i] = Math.sqrt(acc.pow[i] * (i === 0 ? 1 : 2)); // average in power domain
    }
    const df = fs / acc.nfft;
    if (typeof s.gainFn === 'function') { // custom filter curve: linear amplitude gain per frequency
      for (let k = 0; k < acc.bins; k++) {
        const g = s.gainFn(k * df);
        acc.amp[k] *= g; acc.re[k] *= g; acc.im[k] *= g; acc.pow[k] *= g * g; acc.psd[k] *= g * g;
      }
    }
    if (s.weighting === 'A' || s.weighting === 'C') {
      const wf = s.weighting === 'A' ? aWeightDb : cWeightDb;
      for (let k = 0; k < acc.bins; k++) {
        const g = k === 0 ? 0 : Math.pow(10, wf(k * df) / 20);
        acc.amp[k] *= g; acc.re[k] *= g; acc.im[k] *= g; acc.pow[k] *= g * g; acc.psd[k] *= g * g;
      }
    }
    let y;
    switch (s.type) {
      case 'Power spectrum': y = acc.pow; break;
      case 'Power spectral density (PSD)': y = acc.psd; break;
      case 'Phase': y = acc.phase; break;
      case 'Real part': y = acc.re; break;
      case 'Imaginary part': y = acc.im; break;
      default: y = acc.amp;
    }
    y = Float64Array.from(y);
    if (s.smooth > 1 && !['Phase'].includes(s.type)) y = smoothArray(y, s.smooth);
    const isPowerLike = s.type === 'Power spectrum' || s.type === 'Power spectral density (PSD)';
    if (s.dB && ['Magnitude', 'Power spectrum', 'Power spectral density (PSD)'].includes(s.type)) {
      const ref = s.dBFS && s.fullScale > 0 ? s.fullScale : 1;
      for (let i = 0; i < y.length; i++) {
        y[i] = isPowerLike ? 10 * Math.log10(Math.max(y[i] / (ref * ref), 1e-30)) : 20 * Math.log10(Math.max(y[i] / ref, 1e-15));
      }
    }
    // bandPow: per-bin power corrected for the window's noise bandwidth, so sums over bins give band power.
    const bandPow = Float64Array.from(acc.psd, v => v * df);
    return { y, df, linPow: acc.pow, linAmp: acc.amp, bandPow, nfft: acc.nfft, segLen: segs[0].length, segments: segs.length };
  }

  // Short-time FFT matrix (dB magnitude). opt: {segmentLength, overlap (%), window, pad (zero padding: 1, 2, 4 or 8 times the
  // next power of 2), average (a moving power average over this many segments), maxRows}. Returns {rows: [{t, v}], df, dt, bins}.
  function spectrogram(x, fs, opt) {
    const len = Math.max(8, opt.segmentLength || 256), ov = Math.min(0.95, (opt.overlap ?? 50) / 100);
    const hop = Math.max(1, Math.round(len * (1 - ov)));
    const w = makeWindow(opt.window || 'Hann', len);
    let sw = 0; for (let i = 0; i < len; i++) sw += w[i];
    const nfft = nextPow2(len) * ([2, 4, 8].includes(+opt.pad) ? +opt.pad : 1), bins = nfft / 2 + 1, rows = [];
    const re = new Float64Array(nfft), im = new Float64Array(nfft);
    const maxRows = opt.maxRows || 2000;
    let starts = [];
    for (let s = 0; s + len <= x.length; s += hop) starts.push(s);
    if (starts.length > maxRows) { const st = starts.length / maxRows; starts = Array.from({ length: maxRows }, (_, i) => starts[Math.floor(i * st)]); }
    for (const s of starts) {
      re.fill(0); im.fill(0);
      let m = 0; for (let i = 0; i < len; i++) m += x[s + i]; m /= len;
      for (let i = 0; i < len; i++) re[i] = (x[s + i] - m) * w[i];
      fftRadix2(re, im, false);
      const row = new Float32Array(bins);
      for (let k = 0; k < bins; k++) {
        const a = (k === 0 || k === bins - 1 ? 1 : 2) * Math.hypot(re[k], im[k]) / sw;
        row[k] = 20 * Math.log10(Math.max(a, 1e-12));
      }
      rows.push({ t: (s + len / 2) / fs, v: row });
    }
    const nav = Math.max(1, Math.round(opt.average || 1));
    if (nav > 1 && rows.length > 1) { // the mean power of the segments around each one: a smoother picture, less time detail
      const pw = rows.map(r => Float64Array.from(r.v, v => Math.pow(10, v / 10))), h0 = Math.floor((nav - 1) / 2);
      rows.forEach((r, j) => {
        const a = Math.max(0, j - h0), b = Math.min(rows.length, j - h0 + nav);
        for (let k = 0; k < bins; k++) { let s = 0; for (let q = a; q < b; q++) s += pw[q][k]; r.v[k] = 10 * Math.log10(Math.max(s / (b - a), 1e-24)); }
      });
    }
    return { rows, df: fs / nfft, bins, segLen: len, hop, dt: hop / fs };
  }

  /* ---------- Filters ---------- */
  // FFT (brick-wall with cosine slope) filter. type: lowpass|highpass|bandpass|bandstop.
  function fftFilter(x, fs, type, f1, f2, slopeHz, stopDb) {
    const n = x.length, N = nextPow2(n * 2);
    const re = new Float64Array(N), im = new Float64Array(N);
    const m = mean(x);
    for (let i = 0; i < n; i++) re[i] = x[i] - m;
    fft(re, im, false);
    const slope = Math.max(0, slopeHz || 0), stop = Math.pow(10, -(stopDb ?? 200) / 20);
    const ramp = (f, edge, rising) => {
      if (slope === 0) return rising ? (f >= edge ? 1 : 0) : (f <= edge ? 1 : 0);
      const t = (f - (edge - slope / 2)) / slope;
      const c = t <= 0 ? 0 : t >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * t);
      return rising ? c : 1 - c;
    };
    for (let k = 0; k <= N / 2; k++) {
      const f = k * fs / N;
      let g;
      if (type === 'lowpass') g = ramp(f, f1, false);
      else if (type === 'highpass') g = ramp(f, f1, true);
      else if (type === 'bandpass') g = Math.min(ramp(f, f1, true), ramp(f, f2, false));
      else g = 1 - Math.min(ramp(f, f1, true), ramp(f, f2, false));
      g = stop + (1 - stop) * g;
      if (type === 'bandstop' || type === 'highpass' || type === 'bandpass') { /* DC handled by gain */ }
      re[k] *= g; im[k] *= g;
      if (k > 0 && k < N / 2) { re[N - k] *= g; im[N - k] *= g; }
    }
    const keepDC = type === 'lowpass' || (type === 'bandstop' && f1 > 0);
    fft(re, im, true);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = re[i] / N + (keepDC ? m : 0);
    return out;
  }

  // Butterworth IIR via cascaded biquads (bilinear transform, RBJ formulas).
  function butterworthSections(type, order, fs, f1, f2) {
    const secs = [], nSec = Math.max(1, Math.round(order / 2));
    const qs = [];
    for (let k = 0; k < nSec; k++) qs.push(1 / (2 * Math.cos(Math.PI * (2 * k + 1) / (4 * nSec))));
    const biq = (kind, f0, Q) => {
      const w0 = TAU * Math.min(f0, fs * 0.499) / fs, cw = Math.cos(w0), sw = Math.sin(w0), a = sw / (2 * Q);
      let b0, b1, b2;
      if (kind === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
      else if (kind === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
      else if (kind === 'bp') { b0 = a; b1 = 0; b2 = -a; }
      else { b0 = 1; b1 = -2 * cw; b2 = 1; }
      const a0 = 1 + a;
      return [b0 / a0, b1 / a0, b2 / a0, -2 * cw / a0, (1 - a) / a0];
    };
    if (type === 'lowpass' || type === 'highpass') {
      for (const q of qs) secs.push(biq(type === 'lowpass' ? 'lp' : 'hp', f1, q));
    } else if (type === 'bandpass') {
      for (const q of qs) { secs.push(biq('hp', f1, q)); secs.push(biq('lp', f2, q)); }
    } else {
      const f0 = Math.sqrt(Math.max(f1, 1e-6) * f2), bw = f2 - f1;
      for (let k = 0; k < nSec; k++) secs.push(biq('notch', f0, f0 / Math.max(bw, 1e-6)));
    }
    return secs;
  }

  function iirFilter(x, fs, type, order, f1, f2, state) {
    const secs = butterworthSections(type, order, fs, f1, f2);
    let y = Float64Array.from(x);
    const st = state && state.length === secs.length ? state : secs.map(() => [0, 0]);
    secs.forEach((c, si) => {
      let [z1, z2] = st[si];
      for (let i = 0; i < y.length; i++) {
        const v = y[i], o = c[0] * v + z1;
        z1 = c[1] * v - c[3] * o + z2;
        z2 = c[2] * v - c[4] * o;
        y[i] = o;
      }
      st[si] = [z1, z2];
    });
    return { y, state: st };
  }

  /* ---------- Signal tools ---------- */
  function movingAverage(x, len, weighting) {
    len = Math.max(1, Math.round(len)); const h = Math.floor(len / 2), n = x.length, out = new Float64Array(n);
    const w = weighting && weighting !== 'Rectangle' ? makeWindow(weighting, 2 * h + 1) : null;
    if (!w) return smoothArray(x, 2 * h + 1);
    for (let i = 0; i < n; i++) {
      let s = 0, sw = 0;
      for (let k = -h; k <= h; k++) { const j = i + k; if (j >= 0 && j < n) { s += x[j] * w[k + h]; sw += w[k + h]; } }
      out[i] = sw ? s / sw : x[i];
    }
    return out;
  }

  function autocorrelation(x) {
    const n = x.length, N = nextPow2(2 * n), re = new Float64Array(N), im = new Float64Array(N), m = mean(x);
    for (let i = 0; i < n; i++) re[i] = x[i] - m;
    fft(re, im, false);
    for (let k = 0; k < N; k++) { re[k] = re[k] * re[k] + im[k] * im[k]; im[k] = 0; }
    fft(re, im, true);
    const out = new Float64Array(n), z = re[0] || 1;
    for (let i = 0; i < n; i++) out[i] = re[i] / z;
    return out;
  }

  function crossCorrelation(a, b) {
    const n = Math.min(a.length, b.length), N = nextPow2(2 * n);
    const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
    const ma = mean(a.subarray(0, n)), mb = mean(b.subarray(0, n));
    let ea = 0, eb = 0;
    for (let i = 0; i < n; i++) { ar[i] = a[i] - ma; br[i] = b[i] - mb; ea += ar[i] * ar[i]; eb += br[i] * br[i]; }
    fft(ar, ai, false); fft(br, bi, false);
    for (let k = 0; k < N; k++) { const r = ar[k] * br[k] + ai[k] * bi[k], i = ai[k] * br[k] - ar[k] * bi[k]; ar[k] = r; ai[k] = i; }
    fft(ar, ai, true);
    // lags -(n-1)..(n-1)
    const out = new Float64Array(2 * n - 1), norm = Math.sqrt(ea * eb) * N || 1;
    for (let l = -(n - 1); l < n; l++) out[l + n - 1] = ar[(l + N) % N] / norm;
    return out;
  }

  function convolution(a, b) {
    const n = a.length + b.length - 1, N = nextPow2(n);
    const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
    ar.set(a); br.set(b);
    fft(ar, ai, false); fft(br, bi, false);
    for (let k = 0; k < N; k++) { const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; ai[k] = i; }
    fft(ar, ai, true);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = ar[i] / N;
    return out;
  }

  // Welch cross spectral quantities between a and b.
  function crossSpectral(a, b, fs, segLen, overlap, window) {
    const n = Math.min(a.length, b.length);
    segLen = Math.min(segLen || 1024, n); const hop = Math.max(1, Math.round(segLen * (1 - (overlap ?? 50) / 100)));
    const w = makeWindow(window || 'Hann', segLen), nfft = nextPow2(segLen), bins = nfft / 2 + 1;
    const Saa = new Float64Array(bins), Sbb = new Float64Array(bins), Sr = new Float64Array(bins), Si = new Float64Array(bins);
    let cnt = 0;
    for (let s = 0; s + segLen <= n; s += hop) {
      const xa = new Float64Array(nfft), ya = new Float64Array(nfft), xb = new Float64Array(nfft), yb = new Float64Array(nfft);
      const ma = mean(a.subarray(s, s + segLen)), mb = mean(b.subarray(s, s + segLen));
      for (let i = 0; i < segLen; i++) { xa[i] = (a[s + i] - ma) * w[i]; xb[i] = (b[s + i] - mb) * w[i]; }
      fftRadix2(xa, ya, false); fftRadix2(xb, yb, false);
      for (let k = 0; k < bins; k++) {
        Saa[k] += xa[k] * xa[k] + ya[k] * ya[k];
        Sbb[k] += xb[k] * xb[k] + yb[k] * yb[k];
        Sr[k] += xa[k] * xb[k] + ya[k] * yb[k];   // conj(A)·B
        Si[k] += xa[k] * yb[k] - ya[k] * xb[k];
      }
      cnt++;
    }
    let sw = 0; for (let i = 0; i < segLen; i++) sw += w[i];
    const scale = cnt ? 1 / (cnt * sw * sw) : 0;
    const res = { df: fs / nfft, bins, cross: new Float64Array(bins), coherence: new Float64Array(bins),
      gain: new Float64Array(bins), phase: new Float64Array(bins) };
    for (let k = 0; k < bins; k++) {
      const c2 = Sr[k] * Sr[k] + Si[k] * Si[k];
      res.cross[k] = Math.sqrt(c2) * scale * 2;
      res.coherence[k] = Saa[k] * Sbb[k] > 0 ? c2 / (Saa[k] * Sbb[k]) : 0;
      res.gain[k] = Saa[k] > 0 ? Math.sqrt(c2) / Saa[k] : 0;          // |H1| = |Sab|/Saa
      res.phase[k] = Math.atan2(Si[k], Sr[k]) * 180 / Math.PI;
    }
    return res;
  }

  function hilbertEnvelope(x) {
    const n = x.length, { re, im } = rfft(x, n);
    for (let k = 1; k < n; k++) {
      const g = k < n / 2 ? 2 : (k === n / 2 ? 1 : 0);
      re[k] *= g; im[k] *= g;
    }
    fft(re, im, true);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.hypot(re[i], im[i]) / n;
    return out;
  }

  function instantaneousFrequency(x, fs) {
    const n = x.length, { re, im } = rfft(x, n);
    for (let k = 1; k < n; k++) { const g = k < n / 2 ? 2 : (k === n / 2 ? 1 : 0); re[k] *= g; im[k] *= g; }
    fft(re, im, true);
    const out = new Float64Array(n);
    let prev = Math.atan2(im[0], re[0]);
    for (let i = 1; i < n; i++) {
      const ph = Math.atan2(im[i], re[i]);
      let d = ph - prev; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      out[i] = d * fs / TAU; prev = ph;
    }
    out[0] = out[1] || 0;
    return out;
  }

  // Windowed-sinc resampling to an arbitrary new rate.
  function resample(x, fsOld, fsNew) {
    const ratio = fsNew / fsOld, n = Math.max(1, Math.round(x.length * ratio)), out = new Float64Array(n);
    const cutoff = Math.min(1, ratio), half = 16;
    for (let i = 0; i < n; i++) {
      const t = i / ratio, c = Math.floor(t);
      let s = 0, ws = 0;
      for (let j = c - half + 1; j <= c + half; j++) {
        if (j < 0 || j >= x.length) continue;
        const d = t - j, arg = Math.PI * d * cutoff;
        const sinc = d === 0 ? 1 : Math.sin(arg) / arg;
        const win = 0.5 + 0.5 * Math.cos(Math.PI * d / half);
        const k = cutoff * sinc * win; s += x[j] * k; ws += k;
      }
      out[i] = ws ? s / ws : 0;
    }
    return out;
  }

  function removePeaks(x, k) {
    const m = mean(x); let v = 0; for (const a of x) v += (a - m) * (a - m);
    const sd = Math.sqrt(v / Math.max(1, x.length)), lim = k * sd, out = Float64Array.from(x);
    for (let i = 0; i < out.length; i++) if (Math.abs(out[i] - m) > lim) out[i] = m + Math.sign(out[i] - m) * lim;
    return out;
  }

  function integral(x, dx) { const out = new Float64Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) { if (i) s += (x[i] + x[i - 1]) / 2 * dx; out[i] = s; } return out; }

  function differentiate(x, dx) {
    const n = x.length, out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = x[Math.max(0, i - 1)], b = x[Math.min(n - 1, i + 1)], span = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * dx;
      out[i] = span ? (b - a) / span : 0;
    }
    return out;
  }

  function histogram(x, bins) {
    let lo = Infinity, hi = -Infinity;
    for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!isFinite(lo)) return { counts: new Float64Array(0), x0: 0, dx: 1 };
    if (!bins) bins = Math.max(4, Math.ceil(Math.log2(x.length) + 1)); // Sturges
    if (hi === lo) hi = lo + 1;
    const dx = (hi - lo) / bins, counts = new Float64Array(bins);
    for (const v of x) counts[Math.min(bins - 1, Math.floor((v - lo) / dx))]++;
    for (let i = 0; i < bins; i++) counts[i] /= x.length;
    return { counts, x0: lo + dx / 2, dx };
  }

  function scale(x, mode, a, b) {
    const out = new Float64Array(x.length);
    if (mode === 'range') {
      let lo = Infinity, hi = -Infinity; for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; }
      const k = hi > lo ? (b - a) / (hi - lo) : 0;
      for (let i = 0; i < x.length; i++) out[i] = a + (x[i] - lo) * k;
    } else for (let i = 0; i < x.length; i++) out[i] = a + b * x[i];
    return out;
  }

  /* ---------- Octave bands ---------- */
  // fraction: 1, 3, 6, 9, 12. Uses base-10 exact mid-band frequencies (IEC 61260).
  function octaveBands(linPow, df, fraction, fMax, weighting) {
    const G = Math.pow(10, 0.3), bands = [];
    if (weighting === 'A' || weighting === 'C') {
      const wf = weighting === 'A' ? aWeightDb : cWeightDb;
      linPow = Float64Array.from(linPow, (v, k) => k ? v * Math.pow(10, wf(k * df) / 10) : v);
    }
    for (let i = -60 * fraction; i <= 30 * fraction; i++) {
      const fm = fraction % 2 ? 1000 * Math.pow(G, i / fraction) : 1000 * Math.pow(G, (2 * i + 1) / (2 * fraction));
      const lo = fm * Math.pow(G, -1 / (2 * fraction)), hi = fm * Math.pow(G, 1 / (2 * fraction));
      if (hi < df || lo > fMax || hi - lo < df) continue; // skip bands narrower than the frequency resolution
      let p = 0;
      const k0 = Math.max(1, Math.ceil(lo / df)), k1 = Math.min(linPow.length - 1, Math.floor(hi / df));
      if (k1 < k0) continue;
      for (let k = k0; k <= k1; k++) p += linPow[k];
      bands.push({ fc: fm, lo, hi, level: 10 * Math.log10(Math.max(p, 1e-30)) });
    }
    return bands;
  }

  function aWeightDb(f) {
    const f2 = f * f;
    const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
    return 20 * Math.log10(Math.max(ra, 1e-20)) + 2.0;
  }
  function cWeightDb(f) {
    const f2 = f * f, rc = (12194 ** 2 * f2) / ((f2 + 20.6 ** 2) * (f2 + 12194 ** 2));
    return 20 * Math.log10(Math.max(rc, 1e-20)) + 0.06;
  }

  /* ---------- Instruments (scalar measures) ---------- */
  function stats(x) {
    const n = x.length;
    let mn = Infinity, mx = -Infinity, imn = 0, imx = 0, s = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const v = x[i]; s += v; s2 += v * v; if (v < mn) { mn = v; imn = i; } if (v > mx) { mx = v; imx = i; } }
    const m = n ? s / n : 0;
    let m2 = 0, m3 = 0, m4 = 0;
    for (let i = 0; i < n; i++) { const d = x[i] - m, d2 = d * d; m2 += d2; m3 += d2 * d; m4 += d2 * d2; }
    m2 /= n || 1; m3 /= n || 1; m4 /= n || 1;
    return { n, min: mn, max: mx, imin: imn, imax: imx, mean: m, sum: s, rms: Math.sqrt(s2 / (n || 1)),
      variance: n > 1 ? m2 * n / (n - 1) : 0, std: n > 1 ? Math.sqrt(m2 * n / (n - 1)) : 0,
      skewness: m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0, kurtosis: m2 > 0 ? m4 / (m2 * m2) - 3 : 0 };
  }

  function quantile(x, q) {
    const s = Float64Array.from(x).sort(); if (!s.length) return NaN;
    const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return s[lo] + (s[hi] - s[lo]) * (p - lo);
  }

  // Parabolic interpolation of a peak at index i.
  function interpPeak(y, i) {
    if (i <= 0 || i >= y.length - 1) return { pos: i, val: y[i] };
    const a = y[i - 1], b = y[i], c = y[i + 1], d = a - 2 * b + c;
    if (d === 0) return { pos: i, val: b };
    const p = 0.5 * (a - c) / d;
    return { pos: i + p, val: b - 0.25 * (a - c) * p };
  }

  function zeroCrossingRate(x, fs) {
    const m = mean(x); let c = 0;
    for (let i = 1; i < x.length; i++) if ((x[i - 1] - m) * (x[i] - m) < 0) c++;
    return x.length > 1 ? c * fs / (x.length - 1) : 0;
  }

  // Solve the symmetric positive system A·x = b (Gaussian elimination with partial pivoting).
  function solveLinear(A, b) {
    const n = b.length, M = A.map((r, i) => Float64Array.from([...r, b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      if (Math.abs(M[c][c]) < 1e-300) continue;
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    const x = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = Math.abs(M[r][r]) < 1e-300 ? 0 : s / M[r][r]; }
    return x;
  }

  // Least-squares fit of DC + harmonics h·f (h = 1..H). Returns {amps, residual}.
  function harmonicFit(x, fs, f, H) {
    const n = x.length, cols = 1 + 2 * H, cos = [], sin = [];
    for (let h = 1; h <= H; h++) {
      const c = new Float64Array(n), s = new Float64Array(n), w = TAU * h * f / fs;
      for (let i = 0; i < n; i++) { c[i] = Math.cos(w * i); s[i] = Math.sin(w * i); }
      cos.push(c); sin.push(s);
    }
    const col = j => j === 0 ? null : j % 2 ? cos[(j - 1) >> 1] : sin[(j - 1) >> 1];
    const dot = (a, b) => { let s = 0; if (!a && !b) return n; for (let i = 0; i < n; i++) s += (a ? a[i] : 1) * (b ? b[i] : 1); return s; };
    const A = Array.from({ length: cols }, () => new Array(cols));
    for (let r = 0; r < cols; r++) for (let c = r; c < cols; c++) A[r][c] = A[c][r] = dot(col(r), col(c));
    const b = Array.from({ length: cols }, (_, r) => { const cr = col(r); let s = 0; for (let i = 0; i < n; i++) s += (cr ? cr[i] : 1) * x[i]; return s; });
    const coef = solveLinear(A, b), amps = [];
    for (let h = 1; h <= H; h++) amps.push(Math.hypot(coef[2 * h - 1], coef[2 * h]));
    let res = 0;
    for (let i = 0; i < n; i++) {
      let v = coef[0];
      for (let h = 0; h < H; h++) v += coef[2 * h + 1] * cos[h][i] + coef[2 * h + 2] * sin[h][i];
      res += (x[i] - v) * (x[i] - v);
    }
    return { amps, residual: res / n };
  }

  // Harmonic analysis of a time signal: fundamental, THD, THD+N, SNR. Uses a least-squares harmonic
  // fit at a refined fundamental, so it stays accurate for short segments with only a few periods.
  function harmonicAnalysis(x, fs, nHarm) {
    nHarm = nHarm || 10;
    if (x.length > 65536) x = x.subarray(0, 65536);
    const xm = removeMean(x), n = xm.length;
    const sp = spectrum(xm, fs, { type: 'Magnitude', window: 'Hann', dB: false, zeroPadding: '8 x Next power of 2' });
    let k1 = 1; for (let k = 2; k < sp.y.length; k++) if (sp.y[k] > sp.y[k1]) k1 = k;
    let f = interpPeak(sp.y, k1).pos * sp.df;
    // Refine f with a golden-section search within ±1 FFT bin of the unpadded signal. Long segments maximise the
    // single-tone projection (cheap, unbiased with many periods); short ones minimise the full harmonic-fit residual,
    // because with few periods the harmonics bias the single-tone estimate.
    const Hmax = Math.max(1, Math.min(nHarm, Math.floor((fs / 2 - 1e-9) / f), Math.floor(n / 4)));
    const energy = n > 4096
      ? fr => { const w = TAU * fr / fs; let c = 0, s = 0; for (let i = 0; i < n; i++) { c += xm[i] * Math.cos(w * i); s += xm[i] * Math.sin(w * i); } return c * c + s * s; }
      : fr => -harmonicFit(xm, fs, fr, Math.max(1, Math.min(Hmax, Math.floor((fs / 2 - 1e-9) / fr)))).residual;
    let lo = Math.max(1e-9, f - fs / n), hi = f + fs / n; const g = (Math.sqrt(5) - 1) / 2;
    let a = hi - g * (hi - lo), b = lo + g * (hi - lo), ea = energy(a), eb = energy(b);
    for (let it = 0; it < 28; it++) {
      if (ea > eb) { hi = b; b = a; eb = ea; a = hi - g * (hi - lo); ea = energy(a); } else { lo = a; a = b; ea = eb; b = lo + g * (hi - lo); eb = energy(b); }
    }
    f = (lo + hi) / 2;
    const H = Math.max(1, Math.min(nHarm, Math.floor((fs / 2 - 1e-9) / f), Math.floor(n / 4)));
    const fit = harmonicFit(x, fs, f, H);
    const P = fit.amps.map(A => A * A / 2), P1 = Math.max(P[0], 1e-300);
    const Ph = P.slice(1).reduce((s, v) => s + v, 0), Pn = Math.max(fit.residual, P1 * 1e-30);
    return { f1: f, amplitude: fit.amps[0], harmonics: fit.amps, thd: Math.sqrt(Ph / P1) * 100, thdn: Math.sqrt((Ph + Pn) / P1) * 100,
      snr: 10 * Math.log10(P1 / Pn), sinad: 10 * Math.log10(P1 / (Ph + Pn)) };
  }

  // Spectral shape measures on a linear power spectrum.
  function spectralMeasures(pow, df) {
    let s = 0, sf = 0, logs = 0, cnt = 0, kmax = 1;
    for (let k = 1; k < pow.length; k++) {
      s += pow[k]; sf += pow[k] * k * df; logs += Math.log(Math.max(pow[k], 1e-30)); cnt++;
      if (pow[k] > pow[kmax]) kmax = k;
    }
    let half = 0, kmed = 1;
    for (let k = 1; k < pow.length; k++) { half += pow[k]; if (half >= s / 2) { kmed = k; break; } }
    const amp = Array.from(pow, v => Math.sqrt(v));
    let sa = 0, saf = 0; for (let k = 1; k < amp.length; k++) { sa += amp[k]; saf += amp[k] * k * df; }
    return { centroid: s ? sf / s : 0, meanFreq: sa ? saf / sa : 0, medianFreq: kmed * df,
      flatness: s && cnt ? Math.exp(logs / cnt) / (s / cnt) : 0, dominant: interpPeak(pow, kmax).pos * df };
  }

  function weightedLevel(pow, df, weighting) {
    let p = 0;
    for (let k = 1; k < pow.length; k++) {
      const f = k * df, g = weighting === 'A' ? aWeightDb(f) : weighting === 'C' ? cWeightDb(f) : 0;
      p += pow[k] * Math.pow(10, g / 10);
    }
    return 10 * Math.log10(Math.max(p, 1e-30));
  }

  // Threshold peak detector (Signal tools ▸ Peak detection), matched against the reference program (test/peaks_reference.test.js).
  // s = {pos, neg, width, multiple, negative}; [i0, i1] is the visible sample range (inclusive). Returns sorted indices.
  // Positive peaks: the first maximum of each part above pos (strictly), negative peaks: the first minimum of each part
  // below the level neg (a signed level, not a magnitude); parts shorter than width samples are skipped. With multiple,
  // every strict local maximum >= pos (minimum <= neg) that is also the extreme within ±floor(width/2) samples counts.
  function defaultPeakSettings(y) {
    let lo = Infinity, hi = -Infinity;
    for (const v of y) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!isFinite(lo)) lo = hi = 0;
    return { on: false, pos: lo + 0.75 * (hi - lo), neg: lo + 0.25 * (hi - lo), width: 1, multiple: false, negative: false };
  }

  function svPeaks(y, s, i0 = 0, i1 = y.length - 1) {
    i0 = Math.max(0, i0); i1 = Math.min(y.length - 1, i1);
    const out = [], w = Math.max(1, Math.floor(s.width || 1));
    if (i1 < i0) return out;
    const scan = (above, better) => {
      let start = -1, best = -1;
      for (let i = i0; i < i1; i++) {
        if (above(y[i])) { if (start < 0) start = best = i; else if (better(y[i], y[best])) best = i; }
        else if (start >= 0) { if (i - start >= w) out.push(best); start = -1; }
      }
      // the last visible sample only closes a running part; on its own it is a peak when the sample after it is not above
      if (start >= 0) { if (i1 - start >= w) out.push(best); }
      else if (w <= 1 && above(y[i1]) && (i1 === i0 || !above(y[i1 - 1])) && !(i1 + 1 < y.length && above(y[i1 + 1]))) out.push(i1);
    };
    const local = (sg, thr) => {
      const h = w >> 1;
      for (let i = i0 + 1; i < i1; i++) {
        const v = sg * y[i];
        if (!(v >= thr && v > sg * y[i - 1] && v > sg * y[i + 1])) continue;
        let ok = true;
        for (let j = Math.max(i0, i - h); ok && j <= Math.min(i1, i + h); j++) if (j !== i && !(v > sg * y[j])) ok = false;
        if (ok) out.push(i);
      }
    };
    if (s.multiple) { local(1, s.pos); if (s.negative) local(-1, -s.neg); }
    else { scan(v => v > s.pos, (a, b) => a > b); if (s.negative) scan(v => v < s.neg, (a, b) => a < b); }
    return out.sort((a, b) => a - b);
  }

  // Average X distance between the first and the last detected peak (the "Average peak distance" instrument; 0 below two peaks)
  const peakDistance = xs => xs.length > 1 ? (xs[xs.length - 1] - xs[0]) / (xs.length - 1) : 0;

  /* ---------- More peak detectors (Peak detection ▸ Method) ----------
     prominence / distance / width follow scipy.signal.find_peaks, the wavelet method scipy.signal.find_peaks_cwt
     (ridge lines of a Ricker-wavelet CWT, Du, Kibbe & Lin 2006), the adaptive method the moving z-score detector
     (lag, threshold, influence). All work on a plain array and return sorted indices into it. */
  const PEAK_METHODS = [['threshold', 'Threshold'], ['prominence', 'Prominence'], ['topn', 'N highest peaks'],
    ['slope', 'Slope (smoothed derivative)'], ['zscore', 'Adaptive threshold (moving z-score)'], ['cwt', 'Wavelet ridge lines (CWT)']];

  // local maxima; a flat top counts once, at its middle; the first and the last sample never count
  function localMaxima(x) {
    const out = [], iMax = x.length - 1;
    let i = 1;
    while (i < iMax) {
      if (x[i - 1] < x[i]) {
        let a = i + 1;
        while (a < iMax && x[a] === x[i]) a++;
        if (x[a] < x[i]) { out.push((i + a - 1) >> 1); i = a; }
      }
      i++;
    }
    return out;
  }
  // keep the highest peaks first and drop every lower one closer than distance samples
  function selectByDistance(peaks, prio, distance) {
    const n = peaks.length, keep = new Uint8Array(n).fill(1), d = Math.ceil(distance);
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => prio[a] - prio[b] || a - b);
    for (let r = n - 1; r >= 0; r--) {
      const j = order[r]; if (!keep[j]) continue;
      for (let k = j - 1; k >= 0 && peaks[j] - peaks[k] < d; k--) keep[k] = 0;
      for (let k = j + 1; k < n && peaks[k] - peaks[j] < d; k++) keep[k] = 0;
    }
    return keep;
  }
  // prominence: height above the higher of the two lowest points between the peak and the next higher sample each side
  function peakProminences(x, peaks) {
    const n = x.length, prom = [], left = [], right = [];
    for (const p of peaks) {
      let i = p, lmin = x[p], lb = p;
      while (i >= 0 && x[i] <= x[p]) { if (x[i] < lmin) { lmin = x[i]; lb = i; } i--; }
      i = p; let rmin = x[p], rb = p;
      while (i < n && x[i] <= x[p]) { if (x[i] < rmin) { rmin = x[i]; rb = i; } i++; }
      prom.push(x[p] - Math.max(lmin, rmin)); left.push(lb); right.push(rb);
    }
    return { prom, left, right };
  }
  // width at rel × prominence below the top, interpolated between samples
  function peakWidths(x, peaks, pr, rel = 0.5) {
    return peaks.map((p, k) => {
      const hgt = x[p] - pr.prom[k] * rel;
      let i = p; while (pr.left[k] < i && hgt < x[i]) i--;
      let l = i; if (x[i] < hgt) l += (hgt - x[i]) / (x[i + 1] - x[i]);
      i = p; while (i < pr.right[k] && hgt < x[i]) i++;
      let r = i; if (x[i] < hgt) r -= (hgt - x[i]) / (x[i - 1] - x[i]);
      return r - l;
    });
  }
  // o: {height, distance, prominence, width} (each optional) → {peaks, prominences, widths}
  function findPeaks(x, o = {}) {
    let peaks = localMaxima(x);
    const by = keep => { peaks = peaks.filter((_, k) => keep[k]); };
    if (o.height != null) by(peaks.map(p => x[p] >= o.height));
    if (o.distance > 1) by(selectByDistance(peaks, peaks.map(p => x[p]), o.distance));
    let pr = null, widths = null;
    if (o.prominence != null || o.width != null) {
      pr = peakProminences(x, peaks);
      if (o.prominence != null) { const keep = pr.prom.map(v => v >= o.prominence); by(keep); pr = { prom: pr.prom.filter((_, k) => keep[k]), left: pr.left.filter((_, k) => keep[k]), right: pr.right.filter((_, k) => keep[k]) }; }
      if (o.width != null) { widths = peakWidths(x, peaks, pr); const keep = widths.map(v => v >= o.width); by(keep); pr = { prom: pr.prom.filter((_, k) => keep[k]) }; widths = widths.filter((_, k) => keep[k]); }
    }
    return { peaks, prominences: pr && pr.prom, widths };
  }
  // the n highest local maxima at least distance samples apart, in index order
  function topPeaks(x, n, distance) {
    let peaks = localMaxima(x);
    if (distance > 1) { const keep = selectByDistance(peaks, peaks.map(p => x[p]), distance); peaks = peaks.filter((_, k) => keep[k]); }
    return peaks.sort((a, b) => x[b] - x[a] || a - b).slice(0, Math.max(0, Math.round(n))).sort((a, b) => a - b);
  }
  // downward zero crossings of the smoothed first derivative that are steeper than slope, at the highest sample nearby
  // that is above amp (after T. O'Haver's findpeaks)
  function slopePeaks(x, smooth, slope, amp) {
    const n = x.length, out = [];
    if (n < 3) return out;
    const d = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) d[i] = (x[i + 1] - x[i - 1]) / 2;
    d[0] = x[1] - x[0]; d[n - 1] = x[n - 1] - x[n - 2];
    const m = Math.max(1, Math.round(smooth || 1)), ds = m > 1 ? smoothArray(d, m | 1) : d, h = Math.max(1, m >> 1);
    for (let j = 0; j < n - 1; j++) {
      if (!(ds[j] > 0 && ds[j + 1] <= 0 && ds[j] - ds[j + 1] > (slope || 0))) continue;
      let best = j;
      for (let k = Math.max(0, j - h); k <= Math.min(n - 1, j + 1 + h); k++) if (x[k] > x[best]) best = k;
      if (best > 0 && best < n - 1 && !(x[best] <= amp) && out[out.length - 1] !== best) out.push(best);
    }
    return [...new Set(out)].sort((a, b) => a - b);
  }
  // moving z-score: a sample more than z standard deviations from the mean of the last lag (filtered) samples signals;
  // signalling samples enter the window with weight influence. The extreme of each run is a peak (valley).
  function zscorePeaks(x, lag, z, influence) {
    const n = x.length, L = Math.max(2, Math.round(lag)), peaks = [], valleys = [];
    if (n <= L) return { peaks, valleys };
    const f = new Float64Array(n);
    let sum = 0, sq = 0;
    for (let i = 0; i < L; i++) { f[i] = x[i]; sum += x[i]; sq += x[i] * x[i]; }
    let avg = sum / L, sd = Math.sqrt(Math.max(0, sq / L - avg * avg)), run = 0, best = -1;
    const close = () => { if (run > 0) peaks.push(best); else if (run < 0) valleys.push(best); run = 0; };
    for (let i = L; i < n; i++) {
      let sig = 0;
      if (Math.abs(x[i] - avg) > z * sd) { sig = x[i] > avg ? 1 : -1; f[i] = influence * x[i] + (1 - influence) * f[i - 1]; } else f[i] = x[i];
      if (sig !== run) { close(); if (sig) { run = sig; best = i; } }
      else if (sig && (sig > 0 ? x[i] > x[best] : x[i] < x[best])) best = i;
      if ((i & 4095) === 0) { sum = 0; sq = 0; for (let k = i - L + 1; k <= i; k++) { sum += f[k]; sq += f[k] * f[k]; } } // no drift
      else { sum += f[i] - f[i - L]; sq += f[i] * f[i] - f[i - L] * f[i - L]; }
      avg = sum / L; sd = Math.sqrt(Math.max(0, sq / L - avg * avg));
    }
    close();
    return { peaks, valleys };
  }
  // Ricker ("Mexican hat") wavelet and the CWT rows of x for each width (convolution, "same" length)
  function ricker(points, a) {
    const A = 2 / (Math.sqrt(3 * a) * Math.pow(Math.PI, 0.25)), wsq = a * a, out = new Float64Array(points);
    for (let i = 0; i < points; i++) { const v = i - (points - 1) / 2, xsq = v * v; out[i] = A * (1 - xsq / wsq) * Math.exp(-xsq / (2 * wsq)); }
    return out;
  }
  function convolveSame(x, k) {
    const L = x.length, M = k.length, off = (M - 1) >> 1;
    if (L * M > 4e6) return convolution(x, k).slice(off, off + L);
    const out = new Float64Array(L);
    for (let i = 0; i < L; i++) {
      const c = i + off, j0 = Math.max(0, c - (L - 1)), j1 = Math.min(M - 1, c);
      let s = 0; for (let j = j0; j <= j1; j++) s += k[j] * x[c - j];
      out[i] = s;
    }
    return out;
  }
  // quantile like quantile() (linear between order statistics) without sorting: quickselect; a is reordered
  function selectQuantile(a, q) {
    const n = a.length; if (!n) return NaN;
    const p = (n - 1) * q, k = Math.floor(p);
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const pv = a[(lo + hi) >> 1]; let i = lo, j = hi;
      while (i <= j) { while (a[i] < pv) i++; while (a[j] > pv) j--; if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; } }
      if (k <= j) hi = j; else if (k >= i) lo = i; else break;
    }
    if (p === k) return a[k];
    let nx = Infinity; for (let i = k + 1; i < n; i++) if (a[i] < nx) nx = a[i];
    return a[k] + (nx - a[k]) * (p - k);
  }
  function cwtPeaks(x, widths, minSnr = 1, noisePerc = 10) {
    const n = x.length, R = widths.length;
    if (n < 3 || !R) return [];
    const rows = widths.map(w => convolveSame(x, ricker(Math.ceil(Math.min(10 * w, n)), w)));
    const maxCols = rows.map(r => { const c = []; for (let i = 1; i < n - 1; i++) if (r[i] > r[i - 1] && r[i] > r[i + 1]) c.push(i); return c; });
    let start = -1; for (let r = R - 1; r >= 0; r--) if (maxCols[r].length) { start = r; break; }
    if (start < 0) return [];
    const gapThresh = Math.ceil(widths[0]);
    let lines = maxCols[start].map(c => ({ rows: [start], cols: [c], gap: 0 }));
    const done = [];
    for (let row = start - 1; row >= 0; row--) {
      for (const l of lines) l.gap++;
      // the line whose last column is closest (the first such line on ties), found by binary search
      const ends = lines.map((l, i) => [l.cols[l.cols.length - 1], i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const firstOf = new Map(); for (const [c, i] of ends) if (!firstOf.has(c)) firstOf.set(c, i);
      const keys = [...firstOf.keys()], nPrev = lines.length;
      for (const col of maxCols[row]) {
        let line = null;
        if (nPrev) {
          let lo = 0, hi = keys.length - 1;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (keys[mid] < col) lo = mid + 1; else hi = mid; }
          let best = -1, bd = Infinity;
          for (const k of [lo - 1, lo]) {
            if (k < 0 || k >= keys.length) continue;
            const dd = Math.abs(col - keys[k]), i = firstOf.get(keys[k]);
            if (dd < bd || (dd === bd && i < best)) { bd = dd; best = i; }
          }
          if (best >= 0 && bd <= widths[row] / 4) line = lines[best];
        }
        if (line) { line.cols.push(col); line.rows.push(row); line.gap = 0; }
        else lines.push({ rows: [row], cols: [col], gap: 0 });
      }
      for (let i = lines.length - 1; i >= 0; i--) if (lines[i].gap > gapThresh) { done.push(lines[i]); lines.splice(i, 1); }
    }
    // keep ridge lines over at least a quarter of the widths whose smallest-scale value is minSnr × the local noise
    const minLen = Math.ceil(R / 4), win = Math.ceil(n / 20), hf = win >> 1, odd = win & 1, row0 = rows[0], noise = new Map();
    const noiseAt = c => { if (!noise.has(c)) noise.set(c, selectQuantile(row0.slice(Math.max(c - hf, 0), Math.min(c + hf + odd, n)), noisePerc / 100)); return noise.get(c); };
    const out = [];
    for (const l of done.concat(lines)) {
      if (l.rows.length < minLen) continue;
      const c = l.cols[l.cols.length - 1], r = l.rows[l.rows.length - 1]; // the smallest width the line reaches
      if (Math.abs(rows[r][c] / noiseAt(c)) < minSnr) continue;
      out.push(c);
    }
    return [...new Set(out)].sort((a, b) => a - b);
  }
  // widths for the wavelet method: every whole width from lo to hi, at most 40 of them (spaced logarithmically)
  function peakWidthsRange(lo, hi) {
    lo = Math.max(1, Math.round(lo)); hi = Math.max(lo, Math.round(hi));
    if (hi - lo + 1 <= 40) return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const out = []; for (let i = 0; i < 40; i++) out.push(Math.round(lo * Math.pow(hi / lo, i / 39)));
    return [...new Set(out)];
  }
  // Position and value of a peak between samples: parabola (or Gaussian = parabola through the logarithms) through the
  // top three samples; valleys (neg) are refined on −y
  function refinePeak(y, i, mode, neg) {
    if (!mode || mode === 'none' || i <= 0 || i >= y.length - 1) return { pos: i, val: y[i] };
    const s = neg ? -1 : 1, a = s * y[i - 1], b = s * y[i], c = s * y[i + 1];
    if (mode === 'gaussian' && a > 0 && b > 0 && c > 0) {
      const la = Math.log(a), lb = Math.log(b), lc = Math.log(c), d = la - 2 * lb + lc;
      if (d < 0) { const p = 0.5 * (la - lc) / d; return { pos: i + p, val: s * Math.exp(lb - 0.25 * (la - lc) * p) }; }
    }
    const d = a - 2 * b + c;
    if (!(d < 0)) return { pos: i, val: y[i] };
    const p = 0.5 * (a - c) / d;
    return { pos: i + p, val: s * (b - 0.25 * (a - c) * p) };
  }
  // The peak detection of a signal window: s = display.peaks, [i0, i1] the visible samples. → {idx, neg} (neg[k]: valley)
  function detectPeaks(y, s, i0 = 0, i1 = y.length - 1) {
    i0 = Math.max(0, i0); i1 = Math.min(y.length - 1, i1);
    const m = s.method || 'threshold';
    if (m === 'threshold') {
      const idx = svPeaks(y, s, i0, i1);
      return { idx, neg: idx.map(i => s.negative && !(y[i] > s.pos) && y[i] < s.neg) };
    }
    if (i1 - i0 < 2) return { idx: [], neg: [] };
    const seg = Float64Array.from(y.subarray ? y.subarray(i0, i1 + 1) : y.slice(i0, i1 + 1));
    const inv = Float64Array.from(seg, v => -v);
    const run = (x, valley) => {
      if (m === 'prominence') return findPeaks(x, { height: !valley && s.useHeight ? s.height : null, distance: s.distance, prominence: s.prom > 0 ? s.prom : null, width: s.minWidth > 0 ? s.minWidth : null }).peaks;
      if (m === 'topn') return topPeaks(x, s.count, s.distance);
      if (m === 'slope') return slopePeaks(x, s.smooth, s.slope, valley ? -Infinity : s.amp);
      if (m === 'cwt') return cwtPeaks(x, peakWidthsRange(s.wmin, s.wmax), s.snr > 0 ? s.snr : 1);
      return [];
    };
    let pk, vl = [];
    if (m === 'zscore') { const r = zscorePeaks(seg, s.lag, s.z, s.influence); pk = r.peaks; if (s.negative) vl = r.valleys; }
    else { pk = run(seg, false); if (s.negative) vl = run(inv, true); }
    const all = pk.map(i => [i + i0, false]).concat(vl.map(i => [i + i0, true])).sort((a, b) => a[0] - b[0]);
    return { idx: all.map(a => a[0]), neg: all.map(a => a[1]) };
  }
  // default settings of every method for a signal (thresholds from its range)
  function defaultPeakSettingsAll(y) {
    let lo = Infinity, hi = -Infinity;
    for (const v of y) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!isFinite(lo)) lo = hi = 0;
    const b = defaultPeakSettings(y), rng = hi - lo || 1;
    return Object.assign(b, { method: 'threshold', prom: +(0.1 * rng).toPrecision(3), useHeight: false, height: +(lo + 0.5 * rng).toPrecision(6), distance: 1, minWidth: 0,
      count: 5, smooth: 5, slope: 0, amp: +(lo + 0.1 * rng).toPrecision(6), lag: 30, z: 3.5, influence: 0.5, wmin: 1, wmax: 16, snr: 1, refine: 'none' });
  }

  // Shock response spectrum (Smallwood ramp-invariant recursive filter), absolute acceleration.
  function srs(x, fs, fMin, fMax, perOctave, Q, mode) {
    const zeta = 1 / (2 * Q), dt = 1 / fs, freqs = [], vals = [];
    for (let f = fMin; f <= Math.min(fMax, fs / 2); f *= Math.pow(2, 1 / perOctave)) {
      const wn = TAU * f, wd = wn * Math.sqrt(1 - zeta * zeta), E = Math.exp(-zeta * wn * dt), K = wd * dt, C = E * Math.cos(K), S = E * Math.sin(K), Sp = S / K;
      const b0 = 1 - Sp, b1 = 2 * (Sp - C), b2 = E * E - Sp, a1 = 2 * C, a2 = -E * E;
      let y1 = 0, y2 = 0, x1 = 0, x2 = 0, pmax = 0, nmax = 0;
      for (let i = 0; i < x.length; i++) {
        const y = b0 * x[i] + b1 * x1 + b2 * x2 + a1 * y1 + a2 * y2;
        x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
        if (y > pmax) pmax = y; if (-y > nmax) nmax = -y;
      }
      freqs.push(f); vals.push(mode === 'Peak positive' ? pmax : mode === 'Peak negative' ? nmax : Math.max(pmax, nmax));
    }
    return { freqs, vals };
  }

  /* ---------- Generator ---------- */
  const GENERATOR_TYPES = ['Sine', 'Cosine', 'Square', 'Triangular', 'Sawtooth', 'Step', 'Constant',
    'White noise', 'Gaussian noise', 'Pink noise', 'Exponential noise', 'Sweep signal'];

  function gaussRand(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function generate(p) {
    const fs = p.sampleRate, n = Math.max(1, Math.round(p.samples || p.seconds * fs)), y = new Float64Array(n);
    const lo = p.minAmp ?? -1, hi = p.maxAmp ?? 1, amp = (hi - lo) / 2, off = (hi + lo) / 2, f = p.frequency || 1;
    const rng = mulberry32(p.seed ?? 12345);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / fs, ph = (f * t) % 1;
      let v;
      switch (p.type) {
        case 'Cosine': v = Math.cos(TAU * f * t); break;
        case 'Square': v = ph < 0.5 ? 1 : -1; break;
        case 'Triangular': v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; break;
        case 'Sawtooth': v = 2 * ph - 1; break;
        case 'Step': v = i < n / 2 ? -1 : 1; break;
        case 'Constant': v = 1; break;
        case 'White noise': v = 2 * rng() - 1; break;
        case 'Gaussian noise': v = Math.max(-1, Math.min(1, gaussRand(rng) / 3)); break;
        case 'Exponential noise': v = Math.min(1, -Math.log(1 - rng()) / 5) * 2 - 1; break;
        case 'Pink noise': { // Paul Kellet's refined filter
          const w = 2 * rng() - 1;
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
          b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
          v = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
          v = Math.max(-1, Math.min(1, v)); break;
        }
        case 'Sweep signal': {
          const f0 = p.sweepStart ?? 10, f1 = p.sweepEnd ?? fs / 4, T = n / fs;
          const fi = p.sweepType === 'Logarithmic' ? f0 * Math.pow(f1 / f0, t / T) : f0 + (f1 - f0) * t / T;
          phase += TAU * fi / fs; v = Math.sin(phase); break;
        }
        default: v = Math.sin(TAU * f * t);
      }
      y[i] = off + amp * v;
    }
    return y;
  }

  /* ---------- Reference-checked FFT ----------
     Reproduces the spectrum of the reference program's FFT window exactly (test/fft_reference.test.js). Window shapes
     and their amplitude (K = 1/coherent gain) and PSD noise-bandwidth (G) constants were measured from its exported
     spectra; the index is the FFT_Window code of .swt / .sws files. */
  const SV_WINDOWS = [
    { name: 'Hann', K: 2, G: 1.5, w: (i, n) => 0.5 - 0.5 * Math.cos(TAU * (i + 1) / (n + 1)) },
    { name: 'Hamming', K: 1 / 0.54, G: 1.3676, w: (i, n) => 0.54 - 0.46 * Math.cos(TAU * i / (n - 1)) },
    { name: 'Blackman', K: 1 / 0.40, G: 1.726757, w: (i, n) => 0.42 - 0.5 * Math.cos(TAU * i / (n - 1)) + 0.08 * Math.cos(2 * TAU * i / (n - 1)) },
    { name: 'Rectangle', K: 1, G: 1, w: () => 1 },
    { name: 'Triangle', K: 2, G: 1.33, w: (i, n) => 1 - Math.abs((i - (n - 1) / 2) / ((n + 1) / 2)) },
    { name: 'Tukey (25%)', K: 1 / 0.88, G: 1.10, w: (i, n) => tukeyAt(i, n, 0.25) },
    { name: 'Tukey (50%)', K: 1 / 0.75, G: 1.22, w: (i, n) => tukeyAt(i, n, 0.5) },
    { name: 'Kaiser (b=2)', K: 1 / 0.785, G: 1.5, w: (i, n) => kaiserAt(i, n, 2) },
    { name: 'Kaiser (b=4)', K: 1 / 0.5975, G: 2.0, w: (i, n) => kaiserAt(i, n, 4) },
    { name: 'Kaiser (b=8)', K: 2.309667, G: 2.5, w: (i, n) => kaiserAt(i, n, 8) },
    { name: 'Flat top', K: 4.8954595, G: 0.1595906, w: (i, n) => { const t = TAU * i / (n - 1); return (1 - 1.93 * Math.cos(t) + 1.29 * Math.cos(2 * t) - 0.388 * Math.cos(3 * t) + 0.028 * Math.cos(4 * t)) / 4.636; } },
    { name: 'Blackman-Harris', K: 1 / 0.36, G: 2.0, w: (i, n) => { const t = TAU * i / (n - 1); return 0.35875 - 0.48829 * Math.cos(t) + 0.14128 * Math.cos(2 * t) - 0.01168 * Math.cos(3 * t); } },
    { name: 'Nuttall', K: 1 / 0.354, G: 1.5, w: (i, n) => { const t = TAU * i / (n - 1); return 0.355768 - 0.487396 * Math.cos(t) + 0.144232 * Math.cos(2 * t) - 0.012604 * Math.cos(3 * t); } },
    { name: 'Gaussian', K: 1 / 0.49, G: 1.39, w: (i, n) => { const s = 0.4 * (n - 1) / 2, t = (i - (n - 1) / 2) / s; return Math.exp(-0.5 * t * t); } },
    { name: 'Exponential (damping)', K: 1, G: 1, w: (i, n) => Math.pow(0.01, i / Math.max(1, n - 1)) }
  ];
  function tukeyAt(i, n, r) { const e = r * (n - 1) / 2, d = Math.min(i, n - 1 - i); return d >= e ? 1 : 0.5 * (1 - Math.cos(Math.PI * d / e)); }
  function kaiserAt(i, n, b) { const t = (i - (n - 1) / 2) / (n / 2); return besselI0(b * Math.sqrt(Math.max(0, 1 - t * t))) / besselI0(b); }
  const SV_PADDING = ['Never', 'Optimal', 'Next power of 2', '2 x Next power of 2', '4 x Next power of 2', '8 x Next power of 2'];
  const SV_TYPES = ['Magnitude', 'Power spectrum', 'Power spectral density (PSD)', 'Phase', 'Real part', 'Imaginary part'];
  const SV_XUNITS = { 'Hz': 1, 'CPM': 60, 'kHz': 1e-3, 'MHz': 1e-6 };
  function isSmooth235(m) { for (const p of [2, 3, 5]) while (m % p === 0) m /= p; return m === 1; }
  function svFftLength(n, padding) {
    switch (padding) {
      case 'Optimal': { let m = n + (n & 1); while (!isSmooth235(m)) m += 2; return m; }  // even, factors 2·3·5 only
      case 'Next power of 2': return nextPow2(n);
      case '2 x Next power of 2': return 2 * nextPow2(n);
      case '4 x Next power of 2': return 4 * nextPow2(n);
      case '8 x Next power of 2': return 8 * nextPow2(n);
      default: return n + (n & 1);                                                       // "Never": rounded up to even
    }
  }
  const defaultSvSettings = () => ({
    mode: 'instant', segmentCount: 10, segmentOverlap: 25, averageComplex: false, liveAverage: 2,
    subtractMean: false, removeTrend: false, removePeaks: false, removePeaksK: 2, applyWindow: true, window: 'Hann', zeroPadding: 'Optimal',
    dB: false, dBFS: false, fullScale: 0, xUnit: 'Hz',
    type: 'Magnitude', customFilter: null, weighting: null, smooth: false, smoothLen: 15, smoothWindow: 'Hann', test: false, testLevel: 5,
    fromFreq: 0, toFreq: 0
  });
  // Older OpenSig spectral settings → the current settings
  function svSettings(s) {
    s = Object.assign({}, s || {});
    if (s.mode == null) s.mode = s.averageSegments ? 'segments' : (s.liveAverage > 1 ? 'last' : 'instant');
    if (s.zeroPadding === 'None') s.zeroPadding = 'Never';
    if (s.applyWindow == null) s.applyWindow = s.window !== 'Rectangle';
    if (typeof s.smooth === 'number') { if (s.smooth > 1) { s.smoothLen = s.smooth; s.smooth = true; } else s.smooth = false; }
    return Object.assign(defaultSvSettings(), s);
  }
  // Hann-weighted moving average (odd length, weights renormalised at the edges) – the spectrum smoothing.
  function svSmooth(y, len) {
    const L = Math.max(1, len % 2 ? len : len + 1), h = L >> 1, wk = new Float64Array(L), out = new Float64Array(y.length);
    for (let k = 0; k < L; k++) wk[k] = Math.pow(Math.sin(Math.PI * (k + 1) / (L + 1)), 2);
    for (let i = 0; i < y.length; i++) {
      let s = 0, ws = 0;
      for (let k = 0; k < L; k++) { const j = i - h + k; if (j >= 0 && j < y.length) { s += y[j] * wk[k]; ws += wk[k]; } }
      out[i] = ws ? s / ws : y[i];
    }
    return out;
  }
  // Siegel's test for periodicities: keep only bins whose normalised periodogram exceeds 0.6 · Fisher's critical value.
  function siegelTest(pow, alpha) {
    const m = pow.length; let sum = 0; for (const v of pow) sum += v;
    const keep = new Uint8Array(m); if (!(alpha > 0) || !sum || m < 2) return keep;
    const t = 0.6 * (1 - Math.pow(alpha / m, 1 / (m - 1)));
    for (let k = 0; k < m; k++) keep[k] = pow[k] / sum > t ? 1 : 0;
    return keep;
  }
  // x: samples, fs: sampling rate, s: settings. Returns {y, x0, dx, nfft, segLen, segments, linPow, df}
  function svSpectrum(x, fs, s, state) {
    s = svSettings(s);
    const N = x.length;
    let y = Float64Array.from(x);
    if (s.removeTrend) y = removeTrend(y);
    if (s.removePeaks) {
      const m = mean(y); let v = 0; for (const a of y) v += (a - m) * (a - m);
      const lim = s.removePeaksK * Math.sqrt(v / Math.max(1, N));
      for (let i = 0; i < N; i++) if (Math.abs(y[i] - m) > lim) y[i] = m;
    }
    const win = s.applyWindow ? (SV_WINDOWS.find(w => w.name === s.window) || SV_WINDOWS[0]) : SV_WINDOWS[3];
    const demean = s.subtractMean || s.applyWindow;
    let L = N, starts = [0];
    if (s.mode === 'segments') {
      const k = Math.max(1, Math.round(s.segmentCount)), ov = Math.min(0.99, Math.max(0, s.segmentOverlap / 100));
      L = Math.max(2, Math.floor(N / (k - (k - 1) * ov)));
      const hop = Math.max(1, Math.floor(L * (1 - ov)));
      starts = []; for (let j = 0; j < k; j++) { const st = j * hop; if (st + L < N) starts.push(st); }  // strict: a segment ending at N is skipped
      if (!starts.length) starts = [0];
    }
    const nfft = svFftLength(L, s.zeroPadding), bins = nfft / 2, w = new Float64Array(L);
    let sw2 = 0; for (let i = 0; i < L; i++) { w[i] = win.w(i, L); sw2 += w[i] * w[i]; }
    const df = fs / nfft, gain = typeof s.gainFn === 'function' ? s.gainFn : null;
    const Ln = L - (L & 1);   // odd lengths are normalised by the even length below them, as in the reference spectra
    const acc = { mag: new Float64Array(bins), pow: new Float64Array(bins), psd: new Float64Array(bins), re: new Float64Array(bins), im: new Float64Array(bins), ph: new Float64Array(bins),
      cre: new Float64Array(bins), cim: new Float64Array(bins), pre: new Float64Array(bins), pim: new Float64Array(bins), bp: new Float64Array(bins) };
    const needPhase = s.type === 'Phase';
    for (const st of starts) {
      const seg = y.subarray(st, st + L), m = demean ? mean(seg) : 0;
      const re = new Float64Array(nfft), im = new Float64Array(nfft);
      for (let i = 0; i < L; i++) re[i] = (seg[i] - m) * w[i];
      fft(re, im, false);
      let pr = null, pi = null;
      if (needPhase) { pr = new Float64Array(nfft); pi = new Float64Array(nfft); for (let i = 0; i < L; i++) pr[i] = seg[i] - m; fft(pr, pi, false); }
      for (let k = 1; k <= bins; k++) {
        const a2 = re[k] * re[k] + im[k] * im[k], mg = 2 * Math.sqrt(a2) / Ln * win.K;
        acc.mag[k - 1] += mg; acc.pow[k - 1] += mg * mg; acc.psd[k - 1] += 8 * a2 / (Ln * fs * win.G);
        acc.re[k - 1] += re[k] / Ln; acc.im[k - 1] += im[k] / Ln; acc.cre[k - 1] += re[k]; acc.cim[k - 1] += im[k];
        acc.bp[k - 1] += 2 * a2 / (nfft * sw2);   // per-bin power, noise-bandwidth corrected: sums give band power
        if (needPhase) { acc.ph[k - 1] += Math.atan2(pi[k], pr[k]) * 180 / Math.PI; acc.pre[k - 1] += pr[k]; acc.pim[k - 1] += pi[k]; }
      }
    }
    const nS = starts.length, out = new Float64Array(bins);
    for (let k = 0; k < bins; k++) {
      let v;
      if (s.averageComplex && s.mode === 'segments') {
        const cr = acc.cre[k] / nS, ci = acc.cim[k] / nS, a2 = cr * cr + ci * ci, mg = 2 * Math.sqrt(a2) / Ln * win.K;
        v = { 'Magnitude': mg, 'Power spectrum': mg * mg, 'Power spectral density (PSD)': 8 * a2 / (Ln * fs * win.G), 'Real part': cr / Ln, 'Imaginary part': ci / Ln,
          'Phase': Math.atan2(acc.pim[k], acc.pre[k]) * 180 / Math.PI }[s.type];
      } else v = { 'Magnitude': acc.mag[k], 'Power spectrum': acc.pow[k], 'Power spectral density (PSD)': acc.psd[k], 'Real part': acc.re[k], 'Imaginary part': acc.im[k], 'Phase': acc.ph[k] }[s.type] / nS;
      if (gain && (s.type === 'Magnitude' || s.type === 'Power spectrum' || s.type.startsWith('Power spectral'))) { const g = gain((k + 1) * df); v *= s.type === 'Magnitude' ? g : g * g; }
      out[k] = v;
    }
    const linPow = Float64Array.from(acc.pow, v => v / nS);
    // "Average last X spectra": average over consecutive updates; nothing is shown until X spectra were collected
    let yv = out;
    if (s.mode === 'last' && state) {
      const X = Math.max(1, Math.round(s.liveAverage));
      state.buf = (state.buf || []).filter(b => b.length === bins); state.buf.push(Float64Array.from(out)); while (state.buf.length > X) state.buf.shift();
      yv = new Float64Array(bins);
      if (state.buf.length >= X) for (const b of state.buf) for (let k = 0; k < bins; k++) yv[k] += b[k] / X;
    }
    if (s.test && s.type !== 'Phase') {
      // Siegel/Fisher test on the amplitude spectrum: level 0 → nothing passes, 1–4 → 99 %, ≥5 → 95 % confidence
      const lv = Number(s.testLevel), alpha = lv <= 0 ? 0 : lv < 5 ? 0.01 : 0.05;
      const a = s.type === 'Magnitude' || s.type === 'Real part' || s.type === 'Imaginary part' ? yv.map(Math.abs) : yv.map(v => Math.sqrt(Math.max(0, v)));
      const keep = siegelTest(a, alpha); yv = yv.map((v, k) => keep[k] ? v : 0);
    }
    const logType = s.type === 'Magnitude' || s.type === 'Power spectrum' || s.type.startsWith('Power spectral');
    if (s.dB && logType) {
      const amp = s.type === 'Magnitude';
      yv = yv.map(v => (amp ? 20 : 10) * Math.log10(Math.max(v, 1e-300)));
      if (s.dBFS) {
        let ref;
        if (s.fullScale > 0) ref = 20 * Math.log10(s.fullScale);
        else { ref = -Infinity; for (const v of yv) if (v > ref) ref = v; }
        yv = yv.map(v => v - ref);
      }
    }
    if (s.smooth && s.smoothLen > 1) yv = svSmooth(yv, s.smoothLen);
    const xs = SV_XUNITS[s.xUnit] || 1;
    return { y: yv, x0: df * xs, dx: df * xs, df, nfft, segLen: L, segments: nS, linPow, bandPow: Float64Array.from(acc.bp, v => v / nS), xUnit: s.xUnit || 'Hz' };
  }

  // FFT_* parameters (from .sws/.swt files) ↔ OpenSig settings
  const SV_SHOW = { 0: 'Real part', 1: 'Imaginary part', 2: 'Magnitude', 4: 'Phase', 6: 'Power spectral density (PSD)', 7: 'Power spectrum' };
  function svFromIni(kv) {
    const n = k => Number(kv[k]), s = defaultSvSettings();
    if ('FFT_Show' in kv) s.type = SV_SHOW[n('FFT_Show')] || (n('FFT_Show') === 3 || n('FFT_Show') === 5 ? 'Magnitude' : 'Magnitude');
    if (n('FFT_Show') === 3 || n('FFT_Show') === 5) s.dB = true;
    if ('FFT_dBScale' in kv) s.dB = s.dB || n('FFT_dBScale') === 1;
    if ('FFT_dBFS' in kv) s.dBFS = n('FFT_dBFS') === 1;
    if ('FFT_FullScaleVal' in kv) s.fullScale = n('FFT_FullScaleVal');
    if ('FFT_Type' in kv) s.mode = { 0: 'instant', 1: 'last', 2: 'segments' }[n('FFT_Type')] || 'instant';
    if ('FFT_Average' in kv) s.liveAverage = n('FFT_Average');
    if ('FFT_AverageSegmentCount' in kv) s.segmentCount = n('FFT_AverageSegmentCount');
    if ('FFT_AverageSegmentOverlap' in kv) s.segmentOverlap = n('FFT_AverageSegmentOverlap');
    if ('FFT_AverageComplex' in kv) s.averageComplex = n('FFT_AverageComplex') === 1;
    if ('FFT_DoNormalize' in kv) s.subtractMean = n('FFT_DoNormalize') === 1;
    if ('FFT_DoRemoveLinTrend' in kv) s.removeTrend = n('FFT_DoRemoveLinTrend') === 1;
    if ('FFT_DoRemovePeaks' in kv) s.removePeaks = n('FFT_DoRemovePeaks') === 1;
    if ('FFT_RemovePeaksVal' in kv) s.removePeaksK = n('FFT_RemovePeaksVal');
    if ('FFT_DoTaper' in kv) s.applyWindow = n('FFT_DoTaper') === 1;
    if ('FFT_Window' in kv) s.window = (SV_WINDOWS[n('FFT_Window')] || SV_WINDOWS[0]).name;
    if ('FFT_ExpandWithZerosVal' in kv) {
      const z = n('FFT_DoExpandWithZeros'), v = n('FFT_ExpandWithZerosVal');
      s.zeroPadding = z === 0 ? 'Next power of 2' : z === 1 && v < 3 ? ['2 x Next power of 2', '4 x Next power of 2', '8 x Next power of 2'][v] : (v <= 3 ? 'Never' : SV_PADDING[Math.min(5, v - 3)]);
    }
    if ('FFT_DoSmooth' in kv) s.smooth = n('FFT_DoSmooth') === 1;
    if ('FFT_SmoothLen' in kv) s.smoothLen = n('FFT_SmoothLen');
    if ('FFT_DoTestPeaks' in kv) s.test = n('FFT_DoTestPeaks') === 1;
    if ('FFT_TestPeaksLevel' in kv) s.testLevel = n('FFT_TestPeaksLevel');
    if ('FFT_XScale' in kv) s.xUnit = ['Hz', 'CPM', 'kHz', 'MHz'][n('FFT_XScale')] || 'Hz';
    if (kv.FFT_CustomFilter && kv.FFT_CustomFilter !== '_None_') s.customFilter = String(kv.FFT_CustomFilter).replace(/\.flt$/i, '');
    return s;
  }
  function svToIni(s) {
    s = svSettings(s);
    const show = Number(Object.keys(SV_SHOW).find(k => SV_SHOW[k] === s.type) ?? 2);
    return { FFT_Show: show, FFT_dBScale: s.dB ? 1 : 0, FFT_dBFS: s.dBFS ? 1 : 0, FFT_FullScaleVal: s.fullScale, FFT_Type: { instant: 0, last: 1, segments: 2 }[s.mode],
      FFT_Average: s.liveAverage, FFT_AverageSegmentCount: s.segmentCount, FFT_AverageSegmentOverlap: s.segmentOverlap, FFT_AverageComplex: s.averageComplex ? 1 : 0,
      FFT_DoNormalize: s.subtractMean ? 1 : 0, FFT_DoRemoveLinTrend: s.removeTrend ? 1 : 0, FFT_DoRemovePeaks: s.removePeaks ? 1 : 0, FFT_RemovePeaksVal: s.removePeaksK,
      FFT_DoTaper: s.applyWindow ? 1 : 0, FFT_Window: Math.max(0, SV_WINDOWS.findIndex(w => w.name === s.window)), FFT_DoExpandWithZeros: 2, FFT_ExpandWithZerosVal: 3 + Math.max(0, SV_PADDING.indexOf(s.zeroPadding)),
      FFT_DoSmooth: s.smooth ? 1 : 0, FFT_SmoothLen: s.smoothLen, FFT_SmoothWindow: 0, FFT_DoTestPeaks: s.test ? 1 : 0, FFT_TestPeaksLevel: s.testLevel,
      FFT_XScale: Math.max(0, ['Hz', 'CPM', 'kHz', 'MHz'].indexOf(s.xUnit)), FFT_CustomFilter: s.customFilter ? s.customFilter + '.flt' : '_None_', FFT_TaperVal: 20 };
  }

  /* ---------- Cepstrum ---------- */
  // Real cepstrum: inverse FFT of the log magnitude spectrum. Returns first half (quefrency 0 … N/2 · dt).
  function cepstrum(x, fs) {
    const n = x.length, w = makeWindow('Hann', n), xm = removeMean(x);
    for (let i = 0; i < n; i++) xm[i] *= w[i];
    const { re, im } = rfft(xm, n);
    for (let k = 0; k < n; k++) { re[k] = Math.log(Math.max(Math.hypot(re[k], im[k]), 1e-12)); im[k] = 0; }
    fft(re, im, true);
    const out = new Float64Array(Math.floor(n / 2));
    for (let i = 0; i < out.length; i++) out[i] = re[i] / n;
    return out;
  }

  /* ---------- Continuous wavelet transform (analytic Morlet) ---------- */
  // Linear frequency grid fMin…fMax (nFreq values); returns spectrogram-like {rows:[{t,v}], df, f0, bins} in dB.
  function cwt(x, fs, fMin, fMax, nFreq, w0, maxCols) {
    w0 = w0 || 6; nFreq = Math.max(2, nFreq || 96); maxCols = maxCols || 1200;
    const n = x.length, N = nextPow2(n), xr = new Float64Array(N), xi = new Float64Array(N), m = mean(x);
    for (let i = 0; i < n; i++) xr[i] = x[i] - m;
    fft(xr, xi, false);
    const df = (fMax - fMin) / (nFreq - 1), step = Math.max(1, Math.floor(n / maxCols)), cols = Math.ceil(n / step);
    const rows = Array.from({ length: cols }, (_, c) => ({ t: c * step / fs, v: new Float32Array(nFreq) }));
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let j = 0; j < nFreq; j++) {
      const f = Math.max(1e-9, fMin + j * df), s = w0 / (TAU * f);
      re.fill(0); im.fill(0);
      for (let k = 1; k < N / 2; k++) {
        const om = TAU * k * fs / N, g = 2 * Math.exp(-0.5 * (s * om - w0) * (s * om - w0));
        if (g < 1e-12) continue;
        re[k] = xr[k] * g; im[k] = xi[k] * g;
      }
      fft(re, im, true);
      for (let c = 0; c < cols; c++) {
        const i = c * step, a = Math.hypot(re[i], im[i]) / N;
        rows[c].v[j] = 20 * Math.log10(Math.max(a, 1e-12));
      }
    }
    return { rows, df, f0: fMin, bins: nFreq, segLen: 0, hop: step, dt: step / fs };
  }

  /* ---------- Discrete wavelet transform & denoising ---------- */
  const WAVELETS = {
    Haar: [0.7071067811865476, 0.7071067811865476],
    Daubechies2: [-0.12940952255092145, 0.22414386804185735, 0.836516303737469, 0.48296291314469025],
    Daubechies4: [-0.010597401784997278, 0.032883011666982945, 0.030841381835986965, -0.18703481171888114,
      -0.02798376941698385, 0.6308807679295904, 0.7148465705525415, 0.23037781330885523],
    Daubechies6: [-0.00107730108499558, 0.004777257511010651, 0.0005538422009938016, -0.031582039318031156,
      0.02752286553001629, 0.09750160558707936, -0.12976686756709563, -0.22626469396516913,
      0.3152503517092432, 0.7511339080215775, 0.4946238903983854, 0.11154074335008017]
  };
  function waveletFilters(name) {
    const lo = WAVELETS[name] || WAVELETS.Daubechies4, L = lo.length;
    const hi = lo.map((_, k) => (k % 2 ? -1 : 1) * lo[L - 1 - k]);
    return { lo, hi };
  }
  // Orthonormal periodized DWT. x length must be divisible by 2^levels. Returns {a, details:[d1 (finest) … dL]}.
  function dwt(x, name, levels) {
    const { lo, hi } = waveletFilters(name), details = [];
    let a = Float64Array.from(x);
    for (let l = 0; l < levels; l++) {
      const N = a.length, h = N / 2, na = new Float64Array(h), nd = new Float64Array(h);
      for (let i = 0; i < h; i++) {
        let s = 0, d = 0;
        for (let k = 0; k < lo.length; k++) { const v = a[(2 * i + k) % N]; s += lo[k] * v; d += hi[k] * v; }
        na[i] = s; nd[i] = d;
      }
      details.push(nd); a = na;
    }
    return { a, details };
  }
  function idwt(a, details, name) {
    const { lo, hi } = waveletFilters(name);
    let cur = Float64Array.from(a);
    for (let l = details.length - 1; l >= 0; l--) {
      const d = details[l], h = cur.length, N = 2 * h, out = new Float64Array(N);
      for (let i = 0; i < h; i++) for (let k = 0; k < lo.length; k++) out[(2 * i + k) % N] += lo[k] * cur[i] + hi[k] * d[i];
      cur = out;
    }
    return cur;
  }
  function median(arr) { const s = Float64Array.from(arr).sort(); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }
  // rule: 'Universal' | 'Robust' (median-based, per level) | 'Fixed3Sigma'; mode: 'Soft' | 'Hard'
  function waveletDenoise(x, name, levels, rule, mode) {
    const n = x.length, maxL = Math.max(1, Math.floor(Math.log2(Math.max(2, n))) - 2);
    levels = Math.max(1, Math.min(levels || 5, maxL));
    const block = 1 << levels, N = Math.ceil(n / block) * block, padded = new Float64Array(N);
    for (let i = 0; i < N; i++) { let j = i; if (j >= n) j = Math.max(0, 2 * n - 2 - j); padded[i] = x[Math.min(n - 1, j)]; }
    const { a, details } = dwt(padded, name, levels);
    const sigma = median(details[0].map(Math.abs)) / 0.6745;
    for (const d of details) {
      const s = rule === 'Robust' ? median(d.map(Math.abs)) / 0.6745 : sigma;
      const thr = rule === 'Fixed3Sigma' ? 3 * s : s * Math.sqrt(2 * Math.log(N));
      for (let i = 0; i < d.length; i++) {
        const v = d[i];
        d[i] = mode === 'Hard' ? (Math.abs(v) > thr ? v : 0) : Math.sign(v) * Math.max(0, Math.abs(v) - thr);
      }
    }
    return { y: idwt(a, details, name).subarray(0, n), sigma, levels };
  }

  /* ---------- Envelopes, crossings, tacho, delay ---------- */
  function linInterpGrid(xs, ys, n, x0, dx) {
    const out = new Float64Array(n);
    if (!xs.length) return out;
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = x0 + i * dx;
      while (j < xs.length - 2 && xs[j + 1] < t) j++;
      if (xs.length === 1) { out[i] = ys[0]; continue; }
      const a = xs[j], b = xs[j + 1], f = b > a ? (t - a) / (b - a) : 0;
      out[i] = ys[j] + (ys[j + 1] - ys[j]) * f; // linear extrapolation at the ends
    }
    return out;
  }
  function envelopeLocalMax(x) {
    const xs = [], ys = [];
    for (let i = 1; i < x.length - 1; i++) if (x[i] > x[i - 1] && x[i] >= x[i + 1]) { xs.push(i); ys.push(x[i]); }
    if (xs.length < 2) return Float64Array.from(x);
    return linInterpGrid(xs, ys, x.length, 0, 1);
  }
  function zeroCrossings(x) {
    const n = x.length, out = new Float64Array(n), eps = 1e-12, sg = v => v > eps ? 1 : v < -eps ? -1 : 0;
    let prev = sg(x[0]), count = 0;
    for (let i = 1; i < n; i++) {
      const c = sg(x[i]); if (!c) continue;
      if (!prev) { prev = c; continue; }
      if (c !== prev) { out[i] = 1; count++; prev = c; }
    }
    return { y: out, count };
  }
  // Rising crossings of the mean-removed tacho signal → rotational speed on the input's time grid.
  function tachoToRpm(x, fs, rotationsPerPulse, asRpm) {
    const xm = removeMean(x), pos = [];
    for (let i = 0; i < xm.length - 1; i++) if (xm[i] <= 0 && xm[i + 1] > 0) pos.push((i + xm[i] / (xm[i] - xm[i + 1])) / fs);
    if (pos.length < 5) throw new Error('At least 5 pulses are needed in the input signal to calculate the RPM signal.');
    const xs = [], ys = [];
    for (let i = 0; i < pos.length - 1; i++) { xs.push((pos[i] + pos[i + 1]) / 2); ys.push(1 / ((pos[i + 1] - pos[i]) / (rotationsPerPulse || 1))); }
    const f = linInterpGrid(xs, ys, x.length, 0, 1 / fs);
    if (asRpm !== false) for (let i = 0; i < f.length; i++) f[i] *= 60;
    return f;
  }
  // Delay (samples) of b relative to a; positive when b lags a.
  function findDelay(a, b) {
    const r = crossCorrelation(a, b), n = Math.min(a.length, b.length);
    let best = 0; for (let i = 1; i < r.length; i++) if (r[i] > r[best]) best = i;
    return (n - 1) - best;
  }
  function shiftSignal(x, d) {
    const out = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) { const j = i + d; out[i] = j >= 0 && j < x.length ? x[j] : 0; }
    return out;
  }

  /* ---------- Complexity measures ---------- */
  function shannonEntropy(x) {
    const n = x.length; if (!n) return 0;
    const bins = Math.max(10, Math.ceil(1 + 3.322 * Math.log10(n)));
    let lo = Infinity, hi = -Infinity; for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi === lo) return 0;
    const c = new Float64Array(bins), w = (hi - lo) / bins;
    for (const v of x) c[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
    let H = 0; for (const k of c) if (k) { const p = k / n; H -= p * Math.log2(p); }
    return H;
  }
  // Higuchi fractal dimension.
  function higuchiFD(x, kmax) {
    const n = x.length; kmax = Math.max(2, Math.min(kmax || 10, Math.floor(n / 4)));
    const lx = [], ly = [];
    for (let k = 1; k <= kmax; k++) {
      let Lk = 0, cnt = 0;
      for (let m = 0; m < k; m++) {
        const nm = Math.floor((n - m - 1) / k); if (nm < 1) continue;
        let s = 0; for (let i = 1; i <= nm; i++) s += Math.abs(x[m + i * k] - x[m + (i - 1) * k]);
        Lk += s * (n - 1) / (nm * k) / k; cnt++;
      }
      if (cnt && Lk > 0) { lx.push(Math.log(1 / k)); ly.push(Math.log(Lk / cnt)); }
    }
    const mx = mean(lx), my = mean(ly); let sxy = 0, sxx = 0;
    for (let i = 0; i < lx.length; i++) { sxy += (lx[i] - mx) * (ly[i] - my); sxx += (lx[i] - mx) ** 2; }
    return sxx ? sxy / sxx : 1;
  }
  // Half-power bandwidth damping estimate from a linear amplitude spectrum.
  function dampingFromSpectrum(y, df, f0) {
    f0 = f0 || 0;
    let p = 0; for (let i = 1; i < y.length; i++) if (y[i] > y[p]) p = i;
    const peak = y[p], level = peak * Math.SQRT1_2, fAt = i => f0 + i * df;
    let left = null, right = null;
    for (let i = p - 1; i >= 0; i--) if (y[i] < level) { left = fAt(i) + (level - y[i]) / (y[i + 1] - y[i]) * df; break; }
    for (let i = p + 1; i < y.length; i++) if (y[i] < level) { right = fAt(i - 1) + (y[i - 1] - level) / (y[i - 1] - y[i]) * df; break; }
    const fp = fAt(interpPeak(y, p).pos);
    if (left == null || right == null) return { peak, fPeak: fp, level, bandwidth: NaN, zeta: NaN, Q: NaN };
    const bw = right - left;
    return { peak, fPeak: fp, level, left, right, bandwidth: bw, zeta: bw / (2 * fp), Q: fp / bw };
  }
  /* ---------- Order analysis ---------- */
  // Resample x (time domain, rate fs) to the angle domain using a speed signal in RPM on the same grid.
  function toOrderDomain(x, fs, rpm, samplesPerRev) {
    const n = Math.min(x.length, rpm.length), theta = new Float64Array(n);
    for (let i = 1; i < n; i++) theta[i] = theta[i - 1] + (Math.max(0, rpm[i - 1]) + Math.max(0, rpm[i])) / 2 / 60 / fs;
    const revs = theta[n - 1], m = Math.floor(revs * samplesPerRev);
    if (m < 4) throw new Error('Too few revolutions in the speed signal for order resampling');
    const out = new Float64Array(m); let j = 0;
    for (let k = 0; k < m; k++) {
      const th = k / samplesPerRev;
      while (j < n - 2 && theta[j + 1] < th) j++;
      const a = theta[j], b = theta[j + 1], f = b > a ? (th - a) / (b - a) : 0;
      out[k] = x[j] + (x[j + 1] - x[j]) * f;
    }
    return out;
  }
  function fromOrderDomain(xo, samplesPerRev, fs, rpm) {
    const n = rpm.length, out = new Float64Array(n); let theta = 0;
    for (let i = 0; i < n; i++) {
      if (i) theta += (Math.max(0, rpm[i - 1]) + Math.max(0, rpm[i])) / 2 / 60 / fs;
      const p = theta * samplesPerRev, k = Math.floor(p), f = p - k;
      out[i] = k + 1 < xo.length ? xo[k] + (xo[k + 1] - xo[k]) * f : 0;
    }
    return out;
  }

  /* ---------- Complex spectrum helpers for the calculator ---------- */
  function complexSpectrum(x) {
    const n = x.length, { re, im } = rfft(x, n), bins = Math.floor(n / 2) + 1;
    return { re: re.slice(0, bins), im: im.slice(0, bins), n };
  }
  function inverseSpectrum(re, im, n) {
    const bins = re.length; n = n || 2 * (bins - 1);
    const R = new Float64Array(n), I = new Float64Array(n);
    for (let k = 0; k < bins && k < n; k++) { R[k] = re[k]; I[k] = im ? im[k] : 0; if (k > 0 && n - k > k) { R[n - k] = re[k]; I[n - k] = -(im ? im[k] : 0); } }
    fft(R, I, true);
    return R.map(v => v / n);
  }

  const DSP = { SV_WINDOWS, SV_PADDING, SV_TYPES, SV_XUNITS, svFftLength, defaultSvSettings, svSettings, svSmooth, siegelTest, svSpectrum, svFromIni, svToIni,
    cepstrum, cwt, WAVELETS, dwt, idwt, waveletDenoise, median, linInterpGrid, envelopeLocalMax, zeroCrossings, tachoToRpm,
    findDelay, shiftSignal, shannonEntropy, higuchiFD, dampingFromSpectrum, toOrderDomain, fromOrderDomain,
    complexSpectrum, inverseSpectrum, TAU, isPow2, nextPow2, fft, rfft, ifftReal, WINDOWS, makeWindow, mean, removeMean, removeTrend,
    SPECTRUM_TYPES, ZERO_PADDING, defaultSpectrumSettings, spectrum, spectrogram, smoothArray,
    fftFilter, iirFilter, butterworthSections, movingAverage, autocorrelation, crossCorrelation, convolution, crossSpectral,
    hilbertEnvelope, instantaneousFrequency, resample, removePeaks, integral, differentiate, histogram, scale,
    octaveBands, aWeightDb, cWeightDb, stats, quantile, interpPeak, zeroCrossingRate, harmonicAnalysis,
    spectralMeasures, weightedLevel, defaultPeakSettings, svPeaks, peakDistance, srs, GENERATOR_TYPES, generate,
    PEAK_METHODS, localMaxima, findPeaks, peakProminences, peakWidths, topPeaks, slopePeaks, zscorePeaks, ricker, cwtPeaks, peakWidthsRange,
    refinePeak, detectPeaks, defaultPeakSettingsAll, selectQuantile };

  if (typeof module !== 'undefined' && module.exports) module.exports = DSP; else root.DSP = DSP;
})(typeof window !== 'undefined' ? window : globalThis);
