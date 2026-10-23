/* OpenSig Edit node (Signal tools ▸ Edit node, Edit ▸ Edit node, Control Window): a window in the analysis tree whose
   result is its parent's values with the changes typed into a simple spreadsheet. The parent is not changed; the edits
   are saved with the window (op.params.edits = {row: value}) and every window linked below the Edit node uses them.
   The table has a name box, a formula bar, row numbers and the X and Y columns; edited cells are yellow (the tooltip
   shows the original). Type a number or =formula (x, y = the original value, i = row number) into a Y cell; Ctrl+Enter
   fills the selection, Delete restores the original values, Ctrl+Z / Ctrl+Y undo / redo, Ctrl+C / Ctrl+V copy and
   paste. "Graph" shows the edited values as a normal signal window (window menu ▸ Show as table switches back). */
(function (root) {
  'use strict';
  const { APP, UI, OPS } = root;
  const S = APP.S, { h, toast } = UI;
  const RH = 20, HEADH = 22, MAXH = 8e6;                        // row height, header height, largest scroll height
  const grids = new WeakMap();                                  // window → table state
  // shortest text for a value: values stored as 32-bit floats (WAV files, workspaces) show as typed (0.309, not
  // 0.308999985456), other values with 12 significant digits
  const nf = v => {
    if (v == null || !isFinite(v)) return '';
    if (Math.fround(v) === v) for (let p = 1; p <= 9; p++) { const s = +v.toPrecision(p); if (Math.fround(s) === v) return String(s); }
    return String(+(+v).toPrecision(12));
  };
  const COLS = ['X', 'Y'];

  /* ---------- the operation ---------- */
  OPS.edit = {
    label: () => 'Edit node', kind: '1d', input: 'full',
    compute(w, [d], p) {
      if (!d || !d.y) throw new Error('The Edit node needs a 1D signal window as parent');
      const y = Float64Array.from(d.y), e = p.edits || {};
      for (const k in e) { const i = +k; if (i >= 0 && i < y.length && isFinite(e[k])) y[i] = e[k]; }
      return { y, x: d.x ? Float64Array.from(d.x) : null, x0: d.x0, dx: d.dx, xUnit: d.xUnit, yUnit: d.yUnit, t0abs: d.t0abs };
    }
  };

  // formulas: numbers, + - * / % ^ ( ) and x, y, i, pi, e, Math functions – nothing else
  const FN = ['abs', 'sqrt', 'exp', 'log', 'log10', 'log2', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'min', 'max', 'round', 'floor', 'ceil', 'pow', 'sign', 'hypot', 'trunc'];
  function compile(src) {
    const s = src.replace(/\^/g, '**');
    const toks = s.match(/[A-Za-z_][A-Za-z0-9_]*|\d*\.?\d+(?:[eE][+-]?\d+)?|\*\*|[-+*/%(),]|\s+/g) || [];
    if (toks.join('') !== s) throw new Error('The formula may use numbers, + − × ÷ ^ ( ), x, y, i and functions such as sqrt or sin');
    const body = toks.map(t => {
      if (!/^[A-Za-z_]/.test(t)) return t;
      if (t === 'x' || t === 'y' || t === 'i') return t;
      if (t === 'pi' || t === 'PI') return 'Math.PI';
      if (t === 'e') return 'Math.E';
      if (FN.includes(t)) return 'Math.' + t;
      throw new Error('Unknown name in the formula: ' + t);
    }).join('');
    const f = new Function('x', 'y', 'i', '"use strict"; return (' + body + ');');
    f(1, 1, 1); // syntax / runtime check
    return f;
  }
  const parseNum = t => { const s = t.trim(); const v = Number(/^[-+]?\d+,\d+$/.test(s) ? s.replace(',', '.') : s); return s !== '' && isFinite(v) ? v : NaN; };

  /* ---------- table DOM ---------- */
  function build(w) {
    const g = { w, act: { r: 0, c: 1 }, anc: { r: 0, c: 1 }, undo: [], redo: [], first: 0, vis: 1, n: 0, pool: [], editing: null };
    g.root = h('div', { class: 'tg' });
    g.root.innerHTML = `<div class="tg-bar"><input class="tg-name" spellcheck="false" aria-label="Cell reference (type Y100 and Enter to go there)">
        <span class="tg-fx" aria-hidden="true"><i>f</i>x</span><input class="tg-formula" spellcheck="false" aria-label="Cell value or formula" placeholder="number or =formula with x, y, i">
        <span class="tg-tools"><button class="tg-btn" data-act="undo" title="Undo (Ctrl+Z)">↶</button><button class="tg-btn" data-act="redo" title="Redo (Ctrl+Y)">↷</button>
        <button class="tg-btn" data-act="revert" title="Restore the original values of the selected cells (Delete)">Restore</button>
        <button class="tg-btn" data-act="revertAll" title="Restore every original value">Restore all</button>
        <button class="tg-btn" data-act="graph" title="Show the edited values as a graph">Graph</button></span></div>
      <div class="tg-scroll" tabindex="0" role="grid" aria-label="Values"><div class="tg-head" role="row"><div class="tg-corner" title="Select all"></div><div class="tg-ch" data-col="0"></div><div class="tg-ch" data-col="1"></div></div>
        <div class="tg-spacer"></div><div class="tg-rows"></div></div>
      <div class="tg-status"><span class="tg-mode">Ready</span><span class="tg-info"></span><span class="tg-sum"></span></div>`;
    const q = s => g.root.querySelector(s);
    Object.assign(g, { name: q('.tg-name'), formula: q('.tg-formula'), scroll: q('.tg-scroll'), spacer: q('.tg-spacer'), rowsEl: q('.tg-rows'), mode: q('.tg-mode'), info: q('.tg-info'), sum: q('.tg-sum') });
    wire(g);
    grids.set(w, g);
    return g;
  }

  const dataOf = g => g.w.data && g.w.data.y ? g.w.data : null;
  const xOf = (d, r) => d.x ? d.x[r] : d.x0 + r * d.dx;
  function origY(g) { // the parent's values (null when unlinked or of another length)
    const p = g.w.parents.length && S.wins.get(g.w.parents[0]), d = dataOf(g);
    return p && p.data && p.data.y && d && p.data.y.length === d.y.length ? p.data.y : null;
  }
  const editsOf = g => (g.w.op && g.w.op.params.edits) || {};
  function rng(g) {
    return { r0: Math.min(g.act.r, g.anc.r), r1: Math.max(g.act.r, g.anc.r), c0: Math.min(g.act.c, g.anc.c), c1: Math.max(g.act.c, g.anc.c) };
  }
  const ref = (c, r) => COLS[c] + (r + 1);

  function paint(g) {
    const d = dataOf(g), n = d ? d.y.length : 0, sc = g.scroll, edits = editsOf(g), orig = origY(g);
    g.n = n;
    if (g.act.r >= n) { g.act.r = g.anc.r = Math.max(0, n - 1); }
    const unit = u => u ? ` (${u})` : '';
    const gw = Math.max(44, 8 * String(n).length + 18);
    g.root.style.setProperty('--tg-cols', `${gw}px minmax(110px, 1fr) minmax(110px, 1fr)`);
    const R = rng(g), heads = g.root.querySelectorAll('.tg-ch');
    heads[0].textContent = 'X' + unit(d && d.xUnit); heads[1].textContent = 'Y' + unit(d && d.yUnit);
    heads.forEach((el, c) => el.classList.toggle('on', c >= R.c0 && c <= R.c1));
    const viewH = Math.max(RH, sc.clientHeight - HEADH);
    g.vis = Math.max(1, Math.floor(viewH / RH));
    const total = Math.min(MAXH, n * RH), maxScroll = Math.max(0, total + HEADH - sc.clientHeight);
    g.spacer.style.height = total + 'px';
    g.first = maxScroll > 0 ? Math.max(0, Math.min(n - g.vis, Math.round(sc.scrollTop / maxScroll * Math.max(0, n - g.vis)))) : 0;
    g.rowsEl.style.top = (Math.min(sc.scrollTop, maxScroll) + HEADH) + 'px';
    const need = Math.min(n, g.vis + 1);
    while (g.pool.length < need) {
      const row = h('div', { class: 'tg-row', role: 'row' }, h('div', { class: 'tg-rn' }), h('div', { class: 'tg-c tg-x', role: 'gridcell' }), h('div', { class: 'tg-c tg-y', role: 'gridcell' }));
      g.rowsEl.append(row); g.pool.push(row);
    }
    g.pool.forEach((row, k) => {
      const r = g.first + k;
      if (k >= need || r >= n) { row.hidden = true; return; }
      row.hidden = false; row.dataset.r = r;
      const [rn, cx, cy] = row.children, edited = r in edits;
      rn.textContent = r + 1; rn.classList.toggle('on', r >= R.r0 && r <= R.r1);
      cx.textContent = nf(xOf(d, r)); cy.textContent = nf(d.y[r]);
      [cx, cy].forEach((cell, c) => {
        cell.classList.toggle('sel', r >= R.r0 && r <= R.r1 && c >= R.c0 && c <= R.c1 && (R.r0 !== R.r1 || R.c0 !== R.c1));
        cell.classList.toggle('act', r === g.act.r && c === g.act.c);
      });
      cy.classList.toggle('edited', edited);
      cy.title = edited ? `Edited – original: ${orig ? nf(orig[r]) : '?'}` : '';
    });
    // name box, formula bar, status bar (Excel: average, count and sum of the selection)
    if (document.activeElement !== g.name) g.name.value = n ? (R.r0 === R.r1 && R.c0 === R.c1 ? ref(g.act.c, g.act.r) : `${ref(R.c0, R.r0)}:${ref(R.c1, R.r1)}`) : '';
    if (document.activeElement !== g.formula) { g.formula.value = n ? nf(g.act.c ? d.y[g.act.r] : xOf(d, g.act.r)) : ''; g.formula.readOnly = g.act.c !== 1; }
    const k = Object.keys(edits).length;
    g.info.textContent = `${n.toLocaleString()} rows · ${k.toLocaleString()} edited${g.w.frozen ? ' · unlinked' : ''}`;
    let sum = 0, cnt = 0;
    if (n && (R.r0 !== R.r1 || R.c0 !== R.c1)) {
      for (let r = R.r0; r <= R.r1 && cnt < 2e6; r++) for (let c = R.c0; c <= R.c1; c++) { const v = c ? d.y[r] : xOf(d, r); if (isFinite(v)) { sum += v; cnt++; } }
      g.sum.textContent = `Average: ${nf(sum / cnt)}   Count: ${cnt.toLocaleString()}   Sum: ${nf(sum)}`;
    } else g.sum.textContent = '';
    g.mode.textContent = g.editing ? 'Edit' : 'Ready';
    g.root.querySelector('[data-act=undo]').disabled = !g.undo.length;
    g.root.querySelector('[data-act=redo]').disabled = !g.redo.length;
    g.root.querySelector('[data-act=revertAll]').disabled = !k;
  }

  // scroll so that row r is visible
  function reveal(g, r) {
    const sc = g.scroll, total = Math.min(MAXH, g.n * RH), maxScroll = Math.max(0, total + HEADH - sc.clientHeight), span = Math.max(1, g.n - g.vis);
    const toScroll = f => maxScroll * Math.max(0, Math.min(span, f)) / span;
    if (r < g.first) sc.scrollTop = toScroll(r);
    else if (r >= g.first + g.vis) sc.scrollTop = toScroll(r - g.vis + 1);
  }
  function select(g, r, c, extend) {
    if (!g.n) return;
    g.act = { r: Math.max(0, Math.min(g.n - 1, r)), c: Math.max(0, Math.min(1, c)) };
    if (!extend) g.anc = Object.assign({}, g.act);
    reveal(g, g.act.r); paint(g);
  }

  /* ---------- editing ---------- */
  function setEdits(g, edits, noUndo) {
    const w = g.w, before = editsOf(g);
    if (!noUndo) { g.undo.push(before); if (g.undo.length > 200) g.undo.shift(); g.redo = []; }
    w.op.params.edits = edits;
    const orig = origY(g);
    if (w.frozen || !orig) { // unlinked: change this window's own values
      const d = w.data, y = Float64Array.from(d.y);
      for (const k in edits) { const i = +k; if (i >= 0 && i < y.length) y[i] = edits[k]; }
      for (const k in before) if (!(k in edits) && orig) y[+k] = orig[+k];
      w.data = Object.assign({}, d, { y }); APP.afterData(w);
    } else APP.queueCompute(w);
    APP.emit();
  }
  // text into the active cell, or with fill into every selected Y cell: number, =formula, or empty (= original value)
  function commit(g, text, fill) {
    const d = dataOf(g); if (!d) return false;
    const R = fill ? rng(g) : { r0: g.act.r, r1: g.act.r, c0: g.act.c, c1: g.act.c };
    if (R.c1 < 1) { toast('Only the Y column can be edited; X follows the sample rate.'); return false; }
    const t = String(text).trim(), orig = origY(g), edits = Object.assign({}, editsOf(g));
    let f = null, num = NaN;
    try { if (t.startsWith('=')) f = compile(t.slice(1)); else if (t !== '') { num = parseNum(t); if (!isFinite(num)) throw new Error(`"${t}" is not a number`); } }
    catch (e) { toast(e.message, 'err'); return false; }
    let bad = 0;
    for (let r = R.r0; r <= R.r1; r++) {
      const o = orig ? orig[r] : d.y[r];
      const v = t === '' ? o : f ? f(xOf(d, r), o, r + 1) : num;
      if (!isFinite(v)) { bad++; continue; }
      if (orig && Object.is(v, o)) delete edits[r]; else edits[r] = v;
    }
    if (bad) toast(`${bad} cell${bad === 1 ? '' : 's'} not changed: the formula gave no number`, 'err');
    setEdits(g, edits);
    return true;
  }
  function revertSel(g) {
    const R = rng(g), edits = Object.assign({}, editsOf(g)); let k = 0;
    for (let r = R.r0; r <= R.r1; r++) if (r in edits) { delete edits[r]; k++; }
    if (k) setEdits(g, edits);
  }
  function step(g, from, to) { if (!from.length) return; to.push(editsOf(g)); setEdits(g, from.pop(), true); }

  // inline editor over the active Y cell
  function startEdit(g, initial) {
    if (g.act.c !== 1) { toast('Only the Y column can be edited; X follows the sample rate.'); return; }
    if (g.editing) return;
    const d = dataOf(g); if (!d) return;
    reveal(g, g.act.r); paint(g);
    const row = g.pool.find(rw => !rw.hidden && +rw.dataset.r === g.act.r), cell = row && row.children[2];
    if (!cell) return;
    const inp = h('input', { class: 'tg-edit', spellcheck: 'false' });
    inp.value = initial != null ? initial : nf(d.y[g.act.r]);
    Object.assign(inp.style, { left: cell.offsetLeft + 'px', top: (row.offsetTop + g.rowsEl.offsetTop) + 'px', width: cell.offsetWidth + 'px', height: RH + 'px' });
    g.scroll.append(inp); g.editing = { inp, r: g.act.r };
    inp.focus(); if (initial == null) inp.select(); else inp.setSelectionRange(inp.value.length, inp.value.length);
    let done = false;
    const finish = (save, fill, dr, dc) => {
      if (done) return; done = true;
      const val = inp.value; inp.remove(); g.editing = null;
      if (save) commit(g, val, fill);
      g.scroll.focus({ preventScroll: true });
      if (dr || dc) select(g, g.act.r + (dr || 0), g.act.c + (dc || 0)); else paint(g);
    };
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true, e.ctrlKey || e.metaKey, (e.ctrlKey || e.metaKey) ? 0 : e.shiftKey ? -1 : 1); }
      else if (e.key === 'Tab') { e.preventDefault(); finish(true, false, 0, e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); finish(true, false, e.key === 'ArrowUp' ? -1 : 1); }
    });
    inp.addEventListener('blur', () => finish(true, false));
    paint(g);
  }

  /* ---------- clipboard ---------- */
  function copyText(g) {
    const d = dataOf(g); if (!d) return '';
    const R = rng(g), lines = [];
    if (R.r1 - R.r0 > 2e6) throw new Error('Select fewer rows to copy (at most 2 million).');
    for (let r = R.r0; r <= R.r1; r++) { const v = []; for (let c = R.c0; c <= R.c1; c++) v.push(nf(c ? d.y[r] : xOf(d, r))); lines.push(v.join('\t')); }
    return lines.join('\n');
  }
  // pasted numbers go into the Y column from the active row down (the last number of each line); one number fills the selection
  function paste(g, text) {
    const vals = String(text).replace(/\r/g, '').split('\n').filter(l => l.trim() !== '').map(l => { const f = l.split(/\t|;/).filter(s => s.trim() !== ''); return f.length ? parseNum(f[f.length - 1]) : NaN; });
    if (!vals.length) return;
    if (vals.some(v => !isFinite(v))) { toast('Only numbers can be pasted into the table.', 'err'); return; }
    const R = rng(g);
    if (vals.length === 1 && R.r1 > R.r0) { g.act.c = g.anc.c = 1; commit(g, String(vals[0]), true); return; }
    const orig = origY(g), d = dataOf(g), edits = Object.assign({}, editsOf(g)), r0 = R.r0;
    let k = 0;
    for (let j = 0; j < vals.length && r0 + j < g.n; j++, k++) { const r = r0 + j; if (orig && Object.is(vals[j], orig[r])) delete edits[r]; else edits[r] = vals[j]; }
    setEdits(g, edits);
    g.act = { r: Math.min(g.n - 1, r0 + k - 1), c: 1 }; g.anc = { r: r0, c: 1 };
    if (vals.length > k) toast(`${vals.length - k} value${vals.length - k === 1 ? '' : 's'} did not fit below the last row`);
    reveal(g, g.act.r); paint(g);
  }

  /* ---------- mouse & keyboard ---------- */
  function wire(g) {
    const sc = g.scroll;
    sc.addEventListener('scroll', () => { if (g.editing) g.editing.inp.blur(); paint(g); });
    const cellAt = e => { const row = e.target.closest('.tg-row'); if (!row) return null; const r = +row.dataset.r; const c = e.target.closest('.tg-x') ? 0 : e.target.closest('.tg-y') ? 1 : -1; return { r, c }; };
    sc.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.tg-edit')) return;
      sc.focus({ preventScroll: true });
      if (e.target.closest('.tg-corner')) { g.anc = { r: 0, c: 0 }; g.act = { r: Math.max(0, g.n - 1), c: 1 }; paint(g); return; }
      const ch = e.target.closest('.tg-ch');
      if (ch) { const c = +ch.dataset.col; g.anc = { r: 0, c }; g.act = { r: Math.max(0, g.n - 1), c }; paint(g); return; }
      const at = cellAt(e); if (!at) return;
      if (at.c < 0) { if (e.shiftKey) { g.act = { r: at.r, c: 1 }; } else { g.anc = { r: at.r, c: 0 }; g.act = { r: at.r, c: 1 }; } paint(g); g.dragRow = true; return; } // row number: whole row
      select(g, at.r, at.c, e.shiftKey); g.dragSel = true;
    });
    sc.addEventListener('pointermove', e => {
      if (!(e.buttons & 1) || (!g.dragSel && !g.dragRow)) return;
      const at = cellAt(e); if (!at) return;
      g.act = { r: at.r, c: g.dragRow ? 1 : Math.max(0, at.c) }; paint(g);
    });
    addEventListener('pointerup', () => { g.dragSel = g.dragRow = false; });
    sc.addEventListener('dblclick', e => { const at = cellAt(e); if (at && at.c === 1) { select(g, at.r, 1); startEdit(g, null); } });
    sc.addEventListener('keydown', e => {
      if (e.target !== sc) return;
      const ctrl = e.ctrlKey || e.metaKey, k = e.key, R = rng(g);
      let ok = true;
      const mv = (dr, dc) => select(g, g.act.r + dr, g.act.c + dc, e.shiftKey);
      if (k === 'ArrowDown') ctrl ? select(g, g.n - 1, g.act.c, e.shiftKey) : mv(1, 0);
      else if (k === 'ArrowUp') ctrl ? select(g, 0, g.act.c, e.shiftKey) : mv(-1, 0);
      else if (k === 'ArrowRight') mv(0, 1);
      else if (k === 'ArrowLeft') mv(0, -1);
      else if (k === 'PageDown') mv(g.vis, 0);
      else if (k === 'PageUp') mv(-g.vis, 0);
      else if (k === 'Home') ctrl ? select(g, 0, 0, e.shiftKey) : select(g, g.act.r, 0, e.shiftKey);
      else if (k === 'End') ctrl ? select(g, g.n - 1, 1, e.shiftKey) : select(g, g.act.r, 1, e.shiftKey);
      else if (k === 'Enter') { if (R.r0 !== R.r1 && !e.shiftKey) mv(1, 0); else mv(e.shiftKey ? -1 : 1, 0); }
      else if (k === 'Tab') mv(0, e.shiftKey ? -1 : 1);
      else if (k === 'F2') startEdit(g, null);
      else if (k === 'Delete' || k === 'Backspace') revertSel(g);
      else if (k === 'Escape') { g.anc = Object.assign({}, g.act); paint(g); }
      else if (ctrl && k.toLowerCase() === 'z') step(g, g.undo, g.redo);
      else if (ctrl && k.toLowerCase() === 'y') step(g, g.redo, g.undo);
      else if (ctrl && k.toLowerCase() === 'a') { g.anc = { r: 0, c: 0 }; g.act = { r: Math.max(0, g.n - 1), c: 1 }; paint(g); }
      else if (ctrl && k.toLowerCase() === 'c') { try { const t = copyText(g); navigator.clipboard.writeText(t).then(() => toast(`Copied ${(R.r1 - R.r0 + 1).toLocaleString()} row${R.r1 > R.r0 ? 's' : ''}`), () => toast('Copying needs clipboard access', 'err')); } catch (err) { toast(err.message, 'err'); } }
      else if (ctrl && k.toLowerCase() === 'v') { ok = false; } // the paste event below does it
      else if (!ctrl && !e.altKey && k.length === 1) startEdit(g, k);
      else ok = false;
      if (ok) { e.preventDefault(); e.stopPropagation(); }        // handled here, not window shortcuts (Delete, arrows …)
      else if (!ctrl && !/^F\d+$/.test(k)) e.stopPropagation();  // other Ctrl and F keys stay app shortcuts (F1, Ctrl+S …)
    });
    sc.addEventListener('paste', e => { const t = e.clipboardData && e.clipboardData.getData('text/plain'); if (t) { e.preventDefault(); paste(g, t); } });
    sc.addEventListener('copy', e => { if (e.target !== sc) return; try { e.clipboardData.setData('text/plain', copyText(g)); e.preventDefault(); } catch (err) { /* too big */ } });
    // formula bar and name box
    g.formula.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); const fill = e.ctrlKey || e.metaKey; if (commit(g, g.formula.value, fill)) { g.formula.blur(); sc.focus({ preventScroll: true }); if (!fill) select(g, g.act.r + 1, g.act.c); } }
      else if (e.key === 'Escape') { e.preventDefault(); g.formula.blur(); sc.focus({ preventScroll: true }); paint(g); }
    });
    g.formula.addEventListener('focus', () => { g.mode.textContent = 'Edit'; });
    g.formula.addEventListener('blur', () => paint(g));
    g.name.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const m = /^\s*([xy])?\s*(\d+)\s*$/i.exec(g.name.value);
        if (!m) { toast('Type a row number or a cell such as Y100'); return; }
        g.name.blur(); sc.focus({ preventScroll: true });
        select(g, +m[2] - 1, m[1] ? (m[1].toLowerCase() === 'x' ? 0 : 1) : g.act.c);
      } else if (e.key === 'Escape') { e.preventDefault(); g.name.blur(); sc.focus({ preventScroll: true }); paint(g); }
    });
    g.name.addEventListener('blur', () => paint(g));
    g.root.querySelector('.tg-tools').addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'undo') step(g, g.undo, g.redo);
      else if (a === 'redo') step(g, g.redo, g.undo);
      else if (a === 'revert') revertSel(g);
      else if (a === 'revertAll') { if (Object.keys(editsOf(g)).length) setEdits(g, {}); }
      else if (a === 'graph') { g.w.display.table = false; APP.requestRender(g.w); }
      sc.focus({ preventScroll: true });
    });
  }

  /* ---------- rendering (called from the window's render) ---------- */
  function render(w) {
    const g = grids.get(w) || build(w);
    w.canvas.style.display = 'none';
    w.instEl.style.display = '';
    w.instEl.classList.remove('with-gauge');
    if (w.instEl.firstChild !== g.root) w.instEl.replaceChildren(g.root);
    w.lay = null;
    paint(g);
  }

  /* ---------- commands ---------- */
  function addEditNode(src) {
    const w = src || UI.need('1d');
    if (!w.data || !w.data.y) throw new Error('This window has no values yet.');
    const e = APP.derive(w, 'edit', { edits: {} }, { display: { table: true } });
    toast(`Edit node ${e.label}: type into the Y column; windows linked to ${e.label} use the edited values`);
    return e;
  }
  const isEdit = w => !!(w && w.op && w.op.type === 'edit');
  const has1D = () => !!(S.active && S.active.kind === '1d' && S.active.data && S.active.data.y);
  const item = { label: 'Edit node (table)…', en: has1D, run: () => addEditNode() };
  const insertAfter = (menu, after, it) => { const m = UI.MENUS.find(x => x.label === menu); if (!m) return; const i = m.items.findIndex(x => x !== '-' && x.label === after); m.items.splice(i >= 0 ? i + 1 : m.items.length, 0, it); };
  insertAfter('Signal tools', 'Signal calculator…', item);
  insertAfter('Edit', 'Edit signal values…', Object.assign({}, item));
  const prevExtra = UI.extraWindowItems;
  UI.extraWindowItems = w => {
    const out = prevExtra ? prevExtra(w) : [];
    if (isEdit(w)) out.unshift({ label: 'Show as table', checked: () => !!w.display.table, run: () => { w.display.table = !w.display.table; APP.requestRender(w); } });
    else if (w.kind === '1d' && w.data && w.data.y) out.push({ label: 'Add edit node (table)', run: () => addEditNode(w) });
    return out;
  };

  root.TABLE = { render, addEditNode, compile };
})(window);
