/* OpenSig Control Window (System control ▸ Control window, Alt+W): the analysis graph, where every window is a node,
   curves run from each parent to its children (dotted when the link is off), and the windows can be handled together.
   Click a node to select or unselect it (the number is the selection order), drag a rectangle over empty space to
   select several (with Ctrl: unselect), right-click a node for that window's menu (with Add analysis) or empty space for
   the commands on all selected windows, Del deletes the selection, double-click brings a window to the front.
   Wiring: every node has an output port, analysis windows an input port. Drag from an output onto a node to make that
   node work on this window, or into empty space for the Add analysis menu there; drag an input onto another window to
   take its data from there, or into empty space to unlink it; right-click a curve to unlink it.
   View: the wheel zooms at the pointer, Shift+wheel, the middle button or Space+drag pan, Fit (F) shows everything;
   the tree runs left to right or top to bottom, compact or not, with pictures of the windows in the nodes or icons
   (hover an icon for its picture); a branch folds into its node (± box, "+N" hidden windows).
   Nodes can be dragged anywhere (all selected nodes together; arrow keys nudge them) and keep their place, saved with
   the workspace; "Arrange icons automatically" brings back the tree layout. Dropping a node onto another copies its
   analysis tree to that window (Ctrl: moves it); a source node dropped with Shift is duplicated together with its
   analysis. The picked values (Value picker) of a window are one node linked to it, listing every point: click a line
   to select that point in its window, double-click the node for the table, right-click for its commands. */
