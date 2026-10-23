"""Reference results for OpenSig's prominence and wavelet peak detectors (DSP.findPeaks, DSP.cwtPeaks).

Writes peaks_scipy.json next to this file: test signals and what scipy.signal.find_peaks / find_peaks_cwt return
for them. Run with SciPy >= 1.10:  python make_peaks_scipy.py
"""
import json, os
import numpy as np
import scipy
from scipy.signal import find_peaks, find_peaks_cwt

rng = np.random.RandomState(20261018)
n = np.arange(1000)
signals = {
    # bumps of different widths and heights on noise
    'bumps': sum(a * np.exp(-0.5 * ((n - c) / w) ** 2) for a, c, w in [(1, 120, 6), (0.6, 300, 15), (1.4, 480, 3), (0.8, 650, 25), (1.1, 820, 8)])
             + 0.05 * rng.randn(1000),
    # a noisy sine
    'sine': np.sin(2 * np.pi * np.arange(600) / 40) + 0.3 * rng.randn(600),
    # a spectrum-like curve: sharp lines over a falling noise floor
    'spectrum': np.abs(0.02 * rng.randn(2048)) + 1 / (1 + np.arange(2048) / 50)
                + sum(a * np.exp(-0.5 * ((np.arange(2048) - c) / 1.2) ** 2) for a, c in [(2, 200), (1.2, 400), (0.7, 600), (0.4, 800), (1.5, 1300)]),
    # small integers: flat tops (plateaus)
    'plateaus': rng.randint(0, 6, 300).astype(float),
}
cases = {
    'bumps': [{}, {'height': 0.5}, {'distance': 20}, {'prominence': 0.3}, {'width': 4}, {'prominence': 0.2, 'width': 2, 'distance': 30, 'height': 0.3}],
    'sine': [{}, {'distance': 15}, {'prominence': 1.0}, {'prominence': 0.5, 'width': 3}],
    'spectrum': [{}, {'prominence': 0.2}, {'distance': 100}, {'height': 0.3, 'prominence': 0.1}],
    'plateaus': [{}, {'prominence': 3}, {'width': 1.5, 'prominence': 1}],
}
cwt_cases = {'bumps': [(1, 10, 1), (2, 30, 1), (2, 30, 2)], 'sine': [(2, 20, 1)], 'spectrum': [(1, 8, 1), (1, 8, 3)]}

out = {'scipy': scipy.__version__, 'signals': {}, 'find_peaks': [], 'cwt': []}
for name, y in signals.items():
    out['signals'][name] = [float(v) for v in y]
    for c in cases.get(name, []):
        pk, props = find_peaks(y, **c)
        r = {'signal': name, 'args': c, 'peaks': pk.tolist()}
        if 'prominences' in props: r['prominences'] = props['prominences'].tolist()
        if 'widths' in props: r['widths'] = props['widths'].tolist()
        out['find_peaks'].append(r)
    for lo, hi, snr in cwt_cases.get(name, []):
        pk = find_peaks_cwt(y, np.arange(lo, hi + 1), min_snr=snr)
        out['cwt'].append({'signal': name, 'widths': [lo, hi], 'min_snr': snr, 'peaks': np.unique(pk).tolist()})

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'peaks_scipy.json'), 'w') as f:
    json.dump(out, f)
print('peaks_scipy.json:', len(out['find_peaks']), 'find_peaks cases,', len(out['cwt']), 'cwt cases')
