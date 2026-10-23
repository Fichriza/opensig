/* OpenSig additional file formats: compressed audio, MATLAB, NumPy, UFF 58, GDF, EDF/BDF, HDF5/JLD2, data logs, ZIP output.
   Each reader returns a list of signals: {name, y, x0, dx, xUnit, yUnit, t0abs?}. */
(function (root) {
  'use strict';
  const str = (u8, a, n) => { let s = ''; for (let i = a; i < a + n && i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; };
  const trimz = s => s.replace(/\0+$/, '').trim();
  async function inflate(u8, raw) {
    const ds = new DecompressionStream(raw ? 'deflate-raw' : 'deflate');
    return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
  }
  const FS_NAMES = /^(fs|Fs|FS|srate|sr|SR|sample_?rate|SampleRate|sampleRate|samplingRate|sampling_?rate|SamplingFrequency|sampling_frequency)$/;
  const toSignals = (name, data, rows, cols, fs, colMajor) => {
    // vector → one signal; matrix → one signal per column (or per row when there are more rows than columns' length)
    const out = [];
    if (rows === 1 || cols === 1) out.push({ name, y: Float64Array.from(data) });
    else {
      const byCol = rows >= cols, count = byCol ? cols : rows, len = byCol ? rows : cols;
      for (let c = 0; c < Math.min(count, 64); c++) {
        const y = new Float64Array(len);
        for (let i = 0; i < len; i++) { const r = byCol ? i : c, k = byCol ? c : i; y[i] = colMajor ? data[k * rows + r] : data[r * cols + k]; }
        out.push({ name: `${name}(${byCol ? ':,' + (c + 1) : c + 1 + ',:'})`, y });
      }
    }
    out.forEach(s => Object.assign(s, { x0: 0, dx: 1 / (fs || 1), xUnit: fs ? 's' : 'index', yUnit: '' }));
    return out;
  };

  /* ---------- Compressed audio (decoded by the browser at the file's native rate) ---------- */
  function sniffRate(u8) {
    if (str(u8, 0, 4) === 'fLaC') return (u8[18] << 12) | (u8[19] << 4) | (u8[20] >> 4);
    if (str(u8, 0, 4) === 'OggS') {
      for (let i = 0; i < Math.min(u8.length - 20, 4096); i++) {
        if (str(u8, i, 7) === '\x01vorbis') return u8[i + 12] | (u8[i + 13] << 8) | (u8[i + 14] << 16) | (u8[i + 15] << 24);
        if (str(u8, i, 8) === 'OpusHead') return 48000;
      }
    }
    if (str(u8, 0, 4) === 'FORM') { // AIFF: COMM chunk, 80-bit float sample rate
      for (let i = 12; i < u8.length - 26; i++) if (str(u8, i, 4) === 'COMM') {
        const e = ((u8[i + 16] & 0x7f) << 8 | u8[i + 17]) - 16383; let m = 0; for (let k = 0; k < 8; k++) m = m * 256 + u8[i + 18 + k];
        return Math.round(m * Math.pow(2, e - 63));
      }
    }
    let i = 0; if (str(u8, 0, 3) === 'ID3') i = 10 + ((u8[6] & 0x7f) << 21 | (u8[7] & 0x7f) << 14 | (u8[8] & 0x7f) << 7 | (u8[9] & 0x7f));
    for (; i < Math.min(u8.length - 4, i + 65536); i++) if (u8[i] === 0xff && (u8[i + 1] & 0xe0) === 0xe0) { // MPEG audio frame
      const ver = (u8[i + 1] >> 3) & 3, idx = (u8[i + 2] >> 2) & 3; if (idx === 3 || ver === 1) continue;
      return [[11025, 12000, 8000], null, [22050, 24000, 16000], [44100, 48000, 32000]][ver][idx];
    }
    return 0;
  }
  async function decodeAudio(buf, name) {
    const rate = sniffRate(new Uint8Array(buf, 0, Math.min(buf.byteLength, 200000))) || 48000;
    const ctx = new OfflineAudioContext(1, 1, rate);
    const ab = await ctx.decodeAudioData(buf.slice(0));
    const sigs = [];
    for (let c = 0; c < ab.numberOfChannels; c++) sigs.push({ name: name + (ab.numberOfChannels > 1 ? ` [ch ${c + 1}]` : ''), y: Float64Array.from(ab.getChannelData(c)), x0: 0, dx: 1 / ab.sampleRate, xUnit: 's', yUnit: '' });
    return sigs;
  }

  /* ---------- MATLAB .mat (Level 5; v7.3 is HDF5) ---------- */
  const MAT_TYPES = { 1: ['getInt8', 1], 2: ['getUint8', 1], 3: ['getInt16', 2], 4: ['getUint16', 2], 5: ['getInt32', 4], 6: ['getUint32', 4], 7: ['getFloat32', 4], 9: ['getFloat64', 8], 12: ['getBigInt64', 8], 13: ['getBigUint64', 8] };
  async function parseMat(buf, name) {
    const u8 = new Uint8Array(buf);
    if (/MATLAB 7\.3/.test(str(u8, 0, 116))) return parseHdf5(buf, name);
    if (!/^MATLAB 5\.0/.test(str(u8, 0, 10))) throw new Error('Not a MATLAB Level 5 MAT-file (MAT v4 is not supported)');
    const le = str(u8, 126, 2) === 'IM';
    const vars = [];
    const readElems = async (bytes, base, end, prefix) => {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let p = base;
      while (p + 8 <= end) {
        let type = dv.getUint32(p, le), n = dv.getUint32(p + 4, le), data = p + 8, next;
        if (type >>> 16) { n = type >>> 16; type &= 0xffff; data = p + 4; next = p + 8; } else next = data + n + ((8 - (n % 8)) % 8);
        if (type === 15) { const inner = await inflate(bytes.subarray(data, data + n)); await readElems(inner, 0, inner.length, prefix); }
        else if (type === 14 && n > 0) parseMatrix(bytes, dv, data, data + n, prefix);
        p = next;
      }
    };
    const sub = (dv, p) => { let type = dv.getUint32(p, le), n = dv.getUint32(p + 4, le), data = p + 8, next; if (type >>> 16) { n = type >>> 16; type &= 0xffff; data = p + 4; next = p + 8; } else next = data + n + ((8 - (n % 8)) % 8); return { type, n, data, next }; };
    const numeric = (dv, e) => {
      const t = MAT_TYPES[e.type]; if (!t) return null;
      const cnt = Math.floor(e.n / t[1]), out = new Float64Array(cnt);
      for (let i = 0; i < cnt; i++) out[i] = Number(dv[t[0]](e.data + i * t[1], le));
      return out;
    };
    function parseMatrix(bytes, dv, p, end, prefix) {
      const flags = sub(dv, p), cls = dv.getUint32(flags.data, le) & 0xff, cplx = !!(dv.getUint32(flags.data, le) & 0x800);
      const dims = sub(dv, flags.next), nd = dims.n / 4, shape = []; for (let i = 0; i < nd; i++) shape.push(dv.getInt32(dims.data + 4 * i, le));
      const nm = sub(dv, dims.next), vname = prefix + str(bytes, nm.data, nm.n);
      if (cls === 2) { // struct: field names then one matrix per field
        const fl = sub(dv, nm.next), flen = dv.getInt32(fl.data, le), fnames = sub(dv, fl.next), nf = fnames.n / flen, names = [];
        for (let i = 0; i < nf; i++) names.push(trimz(str(bytes, fnames.data + i * flen, flen)));
        let q = fnames.next;
        for (let i = 0; i < nf && q < end; i++) { const e = sub(dv, q); if (e.type === 14 && e.n > 0) parseMatrix(bytes, dv, e.data, e.data + e.n, vname + '.' + names[i] + '\u0000'); q = e.next; }
        return;
      }
      if (cls < 6 || cls > 15) return; // cell, char, sparse, objects are skipped
      const re = numeric(dv, sub(dv, nm.next)); if (!re) return;
      vars.push({ name: vname.replace(/\0/g, ''), data: re, rows: shape[0], cols: shape.slice(1).reduce((a, b) => a * b, 1), complex: cplx });
    }
    await readElems(u8, 128, u8.length, '');
    const fsVar = vars.find(v => FS_NAMES.test(v.name.split('.').pop()) && v.data.length === 1);
    const fs = fsVar ? fsVar.data[0] : 0;
    const out = [];
    for (const v of vars) if (v !== fsVar && v.data.length > 1) out.push(...toSignals(v.name, v.data, v.rows, v.cols, fs, true));
    if (!out.length) throw new Error('No numeric arrays found in the MAT-file');
    return out.map(s => Object.assign(s, { needRate: !fs }));
  }

  /* ---------- NumPy .npy / .npz ---------- */
  function parseNpy(buf, name) {
    const u8 = new Uint8Array(buf);
    if (str(u8, 1, 5) !== 'NUMPY') throw new Error('Not a .npy file');
    const major = u8[6], dv = new DataView(buf), hl = major === 1 ? dv.getUint16(8, true) : dv.getUint32(8, true), ho = major === 1 ? 10 : 12;
    const header = str(u8, ho, hl), descr = /'descr':\s*'([^']+)'/.exec(header)[1], fortran = /'fortran_order':\s*True/.test(header);
    const shape = (/'shape':\s*\(([^)]*)\)/.exec(header)[1].match(/\d+/g) || ['1']).map(Number);
    const le = descr[0] !== '>', code = descr.slice(1), off = ho + hl;
    const T = { f8: ['getFloat64', 8], f4: ['getFloat32', 4], i2: ['getInt16', 2], i4: ['getInt32', 4], i8: ['getBigInt64', 8], u1: ['getUint8', 1], i1: ['getInt8', 1], u2: ['getUint16', 2], u4: ['getUint32', 4], u8: ['getBigUint64', 8], b1: ['getUint8', 1] }[code];
    if (!T) throw new Error('Unsupported NumPy dtype ' + descr);
    const n = shape.reduce((a, b) => a * b, 1), data = new Float64Array(n);
    for (let i = 0; i < n; i++) data[i] = Number(T[1] === 1 ? dv[T[0]](off + i) : dv[T[0]](off + i * T[1], le));
    const rows = shape[0], cols = shape.slice(1).reduce((a, b) => a * b, 1);
    return { name, data, rows, cols, fortran };
  }
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf); let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Not a ZIP archive');
    const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = [];
    for (let k = 0; k < count; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const fname = str(u8, p + 46, nlen), start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const raw = u8.subarray(start, start + csize);
      files.push({ name: fname, data: method === 8 ? await inflate(raw, true) : method === 0 ? raw.slice() : null });
      p += 46 + nlen + xlen + clen;
    }
    return files;
  }
  async function parseNpz(buf, name) {
    const files = (await unzip(buf)).filter(f => f.data && /\.npy$/.test(f.name));
    const arrs = files.map(f => parseNpy(f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength), f.name.replace(/\.npy$/, '')));
    const fsA = arrs.find(a => FS_NAMES.test(a.name) && a.data.length === 1), fs = fsA ? fsA.data[0] : 0;
    const out = [];
    for (const a of arrs) if (a !== fsA && a.data.length > 1) out.push(...toSignals(`${name}:${a.name}`, a.data, a.rows, a.cols, fs, a.fortran));
    return out.map(s => Object.assign(s, { needRate: !fs }));
  }

  /* ---------- UFF / UNV dataset 58 (ASCII) ---------- */
  function parseUff(text, name) {
    const lines = text.split(/\r?\n/), out = []; let i = 0;
    const num = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][-+]?\d+)?/g;
    while (i < lines.length) {
      if (lines[i].trim() === '-1' && i + 1 < lines.length && /^\s*58\b/.test(lines[i + 1])) {
        const h = lines.slice(i + 2, i + 13);
        const r6 = (h[5].match(num) || []).map(Number), r7 = (h[6].match(num) || []).map(s => Number(s.replace(/[dD]/, 'e')));
        const ordType = r7[0], npts = r7[1], even = r7[2] === 1, xmin = r7[3], dx = r7[4];
        const xUnit = h[7].substr(47, 20).trim() || h[7].substr(26, 20).trim(), yUnit = h[8].substr(47, 20).trim();
        const vals = []; let j = i + 13;
        for (; j < lines.length && lines[j].trim() !== '-1'; j++) for (const m of lines[j].match(num) || []) vals.push(Number(m.replace(/[dD]/, 'e')));
        const cplx = ordType === 5 || ordType === 6, per = (cplx ? 2 : 1) + (even ? 0 : 1), y = new Float64Array(npts), x = even ? null : new Float64Array(npts);
        for (let k = 0; k < npts; k++) {
          const b = k * per;
          if (!even) x[k] = vals[b];
          const re = vals[b + (even ? 0 : 1)], im = cplx ? vals[b + (even ? 1 : 2)] : 0;
          y[k] = cplx ? Math.hypot(re, im) : re;
        }
        const label = (h[0].trim() || 'record ' + (out.length + 1)) + (r6.length > 5 ? ` (resp ${r6[5]}/${r6[6] ?? ''}, ref ${r6[8] ?? ''})` : '');
        out.push({ name: `${name}: ${label}`, y, x: x || undefined, x0: even ? xmin : 0, dx: even ? dx : 0, xUnit: xUnit || (even ? 's' : ''), yUnit: yUnit + (cplx ? ' (magnitude)' : '') });
        i = j + 1; continue;
      }
      i++;
    }
    if (!out.length) throw new Error('No dataset 58 records found in the UFF file');
    return out;
  }

  /* ---------- GDF (1.x / 2.x) and EDF/BDF ---------- */
  const GDF_T = { 1: ['getInt8', 1], 2: ['getUint8', 1], 3: ['getInt16', 2], 4: ['getUint16', 2], 5: ['getInt32', 4], 6: ['getUint32', 4], 7: ['getBigInt64', 8], 8: ['getBigUint64', 8], 16: ['getFloat32', 4], 17: ['getFloat64', 8] };
  function parseGdf(buf, name) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf), ver = parseFloat(str(u8, 4, 4));
    if (str(u8, 0, 3) !== 'GDF') throw new Error('Not a GDF file');
    const v2 = ver >= 2, nrec = Number(dv.getBigInt64(236, true)), dur = dv.getUint32(244, true) / (dv.getUint32(248, true) || 1);
    const ns = v2 ? dv.getUint16(252, true) : dv.getUint32(252, true), hdr = v2 ? dv.getUint16(184, true) * 256 : Number(dv.getBigInt64(184, true));
    const ch = [], B = 256;
    for (let c = 0; c < ns; c++) {
      const label = trimz(str(u8, B + 16 * c, 16)), unit = trimz(str(u8, B + ns * 96 + (v2 ? 6 : 8) * c, v2 ? 6 : 8));
      const pmin = dv.getFloat64(B + ns * 104 + 8 * c, true), pmax = dv.getFloat64(B + ns * 112 + 8 * c, true);
      const dmin = v2 ? dv.getFloat64(B + ns * 120 + 8 * c, true) : Number(dv.getBigInt64(B + ns * 120 + 8 * c, true));
      const dmax = v2 ? dv.getFloat64(B + ns * 128 + 8 * c, true) : Number(dv.getBigInt64(B + ns * 128 + 8 * c, true));
      const spr = dv.getUint32(B + ns * 216 + 4 * c, true), typ = dv.getUint32(B + ns * 220 + 4 * c, true);
      ch.push({ label, unit, pmin, pmax, dmin, dmax, spr, typ });
    }
    const recBytes = ch.reduce((a, c) => a + c.spr * (GDF_T[c.typ] || [0, 0])[1], 0), recs = nrec > 0 ? nrec : Math.floor((u8.length - hdr) / recBytes);
    const out = ch.map(c => ({ c, y: new Float64Array(c.spr * recs) }));
    let p = hdr;
    for (let r = 0; r < recs; r++) for (const o of out) {
      const T = GDF_T[o.c.typ]; if (!T) throw new Error('Unsupported GDF data type ' + o.c.typ);
      const sc = (o.c.pmax - o.c.pmin) / ((o.c.dmax - o.c.dmin) || 1);
      for (let i = 0; i < o.c.spr; i++, p += T[1]) o.y[r * o.c.spr + i] = (Number(T[1] === 1 ? dv[T[0]](p) : dv[T[0]](p, true)) - o.c.dmin) * sc + o.c.pmin;
    }
    return out.filter(o => o.c.spr > 0).map(o => ({ name: `${name}: ${o.c.label || 'ch'}`, y: o.y, x0: 0, dx: dur / o.c.spr, xUnit: 's', yUnit: o.c.unit }));
  }
  function parseEdf(buf, name) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf), bdf = u8[0] === 0xff, num = (a, n) => parseFloat(str(u8, a, n));
    const hdr = num(184, 8), nrec = num(236, 8), dur = num(244, 8) || 1, ns = num(252, 4);
    const d = str(u8, 168, 8).split('.').map(Number), t = str(u8, 176, 8).split('.').map(Number);
    const t0abs = d.length === 3 && t.length === 3 ? new Date(2000 + (d[2] < 85 ? d[2] : d[2] - 100), d[1] - 1, d[0], t[0], t[1], t[2]).getTime() : undefined;
    const f = (off, len, c) => str(u8, 256 + ns * off + len * c, len).trim();
    const ch = []; for (let c = 0; c < ns; c++) ch.push({ label: f(0, 16, c), unit: f(96, 8, c), pmin: parseFloat(f(104, 8, c)), pmax: parseFloat(f(112, 8, c)), dmin: parseFloat(f(120, 8, c)), dmax: parseFloat(f(128, 8, c)), spr: parseInt(f(216, 8, c), 10) });
    const bps = bdf ? 3 : 2, recBytes = ch.reduce((a, c) => a + c.spr * bps, 0), recs = nrec > 0 ? nrec : Math.floor((u8.length - hdr) / recBytes);
    const out = ch.map(c => ({ c, y: new Float64Array(c.spr * recs) })); let p = hdr;
    for (let r = 0; r < recs; r++) for (const o of out) {
      const sc = (o.c.pmax - o.c.pmin) / ((o.c.dmax - o.c.dmin) || 1);
      for (let i = 0; i < o.c.spr; i++, p += bps) {
        const v = bdf ? (u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16)) << 8 >> 8 : dv.getInt16(p, true);
        o.y[r * o.c.spr + i] = (v - o.c.dmin) * sc + o.c.pmin;
      }
    }
    return out.filter(o => !/annotation/i.test(o.c.label) && o.c.spr > 0).map(o => ({ name: `${name}: ${o.c.label}`, y: o.y, x0: 0, dx: dur / o.c.spr, xUnit: 's', yUnit: o.c.unit, t0abs }));
  }

  /* ---------- HDF5 / JLD2 / MAT v7.3 (via vendored h5wasm, loaded on demand) ---------- */
  let h5Promise = null;
  function loadH5() {
    if (!h5Promise) h5Promise = new Promise((res, rej) => {
      if (root.h5wasm) return res(root.h5wasm);
      const s = document.createElement('script'); s.src = 'vendor/h5wasm.js';
      s.onload = () => res(root.h5wasm); s.onerror = () => rej(new Error('Could not load the HDF5 reader (vendor/h5wasm.js)'));
      document.head.append(s);
    }).then(async m => { const H = m.default || m; await H.ready; return H; });
    return h5Promise;
  }
  async function listHdf5(buf, name) {
    const H = await loadH5(), { FS } = await H.ready, path = '/osig_' + Date.now() + '.h5';
    FS.writeFile(path, new Uint8Array(buf));
    const f = new H.File(path, 'r'), sets = [];
    const attrsFs = obj => { try { for (const k of Object.keys(obj.attrs || {})) if (FS_NAMES.test(k)) { const v = obj.attrs[k].value; return Number(Array.isArray(v) || ArrayBuffer.isView(v) ? v[0] : v); } } catch (e) { /* ignore */ } return 0; };
    const walk = (g, prefix, fsInherit) => {
      let keys = []; try { keys = g.keys(); } catch (e) { return; }
      const gfs = attrsFs(g) || fsInherit;
      for (const k of keys) {
        let o; try { o = g.get(k); } catch (e) { continue; }
        if (!o) continue;
        if (o.type === 'Group') walk(o, prefix + '/' + k, gfs);
        else if (o.type === 'Dataset') {
          const shape = o.shape || [], n = shape.reduce((a, b) => a * b, 1), dt = String(o.dtype || '');
          if (/^[<>|=]?[fiub]\d*$|float|int/i.test(dt) && n > 0) sets.push({ path: prefix + '/' + k, shape, n, ds: o, fs: attrsFs(o) || gfs });
        }
      }
    };
    walk(f, '', 0);
    const scalarFs = sets.find(s => s.n === 1 && FS_NAMES.test(s.path.split('/').pop()));
    const globalFs = scalarFs ? Number(scalarFs.ds.value[0] ?? scalarFs.ds.value) : 0;
    return {
      sets: sets.filter(s => s.n > 1),
      read(sel) {
        const out = [];
        for (const s of sel) {
          const v = s.ds.value, data = Float64Array.from(v, Number), fs = s.fs || globalFs;
          const rows = s.shape[0], cols = s.shape.slice(1).reduce((a, b) => a * b, 1) || 1;
          out.push(...toSignals(name + ':' + s.path, data, s.shape.length === 1 ? data.length : rows, s.shape.length === 1 ? 1 : cols, fs, false).map(q => Object.assign(q, { needRate: !fs })));
        }
        return out;
      },
      close() { try { f.close(); FS.unlink(path); } catch (e) { /* ignore */ } }
    };
  }
  async function parseHdf5(buf, name) { const h = await listHdf5(buf, name); try { return h.read(h.sets); } finally { h.close(); } }

  /* ---------- Data log files (.sig raw float32 + .txt info) ---------- */
  function parseLogInfo(text) {
    const kv = {}; for (const l of text.split(/\r?\n/)) { const m = /^\s*([^=:]+?)\s*[=:]\s*(.*)$/.exec(l); if (m) kv[m[1].toLowerCase().replace(/\s+/g, '')] = m[2].trim(); }
    return { fs: parseFloat(kv.samplerate || kv.samplingrate || kv.fs || '0'), channels: parseInt(kv.channels || kv.channelcount || '1', 10) || 1, start: kv.start || kv.starttime, unit: kv.unit || kv.units || '' };
  }
  function parseDataLog(buf, info, name) {
    const y = new Float32Array(buf.slice(0, Math.floor(buf.byteLength / 4) * 4)), ch = info.channels || 1, out = [];
    for (let c = 0; c < ch; c++) {
      const v = new Float64Array(Math.floor(y.length / ch)); for (let i = 0; i < v.length; i++) v[i] = y[i * ch + c];
      out.push({ name: name + (ch > 1 ? ` [ch ${c + 1}]` : ''), y: v, x0: 0, dx: 1 / (info.fs || 1), xUnit: 's', yUnit: info.unit, t0abs: info.start ? Date.parse(info.start) || undefined : undefined, needRate: !info.fs });
    }
    return out;
  }

  /* ---------- ZIP writer (stored, used for batch output in the browser) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) { // files: [{name, data: Uint8Array|string}]
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    for (const f of files) {
      const data = typeof f.data === 'string' ? enc.encode(f.data) : new Uint8Array(f.data), nm = enc.encode(f.name), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(lh.buffer), nm, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + data.length;
    }
    const csize = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  const AUDIO_EXT = ['flac', 'mp3', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'aif', 'aiff', 'webm', 'caf'];
  /* ---------- Excel workbook (.xlsx) writer ---------- */
  // sheets: [{name, rows: [[cell…]…], widths?: [column widths in characters], header?: bold frozen top rows (default 1)}]
  // a cell is a number, a string, null (empty) or {v, bold?, fmt?: '0.000' | '0.00'}. Returns a Blob.
  function xlsx(sheets) {
    const esc = t => String(t).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const col = i => { let t = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) t = String.fromCharCode(65 + (i - 1) % 26) + t; return t; };
    const FMT = { '0.000': 2, '0.00': 3 };
    const sheetXml = sh => {
      const head = sh.header ?? 1;
      const rows = sh.rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((c, ci) => {
        const o = c !== null && typeof c === 'object' ? c : { v: c };
        if (o.v == null || o.v === '' || (typeof o.v === 'number' && !isFinite(o.v))) return '';
        const ref = col(ci) + (ri + 1), st = (o.bold ?? ri < head) ? 1 : FMT[o.fmt] || 0, s = st ? ` s="${st}"` : '';
        return typeof o.v === 'number' ? `<c r="${ref}"${s}><v>${o.v}</v></c>` : `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(o.v)}</t></is></c>`;
      }).join('') + '</row>').join('');
      const view = head ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${head}" topLeftCell="A${head + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
      const cols = sh.widths ? '<cols>' + sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}${cols}<sheetData>${rows}</sheetData></worksheet>`;
    };
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', NS = 'http://schemas.openxmlformats.org', names = new Set();
    const nameOf = n => { let t = String(n || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet', k = 2; while (names.has(t.toLowerCase())) t = t.slice(0, 28) + ' ' + k++; names.add(t.toLowerCase()); return t; };
    const sheetNames = sheets.map(sh => nameOf(sh.name));
    const files = [
      { name: '[Content_Types].xml', data: X + `<Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
      { name: '_rels/.rels', data: X + `<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: X + `<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets>` +
        sheetNames.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: X + `<Relationships xmlns="${NS}/package/2006/relationships">` +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: X + `<styleSheet xmlns="${NS}/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.000"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts>` +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
      ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh) }))
    ];
    return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  root.FORMATS = { decodeAudio, sniffRate, parseMat, parseNpy, parseNpz, unzip, parseUff, parseGdf, parseEdf, listHdf5, parseHdf5, loadH5,
    parseLogInfo, parseDataLog, zip, crc32, xlsx, toSignals, AUDIO_EXT, FS_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FORMATS;
})(typeof window !== 'undefined' ? window : globalThis);
