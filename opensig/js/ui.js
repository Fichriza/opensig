/* OpenSig UI: menu bar, dialogs, commands, keyboard shortcuts, files, examples. */
(function (root) {
  'use strict';
  const { DSP, IO, PLOT, OPS, INSTRUMENTS, EXPR, APP } = root;
  const S = APP.S;
  const $ = (sel, el = document) => el.querySelector(sel);
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };

  // Running inside the OpenSig desktop host (WebView2): browser shortcuts are disabled there, so the original keys are free.
  const HOSTED = !!(window.chrome && window.chrome.webview);
  // On a Mac (the OpenSig app or a browser) Cmd works as Ctrl and the shortcuts are shown as ⌘ ⌥ ⇧; Cmd+Q stays Quit,
  // so the acquisition dialog is Control+Q there.
  const IS_MAC = /Mac/.test(navigator.platform || navigator.userAgent || '');
  const macKeys = s => !IS_MAC || !s ? s : String(s).replace(/\b(?:(?:Ctrl|Alt|Shift)\+)+[^\s)/]+/g, m => {
    const parts = m.split('+'), key = parts.pop(), mods = new Set(parts), cmd = mods.has('Ctrl') && !(key.toUpperCase() === 'Q' && mods.size === 1);
    return (mods.has('Ctrl') && !cmd ? '⌃' : '') + (mods.has('Alt') ? '⌥' : '') + (mods.has('Shift') ? '⇧' : '') + (cmd ? '⌘' : '') + key;
  });

  /* ---------- Toasts ---------- */
  function toast(msg, kind) {
    const t = h('div', { class: 'toast ' + (kind || ''), role: kind === 'err' ? 'alert' : 'status' }, msg);
    $('#toasts').append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'err' ? 5000 : 2800);
  }
  const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { console.error(e); toast(e.message || String(e), 'err'); } };

  /* ---------- Dialogs ---------- */
  // fields: {key,label,type:number|text|color|select|check|textarea|info|section|radio, options, value, step, min, max, show(v), hint, wide}
  // o.onChange(values, inputs) runs on every edit (live preview); it may set other inputs' values
  function dialog(o) {
    return new Promise(resolve => {
      const dlg = h('dialog', { class: 'dlg' + (o.side ? ' dlg-side' : ''), 'aria-label': o.title }); // side: docked right, page stays visible
      const form = h('form', { method: 'dialog' });
      const body = h('div', { class: 'dlg-body' });
      const inputs = {}, rows = [];
      const values = () => {
        const v = {};
        for (const [k, el] of Object.entries(inputs)) {
          if (el.type === 'checkbox') v[k] = el.checked;
          else if (el._radio) v[k] = (el.querySelector('input:checked') || {}).value;
          else if (el.dataset.num) v[k] = el.value === '' ? null : parseFloat(el.value);
          else v[k] = el.value;
        }
        return v;
      };
      const refresh = () => {
        if (o.onChange) o.onChange(values(), inputs);
        const v = values(); rows.forEach(([f, row]) => { if (f.show) row.hidden = !f.show(v); });
      };
      for (const f of o.fields) {
        let row;
        if (f.type === 'section') row = h('div', { class: 'dlg-section' }, f.label);
        else if (f.type === 'info') row = h('div', { class: 'dlg-info', 'data-key': f.key }, f.label);
        else {
          let input;
          const id = 'f_' + f.key + '_' + Math.random().toString(36).slice(2, 7);
          if (f.type === 'select') {
            input = h('select', { id }, ...(f.options || []).map(op => { const [val, lab] = Array.isArray(op) ? op : [op, op]; return h('option', { value: val, selected: String(val) === String(f.value) }, lab); }));
          } else if (f.type === 'check') {
            input = h('input', { id, type: 'checkbox' }); input.checked = !!f.value;
          } else if (f.type === 'textarea') {
            input = h('textarea', { id, rows: f.rows || 4, spellcheck: 'false' }); input.value = f.value ?? '';
          } else if (f.type === 'radio') {
            input = h('div', { class: 'dlg-radio' + (f.cls ? ' ' + f.cls : ''), role: 'radiogroup' }, ...(f.options || []).map(op => { const [val, lab] = Array.isArray(op) ? op : [op, op]; return h('label', {}, h('input', { type: 'radio', name: id, value: val, checked: String(val) === String(f.value) }), ' ', lab); }));
            input._radio = true;
          } else {
            input = h('input', { id, type: f.type === 'number' ? 'number' : f.type === 'color' ? 'color' : 'text', step: f.step ?? 'any', min: f.min, max: f.max });
            input.value = f.value ?? '';
            if (f.type === 'number') input.dataset.num = '1';
          }
          inputs[f.key] = input;
          input.addEventListener('input', refresh); input.addEventListener('change', refresh);
          if (f.type === 'check') row = h('div', { class: 'dlg-row check' }, input, h('label', { for: id }, f.label), f.hint ? h('span', { class: 'hint' }, f.hint) : null);
          else row = h('div', { class: 'dlg-row' + (f.wide ? ' wide' : '') }, h('label', { for: input._radio ? null : id }, f.label), input, f.hint ? h('span', { class: 'hint' }, f.hint) : null);
        }
        rows.push([f, row]); body.append(row);
      }
      const err = h('div', { class: 'dlg-err', role: 'alert' });
      const finish = v => { dlg.close(); dlg.remove(); resolve(v); };
      const okBtn = h('button', { class: 'btn primary', value: 'ok' }, o.ok || 'OK');
      const footer = h('div', { class: 'dlg-foot' }, ...(o.extra || []).map(b => h('button', { class: 'btn', type: 'button', onclick: () => b.run(values(), inputs) }, b.label)),
        h('span', { class: 'grow' }), h('button', { class: 'btn', type: 'button', onclick: () => finish(null) }, o.cancel || 'Cancel'), okBtn);
      form.append(...[h('h2', { class: 'dlg-title' }, o.title), o.intro ? h('p', { class: 'dlg-intro' }, o.intro) : null, body, err, footer].filter(Boolean));
      dlg.append(form);
      form.addEventListener('submit', e => {
        e.preventDefault();
        const v = values();
        if (o.validate) { const m = o.validate(v); if (m) { err.textContent = m; return; } }
        finish(v);
      });
      dlg.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
      document.body.append(dlg); refresh(); dlg.showModal();
      const first = body.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea'); if (first) first.focus();
    });
  }
  const confirmBox = (title, text) => dialog({ title, intro: text, fields: [], ok: 'OK' }).then(v => !!v);

  /* ---------- Active-window helpers ---------- */
  const act = () => S.active;
  function need(kind) {
    const w = S.active;
    if (!w) throw new Error('Open or select a window first (File ▸ Open signal, or Signal tools ▸ Signal generator).');
    if (kind === '1d' && (w.kind !== '1d' || !w.data || !w.data.y)) throw new Error('Select a signal (2D) window first.');
    if (kind === 'time' && (w.kind !== '1d' || !w.data || !w.data.y || w.data.x || w.data.xUnit !== 's')) throw new Error('Select a time-signal window first.');
    if (kind === 'uniform' && (w.kind !== '1d' || !w.data || !w.data.y || w.data.x)) throw new Error('Select a uniformly sampled signal window first.');
    if (kind === '3d' && w.kind !== '3d') throw new Error('Select a 3D window (spectrogram / time FFT) first.');
    return w;
  }

  /* ---------- Files ---------- */
  function download(name, blobOrText, type) {
    const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: type || 'application/octet-stream' });
    const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const baseName = n => n.replace(/\.[^.]+$/, '');
  const safeName = n => (n || 'signal').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
  const wsFileName = () => safeName(APP.tabs.current() ? APP.tabs.current().name : 'workspace') + '.osw'; // named after its tab

  let pendingOpen = null;
  function pickFiles(accept, mode) {
    if (root.UI_PICK && root.UI_PICK(accept, mode)) return;
    const inp = $('#file-input'); inp.accept = accept || ''; pendingOpen = mode || 'auto'; inp.value = ''; inp.click();
  }

  // a workspace file opens in a tab of its own
  function openWorkspace(ws, fileName) { if (ws && Array.isArray(ws.windows)) APP.tabs.forFile(baseName(fileName)); APP.loadWorkspace(ws); }
  async function openFile(file, mode) {
    if (root.UI_OPENERS && await root.UI_OPENERS(file, mode)) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (mode && mode.startsWith('raw:')) return importRaw(file, mode.slice(4));
    if (mode === 'tool' || ext === 'ost') { const t = JSON.parse(await file.text()); const n = APP.applyTool(need(), t); toast(`Applied tool "${t.name}" (${n} windows)`); return; }
    if (mode === 'workspace' || ext === 'osw') { openWorkspace(JSON.parse(await file.text()), file.name); toast('Workspace loaded'); return; }
    if (ext === 'json') {
      const j = JSON.parse(await file.text());
      if (j.tool) { const n = APP.applyTool(need(), j); toast(`Applied tool (${n} windows)`); } else { openWorkspace(j, file.name); toast('Workspace loaded'); }
      return;
    }
    if (ext === 'wav' || ext === 'wave') {
      const w = IO.parseWav(await file.arrayBuffer());
      w.channels.forEach((c, i) => APP.openSignal(c, w.sampleRate, file.name + (w.channels.length > 1 ? ` [ch ${i + 1}]` : ''), { type: 'file', name: file.name }));
      toast(`${file.name}: ${w.channels.length} ch · ${w.sampleRate} Hz · ${w.bits}-bit${w.isFloat ? ' float' : ''}`);
      return;
    }
    if (['bin', 'raw', 'dat', 'sig', 'f32', 'pcm'].includes(ext)) {
      const r = await dialog({ title: 'Raw binary import', intro: file.name + ' has no header. Choose the sample format.', fields: [
        { key: 'type', label: 'Sample format', type: 'select', options: Object.keys(IO.RAW_TYPES), value: ext === 'sig' || ext === 'f32' ? '32-bit float' : '16-bit signed' }] });
      if (r) return importRaw(file, r.type);
      return;
    }
    return importCsvText(await file.text(), file.name);
  }

  async function importRaw(file, type) {
    const r = await dialog({ title: 'Raw binary import – ' + type, fields: [
      { key: 'fs', label: 'Sample rate (samples/s)', type: 'number', value: 44100, min: 0 },
      { key: 'channels', label: 'Interleaved channels', type: 'number', value: 1, min: 1, step: 1 },
      { key: 'big', label: 'Big-endian byte order', type: 'check', value: false }],
      validate: v => v.fs > 0 ? null : 'Sample rate must be positive' });
    if (!r) return;
    const y = IO.parseRaw(await file.arrayBuffer(), type, !r.big), ch = Math.max(1, Math.round(r.channels));
    for (let c = 0; c < ch; c++) {
      const part = new Float64Array(Math.floor(y.length / ch)); for (let i = 0; i < part.length; i++) part[i] = y[i * ch + c];
      APP.openSignal(part, r.fs, file.name + (ch > 1 ? ` [ch ${c + 1}]` : ''), { type: 'file', name: file.name });
    }
  }

  // the ASCII / CSV import settings; extra fields are added below (following a file that keeps growing)
  function csvDialog(text, title, extra) {
    const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 30), sep = IO.detectSeparator(lines);
    const preview = lines.slice(0, 6).join('\n');
    return dialog({ title, intro: 'Preview:\n' + preview, fields: [
      { key: 'separator', label: 'Value separator', type: 'select', options: [['auto', 'Detect automatically'], [',', 'Comma'], [';', 'Semicolon'], ['\t', 'Tab'], [' ', 'Space(s)']], value: 'auto', hint: 'detected: ' + ({ '\t': 'tab', ' ': 'space', ',': 'comma', ';': 'semicolon' }[sep]) },
      { key: 'decimal', label: 'Number format', type: 'select', options: [['.', '1234.5 (decimal point)'], [',', '1234,5 (decimal comma)']], value: '.' },
      { key: 'headerRow', label: 'Read column header from row', type: 'number', value: 0, min: 0, step: 1, hint: '0 = none / auto' },
      { key: 'ignore', label: 'Ignore these columns', type: 'text', value: '', hint: 'comma-separated, 1-based' },
      { key: 'timeColumn', label: 'Use first column to calculate the sampling rate (time column)', type: 'check', value: false },
      { key: 'fs', label: 'Sample rate (samples/s)', type: 'number', value: 1, show: v => !v.timeColumn }].concat(extra || []) });
  }
  const csvOptions = r => ({ separator: r.separator, decimal: r.decimal, headerRow: r.headerRow || 0, timeColumn: r.timeColumn,
    ignore: r.ignore.split(',').map(s => parseInt(s, 10)).filter(n => n > 0) });
  async function importCsvText(text, name) {
    const r = await csvDialog(text, 'ASCII / CSV import');
    if (!r) return;
    const res = IO.parseCsv(text, csvOptions(r));
    const fs = res.sampleRate || r.fs || 1;
    res.columns.forEach(c => APP.openSignal(c.data, fs, `${name} – ${c.name}`, { type: 'file', name }));
    toast(`Imported ${res.columns.length} column(s), ${res.columns[0].data.length} rows at ${PLOT.fmt(fs, fs)} Hz`);
  }

  async function fromClipboard() {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch (e) { /* permission denied → manual paste */ }
    if (!text.trim()) {
      const r = await dialog({ title: 'Signal from clipboard data', intro: 'Paste numbers (one value per line, or columns separated by comma/semicolon/tab).', fields: [{ key: 't', label: 'Data', type: 'textarea', rows: 10, wide: true }] });
      if (!r || !r.t.trim()) return; text = r.t;
    }
    return importCsvText(text, 'Clipboard');
  }

  async function saveSignal(visibleOnly) {
    const w = need('1d'), d = visibleOnly ? APP.visibleData(w) : w.data;
    const r = await dialog({ title: visibleOnly ? 'Save visible signal part' : 'Save signal as', fields: [
      { key: 'fmt', label: 'Format', type: 'select', value: d.xUnit === 's' && !d.x ? 'wav32' : 'csvxy', options: [['wav32', 'WAV – 32-bit float'], ['wav16', 'WAV – 16-bit PCM (normalized)'], ['csvxy', 'CSV – X/Y values'], ['csvy', 'CSV – Y values only'], ...Object.keys(IO.RAW_TYPES).map(t => ['raw:' + t, 'Raw binary – ' + t])] },
      { key: 'name', label: 'File name', type: 'text', value: safeName(baseName(w.title)) }] });
    if (!r) return;
    const xOf = i => d.x ? d.x[i] : d.x0 + i * d.dx;
    if (r.fmt.startsWith('wav')) {
      if (d.x) throw new Error('WAV needs a uniformly sampled signal; use CSV for this window.');
      const enc = IO.encodeWavWithMeta ? (c, f, t) => IO.encodeWavWithMeta(c, f, t, { t0abs: d.t0abs, yUnit: d.yUnit, display: { style: w.display.style, colorType: w.display.colorType, width: w.display.width } }) : IO.encodeWav;
      download(r.name + '.wav', new Blob([enc([d.y], 1 / d.dx, r.fmt === 'wav16' ? 'int16' : 'float32')], { type: 'audio/wav' }));
    } else if (r.fmt.startsWith('csv')) download(r.name + '.csv', (r.fmt === 'csvxy' ? `${d.xUnit || 'x'},${d.yUnit || 'y'}\n` : '') + IO.toCsv(xOf, d.y, r.fmt === 'csvxy'), 'text/csv');
    else download(r.name + '.bin', new Blob([IO.encodeRaw(d.y, r.fmt.slice(4))]));
  }

  function export3D(layout) {
    const w = need('3d'), sg = w.data.sg, lines = [];
    if (layout === 'xyz') { lines.push('time,frequency,dB'); for (const r of sg.rows) for (let k = 0; k < sg.bins; k++) lines.push(`${IO.fmtNum(r.t)},${IO.fmtNum((sg.f0 || 0) + k * sg.df)},${IO.fmtNum(r.v[k])}`); }
    else if (layout === 'xy') { lines.push(['time\\freq'].concat(Array.from({ length: sg.bins }, (_, k) => IO.fmtNum((sg.f0 || 0) + k * sg.df))).join(',')); for (const r of sg.rows) lines.push([IO.fmtNum(r.t)].concat(Array.from(r.v, IO.fmtNum)).join(',')); }
    else { lines.push(['freq\\time'].concat(sg.rows.map(r => IO.fmtNum(r.t))).join(',')); for (let k = 0; k < sg.bins; k++) lines.push([IO.fmtNum((sg.f0 || 0) + k * sg.df)].concat(sg.rows.map(r => IO.fmtNum(r.v[k]))).join(',')); }
    download(safeName(w.title) + '.csv', lines.join('\n'), 'text/csv');
  }

  async function copyData() {
    const w = need('1d'), d = APP.visibleData(w);
    const txt = IO.toCsv(i => d.x ? d.x[i] : d.x0 + i * d.dx, d.y, true);
    await navigator.clipboard.writeText(txt); toast(`Copied ${d.y.length} rows to clipboard`);
  }
  async function copyPicture() {
    const w = need(); const blob = await new Promise(r => w.canvas.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Picture copied to clipboard');
  }
  function savePicture() { const w = need(); w.canvas.toBlob(b => download(safeName(w.title) + '.png', b), 'image/png'); }

  /* ---------- Spectral & tool dialogs (layout and options of the "Spectral analysis defaults" dialog) ---------- */
  const FULLSCALE = [['', 'Choose predefined value'], [0, 'Auto (takes max. value)'], [127, '8-bit samples range'], [2047, '12-bit samples range'], [32767, '16-bit samples range'], [8388607, '24-bit samples range'], [1, 'Float -1..+1 range'], [3.402823e38, 'Float max range']];
  function spectralFields(p) {
    p = DSP.svSettings(p);
    const isLog = v => /Mag|Power/.test(v.type);
    const curves = (root.FILTERS ? root.FILTERS.names() : []).filter(n => { const c = root.FILTERS.get(n); return c && c.type !== 'mag'; });
    return [
      { type: 'section', label: 'Spectrum type' },
      { key: 'mode', label: 'Averaging', type: 'radio', value: p.mode, options: [['instant', 'Instantaneous spectrum (no averaging)'], ['segments', 'Split input in overlapping segments, calculate their spectra and average the results'], ['last', 'Average last X spectra (live signals)']] },
      { key: 'segmentCount', label: 'Number of segments', type: 'number', value: p.segmentCount, min: 2, step: 1, show: v => v.mode === 'segments' },
      { key: 'segmentOverlap', label: 'Overlap (%)', type: 'number', value: p.segmentOverlap, min: 0, max: 95, show: v => v.mode === 'segments' },
      { key: 'averageComplex', label: 'Average complex spectra', type: 'check', value: p.averageComplex, show: v => v.mode === 'segments' },
      { key: 'liveAverage', label: 'Average last … spectra', type: 'number', value: p.liveAverage, min: 2, step: 1, show: v => v.mode === 'last' },
      { type: 'section', label: 'Signal conditioning before spectrum calculation' },
      { key: 'subtractMean', label: 'Subtract mean', type: 'check', value: p.subtractMean },
      { key: 'removeTrend', label: 'Remove linear trend', type: 'check', value: p.removeTrend },
      { key: 'removePeaks', label: 'Remove values > N · standard deviation', type: 'check', value: p.removePeaks },
      { key: 'removePeaksK', label: 'N (standard deviations)', type: 'number', value: p.removePeaksK, min: 0.1, show: v => v.removePeaks },
      { key: 'applyWindow', label: 'Apply window', type: 'check', value: p.applyWindow },
      { key: 'window', label: 'Window', type: 'select', options: DSP.SV_WINDOWS.map(w => w.name), value: p.window, show: v => v.applyWindow },
      { key: 'zeroPadding', label: 'Zero-padding', type: 'select', options: DSP.SV_PADDING, value: p.zeroPadding },
      { type: 'section', label: 'Spectrum units' },
      { key: 'dB', label: 'Logarithmic Y-axis (dB units)', type: 'check', value: p.dB, show: isLog },
      { key: 'dBFS', label: 'Y-axis in dBFS', type: 'check', value: p.dBFS, show: v => v.dB && isLog(v) },
      { key: 'fsPreset', label: 'Full-scale value', type: 'select', options: FULLSCALE, value: '', show: v => v.dB && v.dBFS && isLog(v) },
      { key: 'fullScale', label: 'Full scale (signal units, 0 = highest value)', type: 'number', value: p.fullScale, min: 0, show: v => v.dB && v.dBFS && isLog(v) },
      { key: 'xUnit', label: 'X-axis unit', type: 'select', options: [['Hz', 'Hz (Cycles/sec)'], ['CPM', 'CPM (Cycles/minute)'], ['kHz', 'KHz'], ['MHz', 'MHz']], value: p.xUnit },
      { type: 'section', label: 'Spectrum properties' },
      { key: 'type', label: 'Show result as', type: 'radio', options: DSP.SV_TYPES, value: p.type },
      { key: 'customFilter', label: 'Apply custom filter curve', type: 'select', options: [['', 'None']].concat(curves.map(n => [n, n])), value: p.customFilter || (p.weighting === 'A' ? 'A-weighting' : p.weighting === 'C' ? 'C-weighting' : ''), show: v => v.type === 'Magnitude' || v.type === 'Power spectrum' },
      { key: 'smooth', label: 'Smooth using weighted moving average', type: 'check', value: p.smooth },
      { key: 'smoothLen', label: 'Smoothing length (pts)', type: 'number', value: p.smoothLen, min: 2, step: 1, show: v => v.smooth },
      { key: 'smoothWindow', label: 'Weighting function', type: 'select', options: ['Hann', 'Hamming', 'Blackman', 'Triangle'], value: p.smoothWindow, show: v => v.smooth, hint: 'the smoothing uses Hann weights for every choice' },
      { key: 'test', label: 'Test for significant peaks (Siegel)', type: 'check', value: p.test },
      { key: 'testLevel', label: 'Confidence', type: 'select', options: [[5, '95 % confidence'], [1, '99 % confidence']], value: p.testLevel >= 5 ? 5 : 1, show: v => v.test },
      { type: 'section', label: 'Displayed frequency range (OpenSig)' },
      { key: 'fromFreq', label: 'From', type: 'number', value: p.fromFreq || 0, min: 0 },
      { key: 'toFreq', label: 'To (0 = up to Nyquist)', type: 'number', value: p.toFreq || 0, min: 0 }
    ];
  }
  const spectralValidate = v => v.mode === 'segments' && !(v.segmentCount >= 2 && v.segmentCount <= 9999) ? 'Averaging settings are not correct. The value must be in [2,9999] range.' :
    v.mode === 'last' && !(v.liveAverage >= 2 && v.liveAverage <= 9999) ? 'Averaging settings are not correct. The value must be in [2,9999] range.' :
    v.dBFS && !(v.fullScale >= 0) ? 'Full scale value must be >=0.' : null;
  const cleanSpectral = v => {
    if (v.fsPreset !== '' && v.fsPreset != null) v.fullScale = Number(v.fsPreset);
    delete v.fsPreset;
    return DSP.svSettings(Object.assign(v, { customFilter: v.customFilter || null, weighting: null, segmentCount: Math.round(v.segmentCount || 10), liveAverage: Math.max(2, Math.round(v.liveAverage || 2)),
      smoothLen: Math.max(2, Math.round(v.smoothLen || 15)), testLevel: Number(v.testLevel), dB: /Mag|Power/.test(v.type) ? v.dB : false }));
  };

  async function spectralDefaults() {
    const v = await dialog({ title: 'Spectral analysis defaults', intro: 'Used for every new FFT-based calculation. Edit a single FFT window with Edit ▸ Properties.', fields: spectralFields(S.settings.spectral), validate: spectralValidate,
      extra: [{ label: 'Reset to defaults', run: (v, inp) => {
        const d = DSP.defaultSvSettings();
        for (const [k, el] of Object.entries(inp)) {
          if (!(k in d)) continue;
          if (el.type === 'checkbox') el.checked = !!d[k];
          else if (el._radio) { const r = el.querySelector('input[value="' + d[k] + '"]'); if (r) r.checked = true; }
          else el.value = d[k];
          el.dispatchEvent(new Event('change'));
        }
      } }] });
    if (!v) return; S.settings.spectral = cleanSpectral(v); APP.saveSettings(); toast('Spectral defaults saved');
  }

  function fft(params) {
    const w = need('uniform');
    return APP.derive(w, 'fft', DSP.svSettings(Object.assign({}, S.settings.spectral, params || {})));
  }
  async function fftWithDialog() {
    const w = need('uniform');
    const v = await dialog({ title: 'FFT spectrum analysis', fields: spectralFields(S.settings.spectral), validate: spectralValidate, ok: 'Calculate' });
    if (v) APP.derive(w, 'fft', cleanSpectral(v));
  }

  // The FFT variant presets, as FFT_* parameters (Hann, optimal padding, 10 segments / 25 %)
  const FFT_VARIANTS = [
    ['FFT Magnitude (dB scale)', { FFT_Show: 2, FFT_Type: 0, FFT_dBScale: 1 }],
    ['FFT Magnitude, averaged (dB scale)', { FFT_Show: 2, FFT_Type: 2, FFT_dBScale: 1 }],
    ['FFT Magnitude, averaged (linear scale)', { FFT_Show: 2, FFT_Type: 2, FFT_dBScale: 0 }],
    ['FFT Magnitude, a-weighting, averaged (dB scale)', { FFT_Show: 2, FFT_Type: 2, FFT_dBScale: 1, FFT_CustomFilter: 'A-weighting' }],
    ['FFT Magnitude, c-weighting, averaged (dB scale)', { FFT_Show: 2, FFT_Type: 2, FFT_dBScale: 1, FFT_CustomFilter: 'C-weighting' }],
    ['Phase', { FFT_Show: 4, FFT_Type: 0, FFT_dBScale: 0 }],
    ['Power spectrum (dB scale)', { FFT_Show: 7, FFT_Type: 0, FFT_dBScale: 1 }],
    ['Power spectrum (linear scale)', { FFT_Show: 7, FFT_Type: 0, FFT_dBScale: 0 }],
    ['Power spectrum, averaged (dB scale)', { FFT_Show: 7, FFT_Type: 2, FFT_dBScale: 1 }],
    ['Power spectrum, averaged (linear scale)', { FFT_Show: 7, FFT_Type: 2, FFT_dBScale: 0 }],
    ['Power Spectrum Density (dB scale)', { FFT_Show: 6, FFT_Type: 0, FFT_dBScale: 1 }],
    ['Power Spectrum Density (linear scale)', { FFT_Show: 6, FFT_Type: 0, FFT_dBScale: 0 }],
    ['Power Spectrum Density, averaged (dB scale)', { FFT_Show: 6, FFT_Type: 2, FFT_dBScale: 1 }],
    ['Power Spectrum Density, averaged (linear scale)', { FFT_Show: 6, FFT_Type: 2, FFT_dBScale: 0 }]
  ];
  const SV_PRESET_BASE = { FFT_Average: 2, FFT_AverageSegmentCount: 10, FFT_AverageSegmentOverlap: 25, FFT_DoExpandWithZeros: 2, FFT_ExpandWithZerosVal: 4, FFT_DoNormalize: 0, FFT_DoRemoveLinTrend: 0,
    FFT_DoRemovePeaks: 0, FFT_DoSmooth: 0, FFT_DoTaper: 1, FFT_DoTestPeaks: 0, FFT_RemovePeaksVal: 2, FFT_SmoothLen: 15, FFT_TestPeaksLevel: 5, FFT_Window: 0, FFT_XScale: 0, FFT_dBFS: 0, FFT_FullScaleVal: 0 };
  function fftVariant(name, ini) {
    const w = need('uniform');
    const x = APP.derive(w, 'fft', DSP.svFromIni(Object.assign({}, SV_PRESET_BASE, ini)));
    x.title = name; x.updateTitle();
  }

  async function spectrogramDialog(mesh, quick) {
    const w = need('uniform'), d = S.settings.spectrogram, n = APP.visibleData(w).y.length;
    const params = Object.assign({}, d, { mesh });
    if (!quick) {
      const v = await dialog({ title: mesh ? 'Time FFT' : 'Spectrogram', intro: `Visible part: ${n} samples. Shorter segments give better time resolution, longer segments better frequency resolution.`, fields: [
        { key: 'segmentLength', label: 'FFT segment length (samples)', type: 'select', options: [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384], value: d.segmentLength },
        { key: 'overlap', label: 'Overlap between segments (%)', type: 'number', value: d.overlap, min: 0, max: 95 },
        { key: 'window', label: 'Window', type: 'select', options: DSP.WINDOWS, value: d.window },
        { key: 'remember', label: 'Use these settings as default', type: 'check', value: true }], ok: 'Calculate' });
      if (!v) return;
      Object.assign(params, { segmentLength: +v.segmentLength, overlap: v.overlap, window: v.window });
      if (v.remember) { S.settings.spectrogram = { segmentLength: params.segmentLength, overlap: params.overlap, window: params.window }; APP.saveSettings(); }
    }
    APP.derive(w, 'spectrogram', params, { display: { mode: mesh ? 'mesh' : 'spectrogram' } });
  }

  const FILTER_TYPES = [['lowpass', 'Lowpass'], ['highpass', 'Highpass'], ['bandpass', 'Bandpass'], ['bandstop', 'Bandstop']];
  async function fftFilterDialog(existing) {
    const w = existing || need('uniform'), fs = 1 / (existing ? APP.S.wins.get(existing.parents[0]) || existing : w).data.dx, p = existing ? existing.op.params : { type: 'lowpass', f1: Math.round(fs / 10), f2: Math.round(fs / 5), slope: 0, stopDb: 200 };
    const curves = root.FILTERS ? root.FILTERS.names() : [];
    const v = await dialog({ title: 'FFT filter', intro: `Sampling rate ${PLOT.fmt(fs, fs)} Hz (Nyquist ${PLOT.fmt(fs / 2, fs)} Hz).`, fields: [
      { key: 'type', label: 'Filter response', type: 'radio', options: FILTER_TYPES.concat(curves.length ? [['custom', 'Custom filter curve']] : []), value: p.type },
      { key: 'curve', label: 'Filter curve', type: 'select', options: curves, value: p.curve || curves[0], show: v => v.type === 'custom' },
      { key: 'f1', label: 'From (Hz) / cut-off', type: 'number', value: p.f1, min: 0, show: v => v.type !== 'custom' },
      { key: 'f2', label: 'To (Hz)', type: 'number', value: p.f2, min: 0, show: v => v.type.startsWith('band') },
      { type: 'section', label: 'Advanced' },
      { key: 'slope', label: 'Filter slope width (Hz)', type: 'number', value: p.slope, min: 0, hint: '0 = brick-wall' },
      { key: 'stopDb', label: 'Reduce stop-band amplitude by (dB)', type: 'number', value: p.stopDb, min: 0 }],
      validate: v => v.type === 'custom' ? null : !(v.f1 >= 0) ? 'Enter a frequency' : v.type.startsWith('band') && !(v.f2 > v.f1) ? '"To" must be larger than "From"' : null });
    if (!v) return;
    if (existing) { const named = existing.title !== existing.opLabel; existing.op.params = v; if (!named) existing.title = OPS.fftfilter.label(v); existing.updateTitle(); APP.queueCompute(existing); }
    else APP.derive(w, 'fftfilter', v);
  }
  async function iirFilterDialog(existing) {
    const src = existing ? S.wins.get(existing.parents[0]) : need('uniform'); if (!src) throw new Error('Filter is unlinked');
    const fs = 1 / src.data.dx, p = existing ? existing.op.params : { type: 'lowpass', order: 4, f1: Math.round(fs / 10), f2: Math.round(fs / 5) };
    const v = await dialog({ title: 'IIR filter (Butterworth)', intro: `Sampling rate ${PLOT.fmt(fs, fs)} Hz.`, fields: [
      { key: 'type', label: 'Filter response', type: 'radio', options: FILTER_TYPES, value: p.type },
      { key: 'order', label: 'Filter order', type: 'select', options: [2, 4, 6, 8, 10, 12], value: p.order },
      { key: 'f1', label: 'From (Hz) / cut-off', type: 'number', value: p.f1, min: 0 },
      { key: 'f2', label: 'To (Hz)', type: 'number', value: p.f2, min: 0, show: v => v.type.startsWith('band') }],
      validate: v => !(v.f1 > 0 && v.f1 < fs / 2) ? 'Cut-off must be between 0 and Nyquist' : v.type.startsWith('band') && !(v.f2 > v.f1 && v.f2 < fs / 2) ? '"To" must be between "From" and Nyquist' : null });
    if (!v) return; v.order = +v.order;
    if (existing) { const named = existing.title !== existing.opLabel; existing.op.params = v; if (!named) existing.title = OPS.iirfilter.label(v); existing.updateTitle(); APP.queueCompute(existing); }
    else APP.derive(src, 'iirfilter', v);
  }

  // Peak detection is a property of the signal window: markers on the peaks of the visible part,
  // read by the Peak count and Average peak distance instruments. The threshold method has defaults of 75 % /
  // 25 % of the signal's range; the others are in DSP.detectPeaks.
  async function peakDialog() {
    const w = need('1d'), d = w.data, cur = Object.assign(DSP.defaultPeakSettingsAll(d.y), w.display.peaks || {});
    if (!cur.method) cur.method = 'threshold'; // settings from earlier versions
    const r6 = v => +(+v).toPrecision(6), unitW = d.x ? null : d.dx, is = m => v => v.method === m;
    const v = await dialog({ title: 'Peak detector – ' + w.label, fields: [
      { key: 'on', label: 'Detect peaks', type: 'check', value: w.display.peaks ? cur.on : true },
      { key: 'method', label: 'Method', type: 'select', options: DSP.PEAK_METHODS, value: cur.method },
      // Threshold
      { type: 'info', label: 'The maximum of each part of the signal above the threshold.', show: is('threshold') },
      { key: 'pos', label: 'Positive threshold', type: 'number', value: r6(cur.pos), hint: 'peaks are the maxima of the parts above it', show: is('threshold') },
      { key: 'neg', label: 'Negative threshold', type: 'number', value: r6(cur.neg), hint: 'a level (not a magnitude): negative peaks are the minima of the parts below it', show: v => v.method === 'threshold' && v.negative },
      { key: 'width', label: 'Minimal peak width (samples)', type: 'number', value: cur.width, min: 1, max: 10000, step: 1, show: is('threshold') },
      unitW ? { key: 'units', label: `Minimal peak width (${d.xUnit || 'signal units'})`, type: 'number', value: r6(cur.width * unitW), min: 0, show: is('threshold') } : null,
      { key: 'multiple', label: 'Allow multiple peaks inside one threshold crossing', type: 'check', value: cur.multiple, show: is('threshold') },
      // Prominence
      { type: 'info', label: 'Local maxima that rise far enough above the valleys beside them – finds peaks on a sloping or wandering baseline.', show: is('prominence') },
      { key: 'prom', label: 'Minimum prominence', type: 'number', value: r6(cur.prom), min: 0, hint: 'height above the higher of the two lowest points between the peak and the next higher one', show: is('prominence') },
      { key: 'useHeight', label: 'Minimum height', type: 'check', value: cur.useHeight, show: is('prominence') },
      { key: 'height', label: 'Height', type: 'number', value: r6(cur.height), show: v => v.method === 'prominence' && v.useHeight },
      { key: 'minWidth', label: 'Minimum width at half prominence (samples)', type: 'number', value: cur.minWidth, min: 0, hint: '0 = any width', show: is('prominence') },
      // N highest
      { type: 'info', label: 'The highest local maxima – for example the strongest lines of a spectrum.', show: is('topn') },
      { key: 'count', label: 'Number of peaks', type: 'number', value: cur.count, min: 1, max: 10000, step: 1, show: is('topn') },
      { key: 'distance', label: 'Minimum distance between peaks (samples)', type: 'number', value: cur.distance, min: 1, step: 1, hint: 'of two closer peaks the higher one is kept', show: v => v.method === 'prominence' || v.method === 'topn' },
      // Slope
      { type: 'info', label: 'Points where the smoothed slope turns from rising to falling – robust against noise on broad peaks.', show: is('slope') },
      { key: 'smooth', label: 'Smoothing width (samples)', type: 'number', value: cur.smooth, min: 1, max: 10000, step: 1, show: is('slope') },
      { key: 'slope', label: 'Slope threshold', type: 'number', value: cur.slope, min: 0, hint: 'how sharply the smoothed slope must turn (per sample); 0 = any', show: is('slope') },
      { key: 'amp', label: 'Minimum height', type: 'number', value: r6(cur.amp), show: is('slope') },
      // Moving z-score
      { type: 'info', label: 'Samples that leave a moving band of mean ± N standard deviations – for drifting live signals.', show: is('zscore') },
      { key: 'lag', label: 'Window (samples)', type: 'number', value: cur.lag, min: 2, max: 100000, step: 1, hint: 'the moving mean and standard deviation use this many samples', show: is('zscore') },
      { key: 'z', label: 'Threshold (standard deviations)', type: 'number', value: cur.z, min: 0, show: is('zscore') },
      { key: 'influence', label: 'Influence of peaks on the band (0–1)', type: 'number', value: cur.influence, min: 0, max: 1, step: 0.05, hint: '0: peaks do not move the band, 1: fully', show: is('zscore') },
      // Wavelet ridge lines
      { type: 'info', label: 'Peaks that persist across a range of Ricker-wavelet scales – for noisy data with peaks of a known width.', show: is('cwt') },
      { key: 'wmin', label: 'Peak width from (samples)', type: 'number', value: cur.wmin, min: 1, max: 1000, step: 1, show: is('cwt') },
      { key: 'wmax', label: 'Peak width to (samples)', type: 'number', value: cur.wmax, min: 1, max: 1000, step: 1, show: is('cwt') },
      { key: 'snr', label: 'Minimum signal-to-noise ratio', type: 'number', value: cur.snr, min: 0, show: is('cwt') },
      // all methods
      { type: 'section', label: 'All methods' },
      { key: 'negative', label: 'Detect negative peaks (valleys)', type: 'check', value: cur.negative },
      { key: 'refine', label: 'Peak position', type: 'select', options: [['none', 'At the sample'], ['parabolic', 'Between samples (parabola)'], ['gaussian', 'Between samples (Gaussian)']], value: cur.refine || 'none' }].filter(Boolean),
      validate: v => {
        const m = v.method;
        if (m === 'threshold') return v.pos == null || (v.negative && v.neg == null) ? 'Enter the thresholds' : v.width == null || v.width < 1 || v.width > 10000 ? 'Minimal peak width: 1 to 10000 samples' : null;
        if (m === 'prominence') return !(v.prom >= 0) ? 'Minimum prominence must be 0 or more' : v.useHeight && v.height == null ? 'Enter the minimum height' : !(v.distance >= 1) ? 'Minimum distance: at least 1 sample' : !(v.minWidth >= 0) ? 'Minimum width must be 0 or more' : null;
        if (m === 'topn') return !(v.count >= 1) ? 'Number of peaks: at least 1' : !(v.distance >= 1) ? 'Minimum distance: at least 1 sample' : null;
        if (m === 'slope') return !(v.smooth >= 1) ? 'Smoothing width: at least 1 sample' : !(v.slope >= 0) ? 'Slope threshold must be 0 or more' : null;
        if (m === 'zscore') return !(v.lag >= 2) ? 'Window: at least 2 samples' : !(v.z >= 0) ? 'Threshold must be 0 or more' : !(v.influence >= 0 && v.influence <= 1) ? 'Influence: 0 to 1' : null;
        if (m === 'cwt') return !(v.wmin >= 1 && v.wmax >= v.wmin && v.wmax <= 1000) ? 'Peak widths: from 1 to 1000 samples, "to" not below "from"' : !(v.snr >= 0) ? 'Signal-to-noise ratio must be 0 or more' : null;
        return null;
      } });
    if (!v) return;
    // the width can be entered in samples or in signal units; the field that was changed wins
    let width = Math.round(v.width ?? cur.width);
    if (unitW && v.units != null && Math.abs(v.units - r6(cur.width * unitW)) > 1e-12 && width === cur.width) width = Math.max(1, Math.min(10000, Math.round(v.units / unitW)));
    const keep = (k, f = x => x) => v[k] != null ? f(v[k]) : cur[k];
    APP.setPeaks(w, { on: v.on, method: v.method, pos: keep('pos'), neg: keep('neg'), width, multiple: keep('multiple'), negative: v.negative,
      prom: keep('prom'), useHeight: keep('useHeight'), height: keep('height'), distance: keep('distance', Math.round), minWidth: keep('minWidth'),
      count: keep('count', Math.round), smooth: keep('smooth', Math.round), slope: keep('slope'), amp: keep('amp'), lag: keep('lag', Math.round), z: keep('z'),
      influence: keep('influence'), wmin: keep('wmin', Math.round), wmax: keep('wmax', Math.round), snr: keep('snr'), refine: v.refine });
    if (v.on) { const n = APP.peaksOf(w).idx.length; toast(`${n} peak${n === 1 ? '' : 's'} in the visible part`); }
  }
  async function copyPeaks() { // X / Y of the detected peaks, tab-separated
    const w = need('1d'), d = w.data, pk = APP.peaksOf(w);
    if (!pk || !pk.x.length) throw new Error('No peaks detected in the visible part.');
    const valleys = pk.neg && pk.neg.some(Boolean), u = s => s ? ` (${s})` : '';
    const rows = [['X' + u(d.xUnit), 'Y' + u(d.yUnit)].concat(valleys ? ['Type'] : []).join('\t')];
    pk.x.forEach((x, k) => rows.push([IO.fmtNum(x), IO.fmtNum(pk.y[k])].concat(valleys ? [pk.neg[k] ? 'valley' : 'peak'] : []).join('\t')));
    await navigator.clipboard.writeText(rows.join('\n')); toast(`${pk.x.length} peak${pk.x.length === 1 ? '' : 's'} copied (tab-separated)`);
  }

  async function simpleTool(type, title, fields, map) {
    const w = need(['resample', 'fftfilter', 'integral', 'differentiate', 'envelope', 'instfreq', 'autocorr', 'srs', 'overtime', 'octave'].includes(type) ? 'uniform' : '1d');
    let params = {};
    if (fields) { const v = await dialog({ title, fields: typeof fields === 'function' ? fields(w) : fields }); if (!v) return; params = map ? map(v, w) : v; }
    return APP.derive(w, type, params);
  }

  async function generatorDialog() {
    const v = await dialog({ title: 'Signal generator', fields: [
      { key: 'type', label: 'Signal type', type: 'select', options: DSP.GENERATOR_TYPES, value: 'Sine' },
      { key: 'sampleRate', label: 'Sampling rate (Hz)', type: 'number', value: 44100, min: 1 },
      { key: 'seconds', label: 'Length (sec)', type: 'number', value: 1, min: 0 },
      { key: 'minAmp', label: 'Min. amplitude', type: 'number', value: -1 },
      { key: 'maxAmp', label: 'Max. amplitude', type: 'number', value: 1 },
      { key: 'frequency', label: 'Frequency (Hz)', type: 'number', value: 1000, min: 0, show: v => /Sine|Cosine|Square|Triang|Saw/.test(v.type) },
      { key: 'sweepStart', label: 'Sweep start (Hz)', type: 'number', value: 20, min: 0, show: v => v.type === 'Sweep signal' },
      { key: 'sweepEnd', label: 'Sweep end (Hz)', type: 'number', value: 20000, min: 0, show: v => v.type === 'Sweep signal' },
      { key: 'sweepType', label: 'Sweep type', type: 'select', options: ['Linear', 'Logarithmic'], value: 'Logarithmic', show: v => v.type === 'Sweep signal' }],
      validate: v => !(v.sampleRate > 0) ? 'Sampling rate must be positive' : !(v.seconds > 0) || v.seconds * v.sampleRate > 5e7 ? 'Length must be > 0 and at most 50 M samples' :
        v.type === 'Sweep signal' && v.sweepType === 'Logarithmic' && !(v.sweepStart > 0) ? 'Logarithmic sweep needs a start frequency > 0' : null, ok: 'Generate' });
    if (!v) return;
    v.seed = Math.floor(Math.random() * 1e9);
    const y = DSP.generate(v);
    APP.openSignal(y, v.sampleRate, v.type === 'Sweep signal' ? `${v.sweepType} sweep ${v.sweepStart}–${v.sweepEnd} Hz` : /noise|Step|Constant/.test(v.type) ? v.type : `${v.type} ${v.frequency} Hz`, { type: 'generator', params: v });
  }

  async function calculatorDialog() {
    const list = [...S.wins.values()].filter(w => w.kind === '1d');
    if (!list.length) throw new Error('Open at least one signal window first.');
    const examples = 'Examples:  W1 + W2   ·   2*W1 - 0.5   ·   abs(W1)^2   ·   sqrt(W1*W1 + W2*W2)   ·   xcorr(W1, W2)   ·   coherence(W1, W2, 1024)   ·   frfmag(W1, W2)   ·   dbr(W2, W1)';
    const v = await dialog({ title: 'Signal calculator', intro: 'Windows: ' + list.map(w => `${w.label} = ${w.title}`).join('   ·   '), fields: [
      { key: 'expr', label: 'Expression', type: 'textarea', rows: 3, wide: true, value: (S.active && S.active.kind === '1d' ? S.active.label : list[0].label) + ' * 2' },
      { type: 'info', label: examples },
      { type: 'info', label: 'Functions: ' + EXPR.FUNCTIONS.join(', ') }],
      validate: v => { try { const ast = EXPR.parse(v.expr); const r = EXPR.refs(ast); if (!r.size) return 'Reference at least one window (W1, W2, …)'; for (const n of r) if (!S.wins.get(n)) return `Window W${n} does not exist`; } catch (e) { return e.message; } return null; },
      ok: 'Calculate' });
    if (!v) return;
    const refs = [...EXPR.refs(EXPR.parse(v.expr))];
    APP.createWindow({ kind: '1d', title: '= ' + v.expr, op: { type: 'calc', params: { expr: v.expr } }, parents: refs });
  }

  async function addInstrument(name) {
    const w = need();
    if (w.kind !== '1d') throw new Error('Instruments measure a signal or spectrum window.');
    const I = INSTRUMENTS[name];
    if (I.timeOnly && (w.data.xUnit !== 's' || w.data.x)) throw new Error(name + ' needs a time-signal window as parent.');
    let arg = null;
    if (I.arg) {
      const def = name === 'Value at' ? (w.fixedCursor ?? (w.view.x0 + w.view.x1) / 2) : name === 'Quantile value' ? 0.9 : name === 'RMS of a frequency range' ? '0-1000' : 0;
      const v = await dialog({ title: name, fields: [{ key: 'a', label: I.arg, type: name === 'RMS of a frequency range' ? 'text' : 'number', value: def }] });
      if (!v) return; arg = v.a;
    }
    APP.derive(w, 'instrument', { instrument: name, arg });
  }

  async function instrumentProps(w) {
    const d = w.display, c = d.crit || { from: 0, to: 0, inside: false };
    const v = await dialog({ title: 'Instrument properties – ' + w.label, fields: [
      { key: 'gauge', label: 'Instrument type', type: 'radio', options: [['num', 'Numerical'], ['gauge', 'Circular gauge (analog style)']], value: d.gauge ? 'gauge' : 'num' },
      { key: 'auto', label: 'Automatic gauge range', type: 'check', value: !d.gaugeRange, show: v => v.gauge === 'gauge' },
      { key: 'gmin', label: 'Range from', type: 'number', value: d.gaugeRange ? d.gaugeRange[0] : 0, show: v => v.gauge === 'gauge' && !v.auto },
      { key: 'gmax', label: 'Range to', type: 'number', value: d.gaugeRange ? d.gaugeRange[1] : 1, show: v => v.gauge === 'gauge' && !v.auto },
      { key: 'statMode', label: 'Show as', type: 'select', options: [['current', 'Current value'], ['average', 'Average value'], ['minimum', 'Minimum value'], ['maximum', 'Maximum value']], value: d.statMode },
      { key: 'showMarker', label: 'Show marker in the parent window', type: 'check', value: d.showMarker },
      { type: 'section', label: 'Critical value range (window turns red)' },
      { key: 'critOn', label: 'Enable critical range', type: 'check', value: !!d.crit },
      { key: 'critFrom', label: 'From', type: 'number', value: c.from, show: v => v.critOn },
      { key: 'critTo', label: 'To', type: 'number', value: c.to, show: v => v.critOn },
      { key: 'critInside', label: 'Alarm when value is', type: 'select', options: [['in', 'Inside this range'], ['out', 'Outside this range']], value: c.inside ? 'in' : 'out', show: v => v.critOn }],
      extra: [{ label: 'Reset statistics', run: () => { w.state.hist = []; APP.requestRender(w); toast('Statistics reset'); } }] });
    if (!v) return;
    Object.assign(d, { gauge: v.gauge === 'gauge', gaugeRange: v.gauge === 'gauge' && !v.auto ? [v.gmin, v.gmax] : null, statMode: v.statMode, showMarker: v.showMarker,
      crit: v.critOn ? { from: v.critFrom, to: v.critTo, inside: v.critInside === 'in' } : null });
    APP.requestRender(w); w.parents.forEach(p => S.wins.get(p) && APP.requestRender(S.wins.get(p)));
  }

  async function axesDialog() {
    const w = need();
    if (w.kind === '3d') {
      const z = w.display.zFixed || w.data.zAuto;
      const v = await dialog({ title: 'Adjust Z-axis (colour range)', fields: [
        { key: 'auto', label: 'Auto', type: 'check', value: !w.display.zFixed },
        { key: 'min', label: 'Min (dB)', type: 'number', value: +z[0].toFixed(1), show: v => !v.auto },
        { key: 'max', label: 'Max (dB)', type: 'number', value: +z[1].toFixed(1), show: v => !v.auto },
        { key: 'xLabel', label: 'X label', type: 'text', value: w.display.xLabel ?? '' },
        { key: 'yLabel', label: 'Y label', type: 'text', value: w.display.yLabel ?? '' }],
        validate: v => !v.auto && !(v.max > v.min) ? 'Max must be larger than min' : null });
      if (!v) return;
      w.display.zFixed = v.auto ? null : [v.min, v.max]; w.display.xLabel = v.xLabel || null; w.display.yLabel = v.yLabel || null;
      return APP.requestRender(w);
    }
    if (w.kind !== '1d') throw new Error('Axes settings apply to signal windows.');
    const d = w.display;
    const v = await dialog({ title: 'Axes settings – ' + w.label, fields: [
      { type: 'section', label: 'X-axis' },
      { key: 'logX', label: 'Logarithmic X-axis', type: 'check', value: d.logX },
      { key: 'xLabel', label: 'X label', type: 'text', value: d.xLabel ?? (w.data.xUnit || '') },
      { type: 'section', label: 'Y-axis' },
      { key: 'fixed', label: 'Fixed min/max (no auto-scale)', type: 'check', value: !!d.fixedY },
      { key: 'min', label: 'Min', type: 'number', value: d.fixedY ? d.fixedY.min : +w.view.y0.toPrecision(4), show: v => v.fixed },
      { key: 'max', label: 'Max', type: 'number', value: d.fixedY ? d.fixedY.max : +w.view.y1.toPrecision(4), show: v => v.fixed },
      { key: 'logY', label: 'Logarithmic Y-axis', type: 'check', value: d.logY },
      { key: 'yLabel', label: 'Y label', type: 'text', value: d.yLabel ?? (w.data.yUnit || '') }],
      validate: v => v.fixed && !(v.max > v.min) ? 'Max must be larger than min' : v.fixed && v.logY && v.min <= 0 ? 'Logarithmic axis needs min > 0' : null });
    if (!v) return;
    Object.assign(d, { logX: v.logX, logY: v.logY, xLabel: v.xLabel, yLabel: v.yLabel, fixedY: v.fixed ? { min: v.min, max: v.max } : null, zoomY: null });
    APP.resetView(w);
  }

  async function properties() {
    const w = need();
    if (w.kind === 'instrument') return instrumentProps(w);
    if (w.op && !w.frozen) {
      const t = w.op.type;
      if (t === 'fft') {
        const v = await dialog({ title: 'FFT properties – ' + w.label, fields: spectralFields(w.op.params), validate: spectralValidate, ok: 'Apply' });
        if (!v) return; const named = w.title !== w.opLabel; w.op.params = cleanSpectral(v); w.state = {}; if (!named) w.title = OPS.fft.label(w.op.params); w.updateTitle();
        if (v.toFreq > 0) { w.autoX = false; w.view.x0 = v.fromFreq; w.view.x1 = v.toFreq; } else w.autoX = true;
        return APP.queueCompute(w);
      }
      if (t === 'fftfilter') return fftFilterDialog(w);
      if (t === 'iirfilter') return iirFilterDialog(w);
      if (t === 'spectrogram') {
        const p = w.op.params;
        const v = await dialog({ title: 'Spectrogram properties – ' + w.label, fields: [
          { key: 'segmentLength', label: 'FFT segment length (samples)', type: 'select', options: [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384], value: p.segmentLength },
          { key: 'overlap', label: 'Overlap (%)', type: 'number', value: p.overlap, min: 0, max: 95 },
          { key: 'window', label: 'Window', type: 'select', options: DSP.WINDOWS, value: p.window }], ok: 'Apply' });
        if (!v) return; const named = w.title !== w.opLabel; Object.assign(p, v, { segmentLength: +v.segmentLength }); if (!named) w.title = OPS.spectrogram.label(p); w.updateTitle(); return APP.queueCompute(w);
      }
      if (t === 'calc') {
        const v = await dialog({ title: 'Edit calculator expression', fields: [{ key: 'expr', label: 'Expression', type: 'textarea', rows: 3, wide: true, value: w.op.params.expr }],
          validate: v => { try { EXPR.parse(v.expr); } catch (e) { return e.message; } return null; } });
        if (!v) return;
        const refs = [...EXPR.refs(EXPR.parse(v.expr))];
        if (refs.some(n => !S.wins.get(n))) throw new Error('Expression references a window that does not exist');
        APP.unlink(w); w.frozen = false; w.parents = refs; refs.forEach(n => S.wins.get(n).children.add(w.id));
        const named = w.title !== w.opLabel && w.title !== '= ' + w.op.params.expr; w.op.params.expr = v.expr; if (!named) w.title = '= ' + v.expr; w.updateTitle(); return APP.queueCompute(w);
      }
    }
    // Generic info dialog
    const d = w.data || {}, n = d.y ? d.y.length : 0, st = d.y ? DSP.stats(d.y) : null;
    const lines = [
      `Window: ${w.label} – ${w.title}`, w.opLabel ? 'Operation: ' + w.opLabel : 'Source: ' + (w.source ? w.source.type : 'derived'),
      w.parents.length ? 'Parent(s): ' + w.parents.map(p => 'W' + p).join(', ') : null, w.children.size ? 'Children: ' + [...w.children].map(c => 'W' + c).join(', ') : null,
      n ? `Values: ${n}` + (d.x ? '' : `   ·   Δx ${PLOT.fmt(d.dx, d.dx)} ${d.xUnit || ''}   ·   ${d.xUnit === 's' ? 'rate ' + PLOT.fmt(1 / d.dx, 1 / d.dx) + ' Hz   ·   duration ' + PLOT.fmt(n * d.dx, n * d.dx) + ' s' : ''}`) : null,
      st ? `Min ${PLOT.fmt(st.min, st.max - st.min)}   ·   Max ${PLOT.fmt(st.max, st.max - st.min)}   ·   Mean ${PLOT.fmt(st.mean, st.std)}   ·   RMS ${PLOT.fmt(st.rms, st.rms)}` : null
    ].filter(Boolean);
    const v = await dialog({ title: 'Properties – ' + w.label, fields: [...lines.map(l => ({ type: 'info', label: l })), { key: 'title', label: 'Window title', type: 'text', value: w.title }], ok: 'Apply' });
    if (v && v.title.trim()) { w.title = v.title.trim(); w.updateTitle(); APP.S.listeners.forEach(f => f()); }
  }

  async function sampleRateChange() {
    const w = need('uniform');
    if (w.op && !w.frozen) throw new Error('The sample rate can only be changed on source windows (open/generated signals). Unlink this window first (Alt+U).');
    const v = await dialog({ title: 'Sample rate change (without resampling)', fields: [{ key: 'fs', label: 'Samples per ' + (w.data.xUnit || 'unit'), type: 'number', value: +(1 / w.data.dx).toPrecision(10), min: 0 }], validate: v => v.fs > 0 ? null : 'Must be positive' });
    if (!v) return; APP.replaceSourceData(w, w.data.y, v.fs); APP.resetView(w);
  }

  async function zoomToSamples() {
    const w = need('uniform'), d = w.data;
    const v = await dialog({ title: 'Zoom to defined samples/values length', fields: [
      { key: 'p2', label: 'Choose power-of-2 samples count', type: 'select', options: [['', '—'], ...[64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072].map(n => [n, n])], value: '' },
      { key: 'n', label: '…or enter number of samples', type: 'number', value: '', min: 2, step: 1 },
      { key: 'len', label: '…or length in signal units (' + (d.xUnit || 'x') + ')', type: 'number', value: '', min: 0 }] });
    if (!v) return;
    const span = v.p2 ? (+v.p2 - 1) * d.dx : v.n ? (v.n - 1) * d.dx : v.len;
    if (!(span > 0)) return;
    APP.setViewX(w, w.view.x0, w.view.x0 + span);
  }

  async function goToSample() {
    const w = need('uniform'), d = w.data;
    const v = await dialog({ title: 'Go to sample', fields: [
      { key: 'mode', label: 'Position in', type: 'radio', options: [['units', 'Signal units (' + (d.xUnit || 'x') + ')'], ['samples', 'Samples']], value: 'units' },
      { key: 'pos', label: 'Position', type: 'number', value: +w.view.x0.toPrecision(8) },
      { key: 'how', label: 'Set as', type: 'radio', options: [['left', 'Leftmost value'], ['center', 'Center value']], value: 'left' }] });
    if (!v) return;
    const x = v.mode === 'samples' ? d.x0 + v.pos * d.dx : v.pos, span = w.view.x1 - w.view.x0;
    const x0 = v.how === 'center' ? x - span / 2 : x;
    APP.setViewX(w, x0, x0 + span);
  }

  async function extractPart() {
    const w = need('uniform');
    const v = await dialog({ title: 'Extract signal part (from–to)', intro: 'Creates a linked window that always shows this part of the parent signal.', fields: [
      { key: 'from', label: 'From (' + (w.data.xUnit || 'x') + ')', type: 'number', value: +w.view.x0.toPrecision(8) },
      { key: 'to', label: 'To (' + (w.data.xUnit || 'x') + ')', type: 'number', value: +w.view.x1.toPrecision(8) }],
      validate: v => v.to > v.from ? null : '"To" must be larger than "From"' });
    if (v) APP.derive(w, 'extract', v);
  }

  async function overlayDialog() {
    const w = need('1d'), others = [...S.wins.values()].filter(o => o !== w && o.kind === '1d');
    if (!others.length) throw new Error('No other signal windows to overlay.');
    const v = await dialog({ title: 'Show signals as overlay in ' + w.label, fields: others.map(o => ({ key: 'w' + o.id, label: `${o.label} – ${o.title}`, type: 'check', value: w.display.overlays.includes(o.id) })) });
    if (!v) return;
    w.display.overlays = others.filter(o => v['w' + o.id]).map(o => o.id);
    w.autoY = true; APP.requestRender(w);
  }

  async function linkDialog() {
    const w = need();
    if (!w.op) throw new Error('Source windows have no parent. Select a derived window (FFT, filter, instrument, …).');
    const cands = [...S.wins.values()].filter(o => o !== w && (o.kind === '1d' || (w.op.type === 'slice' && o.kind === '3d')));
    if (!cands.length) throw new Error('No possible parent windows.');
    const v = await dialog({ title: 'Link ' + w.label + ' to parent', intro: `"${w.opLabel}" will be recalculated from the chosen window and follow its changes.`, fields: [
      { key: 'p', label: 'Parent window', type: 'select', options: cands.map(o => [o.id, `${o.label} – ${o.title}`]), value: w.parents[0] || cands[0].id }] });
    if (v) APP.link(w, S.wins.get(+v.p));
  }

  async function acquisitionDialog() {
    let devices = [];
    try { devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch (e) { /* no device list */ }
    const v = await dialog({ title: 'Data acquisition (audio input)', intro: 'Records from a microphone or line input. Linked windows (FFT, spectrogram, instruments) update in real time.', fields: [
      { key: 'deviceId', label: 'Input device', type: 'select', options: [['', 'Default input'], ...devices.map((d, i) => [d.deviceId, d.label || 'Input ' + (i + 1)])], value: '' },
      { key: 'channels', label: 'Channels', type: 'select', options: [[1, 'Mono'], [2, 'Stereo (two windows)']], value: 1 },
      { key: 'sampleRate', label: 'Sample rate', type: 'select', options: [[0, 'Device default'], [8000, '8000 Hz'], [16000, '16000 Hz'], [22050, '22050 Hz'], [44100, '44100 Hz'], [48000, '48000 Hz'], [96000, '96000 Hz']], value: 0 },
      { key: 'mode', label: 'Acquisition mode', type: 'radio', options: [['continuous', 'Continuous acquisition (keep last N sec)'], ['block', 'Continuous, keep only last block (N samples)'], ['timed', 'Timed acquisition (acquire N sec, then stop)']], value: 'continuous' },
      { key: 'seconds', label: 'N seconds', type: 'number', value: 2, min: 0.05, show: v => v.mode !== 'block' },
      { key: 'blockSize', label: 'N samples', type: 'select', options: [1024, 2048, 4096, 8192, 16384, 32768], value: 4096, show: v => v.mode === 'block' },
      { key: 'fft', label: 'Open a linked FFT window', type: 'check', value: true }],
      ok: 'Start acquisition', validate: v => v.mode !== 'block' && !(v.seconds > 0 && v.seconds <= 600) ? 'Seconds must be between 0 and 600' : null });
    if (!v) return;
    const wins = await APP.startAcquisition({ deviceId: v.deviceId, channels: +v.channels, sampleRate: +v.sampleRate || 0, mode: v.mode, seconds: v.seconds, blockSize: +v.blockSize });
    if (v.fft) wins.forEach(w => APP.derive(w, 'fft', Object.assign({}, S.settings.spectral)));
    toast('Acquisition running – Ctrl+K stops it');
  }

  async function settingsDialog() {
    const s = S.settings;
    const v = await dialog({ title: 'Application settings', fields: [
      { type: 'section', label: 'Display' },
      { key: 'windowStyle', label: 'Window style', type: 'select', options: APP.WINDOW_STYLES, value: s.windowStyle || 'standard', hint: 'also Window ▸ Window style; in dark mode every style uses the dark colours' },
      { key: 'appIcon', label: 'App icon', type: 'radio', cls: 'dlg-icons', wide: true, value: s.appIcon || 'classic', options: root.LOGOS ? root.LOGOS.options() : [['classic', 'Blue wave']],
        hint: 'on the welcome screen, in the About box and the browser tab, and – desktop app – as the window and taskbar icon' },
      { key: 'darkMode', label: 'Dark mode', type: 'select', options: [['off', 'Off'], ['on', 'On'], ['system', 'Follow Windows']], value: s.darkMode || 'off', hint: 'also Window ▸ Dark mode (Ctrl+Shift+D)' },
      { key: 'cursorAllWindows', label: 'Display signal cursor simultaneously in all related windows', type: 'check', value: s.cursorAllWindows },
      { key: 'logXSpectra', label: 'Use log X-axis as default for new spectral windows', type: 'check', value: s.logXSpectra },
      { key: 'colorbar', label: 'Show colour map by default in 3D graphics', type: 'check', value: s.colorbar },
      { key: 'freqDown', label: 'Spectrogram frequency axis pointing down', type: 'check', value: s.freqDown },
      { key: 'enhanceLow', label: 'Enhance visibility of low-amplitude values in 3D (default)', type: 'check', value: s.enhanceLow },
      { key: 'palette', label: 'Default 3D palette', type: 'select', options: Object.keys(PLOT.PALETTES), value: s.palette },
      { key: 'digits', label: 'Significant digits for instrument values', type: 'number', value: s.digits, min: 2, max: 15, step: 1 },
      { type: 'section', label: 'Play & navigate' },
      { key: 'step', label: 'Step when playing without sound (% of visible width)', type: 'number', value: s.step, min: 1, max: 100 },
      { key: 'autoVolume', label: 'Adjust volume automatically for audio playback', type: 'check', value: s.autoVolume },
      { key: 'playLoop', label: 'Play in loop', type: 'check', value: s.playLoop }],
      extra: [{ label: 'Spectral analysis defaults…', run: () => spectralDefaults() }] });
    if (!v) return;
    Object.assign(s, v, { digits: Math.round(v.digits) || 6 }); APP.saveSettings(); APP.applyTheme(); if (root.LOGOS) root.LOGOS.apply();
  }

  /* ---------- 3D tools ---------- */
  function extractCursor(axis, atMax) {
    const w = need('3d'), sg = w.data.sg;
    let at;
    if (atMax) {
      let best = -Infinity, bt = 0, bk = 0;
      for (const r of sg.rows) for (let k = 1; k < sg.bins; k++) if (r.v[k] > best) { best = r.v[k]; bt = r.t; bk = k; }
      at = axis === 'x' ? bt : (sg.f0 || 0) + bk * sg.df;
    } else {
      const c = w.fixedCursor3 || { x: (w.view.x0 + w.view.x1) / 2, y: (w.view.y0 + w.view.y1) / 2 };
      at = axis === 'x' ? c.x : c.y;
    }
    APP.derive(w, 'slice', { axis, at });
  }

  /* ---------- Examples (built programmatically – no bundled media) ---------- */
  const EXAMPLES = {
    'Simple FFT with instruments': () => {
      const fs = 8000, y = DSP.generate({ type: 'Sine', sampleRate: fs, seconds: 2, frequency: 440, minAmp: -1, maxAmp: 1 }), n = DSP.generate({ type: 'Gaussian noise', sampleRate: fs, seconds: 2, minAmp: -0.2, maxAmp: 0.2, seed: 7 });
      for (let i = 0; i < y.length; i++) y[i] += n[i];
      const s = APP.openSignal(y, fs, 'Sine 440 Hz + noise', { type: 'generator' });
      const f = APP.derive(s, 'fft', Object.assign({}, S.settings.spectral, { type: 'Magnitude', dB: true }));
      APP.derive(f, 'instrument', { instrument: 'Maximum position (interpolated)' });
      APP.derive(s, 'instrument', { instrument: 'RMS' });
      APP.setViewX(s, 0, 0.05);
    },
    'Spectrogram of a logarithmic sweep': () => {
      const fs = 22050, y = DSP.generate({ type: 'Sweep signal', sampleRate: fs, seconds: 4, sweepStart: 50, sweepEnd: 10000, sweepType: 'Logarithmic' });
      const s = APP.openSignal(y, fs, 'Log sweep 50 Hz – 10 kHz', { type: 'generator' });
      APP.derive(s, 'spectrogram', { segmentLength: 512, overlap: 75, window: 'Hann' });
    },
    'Time FFT (mesh view) of a chirp': () => {
      const fs = 8000, y = DSP.generate({ type: 'Sweep signal', sampleRate: fs, seconds: 3, sweepStart: 200, sweepEnd: 3000, sweepType: 'Linear' });
      const s = APP.openSignal(y, fs, 'Linear chirp 200–3000 Hz', { type: 'generator' });
      APP.derive(s, 'spectrogram', { segmentLength: 256, overlap: 50, window: 'Hann', mesh: true }, { display: { mode: 'mesh' } });
    },
    'Filters (FFT and IIR)': () => {
      const fs = 8000, a = DSP.generate({ type: 'White noise', sampleRate: fs, seconds: 2, seed: 3 });
      const s = APP.openSignal(a, fs, 'White noise', { type: 'generator' });
      const lp = APP.derive(s, 'fftfilter', { type: 'lowpass', f1: 800, f2: 0, slope: 100, stopDb: 200 });
      const bp = APP.derive(s, 'iirfilter', { type: 'bandpass', order: 6, f1: 1500, f2: 2500 });
      APP.derive(lp, 'fft', Object.assign({}, S.settings.spectral, { averageSegments: true, segmentCount: 16 }));
      APP.derive(bp, 'fft', Object.assign({}, S.settings.spectral, { averageSegments: true, segmentCount: 16 }));
    },
    'Harmonic distortion (THD) of a clipped sine': () => {
      const fs = 48000, y = DSP.generate({ type: 'Sine', sampleRate: fs, seconds: 1, frequency: 1000, minAmp: -1.4, maxAmp: 1.4 });
      for (let i = 0; i < y.length; i++) y[i] = Math.max(-1, Math.min(1, y[i]));
      const s = APP.openSignal(y, fs, 'Clipped sine 1 kHz', { type: 'generator' });
      APP.derive(s, 'fft', Object.assign({}, S.settings.spectral, { window: 'Blackman-Harris', type: 'Magnitude', dB: true }));
      APP.derive(s, 'instrument', { instrument: 'Total Harmonic Distortion (THD)' });
      APP.derive(s, 'instrument', { instrument: 'Signal-To-Noise Ratio (SNR)' });
      APP.setViewX(s, 0, 0.005);
    },
    '1/3 octave and A-weighted level of pink noise': () => {
      const fs = 48000, y = DSP.generate({ type: 'Pink noise', sampleRate: fs, seconds: 3, seed: 11 });
      const s = APP.openSignal(y, fs, 'Pink noise', { type: 'generator' });
      APP.derive(s, 'octave', { fraction: 3, weighting: null });
      APP.derive(s, 'octave', { fraction: 3, weighting: 'A' });
      APP.derive(s, 'instrument', { instrument: 'Overall dB(A)' });
    },
    'Signal calculator: cross-spectral analysis': () => {
      const fs = 4000, x = DSP.generate({ type: 'White noise', sampleRate: fs, seconds: 4, seed: 5 });
      const a = APP.openSignal(x, fs, 'System input (noise)', { type: 'generator' });
      const b = APP.derive(a, 'iirfilter', { type: 'lowpass', order: 4, f1: 400, f2: 0 });
      APP.createWindow({ kind: '1d', title: `= frfmag(W${a.id}, W${b.id})`, op: { type: 'calc', params: { expr: `frfmag(W${a.id}, W${b.id})` } }, parents: [a.id, b.id] });
      APP.createWindow({ kind: '1d', title: `= coherence(W${a.id}, W${b.id})`, op: { type: 'calc', params: { expr: `coherence(W${a.id}, W${b.id})` } }, parents: [a.id, b.id] });
    }
  };

  /* ---------- Menus ---------- */
  const has1D = () => S.active && S.active.kind === '1d' && S.active.data && S.active.data.y;
  const hasTime = () => has1D() && S.active.data.xUnit === 's' && !S.active.data.x;
  const hasUniform = () => has1D() && !S.active.data.x;
  const hasPeaks = () => has1D() && !!(S.active.display.peaks && S.active.display.peaks.on);
  const has3D = () => S.active && S.active.kind === '3d' && S.active.data;
  const hasWin = () => !!S.active;
  const toolItem = (label, type, fields, map, en) => ({ label, run: () => simpleTool(type, label, fields, map), en: en || has1D });
  const inst = (label, name, en) => ({ label, run: () => addInstrument(name || label), en: en || has1D });
  const style = (label, st) => ({ label, run: () => { const w = need('1d'); w.display.style = st; APP.requestRender(w); }, checked: () => has1D() && S.active.display.style === st, en: has1D });

  const MENUS = [
    { label: 'File', items: [
      { label: 'Open signal…', key: 'Ctrl+O', run: () => pickFiles('.wav,.wave,.csv,.txt,.dat,.bin,.raw,.sig,.json,.osw,.ost,.osgeo') },
      '-',
      { label: 'ASCII / CSV files', sub: [
        { label: 'Import ASCII / CSV…', run: () => pickFiles('.csv,.txt,.dat,.asc,.tsv') },
        '-',
        { label: 'Export signal as CSV (X/Y values)…', run: () => saveSignal(false), en: has1D },
        { label: 'Export 3D graphics as CSV (XYZ triples)', run: () => export3D('xyz'), en: has3D },
        { label: 'Export 3D graphics as CSV (X/Y matrix)', run: () => export3D('xy'), en: has3D },
        { label: 'Export 3D graphics as CSV (Y/X matrix)', run: () => export3D('yx'), en: has3D }] },
      { label: 'Raw binary files', sub: [
        { label: 'Import', sub: Object.keys(IO.RAW_TYPES).map(t => ({ label: t, run: () => pickFiles('', 'raw:' + t) })) },
        { label: 'Export', sub: Object.keys(IO.RAW_TYPES).map(t => ({ label: t, en: has1D, run: () => { const w = need('1d'); download(safeName(w.title) + '.bin', new Blob([IO.encodeRaw(w.data.y, t)])); } })) }] },
      { label: 'Signal from clipboard data… (ASCII / CSV)', key: HOSTED ? 'Ctrl+N' : '', run: fromClipboard },
      '-',
      { label: 'Save signal as…', key: 'Ctrl+S', run: () => saveSignal(false), en: has1D },
      { label: 'Save visible signal part as…', run: () => saveSignal(true), en: has1D },
      '-',
      { label: 'Save workspace (with data)…', key: 'Ctrl+I', run: () => { if (!S.wins.size) throw new Error('Nothing to save'); download(wsFileName(), JSON.stringify(APP.serialize(true)), 'application/json'); } },
      { label: 'Load workspace…', key: HOSTED ? 'Ctrl+W' : 'Ctrl+L', run: () => pickFiles('.osw,.json', 'workspace') },
      '-',
      { label: 'Save window as custom tool', sub: [
        { label: 'Window and its subtree…', en: () => S.active && !!S.active.op, run: () => { const w = need(); download(safeName(w.title) + '.ost', JSON.stringify(APP.toolFromWindow(w, true)), 'application/json'); } },
        { label: 'Subtree only…', en: () => S.active && S.active.children.size > 0, run: () => { const w = need(); download(safeName(w.title) + ' tools.ost', JSON.stringify(APP.toolFromWindow(w, false)), 'application/json'); } }] },
      { label: 'Use custom tool from file…', en: hasWin, run: () => pickFiles('.ost,.json', 'tool') },
      '-',
      { label: 'Application settings…', key: HOSTED ? 'F12' : 'Ctrl+,', run: settingsDialog },
      ...(HOSTED ? ['-', { label: 'Exit', key: 'Alt+F4', run: () => window.chrome.webview.postMessage({ type: 'exit' }) }] : [])] },
    { label: 'Data acquisition', items: [
      { label: 'Open data acquisition…', key: 'Ctrl+Q', run: acquisitionDialog },
      { label: 'Stop acquisition', key: 'Ctrl+K', run: () => { APP.stopAcquisition(); toast('Acquisition stopped'); }, en: () => (S.acquisitions || []).length > 0 },
      { label: 'Reset acquisition statistics (peak hold / averager / instruments)', run: () => { S.wins.forEach(w => { w.state = {}; w.history = []; }); toast('Reset'); } }] },
    { label: 'Edit', items: [
      { label: 'Copy picture to clipboard', run: copyPicture, en: hasWin },
      { label: 'Save picture as PNG…', run: savePicture, en: hasWin },
      { label: 'Copy data to clipboard (ASCII / CSV)', key: 'Ctrl+B', run: copyData, en: has1D },
      '-',
      { label: 'Zoom in', key: '+', run: () => APP.zoom(need(), 0.5), en: hasWin },
      { label: 'Zoom out', key: '−', run: () => APP.zoom(need(), 2), en: hasWin },
      { label: 'Zoom to X samples/values…', key: 'Ctrl+2', run: zoomToSamples, en: hasUniform },
      { label: 'Reset zoom', key: 'Dbl-click', run: () => APP.resetView(need()), en: hasWin },
      { label: 'Open selection in new window', key: 'Ctrl+E', run: () => APP.copyVisible(need('1d')), en: has1D },
      { label: 'Extract signal part (from–to)…', run: extractPart, en: hasUniform },
      '-',
      { label: 'Axes settings…', key: 'Ctrl+A', run: axesDialog, en: hasWin },
      { label: 'Sample rate change (w/o resampling)…', run: sampleRateChange, en: hasUniform },
      { label: 'Cursor in "sample" units', run: () => { const w = need('1d'); w.display.sampleUnits = !w.display.sampleUnits; }, checked: () => has1D() && !!S.active.display.sampleUnits, en: hasUniform },
      { label: 'Change window title…', run: properties, en: hasWin },
      { label: 'Display style', sub: [
        style('Line', 'line'), style('Histogram (from zero)', 'hist'), style('Histogram (from bottom)', 'hist-bottom'), style('Area', 'area'), style('Dots', 'dots'),
        { label: 'Show dots', run: () => { const w = need('1d'); w.display.dots = !w.display.dots; APP.requestRender(w); }, checked: () => has1D() && S.active.display.dots, en: has1D },
        '-',
        ...[1, 2, 3].map(n => ({ label: ['Single', 'Double', 'Triple'][n - 1] + ' line width', run: () => { const w = need('1d'); w.display.width = n; APP.requestRender(w); }, checked: () => has1D() && S.active.display.width === n, en: has1D }))] },
      { label: 'Persistence display', run: async () => {
        const w = need('1d');
        const v = await dialog({ title: 'Persistence display settings', fields: [{ key: 'on', label: 'Show persistence display traces', type: 'check', value: w.display.persistence > 0 }, { key: 'n', label: 'Number of traces', type: 'number', value: w.display.persistence || 30, min: 1, max: 200, step: 1, show: v => v.on }] });
        if (v) { w.display.persistence = v.on ? Math.round(v.n) : 0; w.history = []; APP.requestRender(w); }
      }, en: has1D },
      '-',
      { label: 'Properties…', key: 'Ctrl+P', run: properties, en: hasWin }] },
    { label: 'Play & navigate', items: [
      { label: '« Signal beginning', key: 'Home', run: () => { const w = need(); const span = w.view.x1 - w.view.x0, [a] = APP.extentX(w); APP.setViewX(w, a, a + span); }, en: hasWin },
      { label: 'Signal end »', key: 'End', run: () => { const w = need(); const span = w.view.x1 - w.view.x0, [, b] = APP.extentX(w); APP.setViewX(w, b - span, b); }, en: hasWin },
      { label: 'Go to sample…', run: goToSample, en: hasUniform },
      { label: 'Step left / right', key: '← / →', run: () => APP.pan(need(), S.settings.step / 100), en: hasWin },
      '-',
      { label: 'Play signal (no sound)', key: 'F5', run: () => APP.playSilent(need('1d')), en: has1D },
      { label: 'Play as fast as possible (no sound)', run: () => APP.playSilent(need('1d'), true), en: has1D },
      { label: 'Play signal (with sound)', key: 'Alt+F6', run: () => APP.playSound(need('time'), 'all'), en: hasTime },
      { label: 'Play signal (with sound) from cursor position', key: 'F6', run: () => APP.playSound(need('time'), 'cursor'), en: hasTime },
      { label: 'Play visible segment only (with sound)', key: 'Ctrl+Alt+F6', run: () => APP.playSound(need('time'), 'visible'), en: hasTime },
      { label: 'Stop playing', key: 'F7', run: () => APP.stopPlayback() },
      '-',
      { label: 'Play in loop', run: () => { S.settings.playLoop = !S.settings.playLoop; APP.saveSettings(); }, checked: () => S.settings.playLoop },
      { label: 'Adjust volume automatically', run: () => { S.settings.autoVolume = !S.settings.autoVolume; APP.saveSettings(); }, checked: () => S.settings.autoVolume }] },
    { label: 'Signal tools', items: [
      { label: 'Spectral analysis defaults…', run: spectralDefaults },
      { label: 'FFT spectrum analysis', key: 'Ctrl+F', sub: [
        { label: 'FFT with default spectral analysis settings', key: 'Ctrl+F', run: () => fft(), en: hasUniform },
        { label: 'FFT with custom settings…', run: fftWithDialog, en: hasUniform },
        '-',
        ...FFT_VARIANTS.map(([n, p]) => ({ label: n, run: () => fftVariant(n, p), en: hasUniform }))] },
      { label: 'FFT filter…', key: 'Ctrl+Y', run: () => fftFilterDialog(), en: hasUniform },
      { label: 'IIR filter…', run: () => iirFilterDialog(), en: hasUniform },
      toolItem('Autocorrelation', 'autocorr', null, null, hasUniform),
      toolItem('Resample…', 'resample', w => [{ type: 'info', label: 'Current sampling rate: ' + PLOT.fmt(1 / w.data.dx, 1 / w.data.dx) + ' Hz' }, { key: 'fs', label: 'New sampling rate (Hz)', type: 'number', value: Math.round(0.5 / w.data.dx), min: 0 }], v => ({ fs: v.fs }), hasUniform),
      toolItem('Moving average smoothing…', 'movavg', [{ key: 'len', label: 'Sequence length (samples)', type: 'number', value: 15, min: 1, step: 1, hint: 'longer = smoother' }, { key: 'weighting', label: 'Weighting function', type: 'select', options: ['Rectangle', 'Hann', 'Hamming', 'Triangle', 'Gaussian', 'Blackman'], value: 'Rectangle' }], v => ({ len: Math.round(v.len), weighting: v.weighting })),
      toolItem('Remove linear trend', 'detrend'),
      toolItem('Remove peaks…', 'removepeaks', [{ key: 'k', label: 'Clip values further than k × standard deviation from the mean; k =', type: 'number', value: 3, min: 0.1 }]),
      toolItem('Remove DC offset', 'removedc'),
      toolItem('Scale / normalize…', 'scale', [
        { key: 'mode', label: 'Mode', type: 'radio', options: [['range', 'Always scale to this range'], ['coef', 'Scale by coefficients (New = A + B · Old)']], value: 'range' },
        { key: 'preset', label: 'Preset range', type: 'select', options: [['', 'Custom'], ['-1,1', '-1…1'], ['0,1', '0…1'], ['-32768,32767', '16-bit range']], value: '', show: v => v.mode === 'range' },
        { key: 'a', label: 'Min value  /  A (add)', type: 'number', value: -1 }, { key: 'b', label: 'Max value  /  B (multiply)', type: 'number', value: 1 }],
        v => { if (v.mode === 'range' && v.preset) { const [a, b] = v.preset.split(',').map(Number); return { mode: 'range', a, b }; } return { mode: v.mode, a: v.a, b: v.b }; }),
      '-',
      { label: 'Peak hold', run: () => APP.derive(need('1d'), 'peakhold', { min: false }), en: has1D },
      { label: 'Min hold', run: () => APP.derive(need('1d'), 'peakhold', { min: true }), en: has1D },
      toolItem('Averager…', 'averager', [{ key: 'mode', label: 'Type', type: 'radio', options: [['lin', 'Linear average'], ['exp', 'Exponential average']], value: 'lin' }, { key: 'weight', label: 'Weight % for new data', type: 'number', value: 10, min: 1, max: 100, show: v => v.mode === 'exp' }, { key: 'logScale', label: 'Average input values on a logarithmic (dB) scale', type: 'check', value: false }]),
      '-',
      toolItem('Probability distribution / Histogram…', 'histogram', [{ key: 'auto', label: 'Determine number of bins automatically (Sturges)', type: 'check', value: true }, { key: 'bins', label: 'Number of bins', type: 'number', value: 50, min: 2, step: 1, show: v => !v.auto }], v => ({ bins: v.auto ? 0 : Math.round(v.bins) })),
      toolItem('Integral curve', 'integral', null, null, hasUniform),
      toolItem('Differentiate', 'differentiate', null, null, hasUniform),
      toolItem('Sorted values curve', 'sorted'),
      toolItem('Envelope (Hilbert transform)', 'envelope', null, null, hasUniform),
      toolItem('Instantaneous frequency (Hilbert transform)', 'instfreq', null, null, hasTime),
      '-',
      { label: 'Octave plot', run: () => APP.derive(need('time'), 'octave', { fraction: 1, weighting: null }), en: hasTime },
      { label: '1/3 octave plot', run: () => APP.derive(need('time'), 'octave', { fraction: 3, weighting: null }), en: hasTime },
      { label: 'Other octave plots', sub: [6, 9, 12].map(f => ({ label: `1/${f} octave plot`, run: () => APP.derive(need('time'), 'octave', { fraction: f, weighting: null }), en: hasTime })).concat(['-',
        { label: 'Octave / fractional plot with weighting…', en: hasTime, run: async () => { const w = need('time'); const v = await dialog({ title: 'Octave plot', fields: [{ key: 'fraction', label: 'Bandwidth', type: 'select', options: [[1, '1/1 octave'], [3, '1/3 octave'], [6, '1/6 octave'], [9, '1/9 octave'], [12, '1/12 octave']], value: 3 }, { key: 'weighting', label: 'Weighting', type: 'select', options: [['', 'Z (none)'], ['A', 'A-weighting'], ['C', 'C-weighting']], value: 'A' }] }); if (v) APP.derive(w, 'octave', { fraction: +v.fraction, weighting: v.weighting || null }); } }]) },
      toolItem('Instrument values over time…', 'overtime', w => [
        { key: 'instrument', label: 'Instrument value type', type: 'select', options: Object.keys(INSTRUMENTS).filter(n => !INSTRUMENTS[n].arg), value: 'RMS' },
        { key: 'segLen', label: 'Segment length (samples)', type: 'number', value: Math.max(16, Math.round(w.data.y.length / 200)), min: 4, step: 1 },
        { key: 'hop', label: 'Offset between segments (samples)', type: 'number', value: Math.max(8, Math.round(w.data.y.length / 400)), min: 1, step: 1 }],
        v => ({ instrument: v.instrument, segLen: Math.round(v.segLen), hop: Math.round(v.hop) }), hasUniform),
      toolItem('Shock Response Spectrum (SRS)…', 'srs', w => [
        { key: 'fMin', label: 'Min frequency (Hz)', type: 'number', value: 10, min: 0.001 }, { key: 'fMax', label: 'Max frequency (Hz)', type: 'number', value: Math.round(0.4 / w.data.dx) },
        { key: 'perOctave', label: 'Frequency spacing (points per octave)', type: 'select', options: [3, 6, 12, 24], value: 12 }, { key: 'Q', label: 'Q factor', type: 'number', value: 10, min: 0.5 },
        { key: 'mode', label: 'Result', type: 'radio', options: ['Peak absolute', 'Peak positive', 'Peak negative'], value: 'Peak absolute' }],
        v => ({ fMin: v.fMin, fMax: v.fMax, perOctave: +v.perOctave, Q: v.Q, mode: v.mode }), hasTime),
      { label: 'Peak detection…', run: peakDialog, en: has1D, checked: () => hasPeaks() },
      { label: 'Copy detected peaks', run: copyPeaks, en: hasPeaks },
      '-',
      { label: 'Signal generator…', run: generatorDialog },
      { label: 'Signal calculator…', run: calculatorDialog }] },
    { label: 'Instruments', items: [
      inst('Value at (with marker)…', 'Value at'), inst('Mean'), inst('Sum'), inst('Const (level marker)…', 'Const'), inst('Median value'), inst('Quantile value…', 'Quantile value'),
      inst('Standard deviation'), inst('Variance'), inst('Skewness'), inst('Kurtosis'), inst('RMS - normalized'), inst('RMS'), inst('RMS of a frequency range…', 'RMS of a frequency range'),
      { label: 'Overall dB (weighted)', sub: [inst('dB(A)', 'Overall dB(A)'), inst('dB(C)', 'Overall dB(C)'), inst('dB(Z)', 'Overall dB(Z)')] },
      inst('Crest factor'), inst('Integral', null, hasUniform), '-',
      inst('Signal-To-Noise Ratio (SNR)', null, hasTime), inst('Total Harmonic Distortion (THD)', null, hasTime), inst('THD + Noise', null, hasTime), inst('Fundamental frequency', null, hasTime),
      inst('Mean frequency (weighted mean)', 'Mean frequency'), inst('Median frequency (weighted median)', 'Median frequency'), inst('Spectral centroid'), inst('Spectral flatness'), inst('Dominant frequency'), '-',
      inst('Maximum (with marker)', 'Maximum'), inst('Minimum (with marker)', 'Minimum'), inst('Maximum position (with marker)', 'Maximum position'), inst('Maximum position (interpolated)'),
      inst('Minimum position (with marker)', 'Minimum position'), inst('Zero-crossing rate', null, hasTime), inst('Peak-To-Peak'), inst('Peak count', null, hasPeaks), '-',
      { label: 'Statistics (show as…)', sub: [['current', 'Show as current value'], ['average', 'Show as average value'], ['minimum', 'Show as minimum value'], ['maximum', 'Show as maximum value']].map(([m, l]) => ({ label: l, en: () => S.active && S.active.kind === 'instrument', checked: () => S.active && S.active.kind === 'instrument' && S.active.display.statMode === m, run: () => { S.active.display.statMode = m; APP.requestRender(S.active); } })).concat([{ label: 'Reset statistics values', en: () => S.active && S.active.kind === 'instrument', run: () => { S.active.state.hist = []; APP.requestRender(S.active); } }]) }] },
    { label: '3D tools', items: [
      { label: 'Time FFT…', key: 'Ctrl+T', run: () => spectrogramDialog(true), en: hasUniform },
      { label: 'Spectrogram…', key: 'Ctrl+G', run: () => spectrogramDialog(false), en: hasUniform },
      { label: 'Spectrogram with default settings', run: () => spectrogramDialog(false, true), en: hasUniform },
      '-',
      { label: 'Spectrogram view', key: 'F3', run: () => { const w = need('3d'); w.display.mode = 'spectrogram'; APP.requestRender(w); }, checked: () => has3D() && S.active.display.mode === 'spectrogram', en: has3D },
      { label: 'Mesh view', key: 'F2', run: () => { const w = need('3d'); w.display.mode = 'mesh'; APP.requestRender(w); }, checked: () => has3D() && S.active.display.mode === 'mesh', en: has3D },
      { label: 'Cursor', key: 'Tab', run: () => { const w = need('3d'); w.display.crosshair = !w.display.crosshair; if (!w.fixedCursor3) w.fixedCursor3 = { x: (w.view.x0 + w.view.x1) / 2, y: (w.view.y0 + w.view.y1) / 2 }; APP.requestRender(w); }, checked: () => has3D() && S.active.display.crosshair, en: has3D },
      { label: 'Adjust Z-axis…', run: axesDialog, en: has3D },
      '-',
      { label: 'Extract X-cursor (spectrum at cursor time)', run: () => extractCursor('x'), en: has3D },
      { label: 'Extract Y-cursor (level over time at cursor frequency)', run: () => extractCursor('y'), en: has3D },
      { label: 'Extract slice from max X position', run: () => extractCursor('x', true), en: has3D },
      { label: 'Extract slice from max Y position', run: () => extractCursor('y', true), en: has3D },
      '-',
      { label: 'Show colour map', run: () => { const w = need('3d'); w.display.colorbar = !w.display.colorbar; APP.requestRender(w); }, checked: () => has3D() && S.active.display.colorbar, en: has3D },
      { label: 'Invert colours', run: () => { const w = need('3d'); w.display.invert = !w.display.invert; APP.requestRender(w); }, checked: () => has3D() && S.active.display.invert, en: has3D },
      { label: 'Palette', sub: Object.keys(PLOT.PALETTES).map(p => ({ label: p, run: () => { const w = need('3d'); w.display.palette = p; APP.requestRender(w); }, checked: () => has3D() && S.active.display.palette === p, en: has3D }))
        .concat(['-', { label: 'Optimize colours for low amplitudes', run: () => { const w = need('3d'); w.display.enhanceLow = !w.display.enhanceLow; APP.requestRender(w); }, checked: () => has3D() && S.active.display.enhanceLow, en: has3D }]) }] },
    { label: 'System control', items: [
      { label: 'Link window to parent…', key: 'Alt+L', run: linkDialog, en: () => S.active && !!S.active.op },
      { label: 'Unlink window from parent', key: 'Alt+U', run: () => { const w = need(); if (!w.parents.length) throw new Error('This window has no parent.'); APP.unlink(w); toast(w.label + ' unlinked – it keeps its last result'); }, en: () => S.active && S.active.parents.length > 0 },
      { label: 'Show signals as overlay…', run: overlayDialog, en: has1D },
      { label: 'Reset all windows (zoom)', key: 'Ctrl+D', run: () => S.wins.forEach(w => APP.resetView(w)) },
      { label: 'Control window', key: 'Alt+W', run: () => toggleTree(), checked: () => !!(root.CONTROL && root.CONTROL.visible()) }] },
    { label: 'Window', items: [
      { label: 'Cascade', run: () => APP.arrange('cascade') },
      { label: 'Tile', run: () => APP.arrange('tile') },
      { label: 'Dark mode', key: 'Ctrl+Shift+D', run: () => APP.toggleDark(), checked: () => APP.isDark() },
      { label: 'Window style', sub: APP.WINDOW_STYLES.map(([k, label]) => ({ label, checked: () => (S.settings.windowStyle || 'standard') === k, run: () => APP.setWindowStyle(k) })) },
      { label: 'Close all', run: async () => { if (S.wins.size && await confirmBox('Close all windows', 'Close all ' + S.wins.size + ' windows?')) [...S.wins.values()].forEach(APP.closeWindow); } }] },
    { label: 'Help', items: [
      { label: 'Keyboard & mouse…', run: () => root.HELP ? root.HELP.open('keys') : helpDialog() },
      { label: 'Examples', sub: Object.keys(EXAMPLES).map(k => ({ label: k, run: () => EXAMPLES[k]() })) },
      { label: 'About OpenSig…', run: aboutDialog }] }
  ];

  // Submenus are fixed to the viewport (not clipped by the scrolling parent menu): next to the row, kept on screen
  function placeSub(sp, row, parent) {
    const r = row.getBoundingClientRect(), pr = parent.getBoundingClientRect(), sr = sp.getBoundingClientRect();
    sp.style.left = (pr.right - 4 + sr.width > innerWidth ? Math.max(4, pr.left - sr.width + 4) : pr.right - 4) + 'px';
    sp.style.top = Math.max(4, Math.min(r.top - 4, innerHeight - sr.height - 4)) + 'px';
  }

  function buildMenubar() {
    const bar = $('#menubar');
    let openMenu = null;
    const close = () => { if (openMenu) { openMenu.btn.setAttribute('aria-expanded', 'false'); openMenu.pop.remove(); openMenu = null; } };
    const renderItems = (items, depth) => {
      const pop = h('div', { class: 'menu-pop', role: 'menu' });
      for (const it of items) {
        if (it === '-') { pop.append(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
        const enabled = !it.en || it.en();
        const checked = it.checked && it.checked();
        const row = h('button', { class: 'menu-item' + (it.sub ? ' has-sub' : ''), role: 'menuitem', disabled: !enabled && !it.sub },
          h('span', { class: 'menu-check', 'aria-hidden': 'true' }, checked ? '✓' : ''), h('span', { class: 'menu-label' }, it.label),
          h('span', { class: 'menu-key' }, it.sub ? '▸' : macKeys(it.key || '')));
        if (checked) row.setAttribute('aria-checked', 'true');
        if (it.sub) {
          let subPop = null;
          const openSub = () => {
            pop.querySelectorAll(':scope > .menu-pop').forEach(p => p.remove());
            subPop = renderItems(it.sub, depth + 1); pop.append(subPop);
            placeSub(subPop, row, pop);
          };
          row.addEventListener('mouseenter', openSub); row.addEventListener('click', e => { e.stopPropagation(); openSub(); });
        } else {
          row.addEventListener('mouseenter', () => pop.querySelectorAll(':scope > .menu-pop').forEach(p => p.remove()));
          row.addEventListener('click', e => { e.stopPropagation(); close(); closeCtx(); guard(it.run)(); });
        }
        pop.append(row);
      }
      return pop;
    };
    for (const m of MENUS) {
      const btn = h('button', { class: 'menubar-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, m.label);
      const open = () => {
        close(); const pop = renderItems(m.items, 0); pop.classList.add('root');
        const r = btn.getBoundingClientRect(); pop.style.left = r.left + 'px'; pop.style.top = r.bottom + 'px';
        document.body.append(pop); btn.setAttribute('aria-expanded', 'true'); openMenu = { btn, pop };
        const pr = pop.getBoundingClientRect(); if (pr.right > window.innerWidth) pop.style.left = Math.max(4, window.innerWidth - pr.width - 4) + 'px';
      };
      btn.addEventListener('click', e => { e.stopPropagation(); if (openMenu && openMenu.btn === btn) close(); else open(); });
      btn.addEventListener('mouseenter', () => { if (openMenu && openMenu.btn !== btn) open(); });
      bar.append(btn);
    }
    document.addEventListener('click', e => { if (!e.target.closest('.menu-pop')) { close(); closeCtx(); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); closeCtx(); } });
    UI.closeMenus = () => { close(); closeCtx(); };
  }

  // Context menu for a window (⋯ button / right-click): the most relevant commands for its type.
  let ctxPop = null;
  function closeCtx() { if (ctxPop) { ctxPop.remove(); ctxPop = null; } }
  function windowMenu(w, anchor, x, y, top) {
    APP.activate(w); closeCtx();
    const find = (menu, label) => { const m = MENUS.find(mm => mm.label === menu); const walk = items => { for (const it of items) { if (it === '-') continue; if (it.label === label) return it; if (it.sub) { const r = walk(it.sub); if (r) return r; } } return null; }; return walk(m.items); };
    const pick = list => list.map(p => p === '-' ? '-' : find(p[0], p[1])).filter(Boolean);
    let items;
    if (w.kind === 'instrument') items = pick([['Edit', 'Properties…'], ['Instruments', 'Statistics (show as…)'], '-', ['System control', 'Link window to parent…'], ['System control', 'Unlink window from parent'], ['Edit', 'Save picture as PNG…']]);
    else if (w.kind === '3d') items = pick([['3D tools', 'Spectrogram view'], ['3D tools', 'Mesh view'], ['3D tools', 'Palette'], ['3D tools', 'Adjust Z-axis…'], ['3D tools', 'Show colour map'], '-',
      ['3D tools', 'Extract X-cursor (spectrum at cursor time)'], ['3D tools', 'Extract Y-cursor (level over time at cursor frequency)'], '-', ['Edit', 'Properties…'], ['Edit', 'Save picture as PNG…'], ['System control', 'Unlink window from parent']]);
    else items = pick([['Signal tools', 'FFT spectrum analysis'], ['3D tools', 'Spectrogram…'], ['Signal tools', 'FFT filter…'], ['Instruments', 'RMS'], ['Instruments', 'Maximum (with marker)'], ['Signal tools', 'Peak detection…'], '-',
      ['Edit', 'Display style'], ['Edit', 'Axes settings…'], ['Edit', 'Open selection in new window'], ['Play & navigate', 'Play visible segment only (with sound)'], '-',
      ['Edit', 'Properties…'], ['File', 'Save signal as…'], ['Edit', 'Save picture as PNG…'], ['System control', 'Unlink window from parent']]);
    if (UI.extraWindowItems) { const extra = UI.extraWindowItems(w); if (extra.length) items = items.concat(['-'], extra); }
    if (top && top.length) items = top.concat(['-'], items);
    popupMenu(items, anchor, x, y);
  }
  // Popup menu at an element or at (x, y): items like the menu bar's ({label, run, en, checked, key, sub} or '-')
  function popupMenu(items, anchor, x, y) {
    closeCtx();
    const pop = (function render(list) {
      const p = h('div', { class: 'menu-pop root', role: 'menu' });
      for (const it of list) {
        if (it === '-') { p.append(h('div', { class: 'menu-sep' })); continue; }
        const enabled = !it.en || it.en(), checked = it.checked && it.checked();
        const row = h('button', { class: 'menu-item' + (it.sub ? ' has-sub' : ''), role: 'menuitem', disabled: !enabled && !it.sub }, h('span', { class: 'menu-check' }, checked ? '✓' : ''), h('span', { class: 'menu-label' }, it.label), h('span', { class: 'menu-key' }, it.sub ? '▸' : macKeys(it.key || '')));
        if (it.sub) row.addEventListener('mouseenter', () => { p.querySelectorAll(':scope > .menu-pop').forEach(x => x.remove()); const sp = render(it.sub); sp.classList.remove('root'); p.append(sp); placeSub(sp, row, p); });
        else row.addEventListener('click', e => { e.stopPropagation(); closeCtx(); guard(it.run)(); });
        p.append(row);
      }
      return p;
    })(items);
    document.body.append(pop); ctxPop = pop;
    const r = anchor ? anchor.getBoundingClientRect() : { left: x, bottom: y };
    pop.style.left = Math.min(r.left, innerWidth - pop.offsetWidth - 4) + 'px';
    pop.style.top = Math.min(r.bottom, innerHeight - pop.offsetHeight - 4) + 'px';
  }

  /* ---------- Control window (System control ▸ Control window): see control.js ---------- */
  function toggleTree(force, persist = true) { if (root.CONTROL) root.CONTROL.toggle(force, persist); }
  function renderTree() { if (root.CONTROL) root.CONTROL.refresh(); }

  /* ---------- Help ---------- */
  function helpDialog() {
    const rows = [['Drag in a plot', 'Zoom to the selected range (2D) or rectangle (3D)'], ['Double-click a plot', 'Reset zoom'], ['Mouse wheel', 'Zoom X around pointer (Shift+wheel: zoom Y)'],
      ['Right-drag / Ctrl+drag', 'Pan'], ['Click', 'Set cursor (used by "play from cursor", "Value at", 3D extract)'], ['Right-click / ⋯', 'Window menu'],
      ['Drag title bar', 'Move window; double-click maximises'], ['Drop files on the desktop', 'Open WAV, CSV, raw, workspace (.osw) or tool (.ost)'],
      ['Ctrl+O / Ctrl+S', 'Open / save signal'], ['Ctrl+F', 'FFT of the visible part'], ['Ctrl+G / Ctrl+T', 'Spectrogram / Time FFT'], ['Ctrl+Y', 'FFT filter'],
      ['Ctrl+E', 'Open visible part in new window'], ['Ctrl+A / Ctrl+P', 'Axes settings / Properties'], ['Ctrl+B', 'Copy data as CSV'], ['Ctrl+2', 'Zoom to N samples'],
      ['Ctrl+Q / Ctrl+K', 'Start / stop acquisition'], ['F5 / F6 / F7', 'Play (no sound) / play with sound from cursor / stop'], ['Home / End / ← →', 'Navigate'],
      ['F2 / F3 / Tab', 'Mesh / spectrogram view / 3D cursor'], ['Alt+L / Alt+U / Alt+W', 'Link / unlink / control window'], ['Ctrl+I / Ctrl+L', 'Save / load workspace'], ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous workspace tab'], ['Ctrl+D', 'Reset zoom in all windows']];
    return dialog({ title: 'Keyboard & mouse', fields: rows.map(([k, v]) => ({ type: 'info', label: `${k} — ${v}` })), ok: 'Close', cancel: 'Back' });
  }
  function aboutDialog() {
    return dialog({ title: 'About OpenSig', fields: [
      { type: 'info', label: h('div', { class: 'about-logo' }, root.LOGOS ? root.LOGOS.node(S.settings.appIcon, 56) : null, h('b', {}, 'OpenSig')) },
      { type: 'info', label: 'OpenSig is a browser-based signal analysis workbench: linked windows, FFT/PSD with 15 windows and Welch averaging, spectrograms, FFT & IIR filters, octave analysis with A/C weighting, 30+ instruments, a signal calculator, live audio acquisition, playback, workspaces and reusable tools.' },
      { type: 'info', label: 'It is an independent, clean-room program: it contains no code, assets, help text or licensing logic from any other product, and it is not affiliated with or endorsed by any other software vendor.' },
      { type: 'info', label: 'Everything runs locally in your browser; no data leaves your computer.' }], ok: 'Close', cancel: 'Back' });
  }

  /* ---------- Keyboard ---------- */
  function keyHandler(e) {
    if (e.target.closest && e.target.closest('input, textarea, select, dialog')) return;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey, w = S.active;
    if (IS_MAC && e.metaKey && !e.ctrlKey && !e.altKey && k.toLowerCase() === 'q') return; // Cmd+Q quits on a Mac
    const run = fn => { e.preventDefault(); UI.closeMenus && UI.closeMenus(); guard(fn)(); };
    if (ctrl && !e.altKey && k === 'Tab') return run(() => APP.tabs.step(e.shiftKey ? -1 : 1)); // next / previous workspace tab
    const shiftKey = ctrl && e.shiftKey && !e.altKey && (UI.SHIFT_KEYS || {})[k.toLowerCase()]; // Ctrl+Shift+D dark mode, Ctrl+Shift+G graph style
    if (shiftKey) return run(shiftKey);
    if (ctrl && !e.altKey) {
      const map = { o: () => pickFiles('.wav,.wave,.csv,.txt,.dat,.bin,.raw,.sig,.json,.osw,.ost,.osgeo'), s: () => saveSignal(false), f: () => fft(), g: () => spectrogramDialog(false), t: () => spectrogramDialog(true),
        y: () => fftFilterDialog(), e: () => APP.copyVisible(need('1d')), a: axesDialog, p: properties, b: copyData, 2: zoomToSamples, q: () => (root.UI_ACQ || acquisitionDialog)(),
        k: () => APP.stopAcquisition(), r: () => APP.restartAcquisition(), i: () => download(wsFileName(), JSON.stringify(APP.serialize(true)), 'application/json'), l: () => pickFiles('.osw,.json', 'workspace'),
        d: () => S.wins.forEach(x => APP.resetView(x)), ',': settingsDialog,
        ...(HOSTED ? { w: () => pickFiles('.osw,.json', 'workspace'), n: fromClipboard } : {}) };
      const f = map[k.toLowerCase()]; if (f) return run(f);
    }
    if (ctrl && e.altKey && k === 'F6') return run(() => APP.playSound(need('time'), 'visible'));
    if (e.altKey && !ctrl) {
      const map = { l: linkDialog, u: () => { const x = need(); if (x.parents.length) APP.unlink(x); }, w: () => toggleTree(), F6: () => APP.playSound(need('time'), 'all'),
        ArrowUp: () => { S.settings.step = Math.min(100, S.settings.step * 1.5); APP.saveSettings(); toast('Step ' + S.settings.step.toFixed(1) + ' %'); },
        ArrowDown: () => { S.settings.step = Math.max(0.1, S.settings.step / 1.5); APP.saveSettings(); toast('Step ' + S.settings.step.toFixed(1) + ' %'); } };
      // Option+letter types a special character on a Mac: the physical key decides
      const f = map[/^Key[A-Z]$/.test(e.code || '') ? e.code.slice(3).toLowerCase() : k.length === 1 ? k.toLowerCase() : k]; if (f) return run(f);
    }
    if (ctrl || e.altKey) return;
    const map = { F1: () => root.HELP ? root.HELP.context() : helpDialog(), F12: settingsDialog, F2: () => { const x = need('3d'); x.display.mode = 'mesh'; APP.requestRender(x); }, F3: () => { const x = need('3d'); x.display.mode = 'spectrogram'; APP.requestRender(x); },
      F5: () => APP.playSilent(need('1d')), F6: () => APP.playSound(need('time'), 'cursor'), F7: () => APP.stopPlayback(),
      Home: () => { const x = need(); const s = x.view.x1 - x.view.x0, [a] = APP.extentX(x); APP.setViewX(x, a, a + s); },
      End: () => { const x = need(); const s = x.view.x1 - x.view.x0, [, b] = APP.extentX(x); APP.setViewX(x, b - s, b); },
      ArrowRight: () => APP.pan(need(), S.settings.step / 100), ArrowLeft: () => APP.pan(need(), -S.settings.step / 100),
      '+': () => APP.zoom(need(), 0.5), '=': () => APP.zoom(need(), 0.5), '-': () => APP.zoom(need(), 2),
      Delete: () => w && APP.closeWindow(w),
      Tab: () => { const x = need('3d'); x.display.crosshair = !x.display.crosshair; if (!x.fixedCursor3) x.fixedCursor3 = { x: (x.view.x0 + x.view.x1) / 2, y: (x.view.y0 + x.view.y1) / 2 }; APP.requestRender(x); } };
    if (k === 'Tab' && !(w && w.kind === '3d')) return;
    const f = map[k]; if (f) run(f);
  }

  /* ---------- Toolbar (two rows, original-style grouping; icons drawn for OpenSig) ---------- */
  const svg = body => `<svg viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
  const txt = (t, color) => `<span class="tb-txt" style="color:${color || 'inherit'}">${t}</span>`;
  const I = {
    open: svg('<path d="M1 4h5l1 1h7v8H1z" fill="#f6c94c" stroke="#a07a10"/><path d="M1 13l2-6h12l-2 6z" fill="#fde39a" stroke="#a07a10"/>'),
    save: svg('<rect x="1.5" y="1.5" width="13" height="13" fill="#3a6fd8" stroke="#1d3f8a"/><rect x="4" y="2" width="8" height="5" fill="#fff"/><rect x="4" y="10" width="8" height="4" fill="#cfd8e8"/>'),
    savews: svg('<rect x="1.5" y="1.5" width="13" height="13" fill="#2e9e4f" stroke="#17602e"/><rect x="4" y="2" width="8" height="5" fill="#fff"/><path d="M4 11h8M4 13h8" stroke="#fff"/>'),
    loadws: svg('<path d="M1 4h5l1 1h7v8H1z" fill="#8fd19e" stroke="#17602e"/><path d="M5 9h6M8 6v6" stroke="#17602e" stroke-width="1.5"/>'),
    acq: svg('<rect x="5" y="1" width="6" height="9" rx="3" fill="#666"/><path d="M3 8a5 5 0 0 0 10 0M8 13v2M5 15h6" fill="none" stroke="#333" stroke-width="1.3"/>'),
    rec: svg('<circle cx="8" cy="8" r="5.5" fill="#e02020" stroke="#900"/>'),
    stopacq: svg('<rect x="3" y="3" width="10" height="10" fill="#555" stroke="#222"/>'),
    copy: svg('<rect x="2" y="2" width="8" height="10" fill="#fff" stroke="#555"/><rect x="6" y="5" width="8" height="10" fill="#fff" stroke="#555"/>'),
    pic: svg('<rect x="1.5" y="2.5" width="13" height="11" fill="#fff" stroke="#555"/><path d="M2 12l4-5 3 3 2-2 3 4z" fill="#3a9a4a"/><circle cx="11" cy="5.5" r="1.3" fill="#e6a800"/>'),
    zin: svg('<circle cx="6.5" cy="6.5" r="4.5" fill="#fff" stroke="#333" stroke-width="1.4"/><path d="M10 10l5 5M4.5 6.5h4M6.5 4.5v4" stroke="#333" stroke-width="1.6"/>'),
    zout: svg('<circle cx="6.5" cy="6.5" r="4.5" fill="#fff" stroke="#333" stroke-width="1.4"/><path d="M10 10l5 5M4.5 6.5h4" stroke="#333" stroke-width="1.6"/>'),
    zfit: svg('<path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4" fill="none" stroke="#333" stroke-width="1.6"/><path d="M4 9l2-3 2 3 2-4 2 5" fill="none" stroke="#00c" stroke-width="1.3"/>'),
    zn: svg('<path d="M1 8h14M3 5v6M13 5v6" stroke="#333" stroke-width="1.4"/>') ,
    gear: svg('<circle cx="8" cy="8" r="2.4" fill="none" stroke="#444" stroke-width="1.6"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3M3 3l2 2M11 11l2 2M13 3l-2 2M5 11l-2 2" stroke="#444" stroke-width="1.8"/>'),
    home: svg('<path d="M3 3v10" stroke="#333" stroke-width="1.8"/><path d="M13 3L5 8l8 5z" fill="#333"/>'),
    end: svg('<path d="M13 3v10" stroke="#333" stroke-width="1.8"/><path d="M3 3l8 5-8 5z" fill="#333"/>'),
    left: svg('<path d="M11 3L4 8l7 5z" fill="#333"/>'),
    right: svg('<path d="M5 3l7 5-7 5z" fill="#333"/>'),
    play: svg('<path d="M4 2l10 6-10 6z" fill="#1a8f2e" stroke="#0d5a1b"/>'),
    playsnd: svg('<path d="M1 6h3l4-3v10l-4-3H1z" fill="#333"/><path d="M10 5c1.5 1.5 1.5 4.5 0 6M12 3c3 3 3 7 0 10" fill="none" stroke="#1a8f2e" stroke-width="1.4"/>'),
    stop: svg('<rect x="3.5" y="3.5" width="9" height="9" fill="#c62020" stroke="#7a0f0f"/>'),
    loop: svg('<path d="M3 9a5 5 0 0 1 9-4M13 7a5 5 0 0 1-9 4" fill="none" stroke="#333" stroke-width="1.5"/><path d="M12 1v4H8M4 15v-4h4" fill="none" stroke="#333" stroke-width="1.5"/>'),
    fft: svg('<path d="M1 15h14" stroke="#333"/><path d="M3 15V9M6 15V3M9 15V11M12 15V7" stroke="#c00" stroke-width="2"/>') ,
    fftset: svg('<path d="M1 15h14" stroke="#333"/><path d="M3 15V9M6 15V5M9 15V11" stroke="#c00" stroke-width="2"/><circle cx="12.5" cy="4.5" r="2" fill="none" stroke="#444" stroke-width="1.5"/>'),
    filter: svg('<path d="M1 2h14l-5 6v6l-4 1V8z" fill="#6fb3ff" stroke="#1d4f8a"/>'),
    iir: svg('<path d="M1 2h14l-5 6v6l-4 1V8z" fill="#ffc46f" stroke="#8a5a1d"/>'),
    calc: svg('<rect x="2.5" y="1.5" width="11" height="13" fill="#eee" stroke="#555"/><rect x="4" y="3" width="8" height="3" fill="#9fd1a0"/><path d="M5 9h1M8 9h1M11 9h0M5 12h1M8 12h1" stroke="#333" stroke-width="1.6"/><path d="M11 8.5v4" stroke="#c00" stroke-width="1.6"/>'),
    gen: svg('<path d="M1 8c1.5-5 3.5-5 5 0s3.5 5 5 0" fill="none" stroke="#00c" stroke-width="1.6"/><path d="M13 9v6M10 12h6" stroke="#1a8f2e" stroke-width="1.8"/>'),
    sgram: svg('<rect x="1" y="1" width="14" height="14" fill="#00008b"/><path d="M2 13C6 12 9 8 14 2" fill="none" stroke="#ff3" stroke-width="2"/><path d="M2 13C6 12 9 8 14 2" fill="none" stroke="#f00" stroke-width=".8"/>'),
    tfft: svg('<path d="M1 14l4-3h10l-4 3z" fill="#ddd" stroke="#555"/><path d="M2 13l2-7 2 6M5 11l2-8 2 7M8 10l2-6 2 5" fill="none" stroke="#c00" stroke-width="1.2"/>'),
    mesh: svg('<path d="M1 12l4-8 4 6 3-4 3 6" fill="none" stroke="#c00" stroke-width="1.3"/><path d="M1 14l4-8 4 6 3-4 3 6" fill="none" stroke="#e80" stroke-width="1.3"/>'),
    sgview: svg('<rect x="1" y="1" width="14" height="14" fill="#00008b"/><rect x="1" y="9" width="14" height="3" fill="#e00"/><rect x="1" y="7" width="14" height="2" fill="#ff0"/>'),
    link: svg('<rect x="1" y="5" width="7" height="6" rx="3" fill="none" stroke="#333" stroke-width="1.6"/><rect x="8" y="5" width="7" height="6" rx="3" fill="none" stroke="#333" stroke-width="1.6"/>'),
    unlink: svg('<rect x="0.8" y="5" width="6" height="6" rx="3" fill="none" stroke="#333" stroke-width="1.6"/><rect x="9.2" y="5" width="6" height="6" rx="3" fill="none" stroke="#333" stroke-width="1.6"/><path d="M8 2v3M8 11v3" stroke="#c00" stroke-width="1.6"/>'),
    tree: svg('<rect x="1" y="1" width="5" height="4" fill="#3a6fd8"/><rect x="9" y="6" width="5" height="4" fill="#2e9e4f"/><rect x="9" y="11" width="5" height="4" fill="#d97706"/><path d="M3.5 5v8.5H9M3.5 8H9" fill="none" stroke="#333"/>'),
    overlay: svg('<path d="M1 10c2-6 4-6 6 0s4 6 8-2" fill="none" stroke="#00c" stroke-width="1.5"/><path d="M1 6c3 5 6 5 8 1s4-4 6 2" fill="none" stroke="#c00" stroke-width="1.5"/>'),
    sline: svg('<path d="M1 11l3-6 3 8 3-10 3 7 2-3" fill="none" stroke="#00c" stroke-width="1.5"/>'),
    shist: svg('<path d="M2 15V9M5 15V5M8 15V11M11 15V3M14 15V8" stroke="#00c" stroke-width="2.2"/>'),
    sarea: svg('<path d="M1 15V11l3-6 3 8 3-10 3 7 2-3v8z" fill="#7aa7ff" stroke="#00c"/>'),
    sdots: svg('<g fill="#00c"><circle cx="2" cy="11" r="1.4"/><circle cx="5" cy="5" r="1.4"/><circle cx="8" cy="12" r="1.4"/><circle cx="11" cy="3" r="1.4"/><circle cx="14" cy="9" r="1.4"/></g>'),
    axes: svg('<path d="M3 1v12h12" fill="none" stroke="#333" stroke-width="1.6"/><path d="M1 3l2-2 2 2M13 11l2 2-2 2" fill="none" stroke="#333" stroke-width="1.3"/>'),
    props: svg('<rect x="2.5" y="1.5" width="11" height="13" fill="#fff" stroke="#555"/><path d="M5 5h6M5 8h6M5 11h4" stroke="#555" stroke-width="1.3"/>'),
    moon: svg('<path d="M10.8 1.8A6.4 6.4 0 1 0 14.2 11 5.2 5.2 0 0 1 10.8 1.8z" fill="#f2c230" stroke="#8a6a00" stroke-width=".9"/>'),
    help: svg('<circle cx="8" cy="8" r="6.5" fill="#3a6fd8"/><path d="M6 6a2 2 0 1 1 2.6 1.9c-.6.2-.6.7-.6 1.6" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="8" cy="12" r="1" fill="#fff"/>'),
    peak: svg('<path d="M1 14l3-4 2 2 3-9 2 6 2-2 2 4" fill="none" stroke="#00c" stroke-width="1.4"/><path d="M9 3V1" stroke="#c00" stroke-width="1.5"/><circle cx="9" cy="3" r="1.4" fill="#c00"/>'),
    octave: svg('<path d="M1 15h14" stroke="#333"/><path d="M2.5 15V8M5.5 15V5M8.5 15V6M11.5 15V9M14 15V12" stroke="#2e9e4f" stroke-width="2.4"/>'),
    hist: svg('<path d="M1 15h14" stroke="#333"/><path d="M3 15v-3M6 15V7M9 15V4M12 15V9" stroke="#7b3fc9" stroke-width="2.4"/>'),
    smooth: svg('<path d="M1 10l1-4 1 6 1-7 1 6 1-3 1 4" fill="none" stroke="#aaa"/><path d="M1 9c3-3 5 3 8 0s4-3 6 0" fill="none" stroke="#00c" stroke-width="1.6"/>'),
    sel: svg('<rect x="1.5" y="3.5" width="13" height="9" fill="none" stroke="#333" stroke-dasharray="2 1.5"/><path d="M3 10l2-4 2 3 2-3 2 2 2-1" fill="none" stroke="#00c" stroke-width="1.3"/>')
  };
  const findItem = (menu, label) => { const m = MENUS.find(mm => mm.label === menu); const walk = items => { for (const it of items) { if (it === '-') continue; if (it.label === label) return it; if (it.sub) { const r = walk(it.sub); if (r) return r; } } return null; }; return walk(m.items); };
  const TB = (icon, title, menu, label, extra) => ({ icon, title, item: () => findItem(menu, label), ...(extra || {}) });
  const TOOLBAR = [
    [TB(I.open, 'Open signal (Ctrl+O)', 'File', 'Open signal…'), TB(I.save, 'Save signal as (Ctrl+S)', 'File', 'Save signal as…'), TB(I.savews, 'Save workspace (Ctrl+I)', 'File', 'Save workspace (with data)…'), TB(I.loadws, 'Load workspace (Ctrl+W)', 'File', 'Load workspace…'), '|',
      TB(I.acq, 'Open data acquisition (Ctrl+Q)', 'Data acquisition', 'Open data acquisition…'), TB(I.stopacq, 'Stop acquisition (Ctrl+K)', 'Data acquisition', 'Stop acquisition'), '|',
      TB(I.copy, 'Copy data to clipboard (Ctrl+B)', 'Edit', 'Copy data to clipboard (ASCII / CSV)'), TB(I.pic, 'Copy picture to clipboard', 'Edit', 'Copy picture to clipboard'), '|',
      TB(I.zin, 'Zoom in', 'Edit', 'Zoom in'), TB(I.zout, 'Zoom out', 'Edit', 'Zoom out'), TB(I.zfit, 'Reset zoom', 'Edit', 'Reset zoom'), TB(I.zn, 'Zoom to X samples (Ctrl+2)', 'Edit', 'Zoom to X samples/values…'), TB(I.sel, 'Open selection in new window (Ctrl+E)', 'Edit', 'Open selection in new window'), TB(I.gear, 'Application settings (F12)', 'File', 'Application settings…'), '|',
      TB(I.home, 'Signal beginning (Home)', 'Play & navigate', '« Signal beginning'), TB(I.left, 'Step left (←)', 'Play & navigate', 'Step left / right', { run: () => APP.pan(need(), -S.settings.step / 100) }), TB(I.play, 'Play signal, no sound (F5)', 'Play & navigate', 'Play signal (no sound)'),
      TB(I.playsnd, 'Play signal with sound from cursor (F6)', 'Play & navigate', 'Play signal (with sound) from cursor position'), TB(I.stop, 'Stop playing (F7)', 'Play & navigate', 'Stop playing'), TB(I.right, 'Step right (→)', 'Play & navigate', 'Step left / right'), TB(I.end, 'Signal end (End)', 'Play & navigate', 'Signal end »'), TB(I.loop, 'Play in loop', 'Play & navigate', 'Play in loop'), '|',
      TB(I.fft, 'FFT with default settings (Ctrl+F)', 'Signal tools', 'FFT with default spectral analysis settings'), TB(I.fftset, 'Spectral analysis defaults', 'Signal tools', 'Spectral analysis defaults…'), TB(I.filter, 'FFT filter (Ctrl+Y)', 'Signal tools', 'FFT filter…'), TB(I.iir, 'IIR filter', 'Signal tools', 'IIR filter…'),
      TB(I.smooth, 'Moving average smoothing', 'Signal tools', 'Moving average smoothing…'), TB(I.hist, 'Probability distribution / Histogram', 'Signal tools', 'Probability distribution / Histogram…'), TB(I.octave, '1/3 octave plot', 'Signal tools', '1/3 octave plot'), TB(I.peak, 'Peak detection', 'Signal tools', 'Peak detection…'),
      TB(I.calc, 'Signal calculator', 'Signal tools', 'Signal calculator…'), TB(I.gen, 'Signal generator', 'Signal tools', 'Signal generator…'), '|', TB(I.moon, 'Dark mode (Ctrl+Shift+D)', 'Window', 'Dark mode'), TB(I.help, 'Help (F1)', 'Help', 'Contents…')],
    [TB(txt('VAL', '#c00'), 'Value at (with marker)', 'Instruments', 'Value at (with marker)…'), TB(txt('MAX', '#c00'), 'Maximum (with marker)', 'Instruments', 'Maximum (with marker)'), TB(txt('MIN', '#c00'), 'Minimum (with marker)', 'Instruments', 'Minimum (with marker)'),
      TB(txt('AVG', '#c00'), 'Mean', 'Instruments', 'Mean'), TB(txt('DEV', '#c00'), 'Standard deviation', 'Instruments', 'Standard deviation'), TB(txt('SUM', '#c00'), 'Sum', 'Instruments', 'Sum'), TB(txt('RMS', '#c00'), 'RMS', 'Instruments', 'RMS'),
      TB(txt('THD', '#c00'), 'Total Harmonic Distortion', 'Instruments', 'Total Harmonic Distortion (THD)'), TB(txt('Hz', '#c00'), 'Dominant frequency', 'Instruments', 'Dominant frequency'), '|',
      TB(I.link, 'Link window to parent (Alt+L)', 'System control', 'Link window to parent…'), TB(I.unlink, 'Unlink window from parent (Alt+U)', 'System control', 'Unlink window from parent'), TB(I.tree, 'Control window (Alt+W)', 'System control', 'Control window'), TB(I.overlay, 'Show signals as overlay', 'System control', 'Show signals as overlay…'), '|',
      TB(I.sline, 'Display style: line', 'Edit', 'Line'), TB(I.shist, 'Display style: histogram', 'Edit', 'Histogram (from zero)'), TB(I.sarea, 'Display style: area', 'Edit', 'Area'), TB(I.sdots, 'Display style: dots', 'Edit', 'Dots'),
      TB(txt('1x'), 'Single line width', 'Edit', 'Single line width'), TB(txt('2x'), 'Double line width', 'Edit', 'Double line width'), TB(txt('3x'), 'Triple line width', 'Edit', 'Triple line width'), TB(I.axes, 'Axes settings (Ctrl+A)', 'Edit', 'Axes settings…'), TB(I.props, 'Properties (Ctrl+P)', 'Edit', 'Properties…'), '|',
      TB(I.tfft, 'Time FFT (Ctrl+T)', '3D tools', 'Time FFT…'), TB(I.sgram, 'Spectrogram (Ctrl+G)', '3D tools', 'Spectrogram…'), TB(I.mesh, 'Mesh view (F2)', '3D tools', 'Mesh view'), TB(I.sgview, 'Spectrogram view (F3)', '3D tools', 'Spectrogram view')]
  ];
  const TOOLBAR_SIDE = []; // large buttons right of the two rows, as tall as both
  const tbButtons = [];
  function buildToolbar() {
    const bar = $('#toolbar'), rows = h('div', { class: 'tb-rows' });
    const make = b => {
      const btn = h('button', { class: 'tb-btn' + (b.cls ? ' ' + b.cls : ''), title: macKeys(b.title), 'aria-label': macKeys(b.title) });
      btn.innerHTML = b.icon;
      btn.addEventListener('click', () => { const it = b.item(); UI.closeMenus && UI.closeMenus(); guard(b.run || (it && it.run))(); setTimeout(refreshToolbar, 50); });
      tbButtons.push([btn, b]); return btn;
    };
    for (const row of TOOLBAR) {
      const r = h('div', { class: 'tb-row' });
      for (const b of row) r.append(b === '|' ? h('span', { class: 'tb-sep', 'aria-hidden': 'true' }) : make(b));
      rows.append(r);
    }
    bar.append(rows);
    if (TOOLBAR_SIDE.length) bar.append(h('div', { class: 'tb-side' }, ...TOOLBAR_SIDE.map(make)));
    refreshToolbar();
  }
  function refreshToolbar() {
    for (const [btn, b] of tbButtons) {
      const it = b.item();
      btn.disabled = !it || (it.en ? !it.en() : false);
      btn.classList.toggle('on', !!(it && it.checked && it.checked()));
    }
  }

  /* ---------- Status bar ---------- */
  function renderStatus() {
    const w = S.active, el = $('#statusbar-main');
    if (!w) { el.textContent = S.wins.size ? '' : 'Open a signal (Ctrl+O), drop a file here, or try Help ▸ Examples.'; return; }
    const parts = [`${w.label} · ${w.title}`];
    if (w.opLabel && w.opLabel !== w.title) parts.push(w.opLabel);
    if (w.parents.length) parts.push('parent ' + w.parents.map(p => 'W' + p).join(', '));
    if (w.children.size) parts.push(w.children.size + ' linked child window' + (w.children.size > 1 ? 's' : ''));
    if (w.player) parts.push('▶ playing'); if (w.stepper) parts.push('▶ stepping'); if (w.source && w.source.type === 'acq') parts.push('● recording');
    el.textContent = parts.join('   ·   ');
    const nf = root.FOLLOW ? root.FOLLOW.count() : 0;
    $('#statusbar-acq').textContent = [(S.acquisitions || []).length ? '● Acquisition running' : '', nf ? `● Following ${nf} file${nf > 1 ? 's' : ''}` : ''].filter(Boolean).join('  ');
    renderPanes();
  }
  // Original-style status panes: visible range, play step and sample rate of the active window.
  function renderPanes() {
    const w = S.active, p = $('#statusbar-panes');
    const pane = (k, v) => h('span', { class: 'sb-pane' }, k ? h('b', {}, k) : null, v);
    p.innerHTML = '';
    const f = v => Number(v).toFixed(6);
    const hasRange = w && w.kind !== 'instrument' && w.data;
    p.append(pane('RANGE:', hasRange ? f(w.view.x0) : '—'), pane('', hasRange ? f(w.view.x1) : '—'), pane('STEP', S.settings.step.toFixed(2) + ' %'),
      pane('SR:', w && w.data && w.data.dx && !w.data.x && w.kind === '1d' ? (1 / w.data.dx).toFixed(4) : '—'));
  }

  /* ---------- Boot ---------- */
  const UI = { SHIFT_KEYS: { d: () => APP.toggleDark() }, dialog, confirmBox, toast, windowMenu, popupMenu, closeCtx, toggleTree, EXAMPLES, MENUS, openFile, guard, need, download, pickFiles, saveSignal, spectralFields, spectralValidate, cleanSpectral,
    h, safeName, baseName, wsFileName, TOOLBAR, TOOLBAR_SIDE, TB, I, findItem, refreshToolbar: () => refreshToolbar(), importCsvText, csvDialog, csvOptions, properties, fftFilterDialog, iirFilterDialog, settingsDialog, HOSTED };
  root.UI = UI;

  function boot() {
    S.desktop = $('#desktop');
    APP.tabs.init();
    APP.applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => APP.applyTheme());
    buildMenubar();
    buildToolbar();
    APP.onChange(refreshToolbar);
    setInterval(renderPanes, 300);
    APP.onChange(renderTree); APP.onChange(renderStatus);
    $('#file-input').addEventListener('change', guard(async e => { for (const f of e.target.files) await openFile(f, pendingOpen === 'auto' ? null : pendingOpen); }));
    const desk = $('#desktop');
    desk.addEventListener('dragover', e => { e.preventDefault(); desk.classList.add('drop'); });
    desk.addEventListener('dragleave', e => { if (e.target === desk) desk.classList.remove('drop'); });
    desk.addEventListener('drop', guard(async e => { e.preventDefault(); desk.classList.remove('drop'); for (const f of e.dataTransfer.files) await openFile(f); }));
    document.addEventListener('keydown', keyHandler);
    $('#welcome-gen').addEventListener('click', guard(generatorDialog));
    $('#welcome-open').addEventListener('click', () => pickFiles('.wav,.wave,.csv,.txt,.dat,.bin,.raw,.sig,.json,.osw,.ost,.osgeo'));
    $('#welcome-acq').addEventListener('click', guard(() => (root.UI_ACQ || acquisitionDialog)()));
    const ex = $('#welcome-examples');
    Object.keys(EXAMPLES).forEach(k => ex.append(h('li', {}, h('button', { class: 'linkish', onclick: guard(() => EXAMPLES[k]()) }, k))));
    APP.onChange(() => { $('#welcome').hidden = S.wins.size > 0; });
    if (root.CONTROL) root.CONTROL.restore(); // Control window shown again if it was open last time
    renderStatus();
    window.addEventListener('resize', () => S.wins.forEach(w => APP.requestRender(w)));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
