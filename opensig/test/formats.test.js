// Run: node --test test/formats.test.js — builds small files of each format byte by byte and reads them back.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const F = require('../js/formats.js');

const ab = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const near = (a, b, t = 1e-9) => assert.ok(Math.abs(a - b) <= t, `expected ${b}, got ${a}`);

// --- MAT v5 builder (little endian) ---
function el(type, bytes) {
  const pad = (8 - (bytes.length % 8)) % 8, out = Buffer.alloc(8 + bytes.length + pad);
  out.writeUInt32LE(type, 0); out.writeUInt32LE(bytes.length, 4); Buffer.from(bytes).copy(out, 8); return out;
}
function matDouble(name, rows, cols, values) {
  const flags = Buffer.alloc(8); flags.writeUInt32LE(6, 0);           // mxDOUBLE_CLASS
  const dims = Buffer.alloc(8); dims.writeInt32LE(rows, 0); dims.writeInt32LE(cols, 4);
  const data = Buffer.alloc(8 * values.length); values.forEach((v, i) => data.writeDoubleLE(v, 8 * i));
  return el(14, Buffer.concat([el(6, flags), el(5, dims), el(1, Buffer.from(name)), el(9, data)]));
}
function matFile(elements) {
  const hdr = Buffer.alloc(128, 0x20); hdr.write('MATLAB 5.0 MAT-file, test', 0); hdr.writeUInt16LE(0x0100, 124); hdr.write('IM', 126);
  return Buffer.concat([hdr, ...elements]);
}

test('MAT v5: vectors, matrix columns, fs variable, compressed elements', async () => {
  const sig = Array.from({ length: 50 }, (_, i) => Math.sin(i));
  const m = matFile([matDouble('fs', 1, 1, [250]), matDouble('x', 50, 1, sig), el(15, zlib.deflateSync(matDouble('M', 3, 2, [1, 2, 3, 4, 5, 6])))]);
  const out = await F.parseMat(ab(m), 't.mat');
  const x = out.find(s => s.name === 'x');
  assert.ok(x); near(x.dx, 1 / 250); assert.equal(x.y.length, 50); near(x.y[7], Math.sin(7));
  const cols = out.filter(s => s.name.startsWith('M('));
  assert.equal(cols.length, 2); assert.deepEqual(Array.from(cols[1].y), [4, 5, 6]);
});

function npy(descr, shape, values, bytesPer, write) {
  let header = `{'descr': '${descr}', 'fortran_order': False, 'shape': (${shape.join(', ')}${shape.length === 1 ? ',' : ''}), }`;
  while ((10 + header.length + 1) % 64) header += ' ';
  header += '\n';
  const h = Buffer.alloc(10); h[0] = 0x93; h.write('NUMPY', 1); h[6] = 1; h[7] = 0; h.writeUInt16LE(header.length, 8);
  const d = Buffer.alloc(values.length * bytesPer); values.forEach((v, i) => write(d, v, i * bytesPer));
  return Buffer.concat([h, Buffer.from(header), d]);
}

