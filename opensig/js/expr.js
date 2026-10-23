/* OpenSig signal calculator: expression language over window signals (W1, W2, ...) and numbers. */
(function (root) {
  'use strict';
  const DSP = root.DSP || (typeof require !== 'undefined' ? require('./dsp.js') : null);

  function tokenize(src) {
    const toks = [], re = /\s*(?:(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(\*\*|[-+*/^(),]))/y;
    let m, pos = 0;
    while (pos < src.length) {
      re.lastIndex = pos;
      if (!(m = re.exec(src))) { if (/^\s*$/.test(src.slice(pos))) break; throw new Error('Unexpected character at ' + pos + ': "' + src[pos] + '"'); }
      pos = re.lastIndex;
      if (m[1] !== undefined) toks.push({ t: 'num', v: parseFloat(m[1]) });
      else if (m[2] !== undefined) toks.push({ t: 'id', v: m[2] });
      else toks.push({ t: 'op', v: m[3] === '**' ? '^' : m[3] });
    }
    return toks;
  }

  // AST: {k:'num',v} | {k:'win',n} | {k:'neg',a} | {k:'bin',op,a,b} | {k:'call',f,args}
  function parse(src) {
    const toks = tokenize(src); let i = 0;
    const peek = () => toks[i], next = () => toks[i++];
    const expect = v => { const t = next(); if (!t || t.v !== v) throw new Error('Expected "' + v + '"'); };
    const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
    function primary() {
      const t = next();
      if (!t) throw new Error('Unexpected end of expression');
      if (t.t === 'num') return { k: 'num', v: t.v };
      if (t.t === 'op' && t.v === '(') { const e = expr(0); expect(')'); return e; }
      if (t.t === 'op' && t.v === '-') return { k: 'neg', a: expr(3) };
      if (t.t === 'op' && t.v === '+') return expr(3);
      if (t.t === 'id') {
        const w = /^[Ww](\d+)$/.exec(t.v);
        if (w) return { k: 'win', n: +w[1] };
        if (/^pi$/i.test(t.v)) return { k: 'num', v: Math.PI };
        if (peek() && peek().v === '(') {
          next(); const args = [];
          if (peek() && peek().v !== ')') { do { args.push(expr(0)); } while (peek() && peek().v === ',' && next()); }
          expect(')');
          return { k: 'call', f: t.v.toLowerCase(), args };
        }
        throw new Error('Unknown name "' + t.v + '" (use W1, W2, ... for windows)');
      }
      throw new Error('Unexpected "' + t.v + '"');
    }
    function expr(minP) {
      let lhs = primary();
      for (;;) {
        const t = peek();
        if (!t || t.t !== 'op' || !(t.v in prec) || prec[t.v] < minP) break;
        next();
        const p = prec[t.v], rhs = expr(t.v === '^' ? p : p + 1);
        lhs = { k: 'bin', op: t.v, a: lhs, b: rhs };
      }
      return lhs;
    }
    const ast = expr(0);
    if (i < toks.length) throw new Error('Unexpected "' + toks[i].v + '"');
    return ast;
  }

  function refs(ast, out = new Set()) {
    if (ast.k === 'win') out.add(ast.n);
    if (ast.a) refs(ast.a, out); if (ast.b) refs(ast.b, out);
    if (ast.args) ast.args.forEach(a => refs(a, out));
    return out;
  }

  const UNARY = { abs: Math.abs, sqrt: Math.sqrt, log: Math.log10, log10: Math.log10, ln: Math.log, exp: Math.exp,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, asin: Math.asin, acos: Math.acos,
    sqr: v => v * v, inv: v => 1 / v, sign: Math.sign, floor: Math.floor, round: Math.round, db: v => 20 * Math.log10(Math.abs(v) || 1e-15) };

  const isSig = v => v && typeof v === 'object' && v.y;
  const sigLike = (base, y, extra) => Object.assign({ x0: base.x0, dx: base.dx, xUnit: base.xUnit, yUnit: '' }, extra || {}, { y });

  function binop(op, a, b) {
    const f = { '+': (x, y) => x + y, '-': (x, y) => x - y, '*': (x, y) => x * y, '/': (x, y) => x / y, '^': Math.pow }[op];
    if (!isSig(a) && !isSig(b)) return f(a, b);
    const base = isSig(a) ? a : b;
    const n = Math.min(isSig(a) ? a.y.length : Infinity, isSig(b) ? b.y.length : Infinity), y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = f(isSig(a) ? a.y[i] : a, isSig(b) ? b.y[i] : b);
    return sigLike(base, y);
  }

  function needSig(v, f) { if (!isSig(v)) throw new Error(f + '() needs a window argument'); return v; }
  const fsOf = s => 1 / s.dx;

  const SPECIAL = {
    xcorr(a, b) { const r = DSP.crossCorrelation(needSig(a, 'xcorr').y, needSig(b, 'xcorr').y); const n = Math.min(a.y.length, b.y.length); return sigLike(a, r, { x0: -(n - 1) * a.dx }); },
    conv(a, b) { return sigLike(a, DSP.convolution(needSig(a, 'conv').y, needSig(b, 'conv').y)); },
    xspec(a, b, len) { const r = DSP.crossSpectral(needSig(a, 'xspec').y, needSig(b, 'xspec').y, fsOf(a), len || 1024); return { x0: 0, dx: r.df, xUnit: 'Hz', y: r.cross }; },
    coherence(a, b, len) { const r = DSP.crossSpectral(needSig(a, 'coherence').y, needSig(b, 'coherence').y, fsOf(a), len || 1024); return { x0: 0, dx: r.df, xUnit: 'Hz', y: r.coherence }; },
    gain(a, b, len) { const r = DSP.crossSpectral(needSig(a, 'gain').y, needSig(b, 'gain').y, fsOf(a), len || 1024); return { x0: 0, dx: r.df, xUnit: 'Hz', y: r.gain }; },
    frfmag(a, b, len) { const r = DSP.crossSpectral(needSig(a, 'frfmag').y, needSig(b, 'frfmag').y, fsOf(a), len || 1024); return { x0: 0, dx: r.df, xUnit: 'Hz', y: r.gain.map(v => 20 * Math.log10(Math.max(v, 1e-15))) }; },
    phase(a, b, len) { const r = DSP.crossSpectral(needSig(a, 'phase').y, needSig(b, 'phase').y, fsOf(a), len || 1024); return { x0: 0, dx: r.df, xUnit: 'Hz', y: r.phase }; },
    dbr(a, b) { const q = binop('/', needSig(a, 'dbr'), b); q.y = Float64Array.from(q.y, v => 20 * Math.log10(Math.abs(v) || 1e-15)); return q; },
    smooth(a, n) { return sigLike(needSig(a, 'smooth'), DSP.smoothArray(Float64Array.from(a.y), Math.round(n || 5))); },
    min(a, b) { return isSig(a) || isSig(b) ? elementwise2(a, b, Math.min) : Math.min(a, b); },
    max(a, b) { return isSig(a) || isSig(b) ? elementwise2(a, b, Math.max) : Math.max(a, b); },
    cfft(a) { // complex spectrum; displayed as amplitude, keeps re/im for ifft/re/im
      needSig(a, 'cfft'); const c = DSP.complexSpectrum(a.y), k = 2 / c.n;
      return { x0: 0, dx: 1 / (c.n * a.dx), xUnit: 'Hz', y: Float64Array.from(c.re, (r, i) => Math.hypot(r, c.im[i]) * k), complex: c };
    },
    ifft(a) {
      needSig(a, 'ifft');
      const c = a.complex, n = c ? c.n : 2 * (a.y.length - 1);
      const y = c ? DSP.inverseSpectrum(c.re, c.im, n) : DSP.inverseSpectrum(Float64Array.from(a.y, v => v * n / 2), null, n);
      return { x0: 0, dx: 1 / (n * a.dx), xUnit: 's', y };
    },
    re(a) { needSig(a, 're'); if (!a.complex) throw new Error('re() needs a complex spectrum, e.g. re(cfft(W1))'); const k = 2 / a.complex.n; return sigLike(a, Float64Array.from(a.complex.re, v => v * k)); },
    im(a) { needSig(a, 'im'); if (!a.complex) throw new Error('im() needs a complex spectrum, e.g. im(cfft(W1))'); const k = 2 / a.complex.n; return sigLike(a, Float64Array.from(a.complex.im, v => v * k)); },
    toorder(a, rpm, spr) { needSig(a, 'toorder'); needSig(rpm, 'toorder'); spr = spr || 32; return { x0: 0, dx: 1 / spr, xUnit: 'rev', y: DSP.toOrderDomain(a.y, 1 / a.dx, rpm.y, spr) }; },
    fromorder(a, rpm) { needSig(a, 'fromorder'); needSig(rpm, 'fromorder'); return { x0: rpm.x0, dx: rpm.dx, xUnit: 's', y: DSP.fromOrderDomain(a.y, Math.round(1 / a.dx), 1 / rpm.dx, rpm.y) }; },
    delay(a, b) { return DSP.findDelay(needSig(a, 'delay').y, needSig(b, 'delay').y); },
    align(a, b) { const d = DSP.findDelay(needSig(a, 'align').y, needSig(b, 'align').y); return sigLike(b, DSP.shiftSignal(b.y, d)); },
    mean(a) { return DSP.mean(needSig(a, 'mean').y); },
    rms(a) { return DSP.stats(needSig(a, 'rms').y).rms; }
  };
  function elementwise2(a, b, f) {
    const base = isSig(a) ? a : b, n = Math.min(isSig(a) ? a.y.length : Infinity, isSig(b) ? b.y.length : Infinity), y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = f(isSig(a) ? a.y[i] : a, isSig(b) ? b.y[i] : b);
    return sigLike(base, y);
  }

  function evaluate(ast, getWin) {
    switch (ast.k) {
      case 'num': return ast.v;
      case 'win': { const w = getWin(ast.n); if (!w) throw new Error('Window W' + ast.n + ' does not exist'); return w; }
      case 'neg': return binop('*', -1, evaluate(ast.a, getWin));
      case 'bin': return binop(ast.op, evaluate(ast.a, getWin), evaluate(ast.b, getWin));
      case 'call': {
        const args = ast.args.map(a => evaluate(a, getWin));
        if (UNARY[ast.f]) {
          if (args.length !== 1) throw new Error(ast.f + '() takes one argument');
          const v = args[0], f = UNARY[ast.f];
          return isSig(v) ? sigLike(v, Float64Array.from(v.y, f)) : f(v);
        }
        if (SPECIAL[ast.f]) return SPECIAL[ast.f](...args);
        throw new Error('Unknown function ' + ast.f + '()');
      }
    }
  }

  const FUNCTIONS = Object.keys(UNARY).concat(Object.keys(SPECIAL));
  const EXPR = { tokenize, parse, refs, evaluate, FUNCTIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = EXPR; else root.EXPR = EXPR;
})(typeof window !== 'undefined' ? window : globalThis);
