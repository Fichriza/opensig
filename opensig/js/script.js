/* OpenSig scripting: JavaScript script windows (signal, custom display, instrument, signal source, instrument source)
   and an interactive console. A script defines process(input_windows, output, params) like the original's Julia
   scripts; optional: parameters, actions, minParents/maxParents, interval (source windows), draw() (display windows). */
(function (root) {
  'use strict';
  const { DSP, PLOT, IO, EXPR, OPS } = root;

  const TEMPLATES = {
    script: `// Script signal window: compute a new signal from the parent window(s).
// input_windows[i]: { samples, samplingRate, xAxisBegin, xAxisUnit, yAxisUnit, title, number }
// output: set samples (array), samplingRate, xAxisBegin, xAxisUnit, yAxisUnit; textToDisplay and markers are optional.
var parameters = { gain: 2.0 };          // editable in the window's Properties dialog
var minParents = 1, maxParents = 1;

function process(input_windows, output, params) {
  const s = input_windows[0];
  output.samples = s.samples.map(v => v * params.gain);
  output.samplingRate = s.samplingRate;
  output.xAxisBegin = s.xAxisBegin;
  output.xAxisUnit = s.xAxisUnit;
  output.yAxisUnit = s.yAxisUnit;
  return true;                            // return false (and set output.textToDisplay) to report an error
}
`,
    scriptdisplay: `// Custom display window: draw anything on the window's canvas.
// draw(ctx, width, height, input_windows, theme, helpers, params). helpers.axes(view, options) draws axes and returns
// {rect, ax, ay} with ax.toPx(x) / ay.toPx(y) for plotting. DSP, PLOT and IO are available.
var minParents = 1, maxParents = 1;

function draw(ctx, width, height, input_windows, theme, helpers) {
  const s = input_windows[0], h = DSP.histogram(s.samples, 40);
  const top = Math.max(...h.counts);
  const lay = helpers.axes({ x0: h.x0 - h.dx, x1: h.x0 + h.dx * h.counts.length, y0: 0, y1: top * 1.1 }, { xLabel: s.yAxisUnit || 'value', yLabel: 'probability' });
  ctx.fillStyle = theme.trace;
  h.counts.forEach((c, i) => {
    const x = lay.ax.toPx(h.x0 + (i - 0.5) * h.dx), w = lay.ax.toPx(h.x0 + (i + 0.5) * h.dx) - x;
    ctx.fillRect(x + 1, lay.ay.toPx(c), w - 2, lay.ay.toPx(0) - lay.ay.toPx(c));
  });
  return lay;
}
`,
    scriptinst: `// Script instrument window: compute one value from the parent window(s).
// output: set value (number), unit (string) and optionally text (shown below the value).
var minParents = 1, maxParents = 1;

function process(input_windows, output) {
  const y = input_windows[0].samples;
  let peak = 0;
  for (const v of y) peak = Math.max(peak, Math.abs(v));
  const rms = Math.sqrt(y.reduce((a, v) => a + v * v, 0) / y.length);
  output.value = 20 * Math.log10(peak / rms);
  output.unit = 'dB';
  output.text = 'crest factor in dB';
  return true;
}
`,
    scriptsource: `// Signal source window: generates data on a timer (no parent windows).
// process is called every 'interval' ms; context = { time, call } (seconds since start, call counter).
var interval = 100;
var parameters = { frequency: 5, sampleRate: 1000, seconds: 2 };
var minParents = 0, maxParents = 0;

function process(input_windows, output, params, context) {
  const n = params.sampleRate * params.seconds, y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = Math.sin(2 * Math.PI * params.frequency * (i / params.sampleRate + context.time)) + 0.1 * (Math.random() - 0.5);
  output.samples = y; output.samplingRate = params.sampleRate; output.xAxisUnit = 's';
  return true;
}
`,
    scriptinstsource: `// Instrument source window: produces a value on a timer (no parent windows), e.g. from a calculation or an external feed.
var interval = 1000;
var minParents = 0, maxParents = 0;

function process(input_windows, output, params, context) {
  output.value = new Date().getSeconds();
  output.unit = 's';
  return true;
}
`
  };

  function compile(code) {
    const factory = new Function('DSP', 'PLOT', 'IO', 'EXPR', 'FORMATS', '"use strict";\n' + code + `
;return { process: typeof process === 'function' ? process : null, draw: typeof draw === 'function' ? draw : null,
  parameters: typeof parameters !== 'undefined' ? parameters : null, actions: typeof actions !== 'undefined' ? actions : null,
  minParents: typeof minParents !== 'undefined' ? minParents : null, maxParents: typeof maxParents !== 'undefined' ? maxParents : null,
  interval: typeof interval !== 'undefined' ? interval : null, toolName: typeof toolName !== 'undefined' ? toolName : null };`);
    return factory(DSP, PLOT, IO, EXPR, root.FORMATS);
  }
  // One instance per window, so script-level variables keep their state between calls.
  function instance(w, code) {
    if (!w.state.script || w.state.script.code !== code) w.state.script = { code, api: compile(code) };
    return w.state.script.api;
  }
  const paramValue = v => (v && typeof v === 'object' && 'value' in v) ? v.value : v;
  function paramsOf(api, p) {
    const out = {};
    for (const [k, v] of Object.entries(api.parameters || {})) out[k] = paramValue(v);
    return Object.assign(out, p.values || {});
  }
  function toInput(d, w, i) {
    const pw = root.APP.S.wins.get(w.parents[i]) || {};
    const base = { title: pw.title || '', number: pw.id };
    if (!d) return base;
    if (d.sg) return Object.assign(base, { kind: '3d', times: d.sg.rows.map(r => r.t), matrix: d.sg.rows.map(r => r.v), df: d.sg.df, f0: d.sg.f0 || 0, bins: d.sg.bins });
    if (d.y) return Object.assign(base, { kind: 'signal', samples: d.y, samplingRate: d.dx ? 1 / d.dx : 0, xAxisBegin: d.x0 || 0, xAxisUnit: d.xUnit || '', yAxisUnit: d.yUnit || '', x: d.x || null });
    if (d.value !== undefined) return Object.assign(base, { kind: 'instrument', value: d.value, unit: d.unit || '' });
    return base;
  }
  function checkParents(api, n) {
    if (api.minParents != null && n < api.minParents) throw new Error(`Script needs at least ${api.minParents} parent window(s)`);
    if (api.maxParents != null && n > api.maxParents) throw new Error(`Script accepts at most ${api.maxParents} parent window(s)`);
  }
  function ensureTimer(w, api) {
    if (w.state.timer) return;
    w.state.t0 = performance.now(); w.state.calls = 0;
    w.state.timer = setInterval(() => { if (root.APP.isOpen(w)) root.APP.queueCompute(w); else clearInterval(w.state.timer); }, Math.max(20, api.interval || 200));
  }
  const ctxOf = w => ({ time: w.state.t0 ? (performance.now() - w.state.t0) / 1000 : 0, call: (w.state.calls = (w.state.calls || 0) + 1) });

  function runSignal(w, inputs, p, isSource) {
    const api = instance(w, p.code);
    if (!api.process) throw new Error('The script must define process(input_windows, output, params)');
    const ins = inputs.map((d, i) => toInput(d, w, i)); checkParents(api, ins.length);
    if (isSource) ensureTimer(w, api);
    const first = ins.find(x => x.kind === 'signal') || {};
    const out = { samples: null, samplingRate: first.samplingRate || 1, xAxisBegin: first.xAxisBegin || 0, xAxisUnit: first.xAxisUnit || '', yAxisUnit: '', x: null, textToDisplay: '', markers: [] };
    const ok = api.process(ins, out, paramsOf(api, p), ctxOf(w));
    if (ok === false) throw new Error(out.textToDisplay || 'The script returned false');
    const y = out.samples ? Float64Array.from(out.samples) : new Float64Array(0);
    return { y, x0: out.xAxisBegin, dx: 1 / (out.samplingRate || 1), xUnit: out.xAxisUnit, yUnit: out.yAxisUnit, x: out.x ? Float64Array.from(out.x) : undefined, text: out.textToDisplay || '', markers: out.markers || [] };
  }
  function runInstrument(w, inputs, p, isSource) {
    const api = instance(w, p.code);
    if (!api.process) throw new Error('The script must define process(input_windows, output, params)');
    const ins = inputs.map((d, i) => toInput(d, w, i)); checkParents(api, ins.length);
    if (isSource) ensureTimer(w, api);
    const out = { value: NaN, unit: '', text: '' };
    const ok = api.process(ins, out, paramsOf(api, p), ctxOf(w));
    if (ok === false) throw new Error(out.text || 'The script returned false');
    const st = w.state; st.hist = st.hist || [];
    if (isFinite(out.value)) { st.hist.push(out.value); if (st.hist.length > 1000) st.hist.shift(); }
    return { value: Number(out.value), unit: out.unit, text: out.text };
  }

  const label = kind => p => (p.name || { script: 'Script signal', scriptdisplay: 'Script display', scriptinst: 'Script instrument', scriptsource: 'Script signal source', scriptinstsource: 'Script instrument source' }[kind]);
  Object.assign(OPS, {
    script: { label: label('script'), kind: '1d', input: 'visible', multi: true, script: true, compute: (w, inputs, p) => runSignal(w, inputs, p, false) },
    scriptsource: { label: label('scriptsource'), kind: '1d', input: 'full', multi: true, script: true, source: true, compute: (w, inputs, p) => runSignal(w, inputs, p, true) },
    scriptinst: { label: label('scriptinst'), kind: 'instrument', input: 'visible', multi: true, script: true, compute: (w, inputs, p) => runInstrument(w, inputs, p, false) },
    scriptinstsource: { label: label('scriptinstsource'), kind: 'instrument', input: 'full', multi: true, script: true, source: true, compute: (w, inputs, p) => runInstrument(w, inputs, p, true) },
    scriptdisplay: {
      label: label('scriptdisplay'), kind: 'display', input: 'visible', multi: true, script: true,
      compute(w, inputs, p) {
        const api = instance(w, p.code), ins = inputs.map((d, i) => toInput(d, w, i)); checkParents(api, ins.length);
        const params = paramsOf(api, p);
        if (api.process) { const out = { textToDisplay: '' }; if (api.process(ins, out, params, ctxOf(w)) === false) throw new Error(out.textToDisplay || 'The script returned false'); if (!api.draw) return { text: out.textToDisplay }; }
        if (!api.draw) throw new Error('A display script must define draw(ctx, width, height, input_windows, theme, helpers)');
        return { draw: (ctx, cw, ch, th) => api.draw(ctx, cw, ch, ins, th, { axes: (view, o) => PLOT.drawXY(ctx, cw, ch, th, Object.assign({ traces: [], view }, o || {})), PLOT, DSP }, params) };
      }
    }
  });

  /* ---------- Console (replaces the Julia console) ---------- */
  function consoleElement() {
    const wrap = document.createElement('div'); wrap.className = 'console';
    const out = document.createElement('pre'); out.className = 'console-out';
    const inp = document.createElement('textarea'); inp.className = 'console-in'; inp.rows = 2; inp.spellcheck = false;
    inp.placeholder = 'JavaScript – Enter runs, Shift+Enter new line. W(1) = data of window W1, print(…), APP, DSP, IO, EXPR are available.';
    wrap.append(out, inp);
    const hist = []; let hi = 0;
    const show = v => {
      if (v === undefined) return 'undefined';
      if (ArrayBuffer.isView(v)) return `${v.constructor.name}(${v.length}) [${Array.from(v.slice(0, 12)).map(x => +Number(x).toPrecision(6)).join(', ')}${v.length > 12 ? ', …' : ''}]`;
      if (typeof v === 'object' && v !== null) { try { return JSON.stringify(v, (k, x) => ArrayBuffer.isView(x) ? `${x.constructor.name}(${x.length})` : x, 2).slice(0, 4000); } catch (e) { return String(v); } }
      return String(v);
    };
    const print = (...a) => { out.textContent += a.map(show).join(' ') + '\n'; out.scrollTop = out.scrollHeight; };
    root.print = print;
    root.W = n => { const w = root.APP.S.wins.get(n); return w ? w.data : undefined; };
    print('OpenSig console. Example: DSP.stats(W(1).y)');
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); const code = inp.value.trim(); if (!code) return;
        hist.push(code); hi = hist.length; inp.value = ''; print('> ' + code);
        try { const r = (0, eval)(code); if (r && typeof r.then === 'function') r.then(v => print(v), err => print('Error: ' + err.message)); else print(r); }
        catch (err) { print('Error: ' + err.message); }
      } else if (e.key === 'ArrowUp' && !inp.value.includes('\n') && hi > 0) { e.preventDefault(); inp.value = hist[--hi]; }
      else if (e.key === 'ArrowDown' && !inp.value.includes('\n') && hi < hist.length) { e.preventDefault(); hi++; inp.value = hist[hi] || ''; }
    });
    return wrap;
  }

  root.SCRIPTING = { TEMPLATES, compile, instance, paramsOf, toInput, consoleElement, paramValue };
})(window);
