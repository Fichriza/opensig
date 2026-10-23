/* OpenSig custom display windows: scatter/orbit/polar/Bode/box/violin/corner/correlation/contour plots. */
(function (root) {
  'use strict';
  const { DSP, PLOT, OPS } = root;
  const fmt = (v, s) => PLOT.fmt(v, s ?? (Math.abs(v) / 1000 || 1));
  const MAXPTS = 20000;

  function frame(ctx, w, h, th, v, o) {
    return PLOT.drawXY(ctx, w, h, th, Object.assign({ traces: [], view: v }, o || {}));
  }
  function range(a, pad) {
    let lo = Infinity, hi = -Infinity; for (const v of a) if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!isFinite(lo)) return [0, 1];
    if (hi === lo) { lo -= 1; hi += 1; }
    const p = (hi - lo) * (pad ?? 0.05); return [lo - p, hi + p];
  }
  const stride = n => Math.max(1, Math.ceil(n / MAXPTS));
  const titleOf = (w, i) => 'W' + w.parents[i];
  function clip(ctx, r) { ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); }
  function legend(ctx, th, r, items) {
    ctx.font = th.font; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    items.forEach((it, i) => { ctx.fillStyle = it.color; ctx.fillRect(r.x + r.w - 92, r.y + 8 + i * 15, 10, 3); ctx.fillStyle = th.text; ctx.fillText(it.label, r.x + r.w - 78, r.y + 9 + i * 15); });
  }

  const CHARTS = {
    scatter: {
      label: 'Scatter plot 2D', roles: ['X values', 'Y values'],
      draw(ds, p, w) {
        const [X, Y] = ds, n = Math.min(X.y.length, Y.y.length), xr = range(X.y.subarray(0, n)), yr = range(Y.y.subarray(0, n));
        return (ctx, cw, ch, th) => {
          const lay = frame(ctx, cw, ch, th, { x0: xr[0], x1: xr[1], y0: yr[0], y1: yr[1] }, { xLabel: titleOf(w, 0), yLabel: titleOf(w, 1) });
          clip(ctx, lay.rect); ctx.fillStyle = th.trace; ctx.globalAlpha = n > 5000 ? 0.35 : 0.7;
          for (let i = 0; i < n; i += stride(n)) ctx.fillRect(lay.ax.toPx(X.y[i]) - 1.5, lay.ay.toPx(Y.y[i]) - 1.5, 3, 3);
          ctx.restore(); return lay;
        };
      }
    },
    scatterc: {
      label: 'Scatter plot 2D plus color vector', roles: ['X values', 'Y values', 'Color values'],
      draw(ds, p, w) {
        const [X, Y, C] = ds, n = Math.min(X.y.length, Y.y.length, C.y.length), xr = range(X.y.subarray(0, n)), yr = range(Y.y.subarray(0, n)), cr = range(C.y.subarray(0, n), 0);
        return (ctx, cw, ch, th) => {
          const lay = frame(ctx, cw, ch, th, { x0: xr[0], x1: xr[1], y0: yr[0], y1: yr[1] }, { xLabel: titleOf(w, 0), yLabel: titleOf(w, 1), rightPad: 60 });
          const L = PLOT.lut(p.palette || 'Jet');
          clip(ctx, lay.rect);
          for (let i = 0; i < n; i += stride(n)) {
            const k = Math.max(0, Math.min(255, Math.round((C.y[i] - cr[0]) / (cr[1] - cr[0]) * 255))) * 3;
            ctx.fillStyle = `rgb(${L[k]},${L[k + 1]},${L[k + 2]})`; ctx.fillRect(lay.ax.toPx(X.y[i]) - 2, lay.ay.toPx(Y.y[i]) - 2, 4, 4);
          }
          ctx.restore();
          const r = lay.rect, x = r.x + r.w + 12;
          for (let i = 0; i < r.h; i++) { const k = Math.round((1 - i / r.h) * 255) * 3; ctx.fillStyle = `rgb(${L[k]},${L[k + 1]},${L[k + 2]})`; ctx.fillRect(x, r.y + i, 10, 1); }
          ctx.fillStyle = th.text; ctx.font = th.font; ctx.textAlign = 'left'; ctx.fillText(fmt(cr[1]), x + 13, r.y + 6); ctx.fillText(fmt(cr[0]), x + 13, r.y + r.h - 4);
          return lay;
        };
      }
    },
    scatter3d: {
      label: 'Scatter plot 3D', roles: ['X values', 'Y values', 'Z values'], rotatable: true,
      draw(ds, p, w) {
        const [X, Y, Z] = ds, n = Math.min(X.y.length, Y.y.length, Z.y.length), rs = [X, Y, Z].map(d => range(d.y.subarray(0, n), 0));
        const norm = (v, r) => (v - r[0]) / (r[1] - r[0]) * 2 - 1;
        return (ctx, cw, ch, th) => {
          const yaw = (w.display.yaw ?? 35) * Math.PI / 180, pitch = (w.display.pitch ?? 25) * Math.PI / 180, s = Math.min(cw, ch) * 0.3, cx = cw / 2, cy = ch / 2;
          const proj = (x, y, z) => { const x1 = x * Math.cos(yaw) - y * Math.sin(yaw), y1 = x * Math.sin(yaw) + y * Math.cos(yaw), z1 = z * Math.cos(pitch) - y1 * Math.sin(pitch); return [cx + x1 * s, cy - z1 * s, y1 * Math.cos(pitch) + z * Math.sin(pitch)]; };
          ctx.strokeStyle = th.axis; ctx.lineWidth = 1; ctx.font = th.font; ctx.fillStyle = th.text;
          const edges = [[[-1, -1, -1], [1, -1, -1]], [[-1, -1, -1], [-1, 1, -1]], [[-1, -1, -1], [-1, -1, 1]], [[1, -1, -1], [1, 1, -1]], [[-1, 1, -1], [1, 1, -1]], [[1, -1, -1], [1, -1, 1]], [[-1, 1, -1], [-1, 1, 1]], [[-1, -1, 1], [1, -1, 1]], [[-1, -1, 1], [-1, 1, 1]]];
          ctx.beginPath(); for (const [a, b] of edges) { const pa = proj(...a), pb = proj(...b); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); } ctx.stroke();
          [['X ' + titleOf(w, 0), [1.15, -1, -1]], ['Y ' + titleOf(w, 1), [-1, 1.15, -1]], ['Z ' + titleOf(w, 2), [-1, -1, 1.15]]].forEach(([t, q]) => { const pp = proj(...q); ctx.fillText(t, pp[0], pp[1]); });
          const pts = [];
          for (let i = 0; i < n; i += stride(n)) pts.push(proj(norm(X.y[i], rs[0]), norm(Y.y[i], rs[1]), norm(Z.y[i], rs[2])).concat([norm(Z.y[i], rs[2])]));
          pts.sort((a, b) => b[2] - a[2]);
          const L = PLOT.lut('Jet');
          for (const q of pts) { const k = Math.round((q[3] + 1) / 2 * 255) * 3; ctx.fillStyle = `rgb(${L[k]},${L[k + 1]},${L[k + 2]})`; ctx.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3); }
          ctx.fillStyle = th.muted; ctx.textAlign = 'left'; ctx.fillText('drag to rotate', 8, ch - 8);
          return null;
        };
      }
    },
    orbit: {
      label: 'Orbit plot', roles: ['X displacement', 'Y displacement'],
      draw(ds, p, w) {
        const [X, Y] = ds, n = Math.min(X.y.length, Y.y.length);
        const xr = range(X.y.subarray(0, n)), yr = range(Y.y.subarray(0, n)), half = Math.max(xr[1] - xr[0], yr[1] - yr[0]) / 2, mx = (xr[0] + xr[1]) / 2, my = (yr[0] + yr[1]) / 2;
        return (ctx, cw, ch, th) => {
          const asp = cw / ch, hx = half * Math.max(1, asp), hy = half * Math.max(1, 1 / asp);
          const lay = frame(ctx, cw, ch, th, { x0: mx - hx, x1: mx + hx, y0: my - hy, y1: my + hy }, { xLabel: titleOf(w, 0), yLabel: titleOf(w, 1) });
          clip(ctx, lay.rect); ctx.strokeStyle = th.trace; ctx.lineWidth = 1; ctx.beginPath();
          for (let i = 0; i < n; i += stride(n)) { const x = lay.ax.toPx(X.y[i]), y = lay.ay.toPx(Y.y[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.stroke(); ctx.fillStyle = th.marker; ctx.beginPath(); ctx.arc(lay.ax.toPx(X.y[0]), lay.ay.toPx(Y.y[0]), 4, 0, 7); ctx.fill(); ctx.restore();
          return lay;
        };
      }
    },
    polar: {
      label: 'Polar plot', roles: ['Signal (x = angle, y = radius)'],
      draw(ds, p, w) {
        const [D] = ds, n = D.y.length, deg = /deg/i.test(D.xUnit || ''), rad = /rad/i.test(D.xUnit || '');
        const xs = D.x || Float64Array.from({ length: n }, (_, i) => D.x0 + i * D.dx), [x0, x1] = [xs[0], xs[n - 1]];
        const ang = i => deg ? xs[i] * Math.PI / 180 : rad ? xs[i] : (xs[i] - x0) / ((x1 - x0) || 1) * 2 * Math.PI;
        let lo = 0, hi = -Infinity;
        for (let i = 0; i < n; i++) { const v = D.y[i]; if (v < lo) lo = v; if (v > hi) hi = v; } // the whole signal, in a loop: a call takes only ~100 000 arguments
        if (hi <= lo) hi = lo + 1;
        return (ctx, cw, ch, th) => {
          const cx = cw / 2, cy = ch / 2, R = Math.min(cw, ch) / 2 - 24, r = v => (v - lo) / (hi - lo) * R;
          ctx.strokeStyle = th.grid; ctx.fillStyle = th.text; ctx.font = th.font; ctx.textAlign = 'left';
          for (const t of PLOT.niceTicks(lo, hi, 4)) { if (t <= lo) continue; ctx.beginPath(); ctx.arc(cx, cy, r(t), 0, 7); ctx.stroke(); ctx.fillText(fmt(t, hi - lo), cx + r(t) + 2, cy - 4); }
          for (let a = 0; a < 360; a += 30) { const q = a * Math.PI / 180; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(q) * R, cy - Math.sin(q) * R); ctx.stroke(); ctx.textAlign = 'center'; ctx.fillText(a + '°', cx + Math.cos(q) * (R + 12), cy - Math.sin(q) * (R + 12) + 4); }
          ctx.strokeStyle = th.trace; ctx.lineWidth = 1.4; ctx.beginPath();
          for (let i = 0; i < n; i += stride(n)) { const q = ang(i), rr = r(D.y[i]), x = cx + Math.cos(q) * rr, y = cy - Math.sin(q) * rr; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.stroke(); ctx.lineWidth = 1; return null;
        };
      }
    },
    bode: {
      label: 'Bode plot', roles: ['System input', 'System output'],
      draw(ds, p, w) { return bodeDraw(ds, p, w, false); }
    },
    bodepolar: {
      label: 'Bode and Polar (Nyquist) plot', roles: ['System input', 'System output'],
      draw(ds, p, w) { return bodeDraw(ds, p, w, true); }
    },
    box: { label: 'Box plot', roles: 'many', draw: (ds, p, w) => distDraw(ds, w, true, false) },
    violin: { label: 'Violin plot', roles: 'many', draw: (ds, p, w) => distDraw(ds, w, false, true) },
    boxviolin: { label: 'Box plus Violin plot', roles: 'many', draw: (ds, p, w) => distDraw(ds, w, true, true) },
    corner: {
      label: 'Corner plot', roles: 'many',
      draw(ds, p, w) {
        const k = ds.length, n = Math.min(...ds.map(d => d.y.length)), rs = ds.map(d => range(d.y.subarray(0, n), 0.02));
        return (ctx, cw, ch, th) => {
          const m = 34, cell = Math.min((cw - m - 8) / k, (ch - m - 8) / k), L = PLOT.lut('Jet');
          ctx.font = th.font; ctx.textAlign = 'center';
          for (let i = 0; i < k; i++) for (let j = 0; j <= i; j++) {
            const x = m + j * cell, y = 6 + i * cell, s = cell - 4;
            ctx.strokeStyle = th.axis; ctx.strokeRect(x + 0.5, y + 0.5, s, s);
            if (i === j) {
              const hst = DSP.histogram(ds[i].y.subarray(0, n), 30), mx = Math.max(...hst.counts);
              ctx.fillStyle = th.trace; ctx.globalAlpha = 0.6;
              hst.counts.forEach((c, b) => ctx.fillRect(x + b * s / 30, y + s - c / mx * (s - 4), s / 30 - 1, c / mx * (s - 4)));
              ctx.globalAlpha = 1;
            } else {
              ctx.save(); ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip(); ctx.fillStyle = th.trace; ctx.globalAlpha = 0.35;
              const st = Math.max(1, Math.ceil(n / 4000));
              for (let q = 0; q < n; q += st) ctx.fillRect(x + (ds[j].y[q] - rs[j][0]) / (rs[j][1] - rs[j][0]) * s - 1, y + s - (ds[i].y[q] - rs[i][0]) / (rs[i][1] - rs[i][0]) * s - 1, 2, 2);
              ctx.restore();
            }
            ctx.fillStyle = th.text;
            if (i === k - 1) ctx.fillText(titleOf(w, j), x + s / 2, y + s + 14);
            if (j === 0) { ctx.save(); ctx.translate(m - 10, y + s / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(titleOf(w, i), 0, 0); ctx.restore(); }
          }
          void L; return null;
        };
      }
    },
    correlation: {
      label: 'Correlation plot', roles: 'many',
      draw(ds, p, w) {
        const k = ds.length, n = Math.min(...ds.map(d => d.y.length)), R = [];
        const mu = ds.map(d => DSP.mean(d.y.subarray(0, n))), sd = ds.map((d, i) => Math.sqrt(d.y.subarray(0, n).reduce((a, v) => a + (v - mu[i]) ** 2, 0)));
        for (let i = 0; i < k; i++) { R.push([]); for (let j = 0; j < k; j++) { let s = 0; for (let q = 0; q < n; q++) s += (ds[i].y[q] - mu[i]) * (ds[j].y[q] - mu[j]); R[i].push(sd[i] && sd[j] ? s / (sd[i] * sd[j]) : 0); } }
        w.state.matrix = R;
        return (ctx, cw, ch, th) => {
          const m = 40, cell = Math.min((cw - m - 10) / k, (ch - m - 10) / k), L = PLOT.lut('Jet');
          ctx.font = th.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
            const c = Math.round((R[i][j] + 1) / 2 * 255) * 3, x = m + j * cell, y = 8 + i * cell;
            ctx.fillStyle = `rgb(${L[c]},${L[c + 1]},${L[c + 2]})`; ctx.fillRect(x, y, cell - 2, cell - 2);
            ctx.fillStyle = Math.abs(R[i][j]) > 0.6 ? '#fff' : '#000'; ctx.fillText(R[i][j].toFixed(2), x + cell / 2 - 1, y + cell / 2 - 1);
          }
          ctx.fillStyle = th.text;
          for (let i = 0; i < k; i++) { ctx.fillText(titleOf(w, i), m + i * cell + cell / 2, 8 + k * cell + 10); ctx.fillText(titleOf(w, i), m / 2, 8 + i * cell + cell / 2); }
          return null;
        };
      }
    },
    contour: {
      label: 'Spectrogram contour plot', roles: ['3D window (spectrogram / time FFT)'], needs3D: true,
      draw(ds, p, w) {
        const d = ds[0];
        return (ctx, cw, ch, th) => {
          const view = { x0: d.t0, x1: d.t1, y0: d.fMin || 0, y1: d.fMax }, z = d.zAuto;
          const lay = PLOT.drawSpectrogram(ctx, cw, ch, th, { sg: d.sg, view, zRange: z, palette: p.palette || 'Jet', colorbar: true, xLabel: 's', yLabel: 'Hz', dim: !p.imageOff });
          contours(ctx, lay, d.sg, z, p.levels || 8, th);
          return lay;
        };
      }
    }
  };

  function bodeDraw(ds, p, w, withPolar) {
    const [A, B] = ds;
    const r = DSP.crossSpectral(A.y, B.y, 1 / A.dx, p.segLen || 1024, 50, 'Hann');
    const f = [], mag = [], ph = [], re = [], im = [];
    for (let k = 1; k < r.bins; k++) { f.push(k * r.df); const g = r.gain[k], q = r.phase[k] * Math.PI / 180; mag.push(20 * Math.log10(Math.max(g, 1e-12))); ph.push(r.phase[k]); re.push(g * Math.cos(q)); im.push(g * Math.sin(q)); }
    const F = Float64Array.from(f);
    return (ctx, cw, ch, th) => {
      const pw = withPolar ? cw * 0.6 : cw, hh = ch / 2;
      const view = { x0: F[0], x1: F[F.length - 1] };
      ctx.save();
      const l1 = PLOT.drawXY(ctx, pw, hh, th, { traces: [{ sig: { y: Float64Array.from(mag), x: F }, color: th.trace }], view: Object.assign({}, view, (() => { const q = range(mag); return { y0: q[0], y1: q[1] }; })()), logX: true, yLabel: 'dB', xLabel: '' });
      ctx.translate(0, hh);
      PLOT.drawXY(ctx, pw, hh, th, { traces: [{ sig: { y: Float64Array.from(ph), x: F }, color: th.marker }], view: Object.assign({}, view, { y0: -190, y1: 190 }), logX: true, yLabel: 'deg', xLabel: 'Hz' });
      ctx.restore();
      if (withPolar) {
        ctx.save(); ctx.translate(pw, 0);
        const [x0, x1] = range(re), [y0, y1] = range(im), half = Math.max(x1 - x0, y1 - y0) / 2, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        const lay = PLOT.drawXY(ctx, cw - pw, ch, th, { traces: [], view: { x0: mx - half, x1: mx + half, y0: my - half, y1: my + half }, xLabel: 'Re', yLabel: 'Im' });
        clip(ctx, lay.rect); ctx.strokeStyle = th.trace; ctx.beginPath();
        re.forEach((v, i) => { const x = lay.ax.toPx(v), y = lay.ay.toPx(im[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke(); ctx.restore(); ctx.restore();
      }
      return l1;
    };
  }

  function distDraw(ds, w, box, violin) {
    const k = ds.length, sets = ds.map(d => Float64Array.from(d.y).sort());
    const all = sets.flatMap(s => [s[0], s[s.length - 1]]), [y0, y1] = range(all);
    const q = (s, p) => { const i = (s.length - 1) * p, a = Math.floor(i), b = Math.ceil(i); return s[a] + (s[b] - s[a]) * (i - a); };
    return (ctx, cw, ch, th) => {
      const lay = frame(ctx, cw, ch, th, { x0: 0.4, x1: k + 0.6, y0, y1 }, { xFormat: v => Number.isInteger(v) && v >= 1 && v <= k ? titleOf(w, v - 1) : '' });
      clip(ctx, lay.rect);
      sets.forEach((s, i) => {
        const cx = lay.ax.toPx(i + 1), half = (lay.ax.toPx(1.4) - lay.ax.toPx(1)) , col = th.overlay[i % th.overlay.length];
        if (violin) {
          const n = s.length, sd = Math.sqrt(s.reduce((a, v) => a + v * v, 0) / n - (s.reduce((a, v) => a + v, 0) / n) ** 2) || 1, bw = 1.06 * sd * Math.pow(n, -0.2);
          const grid = 80, dens = [], st = Math.max(1, Math.floor(n / 3000));
          for (let g = 0; g <= grid; g++) { const v = s[0] + (s[n - 1] - s[0]) * g / grid; let acc = 0, c = 0; for (let j = 0; j < n; j += st) { const z = (v - s[j]) / bw; acc += Math.exp(-0.5 * z * z); c++; } dens.push([v, acc / c]); }
          const md = Math.max(...dens.map(d => d[1])) || 1;
          ctx.fillStyle = col; ctx.globalAlpha = 0.3; ctx.beginPath();
          dens.forEach(([v, dd], g) => { const x = cx + dd / md * half, y = lay.ay.toPx(v); if (g) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
          for (let g = dens.length - 1; g >= 0; g--) ctx.lineTo(cx - dens[g][1] / md * half, lay.ay.toPx(dens[g][0]));
          ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.stroke();
        }
        if (box) {
          const q1 = q(s, 0.25), q2 = q(s, 0.5), q3 = q(s, 0.75), iqr = q3 - q1, lo = s.find(v => v >= q1 - 1.5 * iqr), hi = [...s].reverse().find(v => v <= q3 + 1.5 * iqr);
          const bw = half * (violin ? 0.25 : 0.6);
          ctx.strokeStyle = th.text; ctx.fillStyle = violin ? th.plotBg : col; ctx.globalAlpha = violin ? 1 : 0.35;
          ctx.fillRect(cx - bw, lay.ay.toPx(q3), 2 * bw, lay.ay.toPx(q1) - lay.ay.toPx(q3)); ctx.globalAlpha = 1;
          ctx.strokeRect(cx - bw, lay.ay.toPx(q3), 2 * bw, lay.ay.toPx(q1) - lay.ay.toPx(q3));
          ctx.beginPath(); ctx.moveTo(cx - bw, lay.ay.toPx(q2)); ctx.lineTo(cx + bw, lay.ay.toPx(q2));
          ctx.moveTo(cx, lay.ay.toPx(q3)); ctx.lineTo(cx, lay.ay.toPx(hi)); ctx.moveTo(cx, lay.ay.toPx(q1)); ctx.lineTo(cx, lay.ay.toPx(lo));
          ctx.moveTo(cx - bw / 2, lay.ay.toPx(hi)); ctx.lineTo(cx + bw / 2, lay.ay.toPx(hi)); ctx.moveTo(cx - bw / 2, lay.ay.toPx(lo)); ctx.lineTo(cx + bw / 2, lay.ay.toPx(lo)); ctx.stroke();
          ctx.fillStyle = th.marker; const st = Math.max(1, Math.floor(s.length / 2000));
          for (let j = 0; j < s.length; j += st) if (s[j] < lo || s[j] > hi) ctx.fillRect(cx - 1.5, lay.ay.toPx(s[j]) - 1.5, 3, 3);
        }
      });
      ctx.restore(); return lay;
    };
  }

  // Marching-squares contour lines over a spectrogram (downsampled grid).
  function contours(ctx, lay, sg, z, levels, th) {
    if (!lay || !sg.rows.length) return;
    const cols = Math.min(sg.rows.length, 300), rows = Math.min(sg.bins, 200), cs = sg.rows.length / cols, rsf = sg.bins / rows;
    const G = []; for (let c = 0; c < cols; c++) { const r = sg.rows[Math.floor(c * cs)].v, col = new Float32Array(rows); for (let k = 0; k < rows; k++) col[k] = r[Math.floor(k * rsf)]; G.push(col); }
    const tx = c => lay.ax.toPx(sg.rows[Math.floor(c * cs)].t), fy = k => lay.ay.toPx((sg.f0 || 0) + k * rsf * sg.df);
    ctx.save(); ctx.beginPath(); ctx.rect(lay.rect.x, lay.rect.y, lay.rect.w, lay.rect.h); ctx.clip();
    for (let l = 1; l <= levels; l++) {
      const lv = z[0] + (z[1] - z[0]) * l / (levels + 1);
      ctx.strokeStyle = l % 2 ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.7)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let c = 0; c < cols - 1; c++) for (let k = 0; k < rows - 1; k++) {
        const a = G[c][k], b = G[c + 1][k], d = G[c][k + 1], e = G[c + 1][k + 1];
        const idx = (a > lv) | ((b > lv) << 1) | ((e > lv) << 2) | ((d > lv) << 3);
        if (idx === 0 || idx === 15) continue;
        const ip = (p, q, P, Q) => P + (lv - p) / (q - p) * (Q - P);
        const pts = [];
        if ((a > lv) !== (b > lv)) pts.push([ip(a, b, tx(c), tx(c + 1)), fy(k)]);
        if ((b > lv) !== (e > lv)) pts.push([tx(c + 1), ip(b, e, fy(k), fy(k + 1))]);
        if ((d > lv) !== (e > lv)) pts.push([ip(d, e, tx(c), tx(c + 1)), fy(k + 1)]);
        if ((a > lv) !== (d > lv)) pts.push([tx(c), ip(a, d, fy(k), fy(k + 1))]);
        for (let i = 0; i + 1 < pts.length; i += 2) { ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  OPS.chart = {
    label: p => (CHARTS[p.type] || {}).label || 'Custom display', kind: 'display', input: 'visible', multi: true,
    compute(w, inputs, p) {
      const C = CHARTS[p.type]; if (!C) throw new Error('Unknown chart type');
      const ds = inputs.filter(Boolean);
      if (C.needs3D) { if (!ds[0] || !ds[0].sg) throw new Error('Needs a 3D parent window'); }
      else {
        if (ds.some(d => !d.y)) throw new Error('All parents must be 2D signal windows');
        const need = Array.isArray(C.roles) ? C.roles.length : 1;
        if (ds.length < need) throw new Error(`Needs ${need} parent window(s)`);
      }
      return { draw: C.draw(ds, p, w), note: ds.length + ' input window(s)', rotatable: !!C.rotatable };
    }
  };
  root.CHARTS = CHARTS;
})(window);
