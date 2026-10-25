/* OpenSig application core: windows, linked-update engine, rendering, interaction, playback, acquisition, workspaces. */
(function (root) {
  'use strict';
  const { DSP, IO, PLOT, OPS } = root;

  /* ---------- Settings ---------- */
  const DEFAULT_SETTINGS = () => ({
    spectral: DSP.defaultSvSettings(),
    spectrogram: { segmentLength: 512, overlap: 75, window: 'Hann' },
    palette: 'Jet', colorbar: true, freqDown: false, enhanceLow: false,
    step: 30, numPeaks: 5, fontSize: 11, audioOut: '', numFormat: { mode: 'sig', digits: 7 }, instFormat: { mode: 'sig', digits: 6 }, autosaveMin: 0, restoreLast: false, bandMarkers: true, wavChunk: true, wavFileDate: false,
    cursorAllWindows: true, logXSpectra: false, logYSpectra: false,
    playLoop: false, autoVolume: true, digits: 6, darkMode: 'off', windowStyle: 'standard', appIcon: 'classic'
  });
  function loadSettings() {
    const s = DEFAULT_SETTINGS();
    try {
      const saved = JSON.parse(localStorage.getItem('opensig.settings') || 'null');
      if (saved) { Object.assign(s, saved); s.spectral = DSP.svSettings(saved.spectral); s.spectrogram = Object.assign(DEFAULT_SETTINGS().spectrogram, saved.spectrogram); }
    } catch (e) { /* storage unavailable */ }
    return s;
  }
  function saveSettings() { try { localStorage.setItem('opensig.settings', JSON.stringify(S.settings)); } catch (e) { /* ignore */ } }

  const S = { wins: new Map(), nextId: 1, active: null, z: 10, settings: loadSettings(), desktop: null, theme: null, listeners: new Set() };
  const emit = () => S.listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });

  /* ---------- Theme ---------- */
  function readTheme() {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    S.theme = { plotBg: v('--plot-bg'), grid: v('--grid'), axis: v('--axis'), text: v('--plot-text'), muted: v('--muted'),
      cursor: v('--cursor'), selection: v('--selection'), marker: v('--marker'), labelBg: v('--label-bg'), danger: v('--danger'),
      accent: v('--accent'), trace: v('--trace'), trace2: v('--trace2'), trace3: v('--trace3'),
      overlay: [v('--ov1'), v('--ov2'), v('--ov3'), v('--ov4'), v('--ov5')], font: (S.settings.fontSize || 11) + 'px ' + v('--mono'),
      classic: true, axisFont: ((S.settings.fontSize || 11) + 1) + 'px ' + v('--sans') };
  }
  // Window style (data-skin: the look of frames, menus and dialogs) and dark mode (off / on / follow Windows); the
  // classic style itself is data-theme in index.html
  const WINDOW_STYLES = [['standard', 'Standard (light blue)'], ['grey', 'Classic grey (1990s)'], ['blue', 'Classic blue (2000s)'], ['glass', 'Glass (late 2000s)']];
  const sysDark = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    const st = S.settings;
    if (st.theme === 'auto' || st.theme === 'dark' || st.theme === 'light') st.darkMode = { auto: 'system', dark: 'on', light: 'off' }[st.theme]; // settings of earlier versions
    delete st.theme; // earlier versions had a classic / modern style choice
    const dark = st.darkMode === 'on' || (st.darkMode === 'system' && !!(sysDark && sysDark.matches));
    document.documentElement.setAttribute('data-skin', WINDOW_STYLES.some(s => s[0] === st.windowStyle) ? st.windowStyle : 'standard');
    document.documentElement.toggleAttribute('data-dark', dark);
    readTheme(); S.wins.forEach(w => { w.updateTitle(); requestRender(w); });
    if (root.HOST && root.HOST.available) root.HOST.call('darkTitleBar', { dark }).catch(() => {}); // Windows title bar of OpenSig.exe
    emit();
  }
  if (sysDark) sysDark.addEventListener('change', () => { if (S.settings.darkMode === 'system') applyTheme(); });
  const isDark = () => document.documentElement.hasAttribute('data-dark');
  function toggleDark() { S.settings.darkMode = isDark() ? 'off' : 'on'; saveSettings(); applyTheme(); }
  function setWindowStyle(k) { S.settings.windowStyle = k; saveSettings(); applyTheme(); }

  /* ---------- Window model ---------- */
  class Win {
    constructor(o) {
      this.id = S.nextId++;
      this.kind = o.kind || '1d';
      this.title = o.title || 'Window';
      this.op = o.op || null;                  // {type, params}
      this.parents = o.parents || [];
      this.children = new Set();
      this.source = o.source || null;          // root windows: {type:'file'|'generator'|'acq'|'copy', ...}
      this.data = o.data || null;
      this.error = null;
      this.frozen = false;
      this.state = {};
      this.view = { x0: 0, x1: 1, y0: 0, y1: 1 };
      this.autoX = true; this.autoY = true;
      const defStyle = o.op && OPS[o.op.type] && OPS[o.op.type].style;
      const isSpec = o.op && o.op.type === 'fft';
      this.display = Object.assign({
        style: defStyle || 'line', width: 1, dots: false,
        logX: !!(o.op && OPS[o.op.type] && OPS[o.op.type].logX) || (isSpec && S.settings.logXSpectra),
        logY: isSpec && S.settings.logYSpectra && !(o.op.params.dB),
        fixedY: null, xLabel: null, yLabel: null, overlays: [], persistence: 0, color: null,
        palette: S.settings.palette, invert: false, colorbar: S.settings.colorbar, mode: o.op && o.op.params && o.op.params.mesh ? 'mesh' : 'spectrogram',
        zFixed: null, enhanceLow: S.settings.enhanceLow, gauge: false, statMode: 'current', crit: null, showMarker: true, crosshair: false, look: null
      }, o.display || {});
      if (!(o.display && 'look' in o.display) && root.APP && root.APP.onNewWindow) root.APP.onNewWindow(this); // default graph style
      this.cursor = null; this.fixedCursor = null; this.selection = null; this.playhead = null;
      this.history = [];
      this.version = 0;
      this.tab = curTab;                       // workspace tab
      S.wins.set(this.id, this);
      for (const p of this.parents) { const pw = S.wins.get(p); if (pw) pw.children.add(this.id); }
      this.buildDom(o.rect);
    }

    get label() { return 'W' + this.id; }
    get opLabel() { return this.op && OPS[this.op.type] ? OPS[this.op.type].label(this.op.params) : ''; }

    buildDom(rect) {
      const el = document.createElement('section');
      el.className = 'win win-' + this.kind;
      el.setAttribute('aria-label', this.label + ' ' + this.title);
      el.innerHTML = `
        <header class="win-head">
          <svg class="win-icon" viewBox="0 0 16 16" aria-hidden="true"></svg><span class="win-id"></span><span class="win-title"></span>
          <span class="win-btns">
            <button class="wb" data-act="menu" title="Window menu">⋯</button>
            <button class="wb" data-act="min" title="Minimize / restore">▁</button>
            <button class="wb" data-act="max" title="Maximize / restore">▢</button>
            <button class="wb" data-act="close" title="Close window">✕</button>
          </span>
        </header>
        <div class="win-body"><canvas></canvas><div class="win-inst"></div><div class="win-msg"></div></div>
        <footer class="win-status"><span class="st-cursor"></span><span class="st-info"></span></footer>
        <div class="win-resize" title="Resize"></div>`;
      this.el = el;
      this.canvas = el.querySelector('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.instEl = el.querySelector('.win-inst');
      this.msgEl = el.querySelector('.win-msg');
      this.stCursor = el.querySelector('.st-cursor');
      this.stInfo = el.querySelector('.st-info');
      const r = rect || nextRect(this);
      Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      if (this.display.hidden) el.style.display = 'none'; // hidden from the Control window ("H")
      (S.layer || S.desktop).appendChild(el);  // the layer of the window's workspace tab
      this.updateTitle();
      wireWindow(this);
      new ResizeObserver(() => requestRender(this)).observe(el.querySelector('.win-body'));
    }

    updateTitle() {
      this.el.querySelector('.win-id').textContent = this.label;
      // the classic window icon (a dial for instruments), and the "FFT( <parent caption>)" name for FFT windows that were not renamed
      const icon = this.kind === 'instrument' ? '<circle cx="8" cy="9" r="6" fill="none" stroke="#333" stroke-width="1.4"/><path d="M8 9l3-4" stroke="#c00" stroke-width="1.6"/>'
        : '<ellipse cx="8" cy="8" rx="7" ry="5" fill="#e6e6e6" stroke="#4a4a4a" stroke-width="1.4"/><path d="M3.5 8c1.4-3 2.8-3 4.5 0s3.1 3 4.5 0" fill="none" stroke="#d00" stroke-width="1.3"/>';
      this.el.querySelector('.win-icon').innerHTML = icon;
      const p = this.parents.length && S.wins.get(this.parents[0]);
      const name = p && this.op && this.op.type === 'fft' && this.title === this.opLabel ? `FFT( ${p.id}#${p.title})` : this.title;
      this.el.querySelector('.win-title').textContent = this.id + '#' + name + (this.frozen ? '  (unlinked)' : '');
      this.el.querySelector('.win-title').title = this.opLabel || this.title;
      this.el.classList.toggle('frozen', this.frozen);
    }

    rect() { const s = this.el.style; return { x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) }; }
  }

  function nextRect(win) {
    const dw = S.desktop.clientWidth || 1200, dh = S.desktop.clientHeight || 700;
    const w = win.kind === 'instrument' ? 260 : Math.min(620, Math.max(360, dw * 0.45)), h = win.kind === 'instrument' ? 170 : Math.min(340, Math.max(220, dh * 0.42));
    const others = [...S.wins.values()].filter(o => o !== win && o.el).map(o => o.rect());
    if (dw < 700) { // phone: stack windows in a scrolling column
      const bottom = others.reduce((m, o) => Math.max(m, o.y + o.h), 0);
      return { x: 8, y: bottom + 8, w: dw - 16, h: win.kind === 'instrument' ? 140 : 240 };
    }
    const overlap = r => others.reduce((s, o) => s + Math.max(0, Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x)) * Math.max(0, Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y)), 0);
    const fits = r => r.x >= 0 && r.y >= 0 && r.x + r.w <= dw && r.y + r.h <= dh;
    const parent = win.parents.length ? S.wins.get(win.parents[0]) : null;
    const cands = [];
    if (parent) {
      const pr = parent.rect();
      cands.push({ x: pr.x + pr.w + 10, y: pr.y }, { x: pr.x, y: pr.y + pr.h + 10 }, { x: pr.x + pr.w + 10, y: pr.y + pr.h + 10 });
    }
    for (let y = 10; y + h <= dh; y += 20) for (let x = 10; x + w <= dw; x += 20) cands.push({ x, y });
    let best = null, bestO = Infinity;
    for (const c of cands) {
      const r = { x: c.x, y: c.y, w, h }; if (!fits(r)) continue;
      const o = overlap(r); if (o < bestO) { best = r; bestO = o; if (o === 0) break; }
    }
    if (best && bestO === 0) return best;
    // Desktop is full: cascade near the parent (or the top-left corner).
    const n = S.wins.size % 8, base = parent ? parent.rect() : { x: 16, y: 14 };
    return { x: Math.min(Math.max(0, dw - w), base.x + 30 + n * 24), y: Math.min(Math.max(0, dh - h), base.y + 30 + n * 24), w, h };
  }

  function createWindow(o) {
    const w = new Win(o);
    activate(w);
    if (w.op) queueCompute(w); else afterData(w);
    emit();
    return w;
  }

  function derive(parent, type, params, extra) {
    const op = OPS[type];
    const w = createWindow(Object.assign({ kind: op.kind === 'instrument' ? 'instrument' : op.kind, op: { type, params: Object.assign({}, params) },
      parents: [parent.id], title: op.label(params) }, extra || {}));
    return w;
  }

  function closeWindow(w) {
    if (!w || S.wins.get(w.id) !== w) return;
    stopPlayback(w); if (w.source && w.source.type === 'acq') stopAcquisition(w);
    for (const p of w.parents) { const pw = S.wins.get(p); if (pw) { pw.children.delete(w.id); requestRender(pw); } }
    for (const c of w.children) { const cw = S.wins.get(c); if (cw) { cw.parents = cw.parents.filter(x => x !== w.id); if (!cw.parents.length) { cw.frozen = true; cw.updateTitle(); } } }
    if (w.state && w.state.timer) clearInterval(w.state.timer);
    if (typeof w.onClose === 'function') try { w.onClose(); } catch (e) { console.error(e); }
    S.wins.delete(w.id);
    w.el.remove();
    if (S.active === w) S.active = null;
    const last = [...S.wins.values()].sort((a, b) => (+b.el.style.zIndex || 0) - (+a.el.style.zIndex || 0))[0];
    if (last) activate(last);
    emit();
  }

  function activate(w) {
    if (!w) return;
    if (S.active && S.active !== w) S.active.el.classList.remove('active');
    S.active = w; w.el.classList.add('active'); w.el.style.zIndex = ++S.z;
    emit();
  }

  function unlink(w) {
    for (const p of w.parents) { const pw = S.wins.get(p); if (pw) { pw.children.delete(w.id); requestRender(pw); } }
    if (w.parents.length) w.formerParents = w.parents.slice(); // the Control window still shows the link, dotted
    w.parents = []; w.frozen = true; w.updateTitle(); emit();
  }

  function link(w, parent) {
    if (!w.op) throw new Error('Only derived windows (FFT, filters, instruments, …) can be linked to a parent.');
    if (OPS[w.op.type].multi) throw new Error('Calculator windows link to the windows named in their expression.');
    let p = parent; while (p) { if (p === w) throw new Error('That would create a cycle.'); p = p.parents.length ? S.wins.get(p.parents[0]) : null; }
    unlink(w);
    w.parents = [parent.id]; parent.children.add(w.id); w.frozen = false; w.state = {}; w.history = []; w.formerParents = null;
    w.updateTitle(); queueCompute(w); emit();
  }

  /* ---------- Update engine ---------- */
  const queue = new Set(); let flushPending = false;
  // rAF batches updates per frame; the timeout keeps linked windows updating while the page is in the background.
  function queueCompute(w) {
    if (away(w)) { w.tab.stale = true; return; } // recomputed when its tab is shown again
    queue.add(w.id);
    if (!flushPending) { flushPending = true; requestAnimationFrame(flush); setTimeout(() => { if (flushPending) flush(); }, 120); }
  }
  function flush() {
    if (!flushPending) return;
    flushPending = false;
    let guard = 0;
    while (queue.size && guard++ < 10000) {
      let progressed = false;
      for (const id of [...queue]) {
        const w = S.wins.get(id);
        if (!w) { queue.delete(id); continue; }
        if (w.parents.some(p => queue.has(p))) continue;
        queue.delete(id); progressed = true;
        recompute(w);
      }
      if (!progressed) { queue.clear(); break; }
    }
  }

  function visibleData(p) {
    const d = p.data;
    if (!d || !d.y || d.x || p.autoX) return d;
    const i0 = Math.max(0, Math.floor((p.view.x0 - d.x0) / d.dx)), i1 = Math.min(d.y.length, Math.ceil((p.view.x1 - d.x0) / d.dx) + 1);
    if (i0 === 0 && i1 === d.y.length) return d;
    return Object.assign({}, d, { y: d.y.subarray(i0, Math.max(i0 + 1, i1)), x0: d.x0 + i0 * d.dx });
  }

  const opCtx = { byNumber: n => S.wins.get(n) };
  function recompute(w) {
    if (away(w)) { w.tab.stale = true; return; }
    if (w.op && !w.frozen) {
      const op = OPS[w.op.type];
      const parents = w.parents.map(id => S.wins.get(id)).filter(Boolean);
      try {
        if (!parents.length && !op.multi) throw new Error('No parent window');
        const inputs = parents.map(p => op.input === 'visible' ? visibleData(p) : p.data);
        if (!op.multi && inputs.some(d => !d)) throw new Error(parents.find(p => p.error) ? 'Parent window has an error' : 'Waiting for parent data');
        const prev = w.data;
        w.data = op.compute(w, inputs, w.op.params, opCtx);
        w.error = null;
        if (w.kind === '1d' && w.display.persistence > 0 && prev && prev.y && w.data.y && prev.y.length === w.data.y.length) {
          w.history.push(prev); while (w.history.length > w.display.persistence) w.history.shift();
        }
      } catch (e) { w.error = e.message || String(e); }
    }
    afterData(w);
  }

  function afterData(w) {
    w.version++;
    if (away(w)) { w.tab.stale = true; return; }
    if (w.display.autoPlay && w.version > 1 && w.data && w.data.xUnit === 's' && !w.player && !w.acq) setTimeout(() => { try { playSound(w, 'all'); } catch (e) { /* not playable */ } }, 0);
    if (w.data && w.data.defaultView && w.version === 1 && w.kind === '1d') {
      w.autoX = false; w.view.x0 = w.data.defaultView.x0; w.view.x1 = w.data.defaultView.x1;
    }
    if (w.autoX) fitX(w); else clampView(w);
    requestRender(w);
    for (const c of w.children) { const cw = S.wins.get(c); if (cw && cw.op && !cw.frozen) queueCompute(cw); }
    if (w.kind === 'instrument') for (const p of w.parents) { const pw = S.wins.get(p); if (pw) requestRender(pw); }
    S.wins.forEach(o => { if (o !== w && o.display.overlays.includes(w.id)) requestRender(o); });
  }

  /* ---------- Peak detection: a window setting (display.peaks), applied to the visible part ---------- */
  function peaksOf(w) {
    const s = w.display.peaks, d = w.data;
    if (!s || !s.on || w.kind !== '1d' || !d || !d.y || !d.y.length) return null;
    const xOf = i => d.x ? d.x[i] : d.x0 + i * d.dx;
    let i0 = 0, i1 = d.y.length - 1;
    if (!w.autoX) { // samples inside the view
      const eps = (d.dx || 0) * 1e-6;
      [i0, i1] = PLOT.indexRange(d, w.view.x0, w.view.x1);
      while (i0 < i1 && xOf(i0) < w.view.x0 - eps) i0++;
      while (i1 > i0 && xOf(i1) > w.view.x1 + eps) i1--;
    }
    const key = JSON.stringify([w.version, i0, i1, s]);
    if (!w._peaks || w._peaks.key !== key) { // method: threshold or one of DSP.PEAK_METHODS; refine: between samples
      const r = DSP.detectPeaks(d.y, s, i0, i1), ref = s.refine && s.refine !== 'none';
      const at = p => { if (!d.x) return d.x0 + p * d.dx; const a = Math.floor(p), b = Math.min(d.y.length - 1, a + 1); return d.x[a] + (d.x[b] - d.x[a]) * (p - a); };
      const pts = r.idx.map((i, k) => ref ? DSP.refinePeak(d.y, i, s.refine, r.neg[k]) : { pos: i, val: d.y[i] });
      w._peaks = { key, idx: r.idx, neg: r.neg, x: ref ? pts.map(p => at(p.pos)) : r.idx.map(xOf), y: pts.map(p => p.val) };
    }
    return w._peaks;
  }
  function setPeaks(w, s) {
    w.display.peaks = s;
    viewChanged(w);
    for (const c of w.children) { const cw = S.wins.get(c); if (cw && cw.kind === 'instrument' && !cw.frozen) queueCompute(cw); }
  }

  // Cursor decorations: value box "x unit (y)" at the top of the cursor line, harmonic cursor (2x, 3x, …
  // of the cursor position) and sideband cursor (cursor ± k·offset); with SPACE held every extra cursor gets its own
  // "x unit (y)" label.
  function cursorDecor(w, d, th) {
    // Enter pins the harmonic / sideband set at the cursor position (display.cursorPin): it stays when the mouse moves
    // away as lines only – no value boxes on the graph unless SPACE is held or display.pinLabels is switched on;
    // Enter again re-pins, Esc releases.
    const c = w.cursor && w.cursor.x != null ? w.cursor : null, mode = w.display.cursorMode, pin = mode ? w.display.cursorPin : null;
    if (!c && pin == null) return null;
    const nf = root.NUMFMT || fmtV, sampleMode = w.display.sampleUnits && !d.x;
    const txt = (x, y) => (sampleMode ? '#' + Math.round((x - d.x0) / d.dx) : nf(x) + unitStr(d.xUnit)) + (y != null && isFinite(y) ? ' (' + nf(y) + ')' : '');
    const off = w.display.sideband, side = mode === 'sideband' && off > 0 ? '\nSideband: ' + nf(off) : '';
    const setAt = bx => {
      const xs = [];
      if (mode === 'harmonic' && bx > 0) for (let k = 2; k <= 500 && k * bx <= w.view.x1; k++) xs.push(k * bx);
      if (mode === 'sideband' && off > 0) for (let k = 1; k <= 500; k++) {
        const a = bx - k * off, b = bx + k * off;
        if (a < w.view.x0 && b > w.view.x1) break;
        if (a >= w.view.x0) xs.push(a); if (b <= w.view.x1) xs.push(b);
      }
      return xs.sort((a, b) => a - b);
    };
    const linesAt = (bx, labels) => setAt(bx).map((x, i) => { const v = valueAt(d, x); return { x, color: i % 2 ? th.text : '#00a0aa', label: labels ? txt(x, v && v.y) : null }; });
    if (pin != null) { // pinned: the set stays at the pin; the mouse cursor is a plain cursor
      const v = valueAt(d, pin), show = S.spaceDown || w.display.pinLabels === true;
      return { pin: { x: pin, y: v ? v.y : null, label: show ? '⊙ ' + txt(pin, v && v.y) + side : null }, lines: linesAt(pin, show),
        label: c ? txt(c.x, c.y) : null };
    }
    return { lines: mode ? linesAt(c.x, S.spaceDown) : [], label: txt(c.x, c.y) + side };
  }

  function viewChanged(w) {
    if (away(w)) { w.tab.stale = true; return; }
    requestRender(w);
    for (const c of w.children) {
      const cw = S.wins.get(c);
      if (cw && cw.op && !cw.frozen && OPS[cw.op.type].input === 'visible') queueCompute(cw);
    }
  }

  /* ---------- View helpers ---------- */
  function extentX(w) {
    const d = w.data;
    if (w.kind === '3d') return d ? [d.t0, d.t1] : [0, 1];
    if (!d || !d.y || !d.y.length) return [0, 1];
    if (d.x) return [d.x[0], d.x[d.x.length - 1]];
    return [d.x0, d.x0 + (d.y.length - 1) * d.dx];
  }
  function fitX(w) {
    const [a, b] = extentX(w);
    w.view.x0 = a; w.view.x1 = b > a ? b : a + 1;
    if (w.kind === '3d' && w.data) { w.view.y0 = w.data.fMin || 0; w.view.y1 = w.data.fMax; }
    if (w.kind === '1d' && w.display.logX && w.data && w.data.y) {
      const d = w.data, firstPos = d.x ? d.x.find(v => v > 0) : d.x0 > 0 ? d.x0 : d.x0 + d.dx;
      w.view.x0 = Math.max(w.view.x0, firstPos || 1e-3);
    }
  }
  function clampView(w) {
    const [a, b] = extentX(w), span = w.view.x1 - w.view.x0;
    if (!(span > 0) || span > (b - a) * 1.0001 || !isFinite(span)) { fitX(w); w.autoX = true; return; }
    if (w.view.x0 < a) { w.view.x0 = a; w.view.x1 = a + span; }
    if (w.view.x1 > b) { w.view.x1 = b; w.view.x0 = Math.max(a, b - span); }
  }
  function setViewX(w, x0, x1) {
    if (w.display.logX && x0 <= 0) x0 = Math.max(1e-6, x1 / 1e6);
    const [a, b] = extentX(w);
    const minSpan = w.kind === '1d' && w.data && w.data.dx ? w.data.dx * 4 : (b - a) * 1e-6;
    if (x1 - x0 < minSpan) { const c = (x0 + x1) / 2; x0 = c - minSpan / 2; x1 = c + minSpan / 2; }
    w.view.x0 = Math.max(a, x0); w.view.x1 = Math.min(b, x1);
    w.autoX = w.view.x0 <= a && w.view.x1 >= b;
    viewChanged(w);
  }
  function resetView(w) { w.autoX = true; w.autoY = true; w.display.zoomY = null; fitX(w); viewChanged(w); }
  function zoom(w, factor, center) {
    if (w.kind === 'instrument') return;
    const v = w.view, c = center ?? (v.x0 + v.x1) / 2;
    if (w.display.logX && w.kind === '1d') {
      const lc = Math.log10(Math.max(c, 1e-12)), l0 = Math.log10(v.x0), l1 = Math.log10(v.x1);
      setViewX(w, Math.pow(10, lc - (lc - l0) * factor), Math.pow(10, lc + (l1 - lc) * factor)); return;
    }
    setViewX(w, c - (c - v.x0) * factor, c + (v.x1 - c) * factor);
  }
  function pan(w, fraction) { const s = w.view.x1 - w.view.x0; setViewX(w, w.view.x0 + s * fraction, w.view.x1 + s * fraction); }

  function yRange(w, traces) {
    if (w.display.fixedY) return [w.display.fixedY.min, w.display.fixedY.max];
    if (w.display.zoomY) return w.display.zoomY;
    let lo = Infinity, hi = -Infinity;
    for (const t of traces) {
      const s = t.sig; if (!s || !s.y || !s.y.length) continue;
      const [i0, i1] = PLOT.indexRange(s, w.view.x0, w.view.x1);
      const step = Math.max(1, Math.floor((i1 - i0) / 200000));
      for (let i = i0; i <= i1; i += step) { const v = s.y[i]; if (!isFinite(v) || (w.display.logY && v <= 0)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (!isFinite(lo)) return w.display.logY ? [0.1, 10] : [-1, 1];
    const isHist = w.display.style === 'hist' || w.display.style === 'hist-bottom';
    if (isHist && !w.display.logY && w.data && w.data.yUnit !== 'dB') lo = Math.min(lo, 0);
    if (w.display.logY) return [lo / 1.5, hi * 1.5];
    return hi > lo ? [lo, hi] : [lo - (Math.abs(lo) * 0.1 || 1), hi + (Math.abs(hi) * 0.1 || 1)]; // exactly min…max (classic look)
  }

  /* ---------- Rendering ---------- */
  const renderQueue = new Set(); let renderPending = false;
  function requestRender(w) { renderQueue.add(w); if (!renderPending) { renderPending = true; requestAnimationFrame(renderAll); } }
  function renderAll() {
    renderPending = false;
    const ws = [...renderQueue]; renderQueue.clear();
    for (const w of ws) if (S.wins.get(w.id) === w) { try { render(w); } catch (e) { console.error(e); } }
  }

  function sizeCanvas(w) {
    const body = w.canvas.parentElement, dpr = window.devicePixelRatio || 1;
    const cw = Math.max(10, body.clientWidth), ch = Math.max(10, body.clientHeight);
    if (w.canvas.width !== Math.round(cw * dpr) || w.canvas.height !== Math.round(ch * dpr)) {
      w.canvas.width = Math.round(cw * dpr); w.canvas.height = Math.round(ch * dpr);
    }
    w.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [cw, ch];
  }

  const unitStr = u => u ? ' ' + u : '';
  const fmtV = v => PLOT.fmt(v, Math.abs(v) / 1000 || 1);

  // A window's graph style (Edit ▸ Graph style…, display.look) on top of the light / dark theme
  const DASH = { solid: [], dashed: [5, 4], dotted: [1, 3] };
  function lookTheme(w, base) {
    const L = w.display.look; if (!L) return base;
    const t = Object.assign({}, base), fam = f => String(f || '').replace(/^(bold\s+)?[\d.]+px\s+/, '');
    if (L.bg) t.plotBg = L.bg; if (L.grid) t.grid = L.grid; if (L.axis) t.axis = L.axis; if (L.text) { t.text = L.text; t.muted = L.text; }
    if (L.fontSize) { t.font = L.fontSize + 'px ' + fam(base.font); t.axisFont = (L.fontSize + 1) + 'px ' + fam(base.axisFont || base.font); }
    t.gridOff = L.showGrid === false; t.gridDash = DASH[L.gridStyle] || []; t.minorGrid = !!L.minorGrid;
    t.tickFactor = { fewer: 0.6, normal: 1, more: 1.7 }[L.ticks] || 1;
    t.tickFmt = L.numFormat && L.numFormat !== 'auto' ? { mode: L.numFormat, digits: L.digits ?? 2 } : null;
    t.axisWidth = L.axisWidth || 1; if (L.frame && L.frame !== 'auto') t.frame = L.frame;
    if (L.bg) t.labelBg = L.bg;
    return t;
  }

  function render(w) {
    const th = lookTheme(w, S.theme);
    w.msgEl.textContent = w.error || (!w.data ? 'Computing…' : '');
    w.msgEl.classList.toggle('show', !!w.error || !w.data);
    w.msgEl.classList.toggle('err', !!w.error);
    if (w.kind === 'display') return renderDisplay(w, th);
    if (w.kind === '1d' && root.TABLE) { // Edit node: a table instead of the graph (table.js)
      w.el.classList.toggle('win-table', !!w.display.table);
      if (w.display.table) return root.TABLE.render(w, th);
    }
    w.canvas.style.display = w.kind === 'instrument' && !w.display.gauge ? 'none' : '';
    w.instEl.style.display = w.kind === 'instrument' ? '' : 'none';
    if (w.kind === 'instrument') return renderInstrument(w, th);
    const [cw, ch] = sizeCanvas(w);
    if (!w.data) { w.ctx.fillStyle = th.plotBg; w.ctx.fillRect(0, 0, cw, ch); w.lay = null; return; }
    if (w.kind === '3d') return render3D(w, th, cw, ch);
    const d = w.data;
    const typeColor = { signal: th.trace, analysis: th.marker, track: th.overlay[1] }[w.display.colorType];
    const color = w.display.color || typeColor || (w.op ? (w.op.type === 'fft' ? th.trace2 : th.trace3) : th.trace);
    const traces = [];
    w.history.forEach((h, i) => traces.push({ sig: h, color, width: 1, style: w.display.style, alpha: true, _fade: (i + 1) / (w.history.length + 1) }));
    w.display.overlays.forEach((id, i) => { const o = S.wins.get(id); if (o && o.data && o.data.y) traces.push({ sig: o.data, color: th.overlay[i % th.overlay.length], width: w.display.width, style: 'line' }); });
    traces.push({ sig: d, color, width: w.display.width, style: d.style || w.display.style, dots: w.display.dots, pointSize: w.display.pointSize, fillAlpha: w.display.fillAlpha });
    const [y0, y1] = yRange(w, traces.filter(t => !t._fade));
    w.view.y0 = y0; w.view.y1 = y1;
    const markers = [], hlines = [], vlines = [];
    for (const c of w.children) {
      const cw2 = S.wins.get(c);
      if (!cw2 || cw2.kind !== 'instrument' || !cw2.data || cw2.error || !cw2.display.showMarker) continue;
      const r = cw2.data;
      if (r.marker) markers.push({ x: r.marker.x, y: r.marker.y, label: `${cw2.label}: ${fmtV(r.value)}${unitStr(r.unit)}`, color: th.marker });
      else if (r.hline) hlines.push({ y: r.value, label: `${cw2.label} ${cw2.op.params.instrument}: ${fmtV(r.value)}`, color: th.marker });
    }
    if (w.playhead != null) vlines.push({ x: w.playhead, color: th.danger, width: 2 });
    if (w.display.harmonics && w.display.harmonics.f > 0) {
      for (let k = 1; k <= (w.display.harmonics.n || 10); k++) {
        const hx = w.display.harmonics.f * k, v = valueAt(d, hx);
        if (v && hx <= w.view.x1) markers.push({ x: v.x, y: v.y, label: k + 'x: ' + fmtV(v.y), color: k === 1 ? th.marker : th.overlay[2] });
      }
    }
    for (const m of d.markers || []) { const v = valueAt(d, m.x); if (v) markers.push({ x: m.x, y: m.y ?? v.y, label: m.text, color: th.overlay[3] }); }
    if (w.display.showPeaks && d.y.length > 2) { // show N highest local maxima inside the view
      const [i0, i1] = PLOT.indexRange(d, w.view.x0, w.view.x1), pk = [];
      for (let i = Math.max(1, i0); i < Math.min(d.y.length - 1, i1); i++) if (d.y[i] > d.y[i - 1] && d.y[i] >= d.y[i + 1]) pk.push(i);
      pk.sort((a, b) => d.y[b] - d.y[a]).slice(0, S.settings.numPeaks || 5).forEach(i => { const x = d.x ? d.x[i] : d.x0 + i * d.dx; markers.push({ x, y: d.y[i], label: fmtV(x) + (d.xUnit ? ' ' + d.xUnit : '') + ': ' + fmtV(d.y[i]), color: th.overlay[0] }); });
    }
    const pk = peaksOf(w);
    if (pk) { // classic annotation per peak: X position above, value below; plain markers when there are very many
      const nf = v => root.NUMFMT ? root.NUMFMT(v) : fmtV(v), many = pk.idx.length > 1500;
      pk.x.forEach((x, k) => markers.push(many ? { x, y: pk.y[k], color: th.danger } : { x, y: pk.y[k], lines: [nf(x), nf(pk.y[k])], color: th.danger }));
    }
    if (w.fixedCursor != null) vlines.push({ x: w.fixedCursor, color: th.cursor });
    const dec = cursorDecor(w, d, th);
    const ctx = w.ctx;
    ctx.fillStyle = th.plotBg; ctx.fillRect(0, 0, cw, ch);
    // persistence traces drawn with reduced opacity
    const opt = { traces: [], view: w.view, logX: w.display.logX, logY: w.display.logY,
      xLabel: w.display.xLabel ?? (d.xUnit === 's' ? 'sec' : d.xUnit || ''), yLabel: w.display.yLabel ?? (d.yUnit || ''),
      cursor: dec ? Object.assign({}, w.cursor, { label: dec.label }) : w.cursor, cursorLines: dec && dec.lines, pinCursor: dec && dec.pin, selection: w.selection, markers, hlines, vlines, bands: d.bands,
      xFormat: w.display.absTime && d.t0abs != null && d.xUnit === 's' ? absTimeFormatter(d.t0abs, w.view.x1 - w.view.x0) : null };
    if (root.PICK) opt.picks = root.PICK.marks(w, d); // Value picker points
    const look = w.display.look;
    if (look) { // graph style: hidden axes, title, legend (this window and its overlays)
      if (look.showAxes === false) opt.showAxes = false;
      if (look.title) opt.title = look.title;
      if (look.legend) opt.legend = [{ label: w.label + ' ' + w.title, color }].concat(w.display.overlays.map((id, i) => { const o = S.wins.get(id); return o && { label: o.label + ' ' + o.title, color: th.overlay[i % th.overlay.length] }; }).filter(Boolean));
    }
    const fadeTraces = traces.filter(t => t._fade), mainTraces = traces.filter(t => !t._fade);
    opt.traces = mainTraces;
    if (fadeTraces.length) {
      const lay0 = PLOT.drawXY(ctx, cw, ch, th, Object.assign({}, opt, { traces: [], markers: [], hlines: [], vlines: [], cursor: null, selection: null }));
      ctx.save();
      for (const t of fadeTraces) { ctx.globalAlpha = 0.12 + 0.35 * t._fade; drawFaded(ctx, lay0, t); }
      ctx.restore();
      w.lay = drawOverlayOnly(ctx, cw, ch, th, opt);
    } else if (w.display.stacked && w.display.overlays.length) {
      // stacked view: the window's own signal and each overlay in its own band, with one X axis under the bottom band;
      // that band is taller by the axis labels, so every band gets the same plot height. Each band is labelled W<n>.
      const sigs = [{ sig: d, color, title: w.label }].concat(w.display.overlays.map((id, i) => { const o = S.wins.get(id); return o && o.data && o.data.y ? { sig: o.data, color: th.overlay[i % th.overlay.length], title: o.label } : null; }).filter(Boolean));
      const axisH = opt.showAxes === false ? 0 : PLOT.X_AXIS_H, ph = (ch - axisH) / sigs.length;
      sigs.forEach((t, i) => {
        const last = i === sigs.length - 1;
        ctx.save(); ctx.translate(0, i * ph);
        const tr = [{ sig: t.sig, color: t.color, width: w.display.width, style: w.display.style }];
        const [a, b] = yRange(w, tr), lay = PLOT.drawXY(ctx, cw, last ? ph + axisH : ph, th, Object.assign({}, opt, { traces: tr, view: { x0: w.view.x0, x1: w.view.x1, y0: a, y1: b }, markers: i ? [] : markers, hlines: i ? [] : hlines, yLabel: t.title, xAxis: last }));
        ctx.restore(); if (i === 0) w.lay = lay;
      });
    } else w.lay = PLOT.drawXY(ctx, cw, ch, th, opt);
    if (d.text) drawTextBox(ctx, w.lay ? w.lay.rect : { x: 8, y: 8 }, d.text, th);
    // status
    const n = d.y.length;
    const info = [];
    if (w.error) info.push('⚠ ' + w.error);
    else {
      if (d.x) info.push(n + ' values');
      else info.push(n + ' samples' + (d.xUnit === 's' ? ` · ${fmtV(1 / d.dx)} Hz · ${fmtV(n * d.dx)} s` : d.xUnit === 'Hz' ? ` · Δf ${fmtV(d.dx)} Hz` : ''));
      if (d.fftInfo) info.push(d.fftInfo);
      if (d.note) info.push(d.note);
    }
    w.stInfo.textContent = info.join(' · ');
    if (!w.cursor) w.stCursor.textContent = '';
    w.el.querySelector('.win-title').title = (w.opLabel || w.title) + (info.length ? '\n' + info.join(' · ') : ''); // the status line is hidden
  }

  // Draw a faded persistence trace inside an existing layout.
  function drawFaded(ctx, lay, t) {
    const s = t.sig, r = lay.rect, ax = lay.ax, ay = lay.ay;
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.strokeStyle = t.color; ctx.lineWidth = 1; ctx.beginPath();
    const [i0, i1] = PLOT.indexRange(s, ax.lo, ax.hi), step = Math.max(1, Math.floor((i1 - i0) / (r.w * 2)));
    let first = true;
    for (let i = i0; i <= i1; i += step) {
      const x = ax.toPx(s.x ? s.x[i] : s.x0 + i * s.dx), y = ay.toPx(s.y[i]);
      if (!isFinite(y)) continue;
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.restore();
  }
  function drawOverlayOnly(ctx, cw, ch, th, opt) {
    // draw axes-free foreground (traces + markers) over the faded layer by reusing drawXY with transparent background
    const saved = th.plotBg; th.plotBg = 'rgba(0,0,0,0)';
    const lay = PLOT.drawXY(ctx, cw, ch, th, opt); th.plotBg = saved; return lay;
  }

  function render3D(w, th, cw, ch) {
    const d = w.data, z = w.display.zFixed || d.zAuto;
    const opt = { sg: d.sg, view: w.view, zRange: z, palette: w.display.palette, invert: w.display.invert,
      colorbar: w.display.colorbar, freqDown: S.settings.freqDown, enhanceLow: w.display.enhanceLow,
      cursor: w.display.crosshair && w.fixedCursor3 ? w.fixedCursor3 : null, xLabel: w.display.xLabel ?? (d.xUnit || 's'), yLabel: w.display.yLabel ?? 'Hz' };
    w.lay = w.display.mode === 'mesh' ? PLOT.drawWaterfall(w.ctx, cw, ch, th, opt) : PLOT.drawSpectrogram(w.ctx, cw, ch, th, opt);
    w.stInfo.textContent = w.error ? '⚠ ' + w.error : `${d.sg.rows.length} segments × ${d.sg.bins} bins · ${d.sg.segLen} pts · Δf ${fmtV(d.sg.df)} Hz · Δt ${fmtV(d.sg.dt)} s · ${w.display.mode === 'mesh' ? 'mesh (F3 for spectrogram)' : 'spectrogram (F2 for mesh)'}`;
  }

  function renderInstrument(w, th) {
    const r = w.data, hist = w.state.hist || [];
    if (!r || w.error) { w.instEl.innerHTML = ''; w.stInfo.textContent = w.error ? '⚠ ' + w.error : ''; return; }
    let shown = r.value, modeLabel = '';
    if (hist.length && w.display.statMode !== 'current') {
      if (w.display.statMode === 'average') { shown = hist.reduce((a, b) => a + b, 0) / hist.length; modeLabel = 'avg of ' + hist.length; }
      if (w.display.statMode === 'minimum') { shown = Math.min(...hist); modeLabel = 'min of ' + hist.length; }
      if (w.display.statMode === 'maximum') { shown = Math.max(...hist); modeLabel = 'max of ' + hist.length; }
    }
    const crit = w.display.crit, alarm = crit && (crit.inside ? shown >= crit.from && shown <= crit.to : (shown < crit.from || shown > crit.to));
    w.el.classList.toggle('alarm', !!alarm);
    const digits = S.settings.digits;
    const txt = !isFinite(shown) ? String(shown) : root.NUMFMT ? root.NUMFMT(shown, 'inst') : Number(shown.toPrecision(digits)).toString();
    w.instEl.innerHTML = '';
    const val = document.createElement('div'); val.className = 'inst-value'; val.textContent = txt;
    const unit = document.createElement('span'); unit.className = 'inst-unit'; unit.textContent = r.unit || ''; val.appendChild(unit);
    const name = document.createElement('div'); name.className = 'inst-name'; name.textContent = (w.op.params.instrument || w.op.params.name || w.title) + (modeLabel ? ' · ' + modeLabel : '');
    w.instEl.append(name, val);
    if (r.text) { const t = document.createElement('div'); t.className = 'inst-text'; t.textContent = r.text; w.instEl.append(t); }
    if (alarm && !w.wasAlarm && crit && crit.actions && root.UI && root.UI.alarmActions) root.UI.alarmActions(w, shown);
    w.wasAlarm = !!alarm;
    if (w.display.gauge) {
      w.instEl.classList.add('with-gauge');
      const [cw, ch] = sizeCanvas(w);
      let lo = w.display.gaugeRange ? w.display.gaugeRange[0] : Math.min(0, ...hist), hi = w.display.gaugeRange ? w.display.gaugeRange[1] : Math.max(...hist, shown) * 1.2 || 1;
      if (hi <= lo) hi = lo + 1;
      PLOT.drawGauge(w.ctx, cw, ch, th, shown, lo, hi, crit && crit.inside ? [crit.from, crit.to] : null);
    } else w.instEl.classList.remove('with-gauge');
    if (hist.length > 1) w.stInfo.textContent = `min ${fmtV(Math.min(...hist))} · max ${fmtV(Math.max(...hist))} · ${hist.length} values`;
    else w.stInfo.textContent = '';
  }

  function absTimeFormatter(t0abs, span) {
    return v => {
      const dt = new Date(t0abs + v * 1000), p = n => String(n).padStart(2, '0');
      const base = `${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
      return span < 10 ? base + '.' + String(dt.getMilliseconds()).padStart(3, '0') : span > 86400 ? `${dt.getMonth() + 1}/${dt.getDate()} ${base}` : base;
    };
  }
  function drawTextBox(ctx, r, text, th) {
    const lines = String(text).split('\n').slice(0, 40);
    ctx.font = th.font; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 12, h = lines.length * 14 + 8;
    ctx.fillStyle = th.labelBg; ctx.fillRect(r.x + 6, r.y + 6, w, h);
    ctx.strokeStyle = th.axis; ctx.strokeRect(r.x + 6.5, r.y + 6.5, w, h);
    ctx.fillStyle = th.text; lines.forEach((l, i) => ctx.fillText(l, r.x + 12, r.y + 10 + i * 14));
  }
  // Custom display windows: either a draw(ctx, w, h, theme) callback or plain text output.
  function renderDisplay(w, th) {
    const d = w.data;
    w.canvas.style.display = d && d.draw ? '' : 'none';
    w.instEl.style.display = d && !d.draw ? '' : 'none';
    w.instEl.classList.remove('with-gauge');
    if (!d) return;
    if (d.dom) { if (w.instEl.firstChild !== d.dom) w.instEl.replaceChildren(d.dom); w.stInfo.textContent = d.note || ''; return; }
    if (d.draw) {
      const [cw, ch] = sizeCanvas(w);
      w.ctx.fillStyle = th.plotBg; w.ctx.fillRect(0, 0, cw, ch);
      try { w.lay = d.draw(w.ctx, cw, ch, th, w) || null; } catch (e) { w.msgEl.textContent = e.message; w.msgEl.classList.add('show', 'err'); }
    } else {
      w.instEl.innerHTML = '';
      const pre = document.createElement('pre'); pre.className = 'win-text'; pre.textContent = d.text ?? '';
      w.instEl.append(pre);
    }
    w.stInfo.textContent = w.error ? '⚠ ' + w.error : (d.note || '');
  }

  /* ---------- Interaction ---------- */
  function wireWindow(w) {
    const el = w.el, head = el.querySelector('.win-head'), body = el.querySelector('.win-body');
    el.addEventListener('pointerdown', () => { if (S.active !== w) activate(w); }, true);
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const r = w.rect(), sx = e.clientX, sy = e.clientY;
      head.setPointerCapture(e.pointerId);
      const move = ev => { el.style.left = Math.max(0, r.x + ev.clientX - sx) + 'px'; el.style.top = Math.max(0, r.y + ev.clientY - sy) + 'px'; };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', up);
    });
    head.addEventListener('dblclick', e => { if (!e.target.closest('button')) toggleMax(w); });
    el.querySelector('.win-resize').addEventListener('pointerdown', e => {
      e.preventDefault(); const r = w.rect(), sx = e.clientX, sy = e.clientY, t = e.target;
      t.setPointerCapture(e.pointerId);
      const move = ev => { el.style.width = Math.max(200, r.w + ev.clientX - sx) + 'px'; el.style.height = Math.max(120, r.h + ev.clientY - sy) + 'px'; };
      const up = () => { t.removeEventListener('pointermove', move); t.removeEventListener('pointerup', up); };
      t.addEventListener('pointermove', move); t.addEventListener('pointerup', up);
    });
    el.querySelector('[data-act=close]').addEventListener('click', () => closeWindow(w));
    el.querySelector('[data-act=max]').addEventListener('click', () => toggleMax(w));
    el.querySelector('[data-act=min]').addEventListener('click', () => {
      if (w.minHeight) { el.style.height = w.minHeight; w.minHeight = null; el.classList.remove('minimized'); }
      else { w.minHeight = el.style.height; el.style.height = '32px'; el.classList.add('minimized'); }
    });
    el.querySelector('[data-act=menu]').addEventListener('click', e => root.UI && root.UI.windowMenu(w, e.currentTarget));
    el.querySelector('.win-icon').addEventListener('click', e => { e.stopPropagation(); if (root.UI) root.UI.windowMenu(w, e.currentTarget); }); // system-menu style
    body.addEventListener('contextmenu', e => { e.preventDefault(); root.UI && root.UI.windowMenu(w, null, e.clientX, e.clientY); });

    const pt = e => { const b = w.canvas.getBoundingClientRect(); return { px: e.clientX - b.left, py: e.clientY - b.top }; };
    const inRect = (p, r) => r && p.px >= r.x && p.px <= r.x + r.w && p.py >= r.y && p.py <= r.y + r.h;
    let drag = null, pickDrag = false;
    w.canvas.addEventListener('pointerdown', e => {
      if (w.kind === 'display' && w.data && w.data.rotatable) {
        const sx = e.clientX, sy = e.clientY, yaw = w.display.yaw ?? 35, pitch = w.display.pitch ?? 25;
        w.canvas.setPointerCapture(e.pointerId);
        const mv = ev => { w.display.yaw = yaw + (ev.clientX - sx) * 0.5; w.display.pitch = Math.max(-89, Math.min(89, pitch + (ev.clientY - sy) * 0.5)); requestRender(w); };
        const up = () => { w.canvas.removeEventListener('pointermove', mv); w.canvas.removeEventListener('pointerup', up); };
        w.canvas.addEventListener('pointermove', mv); w.canvas.addEventListener('pointerup', up); return;
      }
      if (!w.lay || !w.lay.ax || w.kind === 'instrument') return;
      const p = pt(e); if (!inRect(p, w.lay.rect)) return;
      w.canvas.setPointerCapture(e.pointerId);
      if (w.kind === '1d' && e.button === 0 && !e.ctrlKey && !e.altKey && root.PICK && root.PICK.down(w, p, e)) { pickDrag = true; return; } // Value picker
      const panMode = e.button === 1 || e.button === 2 || e.ctrlKey || e.altKey;
      drag = { panMode, sx: p.px, sy: p.py, x: w.lay.ax.fromPx(p.px), y: w.lay.ay.fromPx(p.py), view: Object.assign({}, w.view), ax: w.lay.ax };
      if (e.button === 2) e.preventDefault();
    });
    w.canvas.addEventListener('pointermove', e => {
      if (!w.lay || !w.lay.ax) return;
      const p = pt(e), x = w.lay.ax.fromPx(p.px), y = w.lay.ay.fromPx(p.py);
      if (pickDrag) { root.PICK.move(w, p); return; }
      if (drag) {
        if (drag.panMode && w.kind === '1d') {
          const dxv = drag.ax.fromPx(drag.sx) - drag.ax.fromPx(p.px);
          const [a, b] = extentX(w), span = drag.view.x1 - drag.view.x0;
          let n0 = drag.view.x0 + dxv; n0 = Math.max(a, Math.min(b - span, n0));
          if (!w.display.logX) { w.view.x0 = n0; w.view.x1 = n0 + span; w.autoX = false; viewChanged(w); }
        } else if (!drag.panMode) {
          w.selection = { a: drag.x, b: x, ya: drag.y, yb: y };
          if (w.kind === '3d') drawRubber(w, drag, p); else requestRender(w);
        }
        return;
      }
      updateCursor(w, x, y, inRect(p, w.lay.rect));
    });
    w.canvas.addEventListener('pointerup', e => {
      if (pickDrag) { pickDrag = false; root.PICK.up(w, pt(e)); return; }
      if (!drag) return;
      const p = pt(e), moved = Math.abs(p.px - drag.sx) > 4;
      if (!drag.panMode && moved && w.selection) {
        const a = Math.min(w.selection.a, w.selection.b), b = Math.max(w.selection.a, w.selection.b);
        if (w.kind === '3d' && Math.abs(p.py - drag.sy) > 4) {
          w.view.y0 = Math.max(0, Math.min(w.selection.ya, w.selection.yb)); w.view.y1 = Math.min(w.data.fMax, Math.max(w.selection.ya, w.selection.yb));
        }
        w.selection = null; setViewX(w, a, b);
      } else if (!drag.panMode && !moved) {
        const x = w.lay.ax.fromPx(p.px), y = w.lay.ay.fromPx(p.py);
        if (w.kind === '3d') { w.fixedCursor3 = { x, y }; w.display.crosshair = true; }
        else w.fixedCursor = x;
        w.selection = null; requestRender(w);
      } else { w.selection = null; requestRender(w); }
      drag = null;
    });
    w.canvas.addEventListener('pointerleave', () => { if (!drag) updateCursor(w, null, null, false); });
    w.canvas.addEventListener('dblclick', () => resetView(w));
    w.canvas.addEventListener('wheel', e => {
      if (!w.lay || !w.lay.ax || w.kind === 'instrument') return;
      e.preventDefault();
      if (S.spaceDown && w.display.cursorMode === 'sideband' && w.display.sideband > 0) { // SPACE + wheel: sideband offset in 1 % steps
        w.display.sideband *= e.deltaY > 0 ? 1 / 1.01 : 1.01; requestRender(w); return;
      }
      const p = pt(e), f = e.deltaY > 0 ? 1.25 : 0.8;
      if (e.shiftKey && w.kind === '1d') {
        const c = w.lay.ay.fromPx(p.py), [y0, y1] = [w.view.y0, w.view.y1];
        w.display.zoomY = w.display.logY ? [Math.max(1e-30, y0 * f), y1 * f] : [c - (c - y0) * f, c + (y1 - c) * f];
        requestRender(w); return;
      }
      zoom(w, f, w.lay.ax.fromPx(p.px));
    }, { passive: false });
  }

  function drawRubber(w, drag, p) {
    render(w);
    const ctx = w.ctx; ctx.strokeStyle = S.theme.cursor; ctx.setLineDash([4, 3]);
    ctx.strokeRect(Math.min(drag.sx, p.px), Math.min(drag.sy, p.py), Math.abs(p.px - drag.sx), Math.abs(p.py - drag.sy)); ctx.setLineDash([]);
  }

  function valueAt(d, x) {
    if (!d || !d.y || !d.y.length) return null;
    if (d.x) { let best = 0; for (let i = 0; i < d.x.length; i++) if (Math.abs(d.x[i] - x) < Math.abs(d.x[best] - x)) best = i; return { i: best, x: d.x[best], y: d.y[best] }; }
    const i = Math.max(0, Math.min(d.y.length - 1, Math.round((x - d.x0) / d.dx)));
    return { i, x: d.x0 + i * d.dx, y: d.y[i] };
  }

  function updateCursor(w, x, y, inside, fromSync) {
    if (w.kind === '3d') {
      if (!inside || x == null) { w.stCursor.textContent = ''; return; }
      const d = w.data, rows = d.sg.rows; let best = rows[0];
      for (const r of rows) if (Math.abs(r.t - x) < Math.abs(best.t - x)) best = r;
      const k = Math.max(0, Math.min(d.sg.bins - 1, Math.round((y - (d.sg.f0 || 0)) / d.sg.df)));
      w.stCursor.textContent = w.display.mode === 'mesh' ? '' : `t ${fmtV(best.t)} s · f ${fmtV((d.sg.f0 || 0) + k * d.sg.df)} Hz · ${fmtV(best.v[k])} dB`;
      return;
    }
    if (w.kind !== '1d') return;
    if (!inside || x == null) { if (w.cursor) { w.cursor = null; requestRender(w); } w.stCursor.textContent = ''; }
    else {
      const v = valueAt(w.data, x);
      if (!v) return;
      const d = w.data, sampleMode = w.display.sampleUnits && !d.x;
      w.stCursor.textContent = (sampleMode ? `#${v.i}` : `x ${fmtV(v.x)}${unitStr(d.xUnit)}`) + ` · y ${fmtV(v.y)}${unitStr(d.yUnit)}`;
      w.cursor = { x: v.x, y: v.y };
      requestRender(w);
    }
    if (!fromSync && S.settings.cursorAllWindows && w.data && w.data.xUnit === 's') {
      for (const o of related(w)) if (o !== w && o.kind === '1d' && o.data && o.data.xUnit === 's' && !o.data.x) updateCursor(o, x, null, inside && x >= o.view.x0 && x <= o.view.x1, true);
    }
  }

  function related(w) {
    let r = w; while (r.parents.length && S.wins.get(r.parents[0])) r = S.wins.get(r.parents[0]);
    const out = [], stack = [r];
    while (stack.length) { const c = stack.pop(); out.push(c); for (const id of c.children) { const cw = S.wins.get(id); if (cw) stack.push(cw); } }
    return out;
  }

  function toggleMax(w) {
    if (w.savedRect) { const r = w.savedRect; Object.assign(w.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); w.savedRect = null; }
    else { w.savedRect = w.rect(); Object.assign(w.el.style, { left: '0px', top: '0px', width: S.desktop.clientWidth + 'px', height: S.desktop.clientHeight + 'px' }); }
    activate(w);
  }

  function arrange(mode) {
    const ws = [...S.wins.values()], dw = S.desktop.clientWidth, dh = S.desktop.clientHeight;
    if (mode === 'cascade') ws.forEach((w, i) => Object.assign(w.el.style, { left: 16 + i * 26 + 'px', top: 12 + i * 26 + 'px', width: Math.min(620, dw * 0.55) + 'px', height: Math.min(360, dh * 0.5) + 'px' }));
    else {
      const n = ws.length, cols = Math.ceil(Math.sqrt(n * dw / Math.max(1, dh))), rows = Math.ceil(n / cols);
      ws.forEach((w, i) => Object.assign(w.el.style, { left: (i % cols) * dw / cols + 'px', top: Math.floor(i / cols) * dh / rows + 'px', width: dw / cols - 4 + 'px', height: dh / rows - 4 + 'px' }));
    }
    ws.forEach(w => { w.savedRect = null; requestRender(w); });
  }

  /* ---------- Root signal windows ---------- */
  function openSignal(y, fs, title, source, extra) {
    const data = { y: Float64Array.from(y), x0: 0, dx: 1 / fs, xUnit: 's', yUnit: (extra && extra.yUnit) || '' };
    return createWindow({ kind: '1d', title, data, source: source || { type: 'copy' } });
  }
  function openXY(data, title) { return createWindow({ kind: '1d', title, data, source: { type: 'copy' } }); }

  function replaceSourceData(w, y, fs) {
    w.data = Object.assign({}, w.data, { y: Float64Array.from(y), dx: 1 / fs });
    w.history = []; afterData(w);
  }

  // Make an independent copy of the visible part.
  function copyVisible(w) {
    if (!w.data || !w.data.y) throw new Error('Nothing to copy');
    const d = visibleData(w);
    return createWindow({ kind: '1d', title: w.title + ' (part)', data: Object.assign({}, d, { y: Float64Array.from(d.y), x: d.x ? Float64Array.from(d.x) : undefined, spectrum: undefined }), source: { type: 'copy' } });
  }

  /* ---------- Playback ---------- */
  let audioCtx = null;
  const getAudio = () => {
    if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); audioCtx._sink = ''; }
    const want = S.settings.audioOut || '';
    if (audioCtx.setSinkId && audioCtx._sink !== want) { audioCtx._sink = want; audioCtx.setSinkId(want).catch(() => {}); }
    return audioCtx;
  };

  function stopPlayback(w) {
    const ws = w ? [w] : [...S.wins.values()];
    for (const x of ws) {
      if (x.player) { try { x.player.src.onended = null; x.player.src.stop(); } catch (e) { /* already stopped */ } cancelAnimationFrame(x.player.raf); x.player = null; x.playhead = null; requestRender(x); }
      if (x.stepper) { clearInterval(x.stepper); x.stepper = null; }
    }
    emit();
  }

  function playSound(w, mode) {
    const d = w.data;
    if (!d || !d.y || d.x || d.xUnit !== 's') throw new Error('Only time signals can be played');
    stopPlayback(w);
    const fs = 1 / d.dx;
    let i0 = 0, i1 = d.y.length;
    if (mode === 'visible') { i0 = Math.max(0, Math.floor((w.view.x0 - d.x0) / d.dx)); i1 = Math.min(d.y.length, Math.ceil((w.view.x1 - d.x0) / d.dx)); }
    if (mode === 'cursor' && w.fixedCursor != null) i0 = Math.max(0, Math.min(d.y.length - 1, Math.round((w.fixedCursor - d.x0) / d.dx)));
    let y = d.y.subarray(i0, i1), rate = fs;
    if (y.length < 2) throw new Error('Nothing to play');
    if (fs < 3000 || fs > 384000) { y = DSP.resample(y, fs, 44100); rate = 44100; }
    const m = DSP.mean(y); let peak = 0; for (const v of y) peak = Math.max(peak, Math.abs(v - m));
    const k = S.settings.autoVolume ? (peak > 0 ? 0.9 / peak : 1) : 1;
    const ac = getAudio(); if (ac.state === 'suspended') ac.resume();
    const buf = ac.createBuffer(1, y.length, rate), ch = buf.getChannelData(0);
    for (let i = 0; i < y.length; i++) ch[i] = Math.max(-1, Math.min(1, (y[i] - (S.settings.autoVolume ? m : 0)) * k));
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = S.settings.playLoop; src.connect(ac.destination);
    const t0 = ac.currentTime, dur = y.length / rate, x0 = d.x0 + i0 * d.dx, span = (i1 - i0) * d.dx;
    src.start();
    w.player = { src, raf: 0 };
    const tick = () => {
      if (!w.player) return;
      let el = (ac.currentTime - t0); if (S.settings.playLoop) el %= dur;
      w.playhead = x0 + Math.min(el / dur, 1) * span;
      requestRender(w); w.player.raf = requestAnimationFrame(tick);
    };
    tick();
    src.onended = () => { if (w.player && w.player.src === src) { cancelAnimationFrame(w.player.raf); w.player = null; w.playhead = null; requestRender(w); emit(); } };
    emit();
  }

  // "Play without sound": step the visible part through the signal so linked windows animate.
  function playSilent(w, fast) {
    if (!w.data || !w.data.y) throw new Error('Nothing to play');
    stopPlayback(w);
    if (w.autoX) { const [a, b] = extentX(w); setViewX(w, a, a + (b - a) / 10); }
    const stepFrac = S.settings.step / 100, period = fast ? 16 : Math.max(16, (w.view.x1 - w.view.x0) * stepFrac * 1000);
    w.stepper = setInterval(() => {
      const [, b] = extentX(w), span = w.view.x1 - w.view.x0;
      if (w.view.x1 >= b - 1e-12) {
        if (S.settings.playLoop) { const [a] = extentX(w); w.view.x0 = a; w.view.x1 = a + span; viewChanged(w); return; }
        stopPlayback(w); return;
      }
      pan(w, stepFrac);
    }, w.data.xUnit === 's' ? Math.min(1000, period) : 120);
    emit();
  }

  /* ---------- Acquisition (microphone / line-in via getUserMedia) ---------- */
  // opts: {deviceId, channels, sampleRate, mode:'continuous'|'block'|'timed'|'trigger', seconds, blockSize, fps,
  //        trigger:{channel, level, slope:'rising'|'falling', pre, length, rearm, maxRearm, reuse},
  //        calibration:[{name, scale, offset, unit}] per channel, reuse:[windows] (restart into existing windows)}
  async function startAcquisition(opts) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser does not allow audio input here (needs https or localhost).');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined } });
    const ac = new (window.AudioContext || window.webkitAudioContext)(opts.sampleRate ? { sampleRate: opts.sampleRate } : {});
    const fs = ac.sampleRate, src = ac.createMediaStreamSource(stream);
    const nch = Math.min(2, src.channelCount || 1, opts.channels || 1);
    const proc = ac.createScriptProcessor(2048, Math.max(1, nch), 1);
    const trig = opts.mode === 'trigger' ? Object.assign({ channel: 0, level: 0.1, slope: 'rising', pre: -256, length: 4096, rearm: true, maxRearm: 0, reuse: true }, opts.trigger || {}) : null;
    const len = trig ? trig.length : opts.mode === 'block' ? opts.blockSize : Math.round(opts.seconds * fs);
    const cal = c => Object.assign({ scale: 1, offset: 0, unit: '' }, (opts.calibration || [])[c] || {});
    const modeText = trig ? 'triggered' : opts.mode === 'block' ? len + ' samples' : opts.seconds + ' s';
    const wins = [];
    for (let c = 0; c < nch; c++) {
      const reuse = opts.reuse && opts.reuse[c] && S.wins.has(opts.reuse[c].id) ? opts.reuse[c] : null;
      const data = { y: new Float64Array(trig ? 0 : len), x0: 0, dx: 1 / fs, xUnit: 's', yUnit: cal(c).unit, t0abs: Date.now() };
      const w = reuse || createWindow({ kind: '1d', title: `Live input${nch > 1 ? ' ch ' + (c + 1) : ''} (${modeText})`, data, source: { type: 'acq', channel: c } });
      if (reuse) { w.data = data; w.source = { type: 'acq', channel: c }; w.title = w.title.replace('Recorded input', 'Live input'); w.updateTitle(); afterData(w); }
      w.acq = { ring: new Float64Array(len), pos: 0, filled: 0, dirty: false, total: 0, mode: opts.mode, block: new Float64Array(len), bpos: 0, timed: opts.mode === 'timed', cal: cal(c) };
      w.acqConfig = Object.assign({}, opts, { reuse: undefined });
      wins.push(w);
    }
    const shared = { stream, ac, proc, src, wins, running: true, fs, trig, triggers: 0 };
    wins.forEach(w => { w.acqShared = shared; });
    // trigger state: pre-trigger history per channel, capture buffers
    const preN = trig ? Math.max(0, -trig.pre) : 0, postSkip = trig ? Math.max(0, trig.pre) : 0;
    const hist = trig ? wins.map(() => new Float64Array(Math.max(1, preN))) : null;
    let hpos = 0, armed = !!trig, capturing = false, capPos = 0, skip = 0, prev = null;
    const caps = trig ? wins.map(() => new Float64Array(len)) : null;
    proc.onaudioprocess = ev => {
      if (!shared.running) return;
      const chans = wins.map((w, c) => {
        const raw = ev.inputBuffer.getChannelData(Math.min(c, ev.inputBuffer.numberOfChannels - 1)), k = w.acq.cal, out = new Float32Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw[i] * k.scale + k.offset;
        return out;
      });
      if (root.ACQ_HOOK) try { root.ACQ_HOOK(chans, fs, shared); } catch (e) { console.error(e); }
      const n = chans[0].length;
      if (trig) {
        const tc = chans[Math.min(trig.channel, chans.length - 1)];
        for (let i = 0; i < n; i++) {
          const v = tc[i];
          if (armed && !capturing && prev !== null) {
            const hit = trig.slope === 'falling' ? prev >= trig.level && v < trig.level : prev <= trig.level && v > trig.level;
            if (hit) {
              capturing = true; capPos = 0; skip = postSkip;
              for (let c = 0; c < wins.length; c++) for (let j = 0; j < preN && capPos + j < len; j++) caps[c][j] = hist[c][(hpos + j) % preN];
              capPos = Math.min(preN, len);
            }
          }
          if (capturing) {
            if (skip > 0) skip--;
            else { for (let c = 0; c < wins.length; c++) caps[c][capPos] = chans[c][i]; capPos++; }
            if (capPos >= len) {
              capturing = false; shared.triggers++;
              for (let c = 0; c < wins.length; c++) { wins[c].acq.ring.set(caps[c]); wins[c].acq.dirty = true; wins[c].acq.filled = len; wins[c].acq.trigTime = (wins[c].acq.total + i) / fs; }
              if (!trig.rearm || (trig.maxRearm > 0 && shared.triggers >= trig.maxRearm)) { armed = false; setTimeout(() => stopAcquisition(wins[0]), 50); }
            }
          }
          if (preN) { for (let c = 0; c < wins.length; c++) hist[c][hpos] = chans[c][i]; hpos = (hpos + 1) % preN; }
          prev = v;
        }
        for (const w of wins) w.acq.total += n;
        return;
      }
      for (let c = 0; c < wins.length; c++) {
        const a = wins[c].acq, inp = chans[c];
        if (a.mode === 'block') {
          for (let i = 0; i < inp.length; i++) { a.block[a.bpos++] = inp[i]; if (a.bpos === a.block.length) { a.ring.set(a.block); a.bpos = 0; a.dirty = true; a.filled = a.block.length; } }
        } else {
          for (let i = 0; i < inp.length; i++) { a.ring[a.pos] = inp[i]; a.pos = (a.pos + 1) % a.ring.length; }
          a.filled = Math.min(a.ring.length, a.filled + inp.length); a.dirty = true;
          if (a.timed && a.filled >= a.ring.length) { a.dirty = true; setTimeout(() => stopAcquisition(wins[c]), 0); }
        }
        a.total += inp.length;
      }
    };
    src.connect(proc); proc.connect(ac.destination);
    shared.timer = setInterval(() => {
      for (const w of wins) {
        const a = w.acq; if (!a.dirty) continue; a.dirty = false;
        let y;
        if (a.mode === 'block' || a.mode === 'trigger') y = Float64Array.from(a.ring);
        else if (a.timed) y = Float64Array.from(a.ring.subarray(0, a.filled));
        else { y = new Float64Array(a.ring.length); const tail = a.ring.subarray(a.pos), head = a.ring.subarray(0, a.pos); y.set(tail); y.set(head, tail.length); }
        const t0 = a.mode === 'continuous' ? Math.max(0, a.total - y.length) / fs : a.mode === 'trigger' ? (a.trigTime || 0) - preN / fs : 0;
        w.data = Object.assign({}, w.data, { y, x0: t0, note: a.mode === 'trigger' ? shared.triggers + ' trigger(s)' : undefined });
        if (w.autoX) fitX(w); else { const span = w.view.x1 - w.view.x0, [, b] = extentX(w); w.view.x1 = b; w.view.x0 = b - span; }
        afterData(w);
      }
    }, 1000 / (opts.fps || 20));
    S.acquisitions = (S.acquisitions || []).concat([shared]);
    emit();
    return wins;
  }
  function restartAcquisition() {
    const groups = new Map();
    for (const w of S.wins.values()) if (w.acqConfig && !(w.acqShared && w.acqShared.running)) {
      const key = JSON.stringify(w.acqConfig); if (!groups.has(key)) groups.set(key, { cfg: w.acqConfig, wins: [] });
      groups.get(key).wins[w.source && w.source.channel != null ? w.source.channel : groups.get(key).wins.length] = w;
    }
    if (!groups.size) throw new Error('No stopped acquisition windows. Use Data acquisition ▸ Open data acquisition first.');
    return Promise.all([...groups.values()].map(g => startAcquisition(Object.assign({}, g.cfg, { reuse: g.wins }))));
  }
  function resetAcquisition() {
    for (const w of S.wins.values()) if (w.acq) { w.acq.ring.fill(0); w.acq.filled = 0; w.acq.pos = 0; w.acq.dirty = true; w.state = {}; w.history = []; }
  }

  function stopAcquisition(w) {
    const list = w ? [w.acqShared].filter(Boolean) : (S.acquisitions || []);
    for (const sh of list) {
      if (!sh.running) continue;
      sh.running = false; clearInterval(sh.timer);
      try { sh.proc.disconnect(); sh.src.disconnect(); } catch (e) { /* ignore */ }
      sh.stream.getTracks().forEach(t => t.stop()); sh.ac.close();
      for (const x of sh.wins) { if (x.acq) { x.title = x.title.replace('Live input', 'Recorded input'); x.updateTitle(); } x.source = { type: 'copy' }; }
    }
    S.acquisitions = (S.acquisitions || []).filter(a => a.running);
    emit();
  }

  /* ---------- Workspaces & custom tools ---------- */
  function serialize(withData = true) {
    const order = topoOrder([...S.wins.values()]);
    return {
      app: 'OpenSig', version: 1, saved: new Date().toISOString(), settings: S.settings,
      windows: order.map(w => ({
        id: w.id, kind: w.kind, title: w.title, op: w.op, parents: w.parents, frozen: w.frozen, rect: w.rect(),
        display: Object.assign({}, w.display), view: w.autoX ? null : { x0: w.view.x0, x1: w.view.x1 }, sourceType: w.source && w.source.type,
        data: (withData && w.kind === '1d' && w.data && w.data.y && (!w.op || w.frozen)) ? {
          y: IO.f32ToB64(w.data.y), x: w.data.x ? IO.f32ToB64(w.data.x) : null, x0: w.data.x0, dx: w.data.dx, xUnit: w.data.xUnit, yUnit: w.data.yUnit } : null
      }))
    };
  }
  function topoOrder(ws) {
    const seen = new Set(), out = [];
    const visit = w => { if (seen.has(w.id)) return; seen.add(w.id); for (const p of w.parents) { const pw = S.wins.get(p); if (pw) visit(pw); } out.push(w); };
    ws.sort((a, b) => a.id - b.id).forEach(visit);
    return out;
  }
  function loadWorkspace(ws) {
    if (!ws || !Array.isArray(ws.windows)) throw new Error('Not an OpenSig workspace file');
    [...S.wins.values()].forEach(closeWindow);
    S.nextId = 1;
    const map = new Map();
    for (const s of ws.windows) {
      const parents = (s.parents || []).map(p => map.get(p)).filter(Boolean);
      let data = null;
      if (s.data) data = { y: Float64Array.from(IO.b64ToF32(s.data.y)), x: s.data.x ? Float64Array.from(IO.b64ToF32(s.data.x)) : undefined, x0: s.data.x0, dx: s.data.dx, xUnit: s.data.xUnit, yUnit: s.data.yUnit };
      let op = s.op;
      if (op && op.type === 'calc') {
        op = { type: 'calc', params: Object.assign({}, op.params, { expr: op.params.expr.replace(/\bW(\d+)\b/gi, (m, n) => 'W' + (map.get(+n) || n)) }) };
      }
      if (op && OPS[op.type] && OPS[op.type].remap) op = OPS[op.type].remap(op, id => map.get(id)); // e.g. Geometry DOF channels
      const frozen = !!s.frozen;
      if (!data && (!op || frozen)) { map.set(s.id, null); continue; }
      const w = new Win({ kind: s.kind, title: s.title, op, parents: frozen ? [] : parents, data, rect: s.rect, display: s.display,
        source: op && !frozen ? null : { type: 'copy' } });
      w.frozen = frozen && !!op;
      if (s.view) { w.autoX = false; w.view.x0 = s.view.x0; w.view.x1 = s.view.x1; }
      w.updateTitle();
      map.set(s.id, w.id);
      if (w.op && !w.frozen) queueCompute(w); else afterData(w);
    }
    const last = [...S.wins.values()].pop(); if (last) activate(last);
    emit();
  }

  // Custom tool = the op chain below a window, re-applicable to any other window (like the original's .SWT files).
  // includeSelf: true = window and its subtree, false = subtree only, 'only' = the window alone.
  function toolFromWindow(w, includeSelf) {
    const nodes = [], walk = (x, parentRef) => {
      const ref = nodes.length;
      nodes.push({ ref, parentRef, op: x.op, title: x.title, display: { style: x.display.style, logX: x.display.logX, logY: x.display.logY, mode: x.display.mode, palette: x.display.palette, gauge: x.display.gauge, hidden: !!x.display.hidden, look: x.display.look || null, width: x.display.width, color: x.display.color || null, dots: !!x.display.dots } });
      for (const c of x.children) { const cw = S.wins.get(c); if (cw && cw.op && !OPS[cw.op.type].multi) walk(cw, ref); }
    };
    if (includeSelf) { if (!w.op) throw new Error('This window is a source signal; choose "subtree only".'); if (includeSelf === 'only') nodes.push({ ref: 0, parentRef: null, op: w.op, title: w.title, display: { style: w.display.style, logX: w.display.logX, logY: w.display.logY, mode: w.display.mode, palette: w.display.palette, gauge: w.display.gauge } }); else walk(w, null); }
    else for (const c of w.children) { const cw = S.wins.get(c); if (cw && cw.op && !OPS[cw.op.type].multi) walk(cw, null); }
    if (!nodes.length) throw new Error('No derived windows to save.');
    return { app: 'OpenSig', tool: 1, name: w.title, nodes };
  }
  function applyTool(target, tool) {
    if (!tool || !Array.isArray(tool.nodes)) throw new Error('Not an OpenSig custom tool');
    const made = new Map();
    for (const n of tool.nodes) {
      const parent = n.parentRef == null ? target : made.get(n.parentRef);
      if (!parent || !OPS[n.op.type]) continue;
      made.set(n.ref, derive(parent, n.op.type, n.op.params, { display: n.display }));
    }
    return made.size;
  }

  /* ---------- Workspace tabs ---------- */
  // Every workspace has its own tab: its windows (numbered from 1), active window, description and a layer on the
  // desktop that holds the window elements. S holds the shown tab's. Windows of hidden tabs are not drawn; work for them
  // (acquisition, script timers) only marks their tab stale, and the tab is brought up to date when it is shown again.
  const TAB_STATE = ['wins', 'nextId', 'active', 'description', 'layer'];
  const tabs = [];
  let curTab = null;
  const away = w => w.tab !== curTab;
  const isOpen = w => !!w && (w.tab ? w.tab.wins : S.wins).get(w.id) === w; // open, in any tab
  function swapTab(t) { if (curTab) for (const k of TAB_STATE) curTab[k] = S[k]; curTab = t; for (const k of TAB_STATE) S[k] = t[k]; }
  function freeTabName() { let n = 1; while (tabs.some(t => t.name === 'Workspace ' + n)) n++; return 'Workspace ' + n; }
  function addTab(name) {
    const layer = document.createElement('div'); layer.className = 'ws-layer'; layer.hidden = true; S.desktop.appendChild(layer);
    const t = { name: name || freeTabName(), wins: new Map(), nextId: 1, active: null, description: '', layer, stale: false };
    tabs.push(t); emit();
    return t;
  }
  function selectTab(t) {
    if (!t || t === curTab || !tabs.includes(t)) return;
    if (curTab) { stopPlayback(); flush(); curTab.layer.hidden = true; } // queued computes belong to the tab being left
    swapTab(t); t.layer.hidden = false;
    if (t.stale) {
      t.stale = false;
      for (const w of topoOrder([...S.wins.values()])) if (w.op && !w.frozen) queueCompute(w); else if (w.autoX) fitX(w); else clampView(w);
    }
    S.wins.forEach(requestRender);
    emit();
  }
  function closeTab(t) {
    if (!tabs.includes(t)) return;
    const back = curTab;
    selectTab(t);
    [...S.wins.values()].forEach(closeWindow);
    S.nextId = 1; S.description = '';
    if (tabs.length === 1) { t.name = ''; t.name = freeTabName(); emit(); return; } // the last tab stays, empty
    const i = tabs.indexOf(t);
    selectTab(back !== t ? back : tabs[i + 1] || tabs[i - 1]);
    tabs.splice(tabs.indexOf(t), 1); t.layer.remove();
    emit();
  }
  function renameTab(t, name) { if (name && name.trim()) { t.name = name.trim(); emit(); } }
  function stepTab(d) { const n = tabs.length; selectTab(tabs[(tabs.indexOf(curTab) + d + n) % n]); }
  // a workspace file opens in a tab of its own; an empty tab is used for it
  function tabForFile(name) { const t = S.wins.size ? addTab(name) : curTab; if (name) t.name = name; selectTab(t); emit(); return t; }
  // runs fn with another tab's windows in S (nothing is shown or drawn)
  function withTab(t, fn) {
    if (t === curTab) return fn();
    flush(); const back = curTab; swapTab(t);
    try { return fn(); } finally { swapTab(back); }
  }
  // all tabs, for the saved session (restore at the next start, auto-save)
  function serializeTabs(withData) {
    return { app: 'OpenSig', version: 1, tabs: tabs.map(t => ({ name: t.name, ws: withTab(t, () => root.APP.serialize(withData)) })), active: tabs.indexOf(curTab) };
  }
  function loadTabs(saved) {
    if (!Array.isArray(saved.tabs)) { root.APP.loadWorkspace(saved); return; } // one workspace (earlier versions)
    const made = saved.tabs.map((s, i) => {
      const t = i === 0 && !S.wins.size ? curTab : addTab();
      t.name = s.name || t.name; selectTab(t);
      root.APP.loadWorkspace(s.ws); S.description = s.ws.description || '';
      return t;
    });
    selectTab(made[saved.active] || made[0]);
  }
  function initTabs() { if (!curTab) selectTab(addTab()); }

  root.APP = { S, Win, createWindow, derive, closeWindow, activate, link, unlink, queueCompute, recompute, requestRender, visibleData,
    setViewX, resetView, zoom, pan, fitX, extentX, arrange, toggleMax, openSignal, openXY, copyVisible, replaceSourceData,
    playSound, playSilent, stopPlayback, startAcquisition, stopAcquisition, restartAcquisition, resetAcquisition, afterData, emit, serialize, loadWorkspace, toolFromWindow, applyTool,
    saveSettings, applyTheme, readTheme, isDark, toggleDark, setWindowStyle, WINDOW_STYLES, valueAt, related, peaksOf, setPeaks, onChange: f => S.listeners.add(f), DEFAULT_SETTINGS, isOpen,
    tabs: { init: initTabs, list: () => tabs, current: () => curTab, add: addTab, select: selectTab, close: closeTab, rename: renameTab, step: stepTab,
      forFile: tabForFile, serialize: serializeTabs, load: loadTabs } };
})(window);
