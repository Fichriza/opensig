/* OpenSig: following a CSV file that another program keeps writing (a data logger, a test rig). The file is read again
   every few seconds: rows added at the end are appended to the signal windows (one per column), or, for a program that
   writes the whole file again, the windows get its new content. Linked windows (FFT, filters, instruments) follow, as
   for live input. Desktop app: any file, read while the other program keeps it open; Chrome / Edge: a file picked
   through the browser's file access (showOpenFilePicker). The import settings are those of the ASCII / CSV import. */
(function (root) {
  'use strict';
  const { APP, UI, IO, HOST } = root, { dialog, toast, guard } = UI;
  const CHUNK = 16 << 20, PER_CHECK = 4;                   // bytes per read, reads per check (then the next one at once)
  const FILTER = 'CSV / text (*.csv;*.txt;*.dat;*.tsv;*.asc)|*.csv;*.txt;*.dat;*.tsv;*.asc|All files (*.*)|*.*';
  const followers = new Set();

  // the file: {name, path?, read(offset, length) → {size, mtime, buffer}}
  async function pickSource() {
    if (HOST.available) {
      const path = await HOST.pickFile(FILTER); if (!path) return null;
      return { name: path.split(/[\\/]/).pop(), path, read: (offset, length) => HOST.readRange(path, offset, length) };
    }
    if (!root.showOpenFilePicker) throw new Error('Following a file needs the OpenSig desktop app (Windows), Chrome or Edge.');
    let handle;
    try { [handle] = await root.showOpenFilePicker({ types: [{ description: 'CSV / text', accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt', '.dat', '.tsv', '.asc'] } }] }); }
    catch (e) { if (e.name === 'AbortError') return null; throw e; }
    return { name: handle.name, read: async (offset, length) => {
      const f = await handle.getFile();                     // the file as it is now
      return { size: f.size, mtime: f.lastModified, buffer: offset < f.size && length > 0 ? await f.slice(offset, offset + length).arrayBuffer() : new ArrayBuffer(0) };
    } };
  }

  // The complete lines added since the last check. Starts again at the beginning when the file was written anew:
  // any change in "rewrite" mode, a file that got shorter in "append" mode. An unfinished last line waits (st.pending),
  // except in "rewrite" mode once the whole file is read.
  async function readNew(st) {
    let r = await st.src.read(st.offset, CHUNK), restart = false;
    if (st.mode === 'rewrite' ? st.offset > 0 && (r.size !== st.size || r.mtime !== st.mtime) : r.size < st.offset) {
      restart = true; st.offset = 0; st.pending = ''; st.decoder = new TextDecoder();
      r = await st.src.read(0, CHUNK);
    }
    let text = '';
    for (let k = 1; ; k++) {
      const n = r.buffer.byteLength;
      if (n) { text += st.decoder.decode(r.buffer, { stream: true }); st.offset += n; }
      st.size = r.size; st.mtime = r.mtime;
      if (!n || st.offset >= r.size || k >= PER_CHECK) break;
      r = await st.src.read(st.offset, CHUNK);
    }
    text = st.pending + text;
    const cut = st.mode === 'rewrite' && st.offset >= st.size ? text.length : text.lastIndexOf('\n') + 1;
    st.pending = text.slice(cut);
    return { text: text.slice(0, cut), restart, more: st.offset < st.size };
  }

  // values of a column, kept in a buffer that grows by doubling; the window shows a view of [start, end)
  const newBuf = () => ({ a: new Float64Array(1024), start: 0, end: 0 });
  function push(b, v) {
    if (b.end + v.length > b.a.length) {
      const n = b.end - b.start, a = new Float64Array(Math.max(1024, 2 * (n + v.length)));
      a.set(b.a.subarray(b.start, b.end)); b.a = a; b.start = 0; b.end = n;
    }
    b.a.set(v, b.end); b.end += v.length;
  }
  // sample spacing: from the time column (its average, as the import computes it) or the given sample rate
  const dxOf = st => st.timed && st.total > 1 && st.tLast > st.tFirst ? (st.tLast - st.tFirst) / (st.total - 1) : 1 / st.fs;

  function reset(st) { // the file was written anew: start from its beginning, in the same windows
    Object.assign(st, { fresh: true, head: '', total: 0, dropped: 0, tFirst: null, tLast: null });
    if (st.bufs) st.bufs = st.bufs.map(newBuf);
  }

  // parses new lines; the first ones use all import settings (header rows, separator detection) and may be only a header
  function addRows(st, text) {
    if (st.fresh) { st.head += text; text = st.head; }
    let res;
    try { res = IO.parseCsv(text, st.fresh ? Object.assign({}, st.opts, { timeColumn: false }) : { separator: st.sep, decimal: st.opts.decimal, ignore: st.opts.ignore }); }
    catch (e) { return false; }                             // no numeric rows yet
    if (st.fresh) { st.fresh = false; st.head = ''; st.sep = res.separator; }
    let cols = res.columns, t = null;
    if (st.opts.timeColumn && (st.wins ? st.timed : cols.length > 1)) { t = cols[0].data; cols = cols.slice(1); }
    const n = cols.length ? cols[0].data.length : t ? t.length : 0;
    if (!st.wins) {
      st.timed = !!t; st.bufs = cols.map(newBuf);
      st.wins = cols.map(c => APP.createWindow({ kind: '1d', title: `${st.src.name} – ${c.name}`, data: { y: new Float64Array(0), x0: 0, dx: 1 / st.fs, xUnit: 's', yUnit: '' },
        source: { type: 'file', name: st.src.name, path: st.src.path } }));
    }
    st.bufs.forEach((b, i) => push(b, cols[i] ? cols[i].data : new Float32Array(n))); // a missing column reads as 0, as in the import
    if (t && n) { if (st.tFirst == null) st.tFirst = t[0]; st.tLast = t[n - 1]; }
    st.total += n;
    const keep = st.keep > 0 ? Math.max(1, Math.round(st.keep / dxOf(st))) : Infinity;
    for (const b of st.bufs) if (b.end - b.start > keep) { const k = b.end - b.start - keep; b.start += k; if (b === st.bufs[0]) st.dropped += k; }
    return true;
  }

  const noteOf = st => `following ${st.src.name}` + (st.error ? ' · ⚠ ' + st.error : ` · ${st.total} rows` + (st.dropped ? ` (showing the last ${st.total - st.dropped})` : ''));

  // the windows show the buffers; a view that ended at the last sample keeps showing the newest data
  function show(st) {
    const dx = dxOf(st), x0 = st.dropped * dx, note = noteOf(st);
    st.wins.forEach((w, i) => {
      if (!APP.isOpen(w)) return;
      const b = st.bufs[i], [, end0] = APP.extentX(w), span = w.view.x1 - w.view.x0, atEnd = !w.autoX && w.view.x1 >= end0 - span * 1e-6;
      w.data = Object.assign({}, w.data, { y: b.a.subarray(b.start, b.end), x0, dx, note });
      if (atEnd) { const [, e] = APP.extentX(w); w.view.x1 = e; w.view.x0 = e - span; }
      APP.afterData(w);
    });
  }
  function setNote(st) { if (st.wins) st.wins.forEach(w => { if (APP.isOpen(w)) { w.data = Object.assign({}, w.data, { note: noteOf(st) }); APP.requestRender(w); } }); }

  async function check(st) {
    const r = await readNew(st);
    if (!st.on) return false;
    if (r.restart) reset(st);
    if ((r.text && addRows(st, r.text)) || (r.restart && st.wins)) show(st);
    return r.more;
  }
  async function tick(st) {
    if (!st.on) return;
    if (st.wins && !st.wins.some(APP.isOpen)) { stop(st); return; } // its windows were closed
    let more = false;
    try { more = await check(st); if (st.error) { st.error = null; setNote(st); } }
    catch (e) { // keeps trying: the file may be locked, renamed or replaced for a moment
      if (!st.error) toast(`${st.src.name}: ${e.message}`, 'err');
      st.error = e.message || String(e); setNote(st);
    }
    if (st.on) st.timer = setTimeout(() => tick(st), more ? 20 : st.every * 1000);
  }

  function stop(st) {
    st.on = false; clearTimeout(st.timer); followers.delete(st);
    if (st.wins) st.wins.forEach(w => { if (APP.isOpen(w)) { w.data = Object.assign({}, w.data, { y: w.data.y.slice(), note: 'stopped following ' + st.src.name }); APP.requestRender(w); } });
    APP.emit();
  }
  function stopAll() { const n = followers.size; [...followers].forEach(stop); if (n) toast(`Stopped following ${n} file${n > 1 ? 's' : ''}`); }

  // asks for the import settings and how the file is written, then reads it and keeps reading it
  async function follow(src) {
    const first = await src.read(0, 1 << 16);
    const r = await UI.csvDialog(new TextDecoder().decode(first.buffer), 'Follow updating CSV file – ' + src.name, [
      { type: 'section', label: 'Following the file' },
      { key: 'every', label: 'Read the file again every … seconds', type: 'number', value: 1, min: 0.1, step: 0.1 },
      { key: 'mode', label: 'The program writing the file', type: 'select', options: [['append', 'adds rows at the end'], ['rewrite', 'writes the whole file again']], value: 'append' },
      { key: 'keep', label: 'Keep the last … seconds (0 = everything)', type: 'number', value: 0, min: 0, step: 1, hint: 'older rows leave the windows' }]);
    if (!r) return null;
    const st = { src, opts: UI.csvOptions(r), fs: r.fs > 0 ? r.fs : 1, every: Math.max(0.1, +r.every || 1), mode: r.mode, keep: Math.max(0, +r.keep || 0),
      offset: 0, size: -1, mtime: 0, pending: '', decoder: new TextDecoder(), wins: null, bufs: null, on: true };
    reset(st);
    followers.add(st); APP.emit();
    await tick(st);
    toast(st.wins ? `Following ${src.name}: ${st.wins.length} column${st.wins.length > 1 ? 's' : ''}, ${st.total} rows so far` : `Following ${src.name}: waiting for data rows`);
    return st;
  }

  const items = [{ label: 'Follow updating CSV file…', run: guard(async () => { const src = await pickSource(); if (src) await follow(src); }) },
    { label: 'Stop following CSV files', en: () => followers.size > 0, run: stopAll }];
  const csv = UI.MENUS.find(m => m.label === 'File').items.find(it => it.label === 'ASCII / CSV files').sub;
  csv.splice(csv.findIndex(it => it.label === 'Import ASCII / CSV…') + 1, 0, ...items);
  UI.MENUS.find(m => m.label === 'Data acquisition').items.push('-', ...items);

  root.FOLLOW = { follow, stop: stopAll, count: () => followers.size };
})(window);
