/* OpenSig Cable tension module (3D tools ▸ Cable tension from vibration…, the button right of Geometry): the tension of
   a stay cable or hanger from an accelerometer fixed on it. The chain is signal → spectrum window → cable window: the
   spectrum is one the signal already has (chosen in the dialog) or a new PSD window, and the peaks are those of its
   peak detection (Signal tools ▸ Peak detection…, switched on with the prominence method if it is off); the cable
   window numbers them as the cable's harmonic series. It shows the spectrum with the detected peaks and the modes, a
   table of the modes and the tension by five methods – taut string, beam with hinged or clamped ends, a fit of several
   modes (which also finds the bending stiffness) and Zui et al. (1996) – with the bending (ξ) and sag (λ²) parameters
   and the ratio to the design tension, or (Calculation steps) every step of the calculation with the cable's numbers.
   Click a mode, in the table or the plot, to leave it out or use it; click a method to choose it. Math: cablemath.js. */
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
  // a spectrum window's X unit per Hz (Hz, CPM, kHz, MHz); a time signal has none
  const perHz = d => d && d.y && !d.x ? (DSP.SV_XUNITS || {})[d.xUnit] : undefined;
  const isSpectrum = d => perHz(d) != null;
  // the peak detection a new PSD window starts with: peaks at least 8 dB above the valleys beside them, between lines
  const PEAKS = () => Object.assign(DSP.defaultPeakSettingsAll([]), { on: true, method: 'prominence', prom: 8, useHeight: false, distance: 1, minWidth: 0, negative: false, refine: 'parabolic' });
  const methodName = s => (DSP.PEAK_METHODS.find(m => m[0] === (s && s.method || 'threshold')) || [0, 'Threshold'])[1] + (s && s.method === 'prominence' ? `, prominence ≥ ${s.prom}` : '');

  /* ---------- the analysis ---------- */
  // d: the parent's visible part – a spectrum with peak detection (src), or the signal itself in cable windows made by the
  // first version (then the PSD and the standard peak detection are calculated here)
  function analyse(d, p, src) {
    if (!d || !d.y) throw new Error('Waiting for the spectrum');
    const c = cableOf(p), have = known(p);
    let spec, peaks, sp = null, fTop;
    if (isSpectrum(d)) {
      const k = perHz(d), u = d.yUnit || '';
      spec = { db: /^dB/.test(u) ? d.y : Float64Array.from(d.y, v => (/²/.test(u) ? 10 : 20) * Math.log10(Math.max(Math.abs(v), 1e-300))), f0: d.x0 / k, df: d.dx / k };
      fTop = spec.f0 + (spec.db.length - 1) * spec.df;
      const pk = src && APP.peaksOf(src);
      if (!pk) return { needPeaks: true, spec, c, peaks: [], modes: [], used: [], fMin: Math.max(p.fMin || 0, spec.f0), fMax: Math.min(p.fMax > 0 ? p.fMax : Infinity, fTop) };
      peaks = pk.x.filter((_, i) => !pk.neg[i]).map(x => ({ f: x / k }));
    } else {
      if (d.x) throw new Error('The cable tension needs a uniformly sampled signal, or its spectrum');
      if (d.y.length < 256) throw new Error('The visible part is too short – zoom out');
      const fs = 1 / d.dx;
      sp = DSP.svSpectrum(d.y, fs, { mode: 'segments', segmentCount: Math.max(1, Math.round(p.nseg)), segmentOverlap: 50, window: 'Hann', type: 'Power spectral density (PSD)', zeroPadding: '2 x Next power of 2', dB: true });
      spec = { db: sp.y, f0: sp.x0, df: sp.dx }; fTop = 0.8 * fs / 2;
      peaks = DSP.detectPeaks(sp.y, PEAKS()).idx.map(i => ({ f: sp.x0 + DSP.refinePeak(sp.y, i, 'parabolic').pos * sp.dx }));
    }
    const fMax = Math.min(p.fMax > 0 ? p.fMax : Infinity, fTop);
    const bOf = have && c.EI > 0 ? f => Math.PI ** 2 * c.EI / (4 * c.m * c.L ** 4 * f * f) : null; // π²EI/(TL²), T from the string
    const r = CM.assignModes(peaks, spec, { fMin: p.fMin, fMax, f1: p.f1, maxModes: p.maxModes, bOf });
    const out = CM.outliers(r.modes), use = p.use || {};
    const modes = r.modes.map((m, k) => {
      const auto = !m.weak && !out[k], used = use[m.n] != null ? !!use[m.n] : auto;
      return Object.assign({}, m, { outlier: out[k], auto, used, Ts: have ? CM.stringTension(m.f, m.n, c) : NaN,
        Th: have && c.EI > 0 ? CM.hingedTension(m.f, m.n, c) : NaN, Tf: have && c.EI > 0 ? CM.fixedTension(m.f, m.n, c) : NaN });
    });
    const used = modes.filter(m => m.used), res = { spec, sp, peaks: r.peaks, fMax, fMin: Math.max(p.fMin || 0, spec.f0), modes, used, note: r.note, c, base: r.base, bInh: r.b };
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
    if (!res.modes.length) out.push((res.note || 'No modes found') + ' – check the frequency range and the peak detection (Peak detection…), or give the first frequency.');
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
      try { v.res = analyse(d, P(w), S.wins.get(w.parents[0])); } catch (e) { v.err = e.message; }
      queueMicrotask(() => render(w, v));
      const r = v.res;
      return { dom: v.root, note: !r ? v.err : r.needPeaks ? 'Peak detection is off in the spectrum window'
        : `${r.peaks.length} peaks, ${r.used.length} of ${r.modes.length} modes used` + (r.T > 0 ? ` · T = ${kN(r.T)} kN` : '') + ` · Δf ${fmt(r.spec.df, 3)} Hz` };
    }
  };

  /* ---------- the window ---------- */
  function viewOf(w) {
    let v = views.get(w); if (v) return v;
    w.op.params = Object.assign(defaults(), w.op.params || {});
    if (!w.op.params.use || typeof w.op.params.use !== 'object') w.op.params.use = {};
    v = { w, mouse: null };
    v.root = h('div', { class: 'geo cab' });
    v.root.innerHTML = '<div class="geo-bar"></div><div class="cab-plot"><canvas></canvas></div><div class="cab-res"><div class="cab-left"></div><div class="cab-right"></div><div class="cab-calc" hidden></div></div>';
    v.bar = v.root.querySelector('.geo-bar'); v.canvas = v.root.querySelector('canvas');
    v.left = v.root.querySelector('.cab-left'); v.right = v.root.querySelector('.cab-right'); v.calc = v.root.querySelector('.cab-calc');
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
    v.calcBtn = btn('Calculation steps', 'Show how the tension is calculated, step by step, with the numbers of this cable (again: back to the results)', () => { w.display.cabCalc = !w.display.cabCalc; render(w, v); });
    v.bar.replaceChildren(btn('Cable data…', 'Length, mass, stiffness, design tension and the modes searched', () => settings(w)),
      btn('Peak detection…', 'The peak detection of the spectrum window (Signal tools ▸ Peak detection…): method and settings', () => peakSettings(w)), h('span', { class: 'cab-lab' }, 'Tension from'), sel,
      btn('Automatic modes', 'Use the modes chosen automatically again (undo your clicks on modes)', () => { P(w).use = {}; APP.queueCompute(w); }), v.calcBtn,
      btn('Copy', 'Copy the results – or, with the calculation steps shown, the calculation – as a table (for Excel or Word)', () => copy(w)), btn('Excel…', 'Save the results and the calculation steps as an Excel workbook', () => excel(w)), v.info);
  }
  function setMethod(w, k) { P(w).method = k; keepData(P(w)); APP.queueCompute(w); }
  // the peak detection dialog of the spectrum window; the cable window follows its settings
  function peakSettings(w) {
    const src = S.wins.get(w.parents[0]);
    if (!src || !isSpectrum(src.data)) throw new Error('This cable window reads the signal itself (it was made by an earlier version), with the standard peak detection. Choose Cable tension again on the signal to get a spectrum window with its own peak detection.');
    if (!src.display.peaks) APP.setPeaks(src, PEAKS());
    APP.activate(src);
    return UI.findItem('Signal tools', 'Peak detection…').run();
  }
  function toggle(w, m) {
    const use = P(w).use; use[m.n] = !m.used;
    if (use[m.n] === m.auto) delete use[m.n];
    APP.queueCompute(w);
  }

  function render(w, v) {
    const r = v.res, p = P(w);
    v.sel.value = p.method;
    const calc = !!w.display.cabCalc && !!r && !r.needPeaks; // the calculation steps instead of the results
    v.calcBtn.classList.toggle('on', !!w.display.cabCalc);
    v.left.hidden = v.right.hidden = calc; v.calc.hidden = !calc; v.root.classList.toggle('cab-calc-on', calc);
    if (calc) renderCalc(w, v);
    if (!r) { v.left.replaceChildren(h('div', { class: 'cab-empty' }, v.err || 'No data')); v.right.replaceChildren(); draw(w, v); return; }
    const src = S.wins.get(w.parents[0]), srcName = src ? src.id + '#' + src.title : '';
    if (r.needPeaks) {
      v.left.replaceChildren(h('div', { class: 'cab-empty' }, `The modes are found among the peaks that the peak detection of the spectrum window ${srcName} finds – and it is off. `,
        btn('Turn it on', 'Peak detection with the prominence method: peaks 8 dB above the valleys beside them', () => APP.setPeaks(src, PEAKS())), ' ', btn('Peak detection…', 'Choose the method and its settings', () => peakSettings(w))));
      v.right.replaceChildren(); draw(w, v); return;
    }
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
    left.push(h('div', { class: 'cab-sub' }, r.sp ? `${r.peaks.length} peaks found by the standard peak detection (${methodName(PEAKS())}) in a PSD of the signal`
      : `${r.peaks.length} peaks found by the peak detection of ${srcName} (${methodName(src && src.display.peaks)})`));
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

  /* ---------- the calculation, step by step ---------- */
  // Sections { id, title, chosen, items } of items { p } (text with $inline TeX$), { eq } (a formula in TeX) or
  // { table: { head, rows } } – drawn as MathML in the window (texmath.js), as plain text in Copy and Excel
  const tn = (v, d = 5) => { // a number in TeX: 2.95×10⁶ for large and small ones
    if (!isFinite(v)) return v > 0 ? '\\infty' : '\\text{–}';
    const a = Math.abs(v);
    if (a && (a >= 1e6 || a < 1e-3)) { let e = Math.floor(Math.log10(a)), x = +(v / 10 ** e).toPrecision(d); if (Math.abs(x) >= 10) { x /= 10; e++; } return `${x}\\times 10^{${e}}`; }
    return String(+v.toPrecision(d));
  };
  const tp = v => v < 0 ? `\\left(${tn(v)}\\right)` : tn(v), tk = v => tn(v / 1000); // in brackets when negative; N → kN
  const ZUI_TEX = { '1a': '1 - 2.20\\,r - 0.550\\,r^2', '1b': '0.865 - 11.6\\,r^2', '1c': '0.828 - 10.5\\,r^2',
    '2a': '1 - 4.40\\,r - 1.10\\,r^2', '2b': '1.03 - 6.33\\,r - 1.58\\,r^2', '2c': '0.882 - 85.0\\,r^2' };
  const whyOff = m => m.used !== m.auto ? 'left out by you' : m.weak ? 'weak peak' : m.outlier ? 'off the series' : '';
  function steps(w, r) {
    const p = P(w), c = r.c, src = S.wins.get(w.parents[0]), srcName = src ? src.id + '#' + src.title : '';
    const out = [], used = r.used, ex = used[0], tab = (head, rows) => ({ table: { head, rows } });
    let k = 0; const sec = (id, title, items) => out.push({ id, title: `${++k}. ${title}`, items, chosen: !!r.methods && id === r.key });
    const avg = M => !M || !M.count ? [{ p: 'No mode gives a tension here.' }] : [ // the mean over the modes used, and its scatter
      { eq: `T = \\frac{1}{N}\\sum_{n} T_n = \\frac{${tk(M.T * M.count)}}{${M.count}} = ${tk(M.T)}\\text{ kN}` },
      ...(M.count > 1 ? [{ eq: `s = \\sqrt{\\frac{\\sum_{n} (T_n - T)^2}{N - 1}} = ${tk(M.sd)}\\text{ kN} = ${tn(M.sd / M.T * 100, 3)}\\text{ % of }T` }] : [])];
    // the cable
    const data = [{ p: `$L = ${tn(c.L)}$ m, $m = ${tn(c.m)}$ kg/m, $\\theta = ${tn(p.theta || 0)}$°, $g = 9.80665$ m/s².` }];
    data.push(c.EI > 0 ? { eq: `EI = E\\,I = ${tn(p.E)}\\text{ MPa}\\times ${tn(p.I)}\\text{ mm}^4 = ${tn(p.E)}\\times 10^{6}\\text{ Pa}\\times ${tn(p.I)}\\times 10^{-12}\\text{ m}^4 = ${tn(c.EI)}\\text{ N·m}^2` }
      : { p: 'No moment of inertia ($I = 0$): no bending stiffness, so both beam formulas give the taut string.' });
    data.push(c.EA > 0 ? { eq: `EA = E\\,A = ${tn(p.E)}\\text{ MPa}\\times ${tn(p.A)}\\text{ mm}^2 = ${tn(c.EA)}\\text{ N}` }
      : { p: 'No steel area ($A = 0$): the sag parameters $\\lambda^2$ and $\\Gamma$ are not calculated.' });
    sec('data', 'Cable data in SI units', data);
    // the modes
    const off = r.modes.filter(m => !m.used), from = r.sp ? `a PSD of the signal ${srcName} (Hann window, ${r.sp.segments} segments, 50 % overlap), by the standard peak detection (${methodName(PEAKS())})`
      : `the spectrum ${srcName}, by its peak detection (${methodName(src && src.display.peaks)})`;
    const modes = [{ p: `${r.peaks.length} peaks were found in ${from} between ${tn(r.fMin, 4)} and ${tn(r.fMax, 4)} Hz; line spacing $\\Delta f = ${tn(r.spec.df, 3)}$ Hz.` }];
    if (r.modes.length) modes.push({ p: 'They are numbered as the harmonic series of the cable – its bending stiffness raises the higher modes a little:' },
      { eq: `f_n \\approx n\\,f_0\\sqrt{1 + b\\,n^2},\\qquad f_0 = ${tn(r.base)}\\text{ Hz},\\quad b = ${tn(r.bInh, 3)}` },
      { p: `${r.modes.length} modes found, ${used.length} used: n = ${used.map(m => m.n).join(', ') || '–'}.` + (off.length ? ` Not used: ${off.map(m => `${m.n} (${whyOff(m)})`).join(', ')}.` : '') + ' Click a mode in the plot or in the Modes table to use it or leave it out.' });
    else modes.push({ p: (r.note || 'No modes found') + '.' });
    sec('modes', 'Natural frequencies from the spectrum', modes);
    if (!r.methods) { sec('none', 'Tension', [{ p: 'Enter the cable data – the length L and the mass per metre m at least – to calculate the tension.' }]); return out; }
    const M = r.methods;
    // taut string
    const st = [{ p: 'A taut string – no bending stiffness – vibrates at' }, { eq: 'f_n = \\frac{n}{2L}\\sqrt{\\frac{T}{m}}\\qquad\\Rightarrow\\qquad T_n = 4\\,m\\,L^2\\left(\\frac{f_n}{n}\\right)^2' }];
    if (ex) st.push({ p: `Mode ${ex.n}, as an example:` }, { eq: `T_{${ex.n}} = 4\\times ${tn(c.m)}\\times ${tn(c.L)}^2\\times\\left(\\frac{${tn(ex.f, 6)}}{${ex.n}}\\right)^2 = ${tn(ex.Ts)}\\text{ N} = ${tk(ex.Ts)}\\text{ kN}` });
    st.push(tab(['Mode n', 'fₙ (Hz)', 'fₙ / n (Hz)', 'Tₙ (kN)'], used.map(m => [m.n, m.f, m.f / m.n, m.Ts / 1000])), ...avg(M.string));
    sec('string', 'Taut string', st);
    if (c.EI > 0) {
      // beam, hinged ends
      const bend = n => (n * Math.PI / c.L) ** 2 * c.EI;
      const hi = [{ p: 'A beam with hinged ends under tension vibrates at' },
        { eq: 'f_n = \\frac{n}{2L}\\sqrt{\\frac{T + n^2\\pi^2 EI/L^2}{m}}\\qquad\\Rightarrow\\qquad T_n = 4\\,m\\,L^2\\left(\\frac{f_n}{n}\\right)^2 - \\frac{n^2\\pi^2\\,EI}{L^2}' }];
      if (ex) hi.push({ p: `Mode ${ex.n}: the string tension less the bending term,` },
        { eq: `T_{${ex.n}} = ${tn(ex.Ts, 7)} - \\frac{${ex.n}^2\\pi^2\\times ${tn(c.EI)}}{${tn(c.L)}^2} = ${tn(ex.Ts, 7)} - ${tn(bend(ex.n))} = ${tn(ex.Th, 7)}\\text{ N} = ${tk(ex.Th)}\\text{ kN}` });
      hi.push(tab(['Mode n', 'fₙ (Hz)', 'String (kN)', 'n²π²EI/L² (kN)', 'Tₙ (kN)'], used.map(m => [m.n, m.f, m.Ts / 1000, bend(m.n) / 1000, m.Th / 1000])), ...avg(M.hinged));
      sec('hinged', 'Beam with hinged ends', hi);
      // beam, clamped ends
      const fx = [{ p: 'A beam with clamped ends under tension: its deflection w(x, t) obeys' },
        { eq: 'EI\\,\\frac{\\partial^4 w}{\\partial x^4} - T\\,\\frac{\\partial^2 w}{\\partial x^2} + m\\,\\frac{\\partial^2 w}{\\partial t^2} = 0,\\qquad w = \\frac{\\partial w}{\\partial x} = 0\\text{ at both ends}' },
        { p: 'With $\\alpha^2 - \\beta^2 = T/EI$ and $m\\,\\omega^2 = EI\\,\\alpha^2\\beta^2$ ($\\omega = 2\\pi f$) the frequency equation is' },
        { eq: '2\\alpha\\beta\\left(\\text{sech}\\,\\alpha L - \\cos\\beta L\\right) + \\left(\\alpha^2 - \\beta^2\\right)\\tanh\\alpha L\\,\\sin\\beta L = 0,\\qquad f_n = \\frac{\\alpha\\beta}{2\\pi}\\sqrt{\\frac{EI}{m}}' },
        { p: 'Its n-th root lies in $n\\pi < \\beta L < (n + 1)\\pi$. There is no formula for T: for each mode the tension is found by bisection, between 0 and the string tension, as the one whose n-th frequency is the measured one.' }];
      if (ex && isFinite(ex.Tf)) {
        const q = CM.fixedRoot(ex.Tf, ex.n, c);
        fx.push({ p: `Mode ${ex.n}:` }, { eq: `T_{${ex.n}} = ${tn(ex.Tf)}\\text{ N}:\\quad \\alpha L = ${tn(q.aL)},\\ \\beta L = ${tn(q.bL)},\\quad f_{${ex.n}} = \\frac{\\alpha\\beta}{2\\pi}\\sqrt{\\frac{EI}{m}} = ${tn(q.f, 6)}\\text{ Hz (measured: }${tn(ex.f, 6)}\\text{ Hz)}` });
      }
      fx.push(tab(['Mode n', 'fₙ (Hz)', 'αL', 'βL', 'Tₙ (kN)'], used.map(m => { const q = isFinite(m.Tf) ? CM.fixedRoot(m.Tf, m.n, c) : {}; return [m.n, m.f, q.aL ?? NaN, q.bL ?? NaN, m.Tf / 1000]; })), ...avg(M.fixed));
      sec('fixed', 'Beam with clamped ends (exact)', fx);
    }
    // fit of several modes
    const F = M.fit, ft = [{ p: 'For a beam with hinged ends $(f_n/n)^2$ is a straight line over $n^2$:' },
      { eq: '\\left(\\frac{f_n}{n}\\right)^2 = a + b\\,n^2,\\qquad a = \\frac{T}{4\\,m\\,L^2},\\quad b = \\frac{\\pi^2\\,EI}{4\\,m\\,L^4}' }];
    if (isFinite(F.a)) {
      const xs = used.map(m => m.n * m.n), ys = used.map(m => (m.f / m.n) ** 2), mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, y) => s + y, 0) / ys.length;
      ft.push({ p: `The straight line through the ${used.length} modes used, by least squares ($x = n^2$, $y = (f_n/n)^2$):` },
        tab(['Mode n', 'x = n²', 'y = (fₙ/n)² (Hz²)', 'a + b·x (Hz²)'], used.map((m, i) => [m.n, xs[i], ys[i], F.a + F.b * xs[i]])),
        { eq: `b = \\frac{\\sum (x - \\bar{x})(y - \\bar{y})}{\\sum (x - \\bar{x})^2} = ${tn(F.b)}\\text{ Hz}^2,\\qquad a = \\bar{y} - b\\,\\bar{x} = ${tn(my)} - ${tp(F.b)}\\times ${tn(mx)} = ${tn(F.a)}\\text{ Hz}^2,\\qquad R^2 = ${tn(F.r2, 4)}` },
        { eq: `T = 4\\,m\\,L^2\\,a = 4\\times ${tn(c.m)}\\times ${tn(c.L)}^2\\times ${tn(F.a)} = ${tk(F.T)}\\text{ kN}` + (F.se > 0 ? `\\quad(\\pm ${tk(F.se)}\\text{ kN standard error})` : '') },
        { eq: `EI = \\frac{4\\,m\\,L^4\\,b}{\\pi^2} = \\frac{4\\times ${tn(c.m)}\\times ${tn(c.L)}^4\\times ${tp(F.b)}}{\\pi^2} = ${tn(F.EI)}\\text{ N·m}^2` + (c.EI > 0 ? `\\quad(\\text{given: }${tn(c.EI)})` : '') });
    } else ft.push({ p: 'This needs at least two modes.' });
    sec('fit', 'Fit of several modes (hinged ends, finds EI)', ft);
    // Zui et al.
    const Z = M.zui, zi = [{ p: 'Zui, Shinke & Namita (1996): practical formulas for the first or the second mode, chosen by the bending parameter ξ and the sag parameter Γ. Both depend on T, so the formula is applied again with each new T, starting from the string tension, until T no longer changes.' }];
    if (Z.key) {
      const n = Z.mode, f = (used.find(m => m.n === n) || {}).f, C = c.EI > 0 ? Math.sqrt(c.EI / (c.m * c.L ** 4)) : 0, rr = C / f;
      const dl = c.m * CM.G * c.L * Math.cos(c.theta) / (8 * Z.T), k4 = n === 1 ? '4\\,' : '', k4x = n === 1 ? '4\\times ' : '';
      zi.push({ eq: `C = \\sqrt{\\frac{EI}{m\\,L^4}} = ${c.EI > 0 ? `\\sqrt{\\frac{${tn(c.EI)}}{${tn(c.m)}\\times ${tn(c.L)}^4}} = ` : ''}${tn(C)}\\text{ Hz}` },
        { eq: `\\xi = L\\sqrt{\\frac{T}{EI}} = ${tn(Z.xi, 4)},\\qquad \\delta = \\frac{m\\,g\\,L\\cos\\theta}{8\\,T} = ${tn(dl, 4)}` },
        c.EA > 0 ? { eq: `\\Gamma = \\sqrt{\\frac{m\\,g\\,L}{128\\,EA\\,\\delta^3\\cos^5\\theta}}\\cdot\\frac{0.31\\,\\xi + 0.5}{0.31\\,\\xi - 0.5} = ${tn(Z.gamma, 4)}` } : { p: 'No steel area: Γ = ∞ (no sag).' },
        { p: `So the formula for the ${Z.label}, with $r = C/f_${n} = ${tn(rr, 4)}$:` },
        { eq: `T = ${k4}m\\,(f_${n} L)^2\\left[${ZUI_TEX[Z.key]}\\right] = ${k4x}${tn(c.m)}\\times(${tn(f, 6)}\\times ${tn(c.L)})^2\\times\\left[${tn(CM.ZUI[Z.key].f(rr))}\\right] = ${tk(Z.T)}\\text{ kN}` });
      if (Z.note) zi.push({ p: Z.note + '.' });
    } else zi.push({ p: (Z.note || 'No result') + '.' });
    sec('zui', 'Zui et al. (1996)', zi);
    // bending and sag of the result
    if (r.par && r.T > 0) {
      const T = r.T, par = r.par, pa = [{ p: `For the tension found, $T = ${tk(T)}$ kN:` }];
      pa.push(c.EI > 0 ? { eq: `\\xi = L\\sqrt{\\frac{T}{EI}} = ${tn(c.L)}\\times\\sqrt{\\frac{${tn(T)}}{${tn(c.EI)}}} = ${tn(par.xi, 4)}` } : { p: 'No bending stiffness: ξ = ∞.' },
        { p: 'The smaller ξ, the more the bending stiffness matters – short, stiff cables and hangers; above about 50 a cable is nearly a string.' },
        { eq: `\\delta = \\frac{m\\,g\\,L\\cos\\theta}{8\\,T} = \\frac{${tn(c.m)}\\times 9.80665\\times ${tn(c.L)}\\times\\cos ${tn(p.theta || 0)}°}{8\\times ${tn(T)}} = ${tn(par.sag, 4)}\\quad(\\text{sag / span})` });
      if (c.EA > 0) pa.push({ eq: `L_e = L\\,(1 + 8\\,\\delta^2) = ${tn(c.L * (1 + 8 * par.sag ** 2), 6)}\\text{ m},\\qquad \\lambda^2 = \\frac{(8\\,\\delta)^2\\,EA\\,L}{T\\,L_e} = ${tn(par.lambda2, 4)}` },
        { p: 'Irvine\'s λ²: above about 0.12 the sag raises the first in-plane mode noticeably.' });
      sec('par', 'Bending and sag parameters', pa);
    }
    // the result
    const res = [{ eq: `T = ${tk(r.T)}\\text{ kN}` }, { p: `by the method chosen: ${METHODS.find(x => x[0] === r.key)[1]} (choose another in the bar or the methods table).` }];
    if (p.Tdesign > 0 && r.T > 0) res.push({ eq: `\\frac{T}{T_{\\text{design}}} = \\frac{${tk(r.T)}}{${tn(p.Tdesign)}} = ${tn(r.T / (p.Tdesign * 1000) * 100, 4)}\\text{ %}` });
    sec('result', 'Result', res);
    return out;
  }
  const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const TX = (tex, display) => root.TEXMATH ? root.TEXMATH.toMathML(tex, display) : esc(plain(tex));
  const cellText = v => typeof v === 'number' ? (Number.isInteger(v) ? String(v) : fmt(v, 5)) : String(v ?? '');
  function renderCalc(w, v) {
    const open = v.open || (v.open = {}); // the sections opened or closed by hand stay so
    v.calc.replaceChildren(h('div', { class: 'cab-calc-intro' }, 'How the tension is calculated, with the numbers of this cable (SI units: N, m, kg, s). The chosen method is marked; click a heading to open or close it. Copy and Excel… take these steps as text.'),
      ...steps(w, v.res).map(s => {
        const d = h('details', { class: 'cab-step' + (s.chosen ? ' chosen' : '') });
        d.open = open[s.id] ?? (s.chosen || ['data', 'modes', 'none', 'result'].includes(s.id));
        d.addEventListener('toggle', () => { open[s.id] = d.open; });
        d.append(h('summary', {}, s.title, s.chosen ? h('span', { class: 'cab-chosen' }, 'the chosen method') : ''), ...s.items.map(stepItem));
        return d;
      }));
  }
  function stepItem(it) {
    if (it.table) return h('table', { class: 'cab-tab cab-ctab' }, h('thead', {}, h('tr', {}, ...it.table.head.map(t => h('th', {}, t)))),
      h('tbody', {}, ...it.table.rows.map(r => h('tr', {}, ...r.map(x => h('td', {}, cellText(x)))))));
    const e = h(it.eq ? 'div' : 'p', it.eq ? { class: 'cab-eq' } : {});
    e.innerHTML = it.eq ? TX(it.eq, true) : it.p.split('$').map((t, i) => i % 2 ? TX(t) : esc(t)).join('');
    return e;
  }
  // TeX → plain text for Copy and Excel: fractions as a/b, roots as √(…), powers and indices in Unicode where it has them
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', n: 'ⁿ' };
  const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', n: 'ₙ', e: 'ₑ' };
  const SYM = { alpha: 'α', beta: 'β', delta: 'δ', theta: 'θ', lambda: 'λ', xi: 'ξ', pi: 'π', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', times: '×', cdot: '·', Rightarrow: '⇒',
    partial: '∂', sum: 'Σ', infty: '∞', approx: '≈', pm: '±', sin: 'sin ', cos: 'cos ', tanh: 'tanh ', quad: '   ', qquad: '      ', ',': ' ', ';': ' ', ' ': ' ', '!': '' };
  function plain(tex) {
    const s = String(tex); let i = 0;
    const wrap = t => /^[\w.·⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ₀₁₂₃₄₅₆₇₈₉ₙ]+$/.test(t) ? t : `(${t})`;
    const script = (t, map, mark) => [...t].every(ch => map[ch]) ? [...t].map(ch => map[ch]).join('') : mark + wrap(t);
    const until = end => { let o = ''; while (i < s.length && s[i] !== end) o += tok(); return o; };
    const arg = () => { while (s[i] === ' ') i++; if (s[i] !== '{') return tok(); i++; const o = until('}'); i++; return o; };
    function tok() {
      const ch = s[i++];
      if (ch === '^') return script(arg(), SUP, '^');
      if (ch === '_') return script(arg(), SUB, '_');
      if (ch === '{') { const o = until('}'); i++; return o; }
      if (ch !== '\\') return ch;
      const name = /[a-zA-Z]/.test(s[i]) ? s.slice(i).match(/^[a-zA-Z]+/)[0] : s[i]; i += name.length;
      if (name === 'frac') { const a = arg(), b = arg(); return `${wrap(a)}/${wrap(b)}`; }
      if (name === 'sqrt') return '√' + wrap(arg());
      if (name === 'text') return arg();
      if (name === 'bar') return arg() + '̄';
      if (name === 'left' || name === 'right') { const f = s[i++]; return f === '.' ? '' : f; }
      return SYM[name] ?? name;
    }
    return until(undefined).replace(/ {2,}/g, m => m.length > 3 ? '   ' : ' ').trim();
  }
  function calcRows(w) { // the steps as spreadsheet rows
    const v = viewOf(w);
    if (!v.res || v.res.needPeaks) throw new Error('No calculation yet');
    const rows = [];
    for (const s of steps(w, v.res)) {
      rows.push([{ v: s.title + (s.chosen ? ' – the chosen method' : ''), bold: true }]);
      for (const it of s.items) {
        if (it.table) { rows.push(it.table.head.map(t => ({ v: t, bold: true }))); it.table.rows.forEach(r => rows.push(r.map(x => typeof x === 'number' && !isFinite(x) ? '' : x))); }
        else rows.push([it.eq ? '      ' + plain(it.eq) : it.p.split('$').map((t, i) => i % 2 ? plain(t) : t).join('')]);
      }
      rows.push([]);
    }
    return rows;
  }

  /* ---------- the spectrum ---------- */
  function layout(v) {
    const r = v.res, W = v.canvas.clientWidth, H = v.canvas.clientHeight;
    if (!r || !W || !H) return null;
    const L = 56, R = 12, T = 16, B = 32, fa = r.fMin, fb = r.fMax, sp = r.spec;
    const k0 = Math.max(0, Math.ceil((fa - sp.f0) / sp.df)), k1 = Math.min(sp.db.length - 1, Math.floor((fb - sp.f0) / sp.df));
    let hi = -Infinity, lo = Infinity;
    for (let k = k0; k <= k1; k++) { const d = sp.db[k]; if (d > hi) hi = d; if (d < lo) lo = d; }
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
    const sp = r.spec, db = k => sp.db[k];
    ctx.save(); ctx.beginPath(); ctx.rect(g.L, g.T, W - g.L - g.R, H - g.T - g.B); ctx.clip();
    ctx.strokeStyle = '#1d63c4'; ctx.lineWidth = 1.2; ctx.beginPath();
    let px = null, mn = 0, mx = 0, first = true;
    const flush = () => { if (px == null) return; const a = g.Y(mx), b = g.Y(mn); if (first) { ctx.moveTo(px, a); first = false; } else ctx.lineTo(px, a); if (b - a > 0.5) ctx.lineTo(px, b); };
    for (let k = g.k0; k <= g.k1; k++) {
      const x = Math.round(g.X(sp.f0 + k * sp.df)), d = db(k);
      if (x !== px) { flush(); px = x; mn = mx = d; } else { if (d < mn) mn = d; if (d > mx) mx = d; }
    }
    flush(); ctx.stroke();
    // the detected peaks: small orange marks on their tops
    ctx.fillStyle = '#e08a00';
    for (const q of r.peaks) { const x = g.X(q.f), y = g.Y(q.level) - 3; ctx.beginPath(); ctx.moveTo(x - 4, y - 7); ctx.lineTo(x + 4, y - 7); ctx.lineTo(x, y); ctx.closePath(); ctx.fill(); }
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
      const f = g.F(v.mouse[0]), k = Math.round((f - sp.f0) / sp.df), m = nearMode(v, v.mouse[0]);
      ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(v.mouse[0]) + 0.5, g.T); ctx.lineTo(Math.round(v.mouse[0]) + 0.5, H - g.B); ctx.stroke();
      info = m ? `mode ${m.n}: ${m.f.toFixed(4)} Hz – click to ${m.used ? 'leave it out' : 'use it'}` : `${fmt(f, 5)} Hz · ${k >= 0 && k < sp.db.length ? fmt(db(k), 4) : '–'} dB`;
    }
    ctx.restore();
    if (v.info) v.info.textContent = info;
  }

  /* ---------- the cable data ---------- */
  // seg: the PSD is made from a signal (a new PSD window, or a cable window of the first version); specs: the signal's
  // spectrum windows to choose from (a new PSD window is the last choice)
  const specName = x => `${x.label} – ${x.title}${x.display.peaks && x.display.peaks.on ? ' (peak detection on)' : ''}`;
  function fieldsOf(p, seg, specs) {
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
      { type: 'section', label: 'Modes' },
      { type: 'info', label: 'The peaks come from the peak detection of the spectrum window (Signal tools ▸ Peak detection…, or Peak detection… in the cable window); these settings number them as the cable\'s modes.' },
      ...(specs ? [{ key: 'spec', label: 'Spectrum window', type: 'select', value: specs.length ? String(specs[0].id) : 'new',
        options: [...specs.map(x => [String(x.id), specName(x)]), ['new', 'A new PSD window (Welch averaging, Hann)']],
        hint: specs.length ? 'an existing spectrum of this signal, with its peak detection – or a new one' : 'this signal has no spectrum window yet' }] : []),
      { key: 'fMin', label: 'Lowest frequency (Hz)', type: 'number', value: p.fMin, min: 0 },
      { key: 'fMax', label: 'Highest frequency (Hz)', type: 'number', value: p.fMax || 0, min: 0, hint: '0 = the whole spectrum' },
      { key: 'f1', label: 'First frequency, about (Hz)', type: 'number', value: p.f1 || 0, min: 0, hint: '0 = found automatically' },
      { key: 'maxModes', label: 'Modes, at most', type: 'number', value: p.maxModes, min: 1, max: 40, step: 1 },
      ...(seg ? [{ key: 'nseg', label: 'Averaged segments of the PSD', type: 'number', value: p.nseg, min: 1, max: 64, step: 1, hint: 'more: a smoother spectrum, but a coarser resolution',
        show: v => !specs || v.spec === 'new' }] : [])];
  }
  const askData = (p, title, seg, specs) => dialog({ title: title || 'Cable data', intro: 'Units: m, kg/m, MPa, mm², mm⁴, degrees, kN. The tension needs L and m; I adds the bending stiffness, A and θ the sag.', fields: fieldsOf(p, seg, specs),
    validate: x => !(x.L > 0) ? 'Enter the length L' : !(x.m > 0) ? 'Enter the mass per metre m' : null });
  const clean = v => Object.assign(v, { maxModes: Math.max(1, Math.round(v.maxModes || 10)) }, v.nseg != null ? { nseg: Math.max(1, Math.round(v.nseg || 16)) } : {});
  async function settings(w) {
    const p = P(w), src = S.wins.get(w.parents[0]), v = await askData(p, null, !(src && isSpectrum(src.data))); if (!v) return;
    Object.assign(p, clean(v)); keepData(p);
    w.title = OPS.cable.label(p); w.updateTitle(); APP.queueCompute(w);
  }

  /* ---------- results out ---------- */
  function rowsOf(w) {
    const r = viewOf(w).res, p = P(w), c = cableOf(p), parent = S.wins.get(w.parents[0]);
    if (!r || !r.methods) throw new Error('No tension yet – enter the cable data first');
    const m = r.methods, info = [
      ['Cable', p.name || ''], [r.sp ? 'Signal' : 'Spectrum', parent ? parent.id + '#' + parent.title : ''],
      ['Peak detection', r.sp ? 'standard: ' + methodName(PEAKS()) : methodName(parent && parent.display.peaks)], ['Length L (m)', p.L], ['Mass per metre m (kg/m)', p.m], ['E (MPa)', p.E], ['A (mm²)', p.A], ['I (mm⁴)', p.I],
      ['EI (N·m²)', c.EI], ['Inclination θ (°)', p.theta], ['Design tension (kN)', p.Tdesign || ''], [],
      ['Tension T (kN)', r.T / 1000], ['Method', METHODS.find(x => x[0] === r.key)[1]], ['% of design', p.Tdesign > 0 ? r.T / (p.Tdesign * 10) : ''],
      ['ξ = L√(T/EI)', r.par ? r.par.xi : ''], ['λ² (Irvine)', r.par ? r.par.lambda2 : ''], ['Sag / span', r.par ? r.par.sag : ''], [],
      ['Method', 'T (kN)', 'Scatter or standard error (%)', 'Note'],
      ...(m.fixed ? [['Beam, clamped ends (exact)', m.fixed.T / 1000, m.fixed.sd / m.fixed.T * 100, m.fixed.count + ' modes']] : []),
      ...(m.hinged ? [['Beam, hinged ends', m.hinged.T / 1000, m.hinged.sd / m.hinged.T * 100, m.hinged.count + ' modes']] : []),
      ['Taut string', m.string.T / 1000, m.string.sd / m.string.T * 100, m.string.count + ' modes'],
      ['Fit of several modes (hinged ends)', m.fit.T / 1000, m.fit.se / m.fit.T * 100, `EI = ${fmt(m.fit.EI, 4)} N·m², R² = ${fmt(m.fit.r2, 5)}`],
      ['Zui et al. (1996)', m.zui.T / 1000, '', m.zui.key ? `${m.zui.label}, Γ = ${gam(m.zui.gamma)}` : m.zui.note || ''], [],
      ['Spectrum', r.sp ? `PSD, Hann window, ${r.sp.segments} segments with 50 % overlap, ${r.sp.segLen} samples each, line spacing ${fmt(r.sp.dx, 4)} Hz`
        : `${parent ? parent.id + '#' + parent.title : ''}, line spacing ${fmt(r.spec.df, 4)} Hz, ${r.peaks.length} peaks detected`]];
    const modes = [['Mode n', 'f (Hz)', 'f/n (Hz)', 'Peak (dB)', 'T string (kN)', 'T hinged (kN)', 'T clamped (kN)', 'Used'],
      ...r.modes.map(o => [o.n, o.f, o.f / o.n, o.prom, o.Ts / 1000, o.Th / 1000, o.Tf / 1000, o.used ? 'yes' : 'no'])];
    return { info, modes };
  }
  const num = v => typeof v === 'number' ? (isFinite(v) ? String(+v.toPrecision(7)) : '') : String(v ?? '');
  async function copy(w) { // what the window shows: the results, or the calculation steps
    const steps = !!w.display.cabCalc, rows = steps ? calcRows(w) : (({ info, modes }) => [...info, [], ...modes])(rowsOf(w));
    await navigator.clipboard.writeText(rows.map(r => r.map(x => x && typeof x === 'object' ? x.v : num(x)).join('\t')).join('\r\n'));
    toast(steps ? 'Calculation steps copied' : 'Results copied');
  }
  function excel(w) {
    const { info, modes } = rowsOf(w), cell = v => typeof v === 'number' && !isFinite(v) ? '' : v;
    download(UI.safeName(w.title) + '.xlsx', root.FORMATS.xlsx([
      { name: 'Tension', header: 0, widths: [30, 18, 26, 44], rows: [[{ v: w.title, bold: true }], [], ...info.map(r => r.map(cell))] },
      { name: 'Modes', widths: [8, 12, 12, 10, 14, 14, 14, 7], rows: modes.map((r, i) => i ? r.map((v, k) => k && k < 7 ? { v: cell(v), fmt: k < 3 ? '0.000' : '0.00' } : v) : r) },
      { name: 'Calculation', header: 0, widths: [24, 14, 16, 16, 16], rows: [[{ v: w.title, bold: true }], [], ...calcRows(w)] }]));
  }

  /* ---------- commands ---------- */
  // the spectrum windows of a signal (its children), those with the peak detection on first
  const spectraOf = s => [...s.children].map(id => S.wins.get(id)).filter(x => x && x.kind === '1d' && isSpectrum(x.data))
    .sort((a, b) => (b.display.peaks && b.display.peaks.on ? 1 : 0) - (a.display.peaks && a.display.peaks.on ? 1 : 0) || a.id - b.id);
  // from a spectrum: the cable window under it; from a signal: under one of its spectrum windows, with that window's peak
  // detection – or under a new PSD window when it has none, or the user chooses one
  async function newCable(src) {
    const s = src || S.active, d = s && s.kind === '1d' && s.data && s.data.y ? s.data : null;
    const spectrum = isSpectrum(d), signal = !!d && !spectrum && !d.x;
    if (!spectrum && !signal) throw new Error('Select the accelerometer signal (or its spectrum) first, then choose Cable tension.');
    const specs = signal ? spectraOf(s) : null;
    const p = Object.assign(defaults(), lastData(), { name: '', use: {} }), v = await askData(p, 'Cable tension – cable data', signal, specs);
    if (!v) return null;
    const pick = v.spec; delete v.spec;
    Object.assign(p, clean(v)); keepData(p);
    const spec = spectrum ? s : pick && pick !== 'new' ? S.wins.get(+pick) : null;
    if (spec && !(spec.display.peaks && spec.display.peaks.on)) APP.setPeaks(spec, PEAKS());
    return open(spec || spectrumOf(s, p), p);
  }
  // the PSD window between the signal and the cable window: Welch averaging, Hann, in dB, with its peak detection on
  function spectrumOf(s, p, rect) {
    const params = Object.assign({}, DSP.svSettings(S.settings.spectral), { mode: 'segments', segmentCount: Math.max(1, Math.round(p.nseg || 16)), segmentOverlap: 50,
      applyWindow: true, window: 'Hann', subtractMean: true, zeroPadding: '2 x Next power of 2', type: 'Power spectral density (PSD)', dB: true, dBFS: false, xUnit: 'Hz',
      smooth: false, test: false, customFilter: null, weighting: null, fromFreq: 0, toFreq: 0 });
    const w = APP.derive(s, 'fft', params, rect ? { rect } : undefined);
    APP.setPeaks(w, PEAKS());
    return w;
  }
  function open(s, p, rect) {
    const dw = S.desktop.clientWidth || 1000, dh = S.desktop.clientHeight || 700, rw = Math.min(1060, dw - 20), rh = Math.min(700, dh - 20);
    return APP.derive(s, 'cable', p, { rect: rect || { x: Math.max(0, dw - rw - 10), y: Math.max(0, (dh - rh) / 4), w: rw, h: rh } });
  }
  // Help ▸ Examples: a stay cable (long: bending hardly matters) and an arch hanger (short and stiff: it does); the signal
  // and its PSD window with the detected peaks on the left, the cable window on the right
  function example(o) {
    const dw = S.desktop.clientWidth || 1000, dh = S.desktop.clientHeight || 700, left = Math.round(dw * 0.36), top = Math.round(dh * 0.42), p = Object.assign(defaults(), o.p);
    const y = CM.simulate(Object.assign({ c: cableOf(p), bc: 'fixed', rms: 0.03, noise: 0.002 }, o.sim));
    const s = APP.createWindow({ kind: '1d', title: o.title, source: { type: 'generator' }, data: { y, x0: 0, dx: 1 / o.sim.fs, xUnit: 's', yUnit: 'm/s²' },
      rect: { x: 0, y: 0, w: left - 4, h: top - 4 } });
    return open(spectrumOf(s, p, { x: 0, y: top, w: left - 4, h: dh - top }), p, { x: left, y: 0, w: dw - left, h: dh });
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

  root.CABLE = { newCable, stayExample, hangerExample, analyse, PEAKS };
})(window);
