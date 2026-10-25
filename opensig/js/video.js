/* OpenSig video windows (File ▸ Open video…, or a video file dropped on the desktop): a video that plays in step with a
   signal. Opening a video opens its sound as a signal window too, with the video window linked to it; any other time
   signal – an accelerometer recorded beside a camera, say – can take its place, with a time offset (Sync with signal…).
   The video follows its signal: it plays along, without its own sound, while the signal plays with sound (F5); it shows
   the frame at the end of the visible part while the signal plays without sound; otherwise the frame at the signal's
   cursor, or at the start of its visible part. Played or moved with its own controls, it draws a playhead over the
   signal, and where it stops it sets the signal's cursor. In the desktop app the file is streamed from disk in byte
   ranges (host call mediaUrl), and a workspace opens it again from its path; elsewhere the file is asked for again. */
(function (root) {
  'use strict';
  const { APP, UI, OPS, PLOT, HOST } = root;
  const S = APP.S, { h, toast, dialog } = UI;
  const views = new WeakMap(), P = w => w.op.params;
  const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'mkv'];
  const ACCEPT = 'video/*,' + VIDEO_EXT.map(e => '.' + e).join(',');
  const fmt = v => isFinite(v) ? PLOT.fmt(v, Math.max(1, Math.abs(v))) : '–';
  const extOf = name => (String(name).split('.').pop() || '').toLowerCase();
  const baseName = p => String(p).split(/[\\/]/).pop();
  const isTime = w => w && w.kind === '1d' && w.data && w.data.y && !w.data.x && (w.data.xUnit || 's') === 's';
  const parentOf = w => w.parents.length ? S.wins.get(w.parents[0]) : null;

  /* ---------- the operation: a window that holds the video ---------- */
  OPS.video = {
    label: p => 'Video – ' + (p && p.name || ''), kind: 'display', input: 'full', multi: true,
    compute(w) {
      const v = viewOf(w), vid = v.video, sig = parentOf(w);
      return { dom: v.root, note: !v.url ? 'No video file' : [vid.videoWidth ? `${vid.videoWidth}×${vid.videoHeight}` : '', isFinite(vid.duration) ? fmt(vid.duration) + ' s' : '',
        sig ? `synced with ${sig.id}#${sig.title}, offset ${fmt(+P(w).offset || 0)} s` : 'not synced with a signal'].filter(Boolean).join(' · ') };
    }
  };

  function viewOf(w) {
    let v = views.get(w); if (v) return v;
    w.op.params = Object.assign({ name: '', offset: 0, sound: true, path: null }, w.op.params || {});
    v = { w, url: null, last: NaN, sought: null, playing: false, user: false, following: false };
    v.root = h('div', { class: 'geo vid' });
    v.root.innerHTML = '<div class="geo-bar"></div><div class="vid-box"><video playsinline controls preload="auto"></video><div class="vid-msg"></div></div>';
    v.video = v.root.querySelector('video'); v.msg = v.root.querySelector('.vid-msg'); v.bar = v.root.querySelector('.geo-bar');
    buildBar(w, v);
    const vid = v.video;
    vid.muted = !P(w).sound;
    // played, stopped or moved with its own controls: a playhead over the signal, and where it stops the signal's cursor
    vid.addEventListener('play', () => { if (!v.playing) v.user = true; });
    vid.addEventListener('pause', () => { if (!v.user) return; v.user = false; toCursor(w, v); });
    vid.addEventListener('seeked', () => { // a seek of ours lands where it was sent; any other is the user's
      const ours = v.sought != null && Math.abs(vid.currentTime - v.sought) < 0.05; v.sought = null;
      if (!ours && vid.paused) toCursor(w, v);
    });
    vid.addEventListener('loadedmetadata', () => { v.msg.textContent = ''; v.last = NaN; APP.queueCompute(w); });
    vid.addEventListener('error', () => { if (v.url) v.msg.textContent = 'This video cannot be played here (its format or codec is not supported).'; });
    w.onClose = () => { cancelAnimationFrame(v.raf); release(v); };
    views.set(w, v);
    v.raf = requestAnimationFrame(() => loop(w, v));
    if (!v.url) queueMicrotask(() => restore(w, v));
    return v;
  }
  function release(v) { if (v.url && v.url.startsWith('blob:')) URL.revokeObjectURL(v.url); v.url = null; v.video.removeAttribute('src'); v.video.load(); }
  function setUrl(w, v, url) { release(v); v.url = url; v.last = NaN; v.msg.textContent = 'Loading…'; v.video.src = url; }
  function toCursor(w, v) {
    const sig = parentOf(w); if (!sig) return;
    sig.playhead = null; sig.fixedCursor = (+P(w).offset || 0) + v.video.currentTime; v.last = sig.fixedCursor;
    APP.requestRender(sig);
  }
  // a workspace: the file again – from its path in the desktop app, else the user picks it
  async function restore(w, v) {
    const p = P(w);
    if (p.path && HOST && HOST.available) {
      try { const r = await HOST.call('mediaUrl', { path: p.path }); setUrl(w, v, r.url); return; } catch (e) { /* moved or deleted: ask */ }
    }
    v.msg.replaceChildren(`The video ${p.name ? '“' + p.name + '” ' : ''}is not loaded. `, btn('Open the video file…', '', () => reopenCommand(w)));
  }

  /* ---------- keeping the video and its signal together ---------- */
  function loop(w, v) {
    if (!S.wins.has(w.id)) return;
    v.raf = requestAnimationFrame(() => loop(w, v));
    const vid = v.video, sig = parentOf(w);
    if (!sig || !v.url || vid.readyState < 1) return;
    const off = +P(w).offset || 0, dur = isFinite(vid.duration) ? vid.duration : Infinity; // a recorder's WebM may not know its length
    const seek = t => { t = Math.max(0, Math.min(dur, t)); if (Math.abs(vid.currentTime - t) > 1 / 120) { v.sought = t; vid.currentTime = t; } };
    const pause = () => { if (!vid.paused) { v.user = false; vid.pause(); } };
    if (sig.player && sig.playhead != null) { // the signal plays with sound: the video plays along, quietly
      const t = sig.playhead - off;
      v.user = false; v.following = true; vid.muted = true;
      if (t < 0 || t > dur) { pause(); seek(t); return; }
      if (vid.paused && !v.playing) { v.playing = true; vid.play().catch(() => {}).finally(() => { v.playing = false; }); }
      if (Math.abs(vid.currentTime - t) > 0.25) seek(t);
      return;
    }
    if (v.following) { v.following = false; pause(); vid.muted = !P(w).sound; v.last = NaN; }
    if (v.user) { sig.playhead = off + vid.currentTime; APP.requestRender(sig); return; } // its own controls: a playhead on the signal
    const target = sig.stepper ? sig.view.x1 : sig.fixedCursor != null ? sig.fixedCursor : sig.view.x0;
    if (target !== v.last) { v.last = target; pause(); seek(target - off); }
  }

  /* ---------- the window's bar ---------- */
  const btn = (label, title, run) => { const b = h('button', { class: 'geo-btn', title }, label); b.onclick = e => UI.guard(run)(e); return b; };
  function buildBar(w, v) {
    const off = h('input', { class: 'geo-num vid-off', type: 'number', step: 'any', title: 'The signal time at which the video starts (s)' });
    off.value = +P(w).offset || 0;
    off.onchange = () => { P(w).offset = +off.value || 0; v.last = NaN; APP.queueCompute(w); };
    const snd = h('label', { class: 'vid-snd', title: 'The video\'s own sound when it plays by itself (while its signal plays, only the signal is heard)' }, h('input', { type: 'checkbox' }), ' Sound');
    snd.firstChild.checked = !!P(w).sound;
    snd.firstChild.onchange = () => { P(w).sound = snd.firstChild.checked; if (!v.following) v.video.muted = !P(w).sound; };
    v.offInput = off;
    v.bar.replaceChildren(btn('Open video…', 'Open another video file in this window', () => reopenCommand(w)),
      btn('Sync with signal…', 'The signal this video plays in step with, and the time offset', () => syncDialog(w)),
      h('span', { class: 'cab-lab' }, 'Offset'), off, h('span', { class: 'cab-lab' }, 's'),
      btn('◀', 'One frame back (1/30 s)', () => step(w, v, -1 / 30)), btn('▶', 'One frame on (1/30 s)', () => step(w, v, 1 / 30)), snd);
  }
  function step(w, v, dt) {
    const vid = v.video; if (!v.url || vid.readyState < 1) return;
    vid.pause(); vid.currentTime = Math.max(0, Math.min(isFinite(vid.duration) ? vid.duration : Infinity, vid.currentTime + dt));
  }
  async function syncDialog(w) {
    const sigs = [...S.wins.values()].filter(isTime), cur = parentOf(w);
    const r = await dialog({ title: 'Sync video with a signal', intro: 'The video plays in step with the signal: with it (F5), at its cursor and with its visible part. The offset is the signal time at which the video starts – for a camera started 2.5 s after the recorder, 2.5.', fields: [
      { key: 'sig', label: 'Signal', type: 'select', options: [['', 'None – the video plays by itself']].concat(sigs.map(x => [String(x.id), `${x.id}#${x.title}`])), value: cur ? String(cur.id) : '' },
      { key: 'offset', label: 'Offset (s)', type: 'number', value: +P(w).offset || 0 }] });
    if (!r) return;
    P(w).offset = r.offset || 0; if (views.get(w)) views.get(w).offInput.value = P(w).offset;
    attach(w, r.sig ? S.wins.get(+r.sig) : null);
  }
  // the signal the video follows: its parent window
  function attach(w, sig) {
    for (const id of w.parents) { const o = S.wins.get(id); if (o) o.children.delete(w.id); }
    w.parents = sig ? [sig.id] : [];
    if (sig) sig.children.add(w.id);
    w.frozen = false; const v = views.get(w); if (v) v.last = NaN;
    w.updateTitle(); APP.queueCompute(w); APP.emit();
  }

  /* ---------- opening ---------- */
  // whether the file has a picture (an audio-only .webm is left to the audio import), and its length
  function probe(url) {
    return new Promise(res => {
      const t = document.createElement('video'), done = r => { clearTimeout(to); t.removeAttribute('src'); t.load(); res(r); };
      const to = setTimeout(() => done(null), 15000);
      t.preload = 'metadata'; t.muted = true;
      t.onloadedmetadata = () => done({ video: t.videoWidth > 0, duration: t.duration });
      t.onerror = () => done(null);
      t.src = url;
    });
  }
  async function soundOf(buf) {
    const ab = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(buf);
    return { fs: ab.sampleRate, ch: Array.from({ length: ab.numberOfChannels }, (_, c) => Float64Array.from(ab.getChannelData(c))) };
  }
  // the URL the video plays from: the desktop app streams a file with a path from disk, elsewhere it is the file's blob
  async function urlOf(file) {
    if (file.path && HOST && HOST.available) { const r = await HOST.call('mediaUrl', { path: file.path }); return { url: r.url, size: r.size || 0 }; }
    return { url: URL.createObjectURL(file instanceof Blob ? file : new Blob([await file.arrayBuffer()])), size: file.size || 0 };
  }
  // file: a File (browser, drag and drop) or the desktop app's file object with its path. Returns false to leave an audio-only
  // .webm to the audio import.
  async function openVideo(file, audioFirst) {
    const name = file.name, path = file.path || null, { url, size } = await urlOf(file);
    const info = await probe(url);
    if (!info || !info.video) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      if (audioFirst) return false;
      if (!info) throw new Error(`${name}: this video cannot be played here (its format or codec is not supported)`);
    }
    // the sound as signal windows (it needs the whole file; above 400 MB only on request)
    let sig = null;
    const big = size > 400e6;
    if (!big || await UI.confirmBox('Open the sound too?', `${name} is ${Math.round(size / 1e6)} MB. Opening its sound as a signal reads the whole file.`)) {
      try {
        const s = await soundOf(await file.arrayBuffer());
        const dw = S.desktop.clientWidth || 1000, dh = S.desktop.clientHeight || 700, lw = Math.round(dw * 0.45), hh = Math.round(dh / Math.max(2, s.ch.length + 1));
        s.ch.forEach((y, c) => {
          const x = APP.openSignal(y, s.fs, `${name} – sound${s.ch.length > 1 ? ' ch ' + (c + 1) : ''}`, { type: 'file', name }, { yUnit: '' });
          Object.assign(x.el.style, { left: '0px', top: c * hh + 'px', width: lw - 4 + 'px', height: hh - 4 + 'px' }); APP.requestRender(x);
          if (!sig) sig = x;
        });
      } catch (e) { toast(`${name} has no sound track that can be read – sync it with a signal (Sync with signal…)`); }
    }
    if (!info || !info.video) { toast(`${name}: no picture, only the sound was opened`); return true; }
    const dw = S.desktop.clientWidth || 1000, dh = S.desktop.clientHeight || 700, x0 = sig ? Math.round(dw * 0.45) : Math.round(dw * 0.2);
    const w = APP.createWindow({ kind: 'display', title: 'Video – ' + name, op: { type: 'video', params: { name, offset: 0, sound: true, path } }, parents: [],
      rect: { x: x0, y: 0, w: dw - x0, h: Math.min(dh, Math.round((dw - x0) * 9 / 16) + 70) } });
    setUrl(w, viewOf(w), url);
    if (sig) attach(w, sig);
    toast(sig ? `${name}: the video plays with its sound – F5 in the sound window, or the video's own ▶` : `${name} opened – Sync with signal… links it to a recording`);
    return true;
  }
  // a file for an existing video window (Open video… in its bar, or a workspace's video again)
  async function relink(id, file) {
    const w = S.wins.get(+id); if (!w || !w.op || w.op.type !== 'video') throw new Error('The video window is gone');
    const v = viewOf(w), { url } = await urlOf(file);
    Object.assign(P(w), { name: file.name, path: file.path || null }); w.title = OPS.video.label(P(w)); w.updateTitle();
    setUrl(w, v, url);
  }
  // a signal recorded beside a camera gets its video: opened without the video's sound, synced with the signal
  async function attachFile(sig, file) {
    const { url } = await urlOf(file), r = sig.el.getBoundingClientRect(), d = S.desktop.getBoundingClientRect(), dw = d.width || 1000;
    const x0 = Math.max(0, Math.min(dw - 320, r.right - d.left + 4)), ww = Math.max(320, dw - x0);
    const w = APP.createWindow({ kind: 'display', title: 'Video – ' + file.name, op: { type: 'video', params: { name: file.name, offset: 0, sound: true, path: file.path || null } }, parents: [],
      rect: { x: x0, y: Math.max(0, r.top - d.top), w: ww, h: Math.round(ww * 9 / 16) + 70 } });
    setUrl(w, viewOf(w), url);
    if (S.wins.has(sig.id)) attach(w, sig);
    toast('Video attached – set the offset if the camera started at another time than the recording');
  }
  // choosing a video: in the desktop app the native dialog gives its path only (the video is then streamed from disk, and
  // read whole only for its sound); in a browser the file input hands the file to the openers below, with this mode
  async function chooseVideo(mode, then) {
    if (HOST && HOST.available) {
      const path = await HOST.pickFile('Video files (*.mp4;*.m4v;*.mov;*.webm;*.ogv;*.mkv)|*.mp4;*.m4v;*.mov;*.webm;*.ogv;*.mkv|All files (*.*)|*.*');
      if (!path) return;
      let buf = null;
      return then({ name: baseName(path), path, size: 0, arrayBuffer: async () => buf || (buf = (await HOST.readFile(path)).buffer) });
    }
    UI.pickFiles(ACCEPT, mode);
  }
  let pendingAttach = null;
  const openCommand = () => chooseVideo('video', f => openVideo(f, false));
  const reopenCommand = w => chooseVideo('video:' + w.id, f => relink(w.id, f));
  const attachCommand = sig => { pendingAttach = sig; return chooseVideo('video-attach', f => attachFile(sig, f)); };

  // the file openers: video files – and files chosen with Open video…, for a video window or to attach – come here first
  const prevOpen = root.UI_OPENERS;
  root.UI_OPENERS = async (file, mode) => {
    if (mode && mode.startsWith('video:')) { await relink(mode.slice(6), file); return true; }
    if (mode === 'video-attach') { const sig = pendingAttach; pendingAttach = null; if (sig) await attachFile(sig, file); return true; }
    const ext = extOf(file.name);
    if (mode === 'video' || (!mode && VIDEO_EXT.includes(ext))) { if (await openVideo(file, ext === 'webm' && mode !== 'video')) return true; }
    return prevOpen ? prevOpen(file, mode) : false;
  };

  const fileMenu = UI.MENUS.find(m => m.label === 'File');
  if (fileMenu) {
    const at = fileMenu.items.findIndex(it => it && it.label === 'Open signal…');
    fileMenu.items.splice(at + 1, 0, { label: 'Open video…', run: openCommand });
  }
  const prevExtra = UI.extraWindowItems;
  UI.extraWindowItems = w => {
    const out = prevExtra ? prevExtra(w) : [];
    if (w.op && w.op.type === 'video') out.unshift({ label: 'Sync with signal…', run: () => syncDialog(w) }, { label: 'Open video…', run: () => reopenCommand(w) }, '-');
    else if (isTime(w)) out.push('-', { label: 'Attach a video…', run: () => attachCommand(w) });
    return out;
  };

  root.VIDEO = { openVideo, openCommand, attach, ACCEPT };
})(window);
