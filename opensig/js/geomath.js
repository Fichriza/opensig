/* OpenSig geometry math (used by geometry.js and the tests): test-object geometries (nodes, lines, surfaces), their
   generators, UFF/UNV geometry files (datasets 15 and 2411 nodes, 82 trace lines, 2412 elements), the cross-spectral
   density matrix of the measured channels, operating deflection shapes (ODS) and Frequency Domain Decomposition
   (FDD: singular values and vectors of the spectral matrix per frequency), and filling in unmeasured node motion. */
(function (root) {
  'use strict';
  const DSP = root.DSP || (typeof require !== 'undefined' ? require('./dsp.js') : null);

  /* ---------- geometry generators: {nodes: [{id, x, y, z}], lines: [[a, b]], surfaces: [[a, b, c(, d)]]} ---------- */
  const place = (plane, u, v, w) => plane === 'XZ' ? { x: u, y: w, z: v } : plane === 'YZ' ? { x: w, y: u, z: v } : { x: u, y: v, z: w };
  function grid(o) {
    const nx = Math.max(1, Math.round(o.nx)), ny = Math.max(1, Math.round(o.ny)), s = Math.round(o.start || 1), id = (i, j) => s + j * nx + i;
    const g = { nodes: [], lines: [], surfaces: [] };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g.nodes.push(Object.assign({ id: id(i, j) }, place(o.plane || 'XY', i * o.dx, j * o.dy, o.offset || 0)));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (o.lines !== false) { if (i + 1 < nx) g.lines.push([id(i, j), id(i + 1, j)]); if (j + 1 < ny) g.lines.push([id(i, j), id(i, j + 1)]); }
      if (o.surfaces !== false && i + 1 < nx && j + 1 < ny) g.surfaces.push([id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
    return g;
  }
  function box(o) {
    const s = Math.round(o.start || 1), L = [o.lx, o.ly, o.lz], g = { nodes: [], lines: [], surfaces: [] };
    [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].forEach((c, k) => g.nodes.push({ id: s + k, x: c[0] * L[0], y: c[1] * L[1], z: c[2] * L[2] }));
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => g.lines.push([s + a, s + b]));
    if (o.surfaces !== false) [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].forEach(f => g.surfaces.push(f.map(k => s + k)));
    return g;
  }
  // rings around an axis (X, Y or Z) from radius r1 at 0 to r2 at height h: a truncated cone; a cylinder when r1 = r2
  const tidy = x => Math.abs(x) < 1e-12 ? 0 : +x.toPrecision(12); // cos(90°) is 6e-17, not 0
  function cone(o) {
    const n = Math.max(3, Math.round(o.n)), lv = Math.max(1, Math.round(o.levels)), s = Math.round(o.start || 1), id = (k, l) => s + l * n + (k % n);
    const r1 = o.r1 ?? o.r, r2 = o.r2 ?? r1, ax = o.axis || 'Z', g = { nodes: [], lines: [], surfaces: [] };
    for (let l = 0; l < lv; l++) for (let k = 0; k < n; k++) {
      const a = 2 * Math.PI * k / n, t = lv > 1 ? l / (lv - 1) : 0, r = r1 + (r2 - r1) * t, u = tidy(r * Math.cos(a)), v = tidy(r * Math.sin(a)), w = t * (o.h || 0);
      g.nodes.push(Object.assign({ id: id(k, l) }, ax === 'X' ? { x: w, y: u, z: v } : ax === 'Y' ? { x: v, y: w, z: u } : { x: u, y: v, z: w }));
    }
    for (let l = 0; l < lv; l++) for (let k = 0; k < n; k++) {
      g.lines.push([id(k, l), id(k + 1, l)]);
      if (l + 1 < lv) { g.lines.push([id(k, l), id(k, l + 1)]); if (o.surfaces !== false) g.surfaces.push([id(k, l), id(k + 1, l), id(k + 1, l + 1), id(k, l + 1)]); }
    }
    return g;
  }
  const cylinder = o => cone(Object.assign({}, o, { r1: o.r, r2: o.r }));
  const circle = o => cone({ n: o.n, r1: o.r, r2: o.r, levels: 1, h: 0, axis: o.axis, start: o.start, surfaces: false });
  // the edge of a rectangle lx × ly: nx nodes along the first side, ny along the second, joined all round
  function outline(o) {
    const nx = Math.max(2, Math.round(o.nx)), ny = Math.max(2, Math.round(o.ny)), s = Math.round(o.start || 1), dx = o.lx / (nx - 1), dy = o.ly / (ny - 1), pts = [];
    for (let i = 0; i < nx - 1; i++) pts.push([i * dx, 0]);
    for (let j = 0; j < ny - 1; j++) pts.push([o.lx, j * dy]);
    for (let i = nx - 1; i > 0; i--) pts.push([i * dx, o.ly]);
    for (let j = ny - 1; j > 0; j--) pts.push([0, j * dy]);
    const g = { nodes: pts.map(([u, v], k) => Object.assign({ id: s + k }, place(o.plane || 'XY', u, v, o.offset || 0))), lines: [], surfaces: [] };
    pts.forEach((_, k) => g.lines.push([s + k, s + (k + 1) % pts.length]));
    return g;
  }
  // move a generated part to an origin
  function translate(g, ox = 0, oy = 0, oz = 0) { g.nodes.forEach(n => { n.x += ox; n.y += oy; n.z += oz; }); return g; }
  function beam(o) {
    const n = Math.max(2, Math.round(o.n)), s = Math.round(o.start || 1), g = { nodes: [], lines: [], surfaces: [] };
    for (let k = 0; k < n; k++) { const t = k * o.length / (n - 1); g.nodes.push({ id: s + k, x: o.axis === 'X' || !o.axis ? t : 0, y: o.axis === 'Y' ? t : 0, z: o.axis === 'Z' ? t : 0 }); }
    for (let k = 0; k + 1 < n; k++) g.lines.push([s + k, s + k + 1]);
    return g;
  }
  // add a generated part to a geometry; existing node numbers are replaced
  function merge(geo, part) {
    const ids = new Set(part.nodes.map(p => p.id));
    return { nodes: geo.nodes.filter(p => !ids.has(p.id)).concat(part.nodes), lines: geo.lines.concat(part.lines), surfaces: geo.surfaces.concat(part.surfaces) };
  }

  /* ---------- UFF / UNV geometry ---------- */
  const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[EeDd][-+]?\d+)?/g;
  const nums = line => (line.match(NUM) || []).map(t => +t.replace(/[Dd]/, 'E'));
  function blocks(text) { // [{type, lines}]
    const L = String(text).split(/\r?\n/), out = [];
    for (let i = 0; i < L.length; i++) {
      if (L[i].trim() !== '-1') continue;
      const type = parseInt(L[i + 1], 10); if (!isFinite(type)) continue;
      const lines = []; let j = i + 2;
      while (j < L.length && L[j].trim() !== '-1') lines.push(L[j++]);
      out.push({ type, lines }); i = j;
    }
    return out;
  }
  const BEAMS = new Set([11, 21, 22, 23, 24]);
  const TRI = new Set([41, 51, 61, 74, 81, 91]), QUAD = new Set([44, 54, 64, 71, 84, 94]), TRI6 = new Set([42, 52, 62, 72, 82, 92]), QUAD8 = new Set([45, 55, 65, 75, 85, 95]);
  function parseUFF(text) {
    const g = { nodes: [], lines: [], surfaces: [] }, skipped = new Set(), seen = new Map();
    for (const b of blocks(text)) {
      if (b.type === 15) for (const l of b.lines) { const v = nums(l); if (v.length >= 7) seen.set(v[0], { id: v[0], x: v[4], y: v[5], z: v[6] }); }
      else if (b.type === 2411 || b.type === 781) for (let i = 0; i + 1 < b.lines.length; i += 2) { const h = nums(b.lines[i]), c = nums(b.lines[i + 1]); if (h.length >= 1 && c.length >= 3) seen.set(h[0], { id: h[0], x: c[0], y: c[1], z: c[2] }); }
      else if (b.type === 82) {
        let i = 0;
        while (i < b.lines.length) {
          const h = nums(b.lines[i]); if (h.length < 2) { i++; continue; }
          const n = h[1], ids = []; i += 2; // header, identification line
          while (ids.length < n && i < b.lines.length) ids.push(...nums(b.lines[i++]));
          for (let k = 0; k + 1 < ids.length; k++) if (ids[k] && ids[k + 1]) g.lines.push([ids[k], ids[k + 1]]);
        }
      } else if (b.type === 2412) {
        let i = 0;
        while (i < b.lines.length) {
          const h = nums(b.lines[i]); if (h.length < 6) { i++; continue; }
          const fe = h[1], n = h[5]; i++;
          if (BEAMS.has(fe)) i++; // beam orientation record
          const ids = []; while (ids.length < n && i < b.lines.length) ids.push(...nums(b.lines[i++]));
          if (BEAMS.has(fe) || n === 2) { for (let k = 0; k + 1 < ids.length; k++) g.lines.push([ids[k], ids[k + 1]]); }
          else if (TRI.has(fe)) g.surfaces.push(ids.slice(0, 3));
          else if (QUAD.has(fe)) g.surfaces.push(ids.slice(0, 4));
          else if (TRI6.has(fe)) g.surfaces.push([ids[0], ids[2], ids[4]]);
          else if (QUAD8.has(fe)) g.surfaces.push([ids[0], ids[2], ids[4], ids[6]]);
          else if (fe === 111 && n === 4) [[0, 1, 2], [0, 1, 3], [1, 2, 3], [0, 2, 3]].forEach(f => g.surfaces.push(f.map(k => ids[k])));
          else if (fe === 115 && n === 8) [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].forEach(f => g.surfaces.push(f.map(k => ids[k])));
          else skipped.add('element type ' + fe);
        }
      } else skipped.add('dataset ' + b.type);
    }
    g.nodes = [...seen.values()];
    return { geometry: g, skipped: [...skipped] };
  }
  const I = (v, w = 10) => String(Math.round(v)).padStart(w);
  const D = v => { const s = (+v).toExponential(16).replace('e', 'D'); const [m, e] = s.split('D'); return (m + 'D' + (e[0] === '-' ? '-' : '+') + e.replace(/^[-+]/, '').padStart(2, '0')).padStart(25); };
  function writeUFF(g) {
    const out = [], ids = new Set(g.nodes.map(p => p.id));
    out.push('    -1', '  2411');
    for (const p of g.nodes) out.push(I(p.id) + I(1) + I(1) + I(11), D(p.x) + D(p.y) + D(p.z));
    out.push('    -1');
    const lines = g.lines.filter(([a, b]) => ids.has(a) && ids.has(b));
    if (lines.length) {
      out.push('    -1', '    82');
      lines.forEach(([a, b], k) => out.push(I(k + 1) + I(2) + I(8), 'Line ' + (k + 1), I(a) + I(b)));
      out.push('    -1');
    }
    const surf = g.surfaces.filter(f => (f.length === 3 || f.length === 4) && f.every(id => ids.has(id)));
    if (surf.length) {
      out.push('    -1', '  2412');
      surf.forEach((f, k) => out.push(I(k + 1) + I(f.length === 3 ? 91 : 94) + I(1) + I(1) + I(7) + I(f.length), f.map(id => I(id)).join('')));
      out.push('    -1');
    }
    return out.join('\n') + '\n';
  }

  /* ---------- spectra of the measured channels ---------- */
  // Welch cross-spectral density matrix: segments of L = 2^k samples with 50 % overlap, Hann window.
  // Returns {L, bins, seg, n, G: Array(n*n) of {re, im} (G[k*n+l] = mean X_k · conj(X_l))}.
  function csdMatrix(chans, nseg = 8) {
    const n = chans.length, N = Math.min(...chans.map(c => c.length));
    if (!n || !(N >= 16)) throw new Error('Needs signals of at least 16 samples');
    let L = 16; while (L * 2 <= Math.min(N, 2 * N / (nseg + 1))) L *= 2;
    const hop = L / 2, seg = Math.max(1, Math.floor((N - L) / hop) + 1), bins = L / 2 + 1;
    const win = new Float64Array(L); for (let i = 0; i < L; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / L);
    const G = Array.from({ length: n * n }, () => ({ re: new Float64Array(bins), im: new Float64Array(bins) }));
    const means = chans.map(c => { let s = 0; for (let i = 0; i < N; i++) s += c[i]; return s / N; });
    const X = Array.from({ length: n }, () => ({ re: new Float64Array(L), im: new Float64Array(L) }));
    for (let s = 0; s < seg; s++) {
      for (let k = 0; k < n; k++) {
        const c = chans[k], x = X[k], o = s * hop;
        for (let i = 0; i < L; i++) { x.re[i] = (c[o + i] - means[k]) * win[i]; x.im[i] = 0; }
        DSP.fft(x.re, x.im, false);
      }
      for (let k = 0; k < n; k++) for (let l = k; l < n; l++) {
        const g = G[k * n + l], a = X[k], b = X[l];
        for (let f = 0; f < bins; f++) { g.re[f] += a.re[f] * b.re[f] + a.im[f] * b.im[f]; g.im[f] += a.im[f] * b.re[f] - a.re[f] * b.im[f]; }
      }
    }
    for (let k = 0; k < n; k++) for (let l = k; l < n; l++) {
      const g = G[k * n + l];
      for (let f = 0; f < bins; f++) { g.re[f] /= seg; g.im[f] /= seg; }
      if (l > k) { const h = G[l * n + k]; for (let f = 0; f < bins; f++) { h.re[f] = g.re[f]; h.im[f] = -g.im[f]; } }
    }
    return { L, bins, seg, n, G };
  }
  // the spectral matrix at one bin as flat complex arrays
  function matrixAt(S, f) {
    const n = S.n, re = new Float64Array(n * n), im = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) { re[i] = S.G[i].re[f]; im[i] = S.G[i].im[f]; }
    return { re, im, n };
  }
  // the m largest eigenvalues / eigenvectors of a Hermitian positive semi-definite matrix (= its singular values and
  // vectors) by power iteration with deflation; warm: start vectors (e.g. from the neighbouring frequency)
  function topEigen(A, m, warm, iters = 60) {
    const n = A.n, re = Float64Array.from(A.re), im = Float64Array.from(A.im), vals = [], vecs = [];
    for (let e = 0; e < Math.min(m, n); e++) {
      let vr = new Float64Array(n), vi = new Float64Array(n);
      if (warm && warm[e]) { vr.set(warm[e].re); vi.set(warm[e].im); } else for (let i = 0; i < n; i++) { vr[i] = 1 + 0.1 * i; vi[i] = 0.05 * (i % 3); }
      let lam = 0;
      for (let it = 0; it < iters; it++) {
        const wr = new Float64Array(n), wi = new Float64Array(n);
        for (let i = 0; i < n; i++) { let sr = 0, si = 0; for (let j = 0; j < n; j++) { const ar = re[i * n + j], ai = im[i * n + j]; sr += ar * vr[j] - ai * vi[j]; si += ar * vi[j] + ai * vr[j]; } wr[i] = sr; wi[i] = si; }
        let nrm = 0; for (let i = 0; i < n; i++) nrm += wr[i] * wr[i] + wi[i] * wi[i];
        nrm = Math.sqrt(nrm);
        if (!(nrm > 0)) { lam = 0; break; }
        const prev = lam; lam = nrm;
        for (let i = 0; i < n; i++) { vr[i] = wr[i] / nrm; vi[i] = wi[i] / nrm; }
        if (it > 3 && Math.abs(lam - prev) <= 1e-10 * lam) break;
      }
      vals.push(lam); vecs.push({ re: vr, im: vi });
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { // A -= λ v vᴴ
        re[i * n + j] -= lam * (vr[i] * vr[j] + vi[i] * vi[j]);
        im[i * n + j] -= lam * (vi[i] * vr[j] - vr[i] * vi[j]);
      }
    }
    return { vals, vecs };
  }
  // FDD: the m largest singular values of the spectral matrix at every bin
  function fdd(S, m = 3) {
    const sv = Array.from({ length: Math.min(m, S.n) }, () => new Float64Array(S.bins));
    let warm = null;
    for (let f = 0; f < S.bins; f++) {
      const r = topEigen(matrixAt(S, f), m, warm, 30);
      r.vals.forEach((v, k) => { sv[k][f] = v; });
      warm = r.vecs;
    }
    return sv;
  }
  // a complex shape scaled to a largest magnitude of 1, turned so that this component is real and positive
  function normShape(u) {
    let k = 0, mx = 0; for (let i = 0; i < u.re.length; i++) { const a = Math.hypot(u.re[i], u.im[i]); if (a > mx) { mx = a; k = i; } }
    if (!(mx > 0)) return { re: new Float64Array(u.re.length), im: new Float64Array(u.re.length) };
    const cr = u.re[k] / mx, ci = -u.im[k] / mx, re = new Float64Array(u.re.length), im = new Float64Array(u.re.length); // × conj(phase) / mx
    for (let i = 0; i < u.re.length; i++) { re[i] = (u.re[i] * cr - u.im[i] * ci) / mx; im[i] = (u.re[i] * ci + u.im[i] * cr) / mx; }
    return { re, im };
  }
  // the mode shape at bin f: first singular vector
  const modeShape = (S, f) => normShape(topEigen(matrixAt(S, f), 1, null, 200).vecs[0]);
  // operating deflection shape at bin f relative to the reference channel: G_kr / √G_rr
  function odsShape(S, f, ref) {
    const n = S.n, gr = Math.sqrt(Math.max(S.G[ref * n + ref].re[f], 1e-300)), re = new Float64Array(n), im = new Float64Array(n);
    for (let k = 0; k < n; k++) { re[k] = S.G[k * n + ref].re[f] / gr; im[k] = S.G[k * n + ref].im[f] / gr; }
    return { re, im, amp: Math.max(...Array.from(re, (v, k) => Math.hypot(v, im[k]))) };
  }
  // Modal Assurance Criterion of two complex shapes (1 = the same shape)
  function mac(a, b) {
    let nr = 0, ni = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.re.length; i++) { nr += a.re[i] * b.re[i] + a.im[i] * b.im[i]; ni += a.im[i] * b.re[i] - a.re[i] * b.im[i]; aa += a.re[i] ** 2 + a.im[i] ** 2; bb += b.re[i] ** 2 + b.im[i] ** 2; }
    return (nr * nr + ni * ni) / (aa * bb || 1);
  }
  // the highest peaks of a power curve (indices): at least promDb above the valleys beside them, `gap` bins apart
  function peaks(y, count = 8, gap = 3, promDb = 6) {
    const db = Float64Array.from(y, v => 10 * Math.log10(Math.max(v, 1e-300)));
    let c;
    if (DSP && DSP.findPeaks) c = DSP.findPeaks(db, { prominence: promDb, distance: gap }).peaks;
    else { c = []; for (let i = 1; i + 1 < y.length; i++) if (y[i] > y[i - 1] && y[i] >= y[i + 1]) c.push(i); }
    c.sort((a, b) => y[b] - y[a]);
    const out = [];
    for (const i of c) { if (out.every(j => Math.abs(j - i) >= gap)) out.push(i); if (out.length >= count) break; }
    return out.sort((a, b) => a - b);
  }

  /* ---------- node numbers and channel directions ---------- */
  const SORT = { number: n => [n.id], x: n => [n.x, n.y, n.z], y: n => [n.y, n.x, n.z], z: n => [n.z, n.x, n.y] };
  const byOrder = order => (a, b) => { const ka = SORT[order || 'number'](a), kb = SORT[order || 'number'](b); for (let i = 0; i < ka.length; i++) { const d = ka[i] - kb[i]; if (Math.abs(d) > 1e-9) return d; } return a.id - b.id; };
  // new numbers start, start + step, … in the chosen order (number, x, y, z); lines, surfaces and DOFs follow
  function renumber(geo, dofs, o) {
    const sorted = geo.nodes.slice().sort(byOrder(o.order)), map = new Map(sorted.map((n, k) => [n.id, Math.round(o.start + k * o.step)]));
    const m = id => map.has(id) ? map.get(id) : id;
    return {
      geo: Object.assign({}, geo, { nodes: sorted.map(n => Object.assign({}, n, { id: m(n.id) })), lines: geo.lines.map(l => l.map(m)), surfaces: geo.surfaces.map(f => f.map(m)) }),
      dofs: dofs.map(d => Object.assign({}, d, { node: d.node == null ? d.node : m(d.node) })), map
    };
  }
  // unit vector of a sensor direction: ±X, ±Y, ±Z, or on a cylinder (axis through cyl {x, y, z, axis}) ±R radial
  // (outwards), ±T tangential (right-handed about the axis) and ±A along the axis
  const AX = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
  const DIR_NAMES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z', '+R', '-R', '+T', '-T', '+A', '-A'];
  function dirVector(dir, node, cyl) {
    const s = dir && dir[0] === '-' ? -1 : 1, k = dir ? dir.slice(1) : '';
    if (AX[k]) return AX[k].map(v => v * s);
    const c = cyl || { x: 0, y: 0, z: 0, axis: 'Z' }, a = AX[c.axis || 'Z'];
    if (k === 'A') return a.map(v => v * s);
    const d = [node.x - c.x, node.y - c.y, node.z - c.z], along = d[0] * a[0] + d[1] * a[1] + d[2] * a[2];
    const r = d.map((v, i) => v - along * a[i]), len = Math.hypot(...r);
    if (!(len > 1e-12)) return [0, 0, 0];
    const R = r.map(v => v / len);
    if (k === 'R') return R.map(v => v * s);
    if (k === 'T') return [a[1] * R[2] - a[2] * R[1], a[2] * R[0] - a[0] * R[2], a[0] * R[1] - a[1] * R[0]].map(v => v * s);
    return [0, 0, 0];
  }
  // channels to nodes in turn: every node (in the chosen order, from node `start`, without the excluded ones) gets the
  // next channel for each of the directions dirs. Returns [{win, node, dir}]; channels left over get node null.
  function autoAssign(geo, wins, o) {
    const ex = new Set(o.exclude || []);
    let nodes = geo.nodes.filter(n => !ex.has(n.id)).sort(byOrder(o.order));
    if (o.start != null) { const i = nodes.findIndex(n => n.id === o.start); if (i > 0) nodes = nodes.slice(i); }
    const out = []; let k = 0;
    for (const n of nodes) for (const d of o.dirs) if (k < wins.length) out.push({ win: wins[k++], node: n.id, dir: d });
    while (k < wins.length) out.push({ win: wins[k++], node: null, dir: o.dirs[0] || '+Z' });
    return out;
  }

  /* ---------- node motion ---------- */
  // disp: Map node id → [dx, dy, dz] of the measured nodes, measured: Map id → [bool x, y, z]; unmeasured directions of
  // nodes are filled with the mean of their neighbours (lines and surface edges), repeated until settled
  function fillUnmeasured(geo, disp, measured, passes = 40) {
    const nb = new Map(geo.nodes.map(p => [p.id, new Set()]));
    const link = (a, b) => { if (nb.has(a) && nb.has(b) && a !== b) { nb.get(a).add(b); nb.get(b).add(a); } };
    geo.lines.forEach(([a, b]) => link(a, b));
    geo.surfaces.forEach(f => f.forEach((a, k) => link(a, f[(k + 1) % f.length])));
    for (const p of geo.nodes) if (!disp.has(p.id)) disp.set(p.id, [0, 0, 0]);
    for (let it = 0; it < passes; it++) for (const p of geo.nodes) {
      const m = measured.get(p.id) || [false, false, false], d = disp.get(p.id), ns = [...nb.get(p.id)];
      if (!ns.length) continue;
      for (let c = 0; c < 3; c++) if (!m[c]) { let s = 0; for (const q of ns) s += disp.get(q)[c]; d[c] = s / ns.length; }
    }
    return disp;
  }

  /* ---------- Enhanced FDD: natural frequency and damping of a mode ---------- */
  // The bins around a peak whose first singular vector resembles the peak's (MAC ≥ macMin) form the mode's
  // single-degree-of-freedom "bell". Its inverse Fourier transform is the mode's (free-decay-like) correlation function:
  // the decay of its extremes gives the damping, its zero crossings the damped frequency (Brincker et al., 2001).
  // The correlation from a Welch spectrum is the true one times the autocorrelation of the analysis window, so it is
  // divided by that first (window: true), which removes most of the window's damping bias.
  const hannCorrCache = new Map();
  function hannCorr(L) { // linear autocorrelation of the Hann window of length L, 1 at lag 0, for lags 0 … L/2
    if (hannCorrCache.has(L)) return hannCorrCache.get(L);
    const M = 2 * L, re = new Float64Array(M), im = new Float64Array(M);
    for (let i = 0; i < L; i++) re[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / L);
    DSP.fft(re, im, false);
    for (let i = 0; i < M; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
    DSP.fft(re, im, true);
    const c = new Float64Array(L / 2 + 1); for (let t = 0; t <= L / 2; t++) c[t] = re[t] / re[0];
    hannCorrCache.set(L, c); return c;
  }
  const linFit = (x, y) => { // least squares y = a + b x, with R²
    const n = x.length; let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; syy += y[i] * y[i]; }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n, ss = syy - sy * sy / n;
    let res = 0; for (let i = 0; i < n; i++) res += (y[i] - a - b * x[i]) ** 2;
    return { a, b, r2: ss > 0 ? 1 - res / ss : 1 };
  };
  // S: csdMatrix; bin: the (approximate) peak; fs: sample rate.
  // o: {macMin 0.8, hi 0.9, lo 0.2 (the correlation extremes used), window true, cMin 0.5 (lags where the window
  // correlation is at least this), search 0 (bins to look for the top)}. Defaults chosen on simulated decks: unbiased
  // damping with the least scatter.
  function efdd(S, bin, fs, o = {}) {
    const macMin = o.macMin ?? 0.8, hi = o.hi ?? 0.9, lo = o.lo ?? 0.2, L = S.L, df = fs / L, last = S.bins - 2;
    const top = (k, warm) => topEigen(matrixAt(S, k), 1, warm, 60);
    let b = Math.max(1, Math.min(last, Math.round(bin))), best = top(b);
    for (let k = Math.max(1, b - (o.search || 0)); k <= Math.min(last, b + (o.search || 0)); k++) { if (k === b) continue; const t = top(k); if (t.vals[0] > best.vals[0]) { best = t; b = k; } }
    const phi = best.vecs[0], bell = new Map([[b, best.vals[0]]]);
    for (const dir of [-1, 1]) {
      let warm = [phi];
      for (let k = b + dir; k >= 1 && k <= last && Math.abs(k - b) <= (o.maxBins || 600); k += dir) {
        const t = top(k, warm); if (mac(t.vecs[0], phi) < macMin) break;
        bell.set(k, t.vals[0]); warm = t.vecs;
      }
    }
    const keys = [...bell.keys()].sort((x, y) => x - y), nl = L / 2, r = new Float64Array(nl + 1);
    for (const k of keys) { const g = bell.get(k), w = 2 * Math.PI * k / L; for (let n = 0; n <= nl; n++) r[n] += g * Math.cos(w * n); }
    let nMax = nl;
    if (o.window !== false) { const c = hannCorr(L); for (let n = 0; n <= nl; n++) { if (c[n] < (o.cMin ?? 0.5) && nMax === nl) nMax = n; r[n] = c[n] > 1e-6 ? r[n] / c[n] : 0; } }
    const r0 = r[0] || 1; for (let n = 0; n <= nl; n++) r[n] /= r0;
    // extremes (parabolic peak of 3 samples) from the first one below `hi` until the first one below `lo`
    const ext = [];
    for (let n = 1; n < nMax; n++) {
      const y0 = r[n - 1], y1 = r[n], y2 = r[n + 1];
      if ((y1 - y0) * (y2 - y1) >= 0) continue;
      const den = y0 - 2 * y1 + y2, d = den ? 0.5 * (y0 - y2) / den : 0, v = Math.abs(y1 - 0.25 * (y0 - y2) * d);
      if (v < lo) break;
      if (v <= hi) ext.push({ t: n + d, v });
    }
    const res = { bin: b, fPeak: b * df, f: b * df, fd: NaN, zeta: NaN, r2: NaN, n: ext.length, band: [keys[0] * df, keys[keys.length - 1] * df], bins: keys.length,
      shape: normShape(phi), corr: { r: r.slice(0, nMax + 1), fs, ext, fit: null } };
    if (ext.length < 3) { res.note = keys.length < 3 ? 'The mode\'s peak is too narrow – use fewer segments for damping' : 'Too few cycles in the correlation – lower the MAC level or use fewer segments'; return res; }
    const fit = linFit(ext.map(e => e.t), ext.map(e => Math.log(e.v)));
    const t0 = ext[0].t, t1 = ext[ext.length - 1].t, zc = [];
    for (let n = Math.floor(t0); n < Math.ceil(t1) && n < nMax; n++) if (r[n] === 0 || r[n] * r[n + 1] < 0) zc.push(n + r[n] / (r[n] - r[n + 1]));
    const sigma = -fit.b * fs;
    const fd = zc.length >= 2 ? fs / (2 * linFit(zc.map((_, j) => j), zc).b) : res.fPeak, wd = 2 * Math.PI * fd, wn = Math.hypot(sigma, wd);
    Object.assign(res, { f: wn / (2 * Math.PI), fd, zeta: sigma / wn, r2: fit.r2 });
    res.corr.fit = { a: fit.a, b: fit.b };
    return res;
  }
  // MAC of every pair of shapes
  const macMatrix = shapes => shapes.map(a => shapes.map(b => mac(a, b)));

  /* ---------- roving tests: several setups combined ---------- */
  // Each setup gives a mode shape over its own DOFs (complex, any scale and phase). A setup is scaled onto the shape
  // built so far through the DOFs they share – usually the fixed reference sensors – by least squares in amplitude and
  // phase (α = Σ conj(φs)·g / Σ |φs|²), and the scaled shapes are averaged DOF by DOF. Setups that share nothing yet
  // are tried again after the others. parts: [{keys: [DOF key…], shape: {re, im}}] in setup order.
  // Returns {keys, re, im (normalised: largest component 1), scale: [{re, im}], shared: [count], refMac: [MAC of the
  // shared part before merging; null when < 2 shared], unmerged: [setup indices that share no DOF with the rest]}.
  function mergeShapes(parts) {
    const acc = new Map(), done = parts.map(() => false), out = { scale: [], shared: [], refMac: [], unmerged: [] };
    const val = k => { const a = acc.get(k); return { re: a.re / a.n, im: a.im / a.n }; };
    const add = (i, sr, si) => {
      const pt = parts[i];
      pt.keys.forEach((k, j) => {
        const xr = pt.shape.re[j], xi = pt.shape.im[j], a = acc.get(k) || { re: 0, im: 0, n: 0 };
        a.re += xr * sr - xi * si; a.im += xr * si + xi * sr; a.n++; acc.set(k, a);
      });
      done[i] = true; out.scale[i] = { re: sr, im: si };
    };
    if (!parts.length) return Object.assign(out, { keys: [], re: new Float64Array(0), im: new Float64Array(0) });
    add(0, 1, 0); out.shared[0] = 0; out.refMac[0] = null;
    for (let progress = true; progress;) {
      progress = false;
      for (let i = 1; i < parts.length; i++) {
        if (done[i]) continue;
        const pt = parts[i], common = [];
        pt.keys.forEach((k, j) => { if (acc.has(k)) common.push([k, j]); });
        if (!common.length) continue;
        let nr = 0, ni = 0, dd = 0;
        for (const [k, j] of common) { const g = val(k), xr = pt.shape.re[j], xi = pt.shape.im[j]; nr += xr * g.re + xi * g.im; ni += xr * g.im - xi * g.re; dd += xr * xr + xi * xi; }
        out.shared[i] = common.length;
        out.refMac[i] = common.length > 1 ? mac({ re: common.map(([, j]) => pt.shape.re[j]), im: common.map(([, j]) => pt.shape.im[j]) },
          { re: common.map(([k]) => val(k).re), im: common.map(([k]) => val(k).im) }) : null;
        add(i, dd > 0 ? nr / dd : 0, dd > 0 ? ni / dd : 0); progress = true;
      }
    }
    out.unmerged = parts.map((_, i) => i).filter(i => !done[i]);
    out.keys = [...acc.keys()];
    const sh = normShape({ re: Float64Array.from(out.keys, k => val(k).re), im: Float64Array.from(out.keys, k => val(k).im) });
    out.re = sh.re; out.im = sh.im;
    return out;
  }
  // the first singular values of several setups as one curve to pick peaks on: each normalised by its mean and
  // interpolated onto the frequency grid (df, bins) of the first, then averaged. Returns [average, setup 1, setup 2 …].
  function combineSV(curves, dfs, df, bins) {
    const out = [new Float64Array(bins)];
    curves.forEach((c, s) => {
      let m = 0; for (let i = 1; i < c.length; i++) m += c[i]; m = m / Math.max(1, c.length - 1) || 1;
      const g = new Float64Array(bins);
      for (let i = 0; i < bins; i++) {
        const x = i * df / dfs[s], j = Math.floor(x), t = x - j;
        g[i] = j + 1 < c.length ? ((1 - t) * c[j] + t * c[j + 1]) / m : (c[c.length - 1] || 0) / m;
        out[0][i] += g[i] / curves.length;
      }
      out.push(g);
    });
    return out;
  }

  /* ---------- OpenSig geometry file (.osgeo, JSON) ---------- */
  // nodes, lines, surfaces, the cylinder axis and – optionally – the sensor layout by channel name
  // ({channel, node, dir, ref}), so the same test can be set up again with newly measured signals
  function writeGeometryFile(geo, o = {}) {
    const num = v => +(+v).toPrecision(12), rows = a => a.length ? '[\n    ' + a.map(x => JSON.stringify(x)).join(',\n    ') + '\n  ]' : '[]';
    const c = geo.cyl;
    return `{\n  "format": "OpenSig geometry",\n  "version": 1,\n  "name": ${JSON.stringify(o.name || '')},\n` +
      `  "nodes": ${rows(geo.nodes.map(n => Object.assign({ id: n.id, x: num(n.x), y: num(n.y), z: num(n.z) }, n.name ? { name: n.name } : {})))},\n` +
      `  "lines": ${rows(geo.lines)},\n  "surfaces": ${rows(geo.surfaces)},\n` +
      `  "cylinder": ${c ? JSON.stringify({ axis: c.axis, x: num(c.x), y: num(c.y), z: num(c.z) }) : 'null'},\n` +
      `  "sensors": ${rows((o.sensors || []).map(s => Object.assign({ channel: s.channel, node: s.node ?? null, dir: s.dir, ref: !!s.ref }, (s.setup || 1) > 1 ? { setup: s.setup } : {})))}\n}\n`;
  }
  function parseGeometryFile(text) {
    let j; try { j = JSON.parse(text); } catch (e) { throw new Error('This is not an OpenSig geometry file (it is not JSON)'); }
    if (!j || !Array.isArray(j.nodes)) throw new Error('This is not an OpenSig geometry file (it has no "nodes" list)');
    const skipped = [], nodes = new Map(), id = v => Math.round(+v);
    for (const n of j.nodes) {
      const q = n && { id: id(n.id), x: +n.x, y: +n.y, z: +n.z };
      if (q && typeof n.name === 'string' && n.name.trim()) q.name = n.name.trim();
      if (q && [q.id, q.x, q.y, q.z].every(Number.isFinite)) nodes.set(q.id, q); else skipped.push('node ' + JSON.stringify(n));
    }
    const known = list => Array.isArray(list) && list.every(x => nodes.has(id(x)));
    const lines = [], surfaces = [];
    for (const l of j.lines || []) if (known(l) && l.length === 2) lines.push(l.map(id)); else skipped.push('line ' + JSON.stringify(l));
    for (const f of j.surfaces || []) if (known(f) && f.length >= 3) surfaces.push(f.map(id)); else skipped.push('surface ' + JSON.stringify(f));
    const c = j.cylinder, cyl = c && 'XYZ'.includes(c.axis) && c.axis.length === 1 && [c.x, c.y, c.z].every(v => Number.isFinite(+v)) ? { axis: c.axis, x: +c.x, y: +c.y, z: +c.z } : null;
    const sensors = [];
    for (const s of j.sensors || []) {
      if (s && typeof s.channel === 'string' && DIR_NAMES.includes(s.dir)) sensors.push({ channel: s.channel, node: nodes.has(id(s.node)) ? id(s.node) : null, dir: s.dir, ref: !!s.ref, setup: Math.max(1, Math.round(+s.setup) || 1) });
      else skipped.push('sensor ' + JSON.stringify(s));
    }
    return { geometry: { nodes: [...nodes.values()], lines, surfaces }, cyl, sensors, name: typeof j.name === 'string' ? j.name : '', skipped };
  }

  /* ---------- example data: ambient vibration of a bridge deck ---------- */
  // A simply supported deck (span L, width B) on two abutments, with vertical accelerometers on both edges at the
  // inner stations. Four modes – 1st and 2nd vertical bending, 1st and 2nd torsion – are driven by independent random
  // forces (traffic and wind), each through a lightly damped resonator, plus a little broadband sensor noise.
  // Returns the geometry, the sensors ({title, node, dir, ref, side, station}), their signals (m/s²) and the true modes.
  function bridgeDeck(o = {}) {
    const L = o.span || 30, B = o.width || 8, ns = Math.max(3, o.stations || 7), fs = o.fs || 100, N = Math.round((o.seconds || 300) * fs);
    const modes = o.modes || [
      { name: '1st vertical bending', f: 3.2, zeta: 0.015, amp: 1, k: 1, torsion: false },
      { name: '1st torsion', f: 4.7, zeta: 0.015, amp: 0.7, k: 1, torsion: true },
      { name: '2nd vertical bending', f: 12.1, zeta: 0.012, amp: 0.5, k: 2, torsion: false },
      { name: '2nd torsion', f: 15.3, zeta: 0.012, amp: 0.35, k: 2, torsion: true }];
    // geometry: south edge 1…ns (y = 0), north edge 11… (y = B), abutment bearings 21–24 below the deck ends
    const dx = L / (ns - 1), S = i => 1 + i, Nn = i => 11 + i, h = 1.5, g = { nodes: [], lines: [], surfaces: [] };
    for (let i = 0; i < ns; i++) g.nodes.push({ id: S(i), x: tidy(i * dx), y: 0, z: 0 });
    for (let i = 0; i < ns; i++) g.nodes.push({ id: Nn(i), x: tidy(i * dx), y: B, z: 0 });
    g.nodes.push({ id: 21, x: 0, y: 0, z: -h }, { id: 22, x: 0, y: B, z: -h }, { id: 23, x: L, y: 0, z: -h }, { id: 24, x: L, y: B, z: -h });
    for (let i = 0; i < ns; i++) {
      g.lines.push([S(i), Nn(i)]);
      if (i + 1 < ns) { g.lines.push([S(i), S(i + 1)], [Nn(i), Nn(i + 1)]); g.surfaces.push([S(i), S(i + 1), Nn(i + 1), Nn(i)]); }
    }
    g.lines.push([S(0), 21], [Nn(0), 22], [21, 22], [S(ns - 1), 23], [Nn(ns - 1), 24], [23, 24]);
    g.surfaces.push([S(0), Nn(0), 22, 21], [S(ns - 1), Nn(ns - 1), 24, 23]);
    // sensors: vertical (+Z) on both edges at the inner stations; the references at station o.ref (default 2: x = L/3)
    const refSt = o.ref ?? 2, sensors = [];
    for (const side of ['south', 'north']) for (let i = 1; i < ns - 1; i++)
      sensors.push({ title: `Deck ${+(i * dx).toFixed(2)} m ${side} (+Z)`, node: side === 'south' ? S(i) : Nn(i), dir: '+Z', ref: i === refSt, side, station: i, x: i * dx });
    const shape = (m, s) => Math.sin(m.k * Math.PI * s.x / L) * (m.torsion ? (s.side === 'north' ? 1 : -1) : 1);
    // random forces → modal responses (2nd-order band-pass resonators), seeded so the example is the same every time
    let seed = o.seed || 20261020;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    const q = modes.map(m => {
      const w0 = 2 * Math.PI * m.f / fs, r = Math.exp(-m.zeta * w0), c1 = 2 * r * Math.cos(w0 * Math.sqrt(1 - m.zeta * m.zeta)), c2 = r * r;
      const y = new Float64Array(N); let y1 = 0, y2 = 0, e1 = 0, e2 = 0, ss = 0;
      for (let n = 0; n < N; n++) { const e = gauss(), v = c1 * y1 - c2 * y2 + e - e2; y[n] = v; y2 = y1; y1 = v; e2 = e1; e1 = e; ss += v * v; }
      const k = m.amp / Math.sqrt(ss / N); for (let n = 0; n < N; n++) y[n] *= k;
      return y;
    });
    const level = o.level || 0.02, noise = o.noise ?? 0.05;
    const signals = sensors.map(s => {
      const phi = modes.map(m => shape(m, s)), y = new Float64Array(N);
      for (let n = 0; n < N; n++) { let v = noise * gauss(); for (let j = 0; j < modes.length; j++) v += phi[j] * q[j][n]; y[n] = level * v; }
      return y;
    });
    return { geometry: g, sensors, signals, fs, modes: modes.map(m => Object.assign({}, m, { shape: sensors.map(s => shape(m, s)) })) };
  }

  const GEOMATH = { grid, box, cylinder, cone, circle, outline, translate, beam, merge, renumber, dirVector, DIR_NAMES, autoAssign, parseUFF, writeUFF, csdMatrix, matrixAt, topEigen, fdd, normShape, modeShape, odsShape, mac, peaks, fillUnmeasured, bridgeDeck, writeGeometryFile, parseGeometryFile, efdd, macMatrix, hannCorr, mergeShapes, combineSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = GEOMATH; else root.GEOMATH = GEOMATH;
})(typeof window !== 'undefined' ? window : globalThis);
