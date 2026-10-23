/* OpenSig Control Window (System control ▸ Control window, Alt+W): the analysis graph, where every window is an icon,
   lines run from each parent to its children (dotted when the link is off), and the windows can be handled together.
   Click an icon to select or unselect it (the number is the selection order), drag a rectangle over empty space to
   select several (with Ctrl: unselect), right-click an icon for that window's menu or empty space for the commands on
   all selected windows, Del deletes the selection, double-click brings a window to the front. Icons can be dragged
   anywhere (all selected icons together; arrow keys nudge them) and keep their place, saved with the workspace;
   "Arrange icons automatically" brings back the tree layout. Dropping an icon onto another copies its analysis tree to
   that window (Ctrl: moves it); a source icon dropped with Shift is duplicated together with its analysis. The picked values (Value picker) of a window are one node linked to it, listing every
   point: click a line to select that point in its window, double-click the node for the table, right-click for its
   commands. */
(function (root) {
  'use strict';
  const { APP, UI, OPS, IO, PLOT } = root;
  const S = APP.S, { dialog, toast, h, guard, download, safeName } = UI;
  const ICON = 34, COLW = 150, ROWH = 64, PADX = 26, PADY = 16;
  const STORE = 'opensig.control';
  const GRID = 8;                                   // snap step for moved icons
  let snap = true;
  const snapV = v => snap ? Math.round(v / GRID) * GRID : Math.round(v);
  const sel = [];                                   // selected window ids, in selection order
  let el = null, body, canvas, ctx, nodes = new Map(), size = { w: 0, h: 0 }, drag = null, hover = null, queued = false, timer = null, maxRect = null;
  // picked values (Value picker): one node per window, in the column after it, listing up to MAXP points ("+N more")
  const PICON = 24, PLH = 14, MAXP = 12;
  let showPicks = true, pnodes = [], pickFocus = null, hoverPick = null; // pickFocus: { id, k } of the last click (k null: the node)
  const picksOf = w => showPicks && root.PICK ? root.PICK.listOf(w) : [];
  const pickLines = n => Math.min(n, MAXP) + (n > MAXP ? 1 : 0);
  const pickHeight = n => Math.max(ROWH, ICON / 2 + 22 + pickLines(n) * PLH);

  /* ---------- graph ---------- */
  const ups = w => (w.parents.length ? w.parents : w.formerParents || []).filter(p => S.wins.has(p)); // former parents: unlinked
  function layoutGraph() {
    const wins = [...S.wins.values()].sort((a, b) => a.id - b.id), kids = new Map(wins.map(w => [w.id, []])), roots = [], depth = new Map();
    for (const w of wins) { const p = ups(w)[0]; if (p != null) kids.get(p).push(w); else roots.push(w); }
    const dOf = (w, guardSet = new Set()) => {
      if (depth.has(w.id)) return depth.get(w.id);
      if (guardSet.has(w.id)) return 0; guardSet.add(w.id);
      const ps = ups(w).map(p => S.wins.get(p)), d = ps.length ? 1 + Math.max(...ps.map(p => dOf(p, guardSet))) : 0;
      depth.set(w.id, d); return d;
    };
    wins.forEach(w => dOf(w));
    // leaves take the next free place, a parent sits in the middle of its children; the picked values
    // node of a window is a leaf of it, after its child windows, as tall as its list
    let yCur = PADY; const yOf = new Map(), pickAt = new Map();
    const place = w => {
      const ch = kids.get(w.id), ps = picksOf(w);
      if (!ch.length && !ps.length) { yOf.set(w.id, yCur); yCur += ROWH; return; }
      ch.forEach(place);
      const tops = ch.map(c => yOf.get(c.id));
      if (ps.length) { pickAt.set(w.id, { ps, y: yCur }); tops.push(yCur); yCur += pickHeight(ps.length); }
      const y = (tops[0] + tops[tops.length - 1]) / 2;
      yOf.set(w.id, y); yCur = Math.max(yCur, y + ROWH);
    };
    roots.forEach(place);
    nodes = new Map(); pnodes = []; let mx = 0;
    for (const w of wins) {
      const x = PADX + depth.get(w.id) * COLW, y = yOf.get(w.id);
      nodes.set(w.id, { w, x, y }); mx = Math.max(mx, x);
    }
    for (const [id, { ps, y }] of pickAt) { // the icon centred on the row like the window icons
      const n = nodes.get(id), x = n.x + COLW; mx = Math.max(mx, x);
      pnodes.push({ w: n.w, ps, more: Math.max(0, ps.length - MAXP), x, y: y + (ICON - PICON) / 2, lines: [] });
    }
    size = { w: mx + COLW + (pnodes.length ? 50 : 0), h: yCur + PADY }; // the lists may run into the next column
    // icons moved by hand keep their place (display.cwPos, saved with the workspace); a picked values node keeps its
    // offset to its window (display.cwPickPos), so it moves with the window. bx/by: the place without a drag running.
    const mv = drag && drag.moved && drag.target == null && !drag.dup ? drag : null;
    for (const n of nodes.values()) {
      const pos = n.w.display.cwPos;
      n.ax = n.x; n.ay = n.y;
      if (pos) { n.x = pos.x; n.y = pos.y; }
      n.bx = n.x; n.by = n.y;
      if (mv && mv.type === 'node' && mv.ids.has(n.w.id)) { n.x = snapV(Math.max(0, n.bx + mv.dx)); n.y = snapV(Math.max(0, n.by + mv.dy)); }
    }
    for (const pn of pnodes) {
      const n = nodes.get(pn.w.id), off = pn.w.display.cwPickPos || { dx: pn.x - n.ax, dy: pn.y - n.ay };
      pn.x = pn.bx = Math.max(0, n.x + off.dx); pn.y = pn.by = Math.max(0, n.y + off.dy);
      if (mv && mv.type === 'pick' && mv.id === pn.w.id) { pn.x = snapV(Math.max(0, pn.bx + mv.dx)); pn.y = snapV(Math.max(0, pn.by + mv.dy)); }
    }
    for (const n of nodes.values()) { size.w = Math.max(size.w, n.x + COLW); size.h = Math.max(size.h, n.y + ROWH); }
    for (const pn of pnodes) { size.w = Math.max(size.w, pn.x + COLW + 50); size.h = Math.max(size.h, pn.y + pickHeight(pn.ps.length)); }
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

  function draw() {
    queued = false;
    if (!el || el.hidden) return;
    layoutGraph();
    const th = S.theme, dpr = window.devicePixelRatio || 1;
    const W = Math.max(body.clientWidth, size.w), H = Math.max(body.clientHeight, size.h);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = getComputedStyle(body).backgroundColor || th.plotBg; ctx.fillRect(0, 0, W, H); // light or dark (CSS)
    ctx.font = (th.axisFont || '12px sans-serif');
    const pickColor = luminance(getComputedStyle(body).backgroundColor) > 0.5 ? '#c45f00' : '#ffa040';
    // links: parent → child, dotted when the child is unlinked; inputs of multi-input windows in the overlay colours
    for (const { w, x, y } of nodes.values()) {
      const ps = ups(w), linked = w.parents.length > 0;
      ps.forEach((p, i) => {
        const a = nodes.get(p); if (!a) return;
        ctx.strokeStyle = !linked ? th.muted : ps.length > 1 ? th.overlay[i % th.overlay.length] : '#d00000';
        ctx.setLineDash(linked ? [] : [3, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.x + ICON, a.y + ICON / 2); ctx.lineTo(x, y + ICON / 2); ctx.stroke();
      });
      (w.display.overlays || []).forEach((o, i) => { // overlays shown in this window
        const a = nodes.get(o); if (!a) return;
        ctx.strokeStyle = th.overlay[i % th.overlay.length]; ctx.setLineDash([6, 3]);
        ctx.beginPath(); ctx.moveTo(a.x + ICON, a.y + ICON / 2); ctx.lineTo(x, y + ICON / 2); ctx.stroke();
      });
    }
    for (const pn of pnodes) { // window → its picked values
      const a = nodes.get(pn.w.id);
      ctx.strokeStyle = pickColor; ctx.setLineDash([]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x + ICON, a.y + ICON / 2); ctx.lineTo(pn.x, pn.y + PICON / 2); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const { w, x, y } of nodes.values()) {
      const si = sel.indexOf(w.id), target = drag && drag.moved && drag.target === w.id;
      const g = ctx.createLinearGradient(0, y, 0, y + ICON);
      if (si >= 0) { g.addColorStop(0, '#5ee65e'); g.addColorStop(1, '#22b322'); } else { g.addColorStop(0, '#fbfbfb'); g.addColorStop(1, '#d4d4d4'); }
      ctx.fillStyle = g; ctx.fillRect(x, y, ICON, ICON);
      ctx.strokeStyle = w.error ? th.danger : '#6f6f6f'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, ICON - 1, ICON - 1);
      if (S.active === w || target) { ctx.strokeStyle = target ? '#ff8c00' : '#1883d7'; ctx.lineWidth = 2; ctx.strokeRect(x - 1.5, y - 1.5, ICON + 3, ICON + 3); ctx.lineWidth = 1; }
      glyph(kindOf(w), x, y);
      ctx.fillStyle = th.text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(fitText(labelOf(w), COLW - 14), x + ICON / 2, y + ICON + 3);
      ctx.textBaseline = 'bottom';
      if (si >= 0) { ctx.textAlign = 'left'; ctx.fillText(String(si + 1), x + ICON + 3, y + 2); }
      if (w.display.hidden) { ctx.save(); ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = th.text; ctx.fillText('H', x - 2, y - 2); ctx.restore(); }
      if (w.frozen) { ctx.textAlign = 'right'; ctx.fillStyle = th.muted; ctx.fillText('∅', x - 3, y + ICON); }
    }
    for (const pn of pnodes) drawPickNode(pn, pickColor);
    if (drag && drag.type === 'rect' && drag.moved) {
      const [x0, x1] = [Math.min(drag.sx, drag.x), Math.max(drag.sx, drag.x)], [y0, y1] = [Math.min(drag.sy, drag.y), Math.max(drag.sy, drag.y)];
      ctx.fillStyle = drag.ctrl ? 'rgba(220,40,40,.12)' : 'rgba(0,120,215,.15)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeStyle = drag.ctrl ? '#c33' : '#0078d7'; ctx.setLineDash([4, 2]); ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0); ctx.setLineDash([]);
    }
    if (drag && drag.type === 'node' && drag.moved && (drag.target != null || drag.dup)) { // dragged icon: COPY / MOVE onto an icon, DUPLICATE
      const n = nodes.get(drag.id);
      if (n) {
        ctx.globalAlpha = 0.6; ctx.fillStyle = '#fff'; ctx.fillRect(drag.x - ICON / 2, drag.y - ICON / 2, ICON, ICON); glyph(kindOf(n.w), drag.x - ICON / 2, drag.y - ICON / 2); ctx.globalAlpha = 1;
        ctx.fillStyle = drag.dup ? '#0057b8' : drag.ctrl ? '#c00' : '#060'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = 'bold 11px sans-serif';
        ctx.fillText(drag.dup ? 'DUPLICATE' : drag.ctrl ? 'MOVE' : 'COPY', drag.x + ICON / 2 + 4, drag.y);
      }
    }
    if (!nodes.size) { ctx.fillStyle = th.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('No windows yet.', 12, 12); }
    canvas.title = typeof hover === 'string' && hoverPick ? pickTip(hoverPick) : hover != null && S.wins.get(hover) ? (w => `${w.id}#${w.title}${w.op ? ' – ' + w.opLabel : ''}${w.error ? '\n' + w.error : ''}` +
      (root.PICK ? root.PICK.listOf(w).map(p => '\n' + p.text).join('') : ''))(S.wins.get(hover)) : '';
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
    if (!queued && el && !el.hidden) { queued = true; requestAnimationFrame(draw); }
  }

  /* ---------- window frame ---------- */
  function save() { // the rectangle only while the window is really shown (a hidden page reports no size)
    const shown = !!(el && !el.hidden && el.offsetWidth > 0), rect = shown ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : load().rect || null;
    try { localStorage.setItem(STORE, JSON.stringify({ on: !!(el && !el.hidden), rect, picks: showPicks, snap })); } catch (e) { /* ignore */ }
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
      <div class="cw-body" tabindex="0" role="application" aria-label="Analysis graph: click to select, right-click for commands, F2 or double-click a name to rename"><canvas class="cw-canvas"></canvas></div><div class="win-resize" title="Resize"></div>`;
    body = el.querySelector('.cw-body'); canvas = el.querySelector('canvas'); ctx = canvas.getContext('2d');
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
    if (on) { focus(); refresh(); clearInterval(timer); timer = setInterval(refresh, 1000); } // labels follow recomputed data
    else clearInterval(timer);
    if (persist) save();
  }

  /* ---------- mouse & keyboard ---------- */
  function at(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  /* ---------- renaming a node (its window): a text box over its label ---------- */
  let editing = null;                               // { w, input } while a name is being typed
  const defaultName = w => w.op ? w.opLabel : null;  // analysis windows can go back to their automatic name
  function setName(w, name) {
    name = String(name || '').trim().slice(0, 120);
    if (!name) { const d = defaultName(w); if (!d) return false; name = d; } // a source window keeps a name
    if (name === w.title) return false;
    w.title = name; w.updateTitle(); APP.emit(); return true;
  }
  function startRename(w) {
    if (!w) return;
    if (!el || el.hidden) toggle(true);
    endRename(false);
    if (!nodes.has(w.id)) layoutGraph();          // a window opened since the last drawing
    const node = nodes.get(w.id); if (!node) return;
    const width = Math.max(120, COLW - 8);
    const input = h('input', { class: 'cw-rename', type: 'text', value: w.title, spellcheck: 'false', 'aria-label': `New name of window ${w.id}`,
      title: 'Enter: rename · Esc: cancel' + (defaultName(w) ? ' · empty: the automatic name' : '') });
    Object.assign(input.style, { left: node.x + ICON / 2 - width / 2 + 'px', top: node.y + ICON + 1 + 'px', width: width + 'px' });
    body.append(input); editing = { w, input };
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
  const renameItems = w => [{ label: 'Rename…', key: 'F2', run: () => startRename(w) },
    { label: 'Use the automatic name', en: () => !!w.op && w.title !== w.opLabel, run: () => { setName(w, ''); refresh(); } }];
  function hit(p, skip) { // the icon under p (not one of skip: the icons being dragged)
    for (const n of nodes.values()) if (!(skip && skip.has(n.w.id)) && p.x >= n.x - 6 && p.x <= n.x + ICON + 6 && p.y >= n.y - 4 && p.y <= n.y + ICON + 18) return n.w.id;
    return null;
  }
  // a finished move: the dragged icons (or picked values node) keep their new place
  function commitMove(d) {
    if (d.type === 'pick') {
      const pn = pnodes.find(x => x.w.id === d.id), n = pn && nodes.get(d.id);
      if (pn && n) pn.w.display.cwPickPos = { dx: snapV(Math.max(0, pn.bx + d.dx)) - n.bx, dy: snapV(Math.max(0, pn.by + d.dy)) - n.by };
      return;
    }
    for (const id of d.ids) { const n = nodes.get(id); if (n) n.w.display.cwPos = { x: snapV(Math.max(0, n.bx + d.dx)), y: snapV(Math.max(0, n.by + d.dy)) }; }
  }
  function nudge(dx, dy) { // arrow keys: the selected icons by one grid step (Shift: one pixel)
    for (const id of sel) { // from the saved place, so key repeats faster than the redraw add up
      const n = nodes.get(id); if (!n) continue;
      const b = n.w.display.cwPos || { x: n.bx, y: n.by };
      n.w.display.cwPos = { x: Math.max(0, b.x + dx), y: Math.max(0, b.y + dy) };
    }
    refresh();
  }
  function arrange(ws) { ws.forEach(w => { delete w.display.cwPos; delete w.display.cwPickPos; }); refresh(); }
  const toggleSel = id => { const i = sel.indexOf(id); if (i >= 0) sel.splice(i, 1); else sel.push(id); };
  function wireCanvas() {
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      body.focus({ preventScroll: true });
      const p = at(e), ph = hitPickNode(p), at0 = { sx: p.x, sy: p.y, x: p.x, y: p.y, dx: 0, dy: 0, moved: false, ctrl: e.ctrlKey, shift: e.shiftKey, shift0: e.shiftKey };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no pointer to capture */ }
      if (ph) { drag = Object.assign({ type: 'pick', id: ph.pn.w.id, ph }, at0); return; } // the picked values node: click or move
      pickFocus = null;
      const id = hit(p);
      drag = id != null ? Object.assign({ type: 'node', id, ids: new Set(sel.includes(id) ? sel : [id]) }, at0) : Object.assign({ type: 'rect' }, at0);
    });
    canvas.addEventListener('pointermove', e => {
      const p = at(e), id = hit(p, drag && drag.ids), ph = id == null ? hitPickNode(p) : null, hv = ph ? `p${ph.pn.w.id}:${ph.k}` : id;
      hoverPick = ph;
      if (hv !== hover) { hover = hv; refresh(); }
      if (!drag) { canvas.style.cursor = id != null || ph ? 'grab' : ''; return; }
      Object.assign(drag, { x: p.x, y: p.y, dx: p.x - drag.sx, dy: p.y - drag.sy, ctrl: e.ctrlKey, shift: drag.shift0 || e.shiftKey }); // Shift held at the start or now
      if (!drag.moved && Math.hypot(drag.dx, drag.dy) > 5) drag.moved = true;
      if (drag.type === 'node') {
        const one = drag.ids.size === 1, src = S.wins.get(drag.id);
        drag.target = one && id != null ? id : null;                                   // dropped onto an icon: copy / move the analysis
        drag.dup = one && drag.target == null && drag.shift && !!src && !src.op;      // Shift: duplicate a source
      }
      if (drag.moved) { canvas.style.cursor = drag.target != null || drag.dup ? 'copy' : 'grabbing'; refresh(); }
    });
    canvas.addEventListener('pointerup', e => {
      const d = drag; drag = null; if (!d) return;
      if (d.type === 'node' && d.moved && d.target == null && !d.dup && e.shiftKey && d.ids.size === 1) { const src = S.wins.get(d.id); d.dup = !!src && !src.op; } // Shift pressed at the drop
      canvas.style.cursor = '';
      if (d.type === 'pick') { if (d.moved) commitMove(d); else pickClick(d.ph); refresh(); return; }
      if (d.type === 'rect') {
        if (d.moved) {
          const [x0, x1] = [Math.min(d.sx, d.x), Math.max(d.sx, d.x)], [y0, y1] = [Math.min(d.sy, d.y), Math.max(d.sy, d.y)];
          for (const n of nodes.values()) if (n.x + ICON > x0 && n.x < x1 && n.y + ICON > y0 && n.y < y1) {
            const i = sel.indexOf(n.w.id);
            if (d.ctrl && i >= 0) sel.splice(i, 1); else if (!d.ctrl && i < 0) sel.push(n.w.id);
          }
        }
      } else if (!d.moved) { toggleSel(d.id); const w = S.wins.get(d.id); if (w) { APP.activate(w); focus(); } }
      else if (d.target != null || d.dup) guard(() => dropNode(d.id, d.target, d.ctrl))();
      else commitMove(d);
      refresh();
    });
    canvas.addEventListener('pointerleave', () => { if (hover != null) { hover = null; refresh(); } });
    canvas.addEventListener('dblclick', e => {
      const ph = hitPickNode(at(e));
      if (ph) { // the node: the Picked values table; a line: its window to the front
        if (ph.k == null) root.PICK.table(true);
        else if (ph.k !== 'more') { if (ph.pn.w.display.hidden) setHidden([ph.pn.w], false); APP.activate(ph.pn.w); root.PICK.select(ph.pn.w, ph.k); }
        return;
      }
      const p = at(e), id = hit(p), w = id != null && S.wins.get(id);
      if (w && p.y > nodes.get(id).y + ICON) { startRename(w); return; } // on the name under the icon
      if (w) { if (w.display.hidden) setHidden([w], false); APP.activate(w); } });
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      const ph = hitPickNode(at(e));
      if (ph) {
        if (ph.k !== 'more') { pickFocus = { id: ph.pn.w.id, k: ph.k }; if (ph.k != null) root.PICK.select(ph.pn.w, ph.k); }
        refresh(); UI.popupMenu(pickMenu(ph), null, e.clientX, e.clientY); return;
      }
      const id = hit(at(e)), w = id != null && S.wins.get(id);
      if (w) UI.windowMenu(w, null, e.clientX, e.clientY, renameItems(w));
      else UI.popupMenu(selectionMenu(), null, e.clientX, e.clientY);
    });
    body.addEventListener('keydown', e => { // handled here only (Del would otherwise close the active window)
      if (e.key === 'Delete') { // after a click on a picked values node: its point(s), else the selected windows
        e.preventDefault(); e.stopPropagation();
        if (pickFocus) deleteFocusedPick(); else if (sel.length) guard(deleteSelected)();
      }
      else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); selectAll(); }
      else if (e.key === 'F2') { e.preventDefault(); e.stopPropagation(); const w = S.active && S.wins.has(S.active.id) ? S.active : S.wins.get(sel[sel.length - 1]); if (w) startRename(w); } // the clicked node
      else if (e.key === 'Escape' && sel.length) { e.stopPropagation(); sel.length = 0; refresh(); }
      else if (e.key.startsWith('Arrow') && sel.length && !e.ctrlKey && !e.altKey && !e.metaKey) { // nudge the selected icons
        e.preventDefault(); e.stopPropagation();
        const st = e.shiftKey ? 1 : GRID, dv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
        if (dv) nudge(dv[0], dv[1]);
      }
    });
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
  function selectAll() { sel.splice(0, sel.length, ...[...S.wins.keys()].sort((a, b) => a - b)); refresh(); }
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
  function selectionMenu() {
    const n = () => selW().length;
    return [
      { label: 'Rename selected window…', key: 'F2', en: () => n() === 1, run: () => startRename(selW()[0]) },
      '-',
      { label: 'Select all windows', key: 'Ctrl+A', run: selectAll },
      { label: 'Clear selection', en: () => n() > 0, run: () => { sel.length = 0; refresh(); } },
      { label: 'Invert selection', run: () => { const all = [...S.wins.keys()].sort((a, b) => a - b), cur = new Set(sel); sel.splice(0, sel.length, ...all.filter(id => !cur.has(id))); refresh(); } },
      '-',
      { label: 'Arrange icons automatically', en: () => [...S.wins.values()].some(w => w.display.cwPos || w.display.cwPickPos), run: () => arrange([...S.wins.values()]) },
      { label: 'Arrange selected icons automatically', en: () => selW().some(w => w.display.cwPos || w.display.cwPickPos), run: () => arrange(selW()) },
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
    restore: () => { showPicks = load().picks !== false; snap = load().snap !== false; if (load().on && !(innerWidth > 0 && innerWidth < 700)) toggle(true, false); } // not on phones
  };
})(window);
