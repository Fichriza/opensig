/* OpenSig Geometry node (3D tools ▸ Geometry and mode shapes…, Control Window): a 3D model of the test object – nodes,
   lines and surfaces – with measured channels assigned to node directions (degrees of freedom, DOFs), animated with the
   measured motion: in time (slow motion), as the operating deflection shape (ODS) at a frequency relative to a
   reference channel, or as the mode shape at a peak of the singular values of the cross-spectral matrix (Frequency
   Domain Decomposition, FDD).
   The 3D view: drag rotates, Shift / middle drag pans, the wheel zooms, a double-click fits; the tools add points on a
   working plane, move points, draw lines and draw surfaces (click 3 or 4 nodes). Seven standard views, a colour legend,
   step back / forward, a static 0° / 180° display, a frequency sweep and recording the animation as a video.
   The editor: Nodes (generators: grid, rectangle outline, box, circle, cylinder, truncated cone, beam; paste; UFF/UNV
   import and export; renumbering), Lines, Surfaces, DOFs (±X/Y/Z or ±R/T/A on a cylinder, reference channels,
   auto-assign) and FDD. The channel windows are the node's parents, so it follows zoom and playback.
   Math and file formats: geomath.js. */
(function (root) {
  'use strict';
  const { APP, UI, OPS } = root, GM = root.GEOMATH;
  const S = APP.S, { h, toast, dialog, download } = UI;
  const views = new WeakMap();
  const MODES = [['off', 'No animation'], ['time', 'Time (slow motion)'], ['ods', 'ODS at a frequency'], ['fdd', 'Mode shape (FDD)']];
  const RATES = [[0.001, '1/1000 real time'], [0.01, '1/100 real time'], [0.1, '1/10 real time'], [1, 'real time']];
  const TOOLS = [['select', 'Select / rotate'], ['add', 'Add points'], ['move', 'Move points'], ['lines', 'Draw lines'], ['surfaces', 'Draw surfaces']];
  const VIEWS = [['Iso', -35, 25], ['Top', 0, 90], ['Bottom', 0, -90], ['Front', 0, 0], ['Back', 180, 0], ['Left', 90, 0], ['Right', -90, 0]];
  const DIR_TITLES = { R: 'radial (outwards from the cylinder axis)', T: 'tangential (around the cylinder axis)', A: 'along the cylinder axis' };
  const DIR_COLOR = { X: '#d33', Y: '#2a2', Z: '#26d', R: '#e08a00', T: '#9b3fd1', A: '#0aa' };
  const defaults = () => ({
    nodes: [], lines: [], surfaces: [], dofs: [], cyl: null,
    anim: { mode: 'off', freq: 0, ref: 0, scale: 1, speed: 1, rate: 0.01, playing: true, style: 'dwell', sweep: [0, 0] },
    show: { labels: true, undeformed: true, surfaces: true, arrows: true, interp: false, legend: true },
    edit: { snap: 0, side: 420 },
    fdd: { nseg: 8 }, view: { yaw: -35, pitch: 25, zoom: 1, panX: 0, panY: 0 },
    efdd: { nseg: 8, macMin: 0.8, hi: 0.9, lo: 0.2, window: true }, modes: [], modesInfo: null
  });
  const P = w => w.op.params;
  const fmt = v => isFinite(v) ? String(+(+v).toPrecision(6)) : '';
  const cylOf = p => p.cyl || (p.nodes.length ? (() => { const b = bounds(p.nodes); return { x: b.c[0], y: b.c[1], z: b.c[2], axis: 'Z' }; })() : null);

  /* ---------- the operation ---------- */
  OPS.geometry = {
    label: () => 'Geometry', kind: 'display', input: 'visible', multi: true,
    // workspaces renumber windows: the DOF channels follow
    remap: (op, map) => ({ type: op.type, params: Object.assign({}, op.params, { dofs: (op.params.dofs || []).map(d => Object.assign({}, d, { win: map(d.win) ?? d.win })) }) }),
    compute(w, inputs) {
      const v = viewOf(w), p = P(w), byId = new Map(w.parents.map((id, i) => [id, inputs[i]]));
      v.chan = p.dofs.map(d => { const x = byId.get(d.win); return x && x.y ? x : null; });
      v.S = null; v.sv = null; v.G = null; v.merge = null; v.issue = null; v.shape = null; v.shapeKey = null;
      const ok = v.chan.filter(Boolean);
      // setups: the channels of one setup were recorded together; a roving test has several (combined in the shapes)
      v.setups = [...new Set(p.dofs.map((d, k) => v.chan[k] ? setupOf(d) : null).filter(s => s != null))].sort((a, b) => a - b);
      v.timeSetup = v.setups.includes(p.anim.setup) ? p.anim.setup : v.setups[0]; // Time mode plays one setup
      const tch = v.chan.filter((x, k) => x && setupOf(p.dofs[k]) === v.timeSetup);
      v.len = tch.length ? Math.min(...tch.map(x => x.y.length)) : 0;
      v.maxAbs = 0; for (const x of tch) for (let i = 0; i < v.len; i++) v.maxAbs = Math.max(v.maxAbs, Math.abs(x.y[i]));
      v.fs = ok.length && !ok[0].x ? 1 / ok[0].dx : 0;
      if (ok.some(x => x.x || Math.abs(1 / x.dx - v.fs) > v.fs * 1e-6)) v.issue = 'The channels need one common, uniform sample rate';
      v.idx = Math.min(v.idx || 0, Math.max(0, v.len - 1));
      queueMicrotask(() => { // the channel-dependent tabs follow the data, but never while a cell is being edited
        if ((v.tab === 'fdd' || v.tab === 'dofs' || v.tab === 'modes') && !v.pane.contains(document.activeElement)) refreshSide(w, v);
        if (v.running && !v.issue) { spectra(w, v); v.modes = v.sv ? GM.peaks(v.sv[0], 10, 3).map(b => b * v.df) : []; buildBar(w, v); }
        if (v.autoPeak && v.chan.some(Boolean)) { // the example opens at the first mode
          v.autoPeak = false; spectra(w, v);
          const pk = v.sv ? GM.peaks(v.sv[0], 10, 3) : []; if (pk.length) { pickFreq(w, v, pk[0] * v.df); return; }
        }
        if (P(w).anim.mode !== 'off' && P(w).anim.playing) loop(w, v);
        draw(w, v);
      });
      return { dom: v.root, note: `${P(w).nodes.length} nodes · ${P(w).dofs.length} DOFs` };
    }
  };
  const setupOf = d => d.setup || 1;
  const dofKey = (d, k) => d.node == null ? '#' + k : d.node + '|' + d.dir; // the same node and direction in two setups: shared
  function channelGroups(w, v) { // the measured channels of each setup: {setup, ks: DOF indices, ys: signals}
    const p = P(w);
    return (v.setups || []).map(s => { const ks = [], ys = []; v.chan.forEach((x, k) => { if (x && setupOf(p.dofs[k]) === s) { ks.push(k); ys.push(x.y); } }); return { setup: s, ks, ys }; }).filter(g => g.ks.length);
  }
  // spectra only when an ODS / mode shape or the FDD tab needs them: one spectral matrix per setup; with several
  // setups the FDD curve to pick peaks on is the average of their normalised first singular values
  function spectra(w, v) {
    if (v.S || v.issue || !v.chan) return v.S;
    const p = P(w), groups = channelGroups(w, v);
    if (!groups.length) return null;
    try {
      for (const g of groups) { g.S = GM.csdMatrix(g.ys, p.fdd.nseg || 8); g.df = v.fs / g.S.L; g.sv = GM.fdd(g.S, Math.min(3, g.ys.length)); }
      const g0 = groups[0];
      v.G = groups; v.df = g0.df; v.S = g0.S;
      v.sv = groups.length > 1 ? GM.combineSV(groups.map(g => g.sv[0]), groups.map(g => g.df), g0.df, g0.S.bins) : g0.sv;
    } catch (e) { v.issue = e.message; v.S = null; v.G = null; }
    return v.S;
  }
  function shapeFor(w, v) { // the complex shape per DOF index for the ODS / FDD animation
    const p = P(w), a = p.anim;
    if (a.mode !== 'ods' && a.mode !== 'fdd') return null;
    if (!spectra(w, v)) return null;
    const grid = Math.max(1, Math.min(v.sv[0].length - 1, Math.round(a.freq / v.df)));
    const key = a.mode + grid + ':' + a.ref;
    if (v.shapeKey === key && v.shape) return v.shape;
    const refKey = p.dofs[a.ref] ? dofKey(p.dofs[a.ref], a.ref) : null, multi = v.G.length > 1;
    const parts = v.G.map(g => {
      let b = Math.max(1, Math.min(g.S.bins - 1, Math.round(a.freq / g.df)));
      if (multi) { // each setup at the top of its own first singular value next to the frequency
        const reach = Math.max(1, Math.round(v.df / g.df)); let best = b;
        for (let k = Math.max(1, b - reach); k <= Math.min(g.S.bins - 1, b + reach); k++) if (g.sv[0][k] > g.sv[0][best]) best = k;
        b = best;
      }
      let sh;
      if (a.mode === 'fdd') sh = GM.modeShape(g.S, b);
      else { // ODS: relative to the reference DOF in this setup (or its first reference sensor)
        let r = g.ks.findIndex(k => dofKey(p.dofs[k], k) === refKey); if (r < 0) r = Math.max(0, g.ks.findIndex(k => p.dofs[k].ref));
        sh = GM.normShape(GM.odsShape(g.S, b, r));
      }
      return { keys: g.ks.map(k => dofKey(p.dofs[k], k)), shape: sh, ks: g.ks };
    });
    const re = p.dofs.map(() => 0), im = p.dofs.map(() => 0);
    if (!multi) { parts[0].ks.forEach((k, j) => { re[k] = parts[0].shape.re[j]; im[k] = parts[0].shape.im[j]; }); v.merge = null; }
    else {
      const m = GM.mergeShapes(parts), at = new Map(m.keys.map((k, i) => [k, i]));
      p.dofs.forEach((d, k) => { const i = at.get(dofKey(d, k)); if (i != null) { re[k] = m.re[i]; im[k] = m.im[i]; } });
      v.merge = m;
    }
    v.shape = { re, im, f: grid * v.df };
    v.shapeKey = key;
    return v.shape;
  }

  /* ---------- motion of the nodes ---------- */
  // the displacement of every node at phase theta (ODS / FDD) or at the current sample (time)
  function displacements(w, v, theta) {
    const p = P(w), a = p.anim; if (a.mode === 'off' || !v.chan) return null;
    let val;
    if (a.mode === 'time') {
      if (!v.len || !(v.maxAbs > 0)) return null;
      const i = Math.floor(v.idx) % v.len;
      val = v.chan.map((x, k) => x && setupOf(p.dofs[k]) === v.timeSetup ? x.y[i] / v.maxAbs : 0);
    } else {
      const sh = shapeFor(w, v); if (!sh) return null;
      const th = theta ?? (v.theta || 0), c = Math.cos(th), s = Math.sin(th);
      val = sh.re.map((re, k) => re * c - sh.im[k] * s);
    }
    const disp = new Map(), meas = new Map(), byId = new Map(p.nodes.map(n => [n.id, n])), cyl = cylOf(p), seen = new Set();
    p.dofs.forEach((d, k) => {
      const n = byId.get(d.node); if (!n || !v.chan[k]) return;
      if (a.mode === 'time' && setupOf(d) !== v.timeSetup) return;
      if (seen.has(d.node + '|' + d.dir)) return; // measured in several setups: once
      seen.add(d.node + '|' + d.dir);
      const e = GM.dirVector(d.dir, n, cyl), u = disp.get(d.node) || [0, 0, 0], m = meas.get(d.node) || [false, false, false];
      for (let c = 0; c < 3; c++) { u[c] += val[k] * e[c]; if (Math.abs(e[c]) > 0.3) m[c] = true; }
      disp.set(d.node, u); meas.set(d.node, m);
    });
    if (p.show.interp) GM.fillUnmeasured(p, disp, meas);
    return disp;
  }

  /* ---------- 3D view ---------- */
  function bounds(nodes) {
    if (!nodes.length) return { c: [0, 0, 0], R: 1 };
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const n of nodes) [n.x, n.y, n.z].forEach((c, i) => { lo[i] = Math.min(lo[i], c); hi[i] = Math.max(hi[i], c); });
    const c = lo.map((l, i) => (l + hi[i]) / 2), R = Math.max(1e-9, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
    return { c, R: nodes.length === 1 ? 1 : R };
  }
  function projector(p, W, H, b) {
    const a = p.view.yaw * Math.PI / 180, e = p.view.pitch * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
    const s = 0.42 * Math.min(W, H) / b.R * p.view.zoom;
    const rot = (x, y, z) => { const x1 = x * ca - y * sa, y1 = x * sa + y * ca; return [x1, y1 * ce - z * se, y1 * se + z * ce]; }; // [right, depth, up]
    return {
      rot,
      at(x, y, z) { const r = rot(x - b.c[0], y - b.c[1], z - b.c[2]); return { sx: W / 2 + r[0] * s + p.view.panX, sy: H / 2 - r[2] * s + p.view.panY, d: r[1], r }; },
      // the point under (sx, sy) on the plane where coordinate k (0 x, 1 y, 2 z) equals val; null when parallel
      onPlane(sx, sy, k, val) {
        const x1 = (sx - W / 2 - p.view.panX) / s, z2 = -(sy - H / 2 - p.view.panY) / s;
        const pt = t => { const y1 = t * ce + z2 * se, Z = -t * se + z2 * ce; return [x1 * ca + y1 * sa + b.c[0], -x1 * sa + y1 * ca + b.c[1], Z + b.c[2]]; };
        const p0 = pt(0), p1 = pt(1), dv = p1[k] - p0[k];
        if (Math.abs(dv) < 1e-9) return null;
        const t = (val - p0[k]) / dv, q = pt(t); q[k] = val; return q;
      }
    };
  }
  // the working plane for adding / moving points: facing the view; through the selected node (or 0)
  function workPlane(p, through) {
    const pitch = Math.abs(p.view.pitch), yaw = ((p.view.yaw % 360) + 360) % 360, front = Math.min(yaw, 360 - yaw, Math.abs(yaw - 180));
    const k = pitch > 50 ? 2 : front < 40 ? 1 : (Math.abs(yaw - 90) < 40 || Math.abs(yaw - 270) < 40) ? 0 : 2;
    return { k, val: through ? [through.x, through.y, through.z][k] : 0, name: ['YZ', 'XZ', 'XY'][k], axis: 'XYZ'[k] };
  }
  const snapTo = (v, s) => s > 0 ? Math.round(v / s) * s : +v.toPrecision(6);
  const heat = t => { // blue → cyan → green → yellow → red
    t = Math.max(0, Math.min(1, t));
    const c = x => Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - x))));
    return `rgb(${c(3)},${c(2)},${c(1)})`;
  };
  function draw(w, v) {
    if (S.wins.get(w.id) !== w) return;                         // closed, or in a hidden workspace tab
    const p = P(w), cv = v.canvas, box = cv.parentElement, dpr = window.devicePixelRatio || 1;
    const W = Math.max(50, box.clientWidth), H = Math.max(50, box.clientHeight);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    const ctx = v.ctx, th = S.theme, cs = getComputedStyle(v.root);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = cs.getPropertyValue('--geo-bg').trim() || th.plotBg; ctx.fillRect(0, 0, W, H);
    const ink = cs.getPropertyValue('--geo-ink').trim() || th.text, muted = cs.getPropertyValue('--geo-muted').trim() || '#888';
    const b = v.lockB || bounds(p.nodes), pr = projector(p, W, H, b), ids = new Map(p.nodes.map(n => [n.id, n]));
    v.pr = pr; v.screen = new Map();
    if (!p.nodes.length) {
      ctx.fillStyle = muted; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(v.tool === 'add' ? 'Click to add points' : 'No geometry yet – generate a part in the Nodes tab, import UFF, or choose the "Add points" tool', W / 2, H / 2);
      axes(ctx, pr, H); info(w, v); return;
    }
    const a = p.anim, statik = a.style === 'static' && (a.mode === 'ods' || a.mode === 'fdd');
    const disp = displacements(w, v, statik ? 0 : undefined), amp = a.scale * 0.12 * b.R * 2;
    let maxMag = 0; if (disp) disp.forEach(u => { maxMag = Math.max(maxMag, Math.hypot(...u)); });
    const project = dsp => { // node id → screen point for a displacement field
      const pos = new Map(), k = dsp && maxMag > 0 ? amp / maxMag : 0;
      for (const n of p.nodes) { const u = dsp && dsp.get(n.id); pos.set(n.id, u ? pr.at(n.x + u[0] * k, n.y + u[1] * k, n.z + u[2] * k) : pr.at(n.x, n.y, n.z)); }
      return pos;
    };
    const pos = project(disp), mag = new Map(p.nodes.map(n => { const u = disp && disp.get(n.id); return [n.id, u && maxMag > 0 ? Math.hypot(...u) / maxMag : 0]; }));
    const edges = q => { ctx.beginPath(); p.lines.forEach(([x, y]) => { const A = q.get(x), B = q.get(y); if (A && B) { ctx.moveTo(A.sx, A.sy); ctx.lineTo(B.sx, B.sy); } }); if (p.show.surfaces) p.surfaces.forEach(f => f.forEach((x, k) => { const A = q.get(x), B = q.get(f[(k + 1) % f.length]); if (A && B) { ctx.moveTo(A.sx, A.sy); ctx.lineTo(B.sx, B.sy); } })); ctx.stroke(); };
    // undeformed model, dashed
    if (disp && p.show.undeformed) { ctx.strokeStyle = muted; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; edges(project(null)); ctx.setLineDash([]); }
    // static display: the opposite extreme (180°) as a ghost
    if (disp && statik) { ctx.strokeStyle = '#c45f00'; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2; edges(project(displacements(w, v, Math.PI))); ctx.globalAlpha = 1; }
    // surfaces, far ones first
    if (p.show.surfaces) {
      const faces = p.surfaces.map(f => ({ q: f.map(id => pos.get(id)), f })).filter(o => o.q.length >= 3 && o.q.every(Boolean));
      faces.forEach(o => { o.d = o.q.reduce((s, x) => s + x.d, 0) / o.q.length; });
      faces.sort((x, y) => y.d - x.d);
      for (const o of faces) {
        const [A, B, C] = o.q.map(x => x.r), n = [(B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])];
        const facing = Math.abs(n[1]) / (Math.hypot(...n) || 1), light = 0.55 + 0.45 * facing;
        ctx.beginPath(); o.q.forEach((x, k) => k ? ctx.lineTo(x.sx, x.sy) : ctx.moveTo(x.sx, x.sy)); ctx.closePath();
        if (disp) { ctx.fillStyle = heat(o.f.reduce((s, id) => s + mag.get(id), 0) / o.f.length); ctx.globalAlpha = 0.55 + 0.3 * facing; }
        else { ctx.fillStyle = `rgb(${Math.round(110 * light)},${Math.round(160 * light)},${Math.round(225 * light)})`; ctx.globalAlpha = 0.75; }
        ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = muted; ctx.lineWidth = 0.6; ctx.stroke();
      }
    }
    // lines
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.beginPath();
    p.lines.forEach(([x, y]) => { const A = pos.get(x), B = pos.get(y); if (A && B) { ctx.moveTo(A.sx, A.sy); ctx.lineTo(B.sx, B.sy); } });
    ctx.stroke();
    // tool previews: the line being drawn, the surface being picked
    const chain = v.tool === 'lines' && v.lineFrom != null ? [v.lineFrom] : v.tool === 'surfaces' ? v.surfPick : [];
    if (chain.length && v.mouse) {
      ctx.strokeStyle = '#1883d7'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.beginPath();
      chain.forEach((id, k) => { const q = pos.get(id); if (q) k ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy); });
      ctx.lineTo(v.mouse.x, v.mouse.y); if (v.tool === 'surfaces' && chain.length > 1) { const q = pos.get(chain[0]); ctx.lineTo(q.sx, q.sy); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    // DOF arrows (X red, Y green, Z blue, radial orange, tangential purple, axial teal); references get a ring
    const cyl = cylOf(p);
    if (p.show.arrows) for (const d of p.dofs) {
      const n = ids.get(d.node), q = pos.get(d.node); if (!n || !q) continue;
      const e = GM.dirVector(d.dir, n, cyl), L = b.R * 0.14, o0 = pr.at(n.x, n.y, n.z), t = pr.at(n.x + e[0] * L, n.y + e[1] * L, n.z + e[2] * L);
      const dx = t.sx - o0.sx, dy = t.sy - o0.sy, len = Math.hypot(dx, dy); if (len < 1) continue;
      const col = DIR_COLOR[d.dir[1]] || ink, ex = q.sx + dx, ey = q.sy + dy, ux = dx / len, uy = dy / len;
      ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = d.ref ? 2.4 : 1.5; ctx.beginPath(); ctx.moveTo(q.sx, q.sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 6 * ux + 3 * uy, ey - 6 * uy - 3 * ux); ctx.lineTo(ex - 6 * ux - 3 * uy, ey - 6 * uy + 3 * ux); ctx.fill();
      if (d.ref) { ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q.sx, q.sy, 7, 0, 7); ctx.stroke(); }
    }
    // nodes and labels
    ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    for (const n of p.nodes) {
      const q = pos.get(n.id), on = v.sel === n.id || v.lineFrom === n.id || v.surfPick.includes(n.id);
      ctx.fillStyle = on ? '#1883d7' : ink; ctx.beginPath(); ctx.arc(q.sx, q.sy, on ? 4.5 : 2.6, 0, 7); ctx.fill();
      if (p.show.labels) { ctx.fillStyle = on ? '#1883d7' : muted; ctx.fillText(n.name ? `${n.id} ${n.name}` : String(n.id), q.sx + 4, q.sy - 2); }
      v.screen.set(n.id, q);
    }
    if (disp && p.show.legend) legend(ctx, W, H, ink, muted);
    axes(ctx, pr, H); info(w, v);
  }
  function axes(ctx, pr, H) {
    const o = { x: 34, y: H - 30 };
    [['X', [1, 0, 0], '#d33'], ['Y', [0, 1, 0], '#2a2'], ['Z', [0, 0, 1], '#26d']].forEach(([l, e, col]) => {
      const r = pr.rot(...e);
      ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + r[0] * 22, o.y - r[2] * 22); ctx.stroke();
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l, o.x + r[0] * 30, o.y - r[2] * 30);
    });
  }
  function legend(ctx, W, H, ink, muted) { // colour scale of the deflection
    const x = W - 34, y0 = 34, hh = Math.min(140, H - 90);
    if (hh < 40) return;
    for (let i = 0; i < hh; i++) { ctx.fillStyle = heat(1 - i / hh); ctx.fillRect(x, y0 + i, 12, 1.2); }
    ctx.strokeStyle = muted; ctx.lineWidth = 0.6; ctx.strokeRect(x + 0.5, y0 + 0.5, 12, hh);
    ctx.fillStyle = ink; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('100 %', x - 3, y0); ctx.fillText('50 %', x - 3, y0 + hh / 2); ctx.fillText('0', x - 3, y0 + hh);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('Deflection', x + 2, y0 - 6);
  }
  function info(w, v) {
    const p = P(w), a = p.anim, sh = v.shape;
    let t = '';
    if (v.tool === 'add' || v.tool === 'move') {
      const sel = p.nodes.find(n => n.id === v.sel), wp = workPlane(p, sel);
      t = `${v.tool === 'add' ? 'Adding points' : 'Moving points'} in the ${wp.name} plane at ${wp.axis} = ${fmt(wp.val)}${v.tool === 'add' ? ' (select a node to use its plane)' : ''}`;
    } else if (v.tool === 'surfaces') t = v.surfPick.length ? `Surface: ${v.surfPick.join(' – ')} (4th node closes it, Enter closes a triangle, Esc cancels)` : 'Click 3 or 4 nodes around a face';
    else if (v.tool === 'lines') t = 'Click nodes one after the other (Esc ends)';
    else if (v.issue) t = '⚠ ' + v.issue;
    else if (a.mode === 'time') t = v.len ? `t = ${fmt((Math.floor(v.idx) % v.len) / (v.fs || 1))} s` : 'Assign channels in the DOFs tab';
    else if (a.mode === 'ods' || a.mode === 'fdd') t = !p.dofs.length ? 'Assign channels in the DOFs tab' : sh ? `${modeNo(v, sh.f)}${a.mode === 'ods' ? 'ODS' : 'Mode shape'} at ${fmt(sh.f)} Hz${a.style === 'static' ? ' · 0° (solid) and 180° (orange)' : a.playing ? '' : ` · phase ${Math.round((v.theta || 0) * 180 / Math.PI) % 360}°`}${a.style === 'sweep' ? ' · sweeping' : ''}` : 'Pick a frequency (FDD tab or the box above)';
    if (v.recording) t = '● Recording… ' + t;
    v.infoEl.textContent = t;
    if (w.stInfo) w.stInfo.textContent = `${p.nodes.length} nodes · ${p.dofs.length} DOFs`;
  }

  function modeNo(v, f) { // "Mode 2 of 4 · damping 1.53 % · " when f is one of the modes found by Run
    if (!v.running || !v.modes || !v.modes.length) return '';
    const i = v.modes.findIndex(m => Math.abs(m - f) <= 1.5 * (v.df || 0)), md = i >= 0 && modeAt(v.w, f, v);
    return i >= 0 ? `Mode ${i + 1} of ${v.modes.length} · ${md && Number.isFinite(md.zeta) ? `damping ${(md.zeta * 100).toFixed(2)} % · ` : ''}` : '';
  }
  // the identified mode (Modes tab) at frequency f, if any
  const modeAt = (w, f, v) => w && P(w).modes.find(m => Math.abs(m.f0 - f) <= 1.5 * Math.max(v.df || 0, 1e-9));

  /* ---------- animation ---------- */
  function loop(w, v) {
    if (v.raf) return;
    const step = t => {
      v.raf = 0;
      if (!w.el.isConnected) return;                           // closed (a hidden workspace tab keeps it running)
      const a = P(w).anim;
      if (a.mode === 'off' || !a.playing || (a.style === 'static' && a.mode !== 'time')) { v.last = 0; draw(w, v); return; }
      const dt = v.last ? Math.min(0.1, (t - v.last) / 1000) : 0; v.last = t;
      if (a.mode === 'time') v.idx = v.len ? (v.idx + dt * (v.fs || 1) * a.rate) % v.len : 0;
      else {
        v.theta = ((v.theta || 0) + dt * Math.PI * a.speed) % (2 * Math.PI);
        if (a.style === 'sweep' && v.S) { // the frequency runs through the sweep range in 20 s at speed 1
          const top = v.df * (v.S.bins - 1), lo = Math.max(v.df, Math.min(a.sweep[0] || v.df, top)), hi = a.sweep[1] > lo ? Math.min(a.sweep[1], top) : top;
          a.freq = a.freq < lo || a.freq >= hi ? lo : a.freq + dt * (hi - lo) / 20 * a.speed;
          if (v.freqIn && document.activeElement !== v.freqIn) v.freqIn.value = fmt(a.freq);
        }
      }
      if (w.el.offsetParent !== null) draw(w, v);
      v.raf = requestAnimationFrame(step);
    };
    v.raf = requestAnimationFrame(step);
  }
  function stepPhase(w, v, dir) { // one step back / forward while paused
    const a = P(w).anim;
    if (a.mode === 'time') v.idx = v.len ? (v.idx + dir * Math.max(1, Math.round(v.len / 200)) + v.len) % v.len : 0;
    else v.theta = (((v.theta || 0) + dir * Math.PI / 12) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    draw(w, v);
  }
  async function record(w, v) { // the animation as a video: whole cycles (≥ 4 s), one sweep, or 6 s in time mode
    const a = P(w).anim;
    if (a.mode === 'off') throw new Error('Choose what to animate first');
    if (!v.canvas.captureStream || typeof MediaRecorder === 'undefined') throw new Error('Recording video is not supported here');
    const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
    if (!type) throw new Error('No video format is available for recording');
    const cycle = 2 / a.speed, secs = a.mode === 'time' ? 6 : a.style === 'sweep' ? Math.min(30, 20 / a.speed) : Math.ceil(4 / cycle) * cycle; // whole cycles, at least 4 s; a sweep runs once
    a.playing = true; if (a.style === 'static') a.style = 'dwell'; buildBar(w, v); loop(w, v);
    const rec = new MediaRecorder(v.canvas.captureStream(30), { mimeType: type }), parts = [];
    rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    v.recording = true; rec.start(); toast(`Recording ${fmt(secs)} s…`);
    await new Promise(r => setTimeout(r, secs * 1000)); rec.stop(); await done; v.recording = false;
    download((UI.safeName ? UI.safeName(w.title) : 'geometry') + (type.includes('mp4') ? '.mp4' : '.webm'), new Blob(parts, { type: type.split(';')[0] }), type.split(';')[0]);
  }

  /* ---------- window content ---------- */
  function viewOf(w) {
    let v = views.get(w); if (v) return v;
    if (!w.op.params || !w.op.params.nodes) w.op.params = Object.assign(defaults(), w.op.params || {});
    const p = P(w); for (const k of ['anim', 'show', 'fdd', 'view', 'edit', 'efdd']) p[k] = Object.assign(defaults()[k], p[k] || {});
    if (!Array.isArray(p.modes)) p.modes = [];
    v = { w, tab: 'nodes', sel: null, lineFrom: null, surfPick: [], tool: 'select', theta: 0, idx: 0, modeSel: 0 };
    v.root = h('div', { class: 'geo' });
    v.root.innerHTML = `<div class="geo-main"><div class="geo-bar"></div><div class="geo-bar geo-bar2"></div><div class="geo-view" tabindex="0"><canvas></canvas><div class="geo-info"></div></div></div>
      <div class="geo-split" title="Drag to make the editor wider or narrower"></div><div class="geo-side"><div class="geo-tabs"></div><div class="geo-pane"></div></div>`;
    v.canvas = v.root.querySelector('canvas'); v.ctx = v.canvas.getContext('2d'); v.infoEl = v.root.querySelector('.geo-info');
    [v.bar, v.bar2] = v.root.querySelectorAll('.geo-bar'); v.side = v.root.querySelector('.geo-side'); v.pane = v.root.querySelector('.geo-pane');
    views.set(w, v);
    v.side.style.width = p.edit.side + 'px';
    const split = v.root.querySelector('.geo-split');
    split.addEventListener('pointerdown', e => { // drag the border to resize the editor
      e.preventDefault(); split.setPointerCapture(e.pointerId);
      const x0 = e.clientX, w0 = v.side.offsetWidth;
      const move = ev => { p.edit.side = Math.round(Math.max(240, Math.min(v.root.clientWidth - 240, w0 - (ev.clientX - x0)))); v.side.style.width = p.edit.side + 'px'; draw(w, v); };
      const up = () => { split.removeEventListener('pointermove', move); split.removeEventListener('pointerup', up); refreshSide(w, v); };
      split.addEventListener('pointermove', move); split.addEventListener('pointerup', up);
    });
    buildBar(w, v); wireView(w, v); buildTabs(w, v); refreshSide(w, v);
    new ResizeObserver(() => draw(w, v)).observe(v.root.querySelector('.geo-view'));
    w.onClose = () => { if (v.raf) cancelAnimationFrame(v.raf); v.raf = 0; };
    return v;
  }
  const changed = (w, v) => { v.shapeKey = null; draw(w, v); APP.emit(); };
  const sel = (opts, val, cls, title) => h('select', { class: cls, title }, ...opts.map(([k, l]) => { const o = h('option', { value: k }, l); if (String(k) === String(val)) o.selected = true; return o; }));
  const barBtn = (label, title, run, on) => { const b = h('button', { class: 'geo-btn' + (on ? ' on' : ''), title }, label); b.onclick = e => UI.guard(run)(e); return b; };
  function setTool(w, v, t) {
    v.tool = t; v.lineFrom = null; v.surfPick = []; v.root.querySelector('.geo-view').dataset.tool = t;
    v.lockB = t === 'select' ? null : v.lockB || bounds(P(w).nodes); // the view stays put while drawing; Select fits it again
    buildBar(w, v); draw(w, v);
  }
  function buildBar(w, v) {
    const p = P(w), a = p.anim;
    // first row: animation
    v.bar.replaceChildren(); v.freqIn = null;
    if (v.running) v.bar.append(barBtn('✎ Edit model', 'Back to the editor: change the geometry and the channels', () => editModel(w, v)));
    else { const run = barBtn('▶ Run', 'Run the finished model: check it, find its modes and animate it in a large view', () => runModel(w, v)); run.classList.add('geo-run'); v.bar.append(run); }
    const mode = sel(MODES, a.mode, 'geo-sel', 'What to animate');
    mode.onchange = () => { a.mode = mode.value; v.shapeKey = null; buildBar(w, v); refreshSide(w, v); if (a.mode !== 'off') loop(w, v); draw(w, v); };
    v.bar.append(mode);
    if (a.mode !== 'off') {
      v.bar.append(barBtn('◀', 'Step back (while paused)', () => { a.playing = false; buildBar(w, v); stepPhase(w, v, -1); }),
        barBtn(a.playing ? '⏸' : '▶', 'Play / pause', () => { a.playing = !a.playing; if (a.playing && a.style === 'static') a.style = 'dwell'; buildBar(w, v); loop(w, v); draw(w, v); }),
        barBtn('▶|', 'Step forward (while paused)', () => { a.playing = false; buildBar(w, v); stepPhase(w, v, 1); }));
    }
    if (a.mode === 'ods' || a.mode === 'fdd') {
      const f = h('input', { class: 'geo-num', type: 'number', min: 0, step: 'any', value: fmt(a.freq), title: 'Frequency (Hz)' }); v.freqIn = f;
      f.onchange = () => { a.freq = Math.max(0, +f.value || 0); v.shapeKey = null; draw(w, v); refreshSide(w, v); };
      v.bar.append(h('span', { class: 'geo-lab' }, 'f'), f, h('span', { class: 'geo-lab' }, 'Hz'));
      const st = sel([['dwell', 'Dwell'], ['static', '0° / 180°'], ['sweep', 'Sweep']], a.style, 'geo-sel', 'Dwell: animate at this frequency · 0°/180°: the two extremes, still · Sweep: run through the frequencies');
      st.onchange = () => UI.guard(async () => {
        a.style = st.value;
        if (a.style === 'sweep') {
          const top = v.S ? v.df * (v.S.bins - 1) : 0;
          const r = await dialog({ title: 'Frequency sweep', fields: [{ key: 'f1', label: 'From (Hz)', type: 'number', value: a.sweep[0] || 0 }, { key: 'f2', label: 'To (Hz, 0 = highest)', type: 'number', value: a.sweep[1] || top }], ok: 'Sweep' });
          if (r) a.sweep = [Math.max(0, r.f1 || 0), Math.max(0, r.f2 || 0)]; else a.style = 'dwell';
        }
        a.playing = a.style !== 'static';
        buildBar(w, v); loop(w, v); draw(w, v);
      })();
      v.bar.append(st);
      if (a.mode === 'ods') {
        const ref = sel(p.dofs.map((d, k) => [k, `Ref ${dofName(d)}`]), a.ref, 'geo-sel', 'Reference channel (phase 0)');
        ref.onchange = () => { a.ref = +ref.value; v.shapeKey = null; draw(w, v); };
        if (p.dofs.length) v.bar.append(ref);
      }
      const sp = h('input', { type: 'range', min: 0.25, max: 4, step: 0.25, value: a.speed, title: 'Animation speed', class: 'geo-range' });
      sp.oninput = () => { a.speed = +sp.value; };
      v.bar.append(h('span', { class: 'geo-lab' }, 'Speed'), sp);
    }
    if (a.mode === 'time') {
      const rt = sel(RATES, a.rate, 'geo-sel', 'Playback speed'); rt.onchange = () => { a.rate = +rt.value; }; v.bar.append(rt);
      if (v.setups && v.setups.length > 1) { // setups were recorded at different times: one at a time
        const ss = sel(v.setups.map(s => [s, 'Setup ' + s]), v.timeSetup, 'geo-sel', 'The setup to play – setups were not recorded at the same time');
        ss.onchange = () => { a.setup = +ss.value; v.idx = 0; APP.queueCompute(w); }; v.bar.append(ss);
      }
    }
    if (a.mode !== 'off') {
      const sc = h('input', { type: 'range', min: 0.1, max: 4, step: 0.1, value: a.scale, title: 'Deflection scale', class: 'geo-range' });
      sc.oninput = () => { a.scale = +sc.value; draw(w, v); };
      v.bar.append(h('span', { class: 'geo-lab' }, 'Scale'), sc, barBtn('● Rec', 'Record the animation as a video', () => record(w, v)));
    }
    // second row: tools (the modes found, while running) and view
    v.bar2.replaceChildren();
    if (v.running) {
      v.bar2.append(h('span', { class: 'geo-lab' }, v.modes && v.modes.length ? 'Modes' : 'No clear modes found'));
      (v.modes || []).forEach((f, k) => {
        const on = (a.mode === 'fdd' || a.mode === 'ods') && Math.abs(f - a.freq) <= 1.5 * (v.df || 0);
        const md = modeAt(w, f, v), z = md && Number.isFinite(md.zeta) ? ` · ${(md.zeta * 100).toFixed(2)} %` : '';
        const c = h('button', { class: 'geo-chip' + (on ? ' on' : ''), title: `Mode ${k + 1}: animate the shape at ${fmt(f)} Hz` + (md ? `\nEFDD: ${fmt(+md.f.toFixed(4))} Hz, damping ${Number.isFinite(md.zeta) ? (md.zeta * 100).toFixed(2) + ' %' : '–'}` : '') }, `${k + 1}: ${fmt(+(md ? md.f : f).toFixed(2))} Hz${z}`);
        c.onclick = () => pickFreq(w, v, f); v.bar2.append(c);
      });
    } else {
    const tool = sel(TOOLS, v.tool, 'geo-sel', 'Tool for clicks in the view (Esc: back to Select)');
    tool.onchange = () => setTool(w, v, tool.value);
    v.bar2.append(tool);
    }
    if (!v.running && (v.tool === 'add' || v.tool === 'move')) {
      const sn = sel([[0, 'No snap'], [0.001, 'Snap 0.001'], [0.01, 'Snap 0.01'], [0.05, 'Snap 0.05'], [0.1, 'Snap 0.1'], [0.25, 'Snap 0.25'], [0.5, 'Snap 0.5'], [1, 'Snap 1']], p.edit.snap, 'geo-sel', 'Round new coordinates');
      sn.onchange = () => { p.edit.snap = +sn.value; };
      v.bar2.append(sn);
    }
    v.bar2.append(h('span', { class: 'geo-sep' }));
    const viewBtn = (name, yaw, pitch) => barBtn(name, name + ' view', () => { Object.assign(p.view, { yaw, pitch, zoom: 1, panX: 0, panY: 0 }); draw(w, v); });
    VIEWS.forEach(([n, y, pt]) => v.bar2.append(viewBtn(n, y, pt)));
    const showBtn = h('button', { class: 'geo-btn', title: 'Display options' }, 'Show ▾');
    showBtn.onclick = e => { e.stopPropagation(); UI.popupMenu([['labels', 'Node numbers'], ['undeformed', 'Undeformed model'], ['surfaces', 'Surfaces'], ['arrows', 'DOF arrows'], ['legend', 'Colour legend'], ['interp', 'Move unmeasured nodes with their neighbours']]
      .map(([k, l]) => ({ label: l, checked: () => !!p.show[k], run: () => { p.show[k] = !p.show[k]; draw(w, v); } })), showBtn); };
    const sideBtn = barBtn(v.root.classList.contains('geo-noside') ? 'Editor ◂' : 'Editor ▸', 'Show or hide the editor', () => { v.root.classList.toggle('geo-noside'); buildBar(w, v); draw(w, v); });
    v.bar2.append(showBtn, barBtn('Open…', 'Open a geometry: OpenSig geometry (.osgeo) or universal file (.uff, .unv)', () => openGeometry(w)),
      barBtn('Save…', 'Save the geometry (nodes, lines, surfaces) as an OpenSig geometry (.osgeo) or universal file (.unv)', () => saveGeometry(w)));
    if (!v.running) v.bar2.append(sideBtn);
  }

  function nearest(v, x, y, max = 10) {
    let best = null, bd = max;
    v.screen.forEach((q, id) => { const d = Math.hypot(q.sx - x, q.sy - y); if (d < bd) { bd = d; best = id; } });
    return best;
  }
  function wireView(w, v) {
    const view = v.root.querySelector('.geo-view'), p = () => P(w);
    let drag = null;
    const at = e => { const r = v.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    view.addEventListener('pointerdown', e => {
      if (e.button === 2) return;
      view.focus({ preventScroll: true });
      const m = at(e), hit = v.tool === 'move' ? nearest(v, m.x, m.y) : null;
      drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 1, moved: false, node: hit, yaw: p().view.yaw, pitch: p().view.pitch, px: p().view.panX, py: p().view.panY };
      if (hit != null) { v.sel = hit; const n = p().nodes.find(q => q.id === hit); drag.plane = workPlane(p(), n); }
      view.setPointerCapture(e.pointerId);
    });
    view.addEventListener('pointermove', e => {
      v.mouse = at(e);
      if (!drag) { if ((v.tool === 'lines' && v.lineFrom != null) || (v.tool === 'surfaces' && v.surfPick.length)) draw(w, v); return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      if (!drag.moved) return;
      if (drag.node != null) { // move the point within its working plane
        const n = p().nodes.find(q => q.id === drag.node), q = v.pr && v.pr.onPlane(v.mouse.x, v.mouse.y, drag.plane.k, drag.plane.val);
        if (n && q) { const s = p().edit.snap; ['x', 'y', 'z'].forEach((c, i) => { if (i !== drag.plane.k) n[c] = snapTo(q[i], s); }); v.shapeKey = null; draw(w, v); }
        return;
      }
      if (drag.pan) { p().view.panX = drag.px + dx; p().view.panY = drag.py + dy; }
      else { p().view.yaw = drag.yaw + dx * 0.5; p().view.pitch = Math.max(-90, Math.min(90, drag.pitch + dy * 0.5)); }
      draw(w, v);
    });
    view.addEventListener('pointerup', e => {
      const d = drag; drag = null; if (!d) return;
      if (d.node != null && d.moved) { refreshSide(w, v); changed(w, v); return; }
      if (d.moved) return;
      v.mouse = at(e); click(w, v, v.mouse.x, v.mouse.y);
    });
    view.addEventListener('wheel', e => { e.preventDefault(); p().view.zoom = Math.max(0.05, Math.min(50, p().view.zoom * Math.exp(-e.deltaY * 0.0015))); draw(w, v); }, { passive: false });
    view.addEventListener('dblclick', e => { // on a node: rename it; elsewhere: fit the view
      if (v.tool !== 'select') return;
      const m = at(e), hit = nearest(v, m.x, m.y);
      if (hit != null) { UI.guard(() => renameDialog(w, v, hit))(); return; }
      v.lockB = null; Object.assign(p().view, { zoom: 1, panX: 0, panY: 0 }); draw(w, v);
    });
    view.addEventListener('contextmenu', e => { // right-click on a node: its own menu (elsewhere: the window menu)
      const m = at(e), hit = nearest(v, m.x, m.y); if (hit == null) return;
      e.preventDefault(); e.stopPropagation(); v.sel = hit; draw(w, v); if (v.tab === 'nodes') refreshSide(w, v);
      UI.popupMenu([{ label: `Rename node ${hit}…`, key: 'F2', run: () => renameDialog(w, v, hit) }, { label: `Delete node ${hit}`, key: 'Del', run: () => removeNode(w, v, hit) }], null, e.clientX, e.clientY);
    });
    view.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (v.tool !== 'select' && v.lineFrom == null && !v.surfPick.length) setTool(w, v, 'select'); else { v.lineFrom = null; v.surfPick = []; draw(w, v); } }
      else if (e.key === 'Enter' && v.tool === 'surfaces' && v.surfPick.length === 3) addSurface(w, v);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && v.sel != null) removeNode(w, v, v.sel);
      else if (e.key === 'F2' && v.sel != null) UI.guard(() => renameDialog(w, v, v.sel))();
      else return;
      e.preventDefault(); e.stopPropagation();
    });
  }
  function click(w, v, x, y) {
    const p = P(w), hit = nearest(v, x, y);
    if (v.tool === 'add' && hit == null) { // a new point on the working plane
      const s = p.nodes.find(n => n.id === v.sel), wp = workPlane(p, s), q = v.pr && v.pr.onPlane(x, y, wp.k, wp.val);
      if (!q) { toast('Turn the view: the working plane is edge-on'); return; }
      const id = nextId(p), sn = p.edit.snap;
      p.nodes.push({ id, x: snapTo(q[0], sn), y: snapTo(q[1], sn), z: snapTo(q[2], sn) });
      refreshSide(w, v); changed(w, v); return;
    }
    if (v.tool === 'lines') {
      if (hit == null) v.lineFrom = null;
      else if (v.lineFrom != null && v.lineFrom !== hit) {
        if (!p.lines.some(([a, b]) => (a === v.lineFrom && b === hit) || (a === hit && b === v.lineFrom))) p.lines.push([v.lineFrom, hit]);
        v.lineFrom = hit; refreshSide(w, v);
      } else v.lineFrom = hit;
    }
    if (v.tool === 'surfaces' && hit != null && !v.surfPick.includes(hit)) { v.surfPick.push(hit); if (v.surfPick.length === 4) { addSurface(w, v); return; } }
    v.sel = hit; if (v.tab === 'nodes') refreshSide(w, v); draw(w, v);
  }
  function addSurface(w, v) {
    const p = P(w), f = v.surfPick.slice(); v.surfPick = [];
    if (f.length >= 3 && !p.surfaces.some(s => s.length === f.length && s.every(id => f.includes(id)))) { p.surfaces.push(f); toast(`Surface ${f.join(' – ')}`); }
    refreshSide(w, v); changed(w, v);
  }
  function removeNode(w, v, id) {
    const p = P(w);
    p.nodes = p.nodes.filter(n => n.id !== id);
    p.lines = p.lines.filter(l => !l.includes(id));
    p.surfaces = p.surfaces.filter(f => !f.includes(id));
    p.dofs.forEach(d => { if (d.node === id) d.node = null; });
    if (v.sel === id) v.sel = null;
    refreshSide(w, v); changed(w, v);
  }

  /* ---------- editor tabs ---------- */
  const TABS = [['nodes', 'Nodes'], ['lines', 'Lines'], ['surfaces', 'Surfaces'], ['dofs', 'DOFs'], ['fdd', 'FDD'], ['modes', 'Modes']];
  function buildTabs(w, v) {
    const tabs = v.root.querySelector('.geo-tabs');
    tabs.replaceChildren(...TABS.map(([k, l]) => { const b = h('button', { class: 'geo-tab' + (v.tab === k ? ' on' : '') }, l); b.onclick = () => { v.tab = k; buildTabs(w, v); refreshSide(w, v); }; return b; }));
  }
  const dofName = d => { const x = d.win != null && S.wins.get(d.win); return `${d.dir || '?'}@${d.node ?? '?'} ${x ? x.label : '(missing)'}`; };
  const nodeOpts = (p, val) => [h('option', { value: '' }, '–'), ...p.nodes.map(n => { const o = h('option', { value: n.id }, n.name ? `${n.id} ${n.name}` : String(n.id)); if (n.id === val) o.selected = true; return o; })];
  const setName = (n, t) => { const s = String(t || '').trim(); if (s) n.name = s.slice(0, 40); else delete n.name; };
  const btn = (label, run, title) => { const b = h('button', { class: 'geo-btn', title: title || '' }, label); b.onclick = e => UI.guard(run)(e); return b; };
  function table(heads, rows, widths) { // widths: fixed column widths ('64px'; null = the rest)
    const t = h('table', { class: 'geo-table' + (widths ? ' geo-fixed' : '') });
    if (widths) t.append(h('colgroup', {}, ...widths.map(x => h('col', x ? { style: 'width:' + x } : {}))));
    t.append(h('tr', {}, ...heads.map(x => h('th', {}, x))));
    rows.forEach(r => t.append(h('tr', {}, ...r.map(c => h('td', {}, c)))));
    return t;
  }
  function numIn(value, set) {
    const i = h('input', { class: 'geo-cell', type: 'number', step: 'any', value: fmt(value) });
    i.onchange = () => { const x = +i.value; if (isFinite(x) && i.value !== '') set(x); };
    i.addEventListener('keydown', e => e.stopPropagation());
    return i;
  }
  function refreshSide(w, v) {
    const p = P(w), pane = v.pane; pane.replaceChildren();
    if (v.tab === 'nodes') {
      pane.append(h('div', { class: 'geo-tools' },
        btn('+ Node', () => { const id = nextId(p); const last = p.nodes[p.nodes.length - 1]; p.nodes.push({ id, x: last ? last.x + 1 : 0, y: last ? last.y : 0, z: last ? last.z : 0 }); v.sel = id; refreshSide(w, v); changed(w, v); }),
        btn('Generate ▾', e => { e.stopPropagation(); UI.popupMenu(GENS.map(([k, l]) => ({ label: l + '…', run: () => generate(w, v, k) })), e.currentTarget); }, 'Grid, rectangle outline, box, circle, cylinder, truncated cone, beam'),
        btn('Rename…', () => renameDialog(w, v, v.sel), 'Change the number or the name of the selected node (or double-click it in the view, right-click it, or press F2)'),
        btn('Renumber…', () => renumberDialog(w, v), 'New node numbers from a start value with an increment'),
        btn('Paste…', () => pasteNodes(w, v), 'Paste "node, x, y, z" lines from a spreadsheet'),
        btn('Clear', async () => { if (await UI.confirmBox('Clear geometry', 'Remove all nodes, lines and surfaces? The DOF assignments stay without nodes.')) { p.nodes = []; p.lines = []; p.surfaces = []; p.dofs.forEach(d => { d.node = null; }); refreshSide(w, v); changed(w, v); } })));
      const rows = p.nodes.map(n => {
        const idIn = numIn(n.id, x => { x = Math.round(x); if (p.nodes.some(m => m.id === x)) { toast('Node ' + x + ' exists already', 'err'); refreshSide(w, v); return; } renameNode(p, n.id, x); if (v.sel === n.id) v.sel = x; refreshSide(w, v); changed(w, v); });
        const del = h('button', { class: 'geo-x', title: 'Delete the node with its lines and surfaces' }, '×'); del.onclick = () => removeNode(w, v, n.id);
        const nameIn = h('input', { class: 'geo-cell geo-wide', type: 'text', value: n.name || '', placeholder: '–', title: 'Name of the node, shown next to its number' });
        nameIn.onchange = () => { setName(n, nameIn.value); changed(w, v); }; nameIn.addEventListener('keydown', e => e.stopPropagation());
        return [idIn, nameIn, ...['x', 'y', 'z'].map(c => numIn(n[c], x => { n[c] = x; changed(w, v); })), del];
      });
      const t = table(['Node', 'Name', 'X', 'Y', 'Z', ''], rows, ['58px', '28%', null, null, null, '24px']);
      [...t.querySelectorAll('tr')].slice(1).forEach((tr, k) => {
        const id = p.nodes[k].id;
        if (id === v.sel) { tr.classList.add('on'); requestAnimationFrame(() => tr.scrollIntoView({ block: 'nearest' })); }
        tr.addEventListener('focusin', () => { if (v.sel === id) return; v.sel = id; t.querySelectorAll('tr.on').forEach(x => x.classList.remove('on')); tr.classList.add('on'); draw(w, v); }); // editing a row selects its node
      });
      pane.append(t);
    } else if (v.tab === 'lines') {
      pane.append(h('div', { class: 'geo-tools' }, btn('+ Line', () => { if (p.nodes.length < 2) throw new Error('Add at least two nodes first'); p.lines.push([p.nodes[0].id, p.nodes[1].id]); refreshSide(w, v); changed(w, v); }),
        h('span', { class: 'geo-hint' }, 'or the "Draw lines" tool in the view')));
      pane.append(table(['From', 'To', ''], p.lines.map((l, k) => [...[0, 1].map(j => { const s = h('select', { class: 'geo-cell' }, ...nodeOpts(p, l[j])); s.onchange = () => { l[j] = s.value === '' ? null : +s.value; changed(w, v); }; return s; }),
        (() => { const d = h('button', { class: 'geo-x' }, '×'); d.onclick = () => { p.lines.splice(k, 1); refreshSide(w, v); changed(w, v); }; return d; })()])));
    } else if (v.tab === 'surfaces') {
      pane.append(h('div', { class: 'geo-tools' }, btn('+ Surface', () => { if (p.nodes.length < 3) throw new Error('Add at least three nodes first'); p.surfaces.push(p.nodes.slice(0, 3).map(n => n.id)); refreshSide(w, v); changed(w, v); }),
        h('span', { class: 'geo-hint' }, 'or the "Draw surfaces" tool: click 3 or 4 nodes around a face')));
      pane.append(table(['1', '2', '3', '4', ''], p.surfaces.map((f, k) => [...[0, 1, 2, 3].map(j => { const s = h('select', { class: 'geo-cell' }, ...nodeOpts(p, f[j])); s.onchange = () => { if (s.value === '') f.splice(j, 1); else f[j] = +s.value; changed(w, v); }; return s; }),
        (() => { const d = h('button', { class: 'geo-x' }, '×'); d.onclick = () => { p.surfaces.splice(k, 1); refreshSide(w, v); changed(w, v); }; return d; })()])));
    } else if (v.tab === 'dofs') dofPane(w, v);
    else if (v.tab === 'fdd') fddPane(w, v);
    else if (v.tab === 'modes') modesPane(w, v);
  }
  const nextId = p => p.nodes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
  function freeNode(p) { const used = new Set(p.dofs.map(d => d.node)); const n = p.nodes.find(x => !used.has(x.id)); return n ? n.id : (p.nodes[0] ? p.nodes[0].id : null); }
  function renameNode(p, from, to) {
    p.nodes.forEach(n => { if (n.id === from) n.id = to; });
    p.lines.forEach(l => l.forEach((x, k) => { if (x === from) l[k] = to; }));
    p.surfaces.forEach(f => f.forEach((x, k) => { if (x === from) f[k] = to; }));
    p.dofs.forEach(d => { if (d.node === from) d.node = to; });
  }
  async function renameDialog(w, v, id) {
    const p = P(w), n = p.nodes.find(q => q.id === id);
    if (!n) throw new Error('Select a node first: click it in the view or its row in the table');
    const r = await dialog({ title: 'Rename node ' + n.id, intro: 'Lines, surfaces and channels follow a new number.', fields: [
      { key: 'id', label: 'Number', type: 'number', value: n.id, step: 1 },
      { key: 'name', label: 'Name', type: 'text', value: n.name || '', hint: 'optional, e.g. "Midspan north" – shown next to the number' }],
      validate: x => !Number.isInteger(x.id) ? 'The number must be a whole number' : x.id !== n.id && p.nodes.some(q => q.id === x.id) ? `Node ${x.id} exists already` : null, ok: 'Rename' });
    if (!r) return;
    if (r.id !== n.id) { const was = n.id; renameNode(p, was, r.id); if (v.sel === was) v.sel = r.id; }
    setName(n, r.name); refreshSide(w, v); changed(w, v);
  }
  async function renumberDialog(w, v) {
    const p = P(w); if (!p.nodes.length) throw new Error('There are no nodes to renumber');
    const r = await dialog({ title: 'Renumber nodes', intro: 'All nodes get new numbers; lines, surfaces and DOFs follow. To change one node, edit its number in the table.', fields: [
      { key: 'start', label: 'First number', type: 'number', value: 1, step: 1 }, { key: 'step', label: 'Increment', type: 'number', value: 1, min: 1, step: 1 },
      { key: 'order', label: 'Order', type: 'select', options: [['number', 'Current numbers'], ['x', 'By X, then Y, Z'], ['y', 'By Y, then X, Z'], ['z', 'By Z, then X, Y']], value: 'number' }],
      validate: x => !(x.step >= 1) ? 'The increment must be 1 or more' : null, ok: 'Renumber' });
    if (!r) return;
    const out = GM.renumber(p, p.dofs, { start: Math.round(r.start), step: Math.round(r.step), order: r.order });
    Object.assign(p, out.geo); p.dofs = out.dofs; if (v.sel != null) v.sel = out.map.get(v.sel) ?? null;
    refreshSide(w, v); changed(w, v); toast(`Renumbered ${p.nodes.length} nodes`);
  }

  /* ---------- DOFs ---------- */
  const signals = w => [...S.wins.values()].filter(x => x.kind === '1d' && x.data && x.data.y && x !== w);
  function dofPane(w, v) {
    const p = P(w), pane = v.pane, sigs = signals(w);
    pane.append(h('div', { class: 'geo-tools' },
      btn('+ DOF', () => { const used = new Set(p.dofs.map(d => d.win)), x = sigs.find(s => !used.has(s.id)) || sigs[0]; if (!x) throw new Error('Open the measured signals first'); p.dofs.push({ win: x.id, node: freeNode(p), dir: '+Z' }); syncParents(w, v); }),
      btn('Auto assign…', () => autoAssignDialog(w, v), 'Give the channels to the nodes one after the other, with one or more directions per node'),
      btn('Cylinder axis…', () => cylinderDialog(w, v), 'The axis for the radial (R), tangential (T) and axial (A) directions')));
    const dirOpts = d => GM.DIR_NAMES.map(x => { const o = h('option', { value: x, title: DIR_TITLES[x[1]] || '' }, x); if (x === d) o.selected = true; return o; });
    const maxSetup = Math.max(1, ...p.dofs.map(setupOf));
    pane.append(table(['Channel', 'Setup', 'Node', 'Dir.', 'Ref', ''], p.dofs.map((d, k) => {
      const cw = S.wins.get(d.win), ch = h('select', { class: 'geo-cell geo-wide', title: cw ? `${cw.label} ${cw.title}` : 'W' + d.win + ' (missing)' }, ...(sigs.some(s => s.id === d.win) ? [] : [h('option', { value: d.win }, 'W' + d.win + ' (missing)')]), ...sigs.map(s => { const o = h('option', { value: s.id }, `${s.label} ${s.title}`); if (s.id === d.win) o.selected = true; return o; }));
      ch.onchange = () => { d.win = +ch.value; syncParents(w, v); };
      const nd = h('select', { class: 'geo-cell' }, ...nodeOpts(p, d.node)); nd.onchange = () => { d.node = nd.value === '' ? null : +nd.value; changed(w, v); };
      const dr = h('select', { class: 'geo-cell', title: 'R, T, A: radial, tangential, axial on the cylinder axis' }, ...dirOpts(d.dir)); dr.onchange = () => { d.dir = dr.value; changed(w, v); };
      const rf = h('input', { type: 'checkbox', title: 'Reference channel: the phase reference of the ODS' }); rf.checked = !!d.ref;
      rf.onchange = () => { d.ref = rf.checked; if (d.ref) p.anim.ref = k; buildBar(w, v); changed(w, v); };
      const del = h('button', { class: 'geo-x' }, '×'); del.onclick = () => { p.dofs.splice(k, 1); if (p.anim.ref >= p.dofs.length) p.anim.ref = 0; syncParents(w, v); };
      const st = h('select', { class: 'geo-cell', title: 'Setup: channels with the same number were recorded at the same time. A roving test has several setups; they are combined through the nodes and directions they share (the reference sensors).' },
        ...Array.from({ length: maxSetup + 1 }, (_, i) => { const o = h('option', { value: i + 1 }, String(i + 1)); if (i + 1 === setupOf(d)) o.selected = true; return o; }));
      st.onchange = () => { d.setup = +st.value; v.shapeKey = null; APP.queueCompute(w); refreshSide(w, v); APP.emit(); };
      return [ch, st, nd, dr, rf, del];
    }), [null, '46px', p.nodes.some(n => n.name) ? '104px' : '64px', '58px', '30px', '24px']));
    const sets = [...new Set(p.dofs.map(setupOf))].sort((a, b) => a - b);
    if (sets.length > 1) {
      const keysOf = s => new Set(p.dofs.filter(d => setupOf(d) === s && d.node != null).map(d => d.node + '|' + d.dir)), ks = sets.map(keysOf);
      const everywhere = [...ks[0]].filter(k => ks.every(x => x.has(k)));
      const alone = sets.filter((s, i) => ![...ks[i]].some(k => ks.some((x, j) => j !== i && x.has(k))));
      pane.append(h('p', { class: 'geo-hint' }, `Roving test with ${sets.length} setups: ` + sets.map(s => `setup ${s}: ${p.dofs.filter(d => setupOf(d) === s).length} channels`).join(' · ') + '. ' +
        (everywhere.length ? `Measured in every setup: ${everywhere.map(k => k.replace('|', ' ')).join(', ')} – the setups' shapes are combined through these.` : 'No node and direction is measured in every setup; setups are combined through the ones they share.')));
      if (alone.length) pane.append(h('p', { class: 'geo-warn' }, alone.length > 1 ? `⚠ Setups ${alone.join(', ')} share no node and direction with any other setup, so they cannot be combined. Put their reference sensors on the reference nodes and directions.`
        : `⚠ Setup ${alone[0]} shares no node and direction with the other setups, so it cannot be combined. Put its reference sensors on the reference nodes and directions.`));
    }
    const c = p.cyl;
    pane.append(h('p', { class: 'geo-hint' }, c ? `Cylinder axis: ${c.axis} through (${fmt(c.x)}, ${fmt(c.y)}, ${fmt(c.z)})` : 'R / T / A use a vertical axis through the centre of the model (Cylinder axis… to change).'));
    if (v.issue) pane.append(h('p', { class: 'geo-warn' }, '⚠ ' + v.issue));
  }
  async function autoAssignDialog(w, v) {
    const p = P(w); if (!p.nodes.length) throw new Error('Make the geometry first: the channels are given to its nodes');
    const sigs = signals(w), used = new Set(p.dofs.map(d => d.win));
    if (!sigs.length) throw new Error('Open the measured signals first');
    const DIRSETS = [['+Z', 'One direction: +Z'], ['+Y', 'One direction: +Y'], ['+X', 'One direction: +X'], ['+X +Y +Z', 'Three directions: +X +Y +Z (triaxial)'], ['+X +Y', 'Two: +X +Y'], ['+Y +Z', 'Two: +Y +Z'], ['+X +Z', 'Two: +X +Z'], ['+R', 'Radial: +R'], ['+R +T +A', 'Radial, tangential, axial: +R +T +A'], ['custom', 'Other (type them)']];
    const maxSetup = Math.max(1, ...p.dofs.map(setupOf)), unassigned = sigs.filter(s => !used.has(s.id)).length;
    const preview = x => {
      try {
        const wins = (x.which === 'new' ? sigs.filter(s => !used.has(s.id)) : sigs).map(s => s.id), dirs = (x.dirs === 'custom' ? x.custom : x.dirs).split(/[\s,;]+/).filter(d => GM.DIR_NAMES.includes(d.toUpperCase())).map(d => d.toUpperCase());
        if (!dirs.length) return { error: 'Choose at least one direction' };
        const setup = Math.max(1, Math.round(x.setup || 1)), refIds = (String(x.refs || '').match(/\d+/g) || []).map(Number), keep = x.which === 'all' ? [] : p.dofs;
        // reference DOFs of the other setups (node, direction), in table order: a later setup's references go there
        const refDofs = []; keep.forEach(d => { if (d.ref && setupOf(d) !== setup && d.node != null && !refDofs.some(q => q.node === d.node && q.dir === d.dir)) refDofs.push({ node: d.node, dir: d.dir }); });
        const exclude = String(x.exclude || '').split(/[\s,;]+/).filter(Boolean).map(Number);
        if (x.skipDone) keep.forEach(d => { if (setupOf(d) !== setup && d.node != null) exclude.push(d.node); }); // roving: nodes measured in other setups
        const opts = { dirs, order: x.order, start: x.start ? Math.round(x.start) : null, exclude }, refWins = wins.filter(id => refIds.includes(id));
        let out;
        if (refWins.length && refDofs.length) out = refWins.map((id, i) => ({ win: id, node: i < refDofs.length ? refDofs[i].node : null, dir: i < refDofs.length ? refDofs[i].dir : dirs[0], ref: true }))
          .concat(GM.autoAssign(p, wins.filter(id => !refIds.includes(id)), opts));
        else { out = GM.autoAssign(p, wins, opts); out.forEach(d => { if (refIds.includes(d.win)) d.ref = true; }); }
        out.forEach(d => { d.setup = setup; });
        return { out, text: out.slice(0, 8).map(d => `${S.wins.get(d.win).label} → ${d.node ?? '—'} ${d.dir}${d.ref ? ' (ref)' : ''}`).join(' · ') + (out.length > 8 ? ` · … (${out.length})` : '') + (out.some(d => d.node == null) ? ' · not enough nodes for every channel' : '') };
      } catch (e) { return { error: e.message }; }
    };
    const r = await dialog({ title: 'Auto assign DOFs', intro: 'The channels are given to the nodes one after the other: each node gets the next channel for every direction.', fields: [
      { key: 'which', label: 'Channels', type: 'select', options: [['new', `Signals not assigned yet (${unassigned})`], ['all', `All open signals (${sigs.length}) – replaces the table`]], value: 'new' },
      { key: 'setup', label: 'Setup', type: 'number', value: p.dofs.length && unassigned ? maxSetup + 1 : maxSetup, step: 1, hint: 'channels recorded at the same time share a number; a roving test has one setup per position of the moving sensors' },
      { key: 'skipDone', label: 'Skip nodes measured in other setups', type: 'check', value: true, show: x => p.dofs.some(d => setupOf(d) !== Math.max(1, Math.round(x.setup || 1))) },
      { key: 'dirs', label: 'Directions per node', type: 'select', options: DIRSETS, value: '+Z' },
      { key: 'custom', label: 'Directions', type: 'text', value: '+X +Y +Z', show: x => x.dirs === 'custom', hint: '±X ±Y ±Z ±R ±T ±A, separated by spaces' },
      { key: 'order', label: 'Node order', type: 'select', options: [['number', 'Node numbers'], ['x', 'X, then Y, Z'], ['y', 'Y, then X, Z'], ['z', 'Z, then X, Y']], value: 'number' },
      { key: 'start', label: 'Start at node', type: 'number', value: p.nodes.slice().sort((a, b) => a.id - b.id)[0].id, step: 1 },
      { key: 'exclude', label: 'Skip nodes', type: 'text', value: '', hint: 'node numbers, e.g. supports: 1, 5, 9' },
      { key: 'refs', label: 'Reference channels', type: 'text', value: '', hint: 'window numbers of the reference sensors, e.g. W1 W2 – in a later setup they take the nodes and directions of the earlier setups\' references' },
      { type: 'info', label: 'Preview: –', key: 'pv' }],
      onChange: (x, inputs) => { const el = inputs.which.closest('form').querySelector('.dlg-info[data-key=pv]'), pv = preview(x); if (el) el.textContent = 'Preview: ' + (pv.error || pv.text); },
      validate: x => preview(x).error || null, ok: 'Assign' });
    if (!r) return;
    const pv = preview(r);
    p.dofs = r.which === 'all' ? pv.out : p.dofs.concat(pv.out);
    const ri = p.dofs.findIndex(d => d.ref); if (ri >= 0) p.anim.ref = ri;
    syncParents(w, v); toast(`Assigned ${pv.out.filter(d => d.node != null).length} channels`);
  }
  async function cylinderDialog(w, v) {
    const p = P(w), c = cylOf(p) || { x: 0, y: 0, z: 0, axis: 'Z' };
    const r = await dialog({ title: 'Cylinder axis', intro: 'Radial (R) points away from this axis, tangential (T) turns around it (right-handed), axial (A) runs along it. Use them for sensors on pipes, towers, tanks and rotors.', fields: [
      { key: 'axis', label: 'Axis parallel to', type: 'select', options: ['X', 'Y', 'Z'], value: c.axis },
      { key: 'x', label: 'Through X', type: 'number', value: +fmt(c.x) }, { key: 'y', label: 'Through Y', type: 'number', value: +fmt(c.y) }, { key: 'z', label: 'Through Z', type: 'number', value: +fmt(c.z) }],
      extra: [{ label: 'Centre of the model', run: (x, inp) => { const b = bounds(p.nodes); ['x', 'y', 'z'].forEach((k, i) => { inp[k].value = fmt(b.c[i]); }); } }], ok: 'Set' });
    if (!r) return;
    p.cyl = { axis: r.axis, x: r.x || 0, y: r.y || 0, z: r.z || 0 };
    refreshSide(w, v); changed(w, v);
  }
  // the channel windows of the DOFs are the node's parents
  function syncParents(w, v) {
    const ids = [...new Set(P(w).dofs.map(d => d.win))].filter(id => S.wins.has(id));
    for (const id of w.parents) { const x = S.wins.get(id); if (x) x.children.delete(w.id); }
    w.parents = ids; ids.forEach(id => S.wins.get(id).children.add(w.id));
    w.frozen = false; w.formerParents = null; w.updateTitle();
    refreshSide(w, v); buildBar(w, v); APP.queueCompute(w); APP.emit();
  }

  /* ---------- FDD ---------- */
  function fddPane(w, v) {
    const p = P(w), pane = v.pane;
    const seg = numIn(p.fdd.nseg, x => { p.fdd.nseg = Math.max(1, Math.min(64, Math.round(x))); APP.queueCompute(w); });
    pane.append(h('div', { class: 'geo-tools' }, h('span', { class: 'geo-hint' }, 'Averaged segments'), seg));
    if (!p.dofs.length) { pane.append(h('p', { class: 'geo-hint' }, 'Assign the measured channels in the DOFs tab first.')); return; }
    const S2 = spectra(w, v);
    if (!S2 || !v.sv) { pane.append(h('p', { class: 'geo-warn' }, v.issue ? '⚠ ' + v.issue : 'Waiting for the channel data…')); return; }
    pane.append(h('p', { class: 'geo-hint' }, v.G && v.G.length > 1
      ? `${v.G.length} setups (${v.G.map(g => g.ks.length).join(' + ')} channels): the average of their normalised first singular values (thick) and each setup's (thin) – Δf = ${fmt(v.df)} Hz.`
      : `Singular values of the ${S2.n}×${S2.n} spectral matrix (${S2.seg} segments of ${S2.L} samples, Δf = ${fmt(v.df)} Hz).`));
    const rangeLab = h('span', { class: 'geo-hint' }), whole = btn('Whole range', () => setSvZoom(w, v, null), 'Show all frequencies again (or double-click the plot)');
    pane.append(h('div', { class: 'geo-tools' }, h('b', { class: 'geo-lab' }, 'Showing'), rangeLab, h('span', { class: 'geo-sep' }), whole));
    const cv = h('canvas', { class: 'geo-svd' }); pane.append(cv);
    pane.append(h('p', { class: 'geo-hint' }, 'Click a peak to animate its mode shape. Zoom: drag over a frequency range or turn the wheel; Shift+drag moves the range; double-click shows the whole range.'));
    const chips = h('div', { class: 'geo-peaks' }); pane.append(chips);
    v.svCanvas = cv;
    v.fddUpdate = () => { // the range shown, the plot and the peaks inside the range
      if (!v.sv) return;
      const [f0, f1] = svRange(v), n = v.sv[0].length, a = P(w).anim;
      rangeLab.textContent = `${fmt(+f0.toFixed(3))} – ${fmt(+f1.toFixed(3))} Hz${v.svZoom ? '' : ' (whole range)'}`; whole.disabled = !v.svZoom;
      const pk = fddPeakBins(v);
      chips.replaceChildren(h('span', { class: 'geo-lab' }, pk.length ? (v.svZoom ? 'Peaks in this range' : 'Peaks') : 'No clear peaks in this range'),
        ...pk.map(b => { const f = b * v.df, on = (a.mode === 'fdd' || a.mode === 'ods') && Math.abs(f - a.freq) < v.df / 2;
          const c = h('button', { class: 'geo-chip' + (on ? ' on' : ''), title: 'Animate the shape at this frequency' }, fmt(+f.toFixed(3)) + ' Hz'); c.onclick = () => pickFreq(w, v, f); return c; }));
      plotSV(w, v, cv);
    };
    requestAnimationFrame(() => v.fddUpdate());
    wireSV(w, v, cv);
  }
  // the FDD plot: drag over a range to zoom in, wheel to zoom, Shift+drag to move the range, double-click for all of it
  function wireSV(w, v, cv) {
    const top = () => v.df * (v.sv[0].length - 1);
    const fAt = e => { const r = cv.getBoundingClientRect(), m = v.svMap; return m ? m.f0 + (e.clientX - r.left - m.L) / (r.width - m.L - m.R) * (m.f1 - m.f0) : 0; };
    let drag = null;
    cv.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !v.svMap) return;
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, f: fAt(e), pan: e.shiftKey, range: svRange(v), moved: false };
    });
    cv.addEventListener('pointermove', e => {
      if (!v.svMap) return;
      const f = fAt(e);
      if (!drag) { plotSV(w, v, cv, { hover: f }); return; }
      if (Math.abs(e.clientX - drag.x) > 4) drag.moved = true;
      if (!drag.moved) return;
      if (drag.pan) {
        const [a, b] = drag.range, m = v.svMap, T = top(), shift = -(e.clientX - drag.x) / (cv.clientWidth - m.L - m.R) * (b - a);
        let a2 = a + shift, b2 = b + shift; if (a2 < 0) { b2 -= a2; a2 = 0; } if (b2 > T) { a2 -= b2 - T; b2 = T; }
        v.svZoom = b2 - a2 >= T ? null : [Math.max(0, a2), b2]; plotSV(w, v, cv);
      } else plotSV(w, v, cv, { band: [Math.min(drag.f, f), Math.max(drag.f, f)] });
    });
    cv.addEventListener('pointerleave', () => { if (!drag) plotSV(w, v, cv); });
    cv.addEventListener('pointerup', e => {
      const d = drag; drag = null; if (!d) return;
      const f = fAt(e);
      if (d.moved && d.pan) { v.fddUpdate(); return; }
      if (d.moved) { const a = Math.max(0, Math.min(d.f, f)), b = Math.min(top(), Math.max(d.f, f)); if (b - a >= 4 * v.df) setSvZoom(w, v, [a, b]); else plotSV(w, v, cv); return; }
      // a click: the highest first singular value within 6 pixels
      const m = v.svMap, n = v.sv[0].length, perPx = (m.f1 - m.f0) / (cv.clientWidth - m.L - m.R), reach = Math.max(1, Math.round(6 * perPx / v.df)), b0 = Math.round(f / v.df);
      if (!(b0 >= 1 && b0 < n) || f < m.f0 || f > m.f1) return;
      let b = b0; for (let k = Math.max(1, b0 - reach); k <= Math.min(n - 1, b0 + reach); k++) if (v.sv[0][k] > v.sv[0][b]) b = k;
      pickFreq(w, v, b * v.df);
    });
    cv.addEventListener('wheel', e => {
      if (!v.svMap) return;
      e.preventDefault();
      const f = fAt(e), [f0, f1] = svRange(v), k = Math.exp(e.deltaY * 0.0015), T = top();
      let a = f - (f - f0) * k, b = f + (f1 - f) * k;
      if (b - a < 8 * v.df) return;
      if (b - a >= T) { setSvZoom(w, v, null); return; }
      if (a < 0) { b -= a; a = 0; } if (b > T) { a -= b - T; b = T; }
      setSvZoom(w, v, [Math.max(0, a), b]);
    }, { passive: false });
    cv.addEventListener('dblclick', () => setSvZoom(w, v, null));
  }
  function fddPeakBins(v) { // the FDD peaks (bins) inside the frequency range shown
    const [f0, f1] = svRange(v), n = v.sv[0].length, i0 = Math.max(1, Math.floor(f0 / v.df)), i1 = Math.min(n - 1, Math.ceil(f1 / v.df));
    return i1 - i0 >= 8 ? GM.peaks(v.sv[0].slice(i0, i1 + 1), 10, 3).map(b => b + i0) : [];
  }
  function setSvZoom(w, v, z) { v.svZoom = z; if (v.fddUpdate && v.svCanvas && v.svCanvas.isConnected) v.fddUpdate(); }
  const svRange = v => { const T = v.df * (v.sv[0].length - 1), z = v.svZoom; return z ? [Math.max(0, z[0]), Math.min(T, z[1])] : [0, T]; };
  function pickFreq(w, v, f) {
    const a = P(w).anim; a.freq = f; if (a.mode !== 'ods' && a.mode !== 'fdd') a.mode = 'fdd';
    if (a.style === 'sweep') a.style = 'dwell';
    a.playing = a.style !== 'static'; v.shapeKey = null; buildBar(w, v);
    if (v.tab === 'fdd' && v.fddUpdate && v.svCanvas && v.svCanvas.isConnected) v.fddUpdate(); else refreshSide(w, v); // the plot keeps its zoom
    loop(w, v); draw(w, v);
  }
  const niceStep = span => { const p = Math.pow(10, Math.floor(Math.log10(span / 5))), m = span / 5 / p; return p * (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10); };
  // o: {hover: frequency under the mouse, band: [f0, f1] being selected}
  function plotSV(w, v, cv, o = {}) {
    if (!v.sv || !cv.isConnected) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 260, H = cv.clientHeight || 210;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d'), cs = getComputedStyle(v.root), ink = cs.getPropertyValue('--geo-ink').trim() || '#222', muted = cs.getPropertyValue('--geo-muted').trim() || '#888';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (v.svDbOf !== v.sv) { v.svDb = v.sv.map(s => Float64Array.from(s, x => 10 * Math.log10(Math.max(x, 1e-30)))); v.svDbOf = v.sv; }
    const db = v.svDb, n = db[0].length, [f0, f1] = svRange(v), L = 42, R = 8, T = 8, B = 18;
    const i0 = Math.max(1, Math.floor(f0 / v.df)), i1 = Math.min(n - 1, Math.ceil(f1 / v.df));
    let hi = -Infinity, lo = Infinity; // the level range follows the frequencies shown
    for (const s of db) for (let i = i0; i <= i1; i++) { if (s[i] > hi) hi = s[i]; if (s[i] < lo) lo = s[i]; }
    lo = Math.max(lo, hi - 100) - 3; hi += 3; if (hi - lo < 12) lo = hi - 12;
    const X = f => L + (f - f0) / ((f1 - f0) || 1) * (W - L - R), Y = d => T + (hi - Math.max(lo, Math.min(hi, d))) / (hi - lo) * (H - T - B);
    v.svMap = { f0, f1, L, R };
    ctx.font = '9px sans-serif'; ctx.lineWidth = 0.5;
    const ds = niceStep(hi - lo), fs = niceStep(f1 - f0);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let d = Math.ceil(lo / ds) * ds; d <= hi; d += ds) { ctx.strokeStyle = muted; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(L, Y(d)); ctx.lineTo(W - R, Y(d)); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = muted; ctx.fillText(fmt(+d.toFixed(6)) + ' dB', L - 3, Y(d)); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let f = Math.ceil(f0 / fs) * fs; f <= f1 + fs * 1e-6; f += fs) { ctx.strokeStyle = muted; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(X(f), T); ctx.lineTo(X(f), H - B); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = muted; ctx.fillText(fmt(+f.toFixed(6)), X(f), H - B + 3); }
    ctx.strokeStyle = muted; ctx.strokeRect(L, T, W - L - R, H - T - B);
    if (o.band) { const xa = X(Math.max(f0, o.band[0])), xb = X(Math.min(f1, o.band[1])); ctx.fillStyle = 'rgba(24,131,215,.18)'; ctx.fillRect(xa, T, xb - xa, H - T - B); ctx.strokeStyle = '#1883d7'; ctx.strokeRect(xa, T, xb - xa, H - T - B); }
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, W - L - R, H - T - B); ctx.clip();
    const multi = v.G && v.G.length > 1, cols = multi ? ['#c00', '#06c', '#2a2', '#a0a', '#e08000', '#088', '#777', '#b59a00'] : ['#c00', '#06c', '#2a2'];
    cols.forEach((col, k) => {
      if (!db[k]) return; ctx.strokeStyle = col; ctx.lineWidth = k ? 0.8 : multi ? 1.8 : 1.3; ctx.beginPath();
      for (let i = Math.max(1, i0 - 1), first = true; i <= Math.min(n - 1, i1 + 1); i++, first = false) { const x = X(i * v.df), y = Y(db[k][i]); first ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    });
    const a = P(w).anim;
    if ((a.mode === 'ods' || a.mode === 'fdd') && a.freq >= f0 && a.freq <= f1) { ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.moveTo(X(a.freq), T); ctx.lineTo(X(a.freq), H - B); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
    if (multi) { // legend
      ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; let x = L + 4;
      ['average', ...v.G.map(g => 'setup ' + g.setup)].forEach((t, k) => { if (k >= cols.length) return; ctx.fillStyle = cols[k]; ctx.fillRect(x, T + 6, 10, k ? 1 : 2); ctx.fillText(t, x + 12, T + 2); x += ctx.measureText(t).width + 22; });
    }
    if (o.hover != null && o.hover >= f0 && o.hover <= f1) { // readout of the first singular value under the mouse
      const k = Math.max(1, Math.min(n - 1, Math.round(o.hover / v.df))), x = X(k * v.df), t = `${fmt(+(k * v.df).toFixed(4))} Hz · ${db[0][k].toFixed(1)} dB`;
      ctx.strokeStyle = '#1883d7'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, H - B); ctx.stroke();
      ctx.font = '10px sans-serif'; const tw = ctx.measureText(t).width + 8;
      ctx.fillStyle = cs.getPropertyValue('--geo-bg').trim() || '#fff'; ctx.globalAlpha = 0.9; ctx.fillRect(W - R - tw - 2, T + 2, tw, 15); ctx.globalAlpha = 1;
      ctx.fillStyle = ink; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(t, W - R - 6, T + 4);
    }
  }

  /* ---------- Modes: frequency and damping by Enhanced FDD, MAC, export ---------- */
  function efddSpectra(w, v) { // the spectral matrix for damping, with its own (finer) frequency resolution
    const p = P(w);
    if (v.issue) throw new Error(v.issue);
    if (!v.chan || !v.chan.some(Boolean)) throw new Error('The channels are still being read – try again in a moment');
    if (v.SeOf !== v.chan || v.SeSeg !== p.efdd.nseg) { // one spectral matrix per setup
      v.Se = channelGroups(w, v).map(g => Object.assign(g, { S: GM.csdMatrix(g.ys, p.efdd.nseg) }));
      v.Se.forEach(g => { g.df = v.fs / g.S.L; });
      v.SeOf = v.chan; v.SeSeg = p.efdd.nseg;
    }
    return v.Se;
  }
  const round6 = x => +(+x).toPrecision(6);
  // every mode in every setup; with several setups: mean frequency and damping, and the setups' shapes combined
  // through the DOFs they share
  function identifyModes(w, v, freqs) {
    const p = P(w), groups = efddSpectra(w, v), gridDf = v.df || groups[0].df, multi = groups.length > 1;
    const raw = freqs.map(f => groups.map(g => GM.efdd(g.S, f / g.df, v.fs, Object.assign({ search: Math.max(1, Math.ceil(gridDf / g.df)) }, p.efdd))));
    const res = raw.filter((rs, i) => raw.findIndex(q => q[0].bin === rs[0].bin) === i).sort((a, b) => a[0].bin - b[0].bin); // two picks on one peak: once
    const mean = a => a.reduce((s, x) => s + x, 0) / a.length, sd = a => a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)) : null;
    p.modes = res.map(rs => {
      const fin = rs.filter(r => Number.isFinite(r.zeta)), fPeak = mean(rs.map(r => r.fPeak)), fds = rs.map(r => r.fd).filter(Number.isFinite);
      const m = multi ? GM.mergeShapes(rs.map((r, gi) => ({ keys: groups[gi].ks.map(k => dofKey(p.dofs[k], k)), shape: r.shape }))) : null, at = m && new Map(m.keys.map((k, i) => [k, i]));
      const shapeAt = (k, part) => { if (!m) { const j = groups[0].ks.indexOf(k); return j >= 0 ? round6(rs[0].shape[part][j]) : 0; } const i = at.get(dofKey(p.dofs[k], k)); return i == null ? 0 : round6(m[part][i]); };
      return { f0: round6(freqs.reduce((best, f) => Math.abs(f - fPeak) < Math.abs(best - fPeak) ? f : best, freqs[0])), fPeak: round6(fPeak),
        f: round6(mean(rs.map(r => r.f))), fd: round6(fds.length ? mean(fds) : mean(rs.map(r => r.f))), zeta: fin.length ? round6(mean(fin.map(r => r.zeta))) : null,
        r2: fin.length ? round6(Math.min(...fin.map(r => r.r2))) : null, n: Math.min(...rs.map(r => r.n)), bins: rs[0].bins,
        band: rs[0].band.map(round6), note: rs.map(r => r.note).find(Boolean) || null,
        shape: { re: p.dofs.map((_, k) => shapeAt(k, 're')), im: p.dofs.map((_, k) => shapeAt(k, 'im')) },
        setups: m ? rs.map((r, gi) => ({ setup: groups[gi].setup, f: round6(r.f), zeta: Number.isFinite(r.zeta) ? round6(r.zeta) : null, r2: Number.isFinite(r.r2) ? round6(r.r2) : null,
          shared: m.shared[gi] || 0, refMac: m.refMac[gi] != null ? round6(m.refMac[gi]) : null, combined: !m.unmerged.includes(gi) })) : null,
        spread: m ? { f: round6(sd(rs.map(r => r.f)) || 0), zeta: fin.length > 1 ? round6(sd(fin.map(r => r.zeta))) : null } : null };
    });
    const g0 = groups[0];
    p.modesInfo = { at: new Date().toISOString(), setups: groups.length, channels: groups.reduce((s, g) => s + g.ks.length, 0),
      seconds: round6(Math.min(...groups.map(g => Math.min(...g.ys.map(y => y.length)))) / v.fs), fs: round6(v.fs), df: round6(g0.df), L: g0.S.L, seg: g0.S.seg,
      macMin: p.efdd.macMin, hi: p.efdd.hi, lo: p.efdd.lo, window: p.efdd.window };
    v.modeCorr = res.map(rs => rs[0].corr); v.modesOf = v.chan; v.modeSel = Math.min(v.modeSel || 0, Math.max(0, p.modes.length - 1));
    APP.emit();
    return p.modes;
  }
  function modesPane(w, v) {
    const p = P(w), pane = v.pane, ms = p.modes;
    pane.append(h('div', { class: 'geo-tools' },
      btn('Identify modes', () => identifyFromPeaks(w, v), 'Find the peaks in the frequency range shown in the FDD tab, then estimate each mode\'s natural frequency and damping (Enhanced FDD)'),
      btn('+ Current', () => addCurrentMode(w, v), 'Add the mode at the frequency being animated (pick it in the FDD tab)'),
      btn('Settings…', () => efddDialog(w, v), 'Frequency resolution, MAC level and correlation range of the damping estimate'),
      btn('Copy', () => copyModes(w), 'Copy the table (tab-separated, for Excel or Word)'),
      btn('Excel…', () => exportModes(w, v), 'Save modes, MAC matrix, mode shapes and settings as an Excel workbook (.xlsx)')));
    if (!p.dofs.length) { pane.append(h('p', { class: 'geo-hint' }, 'Assign the measured channels in the DOFs tab first.')); return; }
    if (!ms.length) { pane.append(h('p', { class: 'geo-hint' }, 'Press "Identify modes" (or ▶ Run) to estimate the natural frequency and damping of each peak of the FDD tab. Zoom the FDD plot first to limit the range.')); return; }
    const info = p.modesInfo;
    if (info) pane.append(h('p', { class: 'geo-hint' }, `${info.setups > 1 ? info.setups + ' setups, ' : ''}${info.channels} channels · ${fmt(info.seconds)} s at ${fmt(info.fs)} Hz · Δf ${fmt(info.df)} Hz (${info.seg} segments of ${info.L})` +
      (v.modesOf !== v.chan ? ` · from ${new Date(info.at).toLocaleString()} – press Identify modes to update` : '')));
    // the table: click a row to animate the mode and see its correlation function
    const a = p.anim;
    const rows = ms.map((m, k) => {
      const fit = m.note ? h('span', { class: 'geo-warn', title: m.note }, '⚠') : h('span', { title: `${m.n} extremes of the correlation, fitted with R² ${m.r2 != null ? m.r2.toFixed(3) : '–'}; bell of ${m.bins} bins (${fmt(m.band[0])} – ${fmt(m.band[1])} Hz)` }, m.r2 != null ? m.r2.toFixed(3) : '–');
      const del = h('button', { class: 'geo-x', title: 'Remove this mode' }, '×'); del.onclick = e => { e.stopPropagation(); ms.splice(k, 1); if (v.modeCorr) v.modeCorr.splice(k, 1); v.modeSel = 0; refreshSide(w, v); APP.emit(); };
      const zt = Number.isFinite(m.zeta) ? (m.zeta * 100).toFixed(2) : '–', perSetup = m.setups ? m.setups.map(s => `Setup ${s.setup}: ${s.f.toFixed(3)} Hz, ${s.zeta != null ? (s.zeta * 100).toFixed(2) + ' %' : '–'}`).join('\n') : '';
      const zc = m.setups ? h('span', { title: perSetup + (m.spread && m.spread.zeta != null ? `\nspread: ±${(m.spread.zeta * 100).toFixed(2)} %` : '') }, zt + (m.spread && m.spread.zeta != null ? ` ±${(m.spread.zeta * 100).toFixed(2)}` : '')) : zt;
      return [String(k + 1), m.f.toFixed(3), zc, m.fPeak.toFixed(3), fit, del];
    });
    const t = table(['Mode', 'f (Hz)', 'Damping (%)', 'FDD peak', 'Fit R²', ''], rows, ['44px', null, null, null, '56px', '24px']);
    t.classList.add('geo-modes');
    [...t.querySelectorAll('tr')].slice(1).forEach((tr, k) => {
      if (k === v.modeSel) tr.classList.add('on');
      const playing = (a.mode === 'fdd' || a.mode === 'ods') && Math.abs(ms[k].fPeak - a.freq) <= 1.5 * Math.max(v.df || 0, 1e-9);
      if (playing) tr.classList.add('playing');
      tr.title = 'Click to animate this mode';
      tr.addEventListener('click', () => { v.modeSel = k; pickFreq(w, v, ms[k].f0 || ms[k].fPeak); refreshSide(w, v); });
    });
    pane.append(t);
    if (ms.some(m => m.setups)) { // how well the setups fitted together
      const macs = ms.flatMap(m => (m.setups || []).map(s => s.refMac).filter(x => x != null)), lone = [...new Set(ms.flatMap(m => (m.setups || []).filter(s => !s.combined).map(s => s.setup)))];
      pane.append(h('p', { class: 'geo-hint' }, `Mean of the setups (damping: ± spread between them); shapes combined through the shared DOFs` +
        (macs.length ? ` – their agreement (MAC) ${Math.min(...macs).toFixed(3)} at worst (1 = perfect)` : ' (fewer than two shared DOFs: no check of the agreement)') + '. Point at a damping value for each setup.'));
      if (lone.length) pane.append(h('p', { class: 'geo-warn' }, `⚠ Setup ${lone.join(', ')} shares no DOF with the others and is left out of the shapes.`));
      else if (macs.length && Math.min(...macs) < 0.9) pane.append(h('p', { class: 'geo-warn' }, '⚠ The reference DOFs disagree between setups for some modes (MAC < 0.9): check the reference sensors\' nodes and directions, or that the mode is seen in every setup.'));
    }
    // MAC matrix
    if (ms.length > 1) {
      const M = GM.macMatrix(ms.map(m => ({ re: Float64Array.from(m.shape.re), im: Float64Array.from(m.shape.im) })));
      const mt = h('table', { class: 'geo-mac', title: 'MAC between the mode shapes: 1 = the same shape, 0 = unrelated. High values away from the diagonal: modes that look alike (too few sensors, or one mode found twice).' },
        h('tr', {}, h('th', {}, 'MAC'), ...ms.map((_, j) => h('th', {}, String(j + 1)))),
        ...M.map((row, i) => h('tr', {}, h('th', {}, String(i + 1)), ...row.map((x, j) => {
          const c = h('td', {}, x.toFixed(2)); c.style.background = i === j ? 'rgba(24,131,215,.55)' : `rgba(${x > 0.9 ? '200,40,40' : '24,131,215'},${(0.08 + 0.6 * x).toFixed(2)})`;
          return c;
        }))));
      pane.append(h('p', { class: 'geo-hint' }, 'MAC matrix of the mode shapes'), mt);
    }
    // the selected mode's correlation function with the fitted decay
    const corr = v.modesOf === v.chan && v.modeCorr && v.modeCorr[v.modeSel];
    if (corr) {
      pane.append(h('p', { class: 'geo-hint' }, `Mode ${v.modeSel + 1}${ms[v.modeSel] && ms[v.modeSel].setups ? ' (setup ' + ms[v.modeSel].setups[0].setup + ')' : ''}: correlation function (normalised); dots: the extremes fitted, dashed: the decay e^(−ζωt)`));
      const cv = h('canvas', { class: 'geo-svd geo-corr' }); pane.append(cv);
      requestAnimationFrame(() => plotCorr(v, cv, corr));
    } else pane.append(h('p', { class: 'geo-hint' }, 'Press Identify modes to see the correlation functions.'));
  }
  function plotCorr(v, cv, c) {
    if (!cv.isConnected) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, H = cv.clientHeight || 170;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d'), cs = getComputedStyle(v.root), ink = cs.getPropertyValue('--geo-ink').trim() || '#222', muted = cs.getPropertyValue('--geo-muted').trim() || '#888';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const L = 34, R = 8, T = 8, B = 18, last = c.ext.length ? c.ext[c.ext.length - 1].t : c.r.length - 1, nMax = Math.min(c.r.length - 1, Math.ceil(last * 1.25) + 2);
    const X = n => L + n / nMax * (W - L - R), Y = y => T + (1 - y) / 2 * (H - T - B);
    ctx.font = '9px sans-serif'; ctx.strokeStyle = muted; ctx.lineWidth = 0.5; ctx.strokeRect(L, T, W - L - R, H - T - B);
    ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; [1, 0, -1].forEach(y => ctx.fillText(String(y), L - 3, Y(y)));
    ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(W - R, Y(0)); ctx.stroke(); ctx.globalAlpha = 1;
    const ts = niceStep(nMax / c.fs); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = 0; t <= nMax / c.fs + 1e-9; t += ts) ctx.fillText(fmt(+t.toFixed(6)) + (t ? '' : ' s'), X(t * c.fs), H - B + 3);
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, W - L - R, H - T - B); ctx.clip();
    ctx.strokeStyle = '#c00'; ctx.lineWidth = 1; ctx.beginPath(); for (let n = 0; n <= nMax; n++) n ? ctx.lineTo(X(n), Y(c.r[n])) : ctx.moveTo(X(n), Y(c.r[n])); ctx.stroke();
    if (c.fit) { ctx.strokeStyle = ink; ctx.setLineDash([4, 3]); for (const sg of [1, -1]) { ctx.beginPath(); for (let n = 0; n <= nMax; n += Math.max(1, Math.round(nMax / 200))) { const y = sg * Math.exp(c.fit.a + c.fit.b * n); n ? ctx.lineTo(X(n), Y(y)) : ctx.moveTo(X(n), Y(y)); } ctx.stroke(); } ctx.setLineDash([]); }
    ctx.fillStyle = '#1883d7'; for (const e of c.ext) { const n = Math.round(e.t), s = c.r[n] >= 0 ? 1 : -1; ctx.beginPath(); ctx.arc(X(e.t), Y(s * e.v), 2.2, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function identifyFromPeaks(w, v) {
    spectra(w, v);
    if (!v.sv) throw new Error(v.issue || 'The spectra of the channels could not be calculated');
    const bins = fddPeakBins(v);
    if (!bins.length) throw new Error('No clear peaks in the frequency range shown in the FDD tab');
    identifyModes(w, v, bins.map(b => b * v.df)); v.modeSel = 0;
    refreshSide(w, v); buildBar(w, v);
    const ms = P(w).modes; toast(`${ms.length} mode${ms.length === 1 ? '' : 's'}: ` + ms.map(m => `${m.f.toFixed(2)} Hz (${Number.isFinite(m.zeta) ? (m.zeta * 100).toFixed(2) + ' %' : '–'})`).join(', '));
  }
  function addCurrentMode(w, v) {
    const p = P(w), a = p.anim;
    if (!((a.mode === 'fdd' || a.mode === 'ods') && a.freq > 0)) throw new Error('Pick a frequency first: click a peak in the FDD tab');
    spectra(w, v);
    identifyModes(w, v, p.modes.map(m => m.f0 || m.fPeak).concat([a.freq]));
    v.modeSel = Math.max(0, p.modes.findIndex(m => Math.abs(m.fPeak - a.freq) <= 2 * Math.max(v.df || 0, 1e-9)));
    refreshSide(w, v); buildBar(w, v);
  }
  async function efddDialog(w, v) {
    const p = P(w), e = p.efdd, n = v.len || 0, Lof = seg => { let L = 16; while (L * 2 <= Math.min(n, 2 * n / (seg + 1))) L *= 2; return L; };
    const res = seg => n && v.fs ? `Δf = ${fmt(v.fs / Lof(seg))} Hz (segments of ${Lof(seg)} samples)` : '';
    const r = await dialog({ title: 'Damping estimate (Enhanced FDD)', intro: 'Each mode\'s bell around its peak is turned into a correlation function; its decay gives the damping, its zero crossings the frequency.', fields: [
      { key: 'nseg', label: 'Averaged segments', type: 'number', value: e.nseg, min: 1, step: 1, hint: 'fewer: finer frequency resolution (better for light damping), more: smoother curves' },
      { type: 'info', key: 'res', label: res(e.nseg) },
      { key: 'macMin', label: 'MAC level of the bell', type: 'number', value: e.macMin, hint: 'the bins around a peak whose shape is at least this like the peak\'s' },
      { key: 'hi', label: 'Fit correlation from', type: 'number', value: e.hi },
      { key: 'lo', label: 'down to', type: 'number', value: e.lo, hint: 'the extremes of the normalised correlation used for the fit' },
      { key: 'window', label: 'Correct for the analysis window (recommended)', type: 'check', value: e.window }],
      onChange: (x, inputs) => { const el = inputs.nseg.closest('form').querySelector('.dlg-info[data-key=res]'); if (el && x.nseg >= 1) el.textContent = res(Math.round(x.nseg)); },
      validate: x => !(x.nseg >= 1) ? 'At least one segment' : !(x.macMin >= 0.3 && x.macMin < 1) ? 'The MAC level is between 0.3 and 1' : !(x.hi > x.lo && x.lo > 0 && x.hi <= 1) ? 'The fit range runs from a higher to a lower level, between 0 and 1' : null,
      extra: [{ label: 'Defaults', run: (x, inp) => { const d = defaults().efdd; ['nseg', 'macMin', 'hi', 'lo'].forEach(k => { inp[k].value = d[k]; }); inp.window.checked = d.window; } }], ok: 'Apply' });
    if (!r) return;
    Object.assign(e, { nseg: Math.round(r.nseg), macMin: r.macMin, hi: r.hi, lo: r.lo, window: r.window });
    if (p.modes.length) { identifyModes(w, v, p.modes.map(m => m.f0 || m.fPeak)); toast('Modes updated with the new settings'); }
    refreshSide(w, v); buildBar(w, v);
  }
  function modeRows(p) {
    const multi = p.modes.some(m => m.spread);
    return [['Mode', 'Frequency (Hz)', 'Damping ratio (%)', 'Damped frequency (Hz)', 'FDD peak (Hz)', 'Fit R²', 'Extremes used', 'Bell from (Hz)', 'Bell to (Hz)', 'Note', ...(multi ? ['Frequency spread (Hz)', 'Damping spread (%)', 'Setups'] : [])],
      ...p.modes.map((m, k) => [k + 1, { v: m.f, fmt: '0.000' }, { v: Number.isFinite(m.zeta) ? m.zeta * 100 : null, fmt: '0.00' }, { v: m.fd, fmt: '0.000' }, { v: m.fPeak, fmt: '0.000' },
        { v: m.r2, fmt: '0.000' }, m.n, { v: m.band[0], fmt: '0.000' }, { v: m.band[1], fmt: '0.000' }, m.note || '',
        ...(multi ? [{ v: m.spread ? m.spread.f : null, fmt: '0.000' }, { v: m.spread && m.spread.zeta != null ? m.spread.zeta * 100 : null, fmt: '0.00' }, m.setups ? m.setups.length : 1] : [])])];
  }
  async function copyModes(w) {
    const p = P(w); if (!p.modes.length) throw new Error('No modes yet – press Identify modes');
    const txt = modeRows(p).map(r => r.map(c => { const x = c !== null && typeof c === 'object' ? c.v : c; return x == null ? '' : typeof x === 'number' ? String(+x.toPrecision(8)) : x; }).join('\t')).join('\r\n');
    await navigator.clipboard.writeText(txt); toast('Mode table copied – paste it into Excel or Word');
  }
  function exportModes(w, v) {
    const p = P(w), ms = p.modes; if (!ms.length) throw new Error('No modes yet – press Identify modes');
    const head = ms.map((m, k) => `Mode ${k + 1} (${m.f.toFixed(3)} Hz)`);
    const M = GM.macMatrix(ms.map(m => ({ re: Float64Array.from(m.shape.re), im: Float64Array.from(m.shape.im) })));
    const dofName = d => { const x = S.wins.get(d.win); return x ? x.title : 'W' + d.win; }, nodeName = id => { const n = p.nodes.find(q => q.id === id); return n && n.name ? `${id} ${n.name}` : id; };
    const info = p.modesInfo || {};
    const book = [
      { name: 'Modes', rows: modeRows(p), widths: [7, 15, 17, 21, 14, 9, 14, 14, 13, 40] },
      { name: 'MAC', rows: [['MAC', ...head], ...M.map((row, i) => [head[i], ...row.map(x => ({ v: x, fmt: '0.000' }))])], widths: [20, ...head.map(() => 18)] },
      { name: 'Mode shapes', rows: [['Channel', 'Node', 'Direction', ...head], ...p.dofs.map((d, k) => [dofName(d), nodeName(d.node) ?? '', d.dir, ...ms.map(m => ({ v: m.shape.re[k], fmt: '0.000' }))])],
        widths: [28, 18, 10, ...head.map(() => 18)] },
      ...(ms.some(m => m.setups) ? [{ name: 'Setups', widths: [7, 7, 15, 17, 9, 12, 20, 11], rows: [['Mode', 'Setup', 'Frequency (Hz)', 'Damping ratio (%)', 'Fit R²', 'Shared DOFs', 'Agreement of shared DOFs (MAC)', 'Combined'],
        ...ms.flatMap((m, k) => (m.setups || []).map(s => [k + 1, s.setup, { v: s.f, fmt: '0.000' }, { v: s.zeta != null ? s.zeta * 100 : null, fmt: '0.00' }, { v: s.r2, fmt: '0.000' }, s.shared, { v: s.refMac, fmt: '0.000' }, s.combined ? 'yes' : 'no']))] }] : []),
      { name: 'Info', header: 0, widths: [34, 60], rows: [
        [{ v: 'Modal identification – ' + w.title, bold: true }], [],
        ['Method', 'Frequency Domain Decomposition (peaks) and Enhanced FDD (frequency and damping)'],
        ['Exported', new Date().toLocaleString()], ['Identified', info.at ? new Date(info.at).toLocaleString() : ''],
        ['Setups', info.setups ?? 1], ['Channels', info.channels ?? p.dofs.length], ['Record length (s)', info.seconds ?? ''], ['Sample rate (Hz)', info.fs ?? ''],
        ['Averaged segments (damping)', info.seg ?? p.efdd.nseg], ['Frequency resolution (Hz)', info.df ?? ''],
        ['MAC level of the bell', info.macMin ?? p.efdd.macMin], ['Correlation fit range', `${info.hi ?? p.efdd.hi} down to ${info.lo ?? p.efdd.lo}`],
        ['Window correction', (info.window ?? p.efdd.window) ? 'yes' : 'no'], [],
        ['Mode shapes', 'real part, normalised so the largest component is 1' + (ms.some(m => m.setups) ? '; setups scaled onto each other through the shared DOFs (least squares) and averaged' : '')],
        ['MAC', '1 = identical shapes, 0 = unrelated']] }];
    download(UI.safeName(w.title) + ' modes.xlsx', root.FORMATS.xlsx(book));
  }

  /* ---------- generators, paste, UFF ---------- */
  const GENS = [['grid', 'Grid'], ['outline', 'Rectangle outline'], ['box', 'Box'], ['circle', 'Circle'], ['cylinder', 'Cylinder'], ['cone', 'Truncated cone'], ['beam', 'Beam']];
  async function generate(w, v, kind) {
    const p = P(w), start = nextId(p);
    const num = (key, label, value, extra) => Object.assign({ key, label, type: 'number', value }, extra || {});
    const plane = { key: 'plane', label: 'Plane', type: 'select', options: ['XY', 'XZ', 'YZ'], value: 'XY' }, axis = { key: 'axis', label: 'Axis parallel to', type: 'select', options: ['Z', 'X', 'Y'], value: 'Z' };
    const surf = { key: 'surfaces', label: 'Surfaces', type: 'check', value: true };
    const F = {
      grid: [num('nx', 'Nodes along the first axis', 5, { min: 1, step: 1 }), num('ny', 'Nodes along the second axis', 3, { min: 1, step: 1 }), num('dx', 'Spacing along the first axis', 1), num('dy', 'Spacing along the second axis', 1), plane, { key: 'lines', label: 'Lines', type: 'check', value: true }, surf],
      outline: [num('lx', 'Length of the first side', 4), num('ly', 'Length of the second side', 2), num('nx', 'Nodes along the first side', 5, { min: 2, step: 1 }), num('ny', 'Nodes along the second side', 3, { min: 2, step: 1 }), plane],
      box: [num('lx', 'Length X', 2), num('ly', 'Length Y', 1), num('lz', 'Length Z', 1), surf],
      circle: [num('n', 'Nodes around', 12, { min: 3, step: 1 }), num('r', 'Radius', 1), axis],
      cylinder: [num('n', 'Nodes around', 12, { min: 3, step: 1 }), num('r', 'Radius', 1), num('levels', 'Rings', 3, { min: 1, step: 1 }), num('h', 'Height', 2), axis, surf],
      cone: [num('n', 'Nodes around', 12, { min: 3, step: 1 }), num('r1', 'Bottom radius', 1.5), num('r2', 'Top radius', 0.5), num('levels', 'Rings', 3, { min: 2, step: 1 }), num('h', 'Height', 2), axis, surf],
      beam: [num('n', 'Nodes', 6, { min: 2, step: 1 }), num('length', 'Length', 5), { key: 'axis', label: 'Along', type: 'select', options: ['X', 'Y', 'Z'], value: 'X' }]
    }[kind];
    const r = await dialog({ title: GENS.find(g => g[0] === kind)[1] + ' – new nodes from ' + start, fields: [...F,
      { type: 'section', label: 'Position' }, num('ox', 'Origin X', 0), num('oy', 'Origin Y', 0), num('oz', 'Origin Z', 0), num('start', 'First node number', start, { min: 1, step: 1 })], ok: 'Add' });
    if (!r) return;
    const part = GM.translate(GM[kind](r), r.ox || 0, r.oy || 0, r.oz || 0);
    Object.assign(p, GM.merge(p, part));
    if ((kind === 'cylinder' || kind === 'cone' || kind === 'circle') && !p.cyl) p.cyl = { axis: r.axis, x: r.axis === 'X' ? 0 : r.ox || 0, y: r.axis === 'Y' ? 0 : r.oy || 0, z: r.axis === 'Z' ? 0 : r.oz || 0 }; // R / T / A follow the cylinder
    if (v.lockB) v.lockB = bounds(p.nodes);
    refreshSide(w, v); changed(w, v);
    toast(`Added ${part.nodes.length} nodes, ${part.lines.length} lines, ${part.surfaces.length} surfaces`);
  }
  async function pasteNodes(w, v) {
    const r = await dialog({ title: 'Paste nodes', intro: 'One node per line: number, X, Y, Z and optionally a name (separated by tabs, spaces, commas or semicolons). Existing node numbers are replaced.', fields: [{ key: 't', label: 'Nodes', type: 'textarea', rows: 10, wide: true }], ok: 'Add' });
    if (!r) return;
    const nodes = [];
    for (const line of r.t.split(/\r?\n/)) {
      const cells = line.includes('\t') ? line.split('\t') : line.trim().split(/\s*[,;]\s*|\s+/), f = cells.slice(0, 4).map(c => +String(c).trim());
      if (cells.length >= 4 && cells.slice(0, 4).every(c => String(c).trim() !== '') && f.every(isFinite)) { const n = { id: Math.round(f[0]), x: f[1], y: f[2], z: f[3] }; setName(n, cells.slice(4).join(' ')); nodes.push(n); }
    }
    if (!nodes.length) throw new Error('No "number, X, Y, Z" lines found');
    Object.assign(P(w), GM.merge(P(w), { nodes, lines: [], surfaces: [] }));
    refreshSide(w, v); changed(w, v); toast(`Added ${nodes.length} nodes`);
  }
  /* ---------- geometry files: .osgeo (OpenSig, JSON) and universal files ---------- */
  async function saveGeometry(w) {
    const p = P(w); if (!p.nodes.length) throw new Error('There is no geometry to save yet');
    const r = await dialog({ title: 'Save geometry', intro: `${p.nodes.length} nodes, ${p.lines.length} lines, ${p.surfaces.length} surfaces.`, fields: [
      { key: 'name', label: 'File name', type: 'text', value: UI.safeName(w.title) },
      { key: 'format', label: 'Format', type: 'radio', options: [['osgeo', 'OpenSig geometry (.osgeo) – opens again here, with the cylinder axis'], ['unv', 'Universal file (.unv) – for other modal analysis programs']], value: 'osgeo' },
      { key: 'sensors', label: 'Include the sensor layout (channel names, nodes, directions, references)', type: 'check', value: p.dofs.length > 0, show: x => x.format === 'osgeo' }],
      validate: x => String(x.name || '').trim() ? null : 'Enter a file name', ok: 'Save' });
    if (!r) return;
    const name = UI.safeName(r.name.trim().replace(/\.(osgeo|unv|uff|json)$/i, ''));
    if (r.format === 'unv') { download(name + '.unv', GM.writeUFF(p), 'text/plain'); return; }
    const sensors = r.sensors ? p.dofs.map(d => { const x = S.wins.get(d.win); return { channel: x ? x.title : 'W' + d.win, node: d.node, dir: d.dir, ref: d.ref, setup: setupOf(d) }; }) : [];
    download(name + '.osgeo', GM.writeGeometryFile(p, { name: w.title, sensors }), 'application/json');
  }
  let openTarget = null;
  function openGeometry(w) { openTarget = w || null; UI.pickFiles('.osgeo,.json,.uff,.unv,.uf', 'geometry'); }
  async function openGeometryFile(w, file) {
    const text = await file.text(), ext = (file.name.split('.').pop() || '').toLowerCase();
    const json = ext === 'osgeo' || ext === 'json' || /^\s*\{/.test(text);
    const r = json ? GM.parseGeometryFile(text) : Object.assign(GM.parseUFF(text), { cyl: null, sensors: [] });
    const g = r.geometry;
    if (!g.nodes.length) throw new Error('No nodes in ' + file.name);
    if (!w) w = newGeometry(null, { title: (r.name || UI.baseName(file.name)), quiet: true });
    const v = viewOf(w), p = P(w);
    let how = 'replace';
    if (p.nodes.length) {
      const q = await dialog({ title: 'Open geometry – ' + file.name, intro: `${g.nodes.length} nodes, ${g.lines.length} lines, ${g.surfaces.length} surfaces.`, fields: [
        { key: 'how', label: 'The model', type: 'radio', options: [['replace', 'Replace the current model'], ['add', 'Add to the current model (nodes with the same number are replaced)']], value: 'replace' }], ok: 'Open' });
      if (!q) return; how = q.how;
    }
    if (how === 'add') { Object.assign(p, GM.merge(p, g)); if (r.cyl && !p.cyl) p.cyl = r.cyl; }
    else { p.nodes = g.nodes; p.lines = g.lines; p.surfaces = g.surfaces; p.cyl = r.cyl; }
    const ids = new Set(p.nodes.map(n => n.id)); p.dofs.forEach(d => { if (d.node != null && !ids.has(d.node)) d.node = null; });
    const matched = r.sensors.length ? applySensors(w, v, r.sensors) : 0;
    v.sel = null; v.lockB = v.tool === 'select' ? null : bounds(p.nodes); Object.assign(p.view, { zoom: 1, panX: 0, panY: 0 });
    refreshSide(w, v); buildBar(w, v); changed(w, v);
    toast(`${file.name}: ${g.nodes.length} nodes, ${g.lines.length} lines, ${g.surfaces.length} surfaces` +
      (r.sensors.length ? ` · channels found by name: ${matched} of ${r.sensors.length}` : '') + (r.skipped.length ? ` (skipped: ${r.skipped.slice(0, 3).join(', ')}${r.skipped.length > 3 ? ' …' : ''})` : ''));
  }
  // the sensor layout of a file: open signal windows whose title is the channel name get its node, direction, reference
  function applySensors(w, v, sensors) {
    const p = P(w), sigs = signals(w), used = new Set(), out = [];
    for (const s of sensors) {
      const x = sigs.find(q => q.title === s.channel && !used.has(q.id)); if (!x) continue;
      used.add(x.id); out.push({ win: x.id, node: s.node, dir: s.dir, ref: s.ref, setup: s.setup || 1 });
    }
    if (!out.length) return 0;
    p.dofs = p.dofs.filter(d => !used.has(d.win)).concat(out);
    p.anim.ref = Math.max(0, p.dofs.findIndex(d => d.ref));
    syncParents(w, v);
    return out.length;
  }
  const prevOpeners = root.UI_OPENERS;
  root.UI_OPENERS = async (file, mode) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (mode === 'geometry' || ext === 'osgeo') {
      const t = mode === 'geometry' && openTarget && S.wins.has(openTarget.id) ? openTarget : null; openTarget = null;
      await openGeometryFile(t, file); return true;
    }
    return prevOpeners ? prevOpeners(file, mode) : false;
  };

  /* ---------- Run: the finished model, checked, with its modes, in a large view ---------- */
  async function runModel(w, v) {
    const p = P(w), a = p.anim;
    if (!p.nodes.length) throw new Error('The model has no nodes yet: generate, draw, paste or open a geometry first');
    if (!p.dofs.length) throw new Error('Assign the measured channels to nodes in the DOFs tab first (Auto assign… helps)');
    const ids = new Set(p.nodes.map(n => n.id)), name = d => { const x = S.wins.get(d.win); return x ? x.title : 'W' + d.win; };
    const gone = p.dofs.filter(d => !S.wins.has(d.win)), loose = p.dofs.filter(d => S.wins.has(d.win) && (d.node == null || !ids.has(d.node)));
    if (gone.length + loose.length === p.dofs.length) throw new Error('No channel is both open and assigned to a node – check the DOFs tab');
    if (v.issue) throw new Error(v.issue);
    if (!v.chan || !v.chan.some(Boolean)) throw new Error('The channels are still being read – try again in a moment');
    spectra(w, v);
    if (!v.sv) throw new Error(v.issue || 'The spectra of the channels could not be calculated');
    v.modes = GM.peaks(v.sv[0], 10, 3).map(b => b * v.df);
    let efddError = null;
    if (v.modes.length) try { identifyModes(w, v, v.modes); } catch (e) { efddError = e.message; }
    if (a.mode === 'off') a.mode = 'fdd';
    if ((a.mode === 'fdd' || a.mode === 'ods') && !(a.freq > 0) && v.modes.length) a.freq = v.modes[0];
    if (a.style === 'static') a.style = 'dwell';
    a.playing = true; v.shapeKey = null;
    v.running = true; v.tool = 'select'; v.lineFrom = null; v.surfPick = []; v.lockB = null;
    v.root.querySelector('.geo-view').dataset.tool = 'select';
    v.root.classList.add('geo-noside'); Object.assign(p.view, { zoom: 1, panX: 0, panY: 0 });
    buildBar(w, v); loop(w, v); draw(w, v);
    const warn = [...(loose.length ? [`${loose.length} channel${loose.length > 1 ? 's have' : ' has'} no node (${loose.slice(0, 3).map(name).join(', ')}${loose.length > 3 ? ' …' : ''})`] : []),
      ...(gone.length ? [`${gone.length} channel window${gone.length > 1 ? 's are' : ' is'} closed`] : [])];
    toast(`Model: ${p.nodes.length} nodes, ${p.lines.length} lines, ${p.surfaces.length} surfaces, ${p.dofs.length - gone.length - loose.length} channels. ` +
      (v.modes.length ? 'Modes: ' + v.modes.map(f => { const md = modeAt(w, f, v); return fmt(+(md ? md.f : f).toFixed(2)) + ' Hz' + (md && Number.isFinite(md.zeta) ? ` (${(md.zeta * 100).toFixed(2)} %)` : ''); }).join(', ') + '.' : 'No clear modes found.') +
      (efddError ? ' Damping: ' + efddError + '.' : '') + (warn.length ? ' ⚠ ' + warn.join('; ') : ''), warn.length ? 'err' : undefined);
  }
  function editModel(w, v) {
    v.running = false; v.root.classList.remove('geo-noside');
    buildBar(w, v); refreshSide(w, v); draw(w, v);
  }

  /* ---------- commands ---------- */
  // o: {title, rect, setup(params, v) before the first calculation, toast}
  function newGeometry(ws, o = {}) {
    const dw = S.desktop.clientWidth || 1000, dh = S.desktop.clientHeight || 700, rw = Math.min(1320, dw - 20), rh = Math.min(800, dh - 20);
    const w = APP.createWindow({ kind: 'display', title: o.title || 'Geometry', op: { type: 'geometry', params: defaults() }, parents: [], rect: o.rect || { x: Math.max(0, (dw - rw) / 2), y: Math.max(0, (dh - rh) / 3), w: rw, h: rh } });
    const v = viewOf(w);
    if (ws && ws.length) { P(w).dofs = ws.map(x => ({ win: x.id, node: null, dir: '+Z' })); v.tab = 'dofs'; }
    if (o.setup) o.setup(P(w), v);
    buildTabs(w, v); buildBar(w, v);
    if (P(w).dofs.length) syncParents(w, v); else refreshSide(w, v);
    if (!o.quiet) toast(o.toast || 'Geometry: generate, draw or open the model, assign channels in DOFs (Auto assign…), then press ▶ Run');
    return w;
  }
  // Help ▸ Examples: ambient vibration of a bridge deck – 10 vertical accelerometers, the deck geometry and its modes
  function bridgeExample() {
    const d = GM.bridgeDeck(), dw = S.desktop.clientWidth || 1000, dh = S.desktop.clientHeight || 700;
    const rows = d.sensors.length / 2, left = Math.min(560, Math.round(dw * 0.36)), cw = left / 2, ch = dh / rows;
    const wins = d.sensors.map((s, k) => APP.createWindow({ kind: '1d', title: s.title, source: { type: 'generator' },
      data: { y: d.signals[k], x0: 0, dx: 1 / d.fs, xUnit: 's', yUnit: 'm/s²' },
      rect: { x: (s.side === 'south' ? 0 : cw), y: (s.station - 1) * ch, w: cw - 2, h: ch - 2 } }));
    return newGeometry(wins, { title: 'Bridge deck – geometry and mode shapes', rect: { x: left, y: 0, w: dw - left, h: dh },
      toast: 'Bridge deck: 10 vertical accelerometers, 5 min of ambient vibration. Press ▶ Run to see the finished model with its four modes.',
      setup(p, v) {
        Object.assign(p, JSON.parse(JSON.stringify(d.geometry)));
        p.dofs = d.sensors.map((s, k) => ({ win: wins[k].id, node: s.node, dir: s.dir, ref: s.ref }));
        p.anim.ref = Math.max(0, p.dofs.findIndex(x => x.ref)); p.anim.mode = 'fdd'; p.anim.scale = 0.6;
        p.fdd.nseg = 16; Object.assign(p.view, { yaw: -32, pitch: 24 });
        v.tab = 'fdd'; v.autoPeak = true;
      } });
  }
  // Help ▸ Examples: the same deck measured with 6 sensors in 2 setups – the 2 sensors at 10 m stay as references
  function bridgeRovingExample() {
    const sets = [{ seed: 101, level: 0.02, nodes: [3, 13, 2, 12, 4, 14] }, { seed: 102, level: 0.03, nodes: [3, 13, 5, 15, 6, 16] }];
    const dw = S.desktop.clientWidth || 1000, dh = S.desktop.clientHeight || 700, left = Math.min(560, Math.round(dw * 0.36)), cw = left / 2, ch = dh / 6;
    const wins = [], dofs = []; let geo = null;
    sets.forEach((st, si) => {
      const d = GM.bridgeDeck({ seed: st.seed, level: st.level }); geo = geo || d.geometry;
      st.nodes.forEach((node, r) => {
        const k = d.sensors.findIndex(q => q.node === node), s = d.sensors[k], ref = node === 3 || node === 13;
        const x = APP.createWindow({ kind: '1d', title: `Setup ${si + 1}: ${s.title.replace('Deck ', '')}${ref ? ' – reference' : ''}`, source: { type: 'generator' },
          data: { y: d.signals[k], x0: 0, dx: 1 / d.fs, xUnit: 's', yUnit: 'm/s²' }, rect: { x: si * cw, y: r * ch, w: cw - 2, h: ch - 2 } });
        wins.push(x); dofs.push({ win: x.id, node, dir: '+Z', ref, setup: si + 1 });
      });
    });
    return newGeometry(wins, { title: 'Bridge deck – roving test (2 setups)', rect: { x: left, y: 0, w: dw - left, h: dh },
      toast: 'Roving test: 6 sensors in 2 setups (left and right column); the 2 at 10 m stay as references. Press ▶ Run – the setups are combined into full mode shapes.',
      setup(p, v) {
        Object.assign(p, JSON.parse(JSON.stringify(geo)));
        p.dofs = dofs; p.anim.ref = 0; p.anim.mode = 'fdd'; p.anim.scale = 0.6; p.fdd.nseg = 16; Object.assign(p.view, { yaw: -32, pitch: 24 });
        v.tab = 'dofs'; v.autoPeak = true;
      } });
  }
  const m3d = UI.MENUS.find(m => m.label === '3D tools');
  if (m3d) m3d.items.push('-', { label: 'Geometry and mode shapes (ODS / FDD)…', run: () => newGeometry() });
  // toolbar: a large button right of the two rows, after Help (a deck on two supports with a mode shape over it; drawn
  // for OpenSig)
  const GEO_ICON = '<svg viewBox="5 6 38 38" aria-hidden="true">' +
    '<path d="M12 31v7M27 31v7M9 38h6M24 38h6" stroke="#555" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M7.5 31l10.5-6h22.5l-10.5 6z" fill="#bcd4f3" stroke="#1d4f8a" stroke-width="1.4" stroke-linejoin="round"/><path d="M19 31l10.5-6" stroke="#1d4f8a" stroke-width=".9"/>' +
    '<path d="M7.5 23.5c4.5-11 9-11 13.5-4.5s9.5 6.5 19.5-4.5" fill="none" stroke="#d22" stroke-width="2.6" stroke-linecap="round"/>' +
    '<g fill="#1d4f8a"><circle cx="7.5" cy="31" r="1.7"/><circle cx="19" cy="31" r="1.7"/><circle cx="30" cy="31" r="1.7"/><circle cx="18" cy="25" r="1.7"/><circle cx="29.5" cy="25" r="1.7"/><circle cx="40.5" cy="25" r="1.7"/></g></svg>';
  UI.TOOLBAR_SIDE.push(UI.TB(GEO_ICON, 'Geometry and mode shapes (ODS / FDD)', '3D tools', 'Geometry and mode shapes (ODS / FDD)…', { cls: 'tb-big' }));
  const EXAMPLE = 'Bridge deck: ambient vibration and mode shapes';
  UI.EXAMPLES[EXAMPLE] = bridgeExample;
  const exMenu = UI.findItem('Help', 'Examples'); if (exMenu && exMenu.sub) exMenu.sub.push({ label: EXAMPLE, run: bridgeExample });
  const EXAMPLE2 = 'Bridge deck: roving test in 2 setups';
  UI.EXAMPLES[EXAMPLE2] = bridgeRovingExample;
  if (exMenu && exMenu.sub) exMenu.sub.push({ label: EXAMPLE2, run: bridgeRovingExample });
  root.CONTROL_EXTRA = (prev => ws => (prev ? prev(ws) : []).concat([{ label: 'Geometry with the selected signals', en: () => ws.some(x => x.kind === '1d' && x.data && x.data.y), run: () => newGeometry(ws.filter(x => x.kind === '1d' && x.data && x.data.y)) }]))(root.CONTROL_EXTRA);
  const prevExtra = UI.extraWindowItems;
  UI.extraWindowItems = w => {
    const out = prevExtra ? prevExtra(w) : [];
    if (w.op && w.op.type === 'geometry') {
      const v = viewOf(w);
      out.unshift(v.running ? { label: 'Edit model', run: () => editModel(w, v) } : { label: 'Run model', run: () => runModel(w, v) },
        { label: 'Open geometry…', run: () => openGeometry(w) }, { label: 'Save geometry…', run: () => saveGeometry(w) },
        { label: 'Record animation…', run: () => record(w, v) }, { label: 'Reset view', run: () => { Object.assign(P(w).view, defaults().view); draw(w, v); } }, '-');
    }
    return out;
  };
  // F1: the help page of the tab or tool in use
  function helpTopic(w) {
    const v = views.get(w); if (!v) return 'geometry';
    if (v.running) return 'georun';
    if (v.tool !== 'select') return 'geodraw';
    const roving = v.setups && v.setups.length > 1; // several setups: the Roving Tests pages
    return { lines: 'geomodel', surfaces: 'geomodel', dofs: roving ? 'rovassign' : 'geodofs', fdd: roving ? 'rovcombine' : 'geoanim', modes: roving ? 'rovresults' : 'geomodes' }[v.tab] || (P(w).nodes.length ? 'geomodel' : 'geometry');
  }

  root.GEOMETRY = { newGeometry, bridgeExample, bridgeRovingExample, openGeometry, helpTopic };
})(window);