test('NPY and NPZ (stored and deflated members)', async () => {
  const a = npy('<f4', [4, 2], [1, 10, 2, 20, 3, 30, 4, 40], 4, (b, v, o) => b.writeFloatLE(v, o));
  const r = F.parseNpy(ab(a), 'a');
  assert.deepEqual(r.shape ?? [r.rows, r.cols], [4, 2]);
  const sigs = F.toSignals('a', r.data, r.rows, r.cols, 100, false);
  assert.deepEqual(Array.from(sigs[1].y), [10, 20, 30, 40]);
  const fsArr = npy('<f8', [1], [1000], 8, (b, v, o) => b.writeDoubleLE(v, o));
  const vec = npy('<i2', [5], [1, -2, 3, -4, 5], 2, (b, v, o) => b.writeInt16LE(v, o));
  const blob = F.zip([{ name: 'fs.npy', data: fsArr }, { name: 'v.npy', data: vec }]);
  const out = await F.parseNpz(await blob.arrayBuffer(), 'z');
  assert.equal(out.length, 1); assert.deepEqual(Array.from(out[0].y), [1, -2, 3, -4, 5]); near(out[0].dx, 0.001);
  // deflated member: build a tiny zip with method 8 by hand
  const raw = zlib.deflateRawSync(vec), name = Buffer.from('d.npy'), crc = F.crc32(vec);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(raw.length, 18); lh.writeUInt32LE(vec.length, 22); lh.writeUInt16LE(name.length, 26);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(raw.length, 20); ch.writeUInt32LE(vec.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(0, 42);
  const local = Buffer.concat([lh, name, raw]), cen = Buffer.concat([ch, name]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cen.length, 12); end.writeUInt32LE(local.length, 16);
  const z2 = await F.parseNpz(ab(Buffer.concat([local, cen, end])), 'z2');
  assert.deepEqual(Array.from(z2[0].y), [1, -2, 3, -4, 5]);
});

test('UFF dataset 58, even abscissa', () => {
  const pad = (s, n) => s.padEnd(n);
  const lines = ['    -1', '    58', 'Accel response', 'id2', 'id3', 'id4', 'id5',
    '    1         0    0         0 NONE         1   1 NONE         1   3',
    '         2         4         1  0.00000E+00  5.00000E-01  0.00000E+00',
    pad('        17    0    0    0', 26) + ' ' + pad('Frequency', 20) + ' ' + pad('Hz', 20),
    pad('        12    1    0    0', 26) + ' ' + pad('Acceleration', 20) + ' ' + pad('m/s^2', 20),
    '        13    0    0    0 NONE                 NONE',
    '         0    0    0    0 NONE                 NONE',
    '  1.00000E+00 -2.50000E+00  3.00000E+00  4.00000E-01', '    -1'];
  const out = F.parseUff(lines.join('\n'), 'u');
  assert.equal(out.length, 1); assert.deepEqual(Array.from(out[0].y), [1, -2.5, 3, 0.4]); near(out[0].dx, 0.5);
  assert.equal(out[0].xUnit, 'Hz'); assert.equal(out[0].yUnit, 'm/s^2');
});

test('EDF with two channels and scaling', () => {
  const ns = 2, spr = [4, 2], hdrLen = 256 + ns * 256, fixed = Buffer.alloc(256, 0x20);
  const put = (b, s, o, n) => b.write(String(s).padEnd(n).slice(0, n), o, 'latin1');
  put(fixed, '0', 0, 8); put(fixed, '17.10.26', 168, 8); put(fixed, '10.20.30', 176, 8); put(fixed, hdrLen, 184, 8); put(fixed, 2, 236, 8); put(fixed, 1, 244, 8); put(fixed, ns, 252, 4);
  const v = Buffer.alloc(ns * 256, 0x20); let o = 0;
  const field = (vals, n) => { vals.forEach(x => { put(v, x, o, n); o += n; }); };
  field(['EEG', 'Temp'], 16); field(['', ''], 80); field(['uV', 'degC'], 8); field([-100, 0], 8); field([100, 50], 8); field([-32768, -32768], 8); field([32767, 32767], 8); field(['', ''], 80); field(spr, 8); field(['', ''], 32);
  const rec = Buffer.alloc(2 * (4 + 2) * 2);
  let p = 0; for (let r = 0; r < 2; r++) { for (let i = 0; i < 4; i++) { rec.writeInt16LE(-32768 + i * 16384, p); p += 2; } for (let i = 0; i < 2; i++) { rec.writeInt16LE(32767, p); p += 2; } }
  const out = F.parseEdf(ab(Buffer.concat([fixed, v, rec])), 'e');
  assert.equal(out.length, 2); assert.equal(out[0].y.length, 8); near(out[0].y[0], -100, 1e-6); near(out[0].dx, 0.25); near(out[1].y[1], 50, 1e-6);
  assert.equal(out[1].yUnit, 'degC'); assert.equal(new Date(out[0].t0abs).getHours(), 10);
});

test('GDF 2.x float32 channel', () => {
  const ns = 1, spr = 3, nrec = 2, fixed = Buffer.alloc(256);
  fixed.write('GDF 2.20', 0); fixed.writeUInt16LE(2, 184); fixed.writeBigInt64LE(BigInt(nrec), 236); fixed.writeUInt32LE(3, 244); fixed.writeUInt32LE(1, 248); fixed.writeUInt16LE(ns, 252);
  const v = Buffer.alloc(256); v.write('ECG', 0); v.write('mV', 96); v.writeDoubleLE(-1, 104); v.writeDoubleLE(1, 112); v.writeDoubleLE(-1, 120); v.writeDoubleLE(1, 128); v.writeUInt32LE(spr, 216); v.writeUInt32LE(16, 220);
  const d = Buffer.alloc(4 * spr * nrec); [0.5, -0.25, 1, 0, 0.75, -1].forEach((x, i) => d.writeFloatLE(x, 4 * i));
  const out = F.parseGdf(ab(Buffer.concat([fixed, v, d])), 'g');
  assert.equal(out.length, 1); assert.deepEqual(Array.from(out[0].y), [0.5, -0.25, 1, 0, 0.75, -1]); near(out[0].dx, 1); assert.equal(out[0].yUnit, 'mV');
});

test('data log files and ZIP round trip', async () => {
  const info = F.parseLogInfo('SampleRate=2000\nChannels=2\nUnit=V');
  const raw = new Float32Array([1, 10, 2, 20, 3, 30]);
  const out = F.parseDataLog(raw.buffer, info, 'log');
  assert.equal(out.length, 2); assert.deepEqual(Array.from(out[1].y), [10, 20, 30]); near(out[0].dx, 0.0005);
  const files = await F.unzip(await F.zip([{ name: 'a.txt', data: 'hello' }, { name: 'b.bin', data: new Uint8Array([1, 2, 3]) }]).arrayBuffer());
  assert.equal(new TextDecoder().decode(files[0].data), 'hello'); assert.deepEqual(Array.from(files[1].data), [1, 2, 3]);
});

test('Excel workbook (.xlsx): sheets, numbers, escaped text, valid ZIP', async () => {
  const blob = F.xlsx([{ name: 'Modes', rows: [['Mode', 'f (Hz)'], [1, { v: 3.19, fmt: '0.000' }], [2, 'a < b & "c"']] }, { name: 'Modes', rows: [['x']] }]);
  const files = await F.unzip(await blob.arrayBuffer()), dec = new TextDecoder(), get = n => dec.decode(files.find(f => f.name === n).data);
  assert.deepEqual(files.map(f => f.name).slice(0, 3), ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml']);
  assert.match(get('xl/workbook.xml'), /<sheet name="Modes" sheetId="1".*<sheet name="Modes 2" sheetId="2"/);
  const s1 = get('xl/worksheets/sheet1.xml');
  assert.match(s1, /<c r="B2" s="2"><v>3.19<\/v><\/c>/);
  assert.match(s1, /a &lt; b &amp; &quot;c&quot;/);
  assert.match(s1, /<c r="A1" t="inlineStr" s="1">/);                                // bold header
});
