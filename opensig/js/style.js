/* OpenSig graph style (Edit ▸ Graph style…, Ctrl+Shift+G, window context menu, toolbar): how a signal window draws –
   trace style, width, points and colour, background and grid, axes (colour, width, font size, tick density, number
   format, frame), axis titles, log axes and fixed Y range, plot title and legend. Presets, live preview while the
   dialog is open (Cancel restores the previous style), apply to one window, all windows of the same kind or all signal
   windows, use as default for new windows, and copy / paste a style between windows. Stored in the window's display
   settings, so workspaces and custom tools keep it. */
(function (root) {
  'use strict';
  const { APP, UI } = root;
  const S = APP.S, { dialog, toast, need } = UI;

  const PRESETS = {
    theme: { label: 'Theme default (follows light / dark mode)', look: null, color: null },
    classic: { label: 'Classic (white)', look: { bg: '#ffffff', grid: '#e1e1e1', axis: '#000000', text: '#000000' }, color: null },
    scope: { label: 'Oscilloscope (green on black)', look: { bg: '#001400', grid: '#0b4a0b', axis: '#39ff14', text: '#39ff14', gridStyle: 'dotted', minorGrid: true, frame: 'box' }, color: '#39ff14' },
    print: { label: 'Print (black on white)', look: { bg: '#ffffff', grid: '#c8c8c8', axis: '#000000', text: '#000000', gridStyle: 'dashed', frame: 'box' }, color: '#000000', width: 1.5 },
    night: { label: 'Night (dark grey)', look: { bg: '#141414', grid: '#303030', axis: '#c8c8c8', text: '#dcdcdc' }, color: null },
    contrast: { label: 'High contrast', look: { bg: '#000000', grid: '#5a5a5a', axis: '#ffffff', text: '#ffffff', axisWidth: 2, fontSize: 13 }, color: '#ffff00', width: 2 },
    blueprint: { label: 'Blueprint', look: { bg: '#0b3d91', grid: '#3a6cc6', axis: '#e6f0ff', text: '#e6f0ff', gridStyle: 'dashed' }, color: '#ffffff' },
    paper: { label: 'Engineering paper', look: { bg: '#fbf8ef', grid: '#9cc8a4', axis: '#2c4a32', text: '#2c4a32', minorGrid: true, frame: 'box' }, color: '#c0392b' }
  };
  const STYLES = [['line', 'Line'], ['steps', 'Steps'], ['hist', 'Bars (from zero)'], ['hist-bottom', 'Bars (from bottom)'], ['area', 'Area'], ['dots', 'Points only']];
  const KEYS = ['look', 'style', 'dots', 'width', 'pointSize', 'fillAlpha', 'color', 'xLabel', 'yLabel', 'logX', 'logY', 'fixedY'];

  const cv = document.createElement('canvas').getContext('2d');
  const hex = (c, fb) => { cv.fillStyle = '#000'; cv.fillStyle = c || fb || '#000'; return /^#[0-9a-f]{6}$/i.test(cv.fillStyle) ? cv.fillStyle : fb || '#000000'; };
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  const autoColor = w => w.op ? (w.op.type === 'fft' ? S.theme.trace2 : S.theme.trace3) : S.theme.trace;
  const kindOf = w => !w.op ? 'source' : w.op.type === 'fft' ? 'fft' : 'analysis';
  const defFont = () => S.settings.fontSize || 11;

  // the appearance part of a window's style (what "apply to …", defaults and copy / paste carry)
  const appearance = d => shared({ look: clone(d.look) || null, style: d.style, dots: !!d.dots, width: d.width, pointSize: d.pointSize, fillAlpha: d.fillAlpha, color: d.color || null });
  // the plot title belongs to one window: it is not copied, applied to other windows or used for new ones
  function shared(a) { const b = Object.assign({}, a, { look: clone(a.look) }); if (b.look) { delete b.look.title; if (!Object.keys(b.look).length) b.look = null; } return b; }
  function setAppearance(w, a) {
    const d = w.display;
    Object.assign(d, { look: clone(a.look) || null, style: a.style || d.style, dots: !!a.dots, width: a.width || 1, pointSize: a.pointSize, fillAlpha: a.fillAlpha, color: a.color || null });
    APP.requestRender(w);
  }

  function fields(w) {
    const d = w.display, L = d.look || {}, th = S.theme, fixed = d.fixedY;
    const num = L.numFormat || 'auto';
    return [
      { key: 'preset', label: 'Preset', type: 'select', options: [['', '(keep current)']].concat(Object.entries(PRESETS).map(([k, p]) => [k, p.label])), value: '' },
      { type: 'section', label: 'Trace' },
      { key: 'style', label: 'Style', type: 'select', options: STYLES, value: d.style || 'line' },
      { key: 'width', label: 'Line width', type: 'number', value: d.width || 1, min: 0.5, max: 8, step: 0.5 },
      { key: 'dots', label: 'Show points', type: 'check', value: !!d.dots, show: v => v.style !== 'dots' },
      { key: 'pointSize', label: 'Point size (pixels)', type: 'number', value: d.pointSize || (d.style === 'dots' ? 3 : 4), min: 1, max: 12, step: 1, show: v => v.dots || v.style === 'dots' },
      { key: 'fillAlpha', label: 'Area opacity (%)', type: 'number', value: Math.round((d.fillAlpha ?? 0.3) * 100), min: 5, max: 100, step: 5, show: v => v.style === 'area' },
      { key: 'autoColor', label: 'Automatic colour (signal blue, analysis red)', type: 'check', value: !d.color },
      { key: 'color', label: 'Trace colour', type: 'color', value: hex(d.color || autoColor(w)), show: v => !v.autoColor },
      { type: 'section', label: 'Background and grid' },
      { key: 'themeColors', label: 'Use the theme colours (light / dark mode)', type: 'check', value: !L.bg },
      { key: 'bg', label: 'Background', type: 'color', value: hex(L.bg || th.plotBg), show: v => !v.themeColors },
      { key: 'showGrid', label: 'Show grid', type: 'check', value: L.showGrid !== false },
      { key: 'grid', label: 'Grid colour', type: 'color', value: hex(L.grid || th.grid), show: v => !v.themeColors && v.showGrid },
      { key: 'gridStyle', label: 'Grid lines', type: 'select', options: [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], value: L.gridStyle || 'solid', show: v => v.showGrid },
      { key: 'minorGrid', label: 'Minor grid (5 divisions)', type: 'check', value: !!L.minorGrid, show: v => v.showGrid },
      { type: 'section', label: 'Axes' },
      { key: 'showAxes', label: 'Show axis labels', type: 'check', value: L.showAxes !== false },
      { key: 'frame', label: 'Frame', type: 'select', options: [['auto', 'Left and bottom axis'], ['box', 'Full box']], value: L.frame === 'box' ? 'box' : 'auto' },
      { key: 'axis', label: 'Axis colour', type: 'color', value: hex(L.axis || th.axis), show: v => !v.themeColors },
      { key: 'text', label: 'Text colour', type: 'color', value: hex(L.text || th.text), show: v => !v.themeColors },
      { key: 'axisWidth', label: 'Axis line width', type: 'number', value: L.axisWidth || 1, min: 1, max: 4, step: 1 },
      { key: 'fontSize', label: 'Font size (pixels)', type: 'number', value: L.fontSize || defFont(), min: 7, max: 28, step: 1 },
      { key: 'ticks', label: 'Tick marks', type: 'select', options: [['fewer', 'Fewer'], ['normal', 'Normal'], ['more', 'More']], value: L.ticks || 'normal' },
      { key: 'numFormat', label: 'Number format', type: 'select', options: [['auto', 'Automatic'], ['fixed', 'Fixed decimals (1.25)'], ['sci', 'Scientific (1.25e+3)'], ['eng', 'Engineering (1.25k)']], value: num },
      { key: 'digits', label: 'Decimals', type: 'number', value: L.digits ?? 2, min: 0, max: 10, step: 1, show: v => v.numFormat !== 'auto' },
      { key: 'xLabel', label: 'X-axis title', type: 'text', value: d.xLabel ?? (w.data.xUnit || '') },
      { key: 'yLabel', label: 'Y-axis title', type: 'text', value: d.yLabel ?? (w.data.yUnit || '') },
      { key: 'logX', label: 'Logarithmic X-axis', type: 'check', value: !!d.logX },
      { key: 'logY', label: 'Logarithmic Y-axis', type: 'check', value: !!d.logY },
      { key: 'fixed', label: 'Fixed Y range (no auto-scale)', type: 'check', value: !!fixed },
      { key: 'ymin', label: 'Y min', type: 'number', value: fixed ? fixed.min : +w.view.y0.toPrecision(4), show: v => v.fixed },
      { key: 'ymax', label: 'Y max', type: 'number', value: fixed ? fixed.max : +w.view.y1.toPrecision(4), show: v => v.fixed },
      { type: 'section', label: 'Title and legend' },
      { key: 'title', label: 'Plot title', type: 'text', value: L.title || '' },
      { key: 'legend', label: 'Show legend (this window and its overlays)', type: 'check', value: !!L.legend },
      { type: 'section', label: 'Apply' },
      { key: 'applyTo', label: 'Apply to', type: 'select', options: [['this', 'This window'], ['kind', 'All windows of this kind (' + { source: 'signals', fft: 'FFT windows', analysis: 'analysis results' }[kindOf(w)] + ')'], ['all', 'All signal windows']], value: 'this' },
      { key: 'makeDefault', label: 'Use this look for new windows', type: 'check', value: false }];
  }

  // dialog values → style ({appearance}, axes of this window)
  function fromValues(v) {
    const look = {};
    if (!v.themeColors) Object.assign(look, { bg: v.bg, grid: v.grid, axis: v.axis, text: v.text });
    if (!v.showGrid) look.showGrid = false;
    if (v.gridStyle && v.gridStyle !== 'solid') look.gridStyle = v.gridStyle;
    if (v.minorGrid) look.minorGrid = true;
    if (!v.showAxes) look.showAxes = false;
    if (v.frame && v.frame !== 'auto') look.frame = v.frame;
    if (v.axisWidth > 1) look.axisWidth = Math.round(v.axisWidth);
    if (v.fontSize && Math.round(v.fontSize) !== defFont()) look.fontSize = Math.round(v.fontSize);
    if (v.ticks && v.ticks !== 'normal') look.ticks = v.ticks;
    if (v.numFormat && v.numFormat !== 'auto') { look.numFormat = v.numFormat; look.digits = Math.max(0, Math.min(10, Math.round(v.digits ?? 2))); }
    if (v.title) look.title = v.title;
    if (v.legend) look.legend = true;
    return {
      app: { look: Object.keys(look).length ? look : null, style: v.style, dots: v.style !== 'dots' && !!v.dots, width: Math.max(0.5, v.width || 1),
        pointSize: v.pointSize ? Math.round(v.pointSize) : undefined, fillAlpha: v.style === 'area' && v.fillAlpha ? v.fillAlpha / 100 : undefined, color: v.autoColor ? null : v.color },
      axes: { xLabel: v.xLabel, yLabel: v.yLabel, logX: !!v.logX, logY: !!v.logY, fixedY: v.fixed && v.ymax > v.ymin ? { min: v.ymin, max: v.ymax } : null }
    };
  }
  function setAxes(w, a) { const d = w.display; Object.assign(d, { xLabel: a.xLabel, yLabel: a.yLabel, logX: a.logX, logY: a.logY, fixedY: a.fixedY }); if (a.fixedY) d.zoomY = null; }

  // read the dialog's current inputs (after a preset changed some of them)
  const read = inputs => { const v = {}; for (const [k, el] of Object.entries(inputs)) v[k] = el.type === 'checkbox' ? el.checked : el.dataset.num ? (el.value === '' ? null : parseFloat(el.value)) : el.value; return v; };
  function presetInto(p, inputs, w) {
    const L = p.look || {}, th = S.theme, set = (k, val) => { const el = inputs[k]; if (!el) return; if (el.type === 'checkbox') el.checked = !!val; else el.value = val; };
    set('themeColors', !p.look);
    set('bg', hex(L.bg || th.plotBg)); set('grid', hex(L.grid || th.grid)); set('axis', hex(L.axis || th.axis)); set('text', hex(L.text || th.text));
    set('showGrid', L.showGrid !== false); set('gridStyle', L.gridStyle || 'solid'); set('minorGrid', !!L.minorGrid);
    set('frame', L.frame === 'box' ? 'box' : 'auto'); set('axisWidth', L.axisWidth || 1); set('fontSize', L.fontSize || defFont());
    set('autoColor', !p.color); set('color', hex(p.color || autoColor(w))); set('width', p.width || 1);
  }

  async function graphStyle() {
    const w = need('1d'), before = {};
    KEYS.forEach(k => { before[k] = clone(w.display[k]); });
    let lastPreset = '';
    const preview = v => { const st = fromValues(v); setAppearance(w, st.app); setAxes(w, st.axes); };
    const v = await dialog({ side: true, title: 'Graph style – ' + w.label, intro: 'Changes show in the window right away; Cancel restores the previous style.', fields: fields(w),
      onChange: (vals, inputs) => {
        if (vals.preset && vals.preset !== lastPreset) { lastPreset = vals.preset; presetInto(PRESETS[vals.preset], inputs, w); vals = read(inputs); }
        preview(vals);
      },
      validate: v => v.fixed && !(v.ymax > v.ymin) ? 'Y max must be greater than Y min' : null,
      extra: [{ label: 'Reset to default', run: (vals, inputs) => { presetInto(PRESETS.theme, inputs, w); inputs.style.value = 'line'; inputs.dots.checked = false; inputs.ticks.value = 'normal'; inputs.numFormat.value = 'auto'; inputs.showAxes.checked = true; inputs.title.value = ''; inputs.legend.checked = false; inputs.preset.value = ''; inputs.style.dispatchEvent(new Event('change')); } }],
      ok: 'Apply' });
    if (!v) { KEYS.forEach(k => { w.display[k] = before[k]; }); APP.requestRender(w); return; }
    const st = fromValues(v);
    setAppearance(w, st.app); setAxes(w, st.axes);
    let n = 1;
    if (v.applyTo !== 'this') for (const o of S.wins.values()) {
      if (o === w || o.kind !== '1d' || !o.data || !o.data.y) continue;
      if (v.applyTo === 'kind' && kindOf(o) !== kindOf(w)) continue;
      // keep each window's automatic colour (signal blue / analysis red) unless a colour was chosen
      const keep = o.display.look && o.display.look.title, a = shared(st.app);
      if (keep) a.look = Object.assign({}, a.look, { title: keep }); // the other window keeps its own title
      setAppearance(o, Object.assign(a, { style: o.op && OPSstyle(o) ? o.display.style : st.app.style })); n++;
    }
    if (v.makeDefault) { S.settings.graphDefault = Object.assign(shared(st.app), { style: undefined }); APP.saveSettings(); }
    toast(`Graph style applied to ${n} window${n === 1 ? '' : 's'}${v.makeDefault ? ' and used for new windows' : ''}`);
  }
  // windows whose operation draws in a style of its own (e.g. octave bars) keep that style
  const OPSstyle = o => !!(root.OPS[o.op.type] && root.OPS[o.op.type].style);

  let clip = null;
  function copyStyle() { const w = need('1d'); clip = appearance(w.display); toast('Graph style of ' + w.label + ' copied'); }
  function pasteStyle() {
    if (!clip) throw new Error('Copy a graph style first (Edit ▸ Copy graph style).');
    const ws = root.CONTROL && root.CONTROL.visible() && root.CONTROL.selected().length ? root.CONTROL.selected().filter(o => o.kind === '1d') : [need('1d')];
    ws.forEach(o => { const t = o.display.look && o.display.look.title; setAppearance(o, clip); if (t) o.display.look = Object.assign({}, o.display.look, { title: t }); });
    toast(`Graph style pasted to ${ws.length} window${ws.length === 1 ? '' : 's'}`);
  }
  function clearDefault() { delete S.settings.graphDefault; APP.saveSettings(); toast('New windows use the theme style again'); }

  /* ---------- menus, context menu, toolbar, shortcut ---------- */
  const has1D = () => S.active && S.active.kind === '1d' && S.active.data && S.active.data.y;
  const edit = UI.MENUS.find(m => m.label === 'Edit').items, at = edit.findIndex(it => it !== '-' && it.label === 'Display style');
  edit.splice(at + 1, 0,
    { label: 'Graph style…', key: 'Ctrl+Shift+G', en: has1D, run: graphStyle },
    { label: 'Copy graph style', en: has1D, run: copyStyle },
    { label: 'Paste graph style', en: () => !!clip && (has1D() || !!(root.CONTROL && root.CONTROL.selected().length)), run: pasteStyle },
    { label: 'New windows: theme style', en: () => !!S.settings.graphDefault, run: clearDefault });
  const ds = edit.find(it => it !== '-' && it.label === 'Display style');
  if (ds && ds.sub) {
    const i = ds.sub.findIndex(it => it !== '-' && it.label === 'Line');
    ds.sub.splice(i + 1, 0, { label: 'Steps', en: has1D, checked: () => has1D() && S.active.display.style === 'steps', run: () => { const w = need('1d'); w.display.style = 'steps'; APP.requestRender(w); } });
  }
  const prevExtra = UI.extraWindowItems;
  UI.extraWindowItems = w => { const out = prevExtra ? prevExtra(w) : []; if (w.kind === '1d' && w.data && w.data.y) out.unshift({ label: 'Graph style…', key: 'Ctrl+Shift+G', run: graphStyle }); return out; };
  UI.SHIFT_KEYS = Object.assign(UI.SHIFT_KEYS || {}, { g: graphStyle });
  const palette = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 0 0 13c1.1 0 1.5-.8 1.1-1.6-.5-1 .2-1.9 1.2-1.9h1.6A2.6 2.6 0 0 0 14.5 8 6.5 6.5 0 0 0 8 1.5z" fill="#f3e2c0" stroke="#7a5a2a" stroke-width=".9"/><circle cx="4.8" cy="6.2" r="1.2" fill="#d33"/><circle cx="8" cy="4.3" r="1.2" fill="#2a6fd8"/><circle cx="11.2" cy="6.2" r="1.2" fill="#2e9e4f"/><circle cx="4.9" cy="9.7" r="1.2" fill="#e0a800"/></svg>';
  const row = UI.TOOLBAR[1], j = row.findIndex(b => b !== '|' && b.title === 'Triple line width');
  row.splice(j + 1, 0, UI.TB(palette, 'Graph style (Ctrl+Shift+G)', 'Edit', 'Graph style…'));

  // defaults for new signal windows (Graph style ▸ "Use this look for new windows")
  APP.onNewWindow = w => {
    const g = S.settings.graphDefault;
    if (!g || w.kind !== '1d') return;
    const d = w.display;
    if (g.look) d.look = clone(g.look);
    if (g.width) d.width = g.width;
    if (g.color) d.color = g.color;
    if (g.dots) d.dots = true;
    if (g.pointSize) d.pointSize = g.pointSize;
  };

  UI.graphStyle = graphStyle;
})(window);
