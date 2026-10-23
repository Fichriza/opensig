/* OpenSig User Manual – the topics shown by the help viewer (help.js). Written for OpenSig; no text from any other
   product's manual. Markup helpers: L(id[, text]) links a topic, P(…) is a menu path, K(…) a key, MENU(menu[, sub]) and
   TB(…button titles) show OpenSig's own menu or toolbar buttons, KEYS() the keyboard table. Each topic: T(id, title,
   index keywords, html). Each book: B(id, title, intro html, topics). */
(function (root) {
  'use strict';
  const L = (id, t) => `<a data-t="${id}">${t || ''}</a>`;
  const P = (...a) => `<span class="hv-path">${a.join(' ▸ ')}</span>`;
  const K = (...k) => k.map(x => `<kbd>${x}</kbd>`).join('+');
  const MENU = (m, sub) => `<div class="hv-shot" data-menu="${m}|${sub || ''}"></div>`;
  const TB = (...t) => `<div class="hv-shot" data-tb="${t.join('|')}"></div>`;
  const SHOT = (tb, m, sub, hl) => `<div class="hv-shot hv-combo" data-tb="${tb.join('|')}" data-menu="${m}|${sub || ''}|${hl || ''}"></div>`;
  const NOTE = t => `<p class="hv-note"><b>Note:</b> ${t}</p>`;
  const TIP = t => `<p class="hv-note hv-tip"><b>Tip:</b> ${t}</p>`;
  const SEE = (...ids) => `<p class="hv-see"><b>See also:</b> ${ids.map(i => L(i)).join(', ')}</p>`;
  const T = (id, title, kw, html) => ({ id, title, kw, html });
  const B = (id, title, html, topics) => ({ id, title, html, topics, book: true });
  const KEYS = () => '<div class="hv-keys"></div>';

  const books = [
    B('intro', 'Introduction', '<p><i>OpenSig</i> is a workbench for looking at, measuring and transforming signals: sound, vibration, sensor data or any series of numbers. This part explains the ideas the rest of the manual builds on.</p>', [
      T('welcome', 'Welcome to OpenSig', ['start', 'overview', 'features'], `
<p><i>OpenSig</i> shows signals in windows and lets you build analyses on top of them: spectra, filters, spectrograms, measurements and more. Every analysis is a window of its own, linked to the window it was made from, so changing, zooming or playing a signal updates everything that depends on it.</p>
<p>You can use it in two ways:</p>
<ul><li><b>Desktop app</b> – <code>OpenSig.exe</code>, a single file for 64-bit Windows 10/11. It adds native Open/Save dialogs, recent files, logging to folders, network and serial ports, EMF pictures and command-line automation.</li>
<li><b>Mac app</b> – <code>OpenSig.app</code> for macOS 12 or newer. Shortcuts use ⌘ instead of Ctrl and ⌥ instead of Alt; ⌘Q quits, so the acquisition dialog is ⌃Q there.</li>
<li><b>Web page</b> – the same program in a browser. Files stay on your computer; nothing is uploaded.</li></ul>
<h2>Where to start</h2>
<ul><li>${L('linked')} – the one idea to understand first.</li>
<li>${L('opening')} or ${L('generator')} – get a signal on screen.</li>
<li>${L('fft')} – your first spectrum, then ${L('instruments')} to measure it.</li>
<li>${L('geometry')} – 3D models, mode shapes and damping of structures from vibration measurements.</li>
<li>${L('examples')} – ready-made analyses to explore.</li>
<li>${L('keys')} – every shortcut on one page.</li></ul>
${TIP(`Press ${K('F1')} in any window to open the topic for that window's tool.`)}`),
      T('linked', 'Linked windows', ['parent', 'child', 'tree', 'recalculate', 'link', 'concept'], `
<p>Everything in <i>OpenSig</i> happens in windows. A window either holds a <b>source</b> signal (opened from a file, generated, acquired or pasted) or an <b>analysis</b> calculated from another window – its <b>parent</b>.</p>
<p>When you choose a tool, for example ${P('Signal tools', 'FFT spectrum analysis')}, the tool works on the active window and its result opens in a new <b>child</b> window. The child stays linked: whenever the parent changes, the child recalculates. Children can have children of their own, so you can chain a filter, a spectrum and an instrument in a few clicks.</p>
<h2>The visible part matters</h2>
<p>Spectral tools and instruments use only the <b>visible part</b> of their parent. Zoom into a signal and its FFT shows the spectrum of that part only. Play the signal (${K('F5')}) and the visible part moves through it – every linked window below follows, which turns a static analysis into an animation over time.</p>
<h2>Breaking and restoring the link</h2>
<ul><li>${P('System control', 'Unlink window from parent')} (${K('Alt', 'U')}) freezes a window with its last result. Its title is shown in italics.</li>
<li>${P('System control', 'Link window to parent…')} (${K('Alt', 'L')}) links a window to another parent, so the same analysis can be applied to a different signal.</li></ul>
<p>The ${L('control')} draws the whole tree of windows and lets you work on many windows at once.</p>
${SEE('control', 'zoom', 'play')}`),
      T('desktop', 'The OpenSig desktop', ['menu', 'toolbar', 'status bar', 'user interface', 'window menu', 'context menu'], `
<p>The main window has a menu bar, two toolbar rows, the desktop where signal windows live, and a status bar.</p>
${TB('Open signal', 'Save signal', 'FFT with default settings', 'Spectrogram', 'FFT filter', 'Signal calculator', 'Signal generator')}
<ul><li><b>Menu bar</b> – every command. Items that need a certain kind of window are disabled until such a window is active.</li>
<li><b>Toolbars</b> – the most used commands; hover a button to see its name and shortcut. The second row holds the instrument buttons and the custom tool buttons T1–T5. The large button at the right end, as tall as both rows, opens a new ${L('geometry')}.</li>
<li><b>Workspace tabs</b> – every workspace has its tab above the desktop; see ${L('workspaces')}.</li>
<li><b>Desktop</b> – windows can be moved by their caption, resized at the corner, maximised with a double-click on the caption and arranged with ${P('Window', 'Cascade')} or ${P('Window', 'Tile')}.</li>
<li><b>Window menu</b> – right-click a window (or use the ⋯ button on its caption) for the commands that fit it.</li>
<li><b>Status bar</b> – the active window, its parent, the visible range, the play step and the sampling rate.</li></ul>
<p>Files can be dropped onto the desktop to open them.</p>
${SEE('keys', 'looks')}`),
      T('keys', 'Keyboard and mouse', ['shortcuts', 'hotkeys', 'mouse', 'keyboard', 'F1'], `
<p>Mouse actions in a graph:</p>
<table class="hv-table"><tr><th>Action</th><th>Result</th></tr>
<tr><td>Drag</td><td>Zoom to the selected range (2D) or rectangle (3D)</td></tr>
<tr><td>Double-click</td><td>Reset the zoom</td></tr>
<tr><td>Mouse wheel</td><td>Zoom the X axis around the pointer (${K('Shift')}: the Y axis)</td></tr>
<tr><td>Right-drag or ${K('Ctrl')}+drag</td><td>Pan</td></tr>
<tr><td>Click</td><td>Set the fixed cursor</td></tr>
<tr><td>${K('Shift')}+click</td><td>Pick a value (${L('picker')})</td></tr>
<tr><td>Right-click</td><td>Window menu</td></tr>
<tr><td>Hold ${K('Space')}</td><td>Show the values of harmonic / sideband cursors</td></tr></table>
<p>Keyboard shortcuts:</p>
${KEYS()}
${SEE('zoom', 'cursors', 'harmonic')}`),
      T('looks', 'Dark mode', ['dark', 'theme', 'style', 'classic', 'night', 'colours'], `
<p><i>OpenSig</i> looks like classic Windows: flat windows with light-blue captions, white graphs, black axes and short tick marks. Dark mode keeps this layout with dark colours.</p>
<p>Dark mode can be switched with ${P('Window', 'Dark mode')} (${K('Ctrl', 'Shift', 'D')}), the moon button on the toolbar, or in ${P('File', 'Application settings…')}, where it can also follow Windows. The desktop app darkens its title bar as well.</p>
<p>The colours, grid and axes of single graphs can be changed further with ${L('graphstyle')}.</p>`),
      T('about', 'About OpenSig', ['version', 'license', 'privacy', 'clean-room'], `
<p><i>OpenSig</i> is an independent, clean-room signal analysis program. It contains no code, help text, artwork or licensing logic from other programs and is not affiliated with any other software vendor.</p>
<p>All calculations run on your computer. Only the ${L('ai', 'AI signal report')} sends data elsewhere, and only computed metrics, never raw samples, and only when you ask for it.</p>`)
    ]),

    B('start', 'Getting Started', '<p>How to get signals into <i>OpenSig</i>, and how to save your results and your work.</p>', [
      T('opening', 'Opening signals', ['open', 'file formats', 'WAV', 'CSV', 'ASCII', 'MAT', 'NumPy', 'EDF', 'HDF5', 'raw', 'import', 'drag and drop'], `
<p>Use ${P('File', 'Open signal…')} (${K('Ctrl', 'O')}), the open button, or drop files on the desktop. Supported formats:</p>
<table class="hv-table"><tr><th>Format</th><th>Notes</th></tr>
<tr><td>WAV</td><td>8/16/24/32-bit and float, any number of channels; display settings saved by OpenSig are restored</td></tr>
<tr><td>FLAC, MP3, OGG, AIFF, M4A</td><td>Decoded audio</td></tr>
<tr><td>ASCII / CSV</td><td>One or more columns; ${P('File', 'ASCII / CSV files', 'Import ASCII / CSV…')} asks for separators, header lines and the sampling rate. A file that another program keeps writing can be ${L('followcsv', 'followed')}.</td></tr>
<tr><td>Raw binary</td><td>32-bit float, 16-bit and 8-bit signed or unsigned, from ${P('File', 'Raw binary files', 'Import')}</td></tr>
<tr><td>MATLAB .mat</td><td>Version 5 (also compressed, with structs) and 7.3</td></tr>
<tr><td>NumPy .npy / .npz</td><td>Numeric arrays</td></tr>
<tr><td>EDF, BDF, GDF</td><td>Biomedical recordings</td></tr>
<tr><td>HDF5, JLD2, NetCDF-4</td><td>A dialog lets you choose the signals</td></tr>
<tr><td>UFF / UNV</td><td>Dataset 58</td></tr>
<tr><td>.sig + .txt</td><td>Data logs written by ${L('logging', 'data logging')}</td></tr>
<tr><td>.osw / .ost</td><td>${L('workspaces')} and ${L('customtools')}</td></tr></table>
<p>Each channel of a multi-channel file opens in its own window. ${P('File', 'Signal from clipboard data… (ASCII / CSV)')} turns copied numbers into a signal.</p>
${NOTE('In the desktop app, File ▸ Recent signals lists the last files, and File ▸ Replace signal with… swaps the data of a source window while keeping every analysis linked to it.')}
${SEE('saving', 'generator', 'followcsv')}`),
      T('followcsv', 'Following a CSV file that keeps growing', ['follow', 'live file', 'logger', 'updating', 'growing', 'tail', 'monitor', 'CSV'], `
<p>${P('File', 'ASCII / CSV files', 'Follow updating CSV file…')} (also in the ${P('Data acquisition')} menu) shows a CSV file that another program keeps writing – a data logger, a test rig, a PLC export – and updates the windows as the file changes. Windows made from them (FFT, filters, instruments) follow, as for live input.</p>
<p>After you choose the file, the usual import settings apply (separator, number format, header row, ignored columns, time column or sample rate), plus three more:</p>
<ul><li><b>Read the file again every … seconds</b> – how often the file is checked (1 s unless you change it).</li>
<li><b>The program writing the file</b> – <i>adds rows at the end</i> (a logger): only the new rows are read, and a row that is still being written waits for its line end. If the file gets shorter (a new file under the same name), it is read from the beginning. <i>writes the whole file again</i>: every change replaces the content of the windows.</li>
<li><b>Keep the last … seconds</b> – older rows leave the windows, so a long run does not fill the memory; 0 keeps everything.</li></ul>
<p>Each column opens in its own window. Its status line shows the file and the number of rows, and the status bar shows <b>● Following</b>. A window zoomed to the end of the signal keeps showing the newest rows; one zoomed elsewhere stays where it is. If the file cannot be read for a moment, a warning shows in the windows and OpenSig keeps trying. In the desktop app the file is read while the other program keeps it open.</p>
<p>${P('Data acquisition', 'Stop following CSV files')} stops; closing the windows of a file stops following it too. The windows keep the data read so far.</p>
${NOTE('Following works in the Windows desktop app and in Chrome or Edge. Safari and the Mac app cannot read a file again once it is open. A time column must hold seconds as numbers.')}
${SEE('opening', 'logging')}`),
      T('generator', 'Signal Generator', ['generate', 'sine', 'noise', 'sweep', 'chirp', 'test signal'], `
<p>${P('Signal tools', 'Signal generator…')} creates test signals. Choose the signal type, the sampling rate, the length in seconds and the minimum and maximum amplitude.</p>
<ul><li><b>Periodic:</b> sine, cosine, square, triangular and sawtooth, with a frequency.</li>
<li><b>Steps:</b> step and constant.</li>
<li><b>Noise:</b> white, Gaussian, pink and exponential noise.</li>
<li><b>Sweep:</b> a linear or logarithmic frequency sweep between a start and an end frequency.</li></ul>
<p>Generated signals behave like any opened signal. Combine them with the ${L('calculator')}, for example a sine plus noise.</p>`),
      T('examples', 'Examples', ['demo', 'tutorial', 'samples'], `
<p>${P('Help', 'Examples')} builds complete analyses from generated signals, so you can see how windows link together:</p>
${MENU('Help', 'Examples')}
<p>Each example opens its signals and analysis windows. Change the source (zoom, play, edit) and watch the analyses follow.</p>`),
      T('saving', 'Saving signals and pictures', ['save', 'export', 'WAV', 'CSV', 'PNG', 'EMF', 'clipboard', 'picture'], `
<ul><li>${P('File', 'Save signal as…')} (${K('Ctrl', 'S')}) writes the whole signal as WAV, CSV or text; ${P('File', 'Save visible signal part as…')} only the visible part.</li>
<li>${P('File', 'ASCII / CSV files')} exports X/Y values, and 3D windows as triples or matrices.</li>
<li>${P('File', 'Raw binary files', 'Export')} writes plain sample values.</li>
<li>${P('Edit', 'Copy data to clipboard (ASCII / CSV)')} (${K('Ctrl', 'B')}) copies the visible values for a spreadsheet.</li>
<li>${P('Edit', 'Copy picture to clipboard')}, ${P('Edit', 'Save picture as PNG…')} and, in the desktop app, Enhanced Metafile (EMF) save the graph as an image.</li></ul>
${SEE('workspaces', 'opening')}`),
      T('workspaces', 'Workspaces and their tabs', ['workspace', 'osw', 'tab', 'tabs', 'save session', 'restore', 'auto-save'], `
<p>A workspace stores every window – sources, analyses, their settings, positions, cursors, picked values and graph styles – so you can continue later.</p>
<ul><li>${P('File', 'Save workspace (with data)…')} (${K('Ctrl', 'I')}) stores the signal data in the file.</li>
<li>${P('File', 'Save workspace (file references only)…')} stores the file names instead; when loaded, the files are read again. Use it to apply the same analysis to new recordings.</li>
<li>${P('File', 'Load workspace…')} (${K('Ctrl', 'L')}) opens one in a tab of its own.</li>
<li>${P('File', 'Workspace description…')} adds a note that is shown when the workspace is loaded.</li></ul>
<h2>Workspace tabs</h2>
<p>Every workspace has its own tab above the desktop, with its own windows, numbered from 1. A workspace file opens in a new tab named after the file (an empty tab is used for it), and a saved workspace file is named after its tab.</p>
<ul><li>Click a tab to show its windows; ${K('Ctrl', 'Tab')} and ${K('Ctrl', 'Shift', 'Tab')} step through the tabs in the desktop app (${P('Window', 'Next workspace tab')}).</li>
<li><b>+</b> at the end of the tabs, or ${P('Window', 'New workspace tab')}, adds an empty workspace.</li>
<li>Double-click a tab to rename it (${P('Window', 'Rename workspace tab…')}).</li>
<li>× on a tab, a middle click or ${P('Window', 'Close workspace tab')} closes the tab and its windows, after asking when it has any.</li></ul>
<p>Windows can only be linked within their own tab. Windows of a tab that is not shown are not drawn: a running acquisition keeps recording, and the tab's analyses are brought up to date when you show it again. Switching tabs stops sound playback.</p>
<p>The application settings can save all workspace tabs automatically and open them again at the next start.</p>
${SEE('batch', 'customtools')}`),
      T('batch', 'Batch file processing', ['batch', 'automation', 'command line', 'script generator'], `
<p>${P('File', 'Batch file processing…')} runs the current set of analysis windows over many files: each file replaces the source signal in turn, and the results (instrument values, saved signals or pictures) are written to a folder.</p>
<p>In the desktop app, ${P('File', 'Batch file processing script generator…')} writes a <code>.bat</code> file built on the command-line switches of <code>OpenSig.exe</code>, for example <code>-loadsws</code>, <code>-getvalue</code> and <code>-saveascii</code>. Run <code>OpenSig.exe -help</code> for the full list.</p>`)
    ]),

    B('displaybook', 'Signal Display', '<p>Navigating, measuring by eye and styling the graphs.</p>', [
      T('zoom', 'Zooming and navigating', ['zoom', 'pan', 'scroll', 'navigate', 'reset zoom', 'step'], `
<p>Drag over a graph to zoom to that range; double-click to reset. The mouse wheel zooms around the pointer and right-drag pans. ${P('Edit', 'Zoom to X samples/values…')} (${K('Ctrl', '2')}) sets an exact width.</p>
<p>${P('Play & navigate')} moves the visible part: ${K('Home')} and ${K('End')} jump to the beginning and the end, ${K('←')} and ${K('→')} step by the play step, and ${P('Play & navigate', 'Go to sample…')} jumps to a position. ${P('Edit', 'Open selection in new window')} (${K('Ctrl', 'E')}) copies the visible part into a new source window.</p>
<p>${P('System control', 'Reset all windows (zoom)')} (${K('Ctrl', 'D')}) resets every window at once.</p>
${SEE('play', 'axes')}`),
      T('play', 'Playing signals', ['play', 'animate', 'sound', 'audio', 'loop', 'F5', 'F6'], `
<p>Playing moves the visible part of a signal step by step through it. Every linked analysis recalculates at each step, so spectra, spectrograms and instruments run like a live measurement.</p>
<ul><li>${K('F5')} plays without sound; ${P('Play & navigate', 'Play as fast as possible (no sound)')} skips the waiting.</li>
<li>${K('F6')} plays with sound from the cursor position; ${K('Alt', 'F6')} from the beginning; ${K('Ctrl', 'Alt', 'F6')} only the visible segment.</li>
<li>${K('F7')} stops. ${P('Play & navigate', 'Play in loop')} repeats.</li>
<li>${P('Play & navigate', 'Step change…')} (${K('Alt', '↑')} / ${K('Alt', '↓')}) sets how far each step moves.</li></ul>`),
      T('cursors', 'Cursors and values', ['cursor', 'value', 'marker', 'value at', 'sample units'], `
<p>Click a graph to set the <b>fixed cursor</b>. Its X and Y values are shown in a box at the top of the cursor line. The cursor is used by "play from cursor", ${P('Instruments', 'Value at (with marker)…')} and the 3D extract commands.</p>
<p>${P('Edit', 'Cursor in "sample" units')} shows positions as sample numbers instead of time.</p>
${SEE('harmonic', 'picker', 'markers')}`),
      T('harmonic', 'Harmonic and sideband cursors', ['harmonic cursor', 'sideband cursor', 'pin', 'Enter', 'harmonics', 'sidebands'], `
<p>Two special cursors help to find related frequencies in a spectrum:</p>
<ul><li><b>Harmonic cursor</b> – lines at 2×, 3×, 4×… the mouse position.</li>
<li><b>Sideband cursor</b> – lines at the mouse position ± 1, 2, 3… times an offset. Set the offset in ${P('Instruments', 'Sideband cursor offset…')}, by selecting a range (its width becomes the offset), or with ${K('Space')}+mouse wheel in 1 % steps.</li></ul>
<p>Switch them on in ${P('Instruments')} or the window menu. Hold ${K('Space')} to show the X/Y value of every line.</p>
<h2>Pinning</h2>
<p>Press ${K('Enter')} to pin the cursor set where the mouse is; ${K('Shift', 'Enter')} pins it on the highest value near the mouse. A pinned set stays as lines when the mouse moves away and adds no value boxes to the graph – hold ${K('Space')} to read the values, or switch on ${P('Instruments', 'Show values of the pinned cursor')}. ${K('Enter')} again re-pins, ${K('Esc')} releases. The pin is saved with the workspace.</p>`),
      T('axes', 'Axes settings', ['axes', 'axis', 'range', 'logarithmic', 'scale', 'units', 'title'], `
<p>${P('Edit', 'Axes settings…')} (${K('Ctrl', 'A')}) sets the X and Y ranges, a fixed or automatic Y range, logarithmic axes, units and axis titles. The automatic Y range follows the minimum and maximum of the visible data.</p>
<p>${P('Edit', 'Sample rate change (w/o resampling)…')} and ${P('Edit', 'Edit signal time…')} change how sample positions map to time without changing the values. ${P('Edit', 'Show absolute time on X-axis')} shows clock time for signals that know their start time.</p>
${SEE('graphstyle', 'display')}`),
      T('display', 'Display style', ['line', 'steps', 'histogram', 'area', 'dots', 'colour', 'line width', 'persistence'], `
<p>${P('Edit', 'Display style')} changes how the trace is drawn:</p>
${MENU('Edit', 'Display style')}
<p>${P('Edit', 'Persistence display')} keeps fading copies of earlier traces while a signal plays – useful to see how a spectrum varies.</p>
${SEE('graphstyle')}`),
      T('graphstyle', 'Graph style', ['graph style', 'colours', 'grid', 'presets', 'font', 'number format', 'legend', 'copy style'], `
<p>${P('Edit', 'Graph style…')} (${K('Ctrl', 'Shift', 'G')}, the palette button or the window menu) changes everything about a graph's look. The dialog docks at the side and the graph updates as you change it; Cancel restores the old look.</p>
<ul><li><b>Trace:</b> line, steps, bars, area or points; width, point size and colour.</li>
<li><b>Background and grid:</b> colours, solid / dashed / dotted grid, minor grid.</li>
<li><b>Axes:</b> axis and text colour, axis width, font size, tick density, number format (automatic, fixed decimals, scientific, engineering), frame, titles, logarithmic axes, fixed Y range.</li>
<li><b>Title and legend.</b></li></ul>
<p>Presets give a complete look in one click: theme default, classic, oscilloscope, print, night, high contrast, blueprint and engineering paper. Apply the style to this window, to all windows of the same kind or to all signal windows, or make it the default for new windows. ${P('Edit', 'Copy graph style')} and ${P('Edit', 'Paste graph style')} transfer a look between windows.</p>`),
      T('overlay', 'Overlays and stacked signals', ['overlay', 'compare', 'stacked', 'same window', 'multiple signals'], `
<p>${P('System control', 'Show signals as overlay…')} draws other signals on top of the active window, each in its own colour, to compare them directly. ${P('System control', 'Show signals in a same window (stacked)')} draws them one above the other, each band labelled with its window number (W1, W2 …). The X axis is drawn once, under the bottom signal, so every band gets the same height: a signal needs about 30 pixels to stay readable, which is about 17 signals in a window 550 pixels high and about 27 in a maximised window on a 1080p screen.</p>
<p>The ${L('control')} can do the same for all selected windows.</p>`),
      T('properties', 'Window properties', ['properties', 'title', 'description', 'settings of a window'], `
<p>${P('Edit', 'Properties…')} (${K('Ctrl', 'P')}) shows the settings of the active window. For an analysis window it opens the tool's own dialog, so you can change, for example, the FFT parameters of an existing spectrum; the window recalculates with the new settings.</p>
<p>${P('Edit', 'Change window title…')} renames a window and ${P('Edit', 'Edit window description…')} attaches a note to it.</p>`),
      T('control', 'Control Window', ['control window', 'tree', 'graph of windows', 'select windows', 'Alt+W', 'rename', 'node name', 'window name', 'F2'], `
<p>${P('System control', 'Control window')} (${K('Alt', 'W')}) shows every window as an icon, with lines from each parent to its children – dotted when a child is unlinked, coloured for the inputs of windows with several inputs and for overlays. Hidden windows are marked "H".</p>
<ul><li>Click an icon to select it (numbers show the order); drag a rectangle to select several; ${K('Ctrl')}+drag unselects.</li>
<li>Double-click an icon to bring the window forward; ${K('Del')} deletes the selection.</li>
<li><b>Rename a node</b> (and its window): double-click the name under the icon, press ${K('F2')} after clicking the icon, or right-click the icon and choose <span class="hv-path">Rename…</span>. Type the new name and press ${K('Enter')}; ${K('Esc')} cancels. The window's title bar shows the same name, and it is saved with the workspace and kept when you change the window's settings. To give an analysis window its automatic name back (for example "3 (2592)"), clear the name or choose <span class="hv-path">Use the automatic name</span>; a source signal always keeps a name.</li>
<li>Right-click an icon for its window menu, or empty space for the commands on all selected windows: hide/show/delete, save as one multi-channel WAV or CSV, overlay, average, concatenate, FFT, spectrogram, filter or a custom tool on all of them, zoom, unlink and relink.</li>
<li><b>Arrange the icons freely:</b> drag an icon to any place – all selected icons move together – or nudge the selection with the arrow keys (${K('Shift')}: one pixel). Icons snap to a small grid unless <span class="hv-path">Snap icons to grid</span> is off in the empty-space menu. The places are saved with the workspace; <span class="hv-path">Arrange icons automatically</span> brings back the tree layout.</li>
<li>Drop an icon <b>onto another</b> to copy its analysis there (${K('Ctrl')}: move it). Hold ${K('Shift')} when dropping a source on empty space to duplicate it with its analysis.</li></ul>
<p>The picked values of a window are one "Picked values" node linked to it. Click a line to select that point, double-click the node for the table, right-click for more.</p>
${SEE('linked', 'picker')}`)
    ]),

    B('analysis', 'Signal Analysis', '<p>The tools in the <span class="hv-path">Signal tools</span> menu. Each opens its result in a new window linked to the active one.</p>', [
      T('fft', 'FFT', ['FFT', 'spectrum', 'frequency', 'magnitude', 'power spectrum', 'PSD', 'phase', 'Ctrl+F'], `
<p>Most spectral tools in <i>OpenSig</i> are based on the Fast Fourier Transform. It turns the visible part of a signal from the time domain into the frequency domain: which frequencies the signal contains, and how strongly.</p>
<p>By preparing the signal before the transform – removing the mean or a trend, applying a window, averaging segments – and by choosing how the result is shown, many variants of a spectrum can be calculated. The settings are described in ${L('fftparams')}.</p>
<p>Predefined combinations are available from the toolbar and from ${P('Signal tools', 'FFT spectrum analysis')}:</p>
${SHOT(['FFT with default settings', 'FFT filter', 'Spectrogram', 'Time FFT'], 'Signal tools', 'FFT spectrum analysis', 'FFT Magnitude, averaged (dB scale)')}
<ul><li>${K('Ctrl', 'F')} calculates an FFT with the default settings (${P('Signal tools', 'Spectral analysis defaults…')}).</li>
<li>${P('Signal tools', 'FFT spectrum analysis', 'FFT with custom settings…')} asks for every parameter first.</li>
<li>To change the settings of an existing FFT window, open its ${L('properties')} (${K('Ctrl', 'P')}).</li></ul>
<p>The FFT window is named after its parent, for example <code>FFT( 1#signal.wav)</code>, and recalculates whenever the parent's visible part changes. Zoom into a signal to see the spectrum of one event, or play it to watch the spectrum change.</p>
${TIP('The FFT has been checked value for value against reference spectra for every window function, result type, averaging mode and scale.')}
${SEE('fftparams', 'spectrogram', 'fftfilter', 'instruments')}`),
      T('fftparams', 'Changing FFT calculation parameters', ['window function', 'Hann', 'Hamming', 'Blackman', 'flat top', 'zero padding', 'averaging', 'overlap', 'dB', 'dBFS', 'smoothing', 'Siegel', 'A-weighting', 'C-weighting'], `
<p>The FFT dialog (${P('Signal tools', 'Spectral analysis defaults…')}, FFT with custom settings, or the properties of an FFT window) has these groups:</p>
<h2>Averaging</h2>
<ul><li><b>Instantaneous spectrum</b> – one FFT of the whole visible part.</li>
<li><b>Split input in overlapping segments</b> – the visible part is cut into a number of segments that overlap by a percentage; their spectra are averaged. This reduces noise in the spectrum (Welch's method). "Average complex spectra" averages before taking the magnitude.</li>
<li><b>Average last X spectra</b> – for live and played signals, averages the latest results.</li></ul>
<h2>Signal conditioning</h2>
<p>Subtract the mean, remove a linear trend, clip values beyond N standard deviations, and apply a <b>window function</b>: Hann, Hamming, Blackman, rectangle, triangle, Tukey (25 % / 50 %), Kaiser (β = 2/4/8), flat top, Blackman-Harris, Nuttall, Gaussian or exponential. Windows reduce leakage; flat top gives the most exact amplitudes, Hann is a good general choice.</p>
<p><b>Zero-padding</b> lengthens the data before the transform – never, optimal, next power of 2, or 2/4/8 times that – which gives a finer frequency grid.</p>
<h2>Spectrum units</h2>
<p>Logarithmic Y axis (dB), dBFS relative to a full-scale value (predefined bit depths, the maximum, or a value you enter), and the X unit: Hz, CPM (cycles per minute), kHz or MHz.</p>
<h2>Spectrum properties</h2>
<ul><li><b>Show result as</b> magnitude, power spectrum, power spectral density (PSD), phase, real or imaginary part.</li>
<li><b>Custom filter curve</b> – A- or C-weighting, or a curve you imported.</li>
<li><b>Smoothing</b> with a weighted moving average over a number of points.</li>
<li><b>Test for significant peaks</b> (Siegel's test) at 95 % or 99 % confidence.</li>
<li><b>Displayed frequency range</b> – limit the X axis to a band.</li></ul>
${NOTE(`${P('Signal tools', 'Import FFT settings (.swt / .sws)…')} reads FFT settings from <code>.swt</code> tool and <code>.sws</code> workspace files, and ${P('Signal tools', 'Save FFT settings as .swt tool…')} writes them back.`)}
${SEE('fft')}`),
      T('calculator', 'Signal Calculator', ['calculator', 'expression', 'formula', 'math', 'cross-spectrum', 'coherence', 'FRF', 'order analysis'], `
<p>${P('Signal tools', 'Signal calculator…')} creates a window from a formula over other windows. Windows are named <code>W1</code>, <code>W2</code>… (the number in their caption). For example:</p>
<ul><li><code>W1 * 2</code> – scale a signal</li>
<li><code>W1 - W2</code> – the difference of two signals</li>
<li><code>db(W3)</code> – a spectrum in decibels</li>
<li><code>coherence(W1, W2)</code> – how strongly two signals are related per frequency</li></ul>
<p>Functions include arithmetic and trigonometry (<code>abs</code>, <code>sqrt</code>, <code>log</code>, <code>exp</code>, <code>sin</code>…), <code>min</code>, <code>max</code>, <code>mean</code>, <code>rms</code>, <code>smooth</code>, <code>delay</code>, and two-signal analyses: <code>xcorr</code>, <code>conv</code>, <code>xspec</code> (cross-spectrum), <code>coherence</code>, <code>gain</code>, <code>frfmag</code>, <code>phase</code>, <code>align</code>. <code>cfft</code> and <code>ifft</code> transform to the complex spectrum and back (<code>re</code>, <code>im</code> take its parts), and <code>toorder</code> / <code>fromorder</code> resample to and from shaft orders for order analysis.</p>
<p>The result stays linked to every window in the formula.</p>`),
      T('editnode', 'Edit node (table)', ['edit node', 'table', 'spreadsheet', 'excel', 'edit values', 'change values', 'formula', 'paste values'], `
<p>An <b>Edit node</b> lets you change single values of a window without touching it: it is a window of its own, linked to the window it was made from, whose result is the parent's values with your changes. Every window you create from the Edit node – an FFT, a filter, an instrument – uses the edited values.</p>
<p>Make one with ${P('Signal tools', 'Edit node (table)…')}, ${P('Edit', 'Edit node (table)…')} or "Add edit node (table)" in the window menu. Its window is a simple spreadsheet:</p>
<ul><li><b>Name box and formula bar</b> at the top: the selected cell (type <code>Y100</code> or <code>100</code> into the name box to go there) and its value.</li>
<li><b>Row numbers</b>, the <b>X</b> column (time or frequency, follows the sample rate) and the <b>Y</b> column with the values you can change.</li>
<li>Changed cells are <b>yellow</b> with a mark in the corner; the tooltip shows the original value. The status bar counts the changes and shows the average, count and sum of a selection.</li></ul>
<h2>Changing values</h2>
<ul><li>Select a Y cell and type a number, then ${K('Enter')} (down), ${K('Tab')} or an arrow key. ${K('F2')} or a double-click edits the current value; ${K('Esc')} cancels.</li>
<li>Type a <b>formula</b> starting with <code>=</code>: <code>x</code> is the X value, <code>y</code> the original value, <code>i</code> the row number, with + − * / ^, <code>pi</code> and functions such as <code>sqrt</code>, <code>sin</code>, <code>abs</code>, <code>min</code>, <code>max</code>, <code>round</code>. Example: <code>=y*2</code>.</li>
<li>Select several cells (drag, ${K('Shift')}+click or ${K('Shift')}+arrows) and finish with ${K('Ctrl', 'Enter')} to fill all of them – a formula is worked out for each row.</li>
<li>${K('Delete')} or <b>Restore</b> brings back the original values of the selection; <b>Restore all</b> undoes every change. ${K('Ctrl', 'Z')} / ${K('Ctrl', 'Y')} undo and redo.</li>
<li>${K('Ctrl', 'C')} copies the selection (tab-separated, for a spreadsheet); ${K('Ctrl', 'V')} pastes a column of numbers into Y from the selected row down – a single number fills the whole selection.</li>
<li>Click a column header to select the column, a row number to select the row, the corner to select everything.</li></ul>
<p><b>Graph</b> shows the edited values as an ordinary signal graph; the window menu item <span class="hv-path">Show as table</span> switches back. The changes are saved with the workspace. When the parent changes (zoom, new data), the Edit node recalculates and keeps your changes at the same rows.</p>
${SEE('linked', 'calculator', 'control')}`),
      T('autocorr', 'Autocorrelation', ['autocorrelation', 'periodicity', 'correlation'], `
<p>${P('Signal tools', 'Autocorrelation')} shows how similar the visible part is to shifted copies of itself. Peaks at a lag reveal a repeating pattern with that period, even when it is hidden in noise.</p>
<p>For the correlation of two different signals use <code>xcorr(W1, W2)</code> in the ${L('calculator')}.</p>`),
      T('fftfilter', 'FFT Filter', ['filter', 'low-pass', 'high-pass', 'band-pass', 'band-stop', 'FFT filter', 'filter curve'], `
<p>${P('Signal tools', 'FFT filter…')} (${K('Ctrl', 'Y')}) removes frequencies by working on the spectrum: the signal is transformed, the unwanted frequencies are suppressed and the result is transformed back. Choose low-pass, high-pass, band-pass or band-stop with the cut-off frequencies, or a custom filter curve.</p>
<p>The <b>filter slope width</b> makes the transition gradual; 0 gives a brick-wall filter. FFT filters have no phase shift.</p>
<p>${P('File', 'Save as filter curve…')} turns a spectrum into a curve you can apply, and ${P('File', 'Import filter curve (.flt) / filter bank (.flb)…')} reads existing curves.</p>
${SEE('iirfilter')}`),
      T('iirfilter', 'IIR Filter', ['IIR', 'Butterworth', 'filter order', 'recursive filter'], `
<p>${P('Signal tools', 'IIR filter…')} applies a Butterworth filter – low-pass, high-pass, band-pass or band-stop – of order 2 to 12. Higher orders cut more steeply. Unlike the ${L('fftfilter')}, an IIR filter works sample by sample like an analogue filter and shifts the phase.</p>`),
      T('averager', 'Signal Averager', ['average', 'averager', 'synchronous average', 'noise reduction'], `
<p>${P('Signal tools', 'Averager…')} averages the successive results of its parent – for example spectra while a signal plays, or repeated measurements during acquisition. Random noise averages out while repeating components stay.</p>
<p>To average several existing windows, select them in the ${L('control')} and choose Average.</p>`),
      T('resample', 'Resampling signals', ['resample', 'sampling rate', 'downsample', 'upsample'], `
<p>${P('Signal tools', 'Resample…')} converts the signal to another sampling rate with proper filtering, for example to bring two recordings to the same rate. To relabel the rate without changing any samples, use ${P('Edit', 'Sample rate change (w/o resampling)…')}.</p>`),
      T('conditioning', 'Removing DC, trends and peaks', ['DC offset', 'mean', 'trend', 'detrend', 'peaks', 'spikes', 'outliers', 'smoothing', 'moving average'], `
<ul><li>${P('Signal tools', 'Remove DC offset')} subtracts the mean so the signal is centred on zero.</li>
<li>${P('Signal tools', 'Remove linear trend')} subtracts the best-fitting straight line, removing slow drift.</li>
<li>${P('Signal tools', 'Remove peaks…')} replaces spikes beyond a limit.</li>
<li>${P('Signal tools', 'Moving average smoothing…')} averages each point with its neighbours to reduce noise.</li>
<li>${P('Signal tools', 'Scale / normalize…')} multiplies, offsets or normalises the values, for example to a peak of 1.</li></ul>`),
      T('hold', 'Peak and Min Hold', ['peak hold', 'min hold', 'maximum', 'envelope'], `
<p>${P('Signal tools', 'Peak hold')} keeps, for every point, the highest value its parent has shown so far; ${P('Signal tools', 'Min hold')} the lowest. On a spectrum while a signal plays, peak hold shows the strongest level each frequency ever reached.</p>`),
      T('histogram', 'Probability distribution', ['histogram', 'distribution', 'probability'], `
<p>${P('Signal tools', 'Probability distribution / Histogram…')} counts how often values fall into each of a number of bins – showing whether a signal is, for example, normally distributed, clipped or bimodal.</p>`),
      T('integral', 'Integral, derivative and sorted values', ['integral', 'integrate', 'derivative', 'differentiate', 'sorted values', 'velocity', 'acceleration'], `
<ul><li>${P('Signal tools', 'Integral curve')} – the running integral, for example velocity from acceleration.</li>
<li>${P('Signal tools', 'Differentiate')} – the rate of change.</li>
<li>${P('Signal tools', 'Sorted values curve')} – all values sorted in ascending order, showing how much of the time a level is exceeded.</li></ul>`),
      T('envelope', 'Envelope and instantaneous frequency', ['envelope', 'Hilbert', 'instantaneous frequency', 'demodulation', 'local max'], `
<ul><li>${P('Signal tools', 'Envelope (Hilbert transform)')} – the amplitude envelope of a modulated signal, widely used for bearing diagnostics.</li>
<li>${P('Signal tools', 'Envelope (local max method)')} – an envelope through the local maxima.</li>
<li>${P('Signal tools', 'Instantaneous frequency (Hilbert transform)')} – the frequency at every moment, for sweeps and frequency-modulated signals.</li></ul>
<p>An FFT of the envelope shows the modulation frequencies.</p>`),
      T('zerocross', 'Zero-crossings and cepstrum', ['zero crossing', 'cepstrum', 'quefrency', 'echo'], `
<p>${P('Signal tools', 'Zero-crossings')} marks where the signal crosses zero; see also the zero-crossing rate instrument.</p>
<p>${P('Signal tools', 'Cepstrum')} is the spectrum of the logarithmic spectrum. Peaks reveal families of evenly spaced harmonics or sidebands, and echoes.</p>`),
      T('wavelet', 'Wavelet denoising', ['wavelet', 'denoise', 'Haar', 'Daubechies'], `
<p>${P('Signal tools', 'Wavelet denoising…')} splits the signal into wavelet levels (Haar or Daubechies 2/4/6), shrinks the small coefficients that mostly contain noise, and rebuilds the signal. Choose the number of levels, the threshold rule (universal, robust per level, or a fixed 3σ) and soft or hard shrinkage.</p>
${SEE('cwt')}`),
      T('tacho', 'Tacho signal to RPM', ['tacho', 'RPM', 'speed', 'pulses', 'rotation'], `
<p>${P('Signal tools', 'Convert tacho signal to RPM…')} turns a pulse signal from a speed sensor into rotational speed over time. Enter the pulses per revolution and choose RPM or Hz.</p>`),
      T('align', 'Aligning signals', ['align', 'sync', 'delay', 'time shift'], `
<p>${P('Signal tools', 'Align signals (sync)…')} finds the time shift between signals by cross-correlation and shifts them into line, for example two recordings of the same event made by different devices.</p>`),
      T('octave', 'Octave plots', ['octave', '1/3 octave', 'third octave', 'fractional octave', 'filter bank', 'acoustics'], `
<p>${P('Signal tools', 'Octave plot')} and ${P('Signal tools', '1/3 octave plot')} show the level in standard frequency bands, as used in acoustics and noise measurement. ${P('Signal tools', 'Other octave plots')} adds 1/6, 1/9 and 1/12 octaves and a dialog with A- or C-weighting.</p>
<p>${P('Signal tools', 'Custom filter bank plot…')} uses bands you define, one "from;to" line per band in Hz.</p>`),
      T('overtime', 'Instrument values over time', ['over time', 'trend', 'history', 'band level'], `
<p>${P('Signal tools', 'Instrument values over time…')} runs an instrument at successive positions of a signal and draws the results as a new signal – for example the RMS level or the dominant frequency over the whole recording.</p>`),
      T('srs', 'Shock Response Spectrum', ['SRS', 'shock', 'shock response'], `
<p>${P('Signal tools', 'Shock Response Spectrum (SRS)…')} shows the peak response of a series of single-degree-of-freedom systems to a shock, against their natural frequency. It is used to judge how damaging a mechanical shock is.</p>`),
      T('peaks', 'Peak detection', ['peak detection', 'peaks', 'threshold', 'peak count', 'prominence', 'valleys', 'find peaks', 'z-score', 'wavelet peaks', 'copy peaks'], `
<p>${P('Signal tools', 'Peak detection…')} (also in the window menu) marks every peak in the visible part with its position and value. It is a setting of the signal window rather than a new window, so the markers follow when you zoom or play. Choose one of six <b>methods</b>:</p>
<table class="hv-table"><tr><th>Method</th><th>Finds</th><th>Good for</th></tr>
<tr><td>Threshold</td><td>The maximum of each part above a threshold</td><td>Clean signals</td></tr>
<tr><td>Prominence</td><td>Local maxima that rise at least a given amount above the valleys beside them</td><td>Peaks on a sloping or wandering baseline</td></tr>
<tr><td>N highest peaks</td><td>The highest local maxima</td><td>The strongest lines of a spectrum</td></tr>
<tr><td>Slope (smoothed derivative)</td><td>Where the smoothed slope turns from rising to falling</td><td>Broad peaks with noise on them</td></tr>
<tr><td>Adaptive threshold (moving z-score)</td><td>Samples outside a moving band of mean ± N standard deviations</td><td>Live and drifting signals, sudden events</td></tr>
<tr><td>Wavelet ridge lines (CWT)</td><td>Peaks that stay visible across a range of wavelet scales</td><td>Noisy data with peaks of a known width</td></tr></table>
<h2>Threshold</h2>
<ul><li><b>Positive threshold</b> – a peak is the first maximum of each part above it. The default is the minimum plus 75 % of the range.</li>
<li><b>Negative threshold</b> – a level (not a magnitude) for valleys; the default is the minimum plus 25 %.</li>
<li><b>Minimal width</b> – parts shorter than this many samples are skipped.</li>
<li><b>Allow multiple peaks inside one threshold crossing</b> – every local maximum that is also the largest within half the width.</li></ul>
<h2>Prominence</h2>
<p>The <b>prominence</b> of a peak is how far it rises above the higher of the two lowest points between it and the next higher sample on each side. A small bump on the flank of a big peak has a small prominence even when it is high. Optionally require a <b>minimum height</b> and a <b>minimum width</b>, measured halfway down the prominence. Results match <code>scipy.signal.find_peaks</code>.</p>
<h2>N highest peaks</h2>
<p>The given number of highest local maxima. Both this method and Prominence take a <b>minimum distance</b>: of two peaks closer than that many samples, only the higher one is kept.</p>
<h2>Slope</h2>
<p>The first derivative is smoothed over the <b>smoothing width</b>; a peak is where it crosses zero going down, more sharply than the <b>slope threshold</b>, at the highest sample nearby that is above the <b>minimum height</b>. Wider smoothing ignores more noise but merges close peaks.</p>
<h2>Adaptive threshold</h2>
<p>A moving band follows the mean and standard deviation of the last <b>window</b> samples. A sample further than <b>threshold</b> standard deviations from the mean signals a peak (or a valley); the extreme of each run of signalling samples is marked. <b>Influence</b> sets how much signalling samples move the band – 0 keeps it on the baseline.</p>
<h2>Wavelet ridge lines</h2>
<p>The signal is analysed with Ricker ("Mexican hat") wavelets of every width in the given range. A peak shows as a line of maxima across the widths; lines that are long enough and stand out from the local noise by the <b>minimum signal-to-noise ratio</b> are kept. Results match <code>scipy.signal.find_peaks_cwt</code>. This method is slower on very long visible parts.</p>
<h2>All methods</h2>
<ul><li><b>Detect negative peaks (valleys)</b> – also marks the minima.</li>
<li><b>Peak position</b> – at the sample, or between samples by fitting a parabola (or a Gaussian, exact for Gaussian-shaped peaks) through the top three samples. Use it for exact frequencies of spectral lines.</li></ul>
<p>${P('Signal tools', 'Copy detected peaks')} copies the X and Y of every marked peak, tab-separated, for a spreadsheet. The Peak count and Average peak distance ${L('instruments')} read the detected peaks.</p>`)
    ]),

    B('three', '3D Analysis', '<p>Tools that show how a spectrum changes over time.</p>', [
      T('spectrogram', 'Spectrogram', ['spectrogram', 'time-frequency', 'waterfall', 'Ctrl+G'], `
<p>${P('3D tools', 'Spectrogram…')} (${K('Ctrl', 'G')}) cuts the visible part into overlapping segments, calculates the spectrum of each and shows them side by side: time on the X axis, frequency on the Y axis and level as colour. ${P('3D tools', 'Spectrogram with default settings')} skips the dialog.</p>
${SEE('timefft', 'views3d', 'cursor3d')}`),
      T('timefft', 'Time FFT', ['time FFT', 'mesh', 'waterfall', '3D', 'Ctrl+T'], `
<p>${P('3D tools', 'Time FFT…')} (${K('Ctrl', 'T')}) calculates the same series of spectra as the ${L('spectrogram')} and shows them as a 3D mesh. ${P('3D tools', 'Time FFT statistics…')} reduces it to the average, minimum or maximum spectrum.</p>`),
      T('cwt', 'Continuous wavelet transform', ['CWT', 'wavelet', 'Morlet', 'scalogram'], `
<p>${P('3D tools', 'Continuous wavelet transform (CWT)…')} shows a time-frequency picture using Morlet wavelets. Unlike a spectrogram, its time resolution is finer at high frequencies and its frequency resolution finer at low ones – good for short events in slower signals.</p>`),
      T('views3d', '3D views and palettes', ['mesh view', 'spectrogram view', 'palette', 'colour map', 'Z axis', 'F2', 'F3'], `
<p>Every 3D window can be shown as a <b>spectrogram</b> (${K('F3')}) or a <b>mesh</b> (${K('F2')}). ${P('3D tools', 'Palette')} chooses one of 13 colour palettes, ${P('3D tools', 'Adjust Z-axis…')} sets the level range, ${P('3D tools', 'Show colour map')} adds the colour scale and ${P('3D tools', 'Invert colours')} reverses it. "Optimize colours for low amplitudes" brings out weak components.</p>`),
      T('cursor3d', '3D cursor and slices', ['3D cursor', 'slice', 'extract', 'Tab'], `
<p>${K('Tab')} switches on the 3D cursor. ${P('3D tools', 'Extract X-cursor (spectrum at cursor time)')} opens the spectrum at the cursor time as a new window, and ${P('3D tools', 'Extract Y-cursor (level over time at cursor frequency)')} the level of one frequency over time. The slice commands extract at the position of the maximum.</p>
<p>${P('3D tools', 'Track changes in 3D graphics…')} follows the maximum through the graph, and ${P('3D tools', '3D signal filter…')} keeps only a frequency and time region.</p>`)
    ]),

    B('modal', 'Geometry and Mode Shapes', '<p>A 3D model of the test object that moves with your measurements: operating deflection shapes, mode shapes, natural frequencies and damping from ambient vibration tests (operational modal analysis).</p>', [
      T('geometry', 'The Geometry node', ['geometry', 'Geometry node', 'modal analysis', 'OMA', 'operational modal analysis', 'ambient vibration', 'structure', 'bridge', 'bridge deck', 'example'], `
<p>A <b>Geometry node</b> draws a 3D model of the test object and moves it with your measurements, so you can see how the structure vibrates.</p>
<p>Make one in any of three ways:</p>
<ul><li>${P('3D tools', 'Geometry and mode shapes (ODS / FDD)…')};</li>
<li>the large Geometry button at the right end of the toolbar (after Help, as tall as both rows);</li>
<li>select the measured signals in the ${L('control')} and choose "Geometry with the selected signals" from the empty-space menu – the signals are put in the DOFs tab, ready to get their nodes.</li></ul>
<p>A new Geometry window nearly fills the work area. On the left is the model view, with the animation controls and the tool box above it; on the right is the editor with six tabs: <b>Nodes</b>, <b>Lines</b>, <b>Surfaces</b>, <b>DOFs</b>, <b>FDD</b> and <b>Modes</b>. The model, the channels, the view and the mode table are saved with the workspace.</p>
<h2>Step by step</h2>
<ol><li>Build the model – ${L('geomodel')} and ${L('geodraw')} – or open a saved one (${L('geofile')}).</li>
<li>Tell OpenSig where each sensor was: ${L('geodofs')}.</li>
<li>Look at the motion: ${L('geoanim')}.</li>
<li>Find the natural frequencies and the damping: ${L('geomodes')}.</li>
<li>Press <b>▶ Run</b> for the finished model: ${L('georun')}.</li></ol>
<p>With fewer sensors than measurement points, measure in several setups and let OpenSig combine them: ${L('georoving')}.</p>
<h2>Examples: a bridge deck</h2>
<p>${P('Help', 'Examples', 'Bridge deck: ambient vibration and mode shapes')} sets up a typical ambient vibration test of a 30 m single-span deck, 8 m wide, on two abutments. Ten vertical accelerometers sit on both edges at 5, 10, 15, 20 and 25 m; the two at 10 m are the reference channels. The five-minute records (100 samples/s) are simulated: traffic and wind excite four modes – vertical bending at 3.2 Hz, torsion at 4.7 Hz, second bending at 12.1 Hz and second torsion at 15.3 Hz. The Geometry node opens on the FDD tab with the first mode animated; press <b>▶ Run</b> to see the finished model with its four mode buttons, or click the peaks to compare the shapes. In bending both edges move together; in torsion they move in opposite directions.</p>
<p>${P('Help', 'Examples', 'Bridge deck: roving test in 2 setups')} measures the same deck with only six sensors: the two at 10 m stay in place as references, the other four move from 5 and 15 m (setup 1) to 20 and 25 m (setup 2). The Geometry node combines the two setups into full mode shapes.</p>
${NOTE('The channels need one common sample rate. Measure all channels of a setup at the same time – the shapes come from their cross-spectra.')}
${SEE('geomodel', 'geodofs', 'geoanim', 'geomodes', 'georun')}`),
      T('geomodel', 'Nodes, lines and surfaces', ['nodes', 'lines', 'surfaces', 'coordinates', 'generate', 'grid', 'box', 'circle', 'cylinder', 'cone', 'beam', 'outline', 'paste nodes', 'rename node', 'node name', 'renumber', 'F2'], `
<p>The model is a set of <b>nodes</b> – points with X, Y and Z coordinates – joined by <b>lines</b> and <b>surfaces</b>.</p>
<ul><li><b>Nodes</b> – type them in the <b>Nodes</b> tab (<b>+ Node</b>), paste "number, X, Y, Z" lines (optionally with a name) from a spreadsheet with <b>Paste…</b>, or use <b>Generate</b>: grid, rectangle outline, box, circle, cylinder, truncated cone or beam, each placed at an origin (X, Y, Z) of your choice. The cylinder, cone and circle generators also set the cylinder axis for radial and tangential sensors (${L('geodofs')}).</li>
<li><b>Lines</b> and <b>Surfaces</b> (three or four corner nodes) connect them. Add them in their tabs and choose the nodes from the lists, or draw them with the mouse (${L('geodraw')}).</li>
<li>× deletes a row; deleting a node also deletes its lines and surfaces. <b>Clear</b> removes the whole model but keeps the channel list.</li></ul>
<h2>Renaming a node</h2>
<p>Give a node another number, a name (for example "Midspan north"), or both: select the node and click <b>Rename…</b>, double-click the node in the view, right-click it and choose "Rename node…", or press ${K('F2')}. You can also type in the node's Node and Name cells in the table. Lines, surfaces and channels follow a new number; the name appears next to the number in the view and in the DOFs table, and is saved in .osgeo files.</p>
<h2>Renumbering</h2>
<p><b>Renumber…</b> gives all nodes new numbers from a first number with an increment, in their current order or sorted by X, Y or Z. Lines, surfaces, channels and names follow.</p>
${SEE('geodraw', 'geofile', 'geodofs')}`),
      T('geodraw', 'Drawing in the view', ['draw', 'drawing tools', 'add points', 'move points', 'draw lines', 'draw surfaces', 'snap', 'working plane', 'delete node'], `
<p>The tool box under the animation controls sets what a click in the view does:</p>
<table class="hv-table"><tr><th>Tool</th><th>Click</th></tr>
<tr><td>Select / rotate</td><td>Selects a node; dragging rotates the view.</td></tr>
<tr><td>Add points</td><td>Adds a node on the working plane under the pointer. The plane faces the view (Top and Bottom: XY, Front and Back: XZ, Left and Right: YZ) and passes through the selected node, or through 0. <b>Snap</b> rounds the new coordinates.</td></tr>
<tr><td>Move points</td><td>Drag a node within its working plane.</td></tr>
<tr><td>Draw lines</td><td>Click nodes one after the other to connect them; ${K('Esc')} ends the chain.</td></tr>
<tr><td>Draw surfaces</td><td>Click three or four nodes around a face. The fourth closes the surface; ${K('Enter')} closes a triangle; ${K('Esc')} cancels.</td></tr></table>
<p>While a drawing tool is active the view keeps its scale; ${K('Esc')} returns to Select, which fits the view to the model again. ${K('Delete')} removes the selected node together with its lines and surfaces.</p>
${TIP('Choose a standard view (Top, Front …) before adding points: the working plane faces the view, so the new points land where you expect them.')}
${SEE('geomodel', 'geoview')}`),
      T('geofile', 'Saving and opening a geometry', ['osgeo', 'save geometry', 'open geometry', 'UFF', 'UNV', 'universal file', 'sensor layout', 'import geometry'], `
<p><b>Save…</b> (in the view's toolbar, or the window menu) writes the model to a file:</p>
<ul><li><b>OpenSig geometry (.osgeo)</b> – the nodes with their names, lines, surfaces and the cylinder axis. Tick "Include the sensor layout" to store, for every channel, its window name, node, direction, setup and whether it is a reference. When you open the file again, open signal windows with the same names are connected to their nodes automatically – handy when the same structure is measured again.</li>
<li><b>Universal file (.unv)</b> – nodes, lines and surfaces for other modal analysis programs.</li></ul>
<p><b>Open…</b> reads .osgeo files and universal files (.uff, .unv: nodes from datasets 15 and 2411, trace lines from 82 and elements from 2412 – beams become lines, triangles and quadrilaterals surfaces). If the window already has a model, choose whether the file replaces it or is added to it. An .osgeo file opened with ${P('File', 'Open signal…')} or dropped on OpenSig opens in a new Geometry window.</p>
${SEE('geomodel', 'geodofs', 'workspaces')}`),
      T('geodofs', 'Channels (DOFs)', ['DOF', 'DOFs', 'channels', 'sensor', 'direction', 'radial', 'tangential', 'axial', 'cylinder axis', 'reference channel', 'Ref', 'auto assign'], `
<p>In the <b>DOFs</b> tab, assign each measured signal window to a node and a direction – one row per sensor axis.</p>
<p>The signal windows become the parents of the Geometry node, so zooming or playing them updates it.</p>
<ul><li><b>Directions</b>: ±X, ±Y, ±Z, or – for sensors on pipes, towers, tanks and rotors – <b>±R</b> (radial, away from the cylinder axis), <b>±T</b> (tangential, turning around it, right-handed) and <b>±A</b> (along it). <b>Cylinder axis…</b> sets the axis (parallel to X, Y or Z, through a point); the cylinder, cone and circle generators set it for you.</li>
<li><b>Ref</b> marks reference channels. The ODS uses a reference channel as phase 0, and the reference sensors get a ring in the view.</li>
<li><b>Setup</b> says which channels were recorded together. Leave it at 1 when all sensors were measured at once; see ${L('georoving')} for tests in several setups.</li>
<li><b>Auto assign…</b> gives the channels to the nodes one after the other: each node gets the next channel for every direction you choose (for example +X +Y +Z for triaxial sensors). Choose the channels (only those not assigned yet, or all), the node order, the node to start at, nodes to skip (supports, for example) and the windows of the reference sensors. The dialog shows a preview of the assignment.</li></ul>
<p>Arrows in the view show the measured directions: X red, Y green, Z blue, radial orange, tangential purple and axial teal.</p>
${SEE('geomodel', 'geoanim', 'georoving')}`),
      T('geoview', 'Rotating and zooming the model', ['rotate', 'pan', 'zoom model', 'standard views', 'Iso', 'Top', 'Bottom', 'Front', 'Back', 'Left', 'Right', 'editor width', 'show options'], `
<p>Drag in the view to rotate, ${K('Shift')}+drag or the middle button to pan, turn the wheel to zoom and double-click to fit.</p>
<ul><li>Seven standard views: <b>Iso</b>, <b>Top</b> and <b>Bottom</b> (looking along Z), <b>Front</b> and <b>Back</b> (along Y) and <b>Left</b> and <b>Right</b> (along X).</li>
<li><b>Show ▾</b>: node numbers, undeformed model, surfaces, DOF arrows, colour legend, and "Move unmeasured nodes with their neighbours", which lets nodes without sensors follow the mean motion of the nodes they are connected to.</li>
<li>Drag the border between the view and the editor to make the editor wider or narrower; the width is kept with the window. <b>Editor ▸</b> hides the editor for a larger view, <b>Editor ◂</b> brings it back.</li></ul>
${SEE('geodraw', 'geoanim')}`),
      T('geoanim', 'Animation: ODS and mode shapes', ['animation', 'animate', 'ODS', 'operating deflection shape', 'FDD', 'frequency domain decomposition', 'singular values', 'mode shape', 'time animation', 'slow motion', 'dwell', 'sweep', '0° / 180°', 'colour legend', 'scale', 'speed', 'record', 'video', 'WebM', 'MP4'], `
<p>The first box above the view, next to <b>▶ Run</b>, chooses what moves the model:</p>
<ul><li><b>Time (slow motion)</b> – the measured motion (1/1000 to real time) over the visible part of the signals.</li>
<li><b>ODS at a frequency</b> – the operating deflection shape: the amplitude and phase of every channel at that frequency, relative to the reference channel (cross-spectrum ÷ √auto-spectrum of the reference).</li>
<li><b>Mode shape (FDD)</b> – Frequency Domain Decomposition: the cross-spectral matrix of all channels is decomposed at every frequency; at a resonance one singular value dominates and its singular vector is the mode shape. The <b>FDD</b> tab plots the first three singular values; click a peak, or one of the frequency buttons, to animate its mode.</li></ul>
<h2>The FDD plot</h2>
<p>Drag over a frequency range to show only that range, turn the mouse wheel to zoom in or out around the pointer, ${K('Shift')}+drag to move the range, and double-click (or <b>Whole range</b>) to see all frequencies again. The level axis follows the range shown, the frequency and level under the pointer are shown in the corner, and the peak buttons list the peaks inside the range – zoom into a band to find modes close together. Clicking picks the highest point within a few pixels, so a zoomed plot picks more precisely.</p>
<h2>Playing the animation</h2>
<p>For ODS and mode shapes, the display box chooses <b>Dwell</b> (animate at the frequency), <b>0° / 180°</b> (the two extremes, still: solid and orange) or <b>Sweep</b> (the frequency runs through a range you give). While paused, ◀ and ▶| step the phase by 15° (in Time mode, by a short piece of the signal).</p>
<p>The deformed model is coloured by its motion over the dashed undeformed model; the <b>colour legend</b> on the right gives the scale (0 = still, 100 % = the largest motion). <b>Scale</b> sets the size of the motion and <b>Speed</b> the animation. <b>● Rec</b> records the animation as a video file (WebM or MP4): whole cycles of at least 4 s, one pass of a sweep, or 6 s in Time mode.</p>
${SEE('geodofs', 'geomodes', 'geoview', 'peaks')}`),
      T('geomodes', 'Modes: frequency and damping', ['damping', 'damping ratio', 'EFDD', 'enhanced frequency domain decomposition', 'natural frequency', 'modes', 'mode table', 'MAC', 'MAC matrix', 'correlation function', 'identify modes', 'Excel', 'xlsx', 'copy modes'], `
<p>The <b>Modes</b> tab turns the peaks of the FDD tab into a table of modes with their natural frequency and <b>damping ratio</b>, estimated by <b>Enhanced FDD</b> (EFDD):</p>
<ol><li>Around each peak, the frequencies whose first singular vector still looks like the peak's mode shape (MAC at least the <i>MAC level</i>, 0.8) form the mode's "bell".</li>
<li>The inverse Fourier transform of that bell is the mode's correlation function – it looks like a free decay.</li>
<li>The decay of its extremes gives the damping, its zero crossings the frequency. The correlation is first corrected for the Hann window of the spectra, which otherwise makes the damping look too high.</li></ol>
<h2>Working with the table</h2>
<ul><li><b>Identify modes</b> uses the peaks in the frequency range shown in the FDD tab (zoom the plot first to choose a band); <b>+ Current</b> adds the frequency being animated. <b>▶ Run</b> identifies the modes too and shows the damping on its mode buttons.</li>
<li>The table shows each mode's frequency, damping, the FDD peak and the quality of the decay fit (R²; point at it for the number of extremes and the bell's range). Click a row to animate the mode and to see its correlation function with the fitted decay below; × removes a mode.</li>
<li>The <b>MAC matrix</b> compares the mode shapes: 1 on the diagonal, small values elsewhere. A high value away from the diagonal (red) means two modes look alike – too few sensors to tell them apart, or one mode found twice.</li>
<li><b>Settings…</b>: the averaged segments (fewer give a finer frequency resolution – better for light damping – but noisier curves), the MAC level, the correlation range used for the fit (default 0.9 down to 0.2) and the window correction.</li>
<li><b>Copy</b> puts the table on the clipboard for Excel or Word; <b>Excel…</b> saves a workbook with the sheets Modes, MAC, Mode shapes (per channel, node and direction) and Info (record, settings, method) – and Setups for a test in several setups.</li></ul>
${NOTE('Damping from ambient data scatters: with a few minutes of record, expect about ±0.2–0.5 percentage points. Longer records (10–20 minutes or more, at least a few hundred periods of the lowest mode) give steadier values. The mode table is saved with the workspace.')}
${SEE('geoanim', 'georun', 'georoving')}`),
      T('georun', 'Running the finished model', ['run', '▶ Run', 'run model', 'edit model', 'mode buttons', 'finished model'], `
<p>When the geometry and the channels are ready, press <b>▶ Run</b> (top left).</p>
<p>OpenSig checks the model – it needs nodes and at least one open channel assigned to a node, and warns about channels without a node or with a closed window. Then it finds the modes in the singular values of the spectral matrix, estimates their frequency and damping (${L('geomodes')}) and animates the first one in a view as large as the window, without the editor.</p>
<ul><li>Each mode gets a button with its frequency and damping (<b>1: 3.17 Hz · 1.34 %</b> …); click one to animate it. The line under the view shows "Mode 2 of 4 · damping 1.74 %".</li>
<li>If you chose ODS or Time before, Run keeps that animation.</li>
<li><b>✎ Edit model</b> brings the editor back. Run and Edit model are also in the window menu.</li></ul>
${SEE('geomodes', 'geoanim')}`)
    ]),

    B('roving', 'Roving Tests', '<p>A roving test measures a structure at more points than you have sensors: the sensors are moved in several <b>setups</b>, while a few <b>reference sensors</b> stay in place. OpenSig puts the setups together into full mode shapes. This book explains the method, how to plan and enter the setups, what OpenSig computes, and how to judge the result.</p>', [
      T('georoving', 'What a roving test is', ['roving', 'roving test', 'rover', 'rover mode', 'setup', 'setups', 'multi-setup', 'reference sensors', 'roving sensors', 'combine setups', 'merge mode shapes'], `
<p>An ambient vibration test needs one sensor per measured direction at every point – often more sensors than you have. A <b>roving test</b> measures the points in turn:</p>
<ul><li>Each <b>setup</b> is one recording, with all sensors running at the same time.</li>
<li><b>Reference sensors</b> stay at the same points, in the same directions, in every setup.</li>
<li><b>Roving sensors</b> move to new points after each setup until every point is measured.</li></ul>
<p>For example, with six sensors on a bridge deck measured at ten points (both edges at 5, 10, 15, 20 and 25 m), two references at 10 m and four rovers cover the deck in two setups:</p>
<table class="hv-table"><tr><th></th><th>5 m</th><th>10 m</th><th>15 m</th><th>20 m</th><th>25 m</th></tr>
<tr><td>Setup 1</td><td>rover</td><td><b>reference</b></td><td>rover</td><td>–</td><td>–</td></tr>
<tr><td>Setup 2</td><td>–</td><td><b>reference</b></td><td>–</td><td>rover</td><td>rover</td></tr></table>
<h2>Why references are needed</h2>
<p>The setups are recorded at different times, with different wind, traffic or other excitation. Each setup therefore gives the right <i>shape</i> over its own points, but with its own unknown size and sign. The references measure the same points in every setup, so they show how much each setup's shape must be scaled and turned to fit the others. OpenSig does this for every mode and joins the pieces into one shape over all points.</p>
<h2>What it assumes</h2>
<ul><li>The structure does not change between setups (no change of mass, supports or – as far as possible – temperature).</li>
<li>Every mode you want is excited in every setup, and the references move clearly in it.</li>
<li>All channels have one common sample rate. The setups may differ in length.</li></ul>
<h2>Words used in this book</h2>
<table class="hv-table"><tr><th>Word</th><th>Meaning in OpenSig</th></tr>
<tr><td>Setup</td><td>The channels recorded together: the <b>Setup</b> number in the ${L('geodofs', 'DOFs')} tab</td></tr>
<tr><td>DOF</td><td>A node and a direction, such as node 13, +Z</td></tr>
<tr><td>Shared DOF</td><td>A node and direction measured in more than one setup – usually by a reference sensor. Setups are joined only through shared DOFs.</td></tr>
<tr><td>Reference (Ref)</td><td>A channel ticked in the <b>Ref</b> column. Auto assign puts later setups' references on its node and direction, and the ODS uses it as phase 0.</td></tr>
<tr><td>Combined shape</td><td>The mode shape over all setups, after scaling them onto each other</td></tr></table>
${NOTE('What joins two setups is a node and direction they both measure – not the Ref tick. A reference sensor must therefore keep exactly the same node number and direction in every setup.')}
${SEE('rovplan', 'rovassign', 'rovexample')}`),
      T('rovplan', 'Planning the setups', ['plan', 'number of setups', 'reference position', 'node line', 'record length', 'roving plan'], `
<h2>How many setups</h2>
<p>Count measured directions, not sensors. With <i>D</i> DOFs to measure, <i>N</i> sensor channels and <i>R</i> of them as references, each setup measures <i>N</i> − <i>R</i> new DOFs:</p>
<p style="text-align:center">setups = ( <i>D</i> − <i>R</i> ) ÷ ( <i>N</i> − <i>R</i> ), rounded up</p>
<p>For example, 30 DOFs with 8 channels, 2 of them references: 28 ÷ 6 = 4.7, so 5 setups. The last setup may have fewer rovers; the setups do not need the same number of channels.</p>
<h2>Where to put the references</h2>
<ul><li><b>Where every mode moves.</b> A reference on a node line of a mode sees almost nothing of it, so that mode cannot be scaled: not at midspan for the 2nd bending mode, not on the centre line of a deck for torsion, not near a support.</li>
<li><b>More than one.</b> With one shared DOF the setups can be scaled, but nothing checks them. With two or more, OpenSig also measures how well the setups agree (MAC) and warns when they do not.</li>
<li><b>In the directions you need.</b> If you measure lateral and vertical modes, use at least one lateral and one vertical reference. On a deck, one reference on each edge sees both bending and torsion.</li>
<li><b>Untouched.</b> Leave the reference sensors mounted, in the same orientation and with the same settings, for the whole test.</li></ul>
<h2>Each setup</h2>
<ul><li>Record every setup with the same sample rate. OpenSig needs one common rate for all channels.</li>
<li>Make each record long enough for the lowest mode: a common rule of thumb is at least 1000 periods (about 17 minutes for a 1 Hz mode). Longer records give smoother spectra and better damping estimates.</li>
<li>Note which channel was where in each setup. A small table like the one in ${L('georoving')} saves time later.</li></ul>
${SEE('rovassign', 'georoving')}`),
      T('rovassign', 'Entering the setups (DOFs tab)', ['enter setups', 'Setup column', 'auto assign setups', 'reference channels', 'skip nodes measured in other setups', 'roving assign'], `
<p>Make the model first (${L('geomodel')}), then open the signals of every setup – one window per channel. All of them go into the same Geometry node. In the ${L('geodofs', 'DOFs')} tab each channel gets a node, a direction, a <b>Ref</b> tick and a <b>Setup</b> number.</p>
<h2>The quick way: Auto assign once per setup</h2>
<ol><li>Open the files of <b>setup 1</b>, then <b>Auto assign…</b> with <i>Channels: signals not assigned yet</i> and <i>Setup 1</i>. Type the window numbers of the reference sensors under <i>Reference channels</i> (for example W1 W2) so they get the Ref tick. Check that the references are on the nodes you planned; change a <b>Node</b> cell if not.</li>
<li>Open the files of <b>setup 2</b> and choose <b>Auto assign…</b> again. The <i>Setup</i> number is already 2.
<ul><li>Under <i>Reference channels</i>, give this setup's reference windows. They take the nodes and directions of the earlier references in table order: the lowest window number takes the first reference row of the table, and so on.</li>
<li>Leave <i>Skip nodes measured in other setups</i> on: the roving channels then go to the next nodes not measured yet.</li>
<li>The preview in the dialog shows every channel's node and direction before you press <b>Assign</b>.</li></ul></li>
<li>Repeat for each further setup.</li></ol>
<h2>By hand</h2>
<p>You can also fill the table yourself: <b>Node</b>, <b>Dir.</b> and <b>Ref</b> as usual, and the <b>Setup</b> list (1, 2, … one more than the highest so far) for each channel. Channels with the same number must come from the same recording.</p>
<h2>What the table tells you</h2>
<ul><li>Under the table: <i>Roving test with 2 setups: setup 1: 6 channels · setup 2: 6 channels. Measured in every setup: 3 +Z, 13 +Z</i> – the shared DOFs that tie the setups together.</li>
<li><b>⚠ Setup 3 shares no node and direction with the other setups</b> – that setup cannot be combined. Usually a reference got another node or direction in it.</li>
<li>A setup that shares DOFs with only some setups is still combined, as long as it is connected to the others through a chain of shared DOFs.</li></ul>
${SEE('rovcombine', 'geodofs')}`),
      T('rovcombine', 'How OpenSig combines the setups', ['combine', 'merge shapes', 'scale factor', 'least squares', 'average singular values', 'FDD several setups', 'shared DOF'], `
<p>Everything below happens by itself as soon as the table has more than one setup.</p>
<h2>1. Spectra per setup</h2>
<p>Channels of different setups were not recorded together, so they are never correlated with each other. Each setup gets its own cross-spectral matrix, made the same way as for a single setup (<b>Averaged segments</b> in the FDD tab applies to all of them).</p>
<h2>2. One curve to find the peaks on</h2>
<p>The <b>FDD</b> plot shows each setup's first singular value as a thin line. Each is divided by its own mean level, so a setup with stronger excitation does not dominate, and they are placed on the frequency grid of the first setup (setups of different length have different frequency steps). The thick line is their average. The mode buttons of ▶ Run, the peak list and <b>Identify modes</b> all use this average.</p>
<h2>3. Each setup's shape</h2>
<p>For a chosen frequency, each setup's shape is read at the top of its own first singular value within one frequency step, because a mode can sit slightly higher or lower in one setup (temperature, traffic). The FDD shape is the first singular vector. The ODS is taken relative to the same reference DOF in every setup – or, in a setup without it, its first reference channel.</p>
<h2>4. Scaling the setups onto each other</h2>
<ul><li>The setup with the lowest number is the base; its shape is kept as it is.</li>
<li>Every other setup that shares DOFs with the shape built so far gets one complex factor <i>a</i> – a size and a phase. <i>a</i> is the least-squares fit of its shared values <i>x</i> to the values <i>g</i> already there: <i>a</i> = Σ conj(<i>x</i>) · <i>g</i> ÷ Σ |<i>x</i>|², summed over the shared DOFs.</li>
<li>The setup's values, multiplied by <i>a</i>, are added. A DOF measured in several setups gets the average of their values.</li>
<li>This repeats until no further setup can be attached, so a setup may attach through any setup already combined, not only through the base. A setup that shares nothing is left out, with a warning.</li>
<li>Last, the combined shape is normalised: its largest component becomes 1, with phase 0.</li></ul>
<h2>5. The agreement check</h2>
<p>For each setup with at least two shared DOFs, OpenSig compares its scaled shared values with the combined ones by the MAC (modal assurance criterion): 1 means the same shape, 0 nothing in common. With only one shared DOF a setup can still be scaled, but there is nothing to compare, so no MAC is shown.</p>
${SEE('rovresults', 'geoanim')}`),
      T('rovresults', 'Results and checks', ['roving results', 'damping spread', 'frequency spread', 'MAC setups', 'agreement', 'Setups sheet', 'per setup', 'time animation setup'], `
<h2>Modes tab</h2>
<p><b>Identify modes</b> runs the damping estimate (Enhanced FDD) in every setup separately, for each peak of the averaged curve, and then combines them:</p>
<table class="hv-table"><tr><th>Column</th><th>With several setups</th></tr>
<tr><td>f (Hz)</td><td>The mean of the setups' natural frequencies</td></tr>
<tr><td>Damping (%)</td><td>The mean of the setups, ± their spread (standard deviation). Point at the value to see each setup's frequency and damping.</td></tr>
<tr><td>FDD peak</td><td>The mean of the setups' peaks</td></tr>
<tr><td>Fit R²</td><td>The worst fit of the setups</td></tr></table>
<p>Below the table, OpenSig gives the worst agreement (MAC) of the shared DOFs over all modes and setups.</p>
<h2>Judging the result</h2>
<ul><li><b>MAC 0.95 or more</b>: the setups fit well. <b>Below 0.9</b> OpenSig warns. Common causes: a reference with a different node or direction in one setup, a reference near a node line of that mode, or a mode that is weak in one setup.</li>
<li><b>Frequency spread</b>: the same mode differs little between setups – often a few tenths of a percent. A large spread means a different mode was picked in one setup, or the structure changed.</li>
<li><b>Damping spread</b>: damping estimates scatter much more than frequencies, even within one setup, so expect a clearly larger spread. Longer records reduce it.</li>
<li><b>⚠ Setup … is left out of the shapes</b>: it shares no DOF with the others; see ${L('rovassign')}.</li></ul>
<h2>Animation</h2>
<ul><li><b>FDD</b> and <b>ODS</b> animate the combined shape over all points.</li>
<li><b>Time</b> plays one setup at a time, because the setups were not recorded together. Choose the setup next to the speed; points of the other setups stay still.</li></ul>
<h2>Excel</h2>
<p>With several setups, the <b>Modes</b> sheet gets the frequency spread, the damping spread and the number of setups. A <b>Setups</b> sheet lists, for every mode and setup: frequency, damping, fit R², the number of shared DOFs and their agreement (MAC) – empty for the base setup, the one with the lowest number – and whether the setup was combined. The <b>Mode shapes</b> sheet holds the combined shapes; channels at the same node and direction show the same value.</p>
${SEE('geomodes', 'rovcombine')}`),
      T('rovexample', 'Example: a bridge deck in 2 setups', ['roving example', 'bridge deck roving', 'example setups'], `
<p>${P('Help', 'Examples', 'Bridge deck: roving test in 2 setups')} simulates the test from ${L('georoving')}. It opens twelve signal windows (setup 1 on the left, setup 2 on the right) and a Geometry node.</p>
<h2>The test</h2>
<ul><li>A deck of 30 × 8 m with stations every 5 m. The south edge has nodes 1–7 and the north edge nodes 11–17.</li>
<li>Six vertical (+Z) sensors and 300 s at 100 Hz per setup.</li>
<li><b>References</b>: 10 m on both edges (nodes 3 and 13). One on each edge, so torsion – where the edges move in opposite directions – is seen as well as bending. And not at 15 m, which is a node line of the 2nd bending mode.</li>
<li><b>Setup 1</b> rovers: 5 and 15 m (nodes 2, 12, 4, 14). <b>Setup 2</b> rovers: 20 and 25 m (nodes 5, 15, 6, 16).</li>
<li>The simulated deck has modes at 3.2 Hz (1st bending), 4.7 Hz (1st torsion), 12.1 Hz (2nd bending) and 15.3 Hz (2nd torsion), with 1.5 % and 1.2 % damping.</li></ul>
<h2>Things to look at</h2>
<ol><li><b>DOFs</b> tab: the Setup column, and the line <i>Measured in every setup: 3 +Z, 13 +Z</i>.</li>
<li><b>FDD</b> tab: two thin curves (one per setup) and their thick average, with peaks near the four frequencies.</li>
<li><b>Modes</b> tab: <b>Identify modes</b>. Each mode shows the mean frequency and damping ± spread; point at the damping for setup 1 and setup 2. Compare them with the values the deck was simulated with.</li>
<li>Animate a torsion mode: the combined shape runs over all ten points, the two edges in opposite directions.</li>
<li><b>Time</b> animation: switch between Setup 1 and Setup 2 next to the speed.</li></ol>
<h2>Try it: why two references</h2>
<p>In the DOFs tab, give the setup-2 reference at node 13 another node that is not measured, such as 7. Now only 3 +Z is shared: the setups are still combined, but the agreement check disappears. Give the other setup-2 reference another node too, and setup 2 shares nothing – OpenSig warns and leaves it out. Set both back (or open the example again) to restore the test.</p>
${SEE('georoving', 'rovresults', 'geometry')}`)
    ]),

    B('meas', 'Instruments', '<p>Instruments measure a single value of their parent window, such as its RMS or dominant frequency, and update with it.</p>', [
      T('instruments', 'Instruments', ['instrument', 'measure', 'gauge', 'statistics', 'alarm', 'critical range'], `
<p>Choose an instrument from the ${P('Instruments')} menu or the instrument buttons on the second toolbar row. It opens as a small window showing one value of the active window's visible part, and recalculates whenever that changes.</p>
${TB('Mean', 'Maximum', 'RMS', 'THD', 'Dominant frequency')}
<ul><li>Many instruments also draw a <b>marker</b> in their parent – for example at the maximum.</li>
<li>${P('Instruments', 'Statistics (show as…)')} shows the current, average, minimum or maximum value over time.</li>
<li>${L('properties', 'Properties')} (${K('Ctrl', 'P')}) set the display (number or gauge), decimals, and a <b>critical range</b> that turns the value red.</li>
<li>${P('Instruments', 'Instrument alarm actions…')} runs actions when a value enters the critical range: play a sound, save the parent's values in a file, or (desktop app) start a program.</li>
<li>${P('Instruments', 'Log instrument values…')} writes the values to a file over time.</li></ul>
${SEE('statinst', 'specinst', 'markers')}`),
      T('statinst', 'Statistical instruments', ['mean', 'median', 'RMS', 'standard deviation', 'variance', 'skewness', 'kurtosis', 'crest factor', 'peak-to-peak', 'quantile', 'entropy', 'fractal dimension'], `
<table class="hv-table"><tr><th>Instrument</th><th>Shows</th></tr>
<tr><td>Mean, Sum, Median, Quantile</td><td>The average, the total, the middle value, a chosen quantile</td></tr>
<tr><td>Standard deviation, Variance</td><td>The spread around the mean</td></tr>
<tr><td>Skewness, Kurtosis</td><td>Asymmetry and peakedness of the distribution; kurtosis rises with impacts</td></tr>
<tr><td>RMS, RMS – normalized</td><td>The effective value</td></tr>
<tr><td>Crest factor</td><td>Peak divided by RMS</td></tr>
<tr><td>Peak-To-Peak, Integral</td><td>Range of the values, area under the curve</td></tr>
<tr><td>Zero-crossing rate</td><td>Zero crossings per second</td></tr>
<tr><td>Peak count, Average peak distance</td><td>From ${L('peaks')}</td></tr>
<tr><td>Fractal dimension, Shannon entropy</td><td>Complexity and information content</td></tr>
<tr><td>Const (level marker)</td><td>A fixed level drawn as a line</td></tr></table>`),
      T('specinst', 'Spectral instruments', ['THD', 'THD+N', 'SNR', 'dB(A)', 'dB(C)', 'dominant frequency', 'fundamental', 'spectral centroid', 'spectral flatness', 'damping', 'harmonics'], `
<table class="hv-table"><tr><th>Instrument</th><th>Shows</th></tr>
<tr><td>Dominant frequency</td><td>The frequency with the highest level</td></tr>
<tr><td>Fundamental frequency</td><td>The base frequency of a harmonic series</td></tr>
<tr><td>Mean / Median frequency</td><td>The level-weighted mean or median of the spectrum</td></tr>
<tr><td>Spectral centroid, Spectral flatness</td><td>The "centre of mass" of the spectrum; how noise-like (1) or tonal (0) it is</td></tr>
<tr><td>THD, THD + Noise</td><td>Total harmonic distortion, with or without noise</td></tr>
<tr><td>Signal-To-Noise Ratio (SNR)</td><td>The level of the main component against the rest</td></tr>
<tr><td>Overall dB (weighted)</td><td>dB(A), dB(C) or dB(Z) level</td></tr>
<tr><td>RMS of a frequency range</td><td>The level in a band you choose</td></tr>
<tr><td>Damping factor</td><td>From the half-power bandwidth of a resonance</td></tr>
<tr><td>Amplitude at max. frequency harmonics</td><td>The level at 2× to 10× the dominant frequency</td></tr>
<tr><td>Sum 3D over frequency range</td><td>A band level over time from a 3D window</td></tr></table>`),
      T('markers', 'Markers', ['marker', 'maximum', 'minimum', 'value at', 'harmonics marker'], `
<ul><li>${P('Instruments', 'Maximum (with marker)')} and ${P('Instruments', 'Minimum (with marker)')} show the extreme value and mark it; the position variants show where it is, also interpolated between samples.</li>
<li>${P('Instruments', 'Value at (with marker)…')} shows the value at a fixed X position.</li>
<li>${P('Instruments', 'Marker with harmonics at…')} marks a frequency and its harmonics.</li></ul>
${SEE('harmonic', 'picker')}`),
      T('picker', 'Value picker', ['pick', 'picker', 'picked values', 'measure points', 'delta', 'Ctrl+Shift+P'], `
<p>The value picker places numbered points on graphs to read and compare exact values. Switch it on with ${P('Instruments', 'Value picker')} (${K('Ctrl', 'Shift', 'P')}) or its toolbar button, then click a graph; ${K('Shift')}+click picks at any time.</p>
<p>${P('Instruments', 'Pick snaps to')} chooses where a point lands: the nearest sample, the highest or lowest value near the mouse, an interpolated position, or exactly where you click. ${P('Instruments', 'Add pick at X…')} places one at a typed position.</p>
<ul><li>Points show "P1 x | y" and follow the data when it changes.</li>
<li>Drag a point to move it, ${K('←')} / ${K('→')} move the selected one by a sample (${K('Shift')}: 10), ${K('Del')} removes it, ${K('Esc')} deselects.</li>
<li>${P('Instruments', 'Picked values table…')} lists X, Y and the differences ΔX, ΔY and 1/ΔX to the previous point – handy for periods and frequencies – and copies them or saves CSV.</li>
<li>In the ${L('control')}, each window's points are one "Picked values" node.</li></ul>
<p>Points are saved with the workspace.</p>`)
    ]),

    B('acq', 'Data Acquisition', '<p>Recording live signals.</p>', [
      T('acquisition', 'Sound card acquisition', ['acquisition', 'record', 'microphone', 'live', 'trigger', 'sound card', 'Ctrl+Q'], `
<p>${P('Data acquisition', 'Open data acquisition…')} (${K('Ctrl', 'Q')}) records from a sound card input, mono or stereo, at a chosen sampling rate. The acquisition window behaves like any source: analyses linked to it update live.</p>
<ul><li><b>Continuous</b> – a scrolling window of the latest data.</li>
<li><b>Last block</b> – the latest block of a fixed length.</li>
<li><b>Timed</b> – records for a set time.</li>
<li><b>Triggered</b> – starts when the signal crosses a level with a given slope, with pre-trigger data and optional re-arm.</li></ul>
<p>Start, stop and reset with ${K('Ctrl', 'R')}, ${K('Ctrl', 'K')} and ${P('Data acquisition', 'Reset acquisition window')}.</p>
${NOTE('In a browser, live input needs the page to be served (not opened as a file) and your permission to use the microphone.')}`),
      T('calibration', 'Calibration', ['calibration', 'units', 'sensitivity', 'cal file'], `
<p>${P('Data acquisition', 'Device calibration…')} converts the raw input values into physical units – for example pascals or m/s² – using a sensitivity per channel. Profiles can be saved and loaded as <code>.cal</code> files.</p>`),
      T('logging', 'Logging data', ['logging', 'log file', 'record to disk', 'sig'], `
<p>${P('Data acquisition', 'Log data in file…')} writes the acquired data to files, splitting them at a chosen size; ${P('Data acquisition', 'Start logging')} and ${P('Data acquisition', 'Stop logging')} control it. ${P('File', 'Open data log file…')} reads them back. Logging to folders needs the desktop app.</p>`),
      T('network', 'Network and serial', ['network', 'UDP', 'TCP', 'serial', 'COM port'], `
<p>The desktop app can receive and send signals over the network (UDP/TCP) and through serial ports: ${P('Data acquisition', 'Network receiver…')}, ${P('Data acquisition', 'Network sender…')}, ${P('Data acquisition', 'Serial input…')} and ${P('Data acquisition', 'Serial output…')}.</p>`)
    ]),

    B('custom', 'Custom Tools and Scripts', '<p>Reusing analyses and extending <i>OpenSig</i>.</p>', [
      T('customtools', 'Custom tools', ['custom tool', 'ost', 'reuse', 'template', 'T1', 'toolbar buttons'], `
<p>A custom tool is a saved analysis chain you can apply to any signal in one click.</p>
<ul><li>${P('File', 'Save window as custom tool')} saves the active window only, the window with every analysis below it, or just the analyses below it. Optionally put it in a menu group.</li>
<li>${P('Signal tools', 'Use custom tool')} lists the built-in tools by group and your own tools; "From file…" opens an <code>.ost</code> file or an FFT settings <code>.swt</code> tool.</li>
<li>${P('File', 'Custom tools toolbar editor…')} puts tools on the toolbar buttons T1–T5.</li></ul>
<p>The desktop app keeps tools in <code>Documents\\OpenSig\\Tools</code>; any <code>.ost</code> file put there is listed.</p>
${MENU('Signal tools', 'Use custom tool')}`),
      T('scripts', 'Script windows', ['script', 'JavaScript', 'process', 'console', 'programming'], `
<p>The ${P('Scripts')} menu creates windows whose result is calculated by your own JavaScript. There are five kinds: a signal, a custom display, a signal source, an instrument and an instrument source.</p>
<p>A script defines <code>process(input_windows, output)</code>: it reads the data of the input windows and fills the output. ${P('Scripts', 'Script parameters…')} declares values you can change without editing the code, and ${P('Scripts', 'JavaScript console')} is for quick experiments.</p>`),
      T('customdisplays', 'Custom displays', ['scatter', 'orbit', 'polar', 'Bode', 'Nyquist', 'box plot', 'violin', 'corner plot', 'correlation plot'], `
<p>${P('Scripts', 'Custom displays')} draws signals in other ways: scatter plots in 2D, 2D with a colour vector or 3D (drag to rotate), orbit, polar, Bode, Bode with Nyquist, box, violin, box plus violin, corner and correlation plots, and a spectrogram contour plot.</p>`)
    ]),

    B('aibook', 'AI Signal Report', '<p>Optional language-model features. They are off until you configure a provider.</p>', [
      T('ai', 'AI signal report', ['AI', 'report', 'LLM', 'Claude', 'metrics', 'privacy', 'API key'], `
<p>${P('AI signal report', 'Generate AI report')} describes a signal in words – a general description, anomaly and fault indicators, a vibration, audio or biomedical assessment, or a one-paragraph summary.</p>
<p>Only computed metrics are sent – statistics, spectral features and peaks – never the raw samples. Configure Anthropic or an OpenAI-compatible endpoint in ${P('AI signal report', 'Settings…')}; API keys are stored only on this computer.</p>
<p>Without a provider you can still ${P('AI signal report', 'Export signal metrics…')} as JSON or ${P('AI signal report', 'Copy analysis prompt to clipboard')} and paste it into any chat assistant.</p>`),
      T('speech', 'Speech-to-text', ['speech', 'transcription', 'audio to text'], `
<p>${P('Signal tools', 'Speech-to-text (visible part)…')} transcribes the visible part of an audio signal through an OpenAI-compatible transcription endpoint configured in the AI settings. This sends the audio of the visible part to that service.</p>`)
    ]),

    B('settingsbook', 'Settings', '', [
      T('settings', 'Application settings', ['settings', 'preferences', 'options', 'number format', 'auto-save', 'playback device', 'F12'], `
<p>${P('File', 'Application settings…')} (${K('Ctrl', ',')}; ${K('F12')} in the desktop app) sets the style and dark mode, default display options, the number format for exports and the clipboard, auto-saving and restoring the workspace, and the playback device. ${P('File', 'Application settings – advanced…')} holds the rarely changed options.</p>
<p>${P('Signal tools', 'Spectral analysis defaults…')} sets the parameters used by ${K('Ctrl', 'F')} and the other quick FFT commands.</p>`)
    ])
  ];

  // F1 in a window opens the topic of the tool that made it
  const context = { fft: 'fft', spectrogram: 'spectrogram', fftfilter: 'fftfilter', iirfilter: 'iirfilter', movavg: 'conditioning', detrend: 'conditioning',
    removedc: 'conditioning', removepeaks: 'conditioning', scale: 'conditioning', resample: 'resample', integral: 'integral', differentiate: 'integral',
    sorted: 'integral', autocorr: 'autocorr', envelope: 'envelope', instfreq: 'envelope', envmax: 'envelope', histogram: 'histogram', peakhold: 'hold',
    averager: 'averager', octave: 'octave', filterbank: 'octave', srs: 'srs', overtime: 'overtime', calc: 'calculator', instrument: 'instruments',
    cepstrum: 'zerocross', zerocross: 'zerocross', wavedenoise: 'wavelet', tacho: 'tacho', cwt: 'cwt', align: 'align', report: 'ai', chart: 'customdisplays',
    script: 'scripts', scriptsource: 'scripts', scriptinst: 'scripts', scriptinstsource: 'scripts', scriptdisplay: 'customdisplays', tfftstats: 'timefft',
    track3d: 'cursor3d', filter3d: 'cursor3d', slice: 'cursor3d', sum3d: 'specinst', extract: 'zoom', peaks: 'peaks', edit: 'editnode', geometry: 'geometry' };

  // the keyboard table of the "Keyboard and mouse" topic
  const keys = [['F1', 'Help for the active window'], ['Ctrl+O / Ctrl+S', 'Open / save signal'], ['Ctrl+I / Ctrl+L', 'Save / load workspace (desktop: Ctrl+W loads)'], ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous workspace tab (desktop app)'],
    ['Ctrl+F', 'FFT with the default settings'], ['Ctrl+G / Ctrl+T', 'Spectrogram / Time FFT'], ['Ctrl+Y', 'FFT filter'], ['Ctrl+E', 'Open the visible part in a new window'],
    ['Ctrl+A / Ctrl+P', 'Axes settings / Properties'], ['Ctrl+B', 'Copy data as CSV'], ['Ctrl+2', 'Zoom to N samples'], ['Ctrl+D', 'Reset the zoom of all windows'],
    ['+ / −', 'Zoom in / out'], ['Home / End / ← →', 'Navigate'], ['Alt+↑ / Alt+↓', 'Change the play step'],
    ['F5 / F6 / F7', 'Play (no sound) / play with sound from the cursor / stop'], ['Alt+F6 / Ctrl+Alt+F6', 'Play with sound / the visible segment only'],
    ['Ctrl+Q / Ctrl+R / Ctrl+K', 'Open / start / stop acquisition'], ['F2 / F3 / Tab', 'Mesh view / spectrogram view / 3D cursor'],
    ['Enter / Shift+Enter / Esc', 'Pin the harmonic or sideband cursor / pin it on the nearest peak / release it'],
    ['Ctrl+Shift+P', 'Value picker'], ['Ctrl+Shift+G', 'Graph style'], ['Ctrl+Shift+D', 'Dark mode'],
    ['Alt+L / Alt+U / Alt+W', 'Link / unlink / Control Window'], ['Ctrl+,', 'Application settings (desktop: F12)']];

  root.HELPDATA = { home: 'welcome', keysTopic: 'keys', books, context, keys };
})(window);