(function (root) {
  'use strict';
  const { APP, UI, OPS, IO, PLOT } = root;
  const S = APP.S, { dialog, toast, h, guard, download, safeName } = UI;
  const ICON = 34, COLW = 150, PADX = 26, PADY = 16;
  const PW = 112, PH = 70, LABH = 18;               // picture cards; the name under a node
  const STORE = 'opensig.control';
  const GRID = 8;                                   // snap step for moved icons
  let snap = true;
  const snapV = v => snap ? Math.round(v / GRID) * GRID : Math.round(v);
  const sel = [];                                   // selected window ids, in selection order
  let el = null, body, canvas, ctx, bar, nodes = new Map(), size = { w: 0, h: 0 }, drag = null, hover = null, queued = false, timer = null, maxRect = null;
  // layout and view: tree direction, spacing, pictures; zoom and pan (auto: fit the window, at most 100 %)
  const opts = { dir: 'lr', compact: false, pics: false };
  const view = { z: 1, x: 0, y: 0, auto: true };
  let M = null, links = [], hoverLink = null, folded = new Map(), nkids = new Map(), spaceDown = false;
  // picked values (Value picker): one node per window, in the column after it, listing up to MAXP points ("+N more")
  const PICON = 24, PLH = 14, MAXP = 12, PICKW = 190;
  let showPicks = true, pnodes = [], pickFocus = null, hoverPick = null; // pickFocus: { id, k } of the last click (k null: the node)
  const picksOf = w => showPicks && root.PICK ? root.PICK.listOf(w) : [];
  const pickLines = n => Math.min(n, MAXP) + (n > MAXP ? 1 : 0);
  const pickHeight = n => Math.max(64, ICON / 2 + 22 + pickLines(n) * PLH);

  /* ---------- graph ---------- */
  const ups = w => (w.parents.length ? w.parents : w.formerParents || []).filter(p => S.wins.has(p)); // former parents: unlinked
  // node size and spacing: dep between tree levels, ord between neighbours; labW: room for the name
  function metrics() {
    const lr = opts.dir !== 'tb', k = opts.compact ? 0.75 : 1, nw = opts.pics ? PW : ICON, nh = opts.pics ? PH : ICON;
    const dep = Math.round((lr ? (opts.pics ? PW + 64 : COLW) : nh + LABH + 34) * k);
    const ord = Math.max(lr ? nh + LABH + 2 : nw + 24, Math.round((lr ? nh + 30 : Math.max(nw + 30, 120)) * k));
    return { lr, nw, nh, dep, ord, labW: Math.max(60, (lr ? dep : ord) - 12) };
  }
  // hand-placed nodes keep their place per tree direction
  const posKey = () => opts.dir === 'tb' ? 'cwPosTb' : 'cwPos', pickKey = () => opts.dir === 'tb' ? 'cwPickPosTb' : 'cwPickPos';
  function layoutGraph() {
    M = metrics();
    const { lr, nw, nh, dep, ord } = M;
    const wins = [...S.wins.values()].sort((a, b) => a.id - b.id), kids = new Map(wins.map(w => [w.id, []])), roots = [], depth = new Map();
    for (const w of wins) { const p = ups(w)[0]; if (p != null) kids.get(p).push(w); else roots.push(w); }
    const dOf = (w, guardSet = new Set()) => {
      if (depth.has(w.id)) return depth.get(w.id);
      if (guardSet.has(w.id)) return 0; guardSet.add(w.id);
      const ps = ups(w).map(p => S.wins.get(p)), d = ps.length ? 1 + Math.max(...ps.map(p => dOf(p, guardSet))) : 0;
      depth.set(w.id, d); return d;
    };
    wins.forEach(w => dOf(w));
    // a folded window hides its branch; hid: the hidden windows
    nkids = new Map(wins.map(w => [w.id, kids.get(w.id).length])); folded = new Map();
    const hid = new Set(), hide = w => kids.get(w.id).reduce((s, c) => hid.has(c.id) ? s : (hid.add(c.id), s + 1 + hide(c)), 0);
    // leaves take the next free place, a parent sits in the middle of its children; the picked values
    // node of a window is a leaf of it, after its child windows, as long as its list
    const x0 = Math.max(PADX, Math.ceil(M.labW / 2 - nw / 2) + 6); // room for the names of the first column
    let oCur = lr ? PADY : x0; const oOf = new Map(), pickAt = new Map(), placed = new Set();
    const place = w => {
      placed.add(w.id);
      const fold = w.display.cwFolded && kids.get(w.id).length;
      if (fold) folded.set(w.id, hide(w));
      const ch = fold ? [] : kids.get(w.id).filter(c => !placed.has(c.id)), ps = picksOf(w); // (a loop of unlinked windows)
      if (!ch.length && !ps.length) { oOf.set(w.id, oCur); oCur += ord; return; }
      ch.forEach(place);
      const tops = ch.map(c => oOf.get(c.id));
      if (ps.length) { pickAt.set(w.id, { ps, o: oCur }); tops.push(oCur); oCur += lr ? pickHeight(ps.length) : PICKW; }
      const o = (tops[0] + tops[tops.length - 1]) / 2;
      oOf.set(w.id, o); oCur = Math.max(oCur, o + ord);
    };
    roots.forEach(place);
    wins.forEach(w => { if (!placed.has(w.id) && !hid.has(w.id)) place(w); });
    nodes = new Map(); pnodes = [];
    for (const w of wins) if (oOf.has(w.id) && !hid.has(w.id)) {
      const d = depth.get(w.id), o = oOf.get(w.id);
      nodes.set(w.id, lr ? { w, x: x0 + d * dep, y: o } : { w, x: o, y: PADY + d * dep });
    }
    for (const [id, { ps, o }] of pickAt) { // lr: the icon centred on the row like the window icons
      const n = nodes.get(id); if (!n) continue;
      pnodes.push(Object.assign({ w: n.w, ps, more: Math.max(0, ps.length - MAXP), lines: [] }, lr ? { x: n.x + dep, y: o + (nh - PICON) / 2 } : { x: o, y: n.y + dep }));
    }
    // nodes moved by hand keep their place (display.cwPos, saved with the workspace); a picked values node keeps its
    // offset to its window (display.cwPickPos), so it moves with the window. bx/by: the place without a drag running.
    const mv = drag && drag.moved && drag.target == null && !drag.dup ? drag : null, pk = posKey(), ppk = pickKey();
    for (const n of nodes.values()) {
      const pos = n.w.display[pk];
      n.ax = n.x; n.ay = n.y;
      if (pos) { n.x = pos.x; n.y = pos.y; }
      n.bx = n.x; n.by = n.y;
      if (mv && mv.type === 'node' && mv.ids.has(n.w.id)) { n.x = snapV(Math.max(0, n.bx + mv.dx)); n.y = snapV(Math.max(0, n.by + mv.dy)); }
    }
    for (const pn of pnodes) {
      const n = nodes.get(pn.w.id), off = pn.w.display[ppk] || { dx: pn.x - n.ax, dy: pn.y - n.ay };
      pn.x = pn.bx = Math.max(0, n.x + off.dx); pn.y = pn.by = Math.max(0, n.y + off.dy);
      if (mv && mv.type === 'pick' && mv.id === pn.w.id) { pn.x = snapV(Math.max(0, pn.bx + mv.dx)); pn.y = snapV(Math.max(0, pn.by + mv.dy)); }
    }
    size = { w: 0, h: 0 };
    for (const n of nodes.values()) {
      size.w = Math.max(size.w, n.x + nw / 2 + Math.max(nw / 2 + (folded.has(n.w.id) ? 34 : 6), M.labW / 2) + PADX);
      size.h = Math.max(size.h, n.y + nh + LABH + (lr ? 0 : 6) + PADY);
    }
    for (const pn of pnodes) { size.w = Math.max(size.w, pn.x + PICON + PICKW); size.h = Math.max(size.h, pn.y + pickHeight(pn.ps.length)); }
    for (let i = sel.length - 1; i >= 0; i--) if (!nodes.has(sel[i])) sel.splice(i, 1); // folded away
    // the curves: parent → child (i of n inputs) and overlay → window
    links = [];
    for (const n of nodes.values()) {
      const w = n.w, ps = ups(w);
      ps.forEach((p, i) => { const a = nodes.get(p); if (a) links.push({ kind: 'link', from: p, to: w.id, i, n: ps.length, a: outPort(a), b: inPort(n) }); });
      (w.display.overlays || []).forEach((o, i) => { const a = nodes.get(o); if (a) links.push({ kind: 'overlay', from: o, to: w.id, i, a: outPort(a), b: inPort(n) }); });
    }
  }

  function kindOf(w) {
    if (w.kind === 'instrument') return 'instrument';
    if (w.kind === '3d') return '3d';
    if (w.op && w.op.type === 'geometry') return 'geometry';
    if (w.kind === 'display') return 'display';
    if (!w.op) return w.source && w.source.type === 'acq' ? 'acq' : w.source && w.source.type === 'generator' ? 'generator' : 'file';
    if (w.op.type === 'fft') return 'fft';
    if (w.op.type === 'calc') return 'calc';
    if (w.op.type === 'edit') return 'table';
    if (w.op.type === 'geometry') return 'geometry';
    if (OPS[w.op.type] && OPS[w.op.type].script) return 'script';
    return 'signal';
  }
  function info(w) {
    const d = w.data;
    if (w.kind === 'instrument') return (w.op && w.op.params.instrument) || '';
    if (w.op && w.op.type === 'geometry') return (w.op.params.nodes || []).length + ' nodes';
    if (w.kind === '3d' && d && d.sg) return `${d.sg.rows.length}x${d.sg.bins}`;
    return d && d.y ? String(d.y.length) : '';
  }
  // "3 (2592)" for analysis windows, the title for sources and renamed windows
  const labelOf = w => (!w.op || w.title !== w.opLabel) ? w.title : `${w.id} (${info(w)})`;
  function fitText(t, max) {
    if (ctx.measureText(t).width <= max) return t;
    let a = Math.ceil(t.length / 2), b = Math.floor(t.length / 2);
    while (a > 1 && ctx.measureText(t.slice(0, a) + '…' + t.slice(t.length - b)).width > max) { a--; b--; }
    return t.slice(0, a) + '…' + t.slice(t.length - b);
  }
  // ports: where the curve to the children leaves a node and where the curve from its parent arrives
  // (+0.5: a straight curve on the middle of a pixel row is sharp)
  const outPort = n => M.lr ? { x: n.x + M.nw, y: n.y + M.nh / 2 + 0.5 } : { x: n.x + M.nw / 2 + 0.5, y: n.y + M.nh + LABH };
  const inPort = n => M.lr ? { x: n.x, y: n.y + M.nh / 2 + 0.5 } : { x: n.x + M.nw / 2 + 0.5, y: n.y };
  const hasIn = w => !!(w.op && OPS[w.op.type] && !OPS[w.op.type].multi); // the others take the windows named in their settings
  const foldBox = n => ({ x: n.x + M.nw - 5, y: n.y + M.nh - 5, s: 11 });
  // why window c cannot take window p as its input (null: it can)
  function linkProblem(c, p) {
    if (!c.op) return 'A source window has no input';
    if (!hasIn(c)) return 'This window takes the windows named in its settings';
    if (!(p.kind === '1d' || (c.op.type === 'slice' && p.kind === '3d'))) return 'Only a signal window can be the input';
    for (let q = p; q; q = q.parents.length ? S.wins.get(q.parents[0]) : null) if (q === c) return 'That would make a loop';
    return null;
  }
  const linkedTo = (c, p) => c.parents.length === 1 && c.parents[0] === p.id;

  /* ---------- drawing ---------- */
  function glyph(k, x, y) { // 34×34 icon contents, drawn in the classic style
    const c = ctx; c.save(); c.translate(x, y); c.lineWidth = 1.4; c.lineJoin = 'round'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    const wave = (col, y0, a) => { c.strokeStyle = col; c.beginPath(); for (let i = 0; i <= 20; i++) { const px = 7 + i, py = y0 - a * Math.sin(i / 20 * 2 * Math.PI * 1.5); i ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); };
    if (k === 'file' || k === 'acq') {
      c.fillStyle = '#fff'; c.strokeStyle = '#333'; c.beginPath(); c.moveTo(6, 11); c.lineTo(13, 11); c.lineTo(15, 13); c.lineTo(28, 13); c.lineTo(28, 27); c.lineTo(6, 27); c.closePath(); c.fill(); c.stroke();
      wave(k === 'acq' ? '#c00' : '#0040ff', 20, 4);
      if (k === 'acq') { c.fillStyle = '#c00'; c.font = 'bold 8px sans-serif'; c.fillText('A/D', 8, 9); }
    } else if (k === 'generator') wave('#0040ff', 17, 7);
    else if (k === 'fft') {
      c.fillStyle = '#d00'; c.font = 'bold 9px sans-serif'; c.textBaseline = 'top'; c.fillText('FFT', 14, 4);
      c.fillStyle = '#222'; [[7, 10], [11, 6], [15, 12], [19, 4], [23, 8]].forEach(([bx, bh]) => c.fillRect(bx, 28 - bh, 2, bh));
      c.fillRect(6, 28, 21, 1);
    } else if (k === 'signal') wave('#d00', 17, 7);
    else if (k === 'instrument') {
      c.strokeStyle = '#222'; c.beginPath(); c.arc(17, 20, 10, Math.PI, 2 * Math.PI); c.stroke();
      c.beginPath(); c.moveTo(7, 20); c.lineTo(27, 20); c.stroke();
      c.strokeStyle = '#d00'; c.beginPath(); c.moveTo(17, 20); c.lineTo(23, 12); c.stroke();
    } else if (k === '3d') {
      c.strokeStyle = '#222'; c.beginPath(); c.moveTo(9, 6); c.lineTo(9, 24); c.lineTo(28, 24); c.moveTo(9, 24); c.lineTo(4, 29); c.stroke();
      [['#0a0', 8], ['#d00', 13], ['#06f', 18]].forEach(([col, o]) => { c.strokeStyle = col; c.beginPath(); c.moveTo(11, 26 - o / 3); c.lineTo(27, 10 + o / 2); c.stroke(); });
    } else if (k === 'geometry') { // Geometry node: a wire-frame box with its nodes
      const P = [[8, 13], [20, 9], [27, 14], [15, 18], [8, 25], [20, 21], [27, 26], [15, 30]];
      c.strokeStyle = '#26d'; c.lineWidth = 1.2; c.beginPath();
      [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => { c.moveTo(...P[a]); c.lineTo(...P[b]); }); c.stroke();
      c.fillStyle = '#d33'; P.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 1.7, 0, 7); c.fill(); });
    } else if (k === 'table') { // Edit node: a small spreadsheet
      c.fillStyle = '#fff'; c.fillRect(6, 7, 22, 20); c.fillStyle = '#217346'; c.fillRect(6, 7, 22, 5);
      c.strokeStyle = '#6a6a6a'; c.lineWidth = 1; c.strokeRect(6.5, 7.5, 21, 19);
      c.beginPath(); for (const yy of [16.5, 21.5]) { c.moveTo(6.5, yy); c.lineTo(27.5, yy); } c.moveTo(13.5, 12); c.lineTo(13.5, 27); c.stroke();
      c.fillStyle = '#fff2b8'; c.fillRect(14, 17, 13, 4);
    } else if (k === 'display') { c.fillStyle = '#06f'; [[9, 22], [13, 15], [17, 19], [21, 10], [25, 14], [12, 25], [24, 21]].forEach(([px, py]) => c.fillRect(px, py, 3, 3)); }
    else { c.fillStyle = '#222'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(k === 'calc' ? 'f(x)' : 'JS', 17, 17); }
    c.restore();
  }

  // the picture of a window: its video frame or plot, or an instrument's value (null: none yet)
  function pictureOf(w) {
    if (w.kind === 'instrument') {
      const v = w.instEl && w.instEl.querySelector('.inst-value');
      return v && v.textContent ? { text: [...v.childNodes].map(c => c.textContent).join(' ').trim(), name: (w.instEl.querySelector('.inst-name') || {}).textContent || '' } : null;
    }
    const v = w.el.querySelector('video');
    if (v && v.readyState >= 2 && v.videoWidth) return { src: v, w: v.videoWidth, h: v.videoHeight };
    const c = w.canvas || w.el.querySelector('canvas');
    return c && c.width > 4 && c.height > 4 ? { src: c, w: c.width, h: c.height } : null;
  }
  function drawPicture(p, x, y, cw, ch, bg) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip();
    ctx.fillStyle = bg; ctx.fillRect(x, y, cw, ch);
    if (p.text != null) {
      const fam = String(S.theme.font || '11px sans-serif').replace(/^(bold\s+)?[\d.]+px\s+/, '');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = S.theme.muted; ctx.font = '10px ' + fam;
      ctx.fillText(fitText(p.name, cw - 44), x + cw / 2, y + ch * 0.3); // clear of the kind badge in a card's corner
      ctx.fillStyle = S.theme.text; ctx.font = `bold ${Math.round(Math.min(18, ch * 0.24))}px ` + fam;
      ctx.fillText(fitText(p.text, cw - 6), x + cw / 2, y + ch * 0.62);
    } else {
      const s = Math.min(cw / p.w, ch / p.h), dw = p.w * s, dh = p.h * s;
      try { ctx.drawImage(p.src, x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh); } catch (e) { /* not drawable now */ }
    }
    ctx.restore();
  }

  // a curve from a to b, leaving and arriving along the tree direction
  function curve(a, b) {
    const d = Math.max(24, Math.abs(M.lr ? b.x - a.x : b.y - a.y) / 2);
    return M.lr ? { c1: { x: a.x + d, y: a.y }, c2: { x: b.x - d, y: b.y } } : { c1: { x: a.x, y: a.y + d }, c2: { x: b.x, y: b.y - d } };
  }
  function strokeCurve(a, b, arrow) {
    const { c1, c2 } = curve(a, b);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y); ctx.stroke();
    if (arrow) { // a small arrowhead at the child
      const s = 4.5 * ctx.lineWidth ** 0.5, [ux, uy] = M.lr ? [1, 0] : [0, 1];
      ctx.save(); ctx.setLineDash([]); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath();
      ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ux * s * 1.6 - uy * s, b.y - uy * s * 1.6 - ux * s); ctx.lineTo(b.x - ux * s * 1.6 + uy * s, b.y - uy * s * 1.6 + ux * s); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
  function nearCurve(l, p, tol) { // distance of p to the curve of a link, sampled
    const { c1, c2 } = curve(l.a, l.b); let prev = l.a, best = Infinity;
    for (let i = 1; i <= 24; i++) {
      const t = i / 24, u = 1 - t, q = { x: u * u * u * l.a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * l.b.x, y: u * u * u * l.a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * l.b.y };
      const dx = q.x - prev.x, dy = q.y - prev.y, k = Math.max(0, Math.min(1, ((p.x - prev.x) * dx + (p.y - prev.y) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(p.x - prev.x - k * dx, p.y - prev.y - k * dy)); prev = q;
    }
    return best <= tol;
  }

  function draw() {
    queued = false;
    if (!el || el.hidden) return;
    layoutGraph();
    const th = S.theme, dpr = window.devicePixelRatio || 1, W = Math.max(1, body.clientWidth), H = Math.max(1, body.clientHeight);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }
    if (view.auto && !drag) { view.z = Math.min(1, Math.max(0.3, Math.min(W / size.w, H / size.h))); view.x = 0; view.y = 0; } // the whole graph, at most 100 %
    else if (!view.auto) { // keep some of the graph in sight
      const cw = size.w * view.z, ch = size.h * view.z, m = 40;
      view.x = Math.min(Math.max(view.x, Math.min(0, W - cw) - m), Math.max(0, W - cw) + m);
      view.y = Math.min(Math.max(view.y, Math.min(0, H - ch) - m), Math.max(0, H - ch) + m);
    }
    const bg = getComputedStyle(body).backgroundColor || th.plotBg, light = luminance(bg) > 0.5, z = view.z, px = 1 / Math.min(1, z);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); // light or dark (CSS)
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * view.x, dpr * view.y);
    ctx.font = (th.axisFont || '12px sans-serif');
    const pickColor = light ? '#c45f00' : '#ffa040', wire = drag && drag.type === 'wire' && drag.moved ? drag : null;
    // links: parent → child, dotted when the child is unlinked; inputs of multi-input windows in the overlay colours
    for (const l of links) {
      const w = S.wins.get(l.to), linked = w.parents.length > 0, hot = hoverLink && hoverLink.kind === l.kind && hoverLink.from === l.from && hoverLink.to === l.to;
      ctx.lineWidth = (hot ? 2.6 : 1) * px;
      if (l.kind === 'overlay') { ctx.strokeStyle = th.overlay[l.i % th.overlay.length]; ctx.setLineDash([6 * px, 3 * px]); strokeCurve(l.a, l.b, false); continue; } // shown in this window
      if (wire && wire.end === 'in' && wire.id === l.to) continue; // being re-wired
      ctx.strokeStyle = !linked ? th.muted : l.n > 1 ? th.overlay[l.i % th.overlay.length] : '#d00000';
      ctx.setLineDash(linked ? [] : [3 * px, 3 * px]);
      strokeCurve(l.a, l.b, linked);
    }
    for (const pn of pnodes) { // window → its picked values
      const a = nodes.get(pn.w.id);
      ctx.strokeStyle = pickColor; ctx.setLineDash([]); ctx.lineWidth = px;
      strokeCurve(outPort(a), M.lr ? { x: pn.x, y: pn.y + PICON / 2 } : { x: pn.x + PICON / 2, y: pn.y }, false);
    }
    ctx.setLineDash([]); ctx.lineWidth = 1;
    for (const n of nodes.values()) drawNode(n, light, px);
    for (const pn of pnodes) drawPickNode(pn, pickColor);
    if (drag && drag.type === 'rect' && drag.moved) {
      const [x0, x1] = [Math.min(drag.sx, drag.x), Math.max(drag.sx, drag.x)], [y0, y1] = [Math.min(drag.sy, drag.y), Math.max(drag.sy, drag.y)];
      ctx.fillStyle = drag.ctrl ? 'rgba(220,40,40,.12)' : 'rgba(0,120,215,.15)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.lineWidth = px; ctx.strokeStyle = drag.ctrl ? '#c33' : '#0078d7'; ctx.setLineDash([4 * px, 2 * px]); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
    }
    if (drag && drag.type === 'node' && drag.moved && (drag.target != null || drag.dup)) { // dragged icon: COPY / MOVE onto an icon, DUPLICATE
      const n = nodes.get(drag.id);
      if (n) {
        ctx.globalAlpha = 0.6; ctx.fillStyle = '#fff'; ctx.fillRect(drag.x - ICON / 2, drag.y - ICON / 2, ICON, ICON); glyph(kindOf(n.w), drag.x - ICON / 2, drag.y - ICON / 2); ctx.globalAlpha = 1;
        tag(drag.dup ? 'DUPLICATE' : drag.ctrl ? 'MOVE' : 'COPY', drag.x + ICON / 2 + 4, drag.y, drag.dup ? '#0057b8' : drag.ctrl ? '#c00' : '#060');
      }
    }
    if (wire) drawWire(wire, px);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!nodes.size) { ctx.fillStyle = th.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = th.axisFont || '12px sans-serif'; ctx.fillText('No windows yet.', 12, 12); }
    drawPreview(W, H, bg);
    if (editing) placeRename();
    const zl = bar.querySelector('.cw-zoom'); zl.textContent = Math.round(z * 100) + ' %'; zl.classList.toggle('on', view.auto);
    canvas.title = typeof hover === 'string' && hoverPick ? pickTip(hoverPick) : hover != null && S.wins.get(hover) ? (w => `${w.id}#${w.title}${w.op ? ' – ' + w.opLabel : ''}${w.error ? '\n' + w.error : ''}` +
      (root.PICK ? root.PICK.listOf(w).map(p => '\n' + p.text).join('') : ''))(S.wins.get(hover)) : hoverLink ? linkTip(hoverLink) : '';
  }
  function tag(t, x, y, col) { ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(t, x, y); }
  function drawNode(n, light, px) {
    const { w, x, y } = n, { nw, nh } = M, th = S.theme, si = sel.indexOf(w.id), target = drag && drag.moved && drag.target === w.id;
    const wt = drag && drag.type === 'wire' && drag.moved && drag.target === w.id ? drag : null;
    if (opts.pics) { // a card with the window's picture, the kind of window in its corner
      const p = pictureOf(w);
      if (p) drawPicture(p, x, y, nw, nh, light ? '#fff' : '#1b1e23');
      else { ctx.fillStyle = light ? '#f3f3f3' : '#2a2d33'; ctx.fillRect(x, y, nw, nh); glyph(kindOf(w), x + (nw - ICON) / 2, y + (nh - ICON) / 2); }
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 19, 19);
      ctx.save(); ctx.translate(x, y); ctx.scale(0.56, 0.56); glyph(kindOf(w), 0, 0); ctx.restore();
      ctx.strokeStyle = '#6f6f6f'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 18, 18);
      ctx.strokeStyle = si >= 0 ? '#22b322' : w.error ? th.danger : '#6f6f6f'; ctx.lineWidth = si >= 0 ? 3 : px;
      ctx.strokeRect(x + 0.5, y + 0.5, nw - 1, nh - 1); ctx.lineWidth = 1;
    } else {
      const g = ctx.createLinearGradient(0, y, 0, y + ICON);
      if (si >= 0) { g.addColorStop(0, '#5ee65e'); g.addColorStop(1, '#22b322'); } else { g.addColorStop(0, '#fbfbfb'); g.addColorStop(1, '#d4d4d4'); }
      ctx.fillStyle = g; ctx.fillRect(x, y, ICON, ICON);
      ctx.strokeStyle = w.error ? th.danger : '#6f6f6f'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, ICON - 1, ICON - 1);
      glyph(kindOf(w), x, y);
    }
    if (S.active === w || target || wt) {
      ctx.strokeStyle = wt ? (wt.problem ? '#c33' : '#1a8f2e') : target ? '#ff8c00' : '#1883d7'; ctx.lineWidth = 2 * Math.min(px, 2);
      ctx.strokeRect(x - 1.5, y - 1.5, nw + 3, nh + 3); ctx.lineWidth = 1;
    }
    ctx.font = S.theme.axisFont || '12px sans-serif';
    ctx.fillStyle = th.text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(fitText(labelOf(w), M.labW), x + nw / 2, y + nh + 3);
    ctx.textBaseline = 'bottom';
    if (si >= 0) { ctx.textAlign = 'left'; ctx.fillText(String(si + 1), x + nw + 3, y + 2); }
    if (w.display.hidden) { ctx.save(); ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = th.text; ctx.fillText('H', x - 2, y - 2); ctx.restore(); }
    if (w.frozen) { ctx.textAlign = 'right'; ctx.fillStyle = th.muted; ctx.fillText('∅', x - 3, y + nh); }
    // ports: bigger under the pointer and where a dragged curve would connect
    const hv = hover === w.id && !drag, r = 3 * Math.min(px, 2.5);
    const port = (q, hot) => { ctx.beginPath(); ctx.arc(q.x, q.y, hot ? r * 1.5 : r, 0, 2 * Math.PI); ctx.fillStyle = hot ? '#1883d7' : light ? '#8d969f' : '#9aa3ad'; ctx.fill(); ctx.strokeStyle = light ? '#fff' : '#222'; ctx.lineWidth = px; ctx.stroke(); };
    port(outPort(n), hv || (wt && wt.end === 'in'));
    if (hasIn(w)) port(inPort(n), hv || (wt && wt.end === 'out'));
    // fold box (a node with children: on hover, or always while folded) and the number of hidden windows
    const nf = folded.get(w.id);
    if (nkids.get(w.id) && (hv || nf != null)) {
      const b = foldBox(n);
      ctx.fillStyle = light ? '#fff' : '#2a2d33'; ctx.fillRect(b.x, b.y, b.s, b.s); ctx.strokeStyle = '#6f6f6f'; ctx.lineWidth = px; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.s - 1, b.s - 1);
      ctx.strokeStyle = th.text; ctx.beginPath(); ctx.moveTo(b.x + 3, b.y + b.s / 2); ctx.lineTo(b.x + b.s - 3, b.y + b.s / 2);
      if (nf != null) { ctx.moveTo(b.x + b.s / 2, b.y + 3); ctx.lineTo(b.x + b.s / 2, b.y + b.s - 3); }
      ctx.stroke();
    }
    if (nf != null) {
      const t = '+' + nf, bx = x + nw + 8, by = y + nh - 14;
      ctx.font = 'bold 10px sans-serif'; const tw = ctx.measureText(t).width + 8;
      ctx.fillStyle = '#1883d7'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, tw, 13, 6.5) : ctx.rect(bx, by, tw, 13); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, bx + tw / 2, by + 7);
    }
  }
  // a curve being dragged from a port: to the window under the pointer (green: it connects, red: it cannot)
  function drawWire(d, px) {
    const n = nodes.get(d.id), t = d.target != null && nodes.get(d.target), p = { x: d.x, y: d.y }; if (!n) return;
    const a = d.end === 'out' ? outPort(n) : t ? outPort(t) : p, b = d.end === 'out' ? (t ? inPort(t) : p) : inPort(n);
    ctx.strokeStyle = d.problem ? '#c33' : t ? '#1a8f2e' : '#1883d7'; ctx.lineWidth = 2 * px; ctx.setLineDash(t ? [] : [5 * px, 3 * px]);
    strokeCurve(a, b, !!t && !d.problem); ctx.setLineDash([]);
    const w = S.wins.get(d.id), tw = t && t.w;
    const msg = tw ? (d.problem || (d.end === 'out' ? `${tw.label} works on ${w.label}` : `${w.label} works on ${tw.label}`))
      : d.end === 'out' ? 'Add analysis here…' : w.parents.length ? 'Unlink' : '';
    if (msg) { // below the pointer, clear of the node it points at
      const ty = t ? Math.max(d.y + 14, t.y + M.nh + LABH + 4) : d.y + 14;
      ctx.save(); ctx.font = 'bold 11px sans-serif'; const mw = ctx.measureText(msg).width; ctx.fillStyle = S.theme.plotBg || '#fff'; ctx.globalAlpha = 0.85; ctx.fillRect(d.x + 8, ty - 8, mw + 8, 16); ctx.globalAlpha = 1; ctx.restore();
      tag(msg, d.x + 12, ty, d.problem ? '#c33' : tw ? '#1a8f2e' : '#1883d7');
    }
  }
  // icons: the picture of the window under the pointer, beside its node (screen coordinates)
  function drawPreview(W, H, bg) {
    if (opts.pics || drag || typeof hover !== 'number') return;
    const n = nodes.get(hover), p = n && pictureOf(n.w); if (!p) return;
    const pw = p.text != null ? 150 : 220, ph = p.text != null ? 64 : Math.round(Math.min(150, Math.max(70, 220 * p.h / p.w)));
    const sx = (n.x + M.nw) * view.z + view.x + 14, sy = n.y * view.z + view.y - 6;
    const x = sx + pw > W - 4 ? Math.max(4, (n.x * view.z + view.x) - pw - 14) : sx, y = Math.max(4, Math.min(sy, H - ph - 4));
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 8; ctx.fillStyle = bg; ctx.fillRect(x, y, pw, ph); ctx.restore();
    drawPicture(p, x, y, pw, ph, luminance(bg) > 0.5 ? '#fff' : '#1b1e23');
    ctx.strokeStyle = '#1883d7'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
  }
  function linkTip(l) {
    const a = S.wins.get(l.from), b = S.wins.get(l.to); if (!a || !b) return '';
    if (l.kind === 'overlay') return `${a.label} shown as overlay in ${b.label}\nRight-click to remove the overlay`;
    return `${a.label} → ${b.label}${b.parents.length ? '' : ' (unlinked: keeps its last result)'}\nRight-click to ${b.parents.length ? 'unlink' : 'link again'}; drag the input of ${b.label} to another window to re-link it`;
  }
  function luminance(c) { const m = String(c).match(/\d+(\.\d+)?/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 1; }
  // the picked values of a window: icon with the picker's ring-and-cross mark, "Picked values (n)" and a "P1 x | y" line
  // per point (highlighted: the point selected in its window; blue frame: the node was clicked)
  function drawPickNode(pn, color) {
    const { x, y } = pn, cx = x + PICON / 2, cy = y + PICON / 2, th = S.theme, n = pn.ps.length;
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, y + PICON); g.addColorStop(0, '#fffdf8'); g.addColorStop(1, '#efdbc0');
    ctx.fillStyle = g; ctx.fillRect(x, y, PICON, PICON);
    ctx.strokeStyle = '#8b6b45'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, PICON - 1, PICON - 1);
    if (pickFocus && pickFocus.id === pn.w.id && pickFocus.k == null) { ctx.strokeStyle = '#1883d7'; ctx.lineWidth = 2; ctx.strokeRect(x - 1.5, y - 1.5, PICON + 3, PICON + 3); }
    ctx.strokeStyle = '#c45f00'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
    ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9); ctx.stroke();
    const fam = String(th.font || '11px monospace').replace(/^(bold\s+)?[\d.]+px\s+/, ''), tx = x + PICON + 6;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px ' + fam; ctx.fillStyle = th.text;
    const title = fitText(`Picked values (${n})`, COLW + 20); ctx.fillText(title, tx, cy); pn.tx1 = tx + ctx.measureText(title).width;
    ctx.font = '11px ' + fam; pn.lines = [];
    const line = (t, ly, k, on, col) => {
      const tw = ctx.measureText(t).width;
      if (on) { ctx.fillStyle = th.selection || 'rgba(0,120,215,.2)'; ctx.fillRect(tx - 2, ly - PLH / 2, tw + 4, PLH); }
      ctx.fillStyle = col; ctx.fillText(t, tx, ly);
      pn.lines.push({ k, x0: tx - 2, x1: tx + tw + 2, y0: ly - PLH / 2, y1: ly + PLH / 2 });
    };
    pn.ps.slice(0, MAXP).forEach((p, i) => line(fitText(p.short || p.text, COLW + 20), cy + 18 + i * PLH, p.k, p.sel, color));
    if (pn.more) line(`+${pn.more} more… (Picked values table)`, cy + 18 + MAXP * PLH, 'more', false, th.muted);
    ctx.restore();
  }
  function hitPickNode(p) { // { pn, k }: k = the point of the line, 'more', or null for the node itself
    for (const pn of pnodes) {
      for (const l of pn.lines) if (p.x >= l.x0 && p.x <= l.x1 && p.y >= l.y0 && p.y < l.y1) return { pn, k: l.k };
      if (p.x >= pn.x - 3 && p.x <= Math.max(pn.x + PICON + 3, pn.tx1 || 0) && p.y >= pn.y - 3 && p.y <= pn.y + PICON + 3) return { pn, k: null };
    }
    return null;
  }
  const pointOf = ({ pn, k }) => k != null && k !== 'more' ? pn.ps.find(q => q.k === k) : null;
  function pickTip(ph) {
    const w = ph.pn.w, p = pointOf(ph), name = `${w.id}#${w.title}`;
    if (p) return `${p.text}\nClick to select it in ${name}, Del deletes it, right-click for more`;
    if (ph.k === 'more') return `${ph.pn.more} more picked values of ${name} – click for the Picked values table`;
    return `Picked values of ${name}: ${ph.pn.ps.length} point${ph.pn.ps.length === 1 ? '' : 's'}\nClick a line to select its point, double-click for the Picked values table, right-click for commands`;
  }
  function pickClick(ph) { // a line selects its point in the window, the node activates the window, "+N more" opens the table
    if (ph.k === 'more') { root.PICK.table(true); return; }
    pickFocus = { id: ph.pn.w.id, k: ph.k };
    APP.activate(ph.pn.w); if (ph.k != null) root.PICK.select(ph.pn.w, ph.k);
    focus(); refresh();
  }
  async function clearPicks(w) {
    const n = (w.display.picks || []).length;
    if (!n || !await UI.confirmBox('Delete picked values', `Delete all ${n} picked value${n === 1 ? '' : 's'} of ${w.id}#${w.title}?`)) return;
    root.PICK.clear(w); pickFocus = null; refresh();
  }
  function deleteFocusedPick() { // Del: the clicked point if it is still the selected one, or (node clicked) all points
    const pn = pnodes.find(n => n.w.id === pickFocus.id); if (!pn) return;
    if (pickFocus.k == null) return guard(() => clearPicks(pn.w))();
    const p = root.PICK.listOf(pn.w).find(q => q.k === pickFocus.k); // live: the list of the last drawing may be older
    if (p && p.sel) { root.PICK.remove(pn.w, p.k); pickFocus = null; refresh(); }
  }
  const toggleShowPicks = () => { showPicks = !showPicks; save(); refresh(); };
  function pickMenu(ph) { // right-click on a picked values node
    const w = ph.pn.w, P = root.PICK, p = pointOf(ph), pk = p ? 'P' + (p.k + 1) : '';
    return [
      ...(p ? [
        { label: `Show ${pk} in its window`, run: () => { if (w.display.hidden) setHidden([w], false); APP.activate(w); P.select(w, p.k); } },
        { label: `Copy ${pk}`, run: async () => { await navigator.clipboard.writeText(p.text); toast('Copied: ' + p.text); } },
        { label: `Delete ${pk}`, key: 'Del', run: () => { P.remove(w, p.k); pickFocus = null; refresh(); } },
        '-'] : []),
      { label: 'Picked values table…', run: () => P.table(true) },
      { label: 'Copy all points of this window', run: async () => { await navigator.clipboard.writeText(P.text('\t', [w])); toast('Picked values copied (tab-separated)'); } },
      { label: 'Delete all points of this window…', key: p ? '' : 'Del', run: () => clearPicks(w) },
      '-',
      { label: 'Show picked values in the Control Window', checked: () => showPicks, run: toggleShowPicks }
    ];
  }

  function refresh() {
    for (let i = sel.length - 1; i >= 0; i--) if (!S.wins.has(sel[i])) sel.splice(i, 1);
    if (editing && !S.wins.has(editing.w.id)) { editing.input.remove(); editing = null; }
    if (editing) placeRename();
    if (!queued && el && !el.hidden) { queued = true; requestAnimationFrame(draw); }
  }

  /* ---------- zoom, pan, layout options ---------- */
  function zoomTo(z, sx, sy) { // keeps the point under (sx, sy) in place (default: the middle)
    if (sx == null) { sx = body.clientWidth / 2; sy = body.clientHeight / 2; }
    z = Math.min(3, Math.max(0.25, z));
    const wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z;
    Object.assign(view, { z, x: sx - wx * z, y: sy - wy * z, auto: false }); refresh();
  }
  function fitView() { view.auto = true; refresh(); }
  function setOpt(k, v) {
    opts[k] = v; save(); restartTimer();
    if (k !== 'pics') fitView(); else refresh();
    syncBar();
  }
  function setFold(ws, on) { ws.forEach(w => { if (on) w.display.cwFolded = true; else delete w.display.cwFolded; }); refresh(); }
  const foldAll = on => setFold([...S.wins.values()].filter(w => on ? nkids.get(w.id) : w.display.cwFolded), on);
  function syncBar() {
    if (!bar) return;
    const b = c => bar.querySelector(`[data-c=${c}]`);
    b('dir').textContent = opts.dir === 'tb' ? '↓' : '→';
    b('dir').title = opts.dir === 'tb' ? 'Tree from top to bottom (click: left to right)' : 'Tree from left to right (click: top to bottom)';
    b('compact').classList.toggle('on', opts.compact); b('pics').classList.toggle('on', opts.pics);
  }
  function restartTimer() { clearInterval(timer); if (el && !el.hidden) timer = setInterval(refresh, opts.pics ? 500 : 1000); } // labels and pictures follow the windows

  /* ---------- window frame ---------- */
  function save() { // the rectangle only while the window is really shown (a hidden page reports no size)
    const shown = !!(el && !el.hidden && el.offsetWidth > 0), rect = shown ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : load().rect || null;
    try { localStorage.setItem(STORE, JSON.stringify({ on: !!(el && !el.hidden), rect, picks: showPicks, snap, dir: opts.dir, compact: opts.compact, pics: opts.pics })); } catch (e) { /* ignore */ }
  }
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; } }
  function focus() {
    el.style.zIndex = ++S.z; el.classList.add('active');
    if (S.active) S.active.el.classList.remove('active');
  }
  function build() {
    el = h('section', { class: 'win win-control', 'aria-label': 'Control Window' });
    el.innerHTML = `<header class="win-head"><svg class="win-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="2" width="5" height="4" fill="#3a6fd8"/><rect x="10" y="1" width="5" height="4" fill="#2e9e4f"/><rect x="10" y="10" width="5" height="4" fill="#d97706"/><path d="M6 4h4M6 4l4 8" stroke="#d00" fill="none"/></svg>
      <span class="win-title">Control Window</span><span class="win-btns"><button class="wb" data-act="min" title="Minimize / restore">▁</button><button class="wb" data-act="max" title="Maximize / restore">▢</button><button class="wb" data-act="close" title="Close (Alt+W)">✕</button></span></header>
      <div class="cw-bar" role="toolbar" aria-label="Graph view"><button class="cw-b" data-c="fit" title="Fit: the whole graph in the window (F)">Fit</button><button class="cw-b" data-c="out" title="Zoom out (−; or the wheel over the graph)">−</button><span class="cw-zoom" title="Zoom – click for 100 % (0)">100 %</span><button class="cw-b" data-c="in" title="Zoom in (+)">+</button><span class="cw-sep"></span><button class="cw-b" data-c="dir">→</button><button class="cw-b" data-c="compact" title="Compact spacing">Compact</button><button class="cw-b" data-c="pics" title="Pictures of the windows in the nodes">Pictures</button><span class="cw-sep"></span><button class="cw-b" data-c="fold" title="Fold all branches">⊟</button><button class="cw-b" data-c="unfold" title="Unfold all branches">⊞</button></div>
      <div class="cw-body" tabindex="0" role="application" aria-label="Analysis graph: click to select, drag from a port to connect, right-click for commands, F2 or double-click a name to rename"><canvas class="cw-canvas"></canvas></div><div class="win-resize" title="Resize"></div>`;
    body = el.querySelector('.cw-body'); canvas = el.querySelector('canvas'); ctx = canvas.getContext('2d'); bar = el.querySelector('.cw-bar');
    const r = Object.assign({ x: 4, y: 4, w: 340, h: 380 }, load().rect); r.w = Math.max(260, r.w); r.h = Math.max(200, r.h);
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    S.desktop.appendChild(el);
    el.addEventListener('pointerdown', focus, true);
    // move by the caption, resize by the corner
    const dragFrame = (e, resize) => {
      if (e.button !== 0 || e.target.closest('.wb')) return;
      e.preventDefault(); const sx = e.clientX, sy = e.clientY, ox = resize ? el.offsetWidth : el.offsetLeft, oy = resize ? el.offsetHeight : el.offsetTop;
      const mv = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (resize) { el.style.width = Math.max(220, ox + dx) + 'px'; el.style.height = Math.max(140, oy + dy) + 'px'; refresh(); }
        else { el.style.left = Math.max(0, ox + dx) + 'px'; el.style.top = Math.max(0, oy + dy) + 'px'; }
      };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); save(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    };
    el.querySelector('.win-head').addEventListener('pointerdown', e => dragFrame(e, false));
    el.querySelector('.win-head').addEventListener('dblclick', e => { if (!e.target.closest('.wb')) toggleMax(); });
    el.querySelector('.win-resize').addEventListener('pointerdown', e => dragFrame(e, true));
    el.querySelector('[data-act=close]').addEventListener('click', () => toggle(false));
    el.querySelector('[data-act=max]').addEventListener('click', toggleMax);
    el.querySelector('[data-act=min]').addEventListener('click', () => { el.classList.toggle('cw-min'); refresh(); });
    const cmd = { fit: fitView, out: () => zoomTo(view.z / 1.25), in: () => zoomTo(view.z * 1.25), dir: () => setOpt('dir', opts.dir === 'tb' ? 'lr' : 'tb'),
      compact: () => setOpt('compact', !opts.compact), pics: () => setOpt('pics', !opts.pics), fold: () => foldAll(true), unfold: () => foldAll(false) };
    bar.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) { cmd[b.dataset.c](); body.focus({ preventScroll: true }); } });
    bar.querySelector('.cw-zoom').addEventListener('click', () => zoomTo(1));
    syncBar();
    new ResizeObserver(refresh).observe(body);
    wireCanvas();
  }
  function toggleMax() {
    if (maxRect) { Object.assign(el.style, maxRect); maxRect = null; }
    else { maxRect = { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height }; Object.assign(el.style, { left: '0px', top: '0px', width: S.desktop.clientWidth + 'px', height: S.desktop.clientHeight + 'px' }); }
    el.classList.remove('cw-min'); refresh(); save();
  }
  function toggle(force, persist = true) {
    const on = force != null ? !!force : !(el && !el.hidden);
    if (on && !el) build();
    if (!el) return;
    el.hidden = !on;
    if (on) { focus(); refresh(); restartTimer(); }
    else clearInterval(timer);
    if (persist) save();
  }

  /* ---------- mouse & keyboard ---------- */
  function scr(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function at(e) { const s = scr(e); return { x: (s.x - view.x) / view.z, y: (s.y - view.y) / view.z }; } // graph coordinates
  /* ---------- renaming a node (its window): a text box over its label ---------- */
  let editing = null;                               // { w, input } while a name is being typed
  const defaultName = w => w.op ? w.opLabel : null;  // analysis windows can go back to their automatic name
  function setName(w, name) {
    name = String(name || '').trim().slice(0, 120);
    if (!name) { const d = defaultName(w); if (!d) return false; name = d; } // a source window keeps a name
    if (name === w.title) return false;
    w.title = name; w.updateTitle(); APP.emit(); return true;
  }
  function placeRename() { // over the name, where the node is shown now
    const node = nodes.get(editing.w.id); if (!node) return;
    const width = Math.max(120, M.labW + 6);
    Object.assign(editing.input.style, { left: (node.x + M.nw / 2) * view.z + view.x - width / 2 + 'px', top: (node.y + M.nh + 1) * view.z + view.y + 'px', width: width + 'px' });
  }
  function startRename(w) {
    if (!w) return;
    if (!el || el.hidden) toggle(true);
    endRename(false);
    layoutGraph();                                  // a window opened since the last drawing
    if (!nodes.has(w.id)) { unfoldTo(w); layoutGraph(); }
    if (!nodes.has(w.id)) return;
    const input = h('input', { class: 'cw-rename', type: 'text', value: w.title, spellcheck: 'false', 'aria-label': `New name of window ${w.id}`,
      title: 'Enter: rename · Esc: cancel' + (defaultName(w) ? ' · empty: the automatic name' : '') });
    body.append(input); editing = { w, input }; placeRename();
    input.addEventListener('keydown', e => {
      e.stopPropagation();                          // Delete, arrows and shortcuts are for the text here
      if (e.key === 'Enter') { e.preventDefault(); endRename(true); body.focus({ preventScroll: true }); }
      else if (e.key === 'Escape') { e.preventDefault(); endRename(false); body.focus({ preventScroll: true }); }
    });
    input.addEventListener('blur', () => endRename(true));
    input.addEventListener('pointerdown', e => e.stopPropagation());
    input.focus(); input.select();
  }
  function endRename(commit) {
    const ed = editing; if (!ed) return; editing = null;
    ed.input.remove();
    if (commit && S.wins.has(ed.w.id)) setName(ed.w, ed.input.value);
    refresh();
  }
  function unfoldTo(w) { // shows a window hidden in a folded branch
    for (let p = S.wins.get(ups(w)[0]), i = 0; p && i < 1000; p = S.wins.get(ups(p)[0]), i++) delete p.display.cwFolded;
  }
  const renameItems = w => [{ label: 'Rename…', key: 'F2', run: () => startRename(w) },
    { label: 'Use the automatic name', en: () => !!w.op && w.title !== w.opLabel, run: () => { setName(w, ''); refresh(); } }];
  // Add analysis: the analysis menus, run on window w; the new windows go to place (graph coordinates) if given,
  // or (all: the selected windows) the analysis is applied to every one of them
  const ADD_MENUS = ['Signal tools', 'Instruments', '3D tools', 'Scripts'];
  const NOT_ADD = new RegExp('^(' + ['Spectral analysis defaults', 'Import FFT settings', 'Save FFT settings', 'Signal generator', 'Copy detected peaks', 'Statistics \\(show as',
    'Value picker', 'Picked values table', 'Pick snaps to', 'Add pick at', 'Clear picks', 'Clear all picks', 'Marker with harmonics', 'Harmonic cursor', 'Sideband cursor',
    'Release pinned cursor', 'Show values of the pinned', 'Spectrogram view', 'Mesh view', 'Mesh level in dB', 'Cursor', 'Adjust Z-axis', 'Show colour map', 'Invert colours',
    'Palette', 'Edit script', 'Execute script', 'Script parameters', 'JavaScript console'].join('|') + ')'); // settings, cursors and views: not analyses
  const tidy = items => items.filter((it, i, a) => it !== '-' || (i > 0 && a[i - 1] !== '-' && i < a.length - 1));
  function withActive(w, fn) { const a = S.active; S.active = w; try { return fn(); } finally { S.active = a; } }
  function addItems(w, place, all) {
    const wrap = items => tidy(items.filter(it => it === '-' || (!NOT_ADD.test(it.label) && (it.sub || it.run)))
      .map(it => it === '-' ? '-' : it.sub ? { label: it.label, sub: wrap(it.sub) }
        : { label: it.label, en: it.en && (() => withActive(w, it.en)), run: () => all ? onAll(all, it.run) : addTo(w, it.run, place) })
      .filter(it => it === '-' || !it.sub || it.sub.some(x => x !== '-')));
    return ADD_MENUS.map(l => UI.MENUS.find(m => m.label === l)).filter(Boolean).map(m => ({ label: m.label, sub: wrap(m.items) })).filter(m => m.sub.length);
  }
  async function addTo(w, run, place) {
    const before = new Set(S.wins.keys());
    if (w.display.cwFolded) delete w.display.cwFolded; // show what was added
    APP.activate(w); await run();
    if (!place) return;
    const made = [...S.wins.values()].filter(x => !before.has(x.id) && x.parents.includes(w.id)), k = posKey();
    made.forEach((x, i) => {
      const o = i * M.ord;
      x.display[k] = M.lr ? { x: snapV(Math.max(0, place.x)), y: snapV(Math.max(0, place.y - M.nh / 2 + o)) } : { x: snapV(Math.max(0, place.x - M.nw / 2 + o)), y: snapV(Math.max(0, place.y)) };
    });
    refresh();
  }
  function addMenuAt(w, e, place) { // after the click that ends the drag, which would close the menu
    APP.activate(w); const x = e.clientX, y = e.clientY;
    setTimeout(() => UI.popupMenu([{ label: `Add to ${w.label}:`, en: () => false }, '-', ...addItems(w, place)], null, x, y), 0);
  }
  function nodeItems(w) { // on top of the window's own menu
    return [{ label: 'Add analysis', sub: addItems(w, null) },
      ...(nkids.get(w.id) ? [{ label: w.display.cwFolded ? 'Unfold branch' : 'Fold branch', run: () => setFold([w], !w.display.cwFolded) }] : []),
      '-', ...renameItems(w)];
  }
  function linkMenu(l) { // right-click on a curve
    const a = S.wins.get(l.from), b = S.wins.get(l.to); if (!a || !b) return [];
    const go = w => ({ label: `Go to ${w.label} – ${w.title}`, run: () => { if (w.display.hidden) setHidden([w], false); APP.activate(w); } });
    if (l.kind === 'overlay') return [{ label: `Remove overlay ${a.label} from ${b.label}`, run: () => { b.display.overlays = (b.display.overlays || []).filter(o => o !== a.id); APP.requestRender(b); APP.emit(); } }, '-', go(a), go(b)];
    return [
      b.parents.length ? { label: hasIn(b) ? `Unlink ${b.label} from ${a.label}` : `Unlink ${b.label} from its inputs`, run: () => { APP.unlink(b); toast(b.label + ' unlinked – it keeps its last result'); } }
        : { label: `Link ${b.label} to ${a.label} again`, en: () => hasIn(b), run: () => { const e = linkProblem(b, a); if (e) throw new Error(e); APP.link(b, a); } },
      '-', go(a), go(b)];
  }
  function hit(p, skip) { // the node under p (not one of skip: the nodes being dragged)
    for (const n of nodes.values()) if (!(skip && skip.has(n.w.id)) && p.x >= n.x - 6 && p.x <= n.x + M.nw + 6 && p.y >= n.y - 4 && p.y <= n.y + M.nh + LABH) return n.w.id;
    return null;
  }
  function hitPort(p) { // { id, end: 'out' | 'in' }
    const r = Math.min(14, Math.max(3, 7 / view.z));
    for (const n of nodes.values()) {
      const o = outPort(n); if (Math.hypot(p.x - o.x, p.y - o.y) <= r) return { id: n.w.id, end: 'out' };
      if (hasIn(n.w)) { const i = inPort(n); if (Math.hypot(p.x - i.x, p.y - i.y) <= r) return { id: n.w.id, end: 'in' }; }
    }
    return null;
  }
  function hitFold(p) {
    for (const n of nodes.values()) if (nkids.get(n.w.id) && (hover === n.w.id || folded.has(n.w.id))) {
      const b = foldBox(n); if (p.x >= b.x - 2 && p.x <= b.x + b.s + 2 && p.y >= b.y - 2 && p.y <= b.y + b.s + 2) return n.w;
    }
    return null;
  }
  const hitLink = p => links.find(l => nearCurve(l, p, Math.min(10, 4 / view.z))) || null;
  // a finished move: the dragged icons (or picked values node) keep their new place
  function commitMove(d) {
    if (d.type === 'pick') {
      const pn = pnodes.find(x => x.w.id === d.id), n = pn && nodes.get(d.id);
      if (pn && n) pn.w.display[pickKey()] = { dx: snapV(Math.max(0, pn.bx + d.dx)) - n.bx, dy: snapV(Math.max(0, pn.by + d.dy)) - n.by };
      return;
    }
    for (const id of d.ids) { const n = nodes.get(id); if (n) n.w.display[posKey()] = { x: snapV(Math.max(0, n.bx + d.dx)), y: snapV(Math.max(0, n.by + d.dy)) }; }
  }
  function nudge(dx, dy) { // arrow keys: the selected icons by one grid step (Shift: one pixel)
    const k = posKey();
    for (const id of sel) { // from the saved place, so key repeats faster than the redraw add up
      const n = nodes.get(id); if (!n) continue;
      const b = n.w.display[k] || { x: n.bx, y: n.by };
      n.w.display[k] = { x: Math.max(0, b.x + dx), y: Math.max(0, b.y + dy) };
    }
    refresh();
  }
  const moved = w => w.display[posKey()] || w.display[pickKey()];
  function arrange(ws) { ws.forEach(w => { delete w.display[posKey()]; delete w.display[pickKey()]; }); refresh(); }
  const toggleSel = id => { const i = sel.indexOf(id); if (i >= 0) sel.splice(i, 1); else sel.push(id); };
  // a curve dropped: out → the window under the pointer works on this one, or the Add analysis menu there;
  // in → this window works on the one under the pointer, or (empty space) is unlinked
  function dropWire(d, e) {
    const w = S.wins.get(d.id), t = d.target != null && S.wins.get(d.target); if (!w) return;
    if (!d.moved) { if (d.end === 'out') addMenuAt(w, e, null); return; }
    if (t) {
      const [c, p] = d.end === 'out' ? [t, w] : [w, t];
      if (linkedTo(c, p)) return;
      const e2 = linkProblem(c, p); if (e2) throw new Error(e2 + '.');
      APP.link(c, p); toast(`${c.label} now works on ${p.label}`); return;
    }
    if (d.end === 'out') addMenuAt(w, e, { x: d.x, y: d.y });
    else if (w.parents.length) { APP.unlink(w); toast(w.label + ' unlinked – it keeps its last result'); }
  }
  function wireCanvas() {
    canvas.addEventListener('pointerdown', e => {
      if (e.button === 1 || (e.button === 0 && spaceDown)) { // pan
        e.preventDefault(); const s = scr(e);
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
        drag = { type: 'pan', sx: s.x, sy: s.y, vx: view.x, vy: view.y, moved: true }; canvas.style.cursor = 'grabbing'; return;
      }
      if (e.button !== 0) return;
      body.focus({ preventScroll: true });
      const p = at(e), ph = hitPickNode(p), at0 = { sx: p.x, sy: p.y, x: p.x, y: p.y, dx: 0, dy: 0, moved: false, ctrl: e.ctrlKey, shift: e.shiftKey, shift0: e.shiftKey };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no pointer to capture */ }
      if (ph) { drag = Object.assign({ type: 'pick', id: ph.pn.w.id, ph }, at0); return; } // the picked values node: click or move
      pickFocus = null;
      const fw = hitFold(p); if (fw) { setFold([fw], !fw.display.cwFolded); return; }
      const pt = hitPort(p); if (pt) { drag = Object.assign({ type: 'wire', id: pt.id, end: pt.end, target: null }, at0); return; }
      const id = hit(p);
      drag = id != null ? Object.assign({ type: 'node', id, ids: new Set(sel.includes(id) ? sel : [id]) }, at0) : Object.assign({ type: 'rect' }, at0);
    });
    canvas.addEventListener('pointermove', e => {
      if (drag && drag.type === 'pan') { const s = scr(e); Object.assign(view, { x: drag.vx + s.x - drag.sx, y: drag.vy + s.y - drag.sy, auto: false }); refresh(); return; }
      const p = at(e), id = hit(p, drag && (drag.ids || (drag.type === 'wire' ? new Set([drag.id]) : null))), ph = id == null ? hitPickNode(p) : null, hv = ph ? `p${ph.pn.w.id}:${ph.k}` : id;
      hoverPick = ph;
      const hl = !drag && id == null && !ph ? hitLink(p) : null;
      if (hv !== hover || hl !== hoverLink && !(hl && hoverLink && hl.from === hoverLink.from && hl.to === hoverLink.to && hl.kind === hoverLink.kind)) { hover = hv; hoverLink = hl; refresh(); }
      if (!drag) { canvas.style.cursor = spaceDown ? 'grab' : hitPort(p) ? 'crosshair' : id != null || ph ? 'grab' : hl ? 'pointer' : ''; return; }
      Object.assign(drag, { x: p.x, y: p.y, dx: p.x - drag.sx, dy: p.y - drag.sy, ctrl: e.ctrlKey, shift: drag.shift0 || e.shiftKey }); // Shift held at the start or now
      if (!drag.moved && Math.hypot(drag.dx, drag.dy) * view.z > 5) drag.moved = true;
      if (drag.type === 'node') {
        const one = drag.ids.size === 1, src = S.wins.get(drag.id);
        drag.target = one && id != null ? id : null;                                   // dropped onto an icon: copy / move the analysis
        drag.dup = one && drag.target == null && drag.shift && !!src && !src.op;      // Shift: duplicate a source
      } else if (drag.type === 'wire') {
        const w = S.wins.get(drag.id), t = id != null && S.wins.get(id);
        drag.target = t ? id : null;
        drag.problem = !t || !w ? null : drag.end === 'out' ? (linkedTo(t, w) ? null : linkProblem(t, w)) : (linkedTo(w, t) ? null : linkProblem(w, t));
      }
      if (drag.moved) { canvas.style.cursor = drag.type === 'wire' ? (drag.problem ? 'not-allowed' : 'crosshair') : drag.target != null || drag.dup ? 'copy' : 'grabbing'; refresh(); }
    });
    canvas.addEventListener('pointerup', e => {
      const d = drag; drag = null; if (!d) return;
      if (d.type === 'node' && d.moved && d.target == null && !d.dup && e.shiftKey && d.ids.size === 1) { const src = S.wins.get(d.id); d.dup = !!src && !src.op; } // Shift pressed at the drop
      canvas.style.cursor = '';
      if (d.type === 'pan') { refresh(); return; }
      if (d.type === 'pick') { if (d.moved) commitMove(d); else pickClick(d.ph); refresh(); return; }
      if (d.type === 'wire') { guard(() => dropWire(d, e))(); refresh(); return; }
      if (d.type === 'rect') {
        if (d.moved) {
          const [x0, x1] = [Math.min(d.sx, d.x), Math.max(d.sx, d.x)], [y0, y1] = [Math.min(d.sy, d.y), Math.max(d.sy, d.y)];
          for (const n of nodes.values()) if (n.x + M.nw > x0 && n.x < x1 && n.y + M.nh > y0 && n.y < y1) {
            const i = sel.indexOf(n.w.id);
            if (d.ctrl && i >= 0) sel.splice(i, 1); else if (!d.ctrl && i < 0) sel.push(n.w.id);
          }
        }
      } else if (!d.moved) { toggleSel(d.id); const w = S.wins.get(d.id); if (w) { APP.activate(w); focus(); } }
      else if (d.target != null || d.dup) guard(() => dropNode(d.id, d.target, d.ctrl))();
      else commitMove(d);
      refresh();
    });
    canvas.addEventListener('pointerleave', () => { if (hover != null || hoverLink) { hover = null; hoverLink = null; refresh(); } });
    canvas.addEventListener('wheel', e => { // zoom at the pointer; Shift: pan up and down, Alt (or a sideways swipe): left and right
      e.preventDefault();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 200 : 1, d = (e.deltaY || e.deltaX) * k;
      if (e.shiftKey) { Object.assign(view, { y: view.y - d, auto: false }); refresh(); return; }
      if (e.altKey || (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey)) { Object.assign(view, { x: view.x - d, auto: false }); refresh(); return; }
      const s = scr(e); zoomTo(view.z * Math.exp(-e.deltaY * k * (e.ctrlKey ? 0.01 : 0.0015)), s.x, s.y);
    }, { passive: false });
    canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }); // no auto-scroll: the middle button pans
    canvas.addEventListener('dblclick', e => {
      const ph = hitPickNode(at(e));
      if (ph) { // the node: the Picked values table; a line: its window to the front
        if (ph.k == null) root.PICK.table(true);
        else if (ph.k !== 'more') { if (ph.pn.w.display.hidden) setHidden([ph.pn.w], false); APP.activate(ph.pn.w); root.PICK.select(ph.pn.w, ph.k); }
        return;
      }
      const p = at(e), id = hit(p), w = id != null && S.wins.get(id);
      if (!w) { if (!hitLink(p) && !hitFold(p)) fitView(); return; } // empty space: the whole graph
      if (p.y > nodes.get(id).y + M.nh) { startRename(w); return; } // on the name under the icon
      if (w.display.hidden) setHidden([w], false); APP.activate(w);
    });
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      const p = at(e), ph = hitPickNode(p);
      if (ph) {
        if (ph.k !== 'more') { pickFocus = { id: ph.pn.w.id, k: ph.k }; if (ph.k != null) root.PICK.select(ph.pn.w, ph.k); }
        refresh(); UI.popupMenu(pickMenu(ph), null, e.clientX, e.clientY); return;
      }
      const id = hit(p), w = id != null && S.wins.get(id);
      if (w) { UI.windowMenu(w, null, e.clientX, e.clientY, nodeItems(w)); return; }
      const l = hitLink(p);
      if (l) UI.popupMenu(linkMenu(l), null, e.clientX, e.clientY);
      else UI.popupMenu(selectionMenu(), null, e.clientX, e.clientY);
    });
    body.addEventListener('keydown', e => { // handled here only (Del would otherwise close the active window)
      const plain = !e.ctrlKey && !e.altKey && !e.metaKey;
      if (e.key === 'Delete') { // after a click on a picked values node: its point(s), else the selected windows
        e.preventDefault(); e.stopPropagation();
        if (pickFocus) deleteFocusedPick(); else if (sel.length) guard(deleteSelected)();
      }
      else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); selectAll(); }
      else if (e.key === 'F2') { e.preventDefault(); e.stopPropagation(); const w = S.active && S.wins.has(S.active.id) ? S.active : S.wins.get(sel[sel.length - 1]); if (w) startRename(w); } // the clicked node
      else if (e.key === 'Escape' && sel.length) { e.stopPropagation(); sel.length = 0; refresh(); }
      else if (e.key === ' ' && plain) { e.preventDefault(); e.stopPropagation(); if (!spaceDown) { spaceDown = true; canvas.style.cursor = 'grab'; } }
      else if (plain && ['+', '=', '-', '0', 'f', 'F'].includes(e.key)) { // zoom
        e.preventDefault(); e.stopPropagation();
        if (e.key === '+' || e.key === '=') zoomTo(view.z * 1.25); else if (e.key === '-') zoomTo(view.z / 1.25); else if (e.key === '0') zoomTo(1); else fitView();
      }
      else if (e.key.startsWith('Arrow') && plain) { // nudge the selected icons, or pan the view
        e.preventDefault(); e.stopPropagation();
        const st = sel.length ? (e.shiftKey ? 1 : GRID) : 40, dv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
        if (!dv) return;
        if (sel.length) nudge(dv[0], dv[1]); else { Object.assign(view, { x: view.x - dv[0], y: view.y - dv[1], auto: false }); refresh(); }
      }
    });
    const spaceUp = () => { if (spaceDown) { spaceDown = false; canvas.style.cursor = ''; } };
    body.addEventListener('keyup', e => { if (e.key === ' ') spaceUp(); });
    body.addEventListener('blur', spaceUp);
  }

  // Drag 'n drop: onto an icon = copy the dragged analysis tree there (Ctrl: move it);
  // a source window dropped with Shift is duplicated with its analysis tree
  function dropNode(id, targetId, move) {
    const src = S.wins.get(id), dst = targetId != null && S.wins.get(targetId);
    if (!src) return;
    if (dst) {
      if (move) {
        if (!src.op) throw new Error('Only analysis windows can be moved to another window; source windows can be copied.');
        APP.link(src, dst); toast(`${src.label} now works on ${dst.label}`); return;
      }
      if (src.op && src.kind !== 'instrument' && dst.kind !== '1d') throw new Error('The analysis can only be applied to a signal window.');
      const n = APP.applyTool(dst, APP.toolFromWindow(src, !!src.op));
      toast(`Copied ${n} window${n === 1 ? '' : 's'} to ${dst.label}`); return;
    }
    if (src.op) { toast('Drop the icon on a window to apply a copy of this analysis there.'); return; }
    if (move) return;
    const d = src.data; if (!d) throw new Error('This window has no data yet.');
    const copy = APP.createWindow({ kind: src.kind, title: src.title + ' (copy)', source: { type: 'copy' }, display: { style: src.display.style },
      data: Object.assign({}, d, { y: d.y && d.y.slice(), x: d.x && d.x.slice() }) });
    const n = src.children.size ? APP.applyTool(copy, APP.toolFromWindow(src, false)) : 0;
    toast(`Duplicated ${src.label}${n ? ` with ${n} analysis window${n === 1 ? '' : 's'}` : ''}`);
  }

  /* ---------- commands on the selected windows ---------- */
  const selW = () => sel.map(id => S.wins.get(id)).filter(Boolean);
  const sig1 = () => selW().filter(w => w.kind === '1d' && w.data && w.data.y);
  const uni = () => sig1().filter(w => !w.data.x);
  function selectAll() { sel.splice(0, sel.length, ...[...nodes.keys()].sort((a, b) => a - b)); refresh(); }
  function setHidden(ws, hidden) {
    for (const w of ws) { w.display.hidden = hidden; w.el.style.display = hidden ? 'none' : ''; if (!hidden) APP.requestRender(w); }
    refresh();
  }
  async function deleteSelected() {
    const ws = selW(); if (!ws.length) return;
    if (!await UI.confirmBox('Delete selected windows', `Delete ${ws.length} window${ws.length === 1 ? '' : 's'}? Their child windows stay, unlinked.`)) return;
    ws.forEach(APP.closeWindow); sel.length = 0; refresh();
  }
  // Run a command on the first selected window, then copy the windows it created to the other selected windows,
  // so a settings dialog is shown only once
  async function onAll(ws, fn) {
    if (!ws.length) return;
    const first = ws[0], before = new Set(S.wins.keys());
    APP.activate(first); await fn();
    const tops = [...S.wins.values()].filter(w => !before.has(w.id) && w.parents.includes(first.id));
    if (!tops.length || ws.length < 2) return;
    const tools = tops.map(t => APP.toolFromWindow(t, true));
    for (const w of ws.slice(1)) for (const t of tools) APP.applyTool(w, t);
    toast(`Applied to ${ws.length} windows`);
  }
  const menuRun = (menu, label) => () => { const it = UI.findItem(menu, label); if (!it) throw new Error(label + ' is not available'); return it.run(); };
  const sameRate = ws => ws.every(w => Math.abs(w.data.dx - ws[0].data.dx) <= Math.abs(ws[0].data.dx) * 1e-9);
  async function saveSelected(ws, visible) {
    if (!sameRate(ws)) throw new Error('The selected signals have different sample rates; one WAV file needs one rate.');
    const v = await dialog({ title: visible ? 'Save visible part of selected signals' : 'Save selected signals', intro: `${ws.length} signals as channels of one WAV file (shorter ones are padded with zeros).`, fields: [
      { key: 'fmt', label: 'Format', type: 'select', options: [['float32', 'WAV – 32-bit float'], ['int16', 'WAV – 16-bit PCM (normalized)']], value: 'float32' },
      { key: 'name', label: 'File name', type: 'text', value: 'signals' }] });
    if (!v) return;
    const ys = ws.map(w => (visible ? APP.visibleData(w) : w.data).y), n = Math.max(...ys.map(y => y.length));
    const ch = ys.map(y => { const a = new Float32Array(n); a.set(y); return a; });
    download(safeName(v.name) + '.wav', new Blob([IO.encodeWav(ch, 1 / ws[0].data.dx, v.fmt)], { type: 'audio/wav' }));
  }
  function exportCsv(ws, xy) {
    const f = v => IO.fmtNum ? IO.fmtNum(v) : String(v), n = Math.max(...ws.map(w => w.data.y.length)), lines = [];
    lines.push(ws.map(w => xy ? `${w.label} x;${w.label} y` : w.label).join(';'));
    for (let i = 0; i < n; i++) lines.push(ws.map(w => { const d = w.data; if (i >= d.y.length) return xy ? ';' : ''; const y = f(d.y[i]); return xy ? `${f(d.x ? d.x[i] : d.x0 + i * d.dx)};${y}` : y; }).join(';'));
    download('signals.csv', lines.join('\r\n') + '\r\n', 'text/csv');
  }
  function combine(ws, stacked) { // new window showing the first selected signal with the others as overlays / stacked
    const [a, ...rest] = ws;
    const w = APP.createWindow({ kind: '1d', title: (stacked ? 'Signals: ' : 'Overlay: ') + ws.map(x => x.label).join(', '), op: { type: 'calc', params: { expr: 'W' + a.id } }, parents: [a.id],
      display: { overlays: rest.map(x => x.id), stacked } });
    APP.requestRender(w);
  }
  function average(ws) {
    APP.createWindow({ kind: '1d', title: 'Average of ' + ws.map(x => x.label).join(', '), op: { type: 'calc', params: { expr: '(' + ws.map(x => 'W' + x.id).join(' + ') + ') / ' + ws.length } }, parents: ws.map(x => x.id) });
  }
  function concat(ws) { // sample rate of the first signal
    const n = ws.reduce((s, w) => s + w.data.y.length, 0), y = new Float64Array(n); let o = 0;
    for (const w of ws) { y.set(w.data.y, o); o += w.data.y.length; }
    const d = ws[0].data;
    APP.createWindow({ kind: '1d', title: 'Concatenated ' + ws.map(x => x.label).join(' + '), source: { type: 'copy' }, data: { y, x0: d.x0, dx: d.dx, xUnit: d.xUnit, yUnit: d.yUnit } });
  }
  async function zoomAll(ws) {
    const w0 = ws[0], v = await dialog({ title: 'Zoom to part (on all selected)', fields: [
      { key: 'a', label: `From${w0.data.xUnit ? ' (' + w0.data.xUnit + ')' : ''}`, type: 'number', value: +PLOT.fmt(w0.view.x0, w0.view.x1 - w0.view.x0) },
      { key: 'b', label: `To${w0.data.xUnit ? ' (' + w0.data.xUnit + ')' : ''}`, type: 'number', value: +PLOT.fmt(w0.view.x1, w0.view.x1 - w0.view.x0) }],
      validate: v => !(v.b > v.a) ? '"To" must be greater than "From"' : null });
    if (v) ws.forEach(w => APP.setViewX(w, v.a, v.b));
  }
  function allTools(ws) { // Use custom tool on all selected: the same menu without the file and folder entries
    const wrap = items => items.filter(it => it === '-' || it.sub || (it.run && it.label !== 'From file…' && !/folder|Delete saved/.test(it.label)))
      .map(it => it === '-' ? '-' : it.sub ? { label: it.label, sub: wrap(it.sub) } : { label: it.label, run: () => onAll(ws, it.run) })
      .filter((it, i, a) => it !== '-' || (i > 0 && a[i - 1] !== '-' && i < a.length - 1));
    return UI.customToolItems ? wrap(UI.customToolItems()) : [];
  }
  const viewItems = () => [
    { label: 'Fit the graph in the window', key: 'F', run: fitView },
    { label: 'Zoom 100 %', key: '0', run: () => zoomTo(1) },
    '-',
    { label: 'Tree from left to right', checked: () => opts.dir !== 'tb', run: () => setOpt('dir', 'lr') },
    { label: 'Tree from top to bottom', checked: () => opts.dir === 'tb', run: () => setOpt('dir', 'tb') },
    { label: 'Compact spacing', checked: () => opts.compact, run: () => setOpt('compact', !opts.compact) },
    { label: 'Pictures of the windows in the nodes', checked: () => opts.pics, run: () => setOpt('pics', !opts.pics) },
    '-',
    { label: 'Fold all branches', en: () => [...nkids.values()].some(Boolean), run: () => foldAll(true) },
    { label: 'Unfold all branches', en: () => [...S.wins.values()].some(w => w.display.cwFolded), run: () => foldAll(false) },
    { label: 'Fold selected branches', en: () => selW().some(w => nkids.get(w.id)), run: () => setFold(selW().filter(w => nkids.get(w.id)), true) }];
  function selectionMenu() {
    const n = () => selW().length;
    return [
      { label: 'Rename selected window…', key: 'F2', en: () => n() === 1, run: () => startRename(selW()[0]) },
      { label: 'Add analysis (on all selected)', get sub() { const ws = selW(); return ws.length ? addItems(ws[0], null, ws) : [{ label: 'Select windows first', en: () => false }]; } },
      { label: 'Graph view and layout', sub: viewItems() },
      '-',
      { label: 'Select all windows', key: 'Ctrl+A', run: selectAll },
      { label: 'Clear selection', en: () => n() > 0, run: () => { sel.length = 0; refresh(); } },
      { label: 'Invert selection', run: () => { const all = [...nodes.keys()].sort((a, b) => a - b), cur = new Set(sel); sel.splice(0, sel.length, ...all.filter(id => !cur.has(id))); refresh(); } },
      '-',
      { label: 'Arrange icons automatically', en: () => [...S.wins.values()].some(moved), run: () => arrange([...S.wins.values()]) },
      { label: 'Arrange selected icons automatically', en: () => selW().some(moved), run: () => arrange(selW()) },
      { label: 'Snap icons to grid', checked: () => snap, run: () => { snap = !snap; save(); } },
      '-',
      { label: 'Hide selected windows', en: () => n() > 0, run: () => setHidden(selW(), true) },
      { label: 'Show selected windows', en: () => n() > 0, run: () => setHidden(selW(), false) },
      { label: 'Delete selected windows', key: 'Del', en: () => n() > 0, run: deleteSelected },
      '-',
      { label: 'Save selected signals (in one file) as…', en: () => uni().length > 0, run: () => saveSelected(uni(), false) },
      { label: 'Save visible part of selected signals (in one file) as…', en: () => uni().length > 0, run: () => saveSelected(uni(), true) },
      { label: 'Export selected signals in one ASCII/CSV file (X/Y values)…', en: () => sig1().length > 0, run: () => exportCsv(sig1(), true) },
      { label: 'Export selected signals in one ASCII/CSV file (Y values only)…', en: () => sig1().length > 0, run: () => exportCsv(sig1(), false) },
      '-',
      { label: 'Show selected in one window', en: () => sig1().length > 1, run: () => combine(sig1(), true) },
      { label: 'Show selected as overlay', en: () => sig1().length > 1, run: () => combine(sig1(), false) },
      '-',
      { label: 'Show average from selected signals', en: () => uni().length > 1, run: () => average(uni()) },
      { label: 'Concatenate all selected signals', en: () => uni().length > 1, run: () => concat(uni()) },
      '-',
      { label: 'FFT spectrum analysis (on all selected)', en: () => uni().length > 0, run: () => onAll(uni(), menuRun('Signal tools', 'FFT with default spectral analysis settings')) },
      { label: 'Time FFT… (on all selected)', en: () => uni().length > 0, run: () => onAll(uni(), menuRun('3D tools', 'Time FFT…')) },
      { label: 'Spectrogram… (on all selected)', en: () => uni().length > 0, run: () => onAll(uni(), menuRun('3D tools', 'Spectrogram…')) },
      { label: 'Filter… (on all selected)', en: () => uni().length > 0, run: () => onAll(uni(), menuRun('Signal tools', 'FFT filter…')) },
      { label: 'Use custom tool (on all selected)', get sub() { return allTools(selW()); } },
      ...(root.CONTROL_EXTRA ? root.CONTROL_EXTRA(selW()) : []), // e.g. Geometry with the selected signals
      '-',
      { label: 'Zoom to part… (on all selected)', en: () => sig1().length > 0, run: () => zoomAll(sig1()) },
      { label: 'Ruler in sample units (on all selected)', en: () => uni().length > 0, checked: () => uni().length > 0 && uni().every(w => w.display.sampleUnits),
        run: () => { const ws = uni(), on = !ws.every(w => w.display.sampleUnits); ws.forEach(w => { w.display.sampleUnits = on; APP.requestRender(w); }); } },
      '-',
      { label: 'Show picked values in the Control Window', checked: () => showPicks, run: toggleShowPicks },
      { label: 'Picked values table…', en: () => !!root.PICK, run: () => root.PICK.table(true) },
      { label: 'Copy picked values of selected windows', en: () => !!root.PICK && root.PICK.rows(selW()).length > 0,
        run: async () => { await navigator.clipboard.writeText(root.PICK.text('\t', selW())); toast('Picked values copied (tab-separated)'); } },
      { label: 'Clear picks of selected windows', en: () => !!root.PICK && root.PICK.rows(selW()).length > 0, run: () => { selW().forEach(w => root.PICK.clear(w)); refresh(); } },
      '-',
      { label: 'Unlink selected windows', en: () => selW().some(w => w.parents.length), run: () => { selW().forEach(w => { if (w.parents.length) APP.unlink(w); }); refresh(); } },
      { label: 'Link selected windows to their parent again', en: () => selW().some(w => w.frozen && w.op && ups(w).length),
        run: () => { selW().forEach(w => { const p = w.frozen && w.op && ups(w)[0]; if (p != null) APP.link(w, S.wins.get(p)); }); refresh(); } }
    ];
  }

  APP.onChange(() => { refresh(); if (el && !el.hidden && S.active && S.active.el.classList.contains('active')) el.classList.remove('active'); });
  root.CONTROL = {
    toggle, refresh, visible: () => !!(el && !el.hidden), selected: selW, rename: w => startRename(w),
    where: id => { // a node and its ports in client coordinates (null: not shown)
      const n = el && !el.hidden && (layoutGraph(), nodes.get(id)); if (!n) return null;
      const r = canvas.getBoundingClientRect(), c = q => ({ x: r.left + q.x * view.z + view.x, y: r.top + q.y * view.z + view.y });
      return Object.assign(c(n), { w: M.nw * view.z, h: M.nh * view.z, out: c(outPort(n)), in: c(inPort(n)) });
    },
    restore: () => {
      const st = load(); showPicks = st.picks !== false; snap = st.snap !== false;
      opts.dir = st.dir === 'tb' ? 'tb' : 'lr'; opts.compact = !!st.compact; opts.pics = !!st.pics;
      if (st.on && !(innerWidth > 0 && innerWidth < 700)) toggle(true, false); // not on phones
    }
  };
})(window);
