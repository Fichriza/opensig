// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const DSP = require('../js/dsp.js');
const CM = require('../js/cablemath.js');

// the app's chain: a PSD window in dB, its peak detection (prominence 8 dB, positions between lines), the modes numbered
function modesOf(y, fs, o, nseg = 16) {
  const sp = DSP.svSpectrum(y, fs, { mode: 'segments', segmentCount: nseg, segmentOverlap: 50, window: 'Hann', type: 'Power spectral density (PSD)', zeroPadding: '2 x Next power of 2', dB: true });
  const s = Object.assign(DSP.defaultPeakSettingsAll(sp.y), { on: true, method: 'prominence', prom: 8, distance: 1, refine: 'parabolic' });
  const peaks = DSP.detectPeaks(sp.y, s).idx.map(i => ({ f: sp.x0 + DSP.refinePeak(sp.y, i, 'parabolic').pos * sp.dx }));
  return CM.assignModes(peaks, { db: sp.y, f0: sp.x0, df: sp.dx }, o);
}
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg || ''} expected ${b} ± ${rel * 100} %, got ${a}`);
// a stay cable: 80 m, 60 kg/m, 37 strands of 150 mm² (E = 195 GPa), EI of the separate strands
const stay = { L: 80, m: 60, EI: 195e9 * 37 * Math.PI * 0.0157 ** 4 / 64, EA: 195e9 * 37 * 150e-6, theta: 30 * Math.PI / 180 };
// a short arch hanger: bending stiffness matters (ξ ≈ 24)
const hanger = { L: 12, m: 25, EI: 1.5e5, EA: 195e9 * 2e-3, theta: Math.PI / 2 };

test('string and hinged-beam formulas invert each other', () => {
  for (const n of [1, 2, 5]) {
    near(CM.stringTension(CM.stringFrequency(3e6, n, stay), n, stay), 3e6, 1e-12);
    near(CM.hingedTension(CM.hingedFrequency(6e5, n, hanger), n, hanger), 6e5, 1e-12);
  }
  near(CM.stringFrequency(3e6, 1, stay), Math.sqrt(3e6 / 60) / 160, 1e-12, 'f1 = √(T/m) / 2L');
});

test('clamped beam: the beam roots without tension and the string limit with it', () => {
  const c = { L: 10, m: 20, EI: 4e5 };
  // no tension: β₁L = 4.730041, β₂L = 7.853205 (clamped–clamped beam)
  for (const [n, bl] of [[1, 4.730040745], [2, 7.853204624]]) near(CM.fixedFrequency(0, n, c), bl * bl / (2 * Math.PI * 100) * Math.sqrt(4e5 / 20), 1e-8, 'mode ' + n);
  // high tension: f_n ≈ f_n,string · (1 + 2/ξ + (4 + n²π²/2)/ξ²)
  const T = 4e5 * (500 / 10) ** 2, xi = 500;
  for (const n of [1, 3]) near(CM.fixedFrequency(T, n, c), CM.stringFrequency(T, n, c) * (1 + 2 / xi + (4 + n * n * Math.PI ** 2 / 2) / xi ** 2), 5e-6, 'mode ' + n); // the next term is O(ξ⁻³)
  // and back
  for (const n of [1, 2, 6]) near(CM.fixedTension(CM.fixedFrequency(6e5, n, hanger), n, hanger), 6e5, 1e-9, 'mode ' + n);
  assert.ok(Number.isNaN(CM.fixedTension(0.5 * CM.fixedFrequency(0, 1, hanger), 1, hanger)), 'below the bending frequency: no tension');
});

test('fit over n² gives tension and bending stiffness', () => {
  const modes = [1, 2, 3, 4, 5, 6].map(n => ({ n, f: CM.hingedFrequency(6e5, n, hanger) }));
  const r = CM.fitTension(modes, hanger);
  near(r.T, 6e5, 1e-9); near(r.EI, hanger.EI, 1e-9); near(r.r2, 1, 1e-12);
  assert.ok(Number.isNaN(CM.fitTension(modes.slice(0, 1), hanger).T), 'one mode is not enough');
});

test('Zui et al.: close to the exact clamped beam where sag is small', () => {
  const c = { L: 30, m: 40, EI: 2e5, EA: 2e9, theta: Math.PI / 2 }; // vertical: no sag, as in the exact beam
  for (const [xi, tol, key] of [[150, 0.005, '1a'], [25, 0.01, '1a'], [10, 0.03, '1b'], [4, 0.05, '1c']]) {
    const T = c.EI * (xi / c.L) ** 2, r = CM.zui(CM.fixedFrequency(T, 1, c), CM.fixedFrequency(T, 2, c), c);
    assert.equal(r.key, key, 'formula for ξ = ' + xi); near(r.T, T, tol, 'ξ = ' + xi);
  }
  // second-mode formulas on their own
  for (const [xi, tol, key] of [[100, 0.005, '2a'], [30, 0.01, '2b'], [10, 0.05, '2c']]) {
    const T = c.EI * (xi / c.L) ** 2, r = CM.zui(0, CM.fixedFrequency(T, 2, c), c);
    assert.equal(r.key, key, 'formula for ξ = ' + xi); near(r.T, T, tol, 'ξ = ' + xi);
  }
  // a long, slack, horizontal cable: Γ < 3, so the second mode is used
  const slack = { L: 300, m: 80, EI: 1e5, EA: 2e9, theta: 0 }, T = 2e6;
  const r = CM.zui(CM.stringFrequency(T, 1, slack) * 1.05, CM.stringFrequency(T, 2, slack), slack);
  assert.ok(r.gamma < 3 && r.mode === 2, 'Γ = ' + r.gamma); near(r.T, T, 0.01);
  const p = CM.parameters(T, slack); assert.ok(p.lambda2 > 0.5 && p.sag > 0.01, JSON.stringify(p));
});

test('the harmonic series among the detected peaks of a simulated stay cable gives its tension', () => {
  const T = 3e6, fs = 50, y = CM.simulate({ c: stay, T, bc: 'fixed', fs, seconds: 600, modes: 14, x: 0.045, rms: 0.03, noise: 0.002, extra: [{ f: 0.62, rms: 0.02 }] });
  const r = modesOf(y, fs, { fMin: 0.3, fMax: 20, maxModes: 10, bOf: f => Math.PI ** 2 * stay.EI / (4 * stay.m * stay.L ** 4 * f * f) }, 8);
  assert.ok(r.peaks.some(q => Math.abs(q.f - 0.62) < 0.01), 'the deck mode is detected …');
  assert.ok(!r.modes.some(m => Math.abs(m.f - 0.62) < 0.05), '… but is no cable mode');
  assert.equal(r.modes.length, 10);
  const out = CM.outliers(r.modes), used = r.modes.filter((m, k) => !m.weak && !out[k]);
  assert.equal(used.length, 10, 'every mode found and used');
  used.forEach(m => near(m.f, CM.fixedFrequency(T, m.n, stay), 0.003, 'mode ' + m.n));
  const Ts = used.map(m => CM.fixedTension(m.f, m.n, stay));
  near(Ts.reduce((s, v) => s + v, 0) / Ts.length, T, 0.005, 'mean tension');
  near(CM.fitTension(used, stay).T, T, 0.01, 'fitted tension');
});

test('a short hanger: bending stiffness is found, the string formula overestimates', () => {
  const T = 6e5, fs = 400, y = CM.simulate({ c: hanger, T, bc: 'fixed', fs, seconds: 300, modes: 8, x: 0.11, rms: 0.05, noise: 0.002 });
  const r = modesOf(y, fs, { fMin: 1, fMax: 150, maxModes: 6 }); // no EI: the inharmonicity is searched
  assert.equal(r.modes.length, 6);
  r.modes.forEach(m => near(m.f, CM.fixedFrequency(T, m.n, hanger), 0.003, 'mode ' + m.n));
  const fixed = r.modes.map(m => CM.fixedTension(m.f, m.n, hanger)), string = r.modes.map(m => CM.stringTension(m.f, m.n, hanger));
  fixed.forEach((v, k) => near(v, T, 0.01, 'fixed, mode ' + (k + 1)));
  assert.ok(string[0] > 1.05 * T && string[5] > 1.3 * T, 'the string formula ignores the bending stiffness');
});
