/* OpenSig UI part 3: acquisition (trigger, calibration), data & instrument logging, alarm actions, network/serial I/O,
   batch processing + script generator, command-line automation, auto-save / restore. */
(function (root) {
  'use strict';
  const { DSP, IO, PLOT, OPS, APP, UI, HOST, FORMATS, SIGMETRICS } = root;
  const S = APP.S, { dialog, toast, need, download, h, safeName, guard } = UI;
  const fmt = v => PLOT.fmt(v, Math.abs(v) / 1000 || 1);
  const stamp = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  const joinPath = (dir, name) => dir.replace(/[\\/]+$/, '') + '\\' + name;
  const instruments = () => [...S.wins.values()].filter(w => w.kind === 'instrument' && w.data);
  const IOX = {};

  /* ======================= Calibration profiles ======================= */
  const cals = () => (S.settings.calibrations = S.settings.calibrations || { default: { inputLevel: 1, calLevel: 1, offset: 0, units: '' } });
  const calScale = c => ({ scale: (c.calLevel || 1) / (c.inputLevel || 1), offset: c.offset || 0, unit: c.units || '' });
  function parseCal(text) {
    const kv = {}; for (const l of text.split(/\r?\n/)) { const m = /^\s*(\w+)\s*=\s*(.*)$/.exec(l); if (m) kv[m[1].toLowerCase()] = m[2].trim(); }
    return { inputLevel: parseFloat(kv.inputlevel1 || kv.inputlevel || '1') || 1, calLevel: parseFloat(kv.callevel || '1') || 1, offset: parseFloat(kv.offset || '0') || 0, units: kv.units || '' };
  }
  async function calibrationDialog(name) {
    const all = cals(); name = name || Object.keys(all)[0];
    const c = all[name] || { inputLevel: 1, calLevel: 1, offset: 0, units: '' };
    const v = await dialog({ title: 'Device calibration', intro: '1) Record a constant signal of known amplitude (e.g. 5 V) with the "default" profile. 2) Measure its average in OpenSig and enter it as "Recorded input level". 3) Enter the actual level in physical units. Scale = actual / recorded.', fields: [
      { key: 'pick', label: 'Profile', type: 'select', options: Object.keys(all).concat(['+ New profile']), value: name },
      { key: 'name', label: 'Profile name', type: 'text', value: name },
      { key: 'inputLevel', label: 'Recorded input level', type: 'number', value: c.inputLevel },
      { key: 'calLevel', label: 'Input level in physical units', type: 'number', value: c.calLevel },
      { key: 'offset', label: 'Offset', type: 'number', value: c.offset },
      { key: 'units', label: 'Physical unit used', type: 'text', value: c.units }],
      extra: [
        { label: 'Load .cal…', run: (v, inp) => { const i = h('input', { type: 'file', accept: '.cal,.txt,.ini' }); i.onchange = async () => { const f = i.files[0]; if (!f) return; const p = parseCal(await f.text()); inp.name.value = UI.baseName(f.name); inp.inputLevel.value = p.inputLevel; inp.calLevel.value = p.calLevel; inp.offset.value = p.offset; inp.units.value = p.units; }; i.click(); } },
        { label: 'Save As .cal…', run: v => download(safeName(v.name) + '.cal', `[Calibration]\nInputLevel1=${v.inputLevel}\nCalLevel=${v.calLevel}\nOffset=${v.offset}\nType=0\nUnits=${v.units}\n`, 'text/plain') }],
      ok: 'Save', validate: v => v.name.trim() && v.inputLevel ? null : 'Enter a name and a non-zero recorded level' });
    if (!v) return;
    if (v.pick !== name && v.pick !== '+ New profile' && v.name === name) return calibrationDialog(v.pick);
    all[v.name.trim()] = { inputLevel: v.inputLevel, calLevel: v.calLevel, offset: v.offset, units: v.units }; APP.saveSettings();
    toast(`Calibration "${v.name.trim()}": scale ${fmt(v.calLevel / v.inputLevel)}, offset ${v.offset} ${v.units}`);
  }

  /* ======================= Data acquisition dialog (replaces the basic one) ======================= */
  async function acquisitionDialog() {
    let devices = [];
    try { devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch (e) { /* none */ }
    const calNames = Object.keys(cals());
    const v = await dialog({ title: 'Data acquisition', intro: 'Sound-card / microphone input. Linked windows (FFT, spectrogram, instruments) update in real time. Vendor DAQ hardware drivers are not included.', fields: [
      { key: 'deviceId', label: 'Input device', type: 'select', options: [['', 'Default input']].concat(devices.map((d, i) => [d.deviceId, d.label || 'Input ' + (i + 1)])), value: '' },
      { key: 'channels', label: 'Channel list', type: 'select', options: [[1, '1 (mono)'], [2, '1,2 (stereo – two windows)']], value: 1 },
      { key: 'sampleRate', label: 'Sample rate', type: 'select', options: [[0, 'Device default'], [8000, '8000 Hz'], [11025, '11025 Hz'], [16000, '16000 Hz'], [22050, '22050 Hz'], [44100, '44100 Hz'], [48000, '48000 Hz'], [96000, '96000 Hz'], [192000, '192000 Hz']], value: 0 },
      { key: 'mode', label: 'Acquisition mode', type: 'radio', value: 'continuous', options: [['continuous', 'Continuous acquisition (keep last N sec)'], ['block', 'Continuous acquisition (keep only last block)'], ['timed', 'Timed acquisition (acquire N sec, then stop)'], ['trigger', 'Start recording after trigger']] },
      { key: 'seconds', label: 'N seconds', type: 'number', value: 2, min: 0.05, show: v => v.mode === 'continuous' || v.mode === 'timed' },
      { key: 'blockSize', label: 'Block size (samples)', type: 'select', options: [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536], value: 4096, show: v => v.mode === 'block' },
      { type: 'section', label: 'Trigger', show: v => v.mode === 'trigger' },
      { key: 'tChannel', label: 'Trigger on channel', type: 'select', options: [[0, '1'], [1, '2']], value: 0, show: v => v.mode === 'trigger' },
      { key: 'tLevel', label: 'Trigger level', type: 'number', value: 0.1, show: v => v.mode === 'trigger' },
      { key: 'tSlope', label: 'Slope', type: 'select', options: [['rising', 'Rising'], ['falling', 'Falling']], value: 'rising', show: v => v.mode === 'trigger' },
      { key: 'tPre', label: 'Samples before(−)/after(+) trigger', type: 'number', value: -512, step: 1, show: v => v.mode === 'trigger', hint: 'negative = pre-trigger' },
      { key: 'tLen', label: 'Recording length (samples)', type: 'number', value: 8192, min: 16, step: 1, show: v => v.mode === 'trigger' },
      { key: 'tRearm', label: 'Re-arm trigger after each recording', type: 'check', value: true, show: v => v.mode === 'trigger' },
      { key: 'tMax', label: 'Max re-arm count (0 = unlimited)', type: 'number', value: 0, min: 0, step: 1, show: v => v.mode === 'trigger' && v.tRearm },
      { type: 'section', label: 'Device-specific settings' },
      { key: 'cal1', label: 'Calibration channel 1', type: 'select', options: calNames, value: 'default' },
      { key: 'cal2', label: 'Calibration channel 2', type: 'select', options: calNames, value: 'default', show: v => +v.channels === 2 },
      { key: 'fps', label: 'Display refresh (updates per second)', type: 'number', value: 20, min: 1, max: 60, step: 1 },
      { key: 'fft', label: 'Open a linked FFT window', type: 'check', value: true }],
      ok: 'Start acquisition', extra: [{ label: 'Device calibration…', run: () => calibrationDialog() }],
      validate: v => (v.mode === 'continuous' || v.mode === 'timed') && !(v.seconds > 0 && v.seconds <= 600) ? 'Seconds must be between 0 and 600' : null });
    if (!v) return;
    const all = cals();
    const wins = await APP.startAcquisition({ deviceId: v.deviceId, channels: +v.channels, sampleRate: +v.sampleRate || 0, mode: v.mode, seconds: v.seconds, blockSize: +v.blockSize, fps: v.fps,
      trigger: { channel: +v.tChannel, level: v.tLevel, slope: v.tSlope, pre: Math.round(v.tPre), length: Math.round(v.tLen), rearm: v.tRearm, maxRearm: Math.round(v.tMax || 0) },
      calibration: [calScale(all[v.cal1] || {}), calScale(all[v.cal2] || {})] });
    if (v.fft) wins.forEach(w => APP.derive(w, 'fft', Object.assign({}, S.settings.spectral)));
    toast('Acquisition running – Ctrl+K stops, Ctrl+R restarts');
  }

  /* ======================= Data logging to files (.sig + .txt) ======================= */
  IOX.logger = null;
  async function logDialog() {
    const v = await dialog({ title: 'File logging settings', intro: 'Signal files are created in the target folder and named "<prefix>_<YYYYMMDD>_<HHMMSS>.sig" (32-bit float raw, channels interleaved). A ".txt" file with the same name holds the sample rate and channel count; open the pair with File ▸ Open data log file.', fields: [
      { key: 'prefix', label: 'File name prefix', type: 'text', value: 'opensig' },
      { key: 'splitMb', label: 'Create new file when file size reaches (MB)', type: 'number', value: 100, min: 1 },
      { key: 'stopSec', label: 'Stop after … seconds have been recorded (0 = never)', type: 'number', value: 0, min: 0 },
      { key: 'manual', label: 'Wait for manual "Start" command (Data acquisition ▸ Start logging)', type: 'check', value: false }], ok: 'Choose target folder…' });
    if (!v) return;
    let target;
    if (HOST.available) { target = await HOST.pickFolder('Target folder for logged signal files'); if (!target) return; }
    else if (root.showDirectoryPicker) target = await root.showDirectoryPicker({ mode: 'readwrite' });
    else throw new Error('Writing to a folder needs the desktop app or a Chromium browser.');
    IOX.logger = { cfg: v, target, running: false, pending: true, file: null, bytes: 0, total: 0, queue: [] };
    if (!v.manual) await startLog();
    else toast('Logging armed – use Data acquisition ▸ Start logging (or an instrument alarm) to begin');
  }
  async function newLogFile(fs, ch) {
    const L = IOX.logger, base = `${L.cfg.prefix}_${stamp(new Date())}`, info = `SampleRate=${fs}\r\nChannels=${ch}\r\nStart=${new Date().toISOString()}\r\nFormat=float32 little-endian interleaved\r\n`;
    if (HOST.available) { L.file = { path: joinPath(L.target, base + '.sig') }; await HOST.writeText(joinPath(L.target, base + '.txt'), info); }
    else {
      const fh = await L.target.getFileHandle(base + '.sig', { create: true }), ih = await L.target.getFileHandle(base + '.txt', { create: true });
      const iw = await ih.createWritable(); await iw.write(info); await iw.close();
      L.file = { handle: fh, writable: await fh.createWritable() };
    }
    L.bytes = 0; L.files = (L.files || 0) + 1;
  }
  async function startLog() {
    const L = IOX.logger; if (!L) throw new Error('Configure logging first (Data acquisition ▸ Log data in file…).');
    if (!(S.acquisitions || []).length) toast('Logging will start with the next acquisition block', 'warn');
    L.running = true; L.pending = false; L.total = 0; L.file = null; toast('Logging to file started');
    IOX.render();
  }
  async function stopLog() {
    const L = IOX.logger; if (!L) return;
    L.running = false; await flushLog(true);
    if (L.file && L.file.writable) await L.file.writable.close();
    toast(`Logging stopped: ${L.files || 0} file(s), ${fmt(L.total / (L.fs || 1))} s recorded`);
    IOX.logger = null; IOX.render();
  }
  let flushing = false;
  async function flushLog(force) {
    const L = IOX.logger; if (!L || flushing || (!L.queue.length && !force)) return;
    flushing = true;
    try {
      while (L.queue.length) {
        const chunk = L.queue.shift();
        if (!L.file || L.bytes + chunk.byteLength > L.cfg.splitMb * 1048576) { if (L.file && L.file.writable) await L.file.writable.close(); await newLogFile(L.fs, L.ch); }
        if (HOST.available) await HOST.writeFile(L.file.path, chunk, true); else await L.file.writable.write(chunk);
        L.bytes += chunk.byteLength;
      }
    } catch (e) { toast('Logging error: ' + e.message, 'err'); L.running = false; } finally { flushing = false; }
  }
  root.ACQ_HOOK = (chans, fs) => {
    const L = IOX.logger; if (!L || !L.running) return;
    L.fs = fs; L.ch = chans.length;
    const n = chans[0].length, buf = new Float32Array(n * chans.length);
    for (let i = 0; i < n; i++) for (let c = 0; c < chans.length; c++) buf[i * chans.length + c] = chans[c][i];
    L.queue.push(buf.buffer); L.total += n;
    if (L.cfg.stopSec > 0 && L.total >= L.cfg.stopSec * fs) setTimeout(() => stopLog(), 0);
  };
  setInterval(() => flushLog(false), 500);

  /* ======================= Instrument value logging ======================= */
  IOX.instLog = null;
  async function logInstruments() {
    const list = instruments(); if (!list.length) throw new Error('Create instrument windows first (Instruments menu).');
    const v = await dialog({ title: 'Log instrument values', fields: [
      ...list.map((w, i) => ({ key: 'i' + i, label: `${w.label} – ${w.title}`, type: 'check', value: true })),
      { key: 'ms', label: 'Interval (ms)', type: 'number', value: 1000, min: 20, step: 1 },
      { key: 'file', label: HOST.available ? 'Write continuously to a CSV file' : 'Download CSV when logging stops', type: 'check', value: true }] });
    if (!v) return;
    const sel = list.filter((w, i) => v['i' + i]); if (!sel.length) return;
    let path = null;
    if (v.file && HOST.available) { path = await HOST.call('saveDialog', { name: 'instrument_values.csv', filter: 'CSV (*.csv)|*.csv' }); if (!path) return; }
    const header = 'time,' + sel.map(w => `"${w.label} ${w.title.replace(/"/g, "'")}${w.data.unit ? ' [' + w.data.unit + ']' : ''}"`).join(',');
    const rows = [];
    if (path) await HOST.writeText(path, header + '\r\n');
    const table = APP.createWindow({ kind: 'display', title: 'Instrument value log', data: { text: header }, source: { type: 'copy' } });
    const timer = setInterval(() => {
      const line = new Date().toISOString() + ',' + sel.map(w => APP.isOpen(w) && w.data ? IO.fmtNum(w.data.value) : '').join(',');
      rows.push(line); if (path) HOST.writeText(path, line + '\r\n', true).catch(e => toast(e.message, 'err'));
      if (S.wins.has(table.id)) { table.data = { text: [header].concat(rows.slice(-40)).join('\n'), note: rows.length + ' rows' + (path ? ' → ' + path : '') }; APP.requestRender(table); }
    }, v.ms);
    IOX.instLog = { timer, rows, header, path, download: v.file && !path };
    table.onClose = () => stopInstLog();
    toast('Logging instrument values');
  }
  function stopInstLog() {
    const L = IOX.instLog; if (!L) return; clearInterval(L.timer); IOX.instLog = null;
    if (L.download) download('instrument_values.csv', [L.header].concat(L.rows).join('\r\n'), 'text/csv');
    toast(`Instrument logging stopped (${L.rows.length} rows)`);
  }

  /* ======================= Instrument alarm actions ======================= */
  async function alarmDialog() {
    const w = need(); if (w.kind !== 'instrument') throw new Error('Select an instrument window.');
    if (!w.display.crit) throw new Error('Set a critical value range first (Properties of the instrument window).');
    const a = w.display.crit.actions || {};
    const v = await dialog({ title: 'Alarm actions – ' + w.label, intro: `Run when the value enters the alarm state (${w.display.crit.inside ? 'inside' : 'outside'} ${w.display.crit.from}…${w.display.crit.to}).`, fields: [
      { key: 'beep', label: 'Play sound', type: 'check', value: !!a.beep },
      { key: 'exec', label: 'Execute application (desktop app; asks once per session)', type: 'check', value: !!a.execPath },
      { key: 'args', label: 'Arguments', type: 'text', value: a.args || '', show: v => v.exec },
      { key: 'save', label: 'Save values of the parent window in a file', type: 'check', value: !!a.save },
      { key: 'saveAll', label: 'Save values of ALL windows in the parent tree', type: 'check', value: !!a.saveAll, show: v => v.save },
      { key: 'logs', label: 'Start all pending "Log data in file…" recordings', type: 'check', value: !!a.logs },
      { key: 'minInterval', label: 'Perform actions no more than once in … seconds', type: 'number', value: a.minInterval ?? 10, min: 0 }] });
    if (!v) return;
    let execPath = v.exec ? a.execPath : null;
    if (v.exec && !execPath) { execPath = await HOST.call('pickExecutable'); if (!execPath) v.exec = false; }
    let saveDir = a.saveDir;
    if (v.save && HOST.available && !saveDir) saveDir = await HOST.pickFolder('Folder for alarm value files');
    w.display.crit.actions = { beep: v.beep, execPath: v.exec ? execPath : null, args: v.args, save: v.save, saveAll: v.saveAll, saveDir, logs: v.logs, minInterval: v.minInterval };
    toast('Alarm actions set');
  }
  UI.alarmActions = (w, value) => {
    const a = w.display.crit.actions, now = Date.now();
    if (w.lastAlarmAction && now - w.lastAlarmAction < (a.minInterval || 0) * 1000) return;
    w.lastAlarmAction = now;
    if (a.beep) HOST.beep();
    if (a.execPath) HOST.call('runApp', { path: a.execPath, args: a.args || '' }).catch(e => toast('Alarm action: ' + e.message, 'err'));
    if (a.logs && IOX.logger && IOX.logger.pending) startLog();
    if (a.save) {
      const parent = S.wins.get(w.parents[0]); if (!parent) return;
      const list = a.saveAll ? APP.related(parent).filter(x => x.kind === '1d' && x.data && x.data.y) : [parent];
      for (const x of list) {
        const d = x.data, csv = IO.toCsv(i => d.x ? d.x[i] : d.x0 + i * d.dx, d.y, true), name = `alarm_${stamp(new Date())}_${safeName(x.label + '_' + x.title)}.csv`;
        if (HOST.available && a.saveDir) HOST.writeText(joinPath(a.saveDir, name), csv).catch(e => toast(e.message, 'err')); else download(name, csv, 'text/csv');
      }
    }
    toast(`${w.label} alarm: ${fmt(value)} ${w.data.unit || ''}`, 'err');
  };

  /* ======================= Network & serial I/O ======================= */
  function streamWindow(title, fs, seconds, unit) {
    const n = Math.max(16, Math.round(fs * seconds));
    const w = APP.createWindow({ kind: '1d', title, data: { y: new Float64Array(n), x0: 0, dx: 1 / fs, xUnit: 's', yUnit: unit || '' }, source: { type: 'stream' } });
    w.stream = { ring: new Float64Array(n), pos: 0, total: 0, dirty: false };
    w.pushSamples = vals => { const s = w.stream; for (const v of vals) { s.ring[s.pos] = v; s.pos = (s.pos + 1) % s.ring.length; s.total++; } s.dirty = true; };
    w.state.timer = setInterval(() => {
      const s = w.stream; if (!s.dirty) return; s.dirty = false;
      const y = new Float64Array(s.ring.length); y.set(s.ring.subarray(s.pos)); y.set(s.ring.subarray(0, s.pos), s.ring.length - s.pos);
      w.data = Object.assign({}, w.data, { y, x0: Math.max(0, s.total - y.length) / fs }); if (w.autoX) APP.fitX(w); APP.afterData(w);
    }, 50);
    return w;
  }
  function parseText(text, carry) {
    const lines = (carry + text).split(/\r?\n/), rest = lines.pop(), rows = [];
    for (const l of lines) { const v = l.split(/[,;\t ]+/).map(Number).filter(x => !isNaN(x)); if (v.length) rows.push(v); }
    return { rows, rest };
  }
  async function networkReceiver() {
    const v = await dialog({ title: 'Network receiver', intro: 'Receives samples over UDP or TCP (desktop app) and shows them as live signal windows. Text: one line per sample, columns = channels. Binary: 32-bit float little-endian, channels interleaved.', fields: [
      { key: 'proto', label: 'Protocol', type: 'select', options: [['udp', 'UDP'], ['tcp', 'TCP (listen)']], value: 'udp' },
      { key: 'port', label: 'Port', type: 'number', value: 5005, min: 1, max: 65535, step: 1 },
      { key: 'format', label: 'Data format', type: 'select', options: [['text', 'Text lines (CSV)'], ['f32', 'Binary float32']], value: 'text' },
      { key: 'channels', label: 'Channels', type: 'number', value: 1, min: 1, max: 16, step: 1 },
      { key: 'fs', label: 'Sample rate (samples/s)', type: 'number', value: 1000, min: 0.001 },
      { key: 'seconds', label: 'Keep last … seconds', type: 'number', value: 10, min: 0.1 }] });
    if (!v) return;
    if (!HOST.available) throw new Error('Network input needs the desktop app (OpenSig.exe).');
    await HOST.call(v.proto === 'udp' ? 'udpListen' : 'tcpListen', { port: v.port });
    const wins = Array.from({ length: v.channels }, (_, c) => streamWindow(`Network ${v.proto.toUpperCase()}:${v.port}${v.channels > 1 ? ' ch ' + (c + 1) : ''}`, v.fs, v.seconds));
    let carry = '';
    const handler = m => {
      if (m.port !== v.port || !wins.some(APP.isOpen)) return;
      const buf = HOST.b64.to(m.b64);
      if (v.format === 'f32') { const f = new Float32Array(buf.slice(0, Math.floor(buf.byteLength / 4) * 4)); for (let c = 0; c < v.channels; c++) { const vals = []; for (let i = c; i < f.length; i += v.channels) vals.push(f[i]); wins[c].pushSamples(vals); } }
      else { const r = parseText(new TextDecoder().decode(buf), carry); carry = r.rest; for (let c = 0; c < v.channels; c++) wins[c].pushSamples(r.rows.map(x => x[c] ?? 0)); }
    };
    HOST.on('net', handler);
    wins[0].onClose = () => HOST.call('netStop', { port: v.port }).catch(() => {});
    toast(`Listening on ${v.proto.toUpperCase()} port ${v.port}`);
  }
  async function networkSender() {
    const cands = [...S.wins.values()].filter(w => w.data && (w.data.y || w.kind === 'instrument'));
    if (!cands.length) throw new Error('Open a signal or instrument window first.');
    const v = await dialog({ title: 'Network sender', intro: 'Sends a window\'s data each time it changes (desktop app). Signals: all values of the window; instruments: one value per line.', fields: [
      { key: 'win', label: 'Window', type: 'select', options: cands.map(w => [w.id, `${w.label} – ${w.title}`]), value: (S.active && cands.includes(S.active) ? S.active : cands[0]).id },
      { key: 'proto', label: 'Protocol', type: 'select', options: [['udp', 'UDP'], ['tcp', 'TCP (connect)']], value: 'udp' },
      { key: 'host', label: 'Host', type: 'text', value: '127.0.0.1' },
      { key: 'port', label: 'Port', type: 'number', value: 5006, min: 1, max: 65535, step: 1 },
      { key: 'format', label: 'Data format', type: 'select', options: [['text', 'Text lines'], ['f32', 'Binary float32']], value: 'text' }] });
    if (!v) return;
    if (!HOST.available) throw new Error('Network output needs the desktop app (OpenSig.exe).');
    const w = S.wins.get(+v.win); let last = -1, sent = 0;
    const timer = setInterval(async () => {
      if (!APP.isOpen(w)) return clearInterval(timer);
      if (w.version === last) return; last = w.version;
      let payload;
      if (w.kind === 'instrument') payload = v.format === 'f32' ? new Float32Array([w.data.value]).buffer : new TextEncoder().encode(IO.fmtNum(w.data.value) + '\n').buffer;
      else { const y = w.data.y.length > 16384 ? w.data.y.subarray(w.data.y.length - 16384) : w.data.y; payload = v.format === 'f32' ? Float32Array.from(y).buffer : new TextEncoder().encode(Array.from(y, IO.fmtNum).join('\n') + '\n').buffer; }
      try { await HOST.call('netSend', { proto: v.proto, host: v.host, port: v.port, b64: HOST.b64.from(payload) }); sent++; } catch (e) { toast('Network sender: ' + e.message, 'err'); clearInterval(timer); }
    }, 100);
    const ind = APP.createWindow({ kind: 'display', title: `Network sender → ${v.host}:${v.port}`, data: { text: `Sending ${w.label} (${w.title}) to ${v.proto.toUpperCase()} ${v.host}:${v.port} as ${v.format === 'f32' ? 'float32' : 'text'}.\nClose this window to stop.` }, source: { type: 'copy' } });
    ind.onClose = () => clearInterval(timer); void sent;
  }
  async function serialPorts() {
    if (HOST.available) return HOST.call('serialList');
    return [];
  }
  async function serialInput() {
    const ports = await serialPorts();
    const v = await dialog({ title: 'Serial input', intro: 'Reads text lines of numbers from a serial port (one line per sample, columns = channels).' + (HOST.available ? '' : ' In the browser the port is chosen in the next step (Web Serial).'), fields: [
      ...(HOST.available ? [{ key: 'port', label: 'Port', type: 'select', options: ports.length ? ports : ['COM1'], value: ports[0] || 'COM1' }] : []),
      { key: 'baud', label: 'Baud rate', type: 'select', options: [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600], value: 115200 },
      { key: 'channels', label: 'Channels (columns)', type: 'number', value: 1, min: 1, max: 16, step: 1 },
      { key: 'fs', label: 'Sample rate of the incoming data', type: 'number', value: 100, min: 0.001 },
      { key: 'seconds', label: 'Keep last … seconds', type: 'number', value: 30, min: 0.1 }] });
    if (!v) return;
    const wins = Array.from({ length: v.channels }, (_, c) => streamWindow(`Serial ${v.port || 'port'}${v.channels > 1 ? ' ch ' + (c + 1) : ''}`, v.fs, v.seconds));
    let carry = '';
    const feed = text => { const r = parseText(text, carry); carry = r.rest; for (let c = 0; c < v.channels; c++) wins[c].pushSamples(r.rows.map(x => x[c] ?? 0)); };
    if (HOST.available) {
      await HOST.call('serialOpen', { port: v.port, baud: +v.baud });
      HOST.on('serial', m => { if (m.port === v.port) feed(m.text); });
      wins[0].onClose = () => HOST.call('serialClose', { port: v.port }).catch(() => {});
    } else {
      if (!navigator.serial) throw new Error('Serial ports need the desktop app or a browser with Web Serial (Chrome/Edge).');
      const port = await navigator.serial.requestPort(); await port.open({ baudRate: +v.baud });
      const reader = port.readable.pipeThrough(new TextDecoderStream()).getReader(); let open = true;
      (async () => { while (open) { const { value, done } = await reader.read(); if (done) break; feed(value); } })();
      wins[0].onClose = async () => { open = false; try { await reader.cancel(); await port.close(); } catch (e) { /* closed */ } };
    }
  }
  async function serialOutput() {
    const cands = [...S.wins.values()].filter(w => w.kind === 'instrument' || (w.data && w.data.y));
    if (!cands.length) throw new Error('Open an instrument or signal window first.');
    const ports = await serialPorts();
    const v = await dialog({ title: 'Serial output', intro: 'Writes the current value of a window to a serial port at a fixed interval (instrument value, or the last sample of a signal).', fields: [
      { key: 'win', label: 'Window', type: 'select', options: cands.map(w => [w.id, `${w.label} – ${w.title}`]), value: cands[0].id },
      ...(HOST.available ? [{ key: 'port', label: 'Port', type: 'select', options: ports.length ? ports : ['COM1'], value: ports[0] || 'COM1' }] : []),
      { key: 'baud', label: 'Baud rate', type: 'select', options: [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200], value: 9600 },
      { key: 'ms', label: 'Interval (ms)', type: 'number', value: 1000, min: 10, step: 1 },
      { key: 'fmt', label: 'Line format ({value}, {time})', type: 'text', value: '{value}' }] });
    if (!v) return;
    const w = S.wins.get(+v.win);
    let write;
    if (HOST.available) { await HOST.call('serialOpen', { port: v.port, baud: +v.baud }); write = t => HOST.call('serialWrite', { port: v.port, text: t }); }
    else { if (!navigator.serial) throw new Error('Serial ports need the desktop app or Web Serial.'); const port = await navigator.serial.requestPort(); await port.open({ baudRate: +v.baud }); const wr = port.writable.getWriter(); write = t => wr.write(new TextEncoder().encode(t)); }
    const timer = setInterval(() => {
      if (!APP.isOpen(w) || !w.data) return;
      const val = w.kind === 'instrument' ? w.data.value : w.data.y[w.data.y.length - 1];
      write(v.fmt.replace('{value}', IO.fmtNum(val)).replace('{time}', new Date().toISOString()) + '\n').catch(e => { toast('Serial output: ' + e.message, 'err'); clearInterval(timer); });
    }, v.ms);
    const ind = APP.createWindow({ kind: 'display', title: `Serial output ${v.port || ''}`, data: { text: `Writing ${w.label} every ${v.ms} ms. Close this window to stop.` }, source: { type: 'copy' } });
    ind.onClose = () => { clearInterval(timer); if (HOST.available) HOST.call('serialClose', { port: v.port }).catch(() => {}); };
  }

  /* ======================= Batch processing ======================= */
  const settle = async () => { for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 60)); if ([...S.wins.values()].every(w => w.data || w.error)) { await new Promise(r => setTimeout(r, 150)); return; } } };
  async function batchDialog() {
    if (!S.wins.size) throw new Error('First build a workspace that processes one signal file (open a file, add FFT / instruments …).');
    const ws = [...S.wins.values()], sources = ws.filter(w => !w.op || w.frozen), outs = ws.filter(w => w.data && (w.data.y || w.kind === 'instrument'));
    const v = await dialog({ title: 'Batch file processing', intro: '1) The current workspace is the template. 2) Each input file replaces the input window. 3) The selected windows are saved for every file; instrument values go into one summary CSV.', fields: [
      { key: 'input', label: 'Input signal window', type: 'select', options: sources.map(w => [w.id, `${w.label} – ${w.title}`]), value: sources[0] && sources[0].id },
      { type: 'section', label: 'Windows / results to save after each file' },
      ...outs.map((w, i) => ({ key: 'o' + i, label: `${w.label} – ${w.title}${w.kind === 'instrument' ? ' (value → summary CSV)' : ''}`, type: 'check', value: w.kind === 'instrument' })),
      { key: 'format', label: 'Save signals as', type: 'select', options: [['csv', 'ASCII / CSV'], ['wav', 'WAV (32-bit float)']], value: 'csv' },
      { key: 'pattern', label: 'Input file filter (desktop app)', type: 'text', value: '*.wav', show: () => HOST.available }], ok: HOST.available ? 'Choose input folder…' : 'Choose input files…' });
    if (!v) return;
    const template = APP.serialize(true), order = template.windows.map(x => x.id), inputIdx = order.indexOf(+v.input);
    const selected = outs.filter((w, i) => v['o' + i]).map(w => ({ idx: order.indexOf(w.id), kind: w.kind, label: w.label, title: w.title }));
    let files = [], outDir = null;
    if (HOST.available) {
      const inDir = await HOST.pickFolder('Input folder'); if (!inDir) return;
      outDir = await HOST.pickFolder('Output folder'); if (!outDir) return;
      files = (await HOST.listFiles(inDir, v.pattern || '*.*')).map(p => ({ path: p }));
    } else {
      files = await new Promise(res => { const i = h('input', { type: 'file', multiple: true }); i.onchange = () => res([...i.files].map(f => ({ file: f }))); i.click(); });
    }
    if (!files.length) throw new Error('No input files found');
    const zipFiles = [], summary = ['file,' + selected.filter(s => s.kind === 'instrument').map(s => `"${s.label} ${s.title}"`).join(',')];
    root.AUTOMATION_ACTIVE = true;
    try {
      for (let k = 0; k < files.length; k++) {
        const f = files[k].file || UI.fileLike(await HOST.readFile(files[k].path)), base = UI.baseName(f.name);
        toast(`Batch ${k + 1}/${files.length}: ${f.name}`);
        const ws2 = JSON.parse(JSON.stringify(template));
        await APP.loadWorkspaceSmart(ws2, f);
        await settle();
        const now = [...S.wins.values()].sort((a, b) => a.id - b.id), row = [f.name];
        void inputIdx;
        for (const s of selected) {
          const w = now[s.idx]; if (!w || !w.data) { if (s.kind === 'instrument') row.push(''); continue; }
          if (s.kind === 'instrument') { row.push(IO.fmtNum(w.data.value)); continue; }
          const d = w.data, name = `${base}_${safeName(s.title)}.${v.format}`;
          const bytes = v.format === 'wav' && !d.x ? IO.encodeWav([d.y], 1 / d.dx, 'float32') : new TextEncoder().encode(IO.toCsv(i => d.x ? d.x[i] : d.x0 + i * d.dx, d.y, true)).buffer;
          if (outDir) await HOST.writeFile(joinPath(outDir, name), bytes); else zipFiles.push({ name, data: new Uint8Array(bytes) });
        }
        summary.push(row.join(','));
      }
      if (outDir) await HOST.writeText(joinPath(outDir, 'instrument_values.csv'), summary.join('\r\n'));
      else { zipFiles.push({ name: 'instrument_values.csv', data: summary.join('\r\n') }); download('batch_results.zip', FORMATS.zip(zipFiles)); }
    } finally {
      root.AUTOMATION_ACTIVE = false;
      APP.loadWorkspace(template);
    }
    toast(`Batch finished: ${files.length} file(s)` + (outDir ? ' → ' + outDir : ''));
  }
  async function scriptGenerator() {
    if (!S.wins.size) throw new Error('Build a workspace that processes one signal first.');
    const ws = [...S.wins.values()], outs = ws.filter(w => w.data && (w.data.y || w.kind === 'instrument'));
    const v = await dialog({ title: 'Batch file processing script generator', intro: 'Creates a Windows batch file that drives OpenSig.exe from the command line: "do.bat" "input dir" *.wav "output dir". Save the current workspace first (the script loads it for each file).', fields: [
      { key: 'ws', label: 'Workspace file used by the script', type: 'text', value: 'C:\\OpenSig\\batch.osw' },
      { key: 'exe', label: 'Path of OpenSig.exe', type: 'text', value: 'OpenSig.exe' },
      ...outs.map((w, i) => ({ key: 'o' + i, label: `${w.label} – ${w.title}`, type: 'check', value: true })),
      { key: 'format', label: 'Save signals as', type: 'select', options: [['saveascii', 'ASCII (CSV)'], ['savewav32', 'WAV 32-bit float'], ['savewav16', 'WAV 16-bit']], value: 'saveascii' },
      { key: 'after', label: 'What to do with input files after processing', type: 'select', options: [['keep', 'Keep'], ['move', 'Move to "processed" subfolder'], ['delete', 'Delete']], value: 'keep' }] });
    if (!v) return;
    const sel = outs.filter((w, i) => v['o' + i]), q = s => '"' + s.replace(/"/g, '') + '"';
    const saves = sel.filter(w => w.kind !== 'instrument').map(w => `\t${q(v.exe)} -${v.format} ${q(w.title)} "!NEW_DIR!\\${safeName(w.title)}.${v.format === 'saveascii' ? 'csv' : 'wav'}"`);
    const bat = ['@echo off', 'setlocal enabledelayedexpansion', 'REM Generated by OpenSig. Usage: "do.bat" "input_directory" *.wav "output_directory"',
      'if "%~1"=="" ( echo Missing input directory & exit /b 1 )', 'if "%~2"=="" ( echo Missing file type & exit /b 1 )', 'if "%~3"=="" ( echo Missing output directory & exit /b 1 )',
      'set "INPUT_DIR=%~1"', 'set "FILE_TYPE=%~2"', 'set "OUTPUT_DIR=%~3"', 'if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"',
      v.after === 'move' ? 'if not exist "%INPUT_DIR%\\processed" mkdir "%INPUT_DIR%\\processed"' : '',
      'for %%F in ("%INPUT_DIR%\\%FILE_TYPE%") do (', '\tset "FILENAME=%%~nF"', '\tset "FULLFILENAME=%%~fF"', '\techo Processing !FULLFILENAME!',
      '\tset "NEW_DIR=%OUTPUT_DIR%\\!FILENAME!"', '\tif not exist "!NEW_DIR!" mkdir "!NEW_DIR!"',
      `\t${q(v.exe)} -closeall`, `\t${q(v.exe)} -loadsws ${q(v.ws)} "!FULLFILENAME!"`, ...saves,
      sel.some(w => w.kind === 'instrument') ? `\t${q(v.exe)} -extractvaluestocsv "%OUTPUT_DIR%\\instrument_values.csv"` : '',
      v.after === 'move' ? '\tmove "!FULLFILENAME!" "%INPUT_DIR%\\processed\\" >nul' : v.after === 'delete' ? '\tdel "!FULLFILENAME!"' : '',
      ')', `${q(v.exe)} -closeapp`, 'echo Done.'].filter(Boolean).join('\r\n');
    const r = await dialog({ title: 'Generated script', fields: [{ key: 't', label: 'Batch file', type: 'textarea', rows: 18, wide: true, value: bat }], ok: 'Save script…', cancel: 'Close',
      extra: [{ label: 'Copy script to clipboard', run: async () => { await navigator.clipboard.writeText(bat); toast('Copied'); } }] });
    if (r) download('opensig_batch.bat', r.t, 'text/plain');
  }

  /* ======================= Command-line automation ======================= */
  function findWin(name) {
    if (name == null) throw new Error('Window name missing');
    const n = String(name).trim(), lower = n.toLowerCase(), all = [...S.wins.values()];
    const m = /^w?(\d+)(#.*)?$/i.exec(n);
    return all.find(w => w.title.toLowerCase() === lower) || (m && S.wins.get(+m[1])) || all.find(w => (w.id + '#' + w.title).toLowerCase() === lower)
      || (() => { throw new Error('Window not found: ' + n); })();
  }
  async function runCommand(args) {
    const cmd = (args[0] || '').toLowerCase(), a1 = args[1], a2 = args[2];
    const fileOf = async p => UI.fileLike(await HOST.readFile(p));
    switch (cmd) {
      case '-closeall': [...S.wins.values()].forEach(w => APP.closeWindow(w)); return '';
      case '-loadsws': { const f = await HOST.readFile(a1); await APP.loadWorkspaceSmart(JSON.parse(new TextDecoder().decode(f.buffer)), a2 ? await fileOf(a2) : null, a1); await settle(); return ''; }
      case '-saveswsd': await HOST.writeText(a1, JSON.stringify(APP.serialize(true))); return '';
      case '-list': return [...S.wins.values()].map(w => `W${w.id}\t${w.id}#${w.title}\t${w.kind}${w.kind === 'instrument' && w.data ? '\t' + IO.fmtNum(w.data.value) : ''}`).join('\r\n');
      case '-show': case '-hide': return '';
      case '-daqstart': { const w = findWin(a1); if (!(w.acqShared && w.acqShared.running)) await APP.restartAcquisition(); return ''; }
      case '-daqstop': APP.stopAcquisition(findWin(a1)); return '';
      case '-daqreset': APP.resetAcquisition(); return '';
      case '-recstart': await startLog(); return '';
      case '-recstop': await stopLog(); return '';
      case '-playnotone': APP.playSilent(findWin(a1)); return '';
      case '-playfast': APP.playSilent(findWin(a1), true); return '';
      case '-playwithtone': APP.playSound(findWin(a1), 'all'); return '';
      case '-playinloop': S.settings.playLoop = true; APP.playSound(findWin(a1), 'all'); return '';
      case '-playstop': APP.stopPlayback(a1 ? findWin(a1) : undefined); return '';
      case '-zoomin': APP.zoom(findWin(a1), 0.5); return '';
      case '-zoomout': APP.resetView(findWin(a1)); return '';
      case '-reset': { const w = findWin(a1); w.state = {}; w.history = []; APP.queueCompute(w); return ''; }
      case '-resetall': S.wins.forEach(w => { w.state = {}; w.history = []; if (w.op) APP.queueCompute(w); }); return '';
      case '-getvalue': { const w = findWin(a1); if (w.kind !== 'instrument' || !w.data) throw new Error(a1 + ' is not an instrument window'); return IO.fmtNum(w.data.value); }
      case '-saveascii': { const w = findWin(a1), d = w.data; await HOST.writeText(a2, IO.toCsv(i => d.x ? d.x[i] : d.x0 + i * d.dx, d.y, true)); return ''; }
      case '-savewav16': case '-savewav32': { const d = findWin(a1).data; await HOST.writeFile(a2, IO.encodeWav([d.y], 1 / d.dx, cmd === '-savewav16' ? 'int16' : 'float32')); return ''; }
      case '-savebitmap': { const w = findWin(a1); const b = await new Promise(r => w.canvas.toBlob(r, 'image/png')); await HOST.writeFile(a2, await b.arrayBuffer()); return ''; }
      case '-savesignalmetrics': { const w = findWin(a1); await HOST.writeText(a2, JSON.stringify(SIGMETRICS.compute(APP.visibleData(w)), null, 1)); return ''; }
      case '-extractvaluestocsv': {
        const ins = instruments().sort((a, b) => a.id - b.id), exists = await HOST.call('exists', { path: a1 });
        const head = exists ? '' : 'time,' + ins.map(w => `"${w.title}"`).join(',') + '\r\n';
        await HOST.writeText(a1, head + new Date().toISOString() + ',' + ins.map(w => IO.fmtNum(w.data.value)).join(',') + '\r\n', true); return '';
      }
      case '-help': return 'See OpenSig.exe -help';
      default:
        if (!cmd.startsWith('-')) { const f = await fileOf(args[0]); await UI.openFile(f, /\.(osw|json)$/i.test(args[0]) ? 'workspace' : null); return ''; }
        throw new Error('Unknown command ' + args[0]);
    }
  }
  if (HOST.available) {
    addEventListener('error', e => HOST.call('log', { text: `${e.message} @ ${e.filename}:${e.lineno}` }).catch(() => {}));
    addEventListener('unhandledrejection', e => HOST.call('log', { text: 'unhandled: ' + (e.reason && e.reason.message || e.reason) }).catch(() => {}));
  }
  if (HOST.available) HOST.on('automation', async m => {
    root.AUTOMATION_ACTIVE = true;
    let ok = true, output = '';
    try { output = await runCommand(m.args || []); } catch (e) { ok = false; output = e.message; }
    root.AUTOMATION_ACTIVE = false;
    HOST.call('automationReply', { token: m.token, ok, output: String(output ?? '') }).catch(() => {});
  });
  IOX.runCommand = runCommand;

  /* ======================= Auto-save and restore ======================= */
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('opensig', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function kvSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function kvGet(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readonly'), q = t.objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
  let autosaveTimer = null;
  IOX.scheduleAutosave = () => {
    clearInterval(autosaveTimer);
    if (S.settings.autosaveMin > 0) autosaveTimer = setInterval(() => { if (APP.tabs.list().some(t => t.wins.size)) kvSet('autosave', { t: Date.now(), ws: JSON.stringify(APP.tabs.serialize(true)) }).catch(() => {}); }, S.settings.autosaveMin * 60000);
  };
  function saveLast() { try { sessionStorage.setItem('opensig.clean', '1'); } catch (e) { /* ignore */ } if (S.settings.restoreLast) kvSet('last', { t: Date.now(), ws: JSON.stringify(APP.tabs.serialize(true)) }).catch(() => {}); }
  addEventListener('pagehide', saveLast);
  addEventListener('beforeunload', saveLast);
  async function restoreOnStart() {
    IOX.scheduleAutosave();
    try {
      let crashed = false; try { crashed = localStorage.getItem('opensig.running') === '1' && sessionStorage.getItem('opensig.clean') !== '1'; localStorage.setItem('opensig.running', '1'); } catch (e) { /* ignore */ }
      addEventListener('pagehide', () => { try { localStorage.setItem('opensig.running', '0'); } catch (e) { /* ignore */ } });
      const last = S.settings.restoreLast ? await kvGet('last') : null, auto = await kvGet('autosave');
      if (crashed && auto && (!last || auto.t > last.t) && S.settings.autosaveMin > 0) {
        if (await dialog({ title: 'Recover workspace', intro: `OpenSig was not closed normally. Restore the workspaces auto-saved at ${new Date(auto.t).toLocaleString()}?`, fields: [], ok: 'Restore', cancel: 'Discard' })) { APP.tabs.load(JSON.parse(auto.ws)); return; }
      }
      if (last && !S.wins.size) APP.tabs.load(JSON.parse(last.ws));
    } catch (e) { console.warn('restore failed', e); }
  }

  /* ======================= Menu wiring ======================= */
  const acqMenu = UI.MENUS.find(m => m.label === 'Data acquisition');
  acqMenu.items = [
    { label: 'Device calibration…', run: () => calibrationDialog() },
    { label: 'Open data acquisition…', key: 'Ctrl+Q', run: acquisitionDialog },
    { label: 'Start acquisition', key: 'Ctrl+R', en: () => [...S.wins.values()].some(w => w.acqConfig && !(w.acqShared && w.acqShared.running)), run: () => APP.restartAcquisition() },
    { label: 'Stop acquisition', key: 'Ctrl+K', en: () => (S.acquisitions || []).length > 0, run: () => { APP.stopAcquisition(); toast('Acquisition stopped'); } },
    { label: 'Reset acquisition window', run: () => { APP.resetAcquisition(); toast('Acquisition windows and statistics reset'); } },
    '-',
    { label: 'Log data in file…', run: logDialog },
    { label: 'Start logging', en: () => !!(IOX.logger && !IOX.logger.running), run: startLog },
    { label: 'Stop logging', en: () => !!(IOX.logger && IOX.logger.running), run: stopLog },
    '-',
    { label: 'Network receiver…', run: networkReceiver },
    { label: 'Network sender…', run: networkSender },
    { label: 'Serial input…', run: serialInput },
    { label: 'Serial output…', run: serialOutput }];
  const instMenu = UI.MENUS.find(m => m.label === 'Instruments');
  instMenu.items.push({ label: 'Instrument alarm actions…', en: () => S.active && S.active.kind === 'instrument', run: alarmDialog });
  // the original acquisition dialog is replaced; keep Ctrl+Q / toolbar pointing at the new one
  const tbAcq = UI.TOOLBAR[0].find(b => b !== '|' && /data acquisition/i.test(b.title)); if (tbAcq) tbAcq.run = acquisitionDialog;
  root.UI_ACQ = acquisitionDialog;

  IOX.render = () => APP.emit && APP.emit();
  Object.assign(IOX, { logInstruments, stopInstLog, networkReceiver, networkSender, serialInput, serialOutput, batchDialog, scriptGenerator, calibrationDialog, acquisitionDialog, startLog, stopLog, restoreOnStart, findWin });
  root.IOX = IOX;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(restoreOnStart, 50)); else setTimeout(restoreOnStart, 50);
})(window);
