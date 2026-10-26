/* OpenSig Value picker (Instruments ▸ Value picker, Ctrl+Shift+P, toolbar): pick values and positions on signal and
   analysis graphs. In pick mode a click – or Shift+click at any time – drops a numbered point on the trace, snapped to
   the nearest sample, the highest or lowest value near the mouse, an interpolated position, or the free mouse position.
   Points can be dragged, moved by one sample with ←/→ (Shift: 10 samples) and removed with Delete; Esc deselects.
   The Picked values table lists X, Y and the differences to the previous point (ΔX, ΔY, 1/ΔX) for copying or CSV
   export. Points are stored with the window, so workspaces keep them. The peaks found by a window's peak detection
   (Signal tools ▸ Peak detection…, "Pick the detected peaks") are its first points, P1 … in X order, kept in step
   with the detection; the points picked by hand follow them. */
(function (root) {
  'use strict';
  const { APP, UI, PLOT } = root;
  const S = APP.S, { dialog, toast, need, h, download, guard } = UI;
  const SNAPS = [['sample', 'Nearest sample'], ['peak', 'Highest value near the mouse'], ['valley', 'Lowest value near the mouse'], ['interp', 'Interpolated (exact X)'], ['free', 'Free position (mouse X and Y)']];
  const NEAR = 10;                                             // pixels searched for the highest / lowest value
  let mode = false, sel = null, drag = null, panel = null, timer = null;
  const snap = () => S.settings.pickSnap || 'sample';
  const nf = v => !isFinite(v) ? '—' : root.NUMFMT ? root.NUMFMT(v) : PLOT.fmt(v, Math.abs(v) / 1000 || 1);
  const unit = u => u ? ' ' + u : '';
  const xOf = (d, i) => d.x ? d.x[i] : d.x0 + i * d.dx;
  const picksOf = w => w.display.picks || (w.display.picks = []);
  const has1D = () => S.active && S.active.kind === '1d' && S.active.data && S.active.data.y;

  /* ---------- positions ---------- */
  function yOf(d, p) { // Y of a point on the current data (follows live data); a picked peak has its refined value
    if (p.mode === 'free' || p.auto) return p.y;
    if (p.mode === 'interp' && !d.x) {
      const f = (p.x - d.x0) / d.dx, i = Math.floor(f);
      if (i < 0 || i > d.y.length - 1) return NaN;
      return i === d.y.length - 1 ? d.y[i] : d.y[i] + (d.y[i + 1] - d.y[i]) * (f - i);
    }
    const v = APP.valueAt(d, p.x);
    return v && Math.abs(v.x - p.x) <= (d.dx || Infinity) ? v.y : NaN;
  }
  function place(w, pt, m) { // new point at canvas position pt with snap mode m
    const d = w.data, ax = w.lay.ax, ay = w.lay.ay, x = ax.fromPx(pt.px);
    if (m === 'free') return { x, y: ay.fromPx(pt.py), mode: m };
    if (m === 'interp' && !d.x) return { x, mode: m };
    if (m === 'peak' || m === 'valley') {
      const a = APP.valueAt(d, ax.fromPx(pt.px - NEAR)), b = APP.valueAt(d, ax.fromPx(pt.px + NEAR));
      if (a && b) {
        let best = Math.min(a.i, b.i);
        for (let i = Math.min(a.i, b.i); i <= Math.max(a.i, b.i); i++) if (m === 'peak' ? d.y[i] > d.y[best] : d.y[i] < d.y[best]) best = i;
        return { x: xOf(d, best), mode: m };
      }
    }
    const v = APP.valueAt(d, x);
    return { x: v ? v.x : x, mode: m === 'interp' ? 'sample' : m };
  }
  function labelOf(d, p, k) { return `P${k + 1}  ${nf(p.x)}${unit(d.xUnit)} | ${nf(yOf(d, p))}${unit(d.yUnit)}`; }
  const kindOf = p => p.auto === 'valley' ? ' ▼' : p.auto ? ' ▲' : ''; // a picked peak or valley

  // points for the graph (called from the window's render); a picked peak gets a short tag – the peak annotation shows
  // its values – unless it is the selected point
  function marks(w, d) {
    const ps = w.display.picks; if (!ps || !ps.length || !d || !d.y) return null;
    return ps.map((p, k) => {
      const on = !!(sel && sel.w === w.id && sel.i === k), short = p.auto && !on;
      return { x: p.x, y: yOf(d, p), label: short ? null : labelOf(d, p, k), tag: short ? 'P' + (k + 1) : null, tagUp: p.auto === 'valley', sel: on };
    }).filter(m => isFinite(m.y));
  }

  // The peaks of a window's peak detection as its first points (pk from APP.peaksOf, null: none), called whenever they
  // change. Points picked by hand follow them; a peak point that is dragged or moved becomes one of those.
  const MAXPEAKS = 200;
  function syncPeaks(w, pk) {
    const ps = w.display.picks || [], own = ps.filter(p => !p.auto), old = ps.length - own.length;
    const on = !!pk && !!w.display.peaks && w.display.peaks.pick !== false;
    const peaks = on ? pk.x.slice(0, MAXPEAKS).map((x, k) => ({ x, y: pk.y[k], mode: 'peak', auto: pk.neg[k] ? 'valley' : 'peak' })) : [];
    if (peaks.length === old && peaks.every((p, k) => p.x === ps[k].x && p.y === ps[k].y && p.auto === ps[k].auto)) return; // no change
    if (sel && sel.w === w.id) sel = sel.i < old ? null : { w: w.id, i: sel.i - old + peaks.length };
    w.display.picks = peaks.concat(own);
    refreshTable();
  }

  /* ---------- mouse (called by the window's pointer handlers) ---------- */
  function hit(w, pt) {
    const ps = w.display.picks; if (!ps || !ps.length) return -1;
    let best = -1, bd = 9;
    ps.forEach((q, k) => { const dist = Math.hypot(w.lay.ax.toPx(q.x) - pt.px, w.lay.ay.toPx(yOf(w.data, q)) - pt.py); if (dist < bd) { bd = dist; best = k; } });
    return best;
  }
  function select(w, k) {
    const prev = sel && S.wins.get(sel.w);
    sel = k == null ? null : { w: w.id, i: k };
    if (prev && prev !== w) APP.requestRender(prev);
    APP.requestRender(w); refreshTable();
  }
  function down(w, pt, e) {
    if (!w.data || !w.data.y || !w.lay) return false;
    const k = hit(w, pt);
    if (k >= 0) { select(w, k); drag = { w: w.id, i: k }; return true; }             // grab an existing point
    if (!mode && !e.shiftKey) return false;                                         // normal click: fixed cursor / zoom
    const ps = picksOf(w); ps.push(place(w, pt, snap()));
    select(w, ps.length - 1); drag = { w: w.id, i: ps.length - 1 };
    return true;
  }
  function move(w, pt) {
    if (!drag || drag.w !== w.id) return;
    const ps = picksOf(w), q = ps[drag.i]; if (!q) return;
    ps[drag.i] = place(w, pt, q.mode);                                              // re-snap while dragging
    APP.requestRender(w); refreshTable();
  }
  function up() { drag = null; refreshTable(); }

  /* ---------- keyboard: ←/→ move the selected point, Delete removes it, Esc deselects ---------- */
  document.addEventListener('keydown', e => {
    if (!sel || (e.target && e.target.closest && e.target.closest('input, textarea, select, dialog, .cw-body, .win-help, .tg'))) return;
    const w = S.wins.get(sel.w), ps = w && w.display.picks, p = ps && ps[sel.i];
    if (!p || S.active !== w || !w.data || !w.data.y) return;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === 'Delete' || e.key === 'Backspace') { stop(); ps.splice(sel.i, 1); select(w, null); return; }
    if (e.key === 'Escape') { stop(); select(w, null); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && !e.altKey) {
      stop();
      const d = w.data, n = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1);
      if (p.auto) { delete p.auto; delete p.y; p.mode = 'sample'; } // a moved peak point is the user's
      if (p.mode === 'free') { p.x += n * (d.dx || (w.view.x1 - w.view.x0) / 500); }
      else { const v = APP.valueAt(d, p.x), i = Math.max(0, Math.min(d.y.length - 1, (v ? v.i : 0) + n)); p.x = xOf(d, i); if (p.mode === 'interp') p.mode = 'sample'; }
      APP.requestRender(w); refreshTable();
    }
  }, true);

  /* ---------- commands ---------- */
  function toggleMode(force) {
    mode = force != null ? !!force : !mode;
    document.body.classList.toggle('picking', mode);
    if (mode) toast('Value picker on – click a graph to pick a value; drag points, ←/→ move, Delete removes. Shift+click picks at any time.');
    if (UI.refreshToolbar) UI.refreshToolbar();
  }
  async function addAtX() {
    const w = need('1d'), d = w.data;
    const v = await dialog({ title: 'Add pick at X – ' + w.label, fields: [
      { key: 'x', label: 'X position' + unit(d.xUnit), type: 'number', value: +PLOT.fmt((w.view.x0 + w.view.x1) / 2, w.view.x1 - w.view.x0) },
      { key: 'how', label: 'Value', type: 'radio', options: [['sample', 'Nearest sample'], ['interp', 'Interpolated at exactly this X']], value: 'sample' }],
      validate: v => v.x == null || !isFinite(v.x) ? 'Enter an X position' : null });
    if (!v) return;
    let p = { x: v.x, mode: v.how === 'interp' && !d.x ? 'interp' : 'sample' };
    if (p.mode === 'sample') { const s = APP.valueAt(d, v.x); if (s) p.x = s.x; }
    const ps = picksOf(w); ps.push(p); select(w, ps.length - 1);
    if (p.x < w.view.x0 || p.x > w.view.x1) toast('The point is outside the visible part – zoom out to see it.');
  }
  function clearWindow(w) { if (w.display.picks && w.display.picks.length) { w.display.picks = []; if (sel && sel.w === w.id) sel = null; APP.requestRender(w); refreshTable(); } }
  function remove(w, k) { // point k of a window (Control Window)
    const ps = w.display.picks; if (!ps || !ps[k]) return;
    ps.splice(k, 1);
    if (sel && sel.w === w.id) sel = sel.i === k ? null : sel.i > k ? { w: w.id, i: sel.i - 1 } : sel;
    APP.requestRender(w); refreshTable();
  }
  function clearAll() { S.wins.forEach(clearWindow); }

  /* ---------- Picked values table ---------- */
  function rows(only) { // [{w, k, p, x, y, dx, dy}] for all windows with points (or only the given windows)
    const out = [];
    for (const w of (only || [...S.wins.values()]).slice().sort((a, b) => a.id - b.id)) {
      const ps = w.display.picks; if (!ps || !ps.length || !w.data || !w.data.y) continue;
      let prev = null;
      ps.forEach((p, k) => { const y = yOf(w.data, p), r = { w, k, p, x: p.x, y, dx: prev ? p.x - prev.x : NaN, dy: prev ? y - prev.y : NaN }; out.push(r); prev = r; });
    }
    return out;
  }
  function asText(sep, only) {
    const hdr = ['Window', 'Point', 'X', 'X unit', 'Y', 'Y unit', 'dX', 'dY', '1/dX'];
    const f = v => isFinite(v) ? (IOfmt(v)) : '';
    return [hdr.join(sep)].concat(rows(only).map(r => [r.w.label + ' ' + r.w.title, 'P' + (r.k + 1) + (r.p.auto ? ' ' + r.p.auto : ''), f(r.x), r.w.data.xUnit || '', f(r.y), r.w.data.yUnit || '', f(r.dx), f(r.dy), r.dx ? f(1 / r.dx) : ''].join(sep))).join('\r\n') + '\r\n';
  }
  const IOfmt = v => root.IO && root.IO.fmtNum ? root.IO.fmtNum(v) : String(v);

  function buildPanel() {
    panel = h('section', { class: 'win win-panel', 'aria-label': 'Picked values' });
    panel.innerHTML = `<header class="win-head"><svg class="win-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5" fill="none" stroke="#ff8c00" stroke-width="1.6"/><path d="M8 1v4M8 11v4M1 8h4M11 8h4" stroke="#333" stroke-width="1.2"/></svg>
      <span class="win-title">Picked values</span><span class="win-btns"><button class="wb" data-act="close" title="Close">✕</button></span></header>
      <div class="pk-bar"></div><div class="pk-body"><table class="pk-table"><thead><tr><th>Window</th><th>Point</th><th>X</th><th>Y</th><th>ΔX</th><th>ΔY</th><th>1/ΔX</th><th></th></tr></thead><tbody></tbody></table></div><div class="win-resize" title="Resize"></div>`;
    const bar = panel.querySelector('.pk-bar');
    const btn = (label, run, title) => { const b = h('button', { class: 'btn', type: 'button', title: title || label }, label); b.addEventListener('click', () => guard(run)()); bar.append(b); return b; };
    const pickBtn = btn('Pick mode', () => toggleMode(), 'Click graphs to pick values (Ctrl+Shift+P)');
    const snapSel = h('select', { title: 'Where a new point goes' }, ...SNAPS.map(([v, l]) => h('option', { value: v }, l)));
    snapSel.value = snap(); snapSel.addEventListener('change', () => { S.settings.pickSnap = snapSel.value; APP.saveSettings(); });
    bar.append(snapSel);
    btn('Add at X…', addAtX, 'Add a point at a typed X position in the active window');
    btn('Copy', async () => { await navigator.clipboard.writeText(asText('\t')); toast('Picked values copied (tab-separated)'); });
    btn('Save CSV…', () => download('picked-values.csv', asText(';'), 'text/csv'));
    btn('Clear all', clearAll);
    panel._pickBtn = pickBtn; panel._snap = snapSel;
    const r = { x: Math.max(4, S.desktop.clientWidth - 560), y: Math.max(4, S.desktop.clientHeight - 260), w: 552, h: 250 };
    Object.assign(panel.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', zIndex: ++S.z });
    S.desktop.appendChild(panel);
    panel.addEventListener('pointerdown', () => { panel.style.zIndex = ++S.z; }, true);
    const frameDrag = (e, resize) => {
      if (e.button !== 0 || e.target.closest('.wb')) return;
      e.preventDefault(); const sx = e.clientX, sy = e.clientY, ox = resize ? panel.offsetWidth : panel.offsetLeft, oy = resize ? panel.offsetHeight : panel.offsetTop;
      const mv = ev => { const dx = ev.clientX - sx, dy = ev.clientY - sy; if (resize) { panel.style.width = Math.max(320, ox + dx) + 'px'; panel.style.height = Math.max(140, oy + dy) + 'px'; } else { panel.style.left = Math.max(0, ox + dx) + 'px'; panel.style.top = Math.max(0, oy + dy) + 'px'; } };
      const upf = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', upf); };
      addEventListener('pointermove', mv); addEventListener('pointerup', upf);
    };
    panel.querySelector('.win-head').addEventListener('pointerdown', e => frameDrag(e, false));
    panel.querySelector('.win-resize').addEventListener('pointerdown', e => frameDrag(e, true));
    panel.querySelector('[data-act=close]').addEventListener('click', () => showTable(false));
  }
  function showTable(on = true) {
    if (on && !panel) buildPanel();
    if (!panel) return;
    panel.hidden = !on;
    clearInterval(timer);
    if (on) { panel.style.zIndex = ++S.z; refreshTable(); timer = setInterval(refreshTable, 700); } // live data
  }
  function refreshTable() {
    if (root.CONTROL) root.CONTROL.refresh(); // the Control window lists the points too
    if (!panel || panel.hidden) return;
    panel._pickBtn.classList.toggle('on', mode); panel._snap.value = snap();
    const tb = panel.querySelector('tbody'), rs = rows();
    tb.replaceChildren(...(rs.length ? rs.map(r => {
      const d = r.w.data, isSel = sel && sel.w === r.w.id && sel.i === r.k;
      const tr = h('tr', { class: isSel ? 'sel' : '' },
        h('td', { title: r.w.title }, r.w.label + ' ' + r.w.title), h('td', { title: r.p.auto ? `A ${r.p.auto} found by the peak detection` : '' }, 'P' + (r.k + 1) + kindOf(r.p)),
        h('td', {}, nf(r.x) + unit(d.xUnit)), h('td', {}, nf(r.y) + unit(d.yUnit)),
        h('td', {}, isFinite(r.dx) ? nf(r.dx) + unit(d.xUnit) : ''), h('td', {}, isFinite(r.dy) ? nf(r.dy) + unit(d.yUnit) : ''),
        h('td', {}, r.dx ? nf(1 / r.dx) + (d.xUnit === 's' ? ' Hz' : d.xUnit ? ' 1/' + d.xUnit : '') : ''),
        h('td', {}, h('button', { class: 'wb', title: 'Remove this point', onclick: ev => { ev.stopPropagation(); r.w.display.picks.splice(r.k, 1); if (sel && sel.w === r.w.id) sel = null; APP.requestRender(r.w); refreshTable(); } }, '✕')));
      tr.addEventListener('click', () => { APP.activate(r.w); select(r.w, r.k); });
      return tr;
    }) : [h('tr', {}, h('td', { colspan: 8, class: 'pk-empty' }, mode ? 'Click a graph to pick a value.' : 'No points yet – turn on Pick mode (Ctrl+Shift+P) or Shift+click a graph.'))]));
  }

  /* ---------- menus, context menu, toolbar, shortcut ---------- */
  const items = () => [
    { label: 'Value picker', key: 'Ctrl+Shift+P', checked: () => mode, run: () => toggleMode() },
    { label: 'Picked values table…', checked: () => !!(panel && !panel.hidden), run: () => showTable(!(panel && !panel.hidden)) },
    { label: 'Pick snaps to', sub: SNAPS.map(([v, l]) => ({ label: l, checked: () => snap() === v, run: () => { S.settings.pickSnap = v; APP.saveSettings(); refreshTable(); } })) },
    { label: 'Add pick at X…', en: has1D, run: addAtX },
    { label: 'Clear picks in this window', en: () => has1D() && !!(S.active.display.picks && S.active.display.picks.length), run: () => clearWindow(need('1d')) },
    { label: 'Clear all picks', en: () => [...S.wins.values()].some(w => w.display.picks && w.display.picks.length), run: clearAll }];
  const inst = UI.MENUS.find(m => m.label === 'Instruments');
  inst.items.unshift(...items(), '-');
  const prevExtra = UI.extraWindowItems;
  UI.extraWindowItems = w => {
    const out = prevExtra ? prevExtra(w) : [];
    if (w.kind === '1d' && w.data && w.data.y) out.push('-', ...items().filter(it => it.label !== 'Pick snaps to' && it.label !== 'Clear all picks'));
    return out;
  };
  UI.SHIFT_KEYS = Object.assign(UI.SHIFT_KEYS || {}, { p: () => toggleMode() });
  const icon = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="9" r="4" fill="none" stroke="#ff8c00" stroke-width="1.7"/><path d="M7 2v3.4M7 12.6V16M0 9h3.4M10.6 9H14" stroke="#333" stroke-width="1.2"/><path d="M11 1.5l3.5 3.5-2 .6-.9 2-1.7-4.3z" fill="#2a6fd8"/></svg>';
  const row = UI.TOOLBAR[1], j = row.findIndex(b => b !== '|' && b.title === 'Dominant frequency');
  row.splice(j + 1, 0, UI.TB(icon, 'Value picker (Ctrl+Shift+P): click a graph to pick values', 'Instruments', 'Value picker'));

  // points of one window for the Control window: [{k, x, y, text}], and whether point k is the selected one
  function listOf(w) {
    const ps = w.display.picks, d = w.data; if (!ps || !ps.length || !d || !d.y) return [];
    const g5 = v => isFinite(v) ? String(Number(v.toPrecision(5))) : '—'; // compact form for the Control window
    return ps.map((p, k) => { const y = yOf(d, p); return { k, x: p.x, y, text: labelOf(d, p, k) + kindOf(p), short: `P${k + 1}${kindOf(p)} ${g5(p.x)}${unit(d.xUnit)} | ${g5(y)}`, sel: !!(sel && sel.w === w.id && sel.i === k) }; });
  }
  root.PICK = { marks, down, move, up, toggle: toggleMode, table: showTable, rows, listOf, select, remove, clear: clearWindow, text: asText, active: () => mode, peaks: syncPeaks, MAXPEAKS };
})(window);
