/* OpenSig canvas plotting: 2D signal plots, spectrogram images, waterfall (mesh) view, palettes. */
(function (root) {
  'use strict';

  /* ---------- Palettes (analytic colormaps, t in [0,1] → [r,g,b] 0..255) ---------- */
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (stops, t) => {
    t = clamp01(t);
    const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
    return stops[i].map((v, k) => v + (stops[i + 1][k] - v) * f);
  };
  const hsv = t => { const h = t * 6, i = Math.floor(h) % 6, f = h - Math.floor(h); return [[1, f, 0], [1 - f, 1, 0], [0, 1, f], [0, 1 - f, 1], [f, 0, 1], [1, 0, 1 - f]][i].map(v => v * 255); };
  const PALETTES = {
    Gray: t => [t * 255, t * 255, t * 255],
    White: t => [(1 - t) * 255, (1 - t) * 255, (1 - t) * 255],
    HSV: t => hsv(t * 0.85),
    Blue: t => lerp([[0, 0, 0], [0, 0, 128], [0, 90, 255], [140, 210, 255], [255, 255, 255]], t),
    Pink: t => lerp([[30, 0, 0], [190, 120, 120], [230, 200, 160], [255, 255, 255]], t).map(Math.sqrt).map(v => v * Math.sqrt(255)),
    Hot: t => [clamp01(t * 3) * 255, clamp01(t * 3 - 1) * 255, clamp01(t * 3 - 2) * 255],
    Jet: t => [clamp01(1.5 - Math.abs(4 * t - 3)) * 255, clamp01(1.5 - Math.abs(4 * t - 2)) * 255, clamp01(1.5 - Math.abs(4 * t - 1)) * 255],
    Rainbow: t => hsv((1 - t) * 0.75),
    Winter: t => [0, t * 255, (1 - t / 2) * 255],
    Autumn: t => [255, t * 255, 0],
    Spring: t => [255, t * 255, (1 - t) * 255],
    Summer: t => [t * 255, (0.5 + t / 2) * 255, 0.4 * 255],
    Cool: t => [t * 255, (1 - t) * 255, 255]
  };
  const lutCache = {};
  function lut(name, invert) {
    const key = name + (invert ? '!' : '');
    if (!lutCache[key]) {
      const f = PALETTES[name] || PALETTES.Jet, a = new Uint8ClampedArray(256 * 3);
      for (let i = 0; i < 256; i++) { const c = f(invert ? 1 - i / 255 : i / 255); a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
      lutCache[key] = a;
    }
    return lutCache[key];
  }

  /* ---------- Ticks & formatting ---------- */
  function niceTicks(lo, hi, maxTicks) {
    if (!(hi > lo)) return [lo];
    const span = hi - lo, raw = span / Math.max(1, maxTicks), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  // classic ticks: the smallest step with one significant digit (0.3, 3, 70, …) giving at most maxTicks intervals
  function classicTicks(lo, hi, maxTicks) {
    if (!(hi > lo)) return [lo];
    const raw = (hi - lo) / Math.max(1, maxTicks), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = Math.min(10, Math.ceil(raw / mag - 1e-9)) * mag, out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  // Log-axis ticks: 1-2-5 per decade when there is room, otherwise decades only (thinned further if needed).
  function logTicks(lo, hi, maxTicks) {
    const e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi)), decades = Math.max(1, e1 - e0);
    const mults = decades * 3 <= (maxTicks || 10) ? [1, 2, 5] : [1];
    const every = Math.max(1, Math.ceil(decades / Math.max(1, maxTicks || 10)));
    const out = [];
    for (let e = e0; e <= e1; e++) {
      if ((e - e0) % every) continue;
      for (const m of mults) { const v = m * Math.pow(10, e); if (v >= lo && v <= hi) out.push(v); }
    }
    return out;
  }
  function fmt(v, span) {
    if (!isFinite(v)) return String(v);
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(2);
    const d = span > 0 ? Math.max(0, Math.min(6, -Math.floor(Math.log10(span)) + 2)) : 3;
    return Number(v.toFixed(d)).toString();
  }

  // Log-axis tick label: 20, 500, 2k, 10k, 0.5 …
  function fmtLog(v) {
    if (v >= 1000) return +(v / 1000).toPrecision(3) + 'k';
    return String(+v.toPrecision(3));
  }

  /* ---------- Coordinate mapping ---------- */
  function makeAxis(lo, hi, p0, p1, log) {
    if (log) {
      lo = Math.max(lo, 1e-12); hi = Math.max(hi, lo * 10);
      const a = Math.log10(lo), b = Math.log10(hi);
      return { lo, hi, log, toPx: v => p0 + (Math.log10(Math.max(v, 1e-300)) - a) / (b - a) * (p1 - p0), fromPx: px => Math.pow(10, a + (px - p0) / (p1 - p0) * (b - a)) };
    }
    if (hi === lo) { hi = lo + 1; lo -= 1; }
    return { lo, hi, log, toPx: v => p0 + (v - lo) / (hi - lo) * (p1 - p0), fromPx: px => lo + (px - p0) / (p1 - p0) * (hi - lo) };
  }

  // Graph style (Edit ▸ Graph style…) reaches the drawing through the theme object th:
  // gridOff, gridDash, minorGrid, tickFactor, tickFmt {mode: fixed|sci|eng, digits}, axisWidth, frame ('axes'|'box').
  // opt.xAxis === false leaves out the X axis labels (stacked bands above the bottom one); X_AXIS_H is the height they
  // add in the classic layout.
  const X_AXIS_H = 30;
  function layout(w, h, opt, th) {
    const titleH = opt.title ? 20 : 0;
    if (th && th.classic) { // classic: the plot fills the window except the axis labels at the left and bottom
      const left = opt.showAxes === false ? 2 : 78, bottom = opt.showAxes === false ? 2 : opt.xAxis === false ? 34 - X_AXIS_H : 34, top = 1 + titleH;
      return { x: left, y: top, w: Math.max(10, w - left - 3 - (opt.rightPad > 10 ? opt.rightPad : 0)), h: Math.max(10, h - top - bottom) };
    }
    const left = opt.showAxes === false ? 6 : 58, bottom = opt.showAxes === false || opt.xAxis === false ? 6 : 34, right = opt.rightPad || 10, top = 8 + titleH;
    return { x: left, y: top, w: Math.max(10, w - left - right), h: Math.max(10, h - top - bottom) };
  }

  const SI = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  function fmtTick(v, span, f) { // tick label in the chosen number format (default: automatic)
    if (!f || !isFinite(v)) return fmt(v, span);
    if (v === 0) return '0';
    if (f.mode === 'fixed') return v.toFixed(f.digits);
    if (f.mode === 'sci') return v.toExponential(f.digits);
    if (f.mode === 'eng') { const a = Math.abs(v), [m, p] = SI.find(([m]) => a >= m * 0.9999) || SI[SI.length - 1]; return String(+(v / m).toFixed(f.digits)) + p; }
    return fmt(v, span);
  }

  // grid lines (major, and 4 minor lines between majors when asked), drawn in the grid style
  function drawGrid(ctx, r, xs, ys, th, x0, y1) {
    if (th.gridOff) return;
    ctx.save(); ctx.strokeStyle = th.grid; ctx.lineWidth = 1; ctx.setLineDash(th.gridDash || []);
    ctx.beginPath();
    for (const px of xs) { ctx.moveTo(px, r.y); ctx.lineTo(px, y1); }
    for (const py of ys) { ctx.moveTo(x0, py); ctx.lineTo(r.x + r.w, py); }
    ctx.stroke();
    if (th.minorGrid) {
      ctx.globalAlpha = 0.45; ctx.setLineDash([1, 3]); ctx.beginPath();
      const sub = (a, b, f) => { for (let k = 1; k < 5; k++) f(Math.round(a + (b - a) * k / 5) + 0.5); };
      for (let i = 1; i < xs.length; i++) sub(xs[i - 1], xs[i], px => { ctx.moveTo(px, r.y); ctx.lineTo(px, y1); });
      for (let i = 1; i < ys.length; i++) sub(ys[i - 1], ys[i], py => { ctx.moveTo(x0, py); ctx.lineTo(r.x + r.w, py); });
      ctx.stroke();
    }
    ctx.restore();
  }

  // classic look: left and bottom axis lines, short tick marks inside the plot, light grid, labels in the UI font
  function drawAxesClassic(ctx, r, ax, ay, th, opt) {
    ctx.font = th.axisFont || th.font; ctx.lineWidth = 1;
    const tf = th.tickFactor || 1;
    const xt = ax.log ? logTicks(ax.lo, ax.hi, Math.max(2, Math.floor(r.w / 46 * tf))) : classicTicks(ax.lo, ax.hi, Math.max(2, Math.min(10, r.w / 55) * tf)); // at most 10 intervals
    const yt = ay.log ? logTicks(ay.lo, ay.hi, Math.max(2, Math.floor(r.h / 28 * tf))) : classicTicks(ay.lo, ay.hi, Math.max(2, Math.min(10, r.h / 22) * tf));
    const fx = v => ax.log ? fmtLog(v) : fmtTick(v, ax.hi - ax.lo, th.tickFmt), fy = v => ay.log ? fmtLog(v) : fmtTick(v, ay.hi - ay.lo, th.tickFmt);
    const bottom = r.y + r.h + 0.5, left = r.x + 0.5, T = 9;
    const xs = xt.map(v => Math.round(ax.toPx(v)) + 0.5).filter(px => px > left && px <= r.x + r.w + 0.5);
    const ys = yt.map(v => Math.round(ay.toPx(v)) + 0.5).filter(py => py >= r.y && py < bottom);
    drawGrid(ctx, r, xs, ys, th, left + T, bottom - T);
    ctx.strokeStyle = th.axis; ctx.lineWidth = th.axisWidth || 1; ctx.beginPath();
    for (const px of xs) { ctx.moveTo(px, bottom); ctx.lineTo(px, bottom - T); }
    for (const py of ys) { ctx.moveTo(left, py); ctx.lineTo(left + T, py); }
    ctx.moveTo(left, r.y); ctx.lineTo(left, bottom); ctx.lineTo(r.x + r.w, bottom);
    if (th.frame === 'box') { ctx.moveTo(r.x + r.w, bottom); ctx.lineTo(r.x + r.w, r.y + 0.5); ctx.lineTo(left, r.y + 0.5); }
    ctx.stroke(); ctx.lineWidth = 1;
    if (opt.showAxes === false) return;
    ctx.fillStyle = th.text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    if (opt.xAxis !== false) for (const v of xt) { const px = ax.toPx(v); if (px >= r.x - 1 && px <= r.x + r.w + 1) ctx.fillText(opt.xFormat ? opt.xFormat(v) : fx(v), px, r.y + r.h + 5); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of yt) { const py = ay.toPx(v); if (py >= r.y - 1 && py <= r.y + r.h + 1) ctx.fillText(fy(v), r.x - 6, py); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    if (opt.xLabel && opt.xAxis !== false) ctx.fillText(opt.xLabel, r.x + r.w / 2, r.y + r.h + 19);
    if (opt.yLabel) {
      const tw = ctx.measureText(opt.yLabel).width;
      ctx.save(); ctx.textBaseline = 'middle';
      // a short label that is taller than the plot (low stacked bands: W12) is written across, left of the tick labels
      if (tw > r.h && tw <= 28) { ctx.textAlign = 'left'; ctx.fillText(opt.yLabel, 2, r.y + r.h / 2); }
      else { ctx.translate(10, r.y + r.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(opt.yLabel, 0, 0); }
      ctx.restore();
    }
  }

  function drawAxes(ctx, r, ax, ay, th, opt) {
    if (th.classic) return drawAxesClassic(ctx, r, ax, ay, th, opt);
    ctx.font = th.font; ctx.lineWidth = 1;
    const tf = th.tickFactor || 1;
    const xt = ax.log ? logTicks(ax.lo, ax.hi, Math.max(2, Math.floor(r.w / 46 * tf))) : niceTicks(ax.lo, ax.hi, Math.max(2, Math.floor(r.w / 80 * tf)));
    const yt = ay.log ? logTicks(ay.lo, ay.hi, Math.max(2, Math.floor(r.h / 28 * tf))) : niceTicks(ay.lo, ay.hi, Math.max(2, Math.floor(r.h / 40 * tf)));
    const fx = v => ax.log ? fmtLog(v) : fmtTick(v, ax.hi - ax.lo, th.tickFmt), fy = v => ay.log ? fmtLog(v) : fmtTick(v, ay.hi - ay.lo, th.tickFmt);
    const xs = xt.map(v => Math.round(ax.toPx(v)) + 0.5).filter(px => px >= r.x && px <= r.x + r.w);
    const ys = yt.map(v => Math.round(ay.toPx(v)) + 0.5).filter(py => py >= r.y && py <= r.y + r.h);
    drawGrid(ctx, r, xs, ys, th, r.x, r.y + r.h);
    ctx.strokeStyle = th.axis; ctx.lineWidth = th.axisWidth || 1;
    if (th.frame === 'axes') { ctx.beginPath(); ctx.moveTo(r.x + 0.5, r.y); ctx.lineTo(r.x + 0.5, r.y + r.h + 0.5); ctx.lineTo(r.x + r.w, r.y + r.h + 0.5); ctx.stroke(); }
    else ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
    ctx.lineWidth = 1;
    if (opt.showAxes === false) return;
    ctx.fillStyle = th.text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    if (opt.xAxis !== false) for (const v of xt) { const px = ax.toPx(v); if (px >= r.x - 1 && px <= r.x + r.w + 1) ctx.fillText(opt.xFormat ? opt.xFormat(v) : fx(v), px, r.y + r.h + 4); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of yt) { const py = ay.toPx(v); if (py >= r.y - 1 && py <= r.y + r.h + 1) ctx.fillText(fy(v), r.x - 5, py); }
    ctx.fillStyle = th.muted; ctx.textBaseline = 'bottom'; ctx.textAlign = 'right';
    if (opt.xLabel && opt.xAxis !== false) ctx.fillText(opt.xLabel, r.x + r.w, r.y + r.h + 32);
    if (opt.yLabel) { ctx.save(); ctx.translate(12, r.y); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(opt.yLabel, 0, 0); ctx.restore(); }
  }

  // picked values (Value picker): ring + cross on the trace and a label "P1  x | y"; the selected one is filled
  function drawPicks(ctx, r, ax, ay, th, picks) {
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.font = th.axisFont || th.font; ctx.textBaseline = 'middle';
    for (const p of picks) {
      const px = ax.toPx(p.x), py = ay.toPx(p.y);
      if (!isFinite(px) || !isFinite(py) || px < r.x - 4 || px > r.x + r.w + 4) continue;
      const c = p.color || '#ff8c00';
      ctx.strokeStyle = c; ctx.lineWidth = p.sel ? 2.5 : 1.5;
      ctx.beginPath(); ctx.arc(px, py, p.sel ? 5.5 : 4.5, 0, 2 * Math.PI); ctx.stroke();
      if (p.sel) { ctx.globalAlpha = 0.35; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px - 9, py); ctx.lineTo(px - 5, py); ctx.moveTo(px + 5, py); ctx.lineTo(px + 9, py); ctx.moveTo(px, py - 9); ctx.lineTo(px, py - 5); ctx.moveTo(px, py + 5); ctx.lineTo(px, py + 9); ctx.stroke();
      if (!p.label) continue;
      const tw = ctx.measureText(p.label).width + 10, bh = 17, right = px + 10 + tw > r.x + r.w;
      const above = py - 26 >= r.y + 2; // label above the point, or below it near the top edge
      const bx = Math.round(right ? px - 10 - tw : px + 10), by = Math.round(Math.max(r.y + 2, Math.min(r.y + r.h - bh - 2, above ? py - 26 : py + 10)));
      ctx.fillStyle = th.labelBg; ctx.fillRect(bx, by, tw, bh);
      ctx.strokeStyle = c; ctx.lineWidth = p.sel ? 2 : 1; ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, bh - 1);
      ctx.fillStyle = th.text; ctx.textAlign = 'left'; ctx.fillText(p.label, bx + 5, by + bh / 2 + 0.5);
    }
    ctx.restore();
  }

  // plot title above the plot area and legend box in its top-right corner (Graph style)
  function drawTitleLegend(ctx, r, th, opt) {
    if (opt.title) {
      ctx.save(); ctx.fillStyle = th.text; ctx.font = 'bold ' + (th.axisFont || th.font); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(opt.title, r.x + r.w / 2, r.y - 3); ctx.restore();
    }
    const L = opt.legend; if (!L || !L.length) return;
    ctx.save(); ctx.font = th.axisFont || th.font; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const lh = 16, tw = Math.max(...L.map(e => ctx.measureText(e.label).width)), bw = tw + 34, bh = L.length * lh + 6;
    const bx = Math.round(r.x + r.w - bw - 6) + 0.5, by = Math.round(r.y + 6) + 0.5;
    ctx.fillStyle = th.labelBg; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = th.grid; ctx.strokeRect(bx, by, bw, bh);
    L.forEach((e, i) => {
      const y = by + 3 + lh * i + lh / 2;
      ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx + 6, y); ctx.lineTo(bx + 24, y); ctx.stroke();
      ctx.fillStyle = th.text; ctx.fillText(e.label, bx + 28, y);
    });
    ctx.restore();
  }

  /* ---------- 2D plot ----------
     opt: { traces:[{sig, color, style, width, dots}], view:{x0,x1,y0,y1}, logX, logY, xLabel, yLabel,
            cursor:{x}, selection:{a,b}, markers:[{x,y,label,color}], vlines:[{x,color}], hlines:[{y,color,label}], bands:[{lo,hi,label}] }
     sig: { y, x0, dx, x? } */
  function sigX(sig, i) { return sig.x ? sig.x[i] : sig.x0 + i * sig.dx; }
  function indexRange(sig, xa, xb) {
    const n = sig.y.length;
    if (sig.x) {
      let i0 = 0, i1 = n - 1;
      while (i0 < n - 1 && sig.x[i0 + 1] < xa) i0++;
      while (i1 > 0 && sig.x[i1 - 1] > xb) i1--;
      return [i0, i1];
    }
    return [Math.max(0, Math.floor((xa - sig.x0) / sig.dx)), Math.min(n - 1, Math.ceil((xb - sig.x0) / sig.dx))];
  }

  function drawTrace(ctx, r, ax, ay, tr) {
    const s = tr.sig, n = s.y.length; if (!n) return;
    const [i0, i1] = indexRange(s, ax.lo, ax.hi); if (i1 < i0) return;
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.strokeStyle = tr.color; ctx.fillStyle = tr.color; ctx.lineWidth = tr.width || 1;
    const style = tr.style || 'line', count = i1 - i0 + 1;
    const baseY = style === 'hist-bottom' ? r.y + r.h : Math.min(r.y + r.h, Math.max(r.y, ay.toPx(ay.log ? ay.lo : 0)));
    if ((style === 'hist' || style === 'hist-bottom') && count <= r.w) {
      // bars: equal-width bars centred on each value
      for (let i = i0; i <= i1; i++) {
        const xc = ax.toPx(sigX(s, i));
        const xl = i > 0 ? (xc + ax.toPx(sigX(s, i - 1))) / 2 : xc - (ax.toPx(sigX(s, i + 1 < n ? i + 1 : i)) - xc) / 2;
        const xr = i < n - 1 ? (xc + ax.toPx(sigX(s, i + 1))) / 2 : xc + (xc - xl);
        const py = ay.toPx(s.y[i]);
        ctx.globalAlpha = 0.75; ctx.fillRect(Math.min(xl, xr) + 0.5, Math.min(py, baseY), Math.max(1, Math.abs(xr - xl) - 1), Math.abs(baseY - py));
      }
      ctx.restore(); return;
    }
    if (count > r.w * 2 && !s.x && !ax.log) {
      // min/max decimation per pixel column
      const pts = [];
      for (let px = 0; px < r.w; px++) {
        const xa = ax.fromPx(r.x + px), xb = ax.fromPx(r.x + px + 1);
        const a = Math.max(i0, Math.floor((xa - s.x0) / s.dx)), b = Math.min(i1, Math.ceil((xb - s.x0) / s.dx));
        if (b < a) continue;
        let mn = Infinity, mx = -Infinity;
        for (let i = a; i <= b; i++) { const v = s.y[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
        pts.push([r.x + px, ay.toPx(mn), ay.toPx(mx)]);
      }
      if (style === 'area') {
        ctx.globalAlpha = tr.fillAlpha ?? 0.35; ctx.beginPath(); ctx.moveTo(pts[0][0], baseY);
        for (const p of pts) ctx.lineTo(p[0], p[2]);
        ctx.lineTo(pts[pts.length - 1][0], baseY); ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      for (const [x, a, b] of pts) { ctx.moveTo(x + 0.5, a); ctx.lineTo(x + 0.5, b + 0.01); }
      if (style !== 'dots') { for (let k = 1; k < pts.length; k++) { ctx.moveTo(pts[k - 1][0] + 0.5, pts[k - 1][1]); ctx.lineTo(pts[k][0] + 0.5, pts[k][2]); } }
      ctx.stroke(); ctx.restore(); return;
    }
    const step = Math.max(1, Math.floor(count / (r.w * 4)));
    if (style === 'dots') {
      const ps = tr.pointSize || 3;
      for (let i = i0; i <= i1; i += step) ctx.fillRect(ax.toPx(sigX(s, i)) - ps / 2, ay.toPx(s.y[i]) - ps / 2, ps, ps);
      ctx.restore(); return;
    }
    ctx.beginPath();
    let first = true, prevY = 0;
    for (let i = i0; i <= i1; i += step) {
      const v = s.y[i]; if (!isFinite(v) || (ay.log && v <= 0)) { first = true; continue; }
      const x = ax.toPx(sigX(s, i)), y = ay.toPx(v);
      if (style === 'hist' || style === 'hist-bottom') { ctx.moveTo(x, baseY); ctx.lineTo(x, y); continue; }
      if (first) { ctx.moveTo(x, y); first = false; } else if (style === 'steps') { ctx.lineTo(x, prevY); ctx.lineTo(x, y); } else ctx.lineTo(x, y);
      prevY = y;
    }
    ctx.stroke();
    if (style === 'area') { ctx.lineTo(ax.toPx(sigX(s, i1)), baseY); ctx.lineTo(ax.toPx(sigX(s, i0)), baseY); ctx.globalAlpha = tr.fillAlpha ?? 0.3; ctx.fill(); ctx.globalAlpha = 1; }
    const ps = tr.pointSize || 4;
    if (tr.dots && count < r.w / 3) for (let i = i0; i <= i1; i++) ctx.fillRect(ax.toPx(sigX(s, i)) - ps / 2, ay.toPx(s.y[i]) - ps / 2, ps, ps);
    ctx.restore();
  }

  function drawXY(ctx, w, h, th, opt) {
    ctx.fillStyle = th.plotBg; ctx.fillRect(0, 0, w, h);
    const r = layout(w, h, opt, th), v = opt.view;
    const ax = makeAxis(v.x0, v.x1, r.x, r.x + r.w, opt.logX), ay = makeAxis(v.y0, v.y1, r.y + r.h, r.y, opt.logY);
    drawAxes(ctx, r, ax, ay, th, opt);
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    if (opt.bands) {
      ctx.font = th.font; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const b of opt.bands) {
        const a = ax.toPx(b.lo), c = ax.toPx(b.hi);
        ctx.strokeStyle = th.grid; ctx.beginPath(); ctx.moveTo(a + 0.5, r.y); ctx.lineTo(a + 0.5, r.y + r.h); ctx.stroke();
        if (b.label && c - a > 22) { ctx.fillStyle = th.muted; ctx.fillText(b.label, (a + c) / 2, r.y + 2); }
      }
    }
    if (opt.selection) {
      const a = ax.toPx(Math.min(opt.selection.a, opt.selection.b)), b = ax.toPx(Math.max(opt.selection.a, opt.selection.b));
      ctx.fillStyle = th.selection; ctx.fillRect(a, r.y, b - a, r.h);
    }
    ctx.restore();
    for (const tr of opt.traces) drawTrace(ctx, r, ax, ay, tr);
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.font = th.font;
    for (const l of opt.hlines || []) {
      const py = Math.round(ay.toPx(l.y)) + 0.5; ctx.strokeStyle = l.color || th.marker; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(r.x, py); ctx.lineTo(r.x + r.w, py); ctx.stroke(); ctx.setLineDash([]);
      if (l.label) { ctx.fillStyle = l.color || th.marker; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(l.label, r.x + 4, py - 2); }
    }
    for (const l of opt.vlines || []) {
      const px = Math.round(ax.toPx(l.x)) + 0.5; ctx.strokeStyle = l.color || th.marker; ctx.lineWidth = l.width || 1;
      ctx.beginPath(); ctx.moveTo(px, r.y); ctx.lineTo(px, r.y + r.h); ctx.stroke(); ctx.lineWidth = 1;
    }
    for (const m of opt.markers || []) {
      const px = ax.toPx(m.x), py = ay.toPx(m.y);
      if (m.lines) { // boxed multi-line annotation above the point with a dotted leader (peak detection)
        const lh = 14, bw = Math.max(...m.lines.map(t => ctx.measureText(t).width)) + 8, bh = lh * m.lines.length + 2;
        const bx = Math.round(Math.min(Math.max(px - bw / 2, r.x + 1), r.x + r.w - bw - 1)), by = Math.round(Math.max(r.y + 1, py - 16 - bh));
        ctx.strokeStyle = th.text; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(Math.round(px) + 0.5, by + bh); ctx.lineTo(Math.round(px) + 0.5, py - 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = th.labelBg; ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = m.color || th.marker; ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
        for (let k = 1; k < m.lines.length; k++) { ctx.beginPath(); ctx.moveTo(bx, by + 1 + k * lh + 0.5); ctx.lineTo(bx + bw, by + 1 + k * lh + 0.5); ctx.stroke(); }
        ctx.fillStyle = th.text; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        m.lines.forEach((t, k) => ctx.fillText(t, bx + bw / 2, by + 1 + (k + 1) * lh - 1));
        continue;
      }
      ctx.fillStyle = m.color || th.marker; ctx.strokeStyle = th.plotBg;
      ctx.beginPath(); ctx.moveTo(px, py - 7); ctx.lineTo(px - 5, py - 14); ctx.lineTo(px + 5, py - 14); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (m.label) {
        ctx.textAlign = px > r.x + r.w - 120 ? 'right' : 'left'; ctx.textBaseline = 'bottom';
        const tx = px + (ctx.textAlign === 'right' ? -8 : 8), tw = ctx.measureText(m.label).width;
        ctx.fillStyle = th.labelBg; ctx.fillRect(ctx.textAlign === 'right' ? tx - tw - 3 : tx - 3, py - 29, tw + 6, 16);
        ctx.fillStyle = m.color || th.marker; ctx.fillText(m.label, tx, py - 15);
      }
    }
    // value box: one or more text lines at (px, top), to the right of the line or flipped to its left at the edge
    const valueBox = (lines, px, top, edge) => {
      ctx.font = th.axisFont || th.font; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const tw = Math.max(...lines.map(t => ctx.measureText(t).width)) + 8, bh = lines.length * 15 + 3, bx = Math.round(px + 2 + tw > r.x + r.w ? px - 2 - tw : px + 2);
      ctx.fillStyle = th.labelBg; ctx.fillRect(bx, top, tw, bh); ctx.strokeStyle = edge || th.muted; ctx.lineWidth = edge ? 1.5 : 1; ctx.strokeRect(bx + 0.5, top + 0.5, tw - 1, bh - 1); ctx.lineWidth = 1;
      ctx.fillStyle = th.text; lines.forEach((t, k) => ctx.fillText(t, bx + 4, top + 9 + k * 15));
      return bh;
    };
    const hasCursor = opt.cursor && opt.cursor.x != null, pin = opt.pinCursor, PIN = '#00a0aa';
    const cursorLines = hasCursor || pin ? opt.cursorLines || [] : [];
    for (const l of cursorLines) { // harmonic / sideband cursors
      const px = Math.round(ax.toPx(l.x)) + 0.5; ctx.strokeStyle = l.color || th.cursor; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(px, r.y); ctx.lineTo(px, r.y + r.h); ctx.stroke(); ctx.setLineDash([]);
    }
    // value boxes: pinned cursor and mouse cursor at the top, those of the extra cursors staggered downwards
    let top = r.y + 1;
    if (pin) { // pinned harmonic / sideband cursor (Enter): solid teal base line
      const px = Math.round(ax.toPx(pin.x)) + 0.5;
      ctx.strokeStyle = PIN; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, r.y); ctx.lineTo(px, r.y + r.h); ctx.stroke(); ctx.lineWidth = 1;
      if (pin.y != null && isFinite(pin.y)) { ctx.fillStyle = PIN; ctx.beginPath(); ctx.arc(px, ay.toPx(pin.y), 4, 0, 7); ctx.fill(); }
      if (pin.label) top += valueBox(pin.label.split('\n'), px, top, PIN) + 4;
    }
    if (hasCursor) {
      const px = Math.round(ax.toPx(opt.cursor.x)) + 0.5;
      ctx.strokeStyle = th.cursor; ctx.setLineDash(th.classic ? [] : [2, 3]); ctx.beginPath(); ctx.moveTo(px, r.y); ctx.lineTo(px, r.y + r.h); ctx.stroke(); ctx.setLineDash([]);
      if (opt.cursor.y != null && isFinite(opt.cursor.y)) { const py = ay.toPx(opt.cursor.y); ctx.fillStyle = th.cursor; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 7); ctx.fill(); }
      if (opt.cursor.label) top += valueBox(opt.cursor.label.split('\n'), px, top) + 4;
    }
    for (const l of cursorLines) {
      if (!l.label) continue;
      if (top + 18 > r.y + r.h) top = r.y + 1;
      top += valueBox([l.label], Math.round(ax.toPx(l.x)) + 0.5, top) + 4;
    }
    ctx.restore();
    if (opt.picks && opt.picks.length) drawPicks(ctx, r, ax, ay, th, opt.picks);
    drawTitleLegend(ctx, r, th, opt);
    return { rect: r, ax, ay };
  }

  /* ---------- Spectrogram (time × frequency image) ---------- */
  function drawColorbar(ctx, r, th, lo, hi, pal, invert) {
    const L = lut(pal, invert), x = r.x + r.w + 10, wbar = 12;
    for (let i = 0; i < r.h; i++) {
      const k = Math.round((1 - i / r.h) * 255) * 3;
      ctx.fillStyle = `rgb(${L[k]},${L[k + 1]},${L[k + 2]})`; ctx.fillRect(x, r.y + i, wbar, 1);
    }
    ctx.strokeStyle = th.axis; ctx.strokeRect(x + 0.5, r.y + 0.5, wbar, r.h);
    ctx.fillStyle = th.text; ctx.font = th.font; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const v of niceTicks(lo, hi, Math.max(2, Math.floor(r.h / 40)))) ctx.fillText(fmt(v, hi - lo), x + wbar + 4, r.y + r.h - (v - lo) / (hi - lo) * r.h);
  }

  // opt: { sg (from DSP.spectrogram), view:{x0,x1,y0,y1} (time, freq), zRange:[lo,hi], palette, invert, colorbar, freqDown, cursor, xLabel, yLabel, enhanceLow }
  function drawSpectrogram(ctx, w, h, th, opt) {
    ctx.fillStyle = th.plotBg; ctx.fillRect(0, 0, w, h);
    const r = layout(w, h, Object.assign({}, opt, { rightPad: opt.colorbar ? 64 : 10 })), v = opt.view, sg = opt.sg;
    const ax = makeAxis(v.x0, v.x1, r.x, r.x + r.w, false);
    const ay = opt.freqDown ? makeAxis(v.y0, v.y1, r.y, r.y + r.h, false) : makeAxis(v.y0, v.y1, r.y + r.h, r.y, false);
    if (sg && sg.rows.length) {
      const img = ctx.createImageData(Math.max(1, Math.floor(r.w)), Math.max(1, Math.floor(r.h))), L = lut(opt.palette, opt.invert);
      const [zlo, zhi] = opt.zRange, zs = 255 / Math.max(1e-9, zhi - zlo), rows = sg.rows, t0 = rows[0].t, dtRow = rows.length > 1 ? (rows[rows.length - 1].t - t0) / (rows.length - 1) : 1;
      for (let px = 0; px < img.width; px++) {
        const t = ax.fromPx(r.x + px + 0.5), ri = Math.round((t - t0) / dtRow);
        if (ri < 0 || ri >= rows.length) continue;
        const row = rows[ri].v;
        for (let py = 0; py < img.height; py++) {
          const f = ay.fromPx(r.y + py + 0.5), k = Math.round((f - (sg.f0 || 0)) / sg.df);
          if (k < 0 || k >= row.length) continue;
          let z = (row[k] - zlo) * zs; if (opt.enhanceLow) z = Math.sqrt(Math.max(0, z / 255)) * 255;
          const c = Math.max(0, Math.min(255, z | 0)) * 3, o = (py * img.width + px) * 4;
          img.data[o] = L[c]; img.data[o + 1] = L[c + 1]; img.data[o + 2] = L[c + 2]; img.data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, r.x, r.y);
    }
    drawAxes(ctx, r, ax, ay, Object.assign({}, th, { grid: 'rgba(255,255,255,0.08)' }), opt);
    if (opt.colorbar) drawColorbar(ctx, r, th, opt.zRange[0], opt.zRange[1], opt.palette, opt.invert);
    if (opt.cursor && opt.cursor.x != null) {
      ctx.strokeStyle = '#fff'; ctx.setLineDash([3, 3]);
      const px = Math.round(ax.toPx(opt.cursor.x)) + 0.5, py = Math.round(ay.toPx(opt.cursor.y)) + 0.5;
      ctx.beginPath(); ctx.moveTo(px, r.y); ctx.lineTo(px, r.y + r.h); ctx.moveTo(r.x, py); ctx.lineTo(r.x + r.w, py); ctx.stroke(); ctx.setLineDash([]);
    }
    return { rect: r, ax, ay };
  }

  // Waterfall / mesh pseudo-3D: rows drawn back-to-front with an oblique offset.
  function drawWaterfall(ctx, w, h, th, opt) {
    ctx.fillStyle = th.plotBg; ctx.fillRect(0, 0, w, h);
    const sg = opt.sg, r = layout(w, h, Object.assign({}, opt, { rightPad: 20 }));
    if (!sg || !sg.rows.length) return { rect: r };
    const rows = sg.rows, maxRows = Math.min(rows.length, opt.maxRows || 60), stride = rows.length / maxRows;
    const depthX = r.w * 0.28, depthY = r.h * 0.45, fw = r.w - depthX, fh = r.h - depthY;
    const [zlo, zhi] = opt.zRange, f0 = opt.view.y0, f1 = opt.view.y1, L = lut(opt.palette, opt.invert);
    const k0 = Math.max(0, Math.floor((f0 - (sg.f0 || 0)) / sg.df)), k1 = Math.min(sg.bins - 1, Math.ceil((f1 - (sg.f0 || 0)) / sg.df));
    const step = Math.max(1, Math.floor((k1 - k0) / fw));
    for (let j = maxRows - 1; j >= 0; j--) {
      const row = rows[Math.floor(j * stride)].v, d = j / Math.max(1, maxRows - 1);
      const ox = r.x + d * depthX, oy = r.y + depthY - d * depthY + fh;
      const pts = [];
      for (let k = k0; k <= k1; k += step) {
        const z = Math.max(0, Math.min(1, (row[k] - zlo) / (zhi - zlo)));
        pts.push([ox + (k - k0) / Math.max(1, k1 - k0) * fw, oy - z * fh, z]);
      }
      // hide rows behind this one, then stroke each segment in the palette colour of its level
      ctx.beginPath(); ctx.moveTo(ox, oy);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(ox + fw, oy); ctx.closePath(); ctx.fillStyle = th.plotBg; ctx.fill();
      for (let i = 1; i < pts.length; i++) {
        const c = Math.round(Math.max(pts[i - 1][2], pts[i][2]) * 255) * 3;
        ctx.strokeStyle = `rgb(${L[c]},${L[c + 1]},${L[c + 2]})`;
        ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
      }
    }
    ctx.strokeStyle = th.axis; ctx.strokeRect(r.x + 0.5, r.y + depthY + 0.5, fw, fh);
    ctx.fillStyle = th.text; ctx.font = th.font; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of niceTicks(f0, f1, Math.max(2, Math.floor(fw / 80)))) ctx.fillText(fmt(v, f1 - f0), r.x + (v - f0) / (f1 - f0) * fw, r.y + r.h + 4);
    ctx.textAlign = 'left'; ctx.fillStyle = th.muted;
    ctx.fillText('time →', r.x + fw + 4, r.y + depthY / 2);
    if (opt.yLabel) { ctx.textAlign = 'right'; ctx.fillText(opt.yLabel, r.x + fw, r.y + r.h + 20); }
    return { rect: r };
  }

  /* ---------- Analog gauge for instruments ---------- */
  function drawGauge(ctx, w, h, th, v, lo, hi, crit) {
    ctx.fillStyle = th.plotBg; ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.82, rad = Math.min(w / 2 - 14, h * 0.7), a0 = Math.PI * 1.15, a1 = Math.PI * 1.85;
    const ang = t => a0 + (a1 - a0) * Math.max(0, Math.min(1, t));
    ctx.lineWidth = 10; ctx.strokeStyle = th.grid; ctx.beginPath(); ctx.arc(cx, cy, rad, a0, a1); ctx.stroke();
    if (crit) { ctx.strokeStyle = th.danger; ctx.beginPath(); ctx.arc(cx, cy, rad, ang((crit[0] - lo) / (hi - lo)), ang((crit[1] - lo) / (hi - lo))); ctx.stroke(); }
    ctx.lineWidth = 1; ctx.fillStyle = th.text; ctx.font = th.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of niceTicks(lo, hi, 5)) { const a = ang((t - lo) / (hi - lo)); ctx.fillText(fmt(t, hi - lo), cx + Math.cos(a) * (rad - 22), cy + Math.sin(a) * (rad - 22)); }
    const a = ang((v - lo) / (hi - lo));
    ctx.strokeStyle = th.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (rad - 4), cy + Math.sin(a) * (rad - 4)); ctx.stroke();
    ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.fill(); ctx.lineWidth = 1;
  }

  const PLOT = { PALETTES, lut, niceTicks, classicTicks, fmt, fmtTick, makeAxis, X_AXIS_H, drawXY, drawSpectrogram, drawWaterfall, drawGauge, indexRange };
  if (typeof module !== 'undefined' && module.exports) module.exports = PLOT; else root.PLOT = PLOT;
})(typeof window !== 'undefined' ? window : globalThis);
