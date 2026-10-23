/* OpenSig UI part 2: file formats & recents, editing extras, new signal/3D tools, instruments, scripts, custom displays,
   AI report, custom tools (library + toolbar T1–T5), advanced settings, help. Hooks into ui.js before the menu is built. */
(function (root) {
  'use strict';
  const { DSP, IO, PLOT, OPS, INSTRUMENTS, APP, UI, HOST, FORMATS, FILTERS, BANKS, CHARTS, SCRIPTING, AI, SIGMETRICS } = root;
  const S = APP.S, { dialog, toast, need, download, h, safeName, guard } = UI;
  const fmt = v => PLOT.fmt(v, Math.abs(v) / 1000 || 1);
  const MENU = label => UI.MENUS.find(m => m.label === label);
  function addItems(menuLabel, afterLabel, items) {
    const m = MENU(menuLabel); if (!m) return;
    const i = afterLabel ? m.items.findIndex(it => it !== '-' && it.label === afterLabel) : -1;
    if (i < 0) m.items.push(...items); else m.items.splice(i + 1, 0, ...items);
  }
  const has1D = () => S.active && S.active.kind === '1d' && S.active.data && S.active.data.y;
  const hasU = () => has1D() && !S.active.data.x;
  const hasTime = () => hasU() && S.active.data.xUnit === 's';
  const has3D = () => S.active && S.active.kind === '3d' && S.active.data;
  const isSource = w => w && (!w.op || w.frozen);
  const others1D = w => [...S.wins.values()].filter(o => o !== w && o.kind === '1d' && o.data && o.data.y);

  /* ======================= Files: formats, desktop dialogs, recents ======================= */
  const recent = {
    get() { try { return JSON.parse(localStorage.getItem('opensig.recent') || '{"signals":[],"workspaces":[]}'); } catch (e) { return { signals: [], workspaces: [] }; } },
    add(kind, path) { if (!path) return; const r = this.get(); r[kind] = [path].concat(r[kind].filter(p => p !== path)).slice(0, 10); try { localStorage.setItem('opensig.recent', JSON.stringify(r)); } catch (e) { /* ignore */ } }
  };
  // File-like wrapper around bytes read by the desktop host
  const fileLike = f => ({ name: f.name, path: f.path, size: f.buffer.byteLength, lastModified: f.lastModified || Date.now(),
    arrayBuffer: async () => f.buffer, text: async () => new TextDecoder().decode(f.buffer) });

  async function addSignals(list, source, fileDate) {
    if (!list.length) throw new Error('No signals found in the file');
    let rate = null;
    if (list.some(s => s.needRate)) {
      const v = await dialog({ title: 'Sample rate', intro: `${source.name}: the file does not store a sample rate.`, fields: [{ key: 'fs', label: 'Sample rate (samples/s)', type: 'number', value: 1, min: 0 }], validate: v => v.fs > 0 ? null : 'Must be positive' });
      if (!v) return [];
      rate = v.fs;
    }
    const made = list.slice(0, 64).map(s => APP.createWindow({ kind: '1d', title: s.name, source: Object.assign({ type: 'file' }, source),
      data: { y: s.y, x: s.x, x0: s.x0 || 0, dx: s.needRate ? 1 / rate : s.dx, xUnit: s.needRate ? 's' : s.xUnit, yUnit: s.yUnit || '', t0abs: s.t0abs ?? fileDate } }));
    if (list.length > 64) toast(`Opened the first 64 of ${list.length} signals`);
    return made;
  }

  async function chooseHdf5(buf, name, source) {
    const hd = await FORMATS.listHdf5(buf, name);
    try {
      if (!hd.sets.length) throw new Error('No numeric datasets in the HDF5 file');
      const v = await dialog({ title: 'Select signals from HDF file', intro: name, fields: hd.sets.slice(0, 200).map((s, i) => ({ key: 'd' + i, label: `${s.path}  [${s.shape.join('×')}]${s.fs ? '  ' + s.fs + ' Hz' : ''}`, type: 'check', value: hd.sets.length <= 8 })),
        extra: [{ label: 'Select all', run: (v, inp) => Object.values(inp).forEach(i => { i.checked = true; }) }, { label: 'Unselect all', run: (v, inp) => Object.values(inp).forEach(i => { i.checked = false; }) }] });
      if (!v) return;
      const sel = hd.sets.filter((s, i) => v['d' + i]);
      await addSignals(hd.read(sel), source);
    } finally { hd.close(); }
  }

  async function openWav(file, source) {
    const buf = await file.arrayBuffer(), w = IO.parseWav(buf);
    let display = null;
    try { // OpenSig display-settings chunk ("osig")
      const u8 = new Uint8Array(buf), dv = new DataView(buf);
      for (let p = 12; p + 8 <= u8.length;) { const id = String.fromCharCode(...u8.subarray(p, p + 4)), n = dv.getUint32(p + 4, true); if (id === 'osig') display = JSON.parse(new TextDecoder().decode(u8.subarray(p + 8, p + 8 + n))); p += 8 + n + (n & 1); }
    } catch (e) { /* no chunk */ }
    const t0 = display && display.t0abs != null ? display.t0abs : S.settings.wavFileDate ? file.lastModified : undefined;
    const made = await addSignals(w.channels.map((c, i) => ({ name: file.name + (w.channels.length > 1 ? ` [ch ${i + 1}]` : ''), y: Float64Array.from(c), x0: 0, dx: 1 / w.sampleRate, xUnit: 's', yUnit: display && display.yUnit || '', t0abs: t0 })), source);
    if (display && display.display) made.forEach(m => { Object.assign(m.display, display.display); APP.requestRender(m); });
    toast(`${file.name}: ${w.channels.length} ch · ${w.sampleRate} Hz · ${w.bits}-bit${w.isFloat ? ' float' : ''}`);
  }

  // Extension → reader. Returns true when the file was handled here.
  root.UI_OPENERS = async (file, mode) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase(), source = { name: file.name, path: file.path };
    if (mode && mode.startsWith('raw:')) return false;
    if (mode === 'workspace' || ext === 'osw') { const ws = JSON.parse(await file.text()); if (ws && Array.isArray(ws.windows)) APP.tabs.forFile(UI.baseName(file.name)); await loadWorkspaceSmart(ws, null, file.path); recent.add('workspaces', file.path); return true; }
    if (mode === 'replace') { await replaceWith(file); return true; }
    let done = true;
    if (ext === 'wav' || ext === 'wave') await openWav(file, source);
    else if (FORMATS.AUDIO_EXT.includes(ext)) await addSignals(await FORMATS.decodeAudio(await file.arrayBuffer(), file.name), source, S.settings.wavFileDate ? file.lastModified : undefined);
    else if (ext === 'mat') { const buf = await file.arrayBuffer(); if (/MATLAB 7\.3/.test(new TextDecoder().decode(new Uint8Array(buf, 0, 116)))) await chooseHdf5(buf, file.name, source); else await addSignals(await FORMATS.parseMat(buf, file.name), source); }
    else if (ext === 'npy') { const a = FORMATS.parseNpy(await file.arrayBuffer(), file.name); await addSignals(FORMATS.toSignals(file.name, a.data, a.rows, a.cols, 0, a.fortran).map(s => Object.assign(s, { needRate: true })), source); }
    else if (ext === 'npz') await addSignals(await FORMATS.parseNpz(await file.arrayBuffer(), file.name), source);
    else if (ext === 'uff' || ext === 'unv') await addSignals(FORMATS.parseUff(await file.text(), file.name), source);
    else if (ext === 'gdf') await addSignals(FORMATS.parseGdf(await file.arrayBuffer(), file.name), source);
    else if (ext === 'edf' || ext === 'bdf') await addSignals(FORMATS.parseEdf(await file.arrayBuffer(), file.name), source);
    else if (['h5', 'hdf5', 'hdf', 'he5', 'nc', 'nc4', 'jld2'].includes(ext)) await chooseHdf5(await file.arrayBuffer(), file.name, source);
    else if (ext === 'sig') {
      let info = { fs: 0, channels: 1 };
      if (file.path && HOST.available) { try { info = FORMATS.parseLogInfo(new TextDecoder().decode((await HOST.readFile(file.path.replace(/\.sig$/i, '.txt'))).buffer)); } catch (e) { /* no info file */ } }
      else if (pendingInfo[file.name.replace(/\.sig$/i, '')]) info = pendingInfo[file.name.replace(/\.sig$/i, '')];
      await addSignals(FORMATS.parseDataLog(await file.arrayBuffer(), info, file.name), source);
    } else if (ext === 'flt') { const c = FILTERS.parseFlt(await file.text(), UI.baseName(file.name)); FILTERS.user[c.name] = c; FILTERS.save(); toast(`Filter curve "${c.name}" imported (${c.f.length} points)`); }
    else if (ext === 'flb') { const b = BANKS.parse(await file.text()); APP.derive(need('time'), 'filterbank', { bands: b, name: UI.baseName(file.name) }); }
    else done = false;
    if (done && file.path && !['flt', 'flb'].includes(ext)) recent.add('signals', file.path);
    return done;
  };
  // Browser: pair .sig with its .txt when both are selected together
  const pendingInfo = {};
  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', async e => {
    for (const f of e.target.files) if (/\.txt$/i.test(f.name) && [...e.target.files].some(g => /\.sig$/i.test(g.name))) pendingInfo[f.name.replace(/\.txt$/i, '')] = FORMATS.parseLogInfo(await f.text());
  }, true);

  const ALL_EXT = '*.wav;*.wave;*.flac;*.mp3;*.ogg;*.oga;*.opus;*.m4a;*.aac;*.aif;*.aiff;*.csv;*.txt;*.dat;*.tsv;*.asc;*.bin;*.raw;*.sig;*.mat;*.npy;*.npz;*.uff;*.unv;*.gdf;*.edf;*.bdf;*.h5;*.hdf5;*.hdf;*.jld2;*.nc;*.osw;*.ost;*.osgeo;*.json;*.flt;*.flb';
  function filterFor(accept) {
    if (!accept) return 'All files (*.*)|*.*';
    const pats = accept.split(',').map(s => s.trim()).filter(Boolean).map(s => '*' + s).join(';');
    return `Supported files (${pats})|${pats}|All files (*.*)|*.*`;
  }
  // Desktop app: native Open dialog (gives real paths → recents, replace-with, data-log pairing)
  root.UI_PICK = (accept, mode) => {
    if (!HOST.available) return false;
    const filter = !accept || /\.wav,\.wave,\.csv/.test(accept) ? `All supported files|${ALL_EXT}|All files (*.*)|*.*` : filterFor(accept);
    guard(async () => {
      const files = await HOST.openFiles(filter, mode !== 'replace');
      for (const f of files || []) await UI.openFile(fileLike(f), mode === 'auto' ? null : mode);
    })();
    return true;
  };
  const openPath = path => guard(async () => { const f = await HOST.readFile(path); await UI.openFile(fileLike(f), /\.(osw|json)$/i.test(path) ? 'workspace' : null); })();

  async function replaceWith(file) {
    const w = S.wins.get(replaceTarget) || need('1d');
    if (!isSource(w)) throw new Error('Only source windows (opened, generated or unlinked) can be replaced.');
    // read via normal openers into temporary windows, then move the first signal's data into the target
    const ids = new Set(S.wins.keys());
    await UI.openFile(file, null);
    const added = [...S.wins.values()].filter(x => !ids.has(x.id));
    if (!added.length) throw new Error('No signal could be read from ' + file.name);
    const first = added[0];
    w.data = first.data; w.title = first.title; w.source = first.source; w.history = []; w.updateTitle();
    added.forEach(x => APP.closeWindow(x)); APP.activate(w); APP.resetView(w); APP.afterData(w);
    toast(`${w.label} now shows ${file.name}; ${w.children.size} linked window(s) recalculated`);
  }
  let replaceTarget = null;

  /* ======================= Workspaces: descriptions, references, restore ======================= */
  const origSerialize = APP.serialize, origLoad = APP.loadWorkspace;
  APP.serialize = withData => {
    const ws = origSerialize(withData);
    ws.description = S.description || '';
    ws.filters = FILTERS.user;
    if (!withData) ws.windows.forEach(x => { const w = S.wins.get(x.id); if (w && w.source && w.source.path && !x.data) x.sourcePath = w.source.path; });
    return ws;
  };
  async function loadWorkspaceSmart(ws, inputFile, wsPath) {
    if (!ws || !Array.isArray(ws.windows)) throw new Error('Not an OpenSig workspace file');
    // reload referenced source files (workspace saved without data, desktop app)
    for (const x of ws.windows) if (!x.data && x.sourcePath && (!x.op || x.frozen)) {
      try {
        const f = await HOST.readFile(x.sourcePath), sigs = [];
        const ids = new Set(S.wins.keys()); await UI.openFile(fileLike(f), null);
        for (const w of S.wins.values()) if (!ids.has(w.id)) { sigs.push(w); }
        if (sigs[0]) { const d = sigs[0].data; x.data = { y: IO.f32ToB64(d.y), x0: d.x0, dx: d.dx, xUnit: d.xUnit, yUnit: d.yUnit }; }
        sigs.forEach(w => APP.closeWindow(w));
      } catch (e) { toast('Could not reload ' + x.sourcePath + ': ' + e.message, 'err'); }
    }
    // -loadsws <workspace> <input file>: replace the first source window's data
    if (inputFile) {
      const ids = new Set(S.wins.keys()); await UI.openFile(inputFile, null);
      const nw = [...S.wins.values()].filter(w => !ids.has(w.id));
      const src = ws.windows.find(x => x.data && (!x.op || x.frozen));
      // keep the workspace's window title so batch scripts can keep addressing the window by name
      if (src && nw[0]) { const d = nw[0].data; src.data = { y: IO.f32ToB64(d.y), x0: d.x0, dx: d.dx, xUnit: d.xUnit, yUnit: d.yUnit }; }
      nw.forEach(w => APP.closeWindow(w));
    }
    if (ws.filters) { Object.assign(FILTERS.user, ws.filters); FILTERS.save(); }
    origLoad(ws);
    S.description = ws.description || '';
    if (wsPath) recent.add('workspaces', wsPath);
    if (S.description && !root.AUTOMATION_ACTIVE) dialog({ title: 'Workspace description', fields: [{ type: 'info', label: S.description }], ok: 'OK', cancel: 'Close' });
  }
  APP.loadWorkspaceSmart = loadWorkspaceSmart;

  /* ======================= Edit extras ======================= */
  async function editSignalTime() {
    const w = need('time');
    const d0 = w.data.t0abs != null ? new Date(w.data.t0abs) : new Date(), p = n => String(n).padStart(2, '0');
    const local = `${d0.getFullYear()}-${p(d0.getMonth() + 1)}-${p(d0.getDate())}T${p(d0.getHours())}:${p(d0.getMinutes())}:${p(d0.getSeconds())}`;
    const v = await dialog({ title: 'Set date/time for signal begin', fields: [
      { key: 'dt', label: 'Date/time (YYYY-MM-DDThh:mm:ss)', type: 'text', value: local },
      { key: 'frac', label: '+ fraction of a second', type: 'number', value: (d0.getMilliseconds() / 1000), min: 0, max: 0.999 },
      { key: 'clear', label: 'Clear (no absolute time)', type: 'check', value: false },
      { key: 'show', label: 'Show absolute time on X-axis', type: 'check', value: !!w.display.absTime }],
      validate: v => v.clear || !isNaN(Date.parse(v.dt)) ? null : 'Invalid date/time' });
    if (!v) return;
    const t = v.clear ? null : Date.parse(v.dt) + Math.round((v.frac || 0) * 1000);
    for (const x of APP.related(w)) if (x.data && x.data.xUnit === 's') { x.data = Object.assign({}, x.data, { t0abs: t ?? undefined }); x.display.absTime = v.show && t != null; APP.requestRender(x); }
  }
  async function editSignalValues() {
    const w = need('1d');
    if (!isSource(w)) throw new Error('Values can be edited in source windows only (opened, generated or unlinked windows).');
    const d = w.data, [i0, i1] = PLOT.indexRange(d, w.view.x0, w.view.x1), n = Math.min(500, i1 - i0 + 1), xOf = i => d.x ? d.x[i] : d.x0 + i * d.dx;
    const rows = []; for (let i = i0; i < i0 + n; i++) rows.push(`${i}\t${IO.fmtNum(xOf(i))}\t${IO.fmtNum(d.y[i])}`);
    const v = await dialog({ title: 'Edit signal values – ' + w.label, intro: `Visible values ${i0}…${i0 + n - 1}${i1 - i0 + 1 > n ? ' (first 500 of the visible part)' : ''}. Edit the third column (index, X, Y; tab-separated).`, fields: [{ key: 't', label: 'index    X    Y', type: 'textarea', rows: 18, wide: true, value: rows.join('\n') }], ok: 'Apply' });
    if (!v) return;
    const y = Float64Array.from(d.y); let changed = 0;
    for (const line of v.t.split(/\r?\n/)) { const p = line.trim().split(/\s+/); if (p.length >= 3) { const i = +p[0], val = parseFloat(p[2]); if (Number.isInteger(i) && i >= 0 && i < y.length && isFinite(val) && val !== y[i]) { y[i] = val; changed++; } } }
    w.data = Object.assign({}, d, { y }); APP.afterData(w); toast(changed + ' value(s) changed');
  }
  async function describe(kind) {
    const w = kind === 'window' ? need() : null;
    const v = await dialog({ title: kind === 'window' ? 'Window description – ' + w.label : 'Workspace description', intro: kind === 'window' ? 'Shown as tooltip of the window title.' : 'Shown when the workspace is loaded.', fields: [{ key: 't', label: 'Description', type: 'textarea', rows: 6, wide: true, value: kind === 'window' ? (w.display.description || '') : (S.description || '') }] });
    if (!v) return;
    if (w) { w.display.description = v.t; w.el.querySelector('.win-title').title = v.t || w.opLabel || w.title; } else S.description = v.t;
  }
  async function stepChange() {
    const w = S.active, fs = w && w.data && w.data.dx && !w.data.x ? 1 / w.data.dx : 0, span = w ? w.view.x1 - w.view.x0 : 0;
    const v = await dialog({ title: 'Step change', intro: 'Step used by "Play signal (no sound)" and the ← / → keys. Alt+↑ / Alt+↓ change it quickly.', fields: [
      { key: 'pct', label: 'Step (%) of the visible width', type: 'number', value: S.settings.step, min: 0.1, max: 100 },
      { type: 'info', label: span ? `= ${fmt(span * S.settings.step / 100)} ${w.data.xUnit || ''}${fs ? ` = ${Math.round(span * S.settings.step / 100 * fs)} samples` : ''}` : '' }] });
    if (v) { S.settings.step = v.pct; APP.saveSettings(); }
  }
  async function saveFilterCurve() {
    const w = need('1d');
    if (w.data.xUnit !== 'Hz') throw new Error('Select a spectrum window (X axis in Hz) to save it as a filter curve.');
    const v = await dialog({ title: 'Save values as filter file', fields: [
      { key: 'name', label: 'Filter name', type: 'text', value: safeName(w.title).slice(0, 40) },
      { key: 'type', label: 'Filter type', type: 'radio', value: /dB/.test(w.data.yUnit || '') ? 'dB' : 'coef', options: [
        ['mag', 'Magnitude values – subtracted from the filtered spectrum'], ['coef', 'Relative values – multiplied with the spectrum (0.5 = −50 %)'], ['dB', 'Relative dB values – added to the spectrum level']] },
      { key: 'file', label: 'Also save as .flt file', type: 'check', value: false }], validate: v => v.name.trim() ? null : 'Enter a name' });
    if (!v) return;
    const d = w.data, f = [], val = [];
    for (let i = 0; i < d.y.length; i++) { f.push(d.x ? d.x[i] : d.x0 + i * d.dx); val.push(d.y[i]); }
    FILTERS.user[v.name.trim()] = { name: v.name.trim(), type: v.type, f, v: val }; FILTERS.save();
    if (v.file) download(safeName(v.name) + '.flt', `Type=${{ dB: 'DB_ADD', coef: 'MULTIPLY', mag: 'MAG_SUBTRACT' }[v.type]}\nFrequency=CENTER\n########\n` + f.map((x, i) => `${IO.fmtNum(x)}\t${IO.fmtNum(val[i])}`).join('\n'), 'text/plain');
    toast(`Filter curve "${v.name.trim()}" saved – use it in FFT filter ▸ Custom filter curve or Spectral defaults ▸ Custom filtering`);
  }
  async function saveEmf() {
    const w = need(); const png = w.canvas.toDataURL('image/png').split(',')[1];
    const p = await HOST.call('saveEmf', { png, name: safeName(w.title) + '.emf' }); if (p) toast('Saved ' + p);
  }

  /* ======================= Signal tools ======================= */
  async function cwtDialog() {
    const w = need('uniform'), fs = 1 / w.data.dx;
    const v = await dialog({ title: 'Continuous wavelet transform (Morlet)', intro: 'Time–frequency map of the visible part; zoom in first for long signals.', fields: [
      { key: 'fMin', label: 'Min frequency (Hz)', type: 'number', value: +(fs / 200).toPrecision(3), min: 0 }, { key: 'fMax', label: 'Max frequency (Hz)', type: 'number', value: +(fs / 4).toPrecision(3), min: 0 },
      { key: 'nFreq', label: 'Number of frequencies', type: 'number', value: 96, min: 8, max: 400, step: 1 }, { key: 'w0', label: 'Morlet ω0 (time/frequency balance)', type: 'number', value: 6, min: 3, max: 20 }],
      validate: v => v.fMax > v.fMin && v.fMax <= fs / 2 ? null : 'Max must be above min and at most Nyquist (' + fs / 2 + ' Hz)' });
    if (v) APP.derive(w, 'cwt', { fMin: v.fMin, fMax: v.fMax, nFreq: Math.round(v.nFreq), w0: v.w0 });
  }
  async function waveletDialog() {
    const w = need('uniform');
    const v = await dialog({ title: 'Wavelet denoising', fields: [
      { key: 'wavelet', label: 'Wavelet', type: 'select', options: Object.keys(DSP.WAVELETS), value: 'Daubechies4' },
      { key: 'levels', label: 'Decomposition levels', type: 'number', value: 5, min: 1, max: 12, step: 1 },
      { key: 'rule', label: 'Threshold rule', type: 'select', options: [['Universal', 'Universal (√(2 ln N)·σ)'], ['Robust', 'Robust (per-level noise estimate)'], ['Fixed3Sigma', 'Fixed 3σ']], value: 'Universal' },
      { key: 'mode', label: 'Shrinkage', type: 'select', options: ['Soft', 'Hard'], value: 'Soft' }] });
    if (v) APP.derive(w, 'wavedenoise', Object.assign(v, { levels: Math.round(v.levels) }));
  }
  async function tachoDialog() {
    const w = need('time');
    const v = await dialog({ title: 'Convert tacho signal to RPM', fields: [{ key: 'ppr', label: 'Pulses per revolution', type: 'number', value: 1, min: 1, step: 1 }, { key: 'rpm', label: 'Show result as RPM (otherwise Hz)', type: 'check', value: true }] });
    if (v) APP.derive(w, 'tacho', { rotationsPerPulse: 1 / v.ppr, asRpm: v.rpm });
  }
  async function bankDialog() {
    const w = need('time');
    const v = await dialog({ title: 'Custom filter bank plot', intro: 'One band per line as "from;to" in Hz (the format of .flb filter-bank files).', fields: [
      { key: 'preset', label: 'Start from', type: 'select', options: [['', 'Text below'], ['oct', 'Octave bank (10 bands, 22 Hz – 22.7 kHz)']], value: 'oct' },
      { key: 'text', label: 'Bands', type: 'textarea', rows: 8, wide: true, value: BANKS['Octave (10 bands)'].map(b => b.join(';')).join('\n') },
      { key: 'weighting', label: 'Weighting', type: 'select', options: [['', 'Z (none)'], ['A', 'A-weighting'], ['C', 'C-weighting']], value: '' },
      { key: 'name', label: 'Name', type: 'text', value: 'custom bank' }] });
    if (v) APP.derive(w, 'filterbank', { bands: BANKS.parse(v.text), name: v.name, weighting: v.weighting || null });
  }
  async function pickWindows(title, intro, min, filter) {
    const w = need(), cands = [...S.wins.values()].filter(o => o !== w && (filter ? filter(o) : o.kind === '1d' && o.data && o.data.y));
    if (cands.length < min) throw new Error(`Needs at least ${min + 1} suitable windows; open more signals first.`);
    const v = await dialog({ title, intro: (intro ? intro + '\n' : '') + `First window: ${w.label} – ${w.title}`, fields: cands.map((o, i) => ({ key: 'w' + i, label: `${o.label} – ${o.title}`, type: 'check', value: i < min })) });
    if (!v) return null;
    const sel = cands.filter((o, i) => v['w' + i]);
    if (sel.length < min) throw new Error(`Select at least ${min} more window(s)`);
    return [w].concat(sel);
  }
  async function alignDialog() {
    const ws = await pickWindows('Align signals (sync)', 'Measures the delay of each selected window relative to the first one by cross-correlation.', 1); if (!ws) return;
    APP.createWindow({ kind: 'display', title: 'Align signals', op: { type: 'align', params: {} }, parents: ws.map(x => x.id) });
  }
  async function speechToText() {
    const w = need('time'), d = APP.visibleData(w);
    if (!AI.configured) throw new Error('Configure an OpenAI-compatible provider in AI signal report ▸ Settings first.');
    let y = d.y, fs = 1 / d.dx; if (fs !== 16000) { y = DSP.resample(y, fs, 16000); fs = 16000; }
    toast('Transcribing ' + fmt(y.length / fs) + ' s of audio…');
    const text = await AI.transcribe(IO.encodeWav([y], fs, 'int16'));
    APP.createWindow({ kind: 'display', title: 'Speech-to-text – ' + w.title, data: { text: text || '(no speech recognised)' }, source: { type: 'copy' } });
  }

  /* ======================= Instruments ======================= */
  async function harmonicMarker() {
    const w = need('1d');
    let f0 = w.fixedCursor;
    if (f0 == null) { const s = DSP.stats(APP.visibleData(w).y), d = w.data; f0 = d.x ? d.x[s.imax] : d.x0 + s.imax * d.dx; }
    const v = await dialog({ title: 'Marker with harmonics', fields: [
      { key: 'on', label: 'Show harmonic markers', type: 'check', value: true },
      { key: 'f', label: 'Fundamental (' + (w.data.xUnit || 'x') + ')', type: 'number', value: +Number(f0).toPrecision(6) },
      { key: 'n', label: 'Number of harmonics', type: 'number', value: 10, min: 1, max: 50, step: 1 }] });
    if (!v) return;
    w.display.harmonics = v.on ? { f: v.f, n: Math.round(v.n) } : null; APP.requestRender(w);
  }
  async function sum3dDialog() {
    const w = need('3d'), d = w.data;
    const v = await dialog({ title: 'Sum 3D over frequency range', intro: 'Level (energy sum) of a frequency band over time.', fields: [
      { key: 'f1', label: 'From (Hz)', type: 'number', value: +(w.view.y0).toPrecision(4) }, { key: 'f2', label: 'To (Hz)', type: 'number', value: +(Math.min(w.view.y1, d.fMax)).toPrecision(4) }],
      validate: v => v.f2 > v.f1 ? null : '"To" must be larger than "From"' });
    if (v) APP.derive(w, 'sum3d', v);
  }

  /* ======================= 3D tools ======================= */
  async function trackDialog() {
    const w = need('3d');
    const v = await dialog({ title: 'Track changes in 3D graphics', intro: 'Follows the frequency of the maximum inside the band over time.', fields: [
      { key: 'f1', label: 'From (Hz)', type: 'number', value: +(w.view.y0).toPrecision(4) }, { key: 'f2', label: 'To (Hz)', type: 'number', value: +(w.view.y1).toPrecision(4) }],
      validate: v => v.f2 > v.f1 ? null : '"To" must be larger than "From"' });
    if (v) APP.derive(w, 'track3d', v);
  }
  async function filter3dDialog() {
    const w = need('3d');
    const v = await dialog({ title: '3D filter', intro: 'Changes the level of a time × frequency region (e.g. −100 dB removes it).', fields: [
      { key: 'f1', label: 'Frequency from (Hz)', type: 'number', value: +(w.view.y0).toPrecision(4) }, { key: 'f2', label: 'Frequency to (Hz)', type: 'number', value: +(w.view.y1).toPrecision(4) },
      { key: 't1', label: 'Time from (s)', type: 'number', value: +(w.view.x0).toPrecision(5) }, { key: 't2', label: 'Time to (s)', type: 'number', value: +(w.view.x1).toPrecision(5) },
      { key: 'db', label: 'Signal level change (dB)', type: 'number', value: -60 }] });
    if (v) APP.derive(w, 'filter3d', v);
  }
  async function tfftStatsDialog() {
    const w = need('3d');
    const v = await dialog({ title: 'Time FFT statistics', fields: [
      { key: 't1', label: 'From (s)', type: 'number', value: +(w.view.x0).toPrecision(5) }, { key: 't2', label: 'To (s)', type: 'number', value: +(w.view.x1).toPrecision(5) },
      { key: 'stat', label: 'Statistic per frequency', type: 'select', options: [['mean', 'Mean (energy average)'], ['max', 'Maximum (peak hold)'], ['min', 'Minimum'], ['std', 'Standard deviation (dB)']], value: 'mean' }] });
    if (v) APP.derive(w, 'tfftstats', v);
  }
  function zoom3d(f) {
    const w = need('3d'), v = w.view, cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    v.y0 = Math.max(w.data.fMin || 0, cy - (cy - v.y0) * f); v.y1 = Math.min(w.data.fMax, cy + (v.y1 - cy) * f);
    APP.setViewX(w, cx - (cx - v.x0) * f, cx + (v.x1 - cx) * f);
  }

  /* ======================= Scripts & custom displays ======================= */
  const SCRIPT_KINDS = { script: 'New signal window', scriptdisplay: 'New custom display window', scriptsource: 'New signal source window', scriptinst: 'New instrument window', scriptinstsource: 'New instrument source window' };
  async function newScript(type) {
    const isSrc = type === 'scriptsource' || type === 'scriptinstsource';
    let parents = [];
    if (!isSrc) {
      const cands = [...S.wins.values()].filter(o => o.data);
      if (!cands.length) throw new Error('Open a window to use as input first.');
      const v = await dialog({ title: SCRIPT_KINDS[type] + ' – inputs', fields: cands.map((o, i) => ({ key: 'w' + i, label: `${o.label} – ${o.title}`, type: 'check', value: o === S.active })) });
      if (!v) return;
      parents = cands.filter((o, i) => v['w' + i]).map(o => o.id);
    }
    const code = await editCode(SCRIPTING.TEMPLATES[type], SCRIPT_KINDS[type]);
    if (code == null) return;
    const kind = OPS[type].kind;
    APP.createWindow({ kind, title: OPS[type].label({}), op: { type, params: { code, values: {} } }, parents });
  }
  async function editCode(code, title) {
    let current = code;
    const v = await dialog({ title: 'Script editor – ' + title, intro: 'JavaScript. DSP, PLOT, IO and EXPR are available. Tab inserts two spaces.', fields: [{ key: 'code', label: 'Script', type: 'textarea', rows: 26, wide: true, value: code }], ok: 'Apply',
      extra: [
        { label: 'Load .js…', run: (v, inp) => { const i = h('input', { type: 'file', accept: '.js,.txt' }); i.onchange = async () => { if (i.files[0]) inp.code.value = await i.files[0].text(); }; i.click(); } },
        { label: 'Save .js…', run: v => download('script.js', v.code, 'text/javascript') },
        { label: 'Check syntax', run: v => { try { SCRIPTING.compile(v.code); toast('No syntax errors'); } catch (e) { toast(e.message, 'err'); } } }],
      validate: v => { try { SCRIPTING.compile(v.code); return null; } catch (e) { return 'Script error: ' + e.message; } } });
    if (!v) return null;
    current = v.code; return current;
  }
  // Tab key in the script editor
  document.addEventListener('keydown', e => {
    if (e.key === 'Tab' && e.target.tagName === 'TEXTAREA' && e.target.closest('dialog') && e.target.rows >= 20) {
      e.preventDefault(); const t = e.target, s = t.selectionStart; t.setRangeText('  ', s, t.selectionEnd, 'end');
    }
  });
  async function editScript(w) {
    w = w || need();
    if (!w.op || !OPS[w.op.type].script) throw new Error('Select a script window first (Scripts ▸ New … window).');
    const code = await editCode(w.op.params.code, w.title); if (code == null) return;
    w.op.params.code = code; w.state.script = null; APP.queueCompute(w);
  }
  async function scriptParams(w) {
    const api = SCRIPTING.instance(w, w.op.params.code), defs = api.parameters || {};
    if (!Object.keys(defs).length) return editScript(w);
    const vals = SCRIPTING.paramsOf(api, w.op.params);
    const v = await dialog({ title: 'Script parameters – ' + w.label, fields: Object.entries(defs).map(([k, d]) => {
      const opts = d && typeof d === 'object' && d.options, val = vals[k];
      return opts ? { key: k, label: k, type: 'select', options: opts, value: val } : typeof val === 'boolean' ? { key: k, label: k, type: 'check', value: val } : typeof val === 'number' ? { key: k, label: k, type: 'number', value: val } : { key: k, label: k, type: 'text', value: val };
    }), extra: [{ label: 'Edit script…', run: () => editScript(w) }], ok: 'Apply' });
    if (!v) return; w.op.params.values = v; APP.queueCompute(w);
  }
  function openConsole() { APP.createWindow({ kind: 'display', title: 'JavaScript console', data: { dom: SCRIPTING.consoleElement(), note: 'Console' }, source: { type: 'console' } }); }
  async function chartDialog(type) {
    const C = CHARTS[type], w = need();
    if (C.needs3D) { if (w.kind !== '3d') throw new Error('Select a spectrogram / time FFT window first.'); return APP.createWindow({ kind: 'display', title: C.label, op: { type: 'chart', params: { type, levels: 8 } }, parents: [w.id] }); }
    if (w.kind !== '1d') throw new Error('Select a signal window first.');
    let ws;
    if (Array.isArray(C.roles) && C.roles.length === 1) ws = [w];
    else if (Array.isArray(C.roles)) {
      const cands = [...S.wins.values()].filter(o => o.kind === '1d' && o.data && o.data.y);
      const v = await dialog({ title: C.label, fields: C.roles.map((r, i) => ({ key: 'r' + i, label: r, type: 'select', options: cands.map(o => [o.id, `${o.label} – ${o.title}`]), value: (cands[i] || cands[0]).id === w.id || i ? (cands[i] || cands[0]).id : w.id })) });
      if (!v) return; ws = C.roles.map((r, i) => S.wins.get(+v['r' + i]));
    } else { ws = await pickWindows(C.label, 'Select the windows to compare.', 1); if (!ws) return; }
    APP.createWindow({ kind: 'display', title: C.label, op: { type: 'chart', params: { type } }, parents: ws.map(o => o.id) });
  }

  /* ======================= AI signal report ======================= */
  function metricsOf(w) {
    const d = APP.visibleData(w);
    if (!d || !d.y || d.x || d.xUnit !== 's') throw new Error('Select a time-signal window first.');
    return { metrics: SIGMETRICS.compute(d), info: `${w.title} (window ${w.label}), ${d.y.length} samples at ${fmt(1 / d.dx)} Hz${w.autoX ? '' : `, visible part ${fmt(w.view.x0)}–${fmt(w.view.x1)} s`}` };
  }
  async function aiReport(modeId) {
    const w = need('time'), { metrics, info } = metricsOf(w);
    if (!AI.configured) { await aiSettings(); if (!AI.configured) return; }
    const mode = AI.MODES.find(m => m.id === modeId);
    const v = await dialog({ title: 'AI signal report – ' + mode.label, intro: `Sends the computed metrics of ${w.label} (not the samples) to ${AI.settings.provider === 'anthropic' ? 'Anthropic' : AI.settings.baseUrl || 'OpenAI'} using model ${AI.settings.model}.`,
      fields: [{ key: 'notes', label: 'Add any additional information about the signal (optional)', type: 'textarea', rows: 4, wide: true, value: '' }], ok: 'Proceed with AI signal report »' });
    if (!v) return;
    const p = AI.prompt(modeId, metrics, info, v.notes);
    const rw = APP.createWindow({ kind: 'display', title: `AI report – ${mode.label} – ${w.title}`, data: { text: 'Generating report…' }, source: { type: 'copy' }, parents: [] });
    try {
      const r = await AI.complete(p.system, p.user);
      rw.data = { text: r.text + (r.truncated ? '\n\n[Report was cut off at the length limit.]' : ''), note: 'model ' + (r.model || AI.settings.model) };
    } catch (e) { rw.data = { text: 'The report could not be generated:\n\n' + e.message }; }
    APP.afterData(rw);
  }
  async function aiSettings() {
    const s = AI.settings;
    const v = await dialog({ title: 'AI signal report settings', intro: 'The API key is stored only on this computer (in the app\'s local storage). Requests send computed signal metrics, never raw samples.', fields: [
      { type: 'section', label: 'LLM configuration' },
      { key: 'provider', label: 'Provider', type: 'select', options: [['anthropic', 'Anthropic (Claude)'], ['openai', 'OpenAI-compatible (chat completions)']], value: s.provider },
      { key: 'apiKey', label: 'API key', type: 'text', value: s.apiKey },
      { key: 'model', label: 'Model', type: 'text', value: s.model, hint: 'e.g. claude-opus-5-5' },
      { key: 'baseUrl', label: 'Base URL (optional)', type: 'text', value: s.baseUrl, hint: 'empty = provider default' },
      { key: 'effort', label: 'Effort (Claude)', type: 'select', options: ['low', 'medium', 'high', 'xhigh', 'max'], value: s.effort, show: v => v.provider === 'anthropic' },
      { key: 'transcribeModel', label: 'Speech-to-text model', type: 'text', value: s.transcribeModel, show: v => v.provider !== 'anthropic' }],
      extra: [{ label: 'Test connection', run: async v => { const keep = Object.assign({}, AI.settings); Object.assign(AI.settings, v); try { toast('Connection OK: ' + await AI.test()); } catch (e) { toast(e.message, 'err'); } finally { Object.assign(AI.settings, keep); } } }] });
    if (!v) return;
    if (v.provider === 'anthropic' && (!v.model || /^gpt/i.test(v.model))) v.model = 'claude-opus-5-5';
    Object.assign(AI.settings, v); AI.save(); toast('AI settings saved');
  }

  /* ======================= Custom tools: library and toolbar T1–T5 ======================= */
  const withFft = (w, extra) => w.data.xUnit === 'Hz' ? w : APP.derive(w, 'fft', Object.assign({}, S.settings.spectral, { type: 'Magnitude', dB: false }, extra || {}));
  const LIBRARY = {
    'Align Signals (Sync)': alignDialog,
    'Bode and Polar plot': () => chartDialog('bodepolar'), 'Box Plot': () => chartDialog('box'), 'Box plus Violin Plot': () => chartDialog('boxviolin'), 'Violin plot': () => chartDialog('violin'),
    'Cepstrum': () => APP.derive(need('uniform'), 'cepstrum', {}), 'Continuous Wavelet Transform (CWT)': cwtDialog, 'Convert Tacho-Signal to RPM': tachoDialog,
    'Corner Plot': () => chartDialog('corner'), 'Correlation plot': () => chartDialog('correlation'),
    'Damping factor': () => { const w = need('uniform'); APP.derive(withFft(w, { window: 'Rectangle' }), 'instrument', { instrument: 'Damping factor' }); },
    'Envelope (Hilbert transform)': () => APP.derive(need('uniform'), 'envelope', {}), 'Envelope (localmax method)': () => APP.derive(need('uniform'), 'envmax', {}),
    'FFT normalized and smoothed': () => { const f = APP.derive(need('uniform'), 'fft', Object.assign({}, S.settings.spectral, { dB: false, smooth: 9 })); APP.derive(f, 'scale', { mode: 'range', a: 0, b: 1 }); },
    'FFT smoothed': () => APP.derive(need('uniform'), 'fft', Object.assign({}, S.settings.spectral, { smooth: 9 })),
    'FFT with 3D and max marker': () => { const w = need('uniform'), f = APP.derive(w, 'fft', Object.assign({}, S.settings.spectral)); APP.derive(f, 'instrument', { instrument: 'Maximum' }); APP.derive(w, 'spectrogram', Object.assign({}, S.settings.spectrogram, { mesh: true }), { display: { mode: 'mesh' } }); },
    'FFT with averaging': () => APP.derive(need('uniform'), 'fft', Object.assign({}, S.settings.spectral, { averageSegments: true, segmentCount: 16 })),
    'FFT with max marker and max tracking': () => { const w = need('uniform'), f = APP.derive(w, 'fft', Object.assign({}, S.settings.spectral)); APP.derive(f, 'instrument', { instrument: 'Maximum' }); const sg = APP.derive(w, 'spectrogram', Object.assign({}, S.settings.spectrogram)); APP.derive(sg, 'track3d', { f1: 0, f2: 0.5 / w.data.dx }); },
    'FFT with max marker': () => { const f = APP.derive(need('uniform'), 'fft', Object.assign({}, S.settings.spectral)); APP.derive(f, 'instrument', { instrument: 'Maximum' }); },
    'Harmonics Instruments': () => { const f = APP.derive(need('uniform'), 'fft', Object.assign({}, S.settings.spectral, { dB: false, window: 'Flat top' })); APP.derive(f, 'instrument', { instrument: 'Maximum position (interpolated)' }); for (let k = 2; k <= 5; k++) APP.derive(f, 'instrument', { instrument: `Amplitude at ${k}x max. frequency` }); },
    'Instantenous Frequency (Hilbert transform)': () => APP.derive(need('time'), 'instfreq', {}),
    'Network Receiver': () => root.IOX.networkReceiver(), 'Network Sender': () => root.IOX.networkSender(),
    'Orbit plot': () => chartDialog('orbit'), 'Polar plot': () => chartDialog('polar'),
    'RealAndImagFFT': () => { const w = need('uniform'); APP.derive(w, 'fft', Object.assign({}, S.settings.spectral, { type: 'Real part', dB: false })); APP.derive(w, 'fft', Object.assign({}, S.settings.spectral, { type: 'Imaginary part', dB: false })); },
    'Scatter plot 2D plus color vector': () => chartDialog('scatterc'), 'Scatter plot 2D': () => chartDialog('scatter'), 'Scatter plot 3D': () => chartDialog('scatter3d'),
    'Serial input': () => root.IOX.serialInput(), 'Serial output': () => root.IOX.serialOutput(),
    'ShannonEntropy': () => APP.derive(need('1d'), 'instrument', { instrument: 'Shannon entropy' }),
    'Signal Report': () => APP.derive(need('uniform'), 'report', {}),
    'Spectrogram Contour plot': () => { const sg = APP.derive(need('uniform'), 'spectrogram', Object.assign({}, S.settings.spectrogram)); setTimeout(() => { APP.activate(sg); guard(() => chartDialog('contour'))(); }, 300); },
    'Speech-To-Text': speechToText,
    'Wavelet Denoising': waveletDialog,
    'Welchs Periodogram': () => APP.derive(need('uniform'), 'fft', Object.assign({}, S.settings.spectral, { type: 'Power spectral density (PSD)', dB: true, averageSegments: true, segmentCount: 8, segmentOverlap: 50, window: 'Hann' })),
    'Zero-crossing': () => APP.derive(need('uniform'), 'zerocross', {})
  };
  const tbSlots = {
    get() { try { return JSON.parse(localStorage.getItem('opensig.toolbar') || '[null,null,null,null,null]'); } catch (e) { return [null, null, null, null, null]; } },
    set(v) { try { localStorage.setItem('opensig.toolbar', JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };
  function runSlot(i) {
    const s = tbSlots.get()[i]; if (!s) return toolbarEditor();
    if (s.lib) return LIBRARY[s.lib]();
    if (s.user) { const t = USER_TOOLS.list.find(u => u.name === s.user); if (!t) throw new Error(`Custom tool "${s.user}" not found`); return useUserTool(t); }
    const n = APP.applyTool(need(), s.tool); toast(`T${i + 1}: ${s.name} (${n} windows)`);
  }
  async function toolbarEditor() {
    const slots = tbSlots.get(), opts = [['', '(empty)']].concat(Object.keys(LIBRARY).map(k => ['lib:' + k, 'Built-in: ' + k]), USER_TOOLS.list.map(t => ['user:' + t.name, 'Saved: ' + t.name]));
    slots.forEach((s, i) => { if (s && s.tool) opts.push(['slot:' + i, `File: ${s.name}`]); });
    const v = await dialog({ title: 'Custom tools toolbar editor', intro: 'Assign tools to the toolbar buttons T1–T5. "Load .ost…" assigns a saved custom-tool file to a button.', fields: slots.map((s, i) => ({ key: 's' + i, label: `Custom tool ${i + 1} (T${i + 1})`, type: 'select', options: opts, value: !s ? '' : s.lib ? 'lib:' + s.lib : s.user ? 'user:' + s.user : 'slot:' + i })),
      extra: [1, 2, 3, 4, 5].map(n => ({ label: `Load .ost → T${n}`, run: () => { const inp = h('input', { type: 'file', accept: '.ost,.json' }); inp.onchange = async () => { const f = inp.files[0]; if (!f) return; const t = JSON.parse(await f.text()); const sl = tbSlots.get(); sl[n - 1] = { name: t.name || f.name, tool: t }; tbSlots.set(sl); toast(`T${n} = ${t.name || f.name}`); }; inp.click(); } })) });
    if (!v) return;
    const old = tbSlots.get(), next = slots.map((s, i) => { const val = v['s' + i]; if (!val) return null; if (val.startsWith('lib:')) return { lib: val.slice(4), name: val.slice(4) }; if (val.startsWith('user:')) return { user: val.slice(5), name: val.slice(5) }; return old[+val.slice(5)]; });
    tbSlots.set(next); toast('Toolbar updated');
  }
  for (let i = 0; i < 5; i++) UI.TOOLBAR[1].push(...(i === 0 ? ['|'] : []), { icon: `<span class="tb-txt" style="color:#0a6">T${i + 1}</span>`, title: `Custom tool ${i + 1}`, item: () => ({ run: () => runSlot(i), en: () => true }), run: () => runSlot(i) });

  /* ======================= Use custom tool: grouped menu of built-in and saved tools ======================= */
  // Groups (ToolCategory, as in .swt tool files); tools without a group are listed directly in the menu.
  const LIB_GROUP = {
    'FFT normalized and smoothed': 'FFT variants', 'FFT smoothed': 'FFT variants', 'FFT with 3D and max marker': 'FFT variants', 'FFT with averaging': 'FFT variants',
    'FFT with max marker': 'FFT variants', 'FFT with max marker and max tracking': 'FFT variants', 'RealAndImagFFT': 'FFT variants',
    'Network Receiver': 'Network', 'Network Sender': 'Network', 'Serial input': 'Serial', 'Serial output': 'Serial',
    'Continuous Wavelet Transform (CWT)': 'Wavelets', 'Wavelet Denoising': 'Wavelets'
  };
  for (const k of ['Bode and Polar plot', 'Box Plot', 'Box plus Violin Plot', 'Corner Plot', 'Correlation plot', 'Orbit plot', 'Polar plot', 'Scatter plot 2D',
    'Scatter plot 2D plus color vector', 'Scatter plot 3D', 'Spectrogram Contour plot', 'Violin plot']) LIB_GROUP[k] = 'Plots';

  // Saved tools: .ost files in Documents\OpenSig\Tools (desktop app) or this browser's storage
  const USER_TOOLS = { list: [], folder: null };
  async function refreshUserTools() {
    try {
      if (HOST.available) {
        USER_TOOLS.folder = USER_TOOLS.folder || await HOST.call('toolsFolder');
        const out = [];
        for (const p of await HOST.listFiles(USER_TOOLS.folder, '*.ost')) {
          try {
            const t = JSON.parse(new TextDecoder().decode((await HOST.readFile(p)).buffer));
            if (Array.isArray(t.nodes)) out.push({ name: p.replace(/^.*[\\/]/, '').replace(/\.ost$/i, ''), category: t.category || '', tool: t, path: p });
          } catch (e) { console.warn('Skipping custom tool ' + p, e); }
        }
        USER_TOOLS.list = out;
      } else USER_TOOLS.list = JSON.parse(localStorage.getItem('opensig.tools') || '[]');
    } catch (e) { console.warn(e); }
  }
  refreshUserTools();
  function useUserTool(t) { const n = APP.applyTool(need(), t.tool); toast(`Applied "${t.name}" (${n} window${n === 1 ? '' : 's'})`); }

  function customToolItems() {
    refreshUserTools(); // picks up files added to the folder for the next time the menu opens
    const groups = new Map(), top = [], byLabel = (a, b) => a.label.localeCompare(b.label);
    const add = (group, item) => { if (!group) top.push(item); else { if (!groups.has(group)) groups.set(group, []); groups.get(group).push(item); } };
    for (const k of Object.keys(LIBRARY)) add(LIB_GROUP[k], { label: k, en: () => !!S.active, run: () => LIBRARY[k]() });
    for (const t of USER_TOOLS.list) add(t.category, { label: t.name, en: () => !!S.active, run: () => useUserTool(t) });
    return [{ label: 'From file…', en: () => !!S.active, run: () => UI.pickFiles('.ost,.json,.swt', 'tool') }, '-',
      ...[...groups.keys()].sort().map(g => ({ label: g, sub: groups.get(g).sort(byLabel) })), ...top.sort(byLabel), '-',
      HOST.available ? { label: 'Open custom tools folder', run: () => HOST.call('openToolsFolder') } : { label: 'Delete saved custom tools…', en: () => USER_TOOLS.list.length > 0, run: deleteToolsDialog }];
  }

  // File / Save window as custom tool: Window only, Window and its subtree, Subtree only
  async function saveToolDialog(mode) {
    const w = need(), tool = APP.toolFromWindow(w, mode);
    const where = HOST.available ? `Saved in ${USER_TOOLS.folder || 'Documents\\OpenSig\\Tools'}` : 'Saved in this browser';
    const v = await dialog({ title: 'Save window as custom tool', intro: `${where}; it then appears under Signal tools ▸ Use custom tool and can be put on the T1–T5 toolbar buttons.`, fields: [
      { key: 'name', label: 'Tool name', type: 'text', value: safeName(w.title + (mode === false ? ' tools' : '')) },
      { key: 'category', label: 'Group in the menu (optional)', type: 'text', value: '', hint: 'e.g. "FFT variants"' },
      ...(HOST.available ? [] : [{ key: 'dl', label: 'Also download it as an .ost file', type: 'check', value: false }])],
      validate: v => !v.name.trim() ? 'Enter a name' : null });
    if (!v) return;
    const name = safeName(v.name.trim()), body = Object.assign(tool, { name, category: v.category.trim() });
    await refreshUserTools();
    if (USER_TOOLS.list.some(t => t.name.toLowerCase() === name.toLowerCase()) && !await UI.confirmBox('Replace custom tool', `A custom tool named "${name}" already exists. Replace it?`)) return;
    if (HOST.available) await HOST.writeText(USER_TOOLS.folder + '\\' + name + '.ost', JSON.stringify(body));
    else {
      const list = USER_TOOLS.list.filter(t => t.name.toLowerCase() !== name.toLowerCase()).concat([{ name, category: body.category, tool: body }]);
      localStorage.setItem('opensig.tools', JSON.stringify(list));
      if (v.dl) download(name + '.ost', JSON.stringify(body), 'application/json');
    }
    await refreshUserTools();
    toast(`Custom tool "${name}" saved (${tool.nodes.length} window${tool.nodes.length === 1 ? '' : 's'})`);
  }
  async function deleteToolsDialog() {
    const v = await dialog({ title: 'Delete saved custom tools', fields: USER_TOOLS.list.map((t, i) => ({ key: 't' + i, label: t.name + (t.category ? `  (${t.category})` : ''), type: 'check', value: false })), ok: 'Delete' });
    if (!v) return;
    const keep = USER_TOOLS.list.filter((t, i) => !v['t' + i]);
    localStorage.setItem('opensig.tools', JSON.stringify(keep)); await refreshUserTools();
    toast('Custom tools updated');
  }

  /* ======================= Harmonic and sideband cursors (window context menu) ======================= */
  const has1DCursor = () => has1D();
  function toggleHarmonic() {
    const w = need('1d'), on = w.display.cursorMode !== 'harmonic';
    w.display.cursorMode = on ? 'harmonic' : null; if (!on) w.display.cursorPin = null; APP.requestRender(w);
    if (on) toast('Harmonic cursor on – Enter pins it at the mouse position, Shift+Enter on the nearest peak (Esc releases); hold SPACE for the values');
  }
  async function sidebandOffsetDialog(w) {
    const def = w.display.sideband > 0 ? w.display.sideband : +PLOT.fmt((w.view.x1 - w.view.x0) / 20, (w.view.x1 - w.view.x0) / 20);
    const v = await dialog({ title: 'Sideband cursor', fields: [{ key: 'off', label: 'Sideband cursor offset' + (w.data.xUnit ? ` (${w.data.xUnit})` : ''), type: 'number', value: def, min: 0 }],
      validate: v => !(v.off > 0) ? 'Enter an offset greater than 0' : null });
    if (!v) return false;
    w.display.sideband = v.off; return true;
  }
  async function toggleSideband() {
    const w = need('1d');
    if (w.display.cursorMode === 'sideband') { w.display.cursorMode = null; w.display.cursorPin = null; APP.requestRender(w); return; }
    // with a selection, its width becomes the offset without asking
    if (w.selection && Math.abs(w.selection.b - w.selection.a) > 0) w.display.sideband = Math.abs(w.selection.b - w.selection.a);
    else if (!await sidebandOffsetDialog(w)) return;
    w.display.cursorMode = 'sideband'; APP.requestRender(w);
    toast('Sideband cursor on – Enter pins it (Esc releases); hold SPACE for the values; SPACE + mouse wheel changes the offset');
  }
  // Enter pins the harmonic / sideband cursor of the window under the mouse at the mouse position, Enter again re-pins
  // there, Esc (or Enter with the mouse outside the graph) releases it
  const pinned = () => has1D() && S.active.display.cursorMode && S.active.display.cursorPin != null;
  function pinKey(e) {
    if ((e.key !== 'Enter' && e.key !== 'Escape') || e.ctrlKey || e.altKey || e.metaKey || typingIn(e)) return;
    const hovered = [...S.wins.values()].filter(o => o.kind === '1d' && o.display.cursorMode && o.cursor && o.cursor.x != null);
    const w = hovered.includes(S.active) ? S.active : hovered[0] || (S.active && S.active.kind === '1d' && S.active.display.cursorMode ? S.active : null);
    if (!w) return;
    if (e.key === 'Enter' && w.cursor && w.cursor.x != null) {
      let x = w.cursor.x;
      if (e.shiftKey && w.lay && w.data && w.data.y) { // Shift+Enter: on the highest value within 8 pixels of the mouse
        const d = w.data, px = w.lay.ax.toPx(x), a = APP.valueAt(d, w.lay.ax.fromPx(px - 8)), b = APP.valueAt(d, w.lay.ax.fromPx(px + 8));
        if (a && b) { let best = a.i; for (let i = a.i; i <= b.i; i++) if (d.y[i] > d.y[best]) best = i; x = d.x ? d.x[best] : d.x0 + best * d.dx; }
      }
      w.display.cursorPin = x;
    } else if (w.display.cursorPin != null) w.display.cursorPin = null;
    else return;
    e.preventDefault(); e.stopPropagation(); APP.activate(w); APP.requestRender(w);
  }
  document.addEventListener('keydown', pinKey);
  const cursorMenuItems = () => [
    { label: 'Harmonic cursor', en: has1DCursor, checked: () => has1D() && S.active.display.cursorMode === 'harmonic', run: toggleHarmonic },
    { label: 'Sideband cursor', en: has1DCursor, checked: () => has1D() && S.active.display.cursorMode === 'sideband', run: toggleSideband },
    { get label() { const w = S.active; return 'Sideband cursor offset…  [' + (w && w.display && w.display.sideband > 0 ? fmt(w.display.sideband) : 'undefined') + ']'; },
      en: has1DCursor, run: async () => { const w = need('1d'); if (await sidebandOffsetDialog(w)) APP.requestRender(w); } },
    { label: 'Release pinned cursor', key: 'Esc', en: pinned, run: () => { const w = need('1d'); w.display.cursorPin = null; APP.requestRender(w); } },
    { label: 'Show values of the pinned cursor', en: () => has1D() && !!S.active.display.cursorMode, checked: () => has1D() && S.active.display.pinLabels === true,
      run: () => { const w = need('1d'); w.display.pinLabels = w.display.pinLabels !== true; APP.requestRender(w); } }];
  // SPACE held: labels on every harmonic / sideband cursor
  const typingIn = e => e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable], dialog');
  const redrawCursors = () => S.wins.forEach(o => { if (o.display && o.display.cursorMode) APP.requestRender(o); });
  document.addEventListener('keydown', e => {
    if (e.key !== ' ' || typingIn(e) || !S.active || S.active.kind !== '1d' || !S.active.display.cursorMode) return;
    e.preventDefault(); if (!S.spaceDown) { S.spaceDown = true; redrawCursors(); }
  });
  document.addEventListener('keyup', e => { if (e.key === ' ' && S.spaceDown) { e.preventDefault(); S.spaceDown = false; redrawCursors(); } });
  window.addEventListener('blur', () => { if (S.spaceDown) { S.spaceDown = false; redrawCursors(); } });

  /* ======================= Advanced settings ======================= */
  const numFmt = (v, f) => f.mode === 'dec' ? v.toFixed(f.digits) : f.mode === 'sci' ? v.toExponential(f.digits) : String(Number(v.toPrecision(f.digits)));
  IO.fmtNum = v => !isFinite(v) ? String(v) : numFmt(v, S.settings.numFormat || { mode: 'sig', digits: 7 });
  root.NUMFMT = (v, which) => numFmt(v, (which === 'inst' ? S.settings.instFormat : S.settings.numFormat) || { mode: 'sig', digits: 6 });
  async function advancedSettings() {
    const s = S.settings; let outs = [];
    try { outs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput'); } catch (e) { /* none */ }
    const fmtOpts = [['sig', 'Significant digits (keeps precision at any scale)'], ['dec', 'Decimal places'], ['sci', 'Scientific notation']];
    const v = await dialog({ title: 'Application settings – advanced', fields: [
      { type: 'section', label: 'Workspace' },
      { key: 'restoreLast', label: 'Save the workspace tabs before closing and open them again at the next start', type: 'check', value: s.restoreLast },
      { key: 'autosaveMin', label: 'Automatically save workspace every … minutes (0 = off; for crash recovery)', type: 'number', value: s.autosaveMin, min: 0, step: 1 },
      { type: 'section', label: 'Display' },
      { key: 'fontSize', label: 'Font size for all plots (px)', type: 'number', value: s.fontSize, min: 8, max: 20, step: 1 },
      { key: 'numPeaks', label: 'Number of peaks for "Show N highest peaks"', type: 'number', value: s.numPeaks, min: 1, max: 50, step: 1 },
      { key: 'bandMarkers', label: 'Show frequency band markers in octave / filter bank plots', type: 'check', value: s.bandMarkers },
      { type: 'section', label: 'Files' },
      { key: 'wavChunk', label: 'Save display settings into a custom chunk in WAV files', type: 'check', value: s.wavChunk },
      { key: 'wavFileDate', label: 'Use file date/time as signal time when opening audio files', type: 'check', value: s.wavFileDate },
      { key: 'numMode', label: 'Number format for ASCII export / clipboard', type: 'select', options: fmtOpts, value: (s.numFormat || {}).mode || 'sig' },
      { key: 'numDigits', label: 'Precision (digits)', type: 'number', value: (s.numFormat || {}).digits || 7, min: 1, max: 17, step: 1 },
      { type: 'section', label: 'Instruments' },
      { key: 'instMode', label: 'Number format for instrument values', type: 'select', options: fmtOpts, value: (s.instFormat || {}).mode || 'sig' },
      { key: 'instDigits', label: 'Precision (digits)', type: 'number', value: (s.instFormat || {}).digits || 6, min: 1, max: 17, step: 1 },
      { type: 'section', label: 'Audio' },
      { key: 'audioOut', label: 'Use this audio device for playback', type: 'select', options: [['', 'System default']].concat(outs.map((d, i) => [d.deviceId, d.label || 'Output ' + (i + 1)])), value: s.audioOut }] });
    if (!v) return;
    Object.assign(s, { restoreLast: v.restoreLast, autosaveMin: Math.max(0, Math.round(v.autosaveMin)), fontSize: Math.round(v.fontSize), numPeaks: Math.round(v.numPeaks), bandMarkers: v.bandMarkers,
      wavChunk: v.wavChunk, wavFileDate: v.wavFileDate, audioOut: v.audioOut, numFormat: { mode: v.numMode, digits: Math.round(v.numDigits) }, instFormat: { mode: v.instMode, digits: Math.round(v.instDigits) } });
    APP.saveSettings(); APP.applyTheme(); root.IOX && root.IOX.scheduleAutosave();
  }
  // WAV export with the display-settings chunk
  const origEncode = IO.encodeWav;
  IO.encodeWavWithMeta = (channels, fs, fmtName, meta) => {
    const base = new Uint8Array(origEncode(channels, fs, fmtName));
    if (!S.settings.wavChunk || !meta) return base.buffer;
    const js = new TextEncoder().encode(JSON.stringify(meta)), pad = js.length & 1, out = new Uint8Array(base.length + 8 + js.length + pad), dv = new DataView(out.buffer);
    out.set(base); out.set([0x6f, 0x73, 0x69, 0x67], base.length); dv.setUint32(base.length + 4, js.length, true); out.set(js, base.length + 8);
    dv.setUint32(4, out.length - 8, true); return out.buffer;
  };

  /* ======================= Help ======================= */
  // the User Manual viewer is help.js; this is the fallback when it is missing
  function helpContents() {
    if (root.HELP) return root.HELP.open(null, 'contents');
    const lines = UI.MENUS.map(m => `${m.label}: ` + m.items.filter(i => i !== '-').map(i => i.label.replace(/…$/, '')).join(' · '));
    return dialog({ title: 'OpenSig – contents', fields: lines.map(l => ({ type: 'info', label: l })), ok: 'Close', cancel: 'Back' });
  }

  /* ======================= FFT settings files (.swt / .sws) ======================= */
  function parseIni(text) {
    const secs = {}; let cur = null;
    for (const raw of text.split(/\r?\n/)) {
      const l = raw.trim(); if (!l || l.startsWith(';')) continue;
      const m = /^\[(.+)\]$/.exec(l); if (m) { cur = secs[m[1]] = {}; continue; }
      if (!cur) continue;
      const i = l.indexOf('='); if (i < 0) cur[l] = ''; else cur[l.slice(0, i)] = l.slice(i + 1);
    }
    return secs;
  }
  async function importSwtFft(text, name) {
    const secs = parseIni(text), ffts = Object.entries(secs).filter(([k, v]) => Object.keys(v).some(x => x.startsWith('FFT_')));
    if (!ffts.length) throw new Error(name + ' contains no FFT settings (FFT_* keys). Script tools (Julia) cannot be imported.');
    const title = ([k, v]) => v.WindowTitle || v.OriginalWindowTitle || k;
    const fftWin = S.active && S.active.op && S.active.op.type === 'fft' ? S.active : null;
    const v = await dialog({ title: 'Import FFT settings', intro: name, fields: [
      ...(ffts.length > 1 ? [{ key: 'sec', label: 'FFT window in the file', type: 'select', options: ffts.map(([k, x], i) => [i, title([k, x])]), value: 0 }] : []),
      { key: 'use', label: 'Use the settings to', type: 'radio', value: has1D() && !fftWin ? 'new' : fftWin ? 'apply' : 'defaults', options: [
        ['new', 'Create an FFT window of the selected signal'], ['apply', 'Change the selected FFT window'], ['defaults', 'Make them the spectral analysis defaults']] }],
      validate: v => v.use === 'new' && !hasU() ? 'Select a signal window first' : v.use === 'apply' && !fftWin ? 'Select an FFT window first' : null });
    if (!v) return;
    const [, kv] = ffts[+(v.sec || 0)], params = DSP.svFromIni(kv);
    if (v.use === 'defaults') { S.settings.spectral = params; APP.saveSettings(); toast('Spectral defaults imported from ' + name); }
    else if (v.use === 'apply') { fftWin.op.params = params; fftWin.state = {}; fftWin.title = OPS.fft.label(params); fftWin.updateTitle(); APP.queueCompute(fftWin); }
    else { const w = APP.derive(need('uniform'), 'fft', params); w.title = UI.baseName(name); w.updateTitle(); }
  }
  function exportSwtFft() {
    const w = need(); if (!w.op || w.op.type !== 'fft') throw new Error('Select an FFT window first.');
    const ini = DSP.svToIni(w.op.params);
    const lines = ['[Root]', 'AppliedTo=22', 'Section=Window_2', '[Window_2]', 'Type=2', 'Linked=1', 'Window_Left=250', 'Window_Right=8748', 'Window_Bottom=7419', 'Window_Top=516', 'Visible=1',
      'OriginalUnits=1', 'XLabel=' + ({ Hz: 'Hz', CPM: 'CPM', kHz: 'KHz', MHz: 'MHz' }[DSP.svSettings(w.op.params).xUnit] || 'Hz'), 'YLabel=', 'FixedMinMax=0', 'LogXAxis=0', 'LogYAxis=0', 'DrawAxes=1', 'SignalType=2', 'DisplayStyle=0']
      .concat(Object.entries(ini).map(([k, v]) => `${k}=${v}`));
    download(safeName(w.title) + '.swt', lines.join('\r\n') + '\r\n', 'text/plain');
  }
  const prevOpeners = root.UI_OPENERS;
  root.UI_OPENERS = async (file, mode) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'swt' || mode === 'swt' || (ext === 'sws' && mode !== 'workspace')) { await importSwtFft(await file.text(), file.name); return true; }
    return prevOpeners(file, mode);
  };

  /* ======================= Menu wiring ======================= */
  addItems('File', 'Signal from clipboard data… (ASCII / CSV)', [
    { label: 'Open data log file…', run: () => UI.pickFiles('.sig,.txt') },
    '-',
    { label: 'Recent signals', get sub() { const r = recent.get().signals; return r.length ? r.map(p => ({ label: p, run: () => openPath(p) })) : [{ label: HOST.available ? '<Empty>' : '<Available in the desktop app>', en: () => false }]; } },
    { label: 'Recent workspaces', get sub() { const r = recent.get().workspaces; return r.length ? r.map(p => ({ label: p, run: () => openPath(p) })) : [{ label: HOST.available ? '<Empty>' : '<Available in the desktop app>', en: () => false }]; } },
    '-',
    { label: 'Replace signal with…', en: () => isSource(S.active) && has1D(), run: () => { replaceTarget = need('1d').id; UI.pickFiles('', 'replace'); } }]);
  addItems('File', 'Save visible signal part as…', [
    '-', { label: 'Save as filter curve…', en: has1D, run: saveFilterCurve },
    { label: 'Import filter curve (.flt) / filter bank (.flb)…', run: () => UI.pickFiles('.flt,.flb') }]);
  addItems('File', 'Load workspace…', [
    { label: 'Save workspace (file references only)…', en: () => HOST.available, run: () => download(UI.wsFileName(), JSON.stringify(APP.serialize(false)), 'application/json') },
    { label: 'Workspace description…', run: () => describe('workspace') },
    '-',
    { label: 'Batch file processing…', run: () => root.IOX.batchDialog() },
    { label: 'Batch file processing script generator…', run: () => root.IOX.scriptGenerator() }]);
  { // File: "Use custom tool" submenu (From file… + tools) and the three ways to save a window as a custom tool
    const file = MENU('File').items, i = file.findIndex(it => it !== '-' && it.label === 'Use custom tool from file…');
    file.splice(i, 1, { label: 'Use custom tool', get sub() { return customToolItems(); } }, { label: 'Custom tools toolbar editor…', run: toolbarEditor });
    file.find(it => it !== '-' && it.label === 'Save window as custom tool').sub = [
      { label: 'Window only…', en: () => S.active && !!S.active.op, run: () => saveToolDialog('only') },
      { label: 'Window and its subtree…', en: () => S.active && !!S.active.op, run: () => saveToolDialog(true) },
      { label: 'Subtree only…', en: () => S.active && S.active.children.size > 0, run: () => saveToolDialog(false) }];
  }
  addItems('Signal tools', 'Copy detected peaks', [{ label: 'Use custom tool', get sub() { return customToolItems(); } }]);
  addItems('File', 'Application settings…', [{ label: 'Application settings – advanced…', run: advancedSettings }]);

  addItems('Edit', 'Save picture as PNG…', [{ label: 'Save picture as Enhanced Metafile (EMF)…', en: () => HOST.available && !!S.active, run: saveEmf }]);
  addItems('Edit', 'Sample rate change (w/o resampling)…', [
    { label: 'Edit signal time…', en: hasTime, run: editSignalTime },
    { label: 'Show absolute time on X-axis', en: hasTime, checked: () => has1D() && !!S.active.display.absTime, run: () => { const w = need('time'); if (w.data.t0abs == null) return editSignalTime(); w.display.absTime = !w.display.absTime; APP.requestRender(w); } },
    { label: 'Edit signal values…', en: () => has1D() && isSource(S.active), run: editSignalValues }]);
  const ds = MENU('Edit').items.find(i => i !== '-' && i.label === 'Display style');
  ds.sub.push('-', ...[['signal', "Line color 'Signal'"], ['analysis', "Line color 'Analysis'"], ['track', "Line color 'Track'"]].map(([t, l]) => ({ label: l, en: has1D, checked: () => has1D() && S.active.display.colorType === t, run: () => { const w = need('1d'); w.display.colorType = t; w.display.color = null; APP.requestRender(w); } })),
    '-', { label: 'Show N highest peaks', en: has1D, checked: () => has1D() && !!S.active.display.showPeaks, run: () => { const w = need('1d'); w.display.showPeaks = !w.display.showPeaks; APP.requestRender(w); } });
  addItems('Edit', 'Persistence display', [
    { label: 'Edit window description…', en: () => !!S.active, run: () => describe('window') }]);

  addItems('Play & navigate', 'Step left / right', [{ label: 'Step change…', key: 'Alt+↑/↓', run: stepChange }]);
  addItems('Play & navigate', 'Adjust volume automatically', [{ label: 'Play automatically if signal changes', en: hasTime, checked: () => has1D() && !!S.active.display.autoPlay, run: () => { const w = need('time'); w.display.autoPlay = !w.display.autoPlay; } }]);

  addItems('Signal tools', 'Instantaneous frequency (Hilbert transform)', [
    { label: 'Envelope (local max method)', en: hasU, run: () => APP.derive(need('uniform'), 'envmax', {}) },
    { label: 'Zero-crossings', en: hasU, run: () => APP.derive(need('uniform'), 'zerocross', {}) },
    { label: 'Cepstrum', en: hasU, run: () => APP.derive(need('uniform'), 'cepstrum', {}) },
    { label: 'Wavelet denoising…', en: hasU, run: waveletDialog },
    { label: 'Convert tacho signal to RPM…', en: hasTime, run: tachoDialog },
    { label: 'Align signals (sync)…', en: hasU, run: alignDialog }]);
  addItems('Signal tools', 'Other octave plots', [{ label: 'Custom filter bank plot…', en: hasTime, run: bankDialog }]);
  addItems('Signal tools', 'Spectral analysis defaults…', [
    { label: 'Import FFT settings (.swt / .sws)…', run: () => UI.pickFiles('.swt,.sws', 'swt') },
    { label: 'Save FFT settings as .swt tool…', en: () => S.active && S.active.op && S.active.op.type === 'fft', run: exportSwtFft }]);
  addItems('Signal tools', 'Signal calculator…', [{ label: 'Signal report', en: hasU, run: () => APP.derive(need('uniform'), 'report', {}) }, { label: 'Speech-to-text (visible part)…', en: hasTime, run: speechToText }]);

  addItems('Instruments', 'Value at (with marker)…', [{ label: 'Marker with harmonics at…', en: has1D, run: harmonicMarker }, ...cursorMenuItems()]);
  addItems('Instruments', 'Kurtosis', [
    { label: 'Fractal dimension', en: has1D, run: () => APP.derive(need('1d'), 'instrument', { instrument: 'Fractal dimension' }) },
    { label: 'Shannon entropy', en: has1D, run: () => APP.derive(need('1d'), 'instrument', { instrument: 'Shannon entropy' }) }]);
  addItems('Instruments', 'Peak count', [
    { label: 'Average peak distance', en: () => has1D() && !!(S.active.display.peaks && S.active.display.peaks.on), run: () => APP.derive(need('1d'), 'instrument', { instrument: 'Average peak distance' }) },
    { label: 'Damping factor (half-power bandwidth)', en: has1D, run: () => { const w = need('1d'); APP.derive(w.data.xUnit === 'Hz' ? w : withFft(w, { window: 'Rectangle' }), 'instrument', { instrument: 'Damping factor' }); } },
    { label: 'Amplitude at max. frequency harmonics', sub: [2, 3, 4, 5, 6, 7, 8, 9, 10].map(k => ({ label: `${k}x max. frequency`, en: has1D, run: () => APP.derive(need('1d'), 'instrument', { instrument: `Amplitude at ${k}x max. frequency` }) })) },
    { label: 'Sum 3D over frequency range…', en: has3D, run: sum3dDialog },
    '-',
    { label: 'Log instrument values…', run: () => root.IOX.logInstruments() },
    { label: 'Stop logging instrument values', en: () => !!root.IOX.instLog, run: () => root.IOX.stopInstLog() }]);

  addItems('3D tools', 'Spectrogram with default settings', [{ label: 'Continuous wavelet transform (CWT)…', en: hasU, run: cwtDialog }]);
  addItems('3D tools', 'Adjust Z-axis…', [
    { label: 'Track changes in 3D graphics…', en: has3D, run: trackDialog },
    { label: 'Track changes in spectrogram view…', en: has3D, run: trackDialog },
    { label: '3D signal filter…', en: has3D, run: filter3dDialog },
    { label: 'Time FFT statistics…', en: has3D, run: tfftStatsDialog },
    { label: 'Spectrogram contour plot', en: has3D, run: () => chartDialog('contour') },
    { label: 'Zoom in graphics', en: has3D, run: () => zoom3d(0.5) },
    { label: 'Zoom out graphics', en: has3D, run: () => zoom3d(2) }]);

  addItems('System control', 'Show signals as overlay…', [{ label: 'Show signals in a same window (stacked)', en: has1D, checked: () => has1D() && !!S.active.display.stacked, run: async () => { const w = need('1d'); if (!w.display.overlays.length && !w.display.stacked) { const ws = await pickWindows('Stacked view', 'Signals to show below this one.', 1); if (!ws) return; w.display.overlays = ws.slice(1).map(o => o.id); } w.display.stacked = !w.display.stacked; APP.requestRender(w); } }]);

  const i3d = UI.MENUS.findIndex(m => m.label === '3D tools');
  UI.MENUS.splice(i3d + 1, 0,
    { label: 'Scripts', items: [
      ...Object.entries(SCRIPT_KINDS).map(([t, l]) => ({ label: l + '…', run: () => newScript(t) })),
      '-',
      { label: 'Edit script…', en: () => S.active && S.active.op && OPS[S.active.op.type].script, run: () => editScript() },
      { label: 'Execute script', en: () => S.active && S.active.op && OPS[S.active.op.type].script, run: () => { const w = need(); w.state.script = null; APP.queueCompute(w); } },
      { label: 'Script parameters…', en: () => S.active && S.active.op && OPS[S.active.op.type].script, run: () => scriptParams(need()) },
      { label: 'JavaScript console', run: openConsole },
      '-',
      { label: 'Custom displays', sub: Object.keys(CHARTS).map(k => ({ label: CHARTS[k].label + '…', run: () => chartDialog(k) })) }] },
    { label: 'AI signal report', items: [
      { label: 'Generate AI report', get sub() { return AI.MODES.map(m => ({ label: m.label + (AI.configured ? '' : ' (LLM not configured)'), en: hasTime, run: () => aiReport(m.id) })); } },
      { label: 'Export signal metrics…', en: hasTime, run: () => { const w = need('time'); download(safeName(w.title) + ' metrics.json', JSON.stringify(metricsOf(w).metrics, null, 1), 'application/json'); } },
      { label: 'Copy analysis prompt to clipboard', sub: AI.MODES.map(m => ({ label: m.label, en: hasTime, run: async () => { const { metrics, info } = metricsOf(need('time')); const p = AI.prompt(m.id, metrics, info, ''); await navigator.clipboard.writeText(p.system + '\n\n' + p.user); toast('Prompt copied – paste it into any chat assistant'); } })) },
      { label: 'Settings…', run: aiSettings }] });

  const help = MENU('Help');
  help.items.unshift({ label: 'Contents…', key: 'F1', run: helpContents }, { label: 'Index…', run: () => root.HELP && root.HELP.index() },
    { label: 'Search…', run: () => root.HELP && root.HELP.search() }, '-');

  // Window menu extras for special windows
  UI.extraWindowItems = w => {
    const out = [];
    if (w.op && OPS[w.op.type] && OPS[w.op.type].script) out.push({ label: 'Edit script…', run: () => editScript(w) }, { label: 'Script parameters…', run: () => scriptParams(w) });
    if (w.op && w.op.type === 'align' && w.state.delays) out.push({ label: 'Align parent signals', run: () => {
      w.parents.forEach((pid, i) => { const p = S.wins.get(pid); if (!p || !p.data) return; const d = w.state.delays[i] || 0; APP.createWindow({ kind: '1d', title: `${p.title} (aligned ${-d})`, data: Object.assign({}, p.data, { y: DSP.shiftSignal(p.data.y, d) }), source: { type: 'copy' } }); });
      toast('Aligned copies created'); } });
    if (w.op && w.op.type === 'chart' && CHARTS[w.op.params.type].rotatable) out.push({ label: 'Reset rotation', run: () => { w.display.yaw = 35; w.display.pitch = 25; APP.requestRender(w); } });
    if (w.kind === '1d' && w.data && w.data.y) out.push(...cursorMenuItems());
    if (w.kind === 'display' && w.data && w.data.text) out.push({ label: 'Copy text', run: async () => { await navigator.clipboard.writeText(w.data.text); toast('Copied'); } }, { label: 'Save text…', run: () => download(safeName(w.title) + '.md', w.data.text, 'text/markdown') });
    return out;
  };

  Object.assign(UI, { LIBRARY, customToolItems, recent, addSignals, loadWorkspaceSmart, aiReport, metricsOf, editScript, chartDialog, pickWindows, fileLike, advancedSettings, toolbarEditor });
})(window);
