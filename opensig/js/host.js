/* OpenSig desktop bridge. Inside OpenSig.exe (WebView2) it talks to the native host; in a browser the same
   calls fall back to web APIs where possible (Web Serial, File System Access) or report "desktop app only". */
(function (root) {
  'use strict';
  const wv = root.chrome && root.chrome.webview;
  const pending = new Map(), listeners = new Map();
  let seq = 0;
  if (wv) wv.addEventListener('message', e => {
    const m = e.data || {};
    if (m.id != null && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.ok ? res(m.result) : rej(new Error(m.error || 'Host request failed'));
    } else if (m.event) (listeners.get(m.event) || []).forEach(f => { try { f(m); } catch (err) { console.error(err); } });
  });

  const b64 = {
    from(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); },
    to(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }
  };

  const HOST = {
    available: !!wv,
    b64,
    call(type, payload) {
      if (!wv) return Promise.reject(new Error('This feature needs the OpenSig desktop app (OpenSig.exe).'));
      const id = ++seq;
      return new Promise((res, rej) => { pending.set(id, { res, rej }); wv.postMessage(Object.assign({ id, type }, payload || {})); });
    },
    on(event, fn) { if (!listeners.has(event)) listeners.set(event, []); listeners.get(event).push(fn); },
    // Native open dialog → [{path, name, buffer}]; browser: <input type=file> → [{name, file}]
    async openFiles(filter, multi) {
      if (!wv) return null;
      const r = await HOST.call('openFiles', { filter: filter || 'All supported files|*.*', multi: !!multi });
      return (r || []).map(f => ({ path: f.path, name: f.name, buffer: b64.to(f.b64) }));
    },
    async readFile(path) { const r = await HOST.call('readFile', { path }); return { path, name: r.name, buffer: b64.to(r.b64) }; },
    // part of a file that another program may still be writing → {size, mtime, buffer}; pickFile only returns a path
    async readRange(path, offset, length) { const r = await HOST.call('readRange', { path, offset, length }); return { size: r.size, mtime: r.mtime, buffer: b64.to(r.b64) }; },
    pickFile(filter) { return HOST.call('pickFile', { filter: filter || 'All files (*.*)|*.*' }); },
    writeFile(path, data, append) { return HOST.call('writeFile', { path, b64: b64.from(data instanceof ArrayBuffer ? data : (data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : new TextEncoder().encode(String(data)).buffer)), append: !!append }); },
    writeText(path, text, append) { return HOST.call('writeText', { path, text, append: !!append }); },
    pickFolder(title) { return HOST.call('pickFolder', { title: title || '' }); },
    listFiles(folder, pattern) { return HOST.call('listFiles', { folder, pattern: pattern || '*.*' }); },
    beep() { if (wv) HOST.call('beep').catch(() => {}); else try { const a = new AudioContext(), o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.15); } catch (e) { /* no audio */ } }
  };
  root.HOST = HOST;
})(window);
