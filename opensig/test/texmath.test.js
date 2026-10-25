// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const TEXMATH = require('../js/texmath.js');

const ml = t => TEXMATH.toMathML(t).replace(/^<math>|<\/math>$/g, '');

test('TeX subset converts to MathML', () => {
  assert.equal(ml('x_n'), '<msub><mi>x</mi><mi>n</mi></msub>');
  assert.equal(ml('x_12'), '<mrow><msub><mi>x</mi><mn>1</mn></msub><mn>2</mn></mrow>');
  assert.equal(ml('10^{-3}'), '<msup><mn>10</mn><mrow><mo>−</mo><mn>3</mn></mrow></msup>');
  assert.equal(ml(String.raw`\frac{a}{b}`), '<mfrac><mi>a</mi><mi>b</mi></mfrac>');
  assert.equal(ml(String.raw`\sqrt{x}`), '<msqrt><mi>x</mi></msqrt>');
  assert.equal(ml(String.raw`\Delta f`), '<mrow><mi mathvariant="normal">Δ</mi><mi>f</mi></mrow>');
  assert.equal(ml(String.raw`\text{ if }`), '<mtext> if </mtext>');
  assert.match(ml(String.raw`\sum_{n=0}^{N-1} x_n`), /^<mrow><munderover><mo largeop="true" movablelimits="true">∑<\/mo>/);
  assert.match(ml(String.raw`\max_k P_k`), /<munder><mo movablelimits="true" form="prefix">max<\/mo><mi>k<\/mi><\/munder>/);
  assert.equal(ml(String.raw`\left|X\right|`), '<mrow><mo fence="true" stretchy="true">|</mo><mi>X</mi><mo fence="true" stretchy="true">|</mo></mrow>');
  assert.equal(ml('(a)'), '<mrow><mo stretchy="false">(</mo><mi>a</mi><mo stretchy="false">)</mo></mrow>');
  assert.equal(ml('a<b'), '<mrow><mi>a</mi><mo>&lt;</mo><mi>b</mi></mrow>');
  assert.equal(ml(String.raw`\log x`), '<mrow><mi>log</mi><mspace width="0.1667em"/><mi>x</mi></mrow>');
  assert.equal(ml(String.raw`\log(x)`), '<mrow><mi>log</mi><mo stretchy="false">(</mo><mi>x</mi><mo stretchy="false">)</mo></mrow>');
  assert.equal(ml(String.raw`\hat{H}`), '<mover accent="true"><mi>H</mi><mo stretchy="false">^</mo></mover>');
  assert.equal(ml(String.raw`\bar{x}`), '<mover><mi>x</mi><mo stretchy="false">¯</mo></mover>');
  assert.equal(ml("L'"), '<mrow><mi>L</mi><mo lspace="0em" rspace="0em">′</mo></mrow>');
  assert.equal(ml("x'_k"), '<msub><mrow><mi>x</mi><mo lspace="0em" rspace="0em">′</mo></mrow><mi>k</mi></msub>');
  assert.equal(TEXMATH.toMathML('x', true), '<math display="block"><mi>x</mi></math>');
  assert.equal(ml('(-a)'), '<mrow><mo stretchy="false">(</mo><mo form="prefix">−</mo><mi>a</mi><mo stretchy="false">)</mo></mrow>');
  assert.equal(ml('(a)-b'), '<mrow><mo stretchy="false">(</mo><mi>a</mi><mo stretchy="false">)</mo><mo>−</mo><mi>b</mi></mrow>');
  assert.equal(ml('x=-1'), '<mrow><mi>x</mi><mo>=</mo><mo form="prefix">−</mo><mn>1</mn></mrow>');
});

test('cases and matrices become tables', () => {
  const c = ml(String.raw`\begin{cases} 1 & k=0 \\ 2 & k>0 \end{cases}`);
  assert.equal((c.match(/<mtr>/g) || []).length, 2);
  assert.equal((c.match(/<mtd /g) || []).length, 4);
  assert.match(c, /^<mrow><mo fence="true" stretchy="true">\{<\/mo><mtable>/);
  const m = ml(String.raw`\begin{bmatrix} a & b \\ c & d \end{bmatrix}`);
  assert.match(m, /^<mrow><mo fence="true" stretchy="true">\[<\/mo><mtable>.*<\/mtable><mo fence="true" stretchy="true">\]<\/mo><\/mrow>$/);
});

test('unknown commands and stray braces do not hang', () => {
  assert.match(ml(String.raw`\nosuchthing x`), /<merror><mtext>\\nosuchthing<\/mtext><\/merror>/);
  assert.equal(ml('a}b'), '<mrow><mi>a</mi><mi>b</mi></mrow>');
  assert.equal(ml(''), '<mrow></mrow>');
  assert.ok(ml(String.raw`\left( x`).includes('<mi>x</mi>'));
});

test('every formula in the user manual converts without errors', () => {
  globalThis.window = globalThis; globalThis.TEXMATH = TEXMATH;
  require('../js/helpdata.js');
  const all = [];
  const walk = list => list.forEach(t => { all.push(t); if (t.topics) walk(t.topics); });
  walk(globalThis.HELPDATA.books);
  const html = all.map(t => t.html || '').join('\n');
  assert.ok((html.match(/<math/g) || []).length > 50, 'the spectral topics have their formulas');
  assert.ok(!html.includes('<merror'), 'no unknown TeX commands');
});
