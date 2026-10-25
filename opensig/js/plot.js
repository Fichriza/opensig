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
    if (opt.cursor && opt.cursor.x != null) { // the 3D cursor: its time (cyan) and frequency (green), as in the mesh view
      const px = Math.round(ax.toPx(opt.cursor.x)) + 0.5, py = Math.round(ay.toPx(opt.cursor.y)) + 0.5;
      ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      for (const [a, b, c] of [[[px, r.y], [px, r.y + r.h], '#4fd8ff'], [[r.x, py], [r.x + r.w, py], '#6cff8a']]) {
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3.5; ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill(); ctx.stroke();
      ctx.restore(); ctx.lineWidth = 1;
    }
    return { rect: r, ax, ay };
  }

  // Time FFT (mesh) view: the spectra as a smoothly shaded surface in a 3D box, on black. The surface is rasterized here
  // with a depth buffer – its colours and light blended across every triangle from the palette colour and the light of
  // its corners – at twice the resolution and drawn smoothed, so it has no facets or jagged edges. The box shows two grey
  // back walls and a frame, the frequency and time scales on its two front edges (with their exact end values), the
  // level on the right corner and the colour map beside it; walls and edges follow when the view turns. The grid has at
  // most 140 rows and 300 columns (60 × 140 while the view is being turned), each the maximum of the lines it stands for,
  // so no peak is lost. Linear amplitude unless opt.db.
  // opt: {sg, view: {x0, x1 (time), y0, y1 (frequency)}, zRange (dB), zFixed, db, palette, invert, enhanceLow, colorbar,
  // xLabel, yLabel, yaw, pitch (degrees), zoom, fast (while turning), hover: {i, j} (the marked point), cursor: {x (time),
  // y (frequency)} – the 3D cursor, drawn as its two cross sections over the surface where nothing nearer hides them}
  // Returns {rect, pick(px, py) → {i, j, t, f, value} or null}.
  const meshCache = new WeakMap(); // sg → its grid and the last surface picture, so a moving pointer only redraws the box and its marker
  function drawWaterfall(ctx, w, h, th, opt) {
    const INK = '#d4d4d4', sg = opt.sg;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    if (!sg || !sg.rows.length) return { rect: { x: 0, y: 0, w, h } };
    const fast = !!opt.fast, sf0 = sg.f0 || 0, lin = !opt.db;
    // the grid: rows × columns, each the maximum of the spectra and lines it stands for
    let rows = sg.rows.filter(rw => rw.t >= opt.view.x0 && rw.t <= opt.view.x1);
    if (rows.length < 2) rows = sg.rows;
    const k0 = Math.max(0, Math.floor((opt.view.y0 - sf0) / sg.df)), k1 = Math.max(k0 + 1, Math.min(sg.bins - 1, Math.ceil((opt.view.y1 - sf0) / sg.df)));
    const NC = Math.min(fast ? 140 : 300, k1 - k0 + 1), NR = Math.max(2, Math.min(fast ? 60 : 140, rows.length));
    const rowAt = j => [Math.floor(j * rows.length / NR), Math.max(Math.floor(j * rows.length / NR) + 1, Math.floor((j + 1) * rows.length / NR))];
    const colAt = i => { const a = k0 + Math.floor(i * (k1 - k0 + 1) / NC); return [a, Math.max(a + 1, k0 + Math.floor((i + 1) * (k1 - k0 + 1) / NC))]; };
    // kept with the data (with the last picture), so a moving pointer does not pool the lines again
    const gk = JSON.stringify([opt.view.x0, opt.view.x1, k0, k1, NC, NR, lin]);
    let m = meshCache.get(sg);
    if (!m || m.gk !== gk) {
      const grid = [];
      for (let j = 0; j < NR; j++) {
        const [ra, rb] = rowAt(j), g = new Float64Array(NC);
        for (let i = 0; i < NC; i++) {
          const [ka, kb] = colAt(i);
          let mx = -Infinity; for (let rr = ra; rr < rb && rr < rows.length; rr++) { const v = rows[rr].v; for (let k = ka; k < kb; k++) if (v[k] > mx) mx = v[k]; }
          g[i] = lin ? Math.pow(10, mx / 20) : mx;
        }
        grid.push(g);
      }
      m = { gk, grid, top: Math.max(...grid.map(g => Math.max(...g))) };
      meshCache.set(sg, m);
    }
    const grid = m.grid;
    let zlo = opt.zRange[0], zhi = opt.zRange[1];
    if (lin) { zlo = 0; zhi = opt.zFixed ? Math.pow(10, opt.zRange[1] / 20) : m.top; }
    if (!(zhi > zlo)) zhi = zlo + 1;
    const fa = sf0 + k0 * sg.df, fb = sf0 + k1 * sg.df, ta = rows[0].t, tb = rows[rows.length - 1].t;
    const lvl = v => Math.max(0, Math.min(1, (v - zlo) / (zhi - zlo))), col = z => opt.enhanceLow ? Math.sqrt(z) : z;
    const L = lut(opt.palette, opt.invert), rgb = (z, s) => { const c = Math.round(col(z) * 255) * 3; return `rgb(${L[c] * s | 0},${L[c + 1] * s | 0},${L[c + 2] * s | 0})`; };
    // the view: orthographic, turned by the yaw about the vertical and tilted by the pitch; u = frequency, v = time and
    // z = level, all 0…1. The scale fits the box at any yaw, so turning it does not resize it.
    const yaw = (opt.yaw ?? 41) * Math.PI / 180, pitch = Math.max(2, Math.min(88, opt.pitch ?? 22)) * Math.PI / 180, HZ = 0.55;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const depth = (u, v) => -(u - 0.5) * sy + (v - 0.5) * cy; // along the floor, larger = farther
    const P0 = (u, v, z) => [(u - 0.5) * cy + (v - 0.5) * sy, -(z - 0.5) * HZ * cp - depth(u, v) * sp];
    const x0 = (opt.colorbar ? 60 : 10) + 34, x1 = w - 64, y0 = 14, y1 = h - 50;
    const k = Math.max(1, Math.min((x1 - x0) / Math.SQRT2, (y1 - y0) / (Math.SQRT2 * sp + HZ * cp))) * (opt.zoom || 1);
    const ox = (x0 + x1) / 2, oy = (y0 + y1) / 2;
    const P = (u, v, z) => { const q = P0(u, v, z); return [ox + k * q[0], oy + k * q[1]]; };
    const path = pts => { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); };
    const line = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
    // the corners: the farthest one carries the back walls, the nearest one joins the two labelled front edges
    const C4 = [[0, 0], [1, 0], [1, 1], [0, 1]], dep = C4.map(([u, v]) => depth(u, v));
    const [uf, vf] = C4[dep.indexOf(Math.max(...dep))], [un, vn] = C4[dep.indexOf(Math.min(...dep))];
    const wallU = [P(uf, 0, 0), P(uf, 1, 0), P(uf, 1, 1), P(uf, 0, 1)], wallV = [P(0, vf, 0), P(1, vf, 0), P(1, vf, 1), P(0, vf, 1)];
    const cx = pts => pts.reduce((t, q) => t + q[0], 0) / 4, leftU = cx(wallU) < cx(wallV);
    path(wallU); ctx.fillStyle = leftU ? '#141414' : '#353535'; ctx.fill();
    path(wallV); ctx.fillStyle = leftU ? '#353535' : '#141414'; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    for (const [u, v] of [[uf, vf], [uf, vn], [un, vf]]) line(P(u, v, 0), P(u, v, 1));
    line(P(uf, 0, 1), P(uf, 1, 1)); line(P(0, vf, 1), P(1, vf, 1)); line(P(uf, 0, 0), P(uf, 1, 0)); line(P(0, vf, 0), P(1, vf, 0));
    // the surface picture (cached)
    const tf = ctx.getTransform ? ctx.getTransform().a : 1;
    let S = tf * (fast || tf >= 2 ? 1 : 2); if (w * h * S * S > 4e6) S = Math.sqrt(4e6 / (w * h));
    const Wp = Math.ceil(w * S), Hp = Math.ceil(h * S);
    const key = JSON.stringify([w, h, S, opt.view, opt.zRange, opt.zFixed, opt.db, opt.palette, opt.invert, opt.enhanceLow, opt.colorbar, opt.yaw, opt.pitch, opt.zoom, fast]);
    if (m.key !== key) {
      // the vertices: position in the picture, depth along the view, colour lit by the light from the front left above
      const NV = NR * NC, SKV = 2 * (NC + NR), N = NV + SKV;
      const X = new Float32Array(N), Y = new Float32Array(N), D = new Float32Array(N), R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), PK = new Int32Array(N);
      const du = 1 / (NC - 1), dv = 1 / (NR - 1), Z = grid.map(g => Array.from(g, lvl));
      const tx = sy, ty = -cy, lx = 0.5 * tx - 0.35 * cy, ly = 0.5 * ty - 0.35 * sy, lz = 0.8, ln = Math.hypot(lx, ly, lz);
      const put = (q, u, v, z, c, s, pick) => {
        const p2 = P(u, v, z); X[q] = p2[0] * S; Y[q] = p2[1] * S; D[q] = depth(u, v) * cp - (z - 0.5) * HZ * sp; PK[q] = pick;
        const ci = Math.round(col(c) * 255) * 3; R[q] = L[ci] * s; G[q] = L[ci + 1] * s; B[q] = L[ci + 2] * s;
      };
      for (let j = 0; j < NR; j++) for (let i = 0; i < NC; i++) {
        const z = Z[j][i], gu = (Z[j][Math.min(NC - 1, i + 1)] - Z[j][Math.max(0, i - 1)]) / ((Math.min(NC - 1, i + 1) - Math.max(0, i - 1)) * du) * HZ;
        const gv = (Z[Math.min(NR - 1, j + 1)][i] - Z[Math.max(0, j - 1)][i]) / ((Math.min(NR - 1, j + 1) - Math.max(0, j - 1)) * dv) * HZ;
        put(j * NC + i, i * du, j * dv, z, z, 0.4 + 0.6 * Math.max(0, (-gu * lx - gv * ly + lz) / (Math.hypot(gu, gv, 1) * ln)), j * NC + i);
      }
      // the near sides down to the floor: the spectrum at the near time edge and the line at the near frequency edge
      const jn = vn ? NR - 1 : 0, iN = un ? NC - 1 : 0;
      for (let i = 0; i < NC; i++) { const z = Z[jn][i]; put(NV + 2 * i, i * du, vn, z, z, 0.42, jn * NC + i); put(NV + 2 * i + 1, i * du, vn, 0, z, 0.1, jn * NC + i); }
      for (let j = 0; j < NR; j++) { const z = Z[j][iN], q = NV + 2 * NC + 2 * j; put(q, un, j * dv, z, z, 0.3, j * NC + iN); put(q + 1, un, j * dv, 0, z, 0.08, j * NC + iN); }
      // rasterize: every triangle with a depth test; colour, light and depth blended by the barycentric weights
      const img = new ImageData(Wp, Hp), px = img.data, zb = new Float32Array(Wp * Hp).fill(Infinity), id = new Int32Array(Wp * Hp).fill(-1);
      const tri = (a, b, c) => {
        const xa = X[a], ya = Y[a], xb = X[b], yb = Y[b], xc = X[c], yc = Y[c], area = (xb - xa) * (yc - ya) - (xc - xa) * (yb - ya);
        if (!(Math.abs(area) > 1e-9)) return;
        const mx0 = Math.max(0, Math.floor(Math.min(xa, xb, xc))), mx1 = Math.min(Wp - 1, Math.ceil(Math.max(xa, xb, xc)));
        const my0 = Math.max(0, Math.floor(Math.min(ya, yb, yc))), my1 = Math.min(Hp - 1, Math.ceil(Math.max(ya, yb, yc)));
        for (let yy = my0; yy <= my1; yy++) {
          const Yc = yy + 0.5;
          for (let xx = mx0; xx <= mx1; xx++) {
            const Xc = xx + 0.5, wa = ((xb - Xc) * (yc - Yc) - (xc - Xc) * (yb - Yc)) / area, wb = ((xc - Xc) * (ya - Yc) - (xa - Xc) * (yc - Yc)) / area, wc = 1 - wa - wb;
            if (wa < -1e-5 || wb < -1e-5 || wc < -1e-5) continue;
            const o = yy * Wp + xx, d = wa * D[a] + wb * D[b] + wc * D[c];
            if (d >= zb[o]) continue;
            zb[o] = d; const o4 = o * 4;
            px[o4] = wa * R[a] + wb * R[b] + wc * R[c]; px[o4 + 1] = wa * G[a] + wb * G[b] + wc * G[c]; px[o4 + 2] = wa * B[a] + wb * B[b] + wc * B[c]; px[o4 + 3] = 255;
            id[o] = PK[wa >= wb && wa >= wc ? a : wb >= wc ? b : c];
          }
        }
      };
      for (let j = 0; j < NR - 1; j++) for (let i = 0; i < NC - 1; i++) { const q = j * NC + i; tri(q, q + 1, q + NC + 1); tri(q, q + NC + 1, q + NC); }
      for (let i = 0; i < NC - 1; i++) { const q = NV + 2 * i; tri(q, q + 2, q + 3); tri(q, q + 3, q + 1); }
      for (let j = 0; j < NR - 1; j++) { const q = NV + 2 * NC + 2 * j; tri(q, q + 2, q + 3); tri(q, q + 3, q + 1); }
      const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(Wp, Hp) : Object.assign(document.createElement('canvas'), { width: Wp, height: Hp });
      cv.getContext('2d').putImageData(img, 0, 0);
      Object.assign(m, { key, cv, id, Z, zb });
    }
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(m.cv, 0, 0, w, h); ctx.restore();
    // the value under the pointer: the nearest grid point the picture shows there, at the spectrum and line where the
    // maximum it stands for lies (a grid point can stand for several of each)
    const pick = (qx, qy) => {
      const xx = Math.floor(qx * S), yy = Math.floor(qy * S);
      if (xx < 0 || yy < 0 || xx >= Wp || yy >= Hp) return null;
      const q = m.id[yy * Wp + xx]; if (q < 0) return null;
      const i = q % NC, j = (q - i) / NC, [ra, rb] = rowAt(j), [ka, kb] = colAt(i);
      let br = ra, bk = ka;
      for (let rr = ra; rr < rb && rr < rows.length; rr++) for (let kk = ka; kk < kb; kk++) if (rows[rr].v[kk] > rows[br].v[bk]) { br = rr; bk = kk; }
      return { i, j, t: rows[br].t, f: sf0 + bk * sg.df, value: grid[j][i], db: !lin };
    };
    // the front edges with their scales, and the level axis on the right side corner
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.fillStyle = INK; ctx.font = th.font;
    const C = P(0.5, 0.5, 0);
    const edge = (A, Bp, lo, hi, title) => {
      line(A, Bp);
      const ex = Bp[0] - A[0], ey = Bp[1] - A[1], len = Math.hypot(ex, ey), mx = (A[0] + Bp[0]) / 2, my = (A[1] + Bp[1]) / 2;
      if (len < 1) return;
      let nx = -ey / len, ny = ex / len; if (nx * (mx - C[0]) + ny * (my - C[1]) < 0) { nx = -nx; ny = -ny; }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // a tick and its value; the ends' values are moved along the edge, off the corner the next edge shares
      const mark = (t, text, along = 0) => {
        const q = (t - lo) / (hi - lo), qx = A[0] + q * ex, qy = A[1] + q * ey, sh = along * (ctx.measureText(text).width / 2 + 3) / len;
        line([qx, qy], [qx + nx * 5, qy + ny * 5]); ctx.fillText(text, qx + nx * 15 + sh * ex, qy + ny * 13 + sh * ey);
      };
      if (hi > lo) { // the two ends with their exact values, and round values between that keep clear of them
        mark(lo, String(+lo.toPrecision(5)), 1); mark(hi, String(+hi.toPrecision(5)), -1);
        for (const t of niceTicks(lo, hi, Math.max(2, Math.floor(len / 70)))) if (Math.min(t - lo, hi - t) / (hi - lo) * len > 38) mark(t, fmt(t, hi - lo));
      }
      if (title) ctx.fillText(title, mx + nx * 34, my + ny * 30);
    };
    edge(P(0, vn, 0), P(1, vn, 0), fa, fb, opt.yLabel || 'Hz');
    edge(P(un, 0, 0), P(un, 1, 0), ta, tb, opt.xLabel || 's');
    const sides = [[uf, vn], [un, vf]].map(([u, v]) => [P(u, v, 0), P(u, v, 1)]), [zA, zB] = sides[0][0][0] > sides[1][0][0] ? sides[0] : sides[1];
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const t of niceTicks(zlo, zhi, Math.max(2, Math.floor((zA[1] - zB[1]) / 36)))) {
      const q = (t - zlo) / (zhi - zlo), qx = zA[0] + q * (zB[0] - zA[0]), qy = zA[1] + q * (zB[1] - zA[1]);
      line([qx, qy], [qx + 5, qy]); ctx.fillText(fmt(t, zhi - zlo), qx + 8, qy);
    }
    if (!lin) { ctx.textBaseline = 'bottom'; ctx.fillText('dB', zB[0] + 8, zB[1] - 6); }
    // the 3D cursor: the spectrum at its time (cyan) and the level over time at its frequency (green) as lines on the
    // surface – each piece drawn only where the depth buffer shows it in front – their crossing, and marks on the scales
    if (opt.cursor && opt.cursor.x != null) {
      let r0 = 0; for (let r = 1; r < rows.length; r++) if (Math.abs(rows[r].t - opt.cursor.x) < Math.abs(rows[r0].t - opt.cursor.x)) r0 = r;
      const kc = Math.round((opt.cursor.y - sf0) / sg.df);
      let jc = 0; while (jc < NR - 1 && rowAt(jc)[1] <= r0) jc++;
      let ic = 0; while (ic < NC - 1 && colAt(ic)[1] <= kc) ic++;
      if (kc >= k0 && kc <= k1 && opt.cursor.x >= ta - 1e-9 && opt.cursor.x <= tb + 1e-9) {
        const du = 1 / (NC - 1), dv = 1 / (NR - 1), Z = m.Z;
        const seen = (u, v, z) => { const q = P(u, v, z), xx = Math.floor(q[0] * S), yy = Math.floor(q[1] * S); return xx < 0 || yy < 0 || xx >= Wp || yy >= Hp || depth(u, v) * cp - (z - 0.5) * HZ * sp <= m.zb[yy * Wp + xx] + 0.012; };
        const profile = (n, at, color) => {
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round';
          for (let s = 0; s + 1 < n; s++) {
            const a = at(s), b = at(s + 1);
            if (seen((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)) line(P(...a), P(...b));
          }
          ctx.lineWidth = 1; ctx.lineCap = 'butt';
        };
        profile(NC, i => [i * du, jc * dv, Z[jc][i]], '#4fd8ff');
        profile(NR, j => [ic * du, j * dv, Z[j][ic]], '#6cff8a');
        const u = ic * du, v = jc * dv, top = P(u, v, Z[jc][ic]), foot = P(u, v, 0);
        ctx.strokeStyle = '#fff'; ctx.setLineDash([3, 3]); line(foot, top); ctx.setLineDash([]);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(top[0], top[1], 4, 0, 7); ctx.fill();
        const tag = (q, text, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(q[0], q[1], 3.5, 0, 7); ctx.fill(); ctx.font = 'bold ' + th.font; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(text, q[0], q[1] - 6); ctx.font = th.font; };
        tag(P(u, vn, 0), fmt(opt.cursor.y, fb - fa) + ' Hz', '#6cff8a');
        tag(P(un, v, 0), fmt(opt.cursor.x, tb - ta) + ' ' + (opt.xLabel || 's'), '#4fd8ff');
      }
    }
    // the marked point: a line down to the floor and its values
    if (opt.hover && opt.hover.i < NC && opt.hover.j < NR) {
      const { i, j } = opt.hover, u = i / (NC - 1), v = j / (NR - 1), top = P(u, v, m.Z[j][i]), foot = P(u, v, 0);
      ctx.strokeStyle = '#fff'; ctx.setLineDash([3, 3]); line(foot, top); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(top[0], top[1], 3.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(foot[0], foot[1], 2, 0, 7); ctx.fill();
      if (opt.hover.label) {
        const lines = opt.hover.label.split('\n'), tw = Math.max(...lines.map(t => ctx.measureText(t).width)) + 10, bh = lines.length * 14 + 6;
        const bx = Math.min(w - tw - 4, top[0] + 10), by = Math.max(4, top[1] - bh - 8);
        ctx.fillStyle = 'rgba(20,20,20,0.85)'; ctx.fillRect(bx, by, tw, bh); ctx.strokeStyle = '#777'; ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, bh - 1);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; lines.forEach((t, n) => ctx.fillText(t, bx + 5, by + 4 + n * 14));
      }
    }
    // the colour map, beside the box in a wide window
    if (opt.colorbar) {
      const bx = Math.max(12, ox - k * Math.SQRT2 / 2 - 110), bw = 10, by0 = y0 + 4, by1 = h - 22;
      for (let yy = by0; yy < by1; yy++) { ctx.fillStyle = rgb(1 - (yy - by0) / (by1 - by0), 1); ctx.fillRect(bx, yy, bw, 1); }
      ctx.strokeStyle = '#777'; ctx.strokeRect(bx + 0.5, by0 + 0.5, bw - 1, by1 - by0 - 1);
      ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const t of niceTicks(zlo, zhi, Math.max(2, Math.floor((by1 - by0) / 40)))) ctx.fillText(fmt(t, zhi - zlo), bx + bw + 5, by1 - (t - zlo) / (zhi - zlo) * (by1 - by0));
    }
    return { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, pick, mesh: true };
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
