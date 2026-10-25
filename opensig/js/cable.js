/* OpenSig Cable tension module (3D tools ▸ Cable tension from vibration…, the button right of Geometry): the tension of
   a stay cable or hanger from an accelerometer fixed on it. The window shows the PSD of the visible part with the
   cable's harmonic series, its modes in a table and the tension by five methods – taut string, beam with hinged or
   clamped ends, a fit of several modes (which also finds the bending stiffness) and Zui et al. (1996) – with the bending
   (ξ) and sag (λ²) parameters and the ratio to the design tension. Click a mode, in the table or the plot, to leave it
   out or use it; click a method to choose it. Math: cablemath.js. */
(function (root) {
  'use strict';
  const { APP, UI, OPS, DSP } = root, CM = root.CABLEMATH;
  const S = APP.S, { h, toast, dialog, download } = UI;
  const views = new WeakMap();
  const P = w => w.op.params;
  const METHODS = [['fixed', 'Beam, clamped ends (exact)'], ['hinged', 'Beam, hinged ends'], ['string', 'Taut string'], ['fit', 'Fit of several modes (hinged, finds EI)'], ['zui', 'Zui et al. (1996)']];
  const defaults = () => ({ name: '', L: 0, m: 0, E: 195000, A: 0, I: 0, theta: 0, Tdesign: 0, method: 'fixed', fMin: 0.3, fMax: 0, f1: 0, maxModes: 10, nseg: 16, use: {} });
  const fmt = (v, d = 4) => isFinite(v) ? String(+(+v).toPrecision(d)) : '–';
  const kN = v => isFinite(v) ? (v / 1000).toFixed(1) : '–';
  const gam = g => g > 1e6 ? '∞ (no sag)' : fmt(g, 3); // Zui's Γ: infinite for a vertical hanger
  // the cable in SI units: E in MPa, A in mm², I in mm⁴, θ in degrees
  const cableOf = p => ({ L: +p.L, m: +p.m, EI: p.E * p.I * 1e-6, EA: p.E * p.A, theta: (p.theta || 0) * Math.PI / 180 });
  const known = p => p.L > 0 && p.m > 0;
  // the cable data last entered, for the next cable of the same bridge (this browser only)
  const KEEP = 'opensig.cable', KEPT = ['L', 'm', 'E', 'A', 'I', 'theta', 'Tdesign', 'method', 'fMin', 'fMax', 'maxModes', 'nseg'];
  const lastData = () => { try { return JSON.parse(localStorage.getItem(KEEP)) || {}; } catch { return {}; } };
  const keepData = p => { try { localStorage.setItem(KEEP, JSON.stringify(Object.fromEntries(KEPT.map(k => [k, p[k]])))); } catch { /* storage blocked */ } };

  /* ---------- the analysis ---------- */
  function analyse(d, p) {
    if (!d || !d.y) throw new Error('Waiting for the signal');
    if (d.x) throw new Error('The cable tension needs a uniformly sampled signal');
    if (d.y.length < 256) throw new Error('The visible part is too short – zoom out');
    const fs = 1 / d.dx, c = cableOf(p), have = known(p);
    const sp = DSP.svSpectrum(d.y, fs, { mode: 'segments', segmentCount: Math.max(1, Math.round(p.nseg)), segmentOverlap: 50, window: 'Hann', type: 'Power spectral density (PSD)', zeroPadding: '2 x Next power of 2', dB: false });
    const fMax = Math.min(p.fMax > 0 ? p.fMax : Infinity, 0.8 * fs / 2);
    const bOf = have && c.EI > 0 ? f => Math.PI ** 2 * c.EI / (4 * c.m * c.L ** 4 * f * f) : null; // π²EI/(TL²), T from the string
    const r = CM.findModes(sp.y, sp.x0, sp.dx, { fMin: p.fMin, fMax, f1: p.f1, maxModes: p.maxModes, bOf });
    const out = CM.outliers(r.modes), use = p.use || {};
    const modes = r.modes.map((m, k) => {
      const auto = !m.weak && !out[k], used = use[m.n] != null ? !!use[m.n] : auto;
      return Object.assign({}, m, { outlier: out[k], auto, used, Ts: have ? CM.stringTension(m.f, m.n, c) : NaN,
        Th: have && c.EI > 0 ? CM.hingedTension(m.f, m.n, c) : NaN, Tf: have && c.EI > 0 ? CM.fixedTension(m.f, m.n, c) : NaN });
    });
    const used = modes.filter(m => m.used), res = { sp, fs, fMax, fMin: Math.max(p.fMin || 0, sp.x0), modes, used, note: r.note, c };
    if (!have) return res;
    const mean = key => {
      const v = used.map(m => m[key]).filter(isFinite), n = v.length, T = n ? v.reduce((s, x) => s + x, 0) / n : NaN;
      return { T, sd: n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - T) ** 2, 0) / (n - 1)) : NaN, count: n };
    };
    const f1 = (used.find(m => m.n === 1) || {}).f, f2 = (used.find(m => m.n === 2) || {}).f;
    res.methods = { string: mean('Ts'), hinged: c.EI > 0 ? mean('Th') : null, fixed: c.EI > 0 ? mean('Tf') : null, fit: CM.fitTension(used, c), zui: CM.zui(f1, f2, c) };
    res.key = res.methods[p.method] ? p.method : 'string'; // a beam without EI is the string
    res.T = res.methods[res.key].T;
    res.par = res.T > 0 ? CM.parameters(res.T, c) : null;
    res.warn = warnings(res, p, c);
    return res;
  }
  function warnings(res, p, c) {
    const out = [], m = res.methods, par = res.par;
    if (!res.modes.length) out.push(res.note || 'No modes found – check the frequency range, or give the first frequency.');
    else if (res.used.length < 3) out.push('Fewer than 3 modes are used: the result rests on few peaks.');
    if (!(c.EI > 0) && (p.method === 'fixed' || p.method === 'hinged')) out.push('No bending stiffness given (I = 0): the taut-string formula is used.');
    if (res.key === 'string' && m.fixed && m.fixed.T > 0 && m.string.T / m.fixed.T > 1.02)
      out.push(`Bending stiffness matters${par ? ` (ξ = ${fmt(par.xi, 3)})` : ''}: the taut string gives ${fmt((m.string.T / m.fixed.T - 1) * 100, 2)} % more than the clamped beam.`);
    if (par && par.lambda2 > 0.12 && res.key !== 'zui' && res.used.some(x => x.n === 1))
      out.push(`Sag (λ² = ${fmt(par.lambda2, 2)}) raises the first mode by about ${fmt(400 * par.lambda2 / Math.PI ** 4, 2)} %: leave mode 1 out, or use Zui et al.`);
    if (res.key === 'zui' && m.zui.note) out.push(m.zui.note);
    if (res.key === 'fit' && m.fit.EI < 0) out.push('The fit gives a negative bending stiffness: the modes scatter. Leave the doubtful ones out, or use another method.');
    if (res.key === 'fit' && m.fit.EI > 0 && m.fit.T > 0) { const xi = c.L * Math.sqrt(m.fit.T / m.fit.EI); if (4 / xi > 0.01) out.push(`The fit assumes hinged ends. Clamped ends raise every frequency by about 2/ξ, so it gives about ${fmt(400 / xi, 2)} % too much here (ξ = ${fmt(xi, 3)}): with E·I known, use the clamped beam.`); }
    const off = res.modes.filter(x => x.outlier && !x.used).map(x => x.n);
    if (off.length) out.push(`Off the harmonic series and left out: mode ${off.join(', ')}. Click a mode to use it anyway.`);
    return out;
  }

  /* ---------- the operation ---------- */
  OPS.cable = {
    label: p => 'Cable tension' + (p && p.name ? ' – ' + p.name : ''), kind: 'display', input: 'visible',
    compute(w, [d]) {
      const v = viewOf(w);
      v.res = null; v.err = null;
      try { v.res = analyse(d, P(w)); } catch (e) { v.err = e.message; }
      queueMicrotask(() => render(w, v));
      const r = v.res;
      return { dom: v.root, note: r ? `${r.used.length} of ${r.modes.length} modes` + (r.T > 0 ? ` · T = ${kN(r.T)} kN` : '') + ` · Δf ${fmt(r.sp.dx, 3)} Hz` : v.err };
    }
  };

  /* ---------- the window ---------- */
  function viewOf(w) {
    let v = views.get(w); if (v) return v;
    w.op.params = Object.assign(defaults(), w.op.params || {});
    if (!w.op.params.use || typeof w.op.params.use !== 'object') w.op.params.use = {};
    v = { w, mouse: null };
    v.root = h('div', { class: 'geo cab' });
    v.root.innerHTML = '<div class="geo-bar"></div><div class="cab-plot"><canvas></canvas></div><div class="cab-res"><div class="cab-left"></div><div class="cab-right"></div></div>';
    v.bar = v.root.querySelector('.geo-bar'); v.canvas = v.root.querySelector('canvas');
    v.left = v.root.querySelector('.cab-left'); v.right = v.root.querySelector('.cab-right');
    buildBar(w, v);
    new ResizeObserver(() => draw(w, v)).observe(v.root.querySelector('.cab-plot'));
    v.canvas.addEventListener('mousemove', e => { const b = v.canvas.getBoundingClientRect(); v.mouse = [e.clientX - b.left, e.clientY - b.top]; draw(w, v); });
    v.canvas.addEventListener('mouseleave', () => { v.mouse = null; draw(w, v); });
    v.canvas.addEventListener('click', e => { const b = v.canvas.getBoundingClientRect(), m = nearMode(v, e.clientX - b.left); if (m) toggle(w, m); });
    views.set(w, v);
    return v;
  }
  const btn = (label, title, run) => { const b = h('button', { class: 'geo-btn', title }, label); b.onclick = e => UI.guard(run)(e); return b; };
  function buildBar(w, v) {
    const sel = h('select', { class: 'geo-sel', title: 'The method for the tension' }, ...METHODS.map(([k, l]) => h('option', { value: k }, l)));
    sel.value = P(w).method; sel.onchange = () => setMethod(w, sel.value);
    v.sel = sel; v.info = h('span', { class: 'cab-info' });
    v.bar.replaceChildren(btn('Cable data…', 'Length, mass, stiffness, design tension and the peak search', () => settings(w)), h('span', { class: 'cab-lab' }, 'Tension from'), sel,
      btn('Automatic modes', 'Use the modes chosen automatically again (undo your clicks on modes)', () => { P(w).use = {}; APP.queueCompute(w); }),
      btn('Copy', 'Copy the results as a table (for Excel or Word)', () => copy(w)), btn('Excel…', 'Save the results as an Excel workbook', () => excel(w)), v.info);
  }
  function setMethod(w, k) { P(w).method = k; keepData(P(w)); APP.queueCompute(w); }
  function toggle(w, m) {
    const use = P(w).use; use[m.n] = !m.used;
    if (use[m.n] === m.auto) delete use[m.n];
    APP.queueCompute(w);
  }

  function render(w, v) {
    const r = v.res, p = P(w);
    v.sel.value = p.method;
    if (!r) { v.left.replaceChildren(h('div', { class: 'cab-empty' }, v.err || 'No data')); v.right.replaceChildren(); draw(w, v); return; }
    // the result
    const left = [];
    if (!r.methods) left.push(h('div', { class: 'cab-empty' }, 'Enter the cable data – length and mass per metre at least – to get the tension. ', btn('Cable data…', '', () => settings(w))));
    else {
      const M = r.methods[r.key], name = METHODS.find(x => x[0] === r.key)[1];
      const spread = r.key === 'fit' ? (M.se > 0 ? ` · standard error ${fmt(M.se / M.T * 100, 2)} %` : '') : M.sd > 0 ? ` · scatter ${fmt(M.sd / M.T * 100, 2)} %` : '';
      const count = r.key === 'zui' ? (M.mode ? ` · from f${M.mode === 1 ? '₁' : '₂'}` : '') : ` · ${M.count} mode${M.count === 1 ? '' : 's'}`;
      left.push(h('div', { class: 'cab-T' }, 'T = ', h('b', {}, kN(r.T)), ' kN'), h('div', { class: 'cab-sub' }, name + count + spread));
      if (p.Tdesign > 0 && r.T > 0) {
        const q = r.T / (p.Tdesign * 1000) * 100;
        left.push(h('div', { class: 'cab-design ' + (Math.abs(q - 100) <= 5 ? 'ok' : 'off') }, `${fmt(q, 4)} % of the design tension ${kN(p.Tdesign * 1000)} kN (${q >= 100 ? '+' : '−'}${fmt(Math.abs(q - 100), 3)} %)`));
      }
      const f1 = r.used.find(m => m.n === 1), par = r.par;
      left.push(h('div', { class: 'cab-par' }, [f1 ? `f₁ = ${fmt(f1.f, 5)} Hz` : '', par && isFinite(par.xi) ? `ξ = ${fmt(par.xi, 3)}` : 'ξ = ∞ (no EI)',
        par && isFinite(par.lambda2) ? (par.lambda2 < 1e-4 ? 'λ² ≈ 0' : `λ² = ${fmt(par.lambda2, 2)}`) : '', par && par.sag > 1e-6 && isFinite(par.sag) ? `sag ${fmt(par.sag * 100, 2)} % of the span` : ''].filter(Boolean).join(' · ')));
      if (r.warn.length) left.push(h('ul', { class: 'cab-warn' }, ...r.warn.map(t => h('li', {}, t))));
      left.push(methodsTable(w, r));
    }
    v.left.replaceChildren(...left);
    v.right.replaceChildren(modesTable(w, r));
    draw(w, v);
  }
  function methodsTable(w, r) {
    const m = r.methods, c = r.c, rows = [];
    const row = (k, T, spread, note) => {
      const tr = h('tr', { class: k === r.key ? 'sel' : '', title: 'Use this method' }, h('td', {}, METHODS.find(x => x[0] === k)[1]), h('td', {}, kN(T)), h('td', {}, spread), h('td', { class: 'cab-note' }, note));
      tr.onclick = () => setMethod(w, k); rows.push(tr);
    };
    const sd = o => o && o.sd > 0 ? '± ' + fmt(o.sd / o.T * 100, 2) + ' %' : '';
    if (m.fixed) row('fixed', m.fixed.T, sd(m.fixed), `${m.fixed.count} modes`);
    if (m.hinged) row('hinged', m.hinged.T, sd(m.hinged), `${m.hinged.count} modes`);
    row('string', m.string.T, sd(m.string), `${m.string.count} modes`);
    row('fit', m.fit.T, m.fit.se > 0 ? '± ' + fmt(m.fit.se / m.fit.T * 100, 2) + ' %' : '',
      !isFinite(m.fit.EI) ? 'needs 2 modes or more' : m.fit.EI > 0 && m.fit.r2 >= 0.5 ? `EI = ${fmt(m.fit.EI, 3)} N·m²${c.EI > 0 ? ` (given ${fmt(c.EI, 3)})` : ''} · R² ${fmt(m.fit.r2, 4)}`
        : `EI not found: f/n hardly grows with n (R² ${fmt(m.fit.r2, 2)})`);
    row('zui', m.zui.T, '', m.zui.key ? `${m.zui.label} · Γ = ${gam(m.zui.gamma)}` : m.zui.note || '');
    return h('table', { class: 'cab-tab cab-methods' }, h('thead', {}, h('tr', {}, ...['Method', 'T (kN)', 'Spread', ''].map(t => h('th', {}, t)))), h('tbody', {}, ...rows));
  }
  function modesTable(w, r) {
    const beam = r.c.EI > 0 && r.methods;
    const head = ['Use', 'n', 'f (Hz)', 'f/n (Hz)', 'Peak (dB)', ...(r.methods ? ['T string (kN)'] : []), ...(beam ? ['T hinged (kN)', 'T clamped (kN)'] : []), ''];
    const rows = r.modes.map(m => {
      const cb = h('input', { type: 'checkbox', title: 'Use this mode' }); cb.checked = m.used;
      const note = m.used === m.auto ? (m.weak ? 'weak peak' : m.outlier ? 'off the series' : '') : m.used ? 'used by you' : 'left out by you';
      const tr = h('tr', { class: m.used ? '' : 'off' }, h('td', {}, cb), h('td', {}, String(m.n)), h('td', {}, m.f.toFixed(4)), h('td', {}, (m.f / m.n).toFixed(4)),
        h('td', {}, fmt(m.prom, 3)), ...(r.methods ? [h('td', {}, kN(m.Ts))] : []), ...(beam ? [h('td', {}, kN(m.Th)), h('td', {}, kN(m.Tf))] : []), h('td', { class: 'cab-note' }, note));
      tr.onclick = () => toggle(w, m);
      return tr;
    });
    return h('table', { class: 'cab-tab cab-modes' }, h('thead', {}, h('tr', {}, ...head.map(t => h('th', { title: t === 'Peak (dB)' ? 'Height of the peak above the local median of the spectrum' : '' }, t)))), h('tbody', {}, ...rows));
  }

  /* ---------- the spectrum ---------- */
  function layout(v) {
    const r = v.res, W = v.canvas.clientWidth, H = v.canvas.clientHeight;
    if (!r || !W || !H) return null;
    const L = 56, R = 12, T = 16, B = 32, fa = r.fMin, fb = r.fMax, sp = r.sp;
    const k0 = Math.max(0, Math.ceil((fa - sp.x0) / sp.dx)), k1 = Math.min(sp.y.length - 1, Math.floor((fb - sp.x0) / sp.dx));
    let hi = -Infinity, lo = Infinity;
    for (let k = k0; k <= k1; k++) { const d = 10 * Math.log10(Math.max(sp.y[k], 1e-300)); if (d > hi) hi = d; if (d < lo) lo = d; }
    hi = Math.ceil((hi + 3) / 10) * 10; lo = Math.max(Math.floor(lo / 10) * 10, hi - 90);
    return { W, H, L, R, T, B, fa, fb, k0, k1, hi, lo, X: f => L + (f - fa) / (fb - fa) * (W - L - R), Y: d => T + (hi - d) / (hi - lo) * (H - T - B), F: x => fa + (x - L) / (W - L - R) * (fb - fa) };
  }
  function nearMode(v, x) {
    const g = layout(v); if (!g) return null;
    let best = null, bd = 7; for (const m of v.res.modes) { const d = Math.abs(g.X(m.f) - x); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  const ticks = (a, b, n) => { const raw = (b - a) / n, mag = 10 ** Math.floor(Math.log10(raw)), st = [1, 2, 5, 10].map(k => k * mag).find(s => s >= raw) || raw, out = []; for (let t = Math.ceil(a / st) * st; t <= b + 1e-9 * st; t += st) out.push(+t.toPrecision(12)); return out; };
  function draw(w, v) {
    const cv = v.canvas, dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d'), cs = getComputedStyle(v.root), col = k => cs.getPropertyValue(k).trim();
    const bg = col('--geo-bg') || '#fff', ink = col('--geo-ink') || '#222', muted = col('--geo-muted') || '#888', grid = col('--geo-line') || '#ddd';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.font = '11px ' + (col('--sans') || 'sans-serif');
    const g = layout(v), r = v.res;
    if (!g || g.k1 <= g.k0) { ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText(v.err || 'No spectrum in the frequency range', W / 2, H / 2); if (v.info) v.info.textContent = ''; return; }
    // grid and axes
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const t of ticks(g.fa, g.fb, Math.max(3, Math.floor((W - 70) / 70)))) { const x = Math.round(g.X(t)) + 0.5; ctx.beginPath(); ctx.moveTo(x, g.T); ctx.lineTo(x, H - g.B); ctx.stroke(); ctx.fillText(String(t), x, H - g.B + 4); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const t of ticks(g.lo, g.hi, Math.max(2, Math.floor((H - 50) / 40)))) { const y = Math.round(g.Y(t)) + 0.5; ctx.beginPath(); ctx.moveTo(g.L, y); ctx.lineTo(W - g.R, y); ctx.stroke(); ctx.fillText(String(t), g.L - 5, y); }
    ctx.strokeStyle = muted; ctx.strokeRect(g.L + 0.5, g.T + 0.5, W - g.L - g.R - 1, H - g.T - g.B - 1);
    ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('Hz', W - g.R, H - 2);
    ctx.save(); ctx.translate(12, g.T + (H - g.T - g.B) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PSD (dB)', 0, 0); ctx.restore();
    // the spectrum: one vertical stroke per pixel column where lines are denser than pixels
    const sp = r.sp, db = k => 10 * Math.log10(Math.max(sp.y[k], 1e-300));
    ctx.save(); ctx.beginPath(); ctx.rect(g.L, g.T, W - g.L - g.R, H - g.T - g.B); ctx.clip();
    ctx.strokeStyle = '#1d63c4'; ctx.lineWidth = 1.2; ctx.beginPath();
    let px = null, mn = 0, mx = 0, first = true;
    const flush = () => { if (px == null) return; const a = g.Y(mx), b = g.Y(mn); if (first) { ctx.moveTo(px, a); first = false; } else ctx.lineTo(px, a); if (b - a > 0.5) ctx.lineTo(px, b); };
    for (let k = g.k0; k <= g.k1; k++) {
      const x = Math.round(g.X(sp.x0 + k * sp.dx)), d = db(k);
      if (x !== px) { flush(); px = x; mn = mx = d; } else { if (d < mn) mn = d; if (d > mx) mx = d; }
    }
    flush(); ctx.stroke();
    // the modes: green = used, red = off the series, grey = weak or left out
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = 'bold 11px ' + (col('--sans') || 'sans-serif');
    for (const m of r.modes) {
      const x = Math.round(g.X(m.f)) + 0.5, c = m.used ? '#1a8f2e' : m.outlier ? '#d22' : muted;
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = m.used ? 1.4 : 1; ctx.setLineDash(m.used ? [] : [4, 3]);
      ctx.beginPath(); ctx.moveTo(x, g.T + 14); ctx.lineTo(x, H - g.B); ctx.stroke(); ctx.fillText(String(m.n), x, g.T + 1);
    }
    ctx.setLineDash([]);
    // the pointer
    let info = '';
    if (v.mouse && v.mouse[0] >= g.L && v.mouse[0] <= W - g.R) {
      const f = g.F(v.mouse[0]), k = Math.round((f - sp.x0) / sp.dx), m = nearMode(v, v.mouse[0]);
      ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(v.mouse[0]) + 0.5, g.T); ctx.lineTo(Math.round(v.mouse[0]) + 0.5, H - g.B); ctx.stroke();
      info = m ? `mode ${m.n}: ${m.f.toFixed(4)} Hz – click to ${m.used ? 'leave it out' : 'use it'}` : `${fmt(f, 5)} Hz · ${k >= 0 && k < sp.y.length ? fmt(db(k), 4) : '–'} dB`;
    }
    ctx.restore();
    if (v.info) v.info.textContent = info;
  }

  /* ---------- the cable data ---------- */
  function fieldsOf(p) {
    return [
      { type: 'section', label: 'Cable' },
      { key: 'name', label: 'Name', type: 'text', value: p.name || '', hint: 'e.g. S12 upstream' },
      { key: 'L', label: 'Length L (m)', type: 'number', value: p.L || '', min: 0, hint: 'the vibrating length, between the anchorages or dampers' },
      { key: 'm', label: 'Mass per metre m (kg/m)', type: 'number', value: p.m || '', min: 0, hint: 'everything that vibrates: steel, sheath, grout, wax' },
      { key: 'E', label: 'Elastic modulus E (MPa)', type: 'number', value: p.E, min: 0 },
      { key: 'A', label: 'Steel area A (mm²)', type: 'number', value: p.A || 0, min: 0, hint: 'for the sag parameters λ² and Γ' },
      { key: 'I', label: 'Moment of inertia I (mm⁴)', type: 'number', value: p.I || 0, min: 0, hint: 'bending stiffness E·I; 0 = none (string)' },
      { key: 'theta', label: 'Inclination θ (°)', type: 'number', value: p.theta || 0, min: 0, max: 90, hint: 'from horizontal; 90 = vertical hanger' },
      { key: 'Tdesign', label: 'Design tension (kN)', type: 'number', value: p.Tdesign || 0, min: 0, hint: '0 = no comparison' },
      { type: 'section', label: 'Tension' },
      { key: 'method', label: 'Tension from', type: 'select', options: METHODS, value: p.method },
      { type: 'section', label: 'Peak search' },
      { key: 'fMin', label: 'Lowest frequency (Hz)', type: 'number', value: p.fMin, min: 0 },
      { key: 'fMax', label: 'Highest frequency (Hz)', type: 'number', value: p.fMax || 0, min: 0, hint: '0 = 80 % of half the sample rate' },
      { key: 'f1', label: 'First frequency, about (Hz)', type: 'number', value: p.f1 || 0, min: 0, hint: '0 = found automatically' },
      { key: 'maxModes', label: 'Modes, at most', type: 'number', value: p.maxModes, min: 1, max: 40, step: 1 },
      { key: 'nseg', label: 'Averaged segments', type: 'number', value: p.nseg, min: 1, max: 64, step: 1, hint: 'more: a smoother spectrum, but a coarser resolution' }];
  }
  const askData = (p, title) => dialog({ title: title || 'Cable data', intro: 'Units: m, kg/m, MPa, mm², mm⁴, degrees, kN. The tension needs L and m; I adds the bending stiffness, A and θ the sag.', fields: fieldsOf(p),
    validate: x => !(x.L > 0) ? 'Enter the length L' : !(x.m > 0) ? 'Enter the mass per metre m' : null });
  const clean = v => Object.assign(v, { maxModes: Math.max(1, Math.round(v.maxModes || 10)), nseg: Math.max(1, Math.round(v.nseg || 16)) });
  async function settings(w) {
    const p = P(w), v = await askData(p); if (!v) return;
    Object.assign(p, clean(v)); keepData(p);
    w.title = OPS.cable.label(p); w.updateTitle(); APP.queueCompute(w);
  }

  /* ---------- results out ---------- */
  function rowsOf(w) {
    const r = viewOf(w).res, p = P(w), c = cableOf(p), parent = S.wins.get(w.parents[0]);
    if (!r || !r.methods) throw new Error('No tension yet – enter the cable data first');
    const m = r.methods, info = [
      ['Cable', p.name || ''], ['Signal', parent ? parent.id + '#' + parent.title : ''], ['Length L (m)', p.L], ['Mass per metre m (kg/m)', p.m], ['E (MPa)', p.E], ['A (mm²)', p.A], ['I (mm⁴)', p.I],
      ['EI (N·m²)', c.EI], ['Inclination θ (°)', p.theta], ['Design tension (kN)', p.Tdesign || ''], [],
      ['Tension T (kN)', r.T / 1000], ['Method', METHODS.find(x => x[0] === r.key)[1]], ['% of design', p.Tdesign > 0 ? r.T / (p.Tdesign * 10) : ''],
      ['ξ = L√(T/EI)', r.par ? r.par.xi : ''], ['λ² (Irvine)', r.par ? r.par.lambda2 : ''], ['Sag / span', r.par ? r.par.sag : ''], [],
      ['Method', 'T (kN)', 'Scatter or standard error (%)', 'Note'],
      ...(m.fixed ? [['Beam, clamped ends (exact)', m.fixed.T / 1000, m.fixed.sd / m.fixed.T * 100, m.fixed.count + ' modes']] : []),
      ...(m.hinged ? [['Beam, hinged ends', m.hinged.T / 1000, m.hinged.sd / m.hinged.T * 100, m.hinged.count + ' modes']] : []),
      ['Taut string', m.string.T / 1000, m.string.sd / m.string.T * 100, m.string.count + ' modes'],
      ['Fit of several modes (hinged ends)', m.fit.T / 1000, m.fit.se / m.fit.T * 100, `EI = ${fmt(m.fit.EI, 4)} N·m², R² = ${fmt(m.fit.r2, 5)}`],
      ['Zui et al. (1996)', m.zui.T / 1000, '', m.zui.key ? `${m.zui.label}, Γ = ${gam(m.zui.gamma)}` : m.zui.note || ''], [],
      ['Spectrum', `PSD, Hann window, ${r.sp.segments} segments with 50 % overlap, ${r.sp.segLen} samples each, line spacing ${fmt(r.sp.dx, 4)} Hz`]];
    const modes = [['Mode n', 'f (Hz)', 'f/n (Hz)', 'Peak (dB)', 'T string (kN)', 'T hinged (kN)', 'T clamped (kN)', 'Used'],
      ...r.modes.map(o => [o.n, o.f, o.f / o.n, o.prom, o.Ts / 1000, o.Th / 1000, o.Tf / 1000, o.used ? 'yes' : 'no'])];
    return { info, modes };
  }
  const num = v => typeof v === 'number' ? (isFinite(v) ? String(+v.toPrecision(7)) : '') : String(v ?? '');
  async function copy(w) {
    const { info, modes } = rowsOf(w);
    await navigator.clipboard.writeText([...info, [], ...modes].map(r => r.map(num).join('\t')).join('\r\n'));
    toast('Results copied');
  }
  function excel(w) {
    const { info, modes } = rowsOf(w), cell = v => typeof v === 'number' && !isFinite(v) ? '' : v;
    download(UI.safeName(w.title) + '.xlsx', root.FORMATS.xlsx([
      { name: 'Tension', header: 0, widths: [30, 18, 26, 44], rows: [[{ v: w.title, bold: true }], [], ...info.map(r => r.map(cell))] },
      { name: 'Modes', widths: [8, 12, 12, 10, 14, 14, 14, 7], rows: modes.map((r, i) => i ? r.map((v, k) => k && k < 7 ? { v: cell(v), fmt: k < 3 ? '0.000' : '0.00' } : v) : r) }]));
  }

  /* ---------- commands ---------- */
  async function newCable(src) {
    const s = src || S.active;
    if (!s || s.kind !== '1d' || !s.data || !s.data.y || s.data.x) throw new Error('Select the accelerometer signal first (a time signal window), then choose Cable tension.');
    const p = Object.assign(defaults(), lastData(), { name: '', use: {} }), v = await askData(p, 'Cable tension – cable data');
    if (!v) return null;
    Object.assign(p, clean(v)); keepData(p);
    return open(s, p);
  }
  function open(s, p, rect) {
    const dw = S.desktop.clientWidth || 1000, dh = S.desktop.clientHeight || 700, rw = Math.min(1060, dw - 20), rh = Math.min(700, dh - 20);
    return APP.derive(s, 'cable', p, { rect: rect || { x: Math.max(0, dw - rw - 10), y: Math.max(0, (dh - rh) / 4), w: rw, h: rh } });
  }
  // Help ▸ Examples: a stay cable (long: bending hardly matters) and an arch hanger (short and stiff: it does)
  function example(o) {
    const dw = S.desktop.clientWidth || 1000, dh = S.desktop.clientHeight || 700, left = Math.round(dw * 0.34), p = Object.assign(defaults(), o.p);
    const y = CM.simulate(Object.assign({ c: cableOf(p), bc: 'fixed', rms: 0.03, noise: 0.002 }, o.sim));
    const s = APP.createWindow({ kind: '1d', title: o.title, source: { type: 'generator' }, data: { y, x0: 0, dx: 1 / o.sim.fs, xUnit: 's', yUnit: 'm/s²' },
      rect: { x: 0, y: 0, w: left - 4, h: Math.round(dh * 0.45) } });
    return open(s, p, { x: left, y: 0, w: dw - left, h: dh });
  }
  const stayExample = () => example({ title: 'Stay cable S12 – accelerometer 3.6 m above the deck anchorage',
    p: { name: 'S12 (stay cable, 37 strands)', L: 80, m: 60, E: 195000, A: 5550, I: 110300, theta: 30, Tdesign: 3000, method: 'fixed', fMin: 0.3, maxModes: 10 },
    sim: { T: 2.95e6, fs: 50, seconds: 600, modes: 14, x: 0.045, extra: [{ f: 0.62, rms: 0.02 }] } });
  const hangerExample = () => example({ title: 'Arch hanger H3 – accelerometer 1.3 m above the deck',
    p: { name: 'H3 (arch hanger, bar Ø60)', L: 12, m: 22.2, E: 205000, A: 2827, I: 636200, theta: 90, Tdesign: 480, method: 'fixed', fMin: 1, maxModes: 8 },
    sim: { T: 4.5e5, fs: 400, seconds: 300, modes: 10, x: 0.11, rms: 0.05 } });

  const m3d = UI.MENUS.find(m => m.label === '3D tools');
  if (m3d) m3d.items.push({ label: 'Cable tension from vibration…', run: () => newCable() });
  // toolbar: a large button right of Geometry – a cable-stayed pylon whose longest stay vibrates, with the accelerometer
  // on it (drawn for OpenSig)
  const CABLE_ICON = '<svg viewBox="5 6 38 38" aria-hidden="true">' +
    '<path d="M16 6.5v33.5" stroke="#555" stroke-width="2.8" stroke-linecap="round"/>' +
    '<path d="M5 32h37v3H5z" fill="#bcd4f3" stroke="#1d4f8a" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M16 9L6.5 32M16 12.5l-5 19.5M16 12.5l11 19.5" stroke="#1d4f8a" stroke-width="1.2" fill="none"/>' +
    '<path d="M16 9Q18.34 15.08 24.67 16.67T33.33 24.33T42 32" fill="none" stroke="#d22" stroke-width="2.3" stroke-linecap="round"/>' +
    '<rect x="34.9" y="27.5" width="3.6" height="3.6" rx=".6" fill="#222" transform="rotate(41.5 36.7 29.3)"/></svg>';
  UI.TOOLBAR_SIDE.push(UI.TB(CABLE_ICON, 'Cable tension from vibration', '3D tools', 'Cable tension from vibration…', { cls: 'tb-big' }));
  const exMenu = UI.findItem('Help', 'Examples');
  for (const [label, run] of [['Stay cable: tension from ambient vibration', stayExample], ['Arch hanger: tension with bending stiffness', hangerExample]]) {
    UI.EXAMPLES[label] = run;
    if (exMenu && exMenu.sub) exMenu.sub.push({ label, run });
  }
  const prevExtra = UI.extraWindowItems;
  UI.extraWindowItems = w => {
    const out = prevExtra ? prevExtra(w) : [];
    if (w.op && w.op.type === 'cable') out.unshift({ label: 'Cable data…', run: () => settings(w) }, { label: 'Copy results', run: () => copy(w) }, { label: 'Save results as Excel…', run: () => excel(w) }, '-');
    return out;
  };

  root.CABLE = { newCable, stayExample, hangerExample, analyse };
})(window);
