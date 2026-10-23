// Conformance of DSP.svPeaks with the reference program's peak detector. The fixture holds the Peak count and Average peak
// distance that the reference program reported for 188 signals: thresholds, widths, multiple peaks, negative peaks, plateaus, ties,
// zoomed views and signal edges.
const test = require('node:test');
const assert = require('node:assert/strict');
const DSP = require('../js/dsp.js');
const ref = require('./fixtures/peaks_reference.json');

// The same test signals the reference WAV files contained (32-bit float)
function signal(sig) {
  const n = sig.n, out = new Float32Array(n), T = 2 * Math.PI;
  const lcg = seed => () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
  if (sig.kind === 'list') out.set(sig.y);
  else if (sig.kind === 'noise') { const r = lcg(sig.seed); for (let i = 0; i < n; i++) out[i] = r() - 0.5; }
  else if (sig.kind === 'noisetone') { const r = lcg(sig.seed); for (let i = 0; i < n; i++) out[i] = 0.6 * Math.sin(T * sig.f * i / n) + 0.4 * (r() - 0.5); }
  else if (sig.kind === 'steps') { const r = lcg(sig.seed); for (let i = 0; i < n; i++) out[i] = Math.floor(r() * 8) / 4 - 1; }
  else throw new Error(sig.kind);
  return out;
}

for (const c of ref.cases) {
  // The reference program reads past the end of the signal when its last sample starts a peak, so it reports either result there
  test(`reference peaks: ${c.name}`, { skip: c.flaky && 'the reference result depends on memory after the last sample' }, () => {
    const y = signal(c.sig), fs = c.fs || 1000;
    // The reference program ignores a non-integer PeakDetect_MinPeakWidth in a workspace file (uses 1 sample)
    const width = Number.isInteger(c.width) ? c.width : 1;
    const [z0, z1] = c.zoom || [0, y.length - 1];
    const idx = DSP.svPeaks(y, { pos: c.pos, neg: c.neg || 0, width, multiple: !!c.multi, negative: !!c.negative }, z0, z1);
    assert.equal(idx.length, c.count, 'peak count');
    const dist = DSP.peakDistance(idx.map(i => i / fs));
    assert.ok(Math.abs(dist - c.dist) <= 1e-6 * Math.max(1, Math.abs(c.dist)) + 1e-9, `average peak distance ${dist} vs ${c.dist}`);
  });
}

test('default thresholds are 75 % and 25 % of the signal range (reference dialog)', () => {
  const y = Float64Array.from({ length: 1000 }, (_, i) => i / 100 - 2);
  const s = DSP.defaultPeakSettings(y);
  assert.ok(Math.abs(s.pos - 5.4925) < 1e-9 && Math.abs(s.neg - 0.4975) < 1e-9);
  assert.equal(s.width, 1);
});
