/* Cable tension from measured natural frequencies – the math of the Cable tension module (cable.js).
   SI units throughout: c = {L (m), m (kg/m), EI (N·m²), EA (N), theta (rad, from horizontal)}, T (N), f (Hz).
   Methods: taut string, beam with hinged ends, beam with clamped ends (the exact frequency equation), a fit of
   (f_n/n)² over n² (tension and bending stiffness from several modes) and the practical formulas of Zui, Shinke &
   Namita (1996), J. Struct. Eng. 122(6) 651–656. Peak finding: the harmonic series of the cable in a PSD. */
(function (root) {
  'use strict';
  const PI = Math.PI, G = 9.80665;

  /* ---------- tension ↔ frequency ---------- */
  // taut string: f_n = (n / 2L) √(T / m)
  const stringTension = (f, n, c) => 4 * c.m * c.L * c.L * (f / n) ** 2;
  const stringFrequency = (T, n, c) => n / (2 * c.L) * Math.sqrt(Math.max(T, 0) / c.m);
  // beam with hinged ends under tension: f_n = (n / 2L) √((T + n²π²EI / L²) / m)
  const hingedTension = (f, n, c) => stringTension(f, n, c) - (n * PI / c.L) ** 2 * (c.EI || 0);
  const hingedFrequency = (T, n, c) => n / (2 * c.L) * Math.sqrt(Math.max(T + (n * PI / c.L) ** 2 * (c.EI || 0), 0) / c.m);

  // beam with clamped ends under tension: EI w'''' − T w'' − m ω² w = 0 with w = w' = 0 at both ends. With α² − β² = T/EI
  // and m ω² = EI α²β², the frequency equation – divided by cosh αL, so it cannot overflow – is
  // 2αβ (sech αL − cos βL) + (α² − β²) tanh αL sin βL = 0, and the n-th root lies in nπ < βL < (n+1)π.
  function fixedFrequency(T, n, c) {
    if (!(c.EI > 0)) return stringFrequency(T, n, c);
    const L = c.L, t = Math.max(T, 0) / c.EI;
    const h = bl => { const b = bl / L, a = Math.sqrt(b * b + t), aL = a * L; return 2 * a * b * (1 / Math.cosh(aL) - Math.cos(bl)) + (a * a - b * b) * Math.tanh(aL) * Math.sin(bl); };
    let lo = n * PI, hi = (n + 1) * PI, hlo = h(lo);
    for (let i = 0; i < 200 && hi - lo > 1e-14 * hi; i++) { const mid = (lo + hi) / 2, hm = h(mid); if ((hm < 0) === (hlo < 0)) { lo = mid; hlo = hm; } else hi = mid; }
    const b = (lo + hi) / 2 / L, a = Math.sqrt(b * b + t);
    return a * b * Math.sqrt(c.EI / c.m) / (2 * PI);
  }
  // the tension that gives the n-th clamped-beam frequency f; NaN when f is at or below the frequency without tension
  function fixedTension(f, n, c) {
    if (!(c.EI > 0)) return stringTension(f, n, c);
    if (!(f > fixedFrequency(0, n, c))) return NaN;
    let lo = 0, hi = stringTension(f, n, c); // bending only adds stiffness: the string tension is an upper bound
    for (let i = 0; i < 200 && hi - lo > 1e-12 * hi; i++) { const mid = (lo + hi) / 2; if (fixedFrequency(mid, n, c) < f) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  const frequency = (T, n, c, bc) => bc === 'hinged' ? hingedFrequency(T, n, c) : bc === 'string' ? stringFrequency(T, n, c) : fixedFrequency(T, n, c);

  /* ---------- several modes at once ---------- */
  // (f_n/n)² = T/(4mL²) + π²EI/(4mL⁴) · n² (hinged beam): a straight line over n². Its intercept gives the tension,
  // its slope the effective bending stiffness – no EI needed. modes: [{n, f}]. se: standard error of T.
  function fitTension(modes, c) {
    const pts = modes.filter(o => o.n > 0 && o.f > 0), N = pts.length;
    if (N < 2 || new Set(pts.map(o => o.n)).size < 2) return { T: NaN, EI: NaN, r2: NaN, se: NaN, a: NaN, b: NaN, count: N };
    const xs = pts.map(o => o.n * o.n), ys = pts.map(o => (o.f / o.n) ** 2);
    const mx = xs.reduce((s, v) => s + v, 0) / N, my = ys.reduce((s, v) => s + v, 0) / N;
    let sxx = 0, sxy = 0, syy = 0; for (let i = 0; i < N; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
    const b = sxy / sxx, a = my - b * mx;
    let ssr = 0; for (let i = 0; i < N; i++) ssr += (ys[i] - a - b * xs[i]) ** 2;
    const k = 4 * c.m * c.L * c.L, sa = N > 2 ? Math.sqrt(ssr / (N - 2) * (1 / N + mx * mx / sxx)) : NaN;
    return { T: k * a, EI: b * 4 * c.m * c.L ** 4 / (PI * PI), r2: syy > 0 ? 1 - ssr / syy : 1, se: k * sa, a, b, count: N };
  }

  // modes far from a robust straight line of (f_n/n)² over n² (Theil–Sen: the median of the pairwise slopes) – another
  // component's peak, or noise taken for a weak mode: more than 4 robust standard deviations and 1 % off. A flag per mode.
  function outliers(modes) {
    const pts = modes.map(o => ({ x: o.n * o.n, y: (o.f / o.n) ** 2 }));
    if (pts.length < 4) return pts.map(() => false);
    const med = a => { const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
    const sl = []; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (pts[j].x !== pts[i].x) sl.push((pts[j].y - pts[i].y) / (pts[j].x - pts[i].x));
    const b = med(sl), a = med(pts.map(p => p.y - b * p.x)), res = pts.map(p => p.y - a - b * p.x), mad = 1.4826 * med(res.map(Math.abs));
    return res.map((r, i) => Math.abs(r) > Math.max(4 * mad, 0.01 * (a + b * pts[i].x)));
  }

  /* ---------- sag and bending parameters ---------- */
  // ξ = L√(T/EI) (bending: small ξ – short, stiff cables – matter); δ = mgL cosθ / (8T) (sag to span); Irvine's
  // λ² = (mgL cosθ / T)² · L / (T·Le / EA) with Le ≈ L(1 + 8δ²) (sag-extensibility: raises the symmetric in-plane modes)
  function parameters(T, c) {
    const xi = c.EI > 0 ? c.L * Math.sqrt(Math.max(T, 0) / c.EI) : Infinity;
    const cos = Math.cos(c.theta || 0), sag = c.m * G * c.L * cos / (8 * T);
    const lambda2 = c.EA > 0 ? (8 * sag) ** 2 * c.EA * c.L / (T * c.L * (1 + 8 * sag * sag)) : NaN;
    return { xi, sag, lambda2 };
  }

  /* ---------- Zui, Shinke & Namita (1996) ---------- */
  // C = √(EI/(mL⁴)), Γ = √(mgL / (128 EA δ³ cos⁵θ)) · (0.31ξ + 0.5)/(0.31ξ − 0.5). Γ ≥ 3: the first mode, else (down to
  // Γ = 0.17) the second; ξ chooses the formula. ξ and Γ depend on T, so it is solved by iteration from the string value.
  const ZUI = {
    '1a': { n: 1, k: 4, lim: '17 ≤ ξ', f: r => 1 - 2.20 * r - 0.550 * r * r },
    '1b': { n: 1, k: 4, lim: '6 ≤ ξ ≤ 17', f: r => 0.865 - 11.6 * r * r },
    '1c': { n: 1, k: 4, lim: 'ξ ≤ 6', f: r => 0.828 - 10.5 * r * r },
    '2a': { n: 2, k: 1, lim: '60 ≤ ξ', f: r => 1 - 4.40 * r - 1.10 * r * r },
    '2b': { n: 2, k: 1, lim: '17 ≤ ξ ≤ 60', f: r => 1.03 - 6.33 * r - 1.58 * r * r },
    '2c': { n: 2, k: 1, lim: 'ξ ≤ 17', f: r => 0.882 - 85.0 * r * r }
  };
  function zuiGamma(T, c, xi) {
    if (!(c.EA > 0)) return Infinity;
    const cos = Math.cos(c.theta || 0), d = c.m * G * c.L * cos / (8 * T);
    const g = Math.sqrt(c.m * G * c.L / (128 * c.EA * d ** 3 * cos ** 5));
    return isFinite(xi) ? (0.31 * xi > 0.5 ? g * (0.31 * xi + 0.5) / (0.31 * xi - 0.5) : Infinity) : g;
  }
  // f1, f2: the measured first and second frequencies (either may be missing)
  function zui(f1, f2, c) {
    const C = c.EI > 0 ? Math.sqrt(c.EI / (c.m * c.L ** 4)) : 0, have1 = f1 > 0, have2 = f2 > 0;
    if (!have1 && !have2) return { T: NaN, note: 'Needs the first or the second frequency' };
    let T = have1 ? stringTension(f1, 1, c) : stringTension(f2, 2, c), key = '', xi = Infinity, gamma = Infinity;
    for (let it = 0; it < 100; it++) {
      xi = c.EI > 0 ? c.L * Math.sqrt(T / c.EI) : Infinity; gamma = zuiGamma(T, c, xi);
      const second = have2 && (!have1 || gamma < 3);
      key = second ? (xi >= 60 ? '2a' : xi >= 17 ? '2b' : '2c') : (xi >= 17 ? '1a' : xi >= 6 ? '1b' : '1c');
      const z = ZUI[key], f = z.n === 1 ? f1 : f2, Tn = z.k * c.m * (f * c.L) ** 2 * z.f(C / f);
      if (!(Tn > 0)) return { T: NaN, xi, gamma, key, note: 'The formula gives no positive tension for these data' };
      const done = Math.abs(Tn - T) <= 1e-10 * Tn; T = Tn; if (done) break;
    }
    const z = ZUI[key], notes = [];
    if (z.n === 1 && gamma < 3) notes.push('Γ < 3: sag changes the first mode – the second-mode formulas need f₂');
    if (gamma < 0.17) notes.push('Γ < 0.17: outside the range of the formulas (very large sag)');
    return { T, xi, gamma, key, mode: z.n, label: `${z.n === 1 ? 'first' : 'second'} mode, ${z.lim}${z.n === 1 ? ', Γ ≥ 3' : have1 ? ', Γ < 3' : ' (f₁ not used)'}`, note: notes.join('; ') };
  }

  /* ---------- the harmonic series in a spectrum ---------- */
  // P: power spectral density at f_k = f0 + k·df. o: {fMin, fMax, f1 (a hint; 0 = search), maxModes, minProm (dB),
  // bOf(f) or b: the inharmonicity π²EI/(T L²) expected from the cable data (f_n ≈ n f √(1 + b n²))}.
  // Returns {modes: [{n, f, level (dB), prom (dB above the local median), weak}], base (f₁ without bending), b, db, med}.
  function findModes(P, f0, df, o) {
    const N = P.length, fMin = Math.max(o.fMin || 0, f0), fMax = Math.min(o.fMax > 0 ? o.fMax : Infinity, f0 + (N - 1) * df);
    const maxModes = Math.max(1, o.maxModes || 10), minProm = o.minProm ?? 6;
    const db = Float64Array.from(P, v => 10 * Math.log10(Math.max(v, 1e-300)));
    const kOf = f => (f - f0) / df;
    // the local median: the noise floor a peak stands out from
    const W = Math.max(4, Math.round((fMax - fMin) / 30 / df)), med = new Float64Array(N).fill(NaN);
    const k0 = Math.max(0, Math.floor(kOf(fMin)) - W), k1 = Math.min(N - 1, Math.ceil(kOf(fMax)) + W);
    const step = Math.max(1, Math.round(W / 8)), at = []; // every step-th line, interpolated between
    for (let k = k0; k <= k1 + step; k += step) { const kk = Math.min(k, k1), a = Array.from(db.subarray(Math.max(0, kk - W), Math.min(N, kk + W + 1))).sort((x, y) => x - y); at.push([kk, a[a.length >> 1]]); }
    for (let i = 0; i + 1 < at.length; i++) { const [ka, va] = at[i], [kb, vb] = at[i + 1]; for (let k = ka; k <= kb; k++) med[k] = kb > ka ? va + (vb - va) * (k - ka) / (kb - ka) : va; }
    // the highest line between two frequencies in O(1): a sparse table of the highest line in every 2^j lines
    const tab = [Int32Array.from(db, (_, k) => k)];
    for (let j = 1; (1 << j) <= N; j++) {
      const prev = tab[j - 1], half = 1 << (j - 1), cur = new Int32Array(N - (1 << j) + 1);
      for (let k = 0; k < cur.length; k++) { const a = prev[k], b = prev[k + half]; cur[k] = db[a] >= db[b] ? a : b; }
      tab.push(cur);
    }
    const peakIn = (fa, fb) => {
      const ka = Math.max(0, Math.ceil(kOf(fa))), kb = Math.min(N - 1, Math.floor(kOf(fb)));
      if (kb < ka) return -1;
      const j = 31 - Math.clz32(kb - ka + 1), a = tab[j][ka], b = tab[j][kb - (1 << j) + 1];
      return db[a] >= db[b] ? a : b;
    };
    const prom = k => k >= 0 && isFinite(med[k]) ? db[k] - med[k] : 0;
    // 1. the fundamental: the f₁ (and inharmonicity) whose first harmonics stand out most on average; of the candidates
    // within 85 % of the best score the lowest wins, so 2f₁ (every other harmonic) does not – and f₁/2 scores low.
    // Candidates 0.2 % apart (the windows are ±2 %); the inharmonicity from the cable data (o.bOf(f)) is tried too.
    const bs = [0, 0.001, 0.003, 0.01, 0.03];
    const lo = o.f1 > 0 ? Math.max(fMin, 0.85 * o.f1) : Math.max(fMin, 2 * df), hi = o.f1 > 0 ? Math.min(fMax, 1.15 * o.f1) : fMax / 2;
    const cands = [];
    for (let f = lo; f <= hi; f += Math.max(df / 2, 0.002 * f)) {
      let best = -1, bestB = 0;
      for (const b of o.bOf ? bs.concat(o.bOf(f)) : o.b > 0 ? bs.concat(o.b) : bs) {
        let s = 0, cnt = 0;
        for (let n = 1; n <= Math.min(6, maxModes); n++) {
          const fn = n * f * Math.sqrt(1 + b * n * n), tol = Math.max(2 * df, 0.02 * fn);
          if (fn + tol > fMax) break;
          s += Math.min(25, Math.max(0, prom(peakIn(fn - tol, fn + tol)))); cnt++;
        }
        if (cnt >= (o.f1 > 0 ? 1 : 2) && s / cnt > best) { best = s / cnt; bestB = b; }
      }
      if (best >= 0) cands.push({ f, b: bestB, s: best });
    }
    if (!cands.length) return { modes: [], base: NaN, b: 0, db, med, note: 'No harmonic series found in the frequency range' };
    const top = Math.max(...cands.map(x => x.s)), pick = cands.find(x => x.s >= 0.85 * top);
    // 2. the modes one by one, each predicted from the ones found so far ((f_n/n)² linear in n²)
    const modes = [], spacing = pick.f;
    let a = pick.f * pick.f, slope = a * pick.b;
    for (let n = 1; n <= maxModes; n++) {
      const pred = n * Math.sqrt(Math.max(a + slope * n * n, 1e-12)), tol = Math.max(2 * df, 0.2 * spacing);
      if (pred + tol > fMax) break;
      const k = peakIn(pred - tol, pred + tol); if (k < 0) break;
      let f = f0 + k * df;
      if (k > 0 && k < N - 1) { const y0 = db[k - 1], y1 = db[k], y2 = db[k + 1], d = y0 - 2 * y1 + y2; if (d < 0) f += 0.5 * (y0 - y2) / d * df; }
      const q = prom(k);
      modes.push({ n, f, level: db[k], prom: q, weak: q < minProm });
      const good = modes.filter(x => !x.weak);
      if (good.length >= 2) { const fit = fitTension(good, { m: 1, L: 0.5 }); if (fit.b >= 0 && isFinite(fit.a)) { a = fit.a; slope = fit.b; } } // m = 1, L = ½: T = a
      else if (good.length === 1) a = (good[0].f / good[0].n) ** 2 / (1 + pick.b * good[0].n ** 2);
    }
    return { modes, base: pick.f, b: pick.b, db, med };
  }

  /* ---------- an example record ---------- */
  // Ambient acceleration at x·L along a cable: every mode a lightly damped resonance driven by noise, plus extra
  // components (a deck mode) and sensor noise. o: {c, T, bc, fs, seconds, modes, zeta, x, extra: [{f, rms}], noise, seed}
  function simulate(o) {
    const n = Math.round(o.fs * o.seconds), y = new Float64Array(n), dt = 1 / o.fs;
    let s = o.seed || 7; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * PI * rnd());
    const add = (f, rms, zeta) => {
      const w = 2 * PI * f * dt, r = Math.exp(-zeta * w), a1 = 2 * r * Math.cos(w), a2 = -r * r, out = new Float64Array(n);
      let y1 = 0, y2 = 0, ss = 0;
      for (let i = 0; i < n; i++) { const v = a1 * y1 + a2 * y2 + gauss(); y2 = y1; y1 = v; out[i] = v; ss += v * v; }
      const k = rms / Math.sqrt(ss / n); for (let i = 0; i < n; i++) y[i] += out[i] * k;
    };
    for (let m = 1; m <= o.modes; m++) {
      const f = frequency(o.T, m, o.c, o.bc); if (f >= o.fs / 2.5) break;
      add(f, (o.rms || 0.02) * Math.abs(Math.sin(m * PI * o.x)) / Math.sqrt(m), o.zeta || 0.003);
    }
    for (const e of o.extra || []) add(e.f, e.rms, e.zeta || 0.01);
    for (let i = 0; i < n; i++) y[i] += (o.noise || 0) * gauss();
    return y;
  }

  const CABLEMATH = { G, stringTension, stringFrequency, hingedTension, hingedFrequency, fixedTension, fixedFrequency, frequency,
    fitTension, outliers, parameters, zui, zuiGamma, ZUI, findModes, simulate };
  if (typeof module !== 'undefined' && module.exports) module.exports = CABLEMATH; else root.CABLEMATH = CABLEMATH;
})(typeof window !== 'undefined' ? window : globalThis);
