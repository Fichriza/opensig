/* OpenSig file formats: WAV, ASCII/CSV, raw binary. Pure functions on ArrayBuffer/strings. */
(function (root) {
  'use strict';

  function parseWav(buf) {
    const dv = new DataView(buf), str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
    if (buf.byteLength < 12 || str(0, 4) !== 'RIFF' || str(8, 4) !== 'WAVE') throw new Error('Not a RIFF/WAVE file');
    let off = 12, fmt = null, data = null;
    while (off + 8 <= buf.byteLength) {
      const id = str(off, 4); let size = dv.getUint32(off + 4, true);
      const body = off + 8;
      if (body + size > buf.byteLength) size = buf.byteLength - body;
      if (id === 'fmt ') {
        fmt = { format: dv.getUint16(body, true), channels: dv.getUint16(body + 2, true), sampleRate: dv.getUint32(body + 4, true),
          blockAlign: dv.getUint16(body + 12, true), bits: dv.getUint16(body + 14, true) };
        if (fmt.format === 0xFFFE && size >= 26) fmt.format = dv.getUint16(body + 24, true);
      } else if (id === 'data') data = { off: body, size };
      off = body + size + (size & 1);
    }
    if (!fmt) throw new Error('WAV file has no fmt chunk');
    if (!data) throw new Error('WAV file has no data chunk');
    if (!fmt.channels) throw new Error('Number of channels not defined');
    const { channels: ch, bits } = fmt, bps = bits / 8, frames = Math.floor(data.size / (bps * ch));
    const out = Array.from({ length: ch }, () => new Float32Array(frames));
    const isFloat = fmt.format === 3;
    if (fmt.format !== 1 && !isFloat) throw new Error('Unsupported WAV encoding (format ' + fmt.format + ')');
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < ch; c++) {
        const p = data.off + (i * ch + c) * bps;
        let v;
        if (isFloat) v = bits === 64 ? dv.getFloat64(p, true) : dv.getFloat32(p, true);
        else if (bits === 8) v = dv.getUint8(p) - 128;
        else if (bits === 16) v = dv.getInt16(p, true);
        else if (bits === 24) { v = dv.getUint8(p) | (dv.getUint8(p + 1) << 8) | (dv.getInt8(p + 2) << 16); }
        else if (bits === 32) v = dv.getInt32(p, true);
        else throw new Error('Unsupported bit depth ' + bits);
        out[c][i] = v;
      }
    }
    return { sampleRate: fmt.sampleRate, channels: out, bits, isFloat };
  }

  // Encodes channels (array of arrays) into WAV. format: 'float32' | 'int16'.
  function encodeWav(channels, sampleRate, format) {
    const ch = channels.length, n = Math.min(...channels.map(c => c.length));
    const bps = format === 'int16' ? 2 : 4, dataSize = n * ch * bps, buf = new ArrayBuffer(44 + dataSize), dv = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + dataSize, true); w(8, 'WAVE'); w(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, format === 'int16' ? 1 : 3, true); dv.setUint16(22, ch, true);
    dv.setUint32(24, Math.round(sampleRate), true); dv.setUint32(28, Math.round(sampleRate) * ch * bps, true);
    dv.setUint16(32, ch * bps, true); dv.setUint16(34, bps * 8, true); w(36, 'data'); dv.setUint32(40, dataSize, true);
    let peak = 0;
    if (format === 'int16') for (const c of channels) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(c[i]));
    const k = format === 'int16' ? (peak > 1 ? 32767 / peak : 32767) : 1;
    let p = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
      if (format === 'int16') { dv.setInt16(p, Math.max(-32768, Math.min(32767, Math.round(channels[c][i] * k))), true); p += 2; }
      else { dv.setFloat32(p, channels[c][i], true); p += 4; }
    }
    return buf;
  }

  function detectSeparator(lines) {
    const cands = ['\t', ';', ',', ' '];
    let best = ',', bestScore = -1;
    for (const s of cands) {
      const counts = lines.slice(0, 20).map(l => (s === ' ' ? l.trim().split(/\s+/) : l.split(s)).length);
      const consistent = counts.every(c => c === counts[0]) ? 2 : 1;
      const score = (counts[0] - 1) * consistent;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  /* opts: {separator:'auto'|',', decimal:'.'|',', headerRow: 0 (none) | n, ignore:[idx...], timeColumn:bool} */
  function parseCsv(text, opts) {
    opts = Object.assign({ separator: 'auto', decimal: '.', headerRow: 0, ignore: [], timeColumn: false }, opts);
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    if (!lines.length) throw new Error('No data found');
    const dataLines = lines.slice(opts.headerRow > 0 ? opts.headerRow : 0);
    let sep = opts.separator === 'auto' ? detectSeparator(dataLines) : opts.separator;
    if (opts.decimal === ',' && sep === ',') sep = ';';
    const split = l => (sep === ' ' ? l.trim().split(/\s+/) : l.split(sep)).map(s => s.trim());
    let header = opts.headerRow > 0 ? split(lines[opts.headerRow - 1]) : null;
    const rows = [];
    for (const l of dataLines) {
      const cells = split(l).map(c => parseFloat(opts.decimal === ',' ? c.replace(',', '.') : c));
      if (cells.some(v => !isNaN(v))) rows.push(cells);
      else if (!header && !rows.length) header = split(l); // auto-detected header line
    }
    if (!rows.length) throw new Error('No numeric rows found');
    const ncol = rows.reduce((m, r) => Math.max(m, r.length), 0); // not Math.max(...rows): a call takes only ~100 000 arguments
    let cols = [];
    for (let c = 0; c < ncol; c++) {
      if (opts.ignore.includes(c + 1)) continue;
      const v = new Float32Array(rows.length);
      for (let r = 0; r < rows.length; r++) v[r] = isNaN(rows[r][c]) ? 0 : rows[r][c];
      cols.push({ name: header && header[c] ? header[c] : 'Column ' + (c + 1), data: v });
    }
    let sampleRate = null;
    if (opts.timeColumn && cols.length > 1) {
      const t = cols[0].data, dt = (t[t.length - 1] - t[0]) / Math.max(1, t.length - 1);
      if (dt > 0) sampleRate = 1 / dt;
      cols = cols.slice(1);
    }
    return { columns: cols, sampleRate, separator: sep };
  }

  const RAW_TYPES = { '32-bit float': [4, 'getFloat32', 'setFloat32'], '16-bit signed': [2, 'getInt16', 'setInt16'],
    '16-bit unsigned': [2, 'getUint16', 'setUint16'], '8-bit signed': [1, 'getInt8', 'setInt8'], '8-bit unsigned': [1, 'getUint8', 'setUint8'] };

  function parseRaw(buf, type, littleEndian = true) {
    const [bps, get] = RAW_TYPES[type], dv = new DataView(buf), n = Math.floor(buf.byteLength / bps), y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = bps === 1 ? dv[get](i) : dv[get](i * bps, littleEndian);
    return y;
  }

  function encodeRaw(y, type) {
    const [bps, , set] = RAW_TYPES[type], buf = new ArrayBuffer(y.length * bps), dv = new DataView(buf);
    const isInt = type !== '32-bit float';
    for (let i = 0; i < y.length; i++) {
      let v = isInt ? Math.round(y[i]) : y[i];
      if (type === '16-bit signed') v = Math.max(-32768, Math.min(32767, v));
      if (type === '16-bit unsigned') v = Math.max(0, Math.min(65535, v));
      if (type === '8-bit signed') v = Math.max(-128, Math.min(127, v));
      if (type === '8-bit unsigned') v = Math.max(0, Math.min(255, v));
      if (bps === 1) dv[set](i, v); else dv[set](i * bps, v, true);
    }
    return buf;
  }

  function fmtNum(v, digits = 7) {
    if (!isFinite(v)) return String(v);
    return Number(v.toPrecision(digits)).toString();
  }

  function toCsv(x, y, withX) {
    const out = [];
    const f = IO.fmtNum;
    for (let i = 0; i < y.length; i++) out.push(withX ? f(x(i)) + ',' + f(y[i]) : f(y[i]));
    return out.join('\n');
  }

  function f32ToB64(a) {
    const u = new Uint8Array(Float32Array.from(a).buffer); let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64ToF32(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Float32Array(u.buffer); }

  const IO = { parseWav, encodeWav, parseCsv, detectSeparator, RAW_TYPES, parseRaw, encodeRaw, toCsv, fmtNum, f32ToB64, b64ToF32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = IO; else root.IO = IO;
})(typeof window !== 'undefined' ? window : globalThis);
