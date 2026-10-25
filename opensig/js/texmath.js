/* TeX → MathML for the formulas in the user manual. A small subset of LaTeX math – fractions, roots, sub- and
   superscripts, sums and max/min with limits, \left…\right, accents, Greek letters, \text, cases and matrices – drawn
   by the browser's own MathML, so it works offline. Unknown commands show as a red <merror>. */
(function (root) {
  'use strict';
  const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
    kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'ϕ', varphi: 'φ', chi: 'χ',
    psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', ell: 'ℓ' };
  const OPS = { cdot: '·', times: '×', pm: '±', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡',
    propto: '∝', mp: '∓', in: '∈', to: '→', rightarrow: '→', Rightarrow: '⇒', infty: '∞', partial: '∂', ldots: '…', cdots: '⋯', ast: '∗',
    circ: '∘', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', langle: '⟨', rangle: '⟩', vert: '|', lvert: '|', rvert: '|',
    Vert: '‖', '|': '‖', '{': '{', '}': '}', mid: '∣', sim: '∼', ll: '≪', gg: '≫' };
  const FENCES = '()[]{}|‖⌊⌋⌈⌉⟨⟩';
  const OPENER = /<mo[^>]*>([([{⌊⌈⟨=,≤≥≈≠<>+−·×/∣]|&lt;|&gt;)<\/mo>$/;
  const BIG = { sum: '∑', prod: '∏', int: '∫' };
  const LIMITS = new Set(['max', 'min', 'lim', 'sup', 'inf']);          // \max_{k}: the limit below in display formulas
  const NAMED = new Set(['log', 'ln', 'exp', 'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'arg', 'sgn', 'Re', 'Im', 'det', 'mod']);
  const ACCENT = { hat: '^', bar: '¯', tilde: '˜', vec: '→', dot: '˙', overline: '¯' }; // bars as plain overscripts: as accents they touch the letter
  const SPACE = { ',': '0.1667em', ':': '0.2222em', ';': '0.2778em', ' ': '0.25em', '!': '-0.1667em', quad: '1em', qquad: '2em' };

  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const mo = c => `<mo${FENCES.includes(c) ? ' stretchy="false"' : ''}>${esc(c)}</mo>`;
  const fence = c => c ? `<mo fence="true" stretchy="true">${esc(c)}</mo>` : '';
  const mi = (c, upright) => `<mi${upright ? ' mathvariant="normal"' : ''}>${esc(c)}</mi>`;
  const group = a => a.length === 1 ? a[0] : `<mrow>${a.join('')}</mrow>`;

  // TeX → the MathML inside <math>
  function convert(tex) {
    const s = String(tex);
    let i = 0;
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const at = t => s.startsWith(t, i);
    const stop = () => i >= s.length || s[i] === '}' || s[i] === '&' || at('\\\\') || at('\\right') || at('\\end');
    function raw() { // the text of a {group}, for \text, \mathrm, \begin…
      ws();
      if (s[i] !== '{') return s[i++] || '';
      let d = 0, j = i;
      for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; }
      const t = s.slice(i + 1, j); i = j + 1; return t;
    }
    function list() { // atoms up to the end of the group, a cell or row, or \right
      const out = [];
      for (;;) {
        ws(); if (stop()) break;
        const a = scripts(atom(false));
        if (!a) continue;
        // a sign after an opening bracket, a relation or another operator: no space as for a binary minus, as in (−π, π]
        if ((a.ml === '<mo>−</mo>' || a.ml === '<mo>+</mo>') && out.length && OPENER.test(out[out.length - 1])) a.ml = a.ml.replace('<mo>', '<mo form="prefix">');
        out.push(a.ml);
        if (a.fn) { ws(); if (!stop() && s[i] !== '(' && !at('\\left')) out.push('<mspace width="0.1667em"/>'); }
      }
      return out;
    }
    function braced() { i++; const a = list(); if (s[i] === '}') i++; return a.length ? group(a) : '<mrow></mrow>'; }
    function arg() { // a command's or a script's argument: a {group} or a single token
      ws();
      if (s[i] === '{') return braced();
      const a = atom(true); return a ? a.ml : '<mrow></mrow>';
    }
    function scripts(a) {
      if (!a) return null;
      let sub = null, sup = null, prime = '';
      for (;;) {
        ws();
        if (s[i] === '_' && sub == null) { i++; sub = arg(); } else if (s[i] === '^' && sup == null) { i++; sup = arg(); } else if (s[i] === "'") { i++; prime += '′'; } else break;
      }
      const base = prime ? `<mrow>${a.ml}<mo lspace="0em" rspace="0em">${prime}</mo></mrow>` : a.ml; // a prime in line: as a superscript it floats
      if (sub == null && sup == null) return prime ? { ml: base, fn: a.fn } : a;
      const tag = a.limits ? (sub && sup ? 'munderover' : sub ? 'munder' : 'mover') : (sub && sup ? 'msubsup' : sub ? 'msub' : 'msup');
      return { ml: `<${tag}>${base}${sub || ''}${sup || ''}</${tag}>`, fn: a.fn };
    }
    function delim() { // the delimiter after \left or \right ('.' for none)
      ws();
      if (s[i] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)) || ['\\', '']; i += m[0].length; return OPS[m[1]] || m[1]; }
      const c = s[i++] || ''; return c === '.' ? '' : c;
    }
    function table(cases) { // cells split by &, rows by \\, up to \end{…}
      const rows = [];
      let cells = [];
      for (;;) {
        const a = list(); cells.push(a.length ? group(a) : '<mrow></mrow>');
        if (s[i] === '&') { i++; continue; }
        rows.push(cells); cells = [];
        if (at('\\\\')) { i += 2; continue; }
        if (at('\\end')) { i += 4; raw(); }
        break;
      }
      const td = cases ? '<mtd style="text-align:left;padding:0 1.2em 0 0">' : '<mtd style="padding:0 .5em">';
      return `<mtable>${rows.map(r => `<mtr>${r.map(c => td + c + '</mtd>').join('')}</mtr>`).join('')}</mtable>`;
    }
    function command(name) {
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') { const a = arg(), b = arg(); return { ml: `<mfrac>${a}${b}</mfrac>` }; }
      if (name === 'sqrt') {
        ws();
        if (s[i] === '[') { const j = s.indexOf(']', i), n = convert(s.slice(i + 1, j)); i = j + 1; return { ml: `<mroot>${arg()}${n}</mroot>` }; }
        return { ml: `<msqrt>${arg()}</msqrt>` };
      }
      if (name === 'text' || name === 'mbox') return { ml: `<mtext>${esc(raw().replace(/^\s+|\s+$/g, m => ' '.repeat(m.length)))}</mtext>` };
      if (name === 'mathrm' || name === 'operatorname') { const t = raw(); return { ml: t.length === 1 ? mi(t, true) : `<mi>${esc(t)}</mi>`, fn: name === 'operatorname' }; }
      if (name === 'mathbf' || name === 'boldsymbol') return { ml: `<mrow style="font-weight:bold">${convert(raw())}</mrow>` };
      if (name === 'left') { const l = delim(), a = list(); let r = ''; if (at('\\right')) { i += 6; r = delim(); } return { ml: `<mrow>${fence(l)}${a.join('')}${fence(r)}</mrow>` }; }
      if (name === 'begin') {
        const env = raw();
        if (env === 'cases') return { ml: `<mrow>${fence('{')}${table(true)}</mrow>` };
        const br = { pmatrix: '()', bmatrix: '[]', vmatrix: '||' }[env] || '';
        return { ml: `<mrow>${fence(br[0])}${table(false)}${fence(br[1])}</mrow>` };
      }
      if (name in ACCENT) return { ml: `<mover${name === 'bar' || name === 'overline' ? '' : ' accent="true"'}>${arg()}<mo stretchy="${name === 'overline'}">${ACCENT[name]}</mo></mover>` };
      if (name in GREEK) return { ml: mi(GREEK[name], /^([A-Z]|ell$)/.test(name)) };
      if (name in BIG) return { ml: `<mo largeop="true" movablelimits="${name !== 'int'}">${BIG[name]}</mo>`, limits: name !== 'int' };
      if (LIMITS.has(name)) return { ml: `<mo movablelimits="true" form="prefix">${name}</mo>`, limits: true };
      if (NAMED.has(name)) return { ml: `<mi>${name}</mi>`, fn: true };
      if (name in OPS) return { ml: mo(OPS[name]) };
      if (name in SPACE) return { ml: `<mspace width="${SPACE[name]}"/>` };
      if (/^[%#$_&]$/.test(name)) return { ml: mo(name) };
      return { ml: `<merror><mtext>\\${esc(name)}</mtext></merror>` };
    }
    function atom(one) {
      ws();
      if (i >= s.length) return null;
      const c = s[i];
      if (c === '{') return { ml: braced() };
      if (c === '_' || c === '^') return { ml: '<mrow></mrow>' }; // a script without a base
      if (c === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)) || ['\\', '\\']; i += m[0].length; return command(m[1]); }
      if (/[0-9.]/.test(c)) {
        const m = one ? null : /^(\d+(\.\d+)?|\.\d+)/.exec(s.slice(i));
        const t = m ? m[0] : c; i += t.length;
        return { ml: t === '.' ? mo('.') : `<mn>${t}</mn>` };
      }
      i++;
      if (/[A-Za-z]/.test(c)) return { ml: mi(c) };
      if (c === '~') return { ml: '<mspace width="0.25em"/>' };
      if (c === '&' || c === '}') return null;
      return { ml: mo(c === '-' ? '−' : c === '*' ? '∗' : c) };
    }
    const out = [];
    while (i < s.length) { // stray }, &, \\ or \right at the top level are skipped
      out.push(...list());
      if (at('\\right')) { i += 6; delim(); } else if (at('\\\\')) i += 2; else if (at('\\end')) { i += 4; raw(); } else if (i < s.length) i++;
    }
    return out.length ? group(out) : '<mrow></mrow>';
  }

  // display: a formula on its own line (centred); otherwise inline in the text
  const toMathML = (tex, display) => `<math${display ? ' display="block"' : ''}>${convert(tex)}</math>`;

  const TEXMATH = { toMathML };
  if (typeof module !== 'undefined' && module.exports) module.exports = TEXMATH; else root.TEXMATH = TEXMATH;
})(typeof window !== 'undefined' ? window : globalThis);
